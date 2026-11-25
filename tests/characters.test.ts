import { describe, expect, it } from 'vitest';
import { SWORD, type Loadout } from '../src/config/characters';
import { UPGRADE_BY_ID, type UpgradeId } from '../src/config/upgrades';
import { rollRelics } from '../src/core/relics';
import { Rng } from '../src/core/rng';
import { GameSim } from '../src/core/sim';
import { IDLE_INPUT } from '../src/core/types';

const roan: Loadout = { character: 'roan' };
const chain: Loadout = { character: 'lumen', weapon: 'chain' };
const turret: Loadout = { character: 'lumen', weapon: 'turret' };

function makeTarget(sim: GameSim, dx: number, dy = 0) {
  const enemy = sim.spawnEnemy('chaser', sim.player.x + dx, sim.player.y + dy);
  enemy.hp = enemy.maxHp = 1000;
  enemy.speed = 0;
  return enemy;
}

describe('캐릭터와 중첩 강화', () => {
  it.each([chain, turret, roan])('전용 빌드 $character 의 시작과 모든 강화 보상은 서로의 공격을 섞지 않는다', (loadout) => {
    const sim = new GameSim({ seed: 11, god: true, loadout, presetUpgrades: { power: 2, mine: 3, echo: 3 } });
    expect(sim.stacks.power).toBe(0);
    expect(sim.stacks.mine).toBe(0);
    expect(sim.weapons.fuse('bastion')).toBe(false);
    if (loadout.character === 'lumen') expect(sim.stacks[loadout.weapon]).toBe(1);

    const assertChoices = () => {
      const path = loadout.character === 'lumen' ? loadout.weapon : 'roan';
      expect(sim.choices).toHaveLength(3);
      expect(sim.choices.some((c) => c.kind === 'upgrade' && (c.def.mastery || c.def.weapon))).toBe(true);
      for (const c of sim.choices) {
        if (c.kind !== 'upgrade') throw new Error('강화 후보가 필요합니다');
        if (c.def.weapon) expect(c.def.weapon).toBe(path);
        else if (c.def.mastery) expect(c.def.id.startsWith(path === 'roan' ? 'sword' : path)).toBe(true);
        else expect(c.def.category).not.toBe('attack');
      }
    };
    sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    assertChoices();
    expect(sim.reroll()).toBe(true);
    assertChoices();
    sim.choose(0);
    sim.relics.acquire('tripleChoice');
    sim.step(IDLE_INPUT);
    expect(sim.bonusOpen).toBe(true);
    for (let i = 0; i < 3; i++) {
      assertChoices();
      sim.choose(0);
    }
    const elite = sim.spawnEnemy('elite', sim.player.x + 260, sim.player.y);
    sim.damageEnemy(elite, 1e6);
    sim.step(IDLE_INPUT);
    expect(sim.choices.every((c) => c.kind === 'relic')).toBe(true);
    expect(sim.choose(0)).toBe(true);
    expect(sim.armoryOpen).toBe(true);
    assertChoices();
  });

  it('같은 전용 강화는 여러 차례 선택되고 등급별 효과가 함께 누적된다', () => {
    const sim = new GameSim({ seed: 12, god: true, loadout: roan });
    const baseRange = sim.roan.range;
    const id: UpgradeId = 'swordRange';
    sim.grantBonusChoices(4);
    sim.step(IDLE_INPUT);
    for (const grade of ['common', 'common', 'rare', 'legendary'] as const) {
      sim.choices = [{ kind: 'upgrade', def: UPGRADE_BY_ID[id], grade, nextStack: sim.stacks[id] + 1 }];
      expect(sim.choose(0)).toBe(true);
    }
    expect(sim.stacks[id]).toBe(4);
    expect(sim.mastery(id)).toBe(6.5);
    expect(sim.roan.range).toBe(Math.min(SWORD.maxRange, baseRange * (1 + 0.12 * 6.5)));
    expect(sim.picks.map((pick) => pick.grade)).toEqual(['common', 'common', 'rare', 'legendary']);
  });

  it('루멘 번개는 기본탄 없이 연쇄 증설과 후반 분기 중첩을 적용한다', () => {
    const sim = new GameSim({ seed: 13, god: true, loadout: chain, presetLevel: 8, presetUpgrades: { chainLinks: 2, chainFork: 2 } });
    for (let i = 0; i < 6; i++) makeTarget(sim, 50 + i * 30);
    for (const [x, y] of [[110, -70], [110, 70], [170, -80], [170, 80]]) makeTarget(sim, x, y);
    sim.step({ ...IDLE_INPUT, fire: true });
    expect(sim.playerShots).toHaveLength(0);
    expect(sim.shotsFired).toBe(0);
    expect(sim.hitsByAttack.chain).toBe(10); // 정상 연쇄 6회, 분기 회로 2중첩으로 갈래 4개
    expect(sim.damageByAttack.basic).toBeUndefined();
  });

  it('루멘 번개는 첫 대상에게는 짧게 닿고 다음 대상까지 두 배 거리로 튄다', () => {
    const sim = new GameSim({ seed: 13, god: true, loadout: chain });
    const first = makeTarget(sim, 215);
    sim.step(IDLE_INPUT);
    expect(sim.damageByAttack.chain).toBeUndefined();

    first.x = sim.player.x + 200;
    const far = makeTarget(sim, 455);
    sim.step(IDLE_INPUT);
    expect(first.hp).toBeLessThan(1000);
    expect(far.hp).toBeLessThan(1000);
    expect(sim.hitsByAttack.chain).toBe(4);
  });

  it('루멘 번개는 같은 대상에게 돌아올 때 이전 적중 횟수만큼 피해를 줄이고 재연쇄 이펙트를 기록한다', () => {
    const sim = new GameSim({ seed: 13, god: true, loadout: chain, presetUpgrades: { chainLinks: 6 } });
    const first = makeTarget(sim, 90);
    const second = makeTarget(sim, 190);
    sim.step(IDLE_INPUT);
    const base = sim.stats.damage * 1.85 * sim.starterDamageMultiplier;
    const repeatDamage = [1, 0.3, 0.25, 0.2, 0.2];
    const expected = (offset: number) => base * repeatDamage.reduce((sum, factor, i) => sum + factor * Math.max(0.4, 0.76 ** (i * 2 + offset)), 0);
    expect(1000 - first.hp).toBeCloseTo(expected(0));
    expect(1000 - second.hp).toBeCloseTo(expected(1));
    expect(sim.hitsByAttack.chain).toBe(10);
    const effect = sim.weapons.effects.find((fx) => fx.kind === 'chain');
    expect(effect?.variant !== 'resonance' && effect?.reboundCounts).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('루멘 번개는 처음 맞히는 적을 우선하고, 대상 하나만 있으면 한 번 타격한다', () => {
    const sim = new GameSim({ seed: 13, god: true, loadout: chain });
    const ordered = [80, 125, 340, 560].map((x) => makeTarget(sim, x));
    sim.step(IDLE_INPUT);
    expect(ordered.every((enemy) => enemy.hp < 1000)).toBe(true);
    const effect = sim.weapons.effects.find((fx) => fx.kind === 'chain');
    expect(effect?.variant !== 'resonance' && effect?.reboundCounts).toEqual([0, 0, 0, 0, 0]);

    const isolated = new GameSim({ seed: 13, god: true, loadout: chain });
    makeTarget(isolated, 80);
    isolated.step(IDLE_INPUT);
    expect(isolated.hitsByAttack.chain).toBe(1);
  });

  it('루멘 포탑은 거치대가 늘어나고 관통과 빙결이 함께 발동한다', () => {
    const deploy = new GameSim({ seed: 14, god: true, loadout: turret, presetUpgrades: { turretMount: 2 } });
    deploy.step(IDLE_INPUT);
    expect(deploy.weapons.devices.filter((device) => device.kind === 'turret')).toHaveLength(3);
    const sim = new GameSim({ seed: 14, god: true, loadout: turret, presetUpgrades: { turretPierce: 2, turretFrost: 2 } });
    const near = makeTarget(sim, 100);
    const far = makeTarget(sim, 155);
    const splash = makeTarget(sim, 142, 45);
    sim.step(IDLE_INPUT);
    expect(sim.hitsByAttack.turret).toBe(3);
    expect(near.hp).toBeLessThan(1000);
    expect(far.hp).toBeLessThan(1000);
    expect(splash.hp).toBeLessThan(1000);
    expect(splash.slowUntil).toBeGreaterThan(sim.elapsed + 1.5);
    expect(sim.playerShots).toHaveLength(0);
  });

  it('캐릭터와 무기에 맞는 유물만 등장하고 이전 판에서 계승된다', () => {
    const sim = new GameSim({ seed: 16, loadout: chain, carryRelics: ['chargeStance', 'winterLantern', 'crown'] });
    expect([...sim.relics.owned]).toEqual(['crown']);
    const rng = new Rng(16);
    const rewards = Array.from({ length: 20 }, () => rollRelics('elite', rng, new Set(), roan)).flat();
    expect(rewards.some((c) => c.kind === 'relic' && c.id === 'weaponThrow')).toBe(true);
    expect(rewards.some((c) => c.kind === 'relic' && (c.id === 'crown' || c.id === 'winterLantern'))).toBe(false);
  });
});
