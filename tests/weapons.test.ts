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
    advance(65);
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
