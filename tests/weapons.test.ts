import { describe, expect, it } from 'vitest';
import type { WeaponId } from '../src/config/weapons';
import { IDLE_INPUT, type InputState } from '../src/core/types';
import { makeSim } from './helpers';

function setup(id: WeaponId) {
  const sim = makeSim({ presetUpgrades: { [id]: 1 }, god: true });
  sim.player.fireCd = 999;
  function target(x: number, y = 0) {
    const enemy = sim.spawnEnemy('chaser', sim.player.x + x, sim.player.y + y);
    enemy.speed = 0;
    enemy.hp = enemy.maxHp = 1000;
    return enemy;
  }
  function advance(ticks: number, input: InputState = IDLE_INPUT) {
    for (let i = 0; i < ticks; i++) sim.step(input);
  }
  return { sim, target, advance };
}

describe('특수 무기', () => {
  it('첫 레벨업에서 일반 강화 2개와 특수 무기 1개 중 하나를 고른다', () => {
    const sim = makeSim({ seed: 7 });
    sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    expect(sim.choices).toHaveLength(3);
    const choice = sim.choices[2];
    if (choice.kind !== 'upgrade' || !choice.def.weapon) throw new Error('특수 무기 후보가 없습니다');
    expect(sim.choose(2)).toBe(true);
    expect(sim.stacks[choice.def.weapon]).toBe(1);
  });

  it('번개가 최대 4개 대상을 각각 한 번 타격한다', () => {
    const { target, advance } = setup('chain');
    const enemies = [80, 140, 200, 260, 320].map((x) => target(x));
    advance(1);
    expect(enemies.map((enemy) => enemy.hp < enemy.maxHp)).toEqual([true, true, true, true, false]);
    expect(enemies[0].hp).toBeLessThan(enemies[3].hp);
  });

  it.each([
    ['mine', 35, 28], ['orbit', 60, 1], ['axe', 115, 60],
    ['turret', 150, 1], ['flame', 33, 1], ['spear', 155, 24],
  ] as const)('%s 무기가 자동으로 피해를 준다', (id, x, ticks) => {
    const { target, advance } = setup(id);
    const enemy = target(x);
    advance(ticks);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });

  it('설치된 지뢰는 시간이 지나도 남아 있다가 적이 접근하면 제거된다', () => {
    const { sim, target, advance } = setup('mine');
    advance(1);
    const mine = sim.weapons.devices.find((device) => device.kind === 'mine')!;
    sim.weapons.update(10);
    expect(sim.weapons.devices).toContain(mine);
    const enemy = target(20);
    advance(1);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(sim.weapons.devices).not.toContain(mine);
  });

  it('회피 경로는 같은 적에게 반복 피해를 주지 않는다', () => {
    const { target, advance } = setup('barrier');
    const enemy = target(48);
    advance(1, { ...IDLE_INPUT, moveX: 1, dodge: true });
    advance(30);
    const hp = enemy.hp;
    expect(hp).toBeLessThan(enemy.maxHp);
    advance(30);
    expect(enemy.hp).toBe(hp);
  });

  it('세 번째 명중이 적을 처치해도 낙뢰가 주변 적을 맞힌다', () => {
    const { sim, target, advance } = setup('mark');
    const enemy = target(145);
    const nearby = target(145, 44);
    sim.weapons.onBulletHit(enemy);
    sim.weapons.onBulletHit(enemy);
    enemy.hp = 1;
    sim.playerShots.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, r: 4, damage: 4, life: 1, source: 'player' });
    advance(1);
    expect(enemy.dead).toBe(true);
    expect(nearby.hp).toBeLessThan(nearby.maxHp);
  });

  it('잔영이 이전 사격 위치에서 추가탄을 쏜다', () => {
    const { sim, target, advance } = setup('echo');
    target(280);
    sim.player.fireCd = 0;
    // 두 번째 기본 사격(1/공격 속도 초 뒤) + 잔영 지연 0.36초가 지날 때까지 (공격 속도와 무관하게)
    advance(Math.ceil((1 / sim.stats.fireRate + 0.36) * 60) + 5);
    expect(sim.playerShots.some((shot) => shot.source === 'echo')).toBe(true);
  });

  it('중력 구체가 적을 끌어온 뒤 피해를 준다', () => {
    const { target, advance } = setup('gravity');
    target(130); // 첫 구체가 수평으로 출발하도록 가장 가까운 적을 둔다.
    const enemy = target(189, 95);
    const initialY = enemy.y;
    advance(105);
    expect(enemy.y).toBeLessThan(initialY - 30);
    advance(16);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });

  it('감염된 적이 사망하면 주변 적이 감염된다', () => {
    const { sim, target, advance } = setup('infection');
    const first = target(100);
    const second = target(175);
    advance(1);
    expect(sim.weapons.infected.has(first)).toBe(true);
    sim.damageEnemy(first, 1000);
    advance(1);
    expect(sim.weapons.infected.has(second)).toBe(true);
    expect(second.hp).toBeLessThan(second.maxHp);
  });
});

describe('무기 강화의 추가 효과', () => {
  it('강화한 연쇄 번개는 한 단계마다 한 마리 더 타격한다', () => {
    for (const rank of [2, 3]) {
      const sim = makeSim({ presetUpgrades: { chain: rank } });
      sim.player.fireCd = 999;
      const enemies = Array.from({ length: 7 }, (_, i) => sim.spawnEnemy('chaser', sim.player.x + 70 + i * 55, sim.player.y));
      for (const enemy of enemies) enemy.hp = enemy.maxHp = 1000;
      sim.step(IDLE_INPUT);
      expect(enemies.filter((enemy) => enemy.hp < enemy.maxHp)).toHaveLength(rank + 3);
    }
  });

  it('Lv 3 지뢰는 2.2초 주기로 설치되고 이전 지뢰가 남는다', () => {
    const sim = makeSim({ presetUpgrades: { mine: 3 } });
    for (let i = 0; i < 140; i++) sim.step(IDLE_INPUT);
    expect(sim.weapons.devices.filter((d) => d.kind === 'mine')).toHaveLength(2);
  });

  it('Lv 3 회전 칼날과 메아리 사격은 칼날 4개와 잔영 탄환 3발을 만든다', () => {
    const sim = makeSim({ presetUpgrades: { orbit: 3, echo: 3 } });
    sim.weapons.onShot();
    sim.weapons.onShot();
    for (let i = 0; i < 30; i++) sim.step(IDLE_INPUT);
    expect(sim.weapons.blades).toHaveLength(4);
    expect(sim.playerShots.filter((shot) => shot.source === 'echo')).toHaveLength(3);
  });

  it('Lv 3 화염 발자국은 기존 반경 밖의 적까지 타격한다', () => {
    const sim = makeSim({ presetUpgrades: { flame: 3 } });
    sim.player.fireCd = 999;
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 49, sim.player.y);
    sim.step(IDLE_INPUT);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });

  it('몬스터마다 다른 값의 경험치 보석을 떨어뜨린다', () => {
    const sim = makeSim();
    for (const kind of ['chaser', 'spitter', 'charger', 'elite'] as const) {
      const enemy = sim.spawnEnemy(kind, 1000, 1000);
      sim.damageEnemy(enemy, enemy.hp);
    }
    expect(sim.gems.map((gem) => gem.value)).toEqual([1, 3, 4, 40]);
  });
});

describe('특수 무기 합체', () => {
  it('정해진 재료가 둘 다 최대 레벨일 때만 합체 카드가 나오며 한 번만 선택할 수 있다', () => {
    const sim = makeSim({ seed: 7, presetLevel: 8, presetUpgrades: { chain: 3, mark: 2, axe: 3 } });
    const nextLevel = () => {
      sim.gainXp(sim.xpNeeded);
      sim.step(IDLE_INPUT);
    };
    nextLevel();
    expect(sim.choices.some((c) => c.kind === 'fusion')).toBe(false);
    const mark = sim.choices.findIndex((c) => c.kind === 'upgrade' && c.def.id === 'mark');
    expect(mark).toBeGreaterThanOrEqual(0);
    sim.choose(mark);
    nextLevel();
    expect(sim.choices[0]).toEqual({ kind: 'fusion', id: 'storm' });
    expect(sim.choose(0)).toBe(true);
    expect(sim.weapons.fusions.has('storm')).toBe(true);
    expect(sim.stacks.chain).toBe(3);
    expect(sim.stacks.mark).toBe(3);
    if (sim.phase === 'levelup') sim.choose(0); // 레벨 10 유물
    nextLevel();
    expect(sim.choices.some((c) => c.kind === 'fusion')).toBe(false);
  });

  it('다른 재료 공격이 같은 적을 3초 안에 맞히면 주변에 공명 피해가 발생한다', () => {
    const sim = makeSim({ presetUpgrades: { chain: 3, mark: 3 } });
    sim.weapons.fusions.add('storm');
    const first = sim.spawnEnemy('chaser', 900, 900);
    const next = sim.spawnEnemy('chaser', 980, 900);
    first.hp = next.hp = 1000;
    sim.weapons.onFusionHit('chain', first);
    sim.weapons.onFusionHit('chain', first);
    expect(next.hp).toBe(1000);
    sim.tick += 181;
    sim.weapons.onFusionHit('mark', first);
    expect(next.hp).toBe(1000);
    sim.weapons.onFusionHit('chain', first);
    expect(next.hp).toBeCloseTo(1000 - sim.stats.damage * 2.1);
  });
});
