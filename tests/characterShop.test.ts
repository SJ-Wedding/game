import { describe, expect, it } from 'vitest';
import { CHARACTER_SHOP_COSTS, CHARACTER_SHOP_ITEMS } from '../src/config/characterShop';
import type { Loadout } from '../src/config/characters';
import { makeSim } from './helpers';
import type { GameSim } from '../src/core/sim';
import { IDLE_INPUT } from '../src/core/types';
import { defaultSave, parseSave, purchaseMeta } from '../src/storage/save';

const chain: Loadout = { character: 'lumen', weapon: 'chain' };
const turret: Loadout = { character: 'lumen', weapon: 'turret' };
const roan: Loadout = { character: 'roan' };

function target(sim: GameSim, distance: number) {
  const enemy = sim.spawnEnemy('chaser', sim.player.x + distance, sim.player.y);
  enemy.hp = enemy.maxHp = 10_000;
  enemy.speed = 0;
  return enemy;
}

describe('캐릭터 전용 상점', () => {
  it('기존 5단계 강화를 같은 토큰으로 구매하고 공용 구매와 함께 저장한다', () => {
    let save = defaultSave();
    save.meta = { ...save.meta, tokens: 500, purchases: { hp: 2 } };
    expect(CHARACTER_SHOP_ITEMS).toHaveLength(20);
    for (const character of ['ranger', 'lumen', 'roan']) {
      expect(CHARACTER_SHOP_ITEMS.filter((entry) => entry.character === character && entry.maxLevel === 5)).toHaveLength(6);
    }
    for (const [i, cost] of CHARACTER_SHOP_COSTS.entries()) {
      expect(purchaseMeta({ ...save, meta: { ...save.meta, tokens: cost - 1 } }, 'rangerAim')).toBeNull();
      const previous = save.meta.tokens;
      save = purchaseMeta(save, 'rangerAim')!;
      expect(save.meta.tokens).toBe(previous - cost);
      expect(save.meta.purchases.rangerAim).toBe(i + 1);
    }
    expect(purchaseMeta(save, 'rangerAim')).toBeNull();
    expect(parseSave(JSON.stringify(save)).data.meta).toEqual({ tokens: 100, totalEarned: 0, purchases: { hp: 2, rangerAim: 5 } });
    expect(parseSave(JSON.stringify({ ...save, meta: { ...save.meta, purchases: { hp: 2 } } })).data.meta.purchases).toEqual({ hp: 2 });
  });

  it('관통 영구 강화는 각 100토큰으로 한 번만 구매할 수 있고 새로고침 후에도 유지된다', () => {
    const save = defaultSave();
    save.meta.tokens = 99;
    expect(purchaseMeta(save, 'rangerExtraPierce')).toBeNull();
    expect(purchaseMeta(save, 'lumenTurretPierce')).toBeNull();
    save.meta.tokens = 250;
    const ranger = purchaseMeta(save, 'rangerExtraPierce')!;
    expect(ranger.meta.tokens).toBe(150);
    const both = purchaseMeta(ranger, 'lumenTurretPierce')!;
    const restored = parseSave(JSON.stringify(both)).data;
    expect(restored.meta).toEqual({ tokens: 50, totalEarned: 0, purchases: { rangerExtraPierce: 1, lumenTurretPierce: 1 } });
    expect(purchaseMeta(restored, 'rangerExtraPierce')).toBeNull();
    expect(purchaseMeta(restored, 'lumenTurretPierce')).toBeNull();
  });

  it('균열 사수 관통 탄두는 첫 레벨부터 적용되고 레벨 관통과 유물에 더해진다', () => {
    const meta = { rangerExtraPierce: 1 };
    for (const [sim, hits] of [
      [makeSim(), 1],
      [makeSim({ meta }), 2],
      [makeSim({ meta, presetLevel: 6, carryRelics: ['awl'] }), 4],
    ] as const) {
      const enemies = [50, 90, 130, 170, 210].map((distance) => target(sim, distance));
      for (let i = 0; i < 22; i++) sim.step(IDLE_INPUT);
      expect(enemies.map((enemy) => enemy.hp < enemy.maxHp)).toEqual(enemies.map((_, i) => i < hits));
    }
  });

  it('루멘 서리 관통탄은 포탑 일반 사격에만 적용되고 철갑 노즐과 중첩된다', () => {
    const meta = { lumenTurretPierce: 1 };
    expect(makeSim({ loadout: chain, meta }).characterShopBonus('lumenTurretPierce')).toBe(0);
    expect(makeSim({ presetUpgrades: { turret: 1 }, meta }).characterShopBonus('lumenTurretPierce')).toBe(0);
    for (const [sim, hits] of [
      [makeSim({ loadout: turret }), 1],
      [makeSim({ loadout: turret, meta }), 2],
      [makeSim({ loadout: turret, meta, presetUpgrades: { turretPierce: 1 } }), 3],
    ] as const) {
      const enemies = [70, 100, 130, 160].map((distance) => target(sim, distance));
      sim.weapons.update(1 / 60);
      expect(enemies.map((enemy) => enemy.hp < enemy.maxHp)).toEqual(enemies.map((_, i) => i < hits));
    }
  });

  it('선택한 캐릭터와 루멘의 시작 무기에 해당하는 효과만 적용한다', () => {
    const meta = { rangerAim: 5, lumenCycle: 5, lumenChainRange: 5, lumenTurretRange: 5, roanReach: 5 };
    expect(makeSim({ meta }).meta.character).toEqual({ rangerAim: 0.15 });
    expect(makeSim({ meta, loadout: chain }).meta.character).toEqual({ lumenCycle: -0.1, lumenChainRange: 0.2 });
    expect(makeSim({ meta, loadout: turret }).meta.character).toEqual({ lumenCycle: -0.1, lumenTurretRange: 0.2 });
    expect(makeSim({ meta, loadout: roan }).meta.character).toEqual({ roanReach: 0.1 });
  });

  it('균열 사수 정밀 조준이 기본탄 조준과 사거리를 늘리고 관통 피해는 두 번째 적부터 늘린다', () => {
    const aim = makeSim({ god: true, meta: { rangerAim: 5 } });
    const distant = target(aim, 600);
    aim.step(IDLE_INPUT);
    expect(aim.target).toBe(distant);
    expect(aim.basicProjectileRange).toBeCloseTo(580 * 1.15);
    const pierce = makeSim({ god: true, presetLevel: 6, meta: { rangerPierce: 5 } });
    const first = target(pierce, 50);
    const second = target(pierce, 100);
    for (let i = 0; i < 18; i++) pierce.step(IDLE_INPUT);
    expect(first.maxHp - first.hp).toBeCloseTo(26);
    expect(second.maxHp - second.hp).toBeCloseTo(26 * 1.2);
  });

  it.each([[5, 9 * 1.85], [6, 15 * 1.85 * 1.1]])('균열 사수 무기 조율은 Lv %d에 피해 %f를 준다', (presetLevel, damage) => {
    const sim = makeSim({ god: true, presetLevel, presetUpgrades: { chain: 1 }, meta: { rangerTuning: 5 } });
    target(sim, 100);
    sim.weapons.update(1 / 60);
    expect(sim.damageByAttack.chain).toBeCloseTo(damage);
  });

  it('융합 냉각기는 발동 간격을 단축하고 이탈 기동은 회피 이동이 끝난 뒤에 적용된다', () => {
    const sim = makeSim({ god: true, presetUpgrades: { chain: 3, mark: 3 }, meta: { rangerFusion: 5 } });
    target(sim, 110);
    expect(sim.weapons.fuse('storm')).toBe(true);
    sim.weapons.update(1 / 60);
    sim.tick = 75;
    sim.weapons.update(1 / 60);
    expect(sim.hitsByAttack.storm).toBe(1);
    sim.tick = 76;
    sim.weapons.update(1 / 60);
    expect(sim.hitsByAttack.storm).toBe(2);
    const move = makeSim({ god: true, meta: { rangerEscape: 5 } });
    const walk = { ...IDLE_INPUT, moveX: 1 };
    move.step({ ...walk, dodge: true });
    while (move.player.dodgeTime > 0) move.step(walk);
    const after = move.player.x;
    move.step(walk);
    expect(move.player.x - after).toBeCloseTo(move.stats.moveSpeed * 1.2 / 60);
    move.tick += 61;
    const expired = move.player.x;
    move.step(walk);
    expect(move.player.x - expired).toBeCloseTo(move.stats.moveSpeed / 60);
  });

  it('재료 선별은 실제 무기 후보가 있는 Lv12에서 미보유 융합 짝을 넣는다', () => {
    const roll = (seed: number, nextLevel: number, rank: number) => {
      const sim = makeSim({ seed, god: true, presetLevel: nextLevel - 1, presetUpgrades: { chain: 1 }, meta: { rangerParts: rank } });
      sim.gainXp(sim.xpNeeded);
      sim.step(IDLE_INPUT);
      return sim.choices.filter((c) => c.kind === 'upgrade').map((c) => c.def.id);
    };
    const seeds = Array.from({ length: 32 }, (_, i) => i + 1);
    for (const seed of seeds) expect(roll(seed, 11, 5)).toEqual(roll(seed, 11, 0));
    expect(seeds.every((seed) => !roll(seed, 12, 0).includes('mark'))).toBe(true);
    expect(seeds.some((seed) => roll(seed, 12, 5).includes('mark'))).toBe(true);
    expect(seeds.every((seed) => !roll(seed, 13, 5).includes('mark'))).toBe(true);
  });

  it('루멘은 재연쇄 대상 거리와 재적중 피해를 늘리고 포탑은 별도의 사거리와 둔화를 적용한다', () => {
    const sim = makeSim({ loadout: chain, meta: { lumenChainRange: 5, lumenChainRepeat: 5 } });
    const first = target(sim, 100);
    const second = target(sim, 380);
    sim.weapons.update(1 / 60);
    expect(second.hp).toBeLessThan(second.maxHp);
    expect(first.maxHp - first.hp).toBeCloseTo(51 * (1 + 0.76 ** 2 * 0.3 * 1.15));
    const other = makeSim({ loadout: turret, meta: { lumenTurretRange: 5, lumenTurretSlow: 5 } });
    const far = target(other, 390);
    other.weapons.update(1 / 60);
    expect(far.maxHp - far.hp).toBeCloseTo(18.5);
    expect(far.slowUntil).toBeCloseTo(1.4);
  });

  it('루멘 마력 순환은 설치를 앞당기고 마력 장벽은 60초 후 재충전된다', () => {
    const sim = makeSim({ loadout: turret, presetLevel: 6, meta: { lumenWard: 5, lumenCycle: 5 } });
    sim.weapons.update(1 / 60);
    const initialTurret = sim.weapons.devices[0];
    expect(initialTurret).toBeDefined();
    sim.tick = 292;
    sim.weapons.update(1 / 60);
    expect(sim.weapons.devices[0]).not.toBe(initialTurret);
    sim.tick = 0;
    sim.hurtPlayer(10, '시험 공격');
    expect(sim.player.hp).toBe(78);
    sim.player.invuln = 0;
    sim.tick = 3599;
    sim.hurtPlayer(10, '시험 공격');
    expect(sim.player.hp).toBe(68);
    sim.player.invuln = 0;
    sim.tick = 3600;
    sim.hurtPlayer(10, '시험 공격');
    expect(sim.player.hp).toBe(61);
  });

  it('로안 사거리·갑주·공격 간격은 자신의 기본 판정에 적용되고 반격은 첫 적중에서만 발동한다', () => {
    const sim = makeSim({ loadout: roan, presetLevel: 12, roanGear: [], meta: { roanReach: 5, roanArmor: 5, roanTempo: 5, roanCounter: 5 } });
    expect(sim.roan.range).toBeCloseTo(125 * 1.1);
    expect(sim.roan.interval).toBeCloseTo(1.45 / 1.2 * 0.94);
    expect(sim.relics.damageTaken('contact')).toBeCloseTo(0.9);
    expect(sim.relics.damageTaken('shot')).toBe(1);
    const enemy = target(sim, 130);
    sim.roan.update(true, true);
    expect(enemy.maxHp - enemy.hp).toBeCloseTo(45 * 1.15);
    const hp = enemy.hp;
    sim.player.fireCd = 0;
    sim.roan.update(true, false);
    expect(hp - enemy.hp).toBeCloseTo(45);
  });

  it('로안 약점 파악은 Lv24에 열리고 전투 정비는 무기 선택 직후 잃은 체력을 회복한다', () => {
    for (const level of [23, 24]) {
      const sim = makeSim({ loadout: roan, presetLevel: level, startTime: 480, meta: { roanPierce: 5 }, roanGear: [] });
      const enemy = target(sim, 100);
      sim.damageEnemy(enemy, 100, 'sword', 0.3);
      const fraction = 1 - 0.15 * 0.7 * (level === 24 ? 0.9 : 1);
      expect(enemy.maxHp - enemy.hp).toBeCloseTo(100 * fraction / (fraction + 5 * (1 - fraction)));
    }
    const repair = makeSim({ loadout: roan, god: true, presetLevel: 11, meta: { roanRepair: 5 } });
    repair.player.hp = 100;
    repair.gainXp(repair.xpNeeded);
    repair.step(IDLE_INPUT);
    const sword = repair.choices.findIndex((choice) => choice.kind === 'roanGear' && choice.gear.id === 'sword');
    expect(repair.choose(sword)).toBe(true);
    expect(repair.player.hp).toBeCloseTo(110);
  });
});
