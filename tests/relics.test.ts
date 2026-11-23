import { describe, expect, it } from 'vitest';
import { RELICS, validCarry } from '../src/config/relics';
import { IDLE_INPUT } from '../src/core/types';
import { parseSave, defaultSave } from '../src/storage/save';
import { makeSim, runUntil } from './helpers';

describe('유물 보상 및 계승', () => {
  it('누적 경험치로 5·10레벨을 넘겨도 각각 일반 강화와 유물 보상을 하나씩 받는다', () => {
    const sim = makeSim();
    while (sim.level < 10) sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    let upgrades = 0;
    let rewards = 0;
    while (sim.phase === 'levelup') {
      const choice = sim.choices[0];
      if (choice.kind === 'relic') {
        expect(choice.source).toBe('level');
        expect(sim.relics.has(choice.id)).toBe(false);
        rewards++;
      } else upgrades++;
      expect(sim.choose(0)).toBe(true);
    }
    expect(upgrades).toBe(9);
    expect(rewards).toBe(2);
  });

  it('중간 보스 보상은 전투를 멈추고 중복 없는 별도 후보를 보여준다', () => {
    const sim = makeSim({ carryRelics: ['crown'] });
    const elite = sim.spawnEnemy('elite', 900, 900);
    sim.damageEnemy(elite, elite.hp);
    sim.step(IDLE_INPUT);
    expect(sim.phase).toBe('levelup');
    expect(sim.step(IDLE_INPUT)).toBe(false);
    expect(sim.choices).toHaveLength(3);
    expect(sim.reroll()).toBe(false);
    for (const choice of sim.choices) {
      if (choice.kind !== 'relic') throw new Error('중간 보스 유물 후보가 없습니다');
      expect(RELICS[choice.id].source).toBe('elite');
      expect(choice.id).not.toBe('crown');
    }
    sim.choose(0);
    expect(sim.relics.owned.size).toBe(2);
    expect(sim.phase).toBe('combat');
  });

  it('저장된 계승 목록에서 알 수 없는 유물과 중복을 제거하고 세 개까지만 가져온다', () => {
    const ids = ['oath', 'oath', 'unknown', 'flint', 'anchor', 'heart'];
    expect(validCarry(ids)).toEqual(['oath', 'flint', 'anchor']);
    const data = parseSave(JSON.stringify({ ...defaultSave(), relicCarry: ids })).data;
    expect([...makeSim({ carryRelics: data.relicCarry }).relics.owned]).toEqual(['oath', 'flint', 'anchor']);
  });
});

describe('유물 효과', () => {
  it('사냥꾼의 맹세는 보유 중 처치만 계산하고 다음 판에서 초기화된다', () => {
    const sim = makeSim();
    sim.kills = 100;
    sim.relics.acquire('oath');
    const enemy = sim.spawnEnemy('chaser', 900, 900);
    expect(sim.relics.damageMultiplier(enemy, false)).toBe(1);
    sim.kills += 26;
    expect(sim.relics.damageMultiplier(enemy, false)).toBeCloseTo(1.04);
    expect(makeSim({ carryRelics: ['oath'] }).relics.damageMultiplier(enemy, false)).toBe(1);
  });

  it('마지막 성냥은 치명 피해를 한 번 막고 무적과 최대 체력 감소를 적용한다', () => {
    const sim = makeSim({ carryRelics: ['lastMatch'] });
    expect(sim.hurtPlayer(500, 'test')).toBe(true);
    expect(sim.player.hp).toBe(1);
    expect(sim.player.invuln).toBe(2);
    expect(sim.relics.maxHp).toBeCloseTo(sim.stats.maxHp * 0.8);
    runUntil(sim, 2.1);
    expect(sim.hurtPlayer(500, 'test')).toBe(true);
    expect(sim.player.hp).toBe(0);
  });

  it('매설자의 나침반은 기본 지뢰 없이도 회피 끝에 무장된 지뢰를 놓는다', () => {
    const sim = makeSim({ carryRelics: ['compass'] });
    sim.step({ ...IDLE_INPUT, moveX: 1, dodge: true });
    runUntil(sim, 0.45);
    sim.weapons.update(10);
    expect(sim.weapons.devices.some((d) => d.kind === 'mine' && d.armAt === 0)).toBe(true);
    expect(sim.stacks.mine).toBe(0);
    expect(sim.relics.dodgeCooldown).toBe(sim.stats.dodgeCooldown + 0.5);
  });

  it('쌍월 톱니는 세 번째 칼날을 추가하고 회피 시 회전 반경을 넓힌다', () => {
    const sim = makeSim({ carryRelics: ['cog'], presetUpgrades: { orbit: 1 } });
    sim.step(IDLE_INPUT);
    const distance = () => Math.hypot(sim.weapons.blades[0].x - sim.player.x, sim.weapons.blades[0].y - sim.player.y);
    expect(sim.weapons.blades).toHaveLength(3);
    expect(distance()).toBeCloseTo(48);
    sim.step({ ...IDLE_INPUT, moveX: 1, dodge: true });
    expect(distance()).toBeCloseTo(84);
  });
});

describe('유물과 전투의 상호작용', () => {
  it('첫불의 부싯돌이 60초 뒤 사격 피해 보너스를 최대 체력으로 바꾼다', () => {
    const sim = makeSim({ carryRelics: ['flint'] });
    expect(sim.relics.shotDamage()).toBeCloseTo(sim.stats.damage * 1.25);
    sim.tick = 60 * 60;
    sim.relics.update();
    expect(sim.relics.shotDamage()).toBe(sim.stats.damage);
    expect(sim.relics.maxHp).toBe(sim.stats.maxHp + 15);
    expect(sim.player.hp).toBe(sim.relics.maxHp);
  });

  it('수호자의 매듭과 흉터의 인장은 피격 후 다음 타격에 발동한다', () => {
    const sim = makeSim({ carryRelics: ['knot', 'scars'] });
    sim.hurtPlayer(25, 'test');
    expect(sim.player.hp).toBe(sim.stats.maxHp - 25);
    sim.player.invuln = 0;
    sim.hurtPlayer(20, 'test');
    expect(sim.player.hp).toBe(sim.stats.maxHp - 37);
    expect(sim.relics.shotDamage()).toBeCloseTo(sim.stats.damage * 1.3);
    expect(sim.relics.shotDamage()).toBeCloseTo(sim.stats.damage * 1.3);
    expect(sim.relics.shotDamage()).toBe(sim.stats.damage);
  });

  it('마지막 심장은 체력이 낮을 때 회복을 줄이고 무기 재사용을 앞당긴다', () => {
    const sim = makeSim({ carryRelics: ['heart'], presetUpgrades: { mine: 1 } });
    const lowHp = sim.stats.maxHp * 0.2;
    sim.player.hp = lowHp;
    sim.relics.heal(10);
    expect(sim.player.hp).toBe(lowHp + 5);
    runUntil(sim, 2.2);
    expect(sim.weapons.devices.filter((d) => d.kind === 'mine')).toHaveLength(2);
  });

  it('이동 2초를 채우면 방랑자의 버클이 발동하고 멈추면 초기화된다', () => {
    const sim = makeSim({ carryRelics: ['buckle'] });
    expect(sim.relics.moveMultiplier(true)).toBe(1);
    sim.tick += 120;
    expect(sim.relics.moveMultiplier(true)).toBe(1.15);
    sim.relics.moveMultiplier(false);
    expect(sim.relics.moveMultiplier(true)).toBe(1);
  });

  it('결투자의 인장은 단독 대상과 군중 속 기본탄에 다르게 작용한다', () => {
    const sim = makeSim({ carryRelics: ['duel'] });
    const target = sim.spawnEnemy('chaser', sim.player.x + 75, sim.player.y);
    expect(sim.relics.damageMultiplier(target, false)).toBe(1.25);
    for (let i = 0; i < 3; i++) sim.spawnEnemy('chaser', sim.player.x - i * 20, sim.player.y + 60);
    expect(sim.relics.damageMultiplier(target, true)).toBe(0.9);
    expect(sim.relics.damageMultiplier(target, false)).toBe(1);
  });

  it('폭풍의 왕관은 무기가 없을 때 피해를 높이고, 획득 후 번개를 최대 여섯 번 연결한다', () => {
    const sim = makeSim({ carryRelics: ['crown'] });
    const enemies = Array.from({ length: 6 }, (_, i) => sim.spawnEnemy('chaser', sim.player.x + 80 + i * 60, sim.player.y));
    enemies.forEach((e) => { e.hp = e.maxHp = 1000; });
    expect(sim.relics.damageMultiplier(enemies[0], false)).toBe(1.05);
    sim.stacks.chain = 1;
    expect(sim.relics.damageMultiplier(enemies[0], false)).toBe(1);
    sim.step(IDLE_INPUT);
    expect(sim.weapons.effects.some((fx) => fx.kind === 'chain' && fx.points.length === 7)).toBe(true);
    expect(enemies.every((enemy) => enemy.hp < enemy.maxHp)).toBe(true);
  });

  it('별의 닻은 중력 구체를 제자리에 유지한다', () => {
    const sim = makeSim({ carryRelics: ['anchor'], presetUpgrades: { gravity: 1 } });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 100, sim.player.y);
    enemy.hp = enemy.maxHp = 1000;
    const x = sim.player.x;
    runUntil(sim, 0.5);
    expect(sim.weapons.devices.find((d) => d.kind === 'gravity')?.x).toBe(x);
    expect(enemy.x).toBeLessThan(x + 100);
  });

  it('틈새의 거울은 잔영이 양방향으로 사격하게 한다', () => {
    const sim = makeSim({ carryRelics: ['mirror'], presetUpgrades: { echo: 1 } });
    sim.player.aim = 0;
    sim.weapons.onShot();
    sim.weapons.onShot();
    runUntil(sim, 0.4);
    const shots = sim.playerShots.filter((shot) => shot.source === 'echo');
    expect(shots).toHaveLength(2);
    expect(shots[0].vx).toBeCloseTo(-shots[1].vx);
  });

  it('두 번째 도화선은 작은 지뢰를 한 번만 생성한다', () => {
    const sim = makeSim({ carryRelics: ['fuse'], presetUpgrades: { mine: 1 }, god: true });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 27, sim.player.y);
    enemy.hp = enemy.maxHp = 1000;
    enemy.speed = 0;
    runUntil(sim, 0.5);
    const mine = sim.weapons.devices.find((d) => d.kind === 'mine' && d.secondary)!;
    enemy.x += 100;
    sim.weapons.update(10);
    expect(sim.weapons.devices).toContain(mine);
    enemy.x -= 100;
    runUntil(sim, 1.3);
    expect(sim.weapons.devices.some((d) => d.kind === 'mine')).toBe(false);
  });

  it('불길에 머무는 적을 둔화시키고 장벽에 닿은 적을 잠시 멈춘다', () => {
    const sim = makeSim({ carryRelics: ['laces', 'nail'], presetUpgrades: { flame: 1, barrier: 1 }, god: true });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 28, sim.player.y);
    enemy.hp = enemy.maxHp = 1000;
    enemy.speed = 0;
    sim.step(IDLE_INPUT);
    expect(enemy.fireSlowUntil).toBeGreaterThan(sim.elapsed);
    sim.step({ ...IDLE_INPUT, moveX: 1, dodge: true });
    runUntil(sim, 0.45);
    expect(enemy.rootedUntil).toBeGreaterThan(sim.elapsed);
  });
});
