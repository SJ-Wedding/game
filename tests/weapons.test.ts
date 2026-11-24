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

  it.each([1, 2, 3])('기본탄 %d번째 명중으로 처치하면 낙뢰가 한 번 발동한다', (lethalHit) => {
    const { sim, target, advance } = setup('mark');
    const enemy = target(145);
    const nearby = target(145, 44);
    enemy.hp = lethalHit * 4;
    for (let i = 0; i < lethalHit; i++) {
      sim.playerShots.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, r: 4, damage: 4, life: 1, source: 'player' });
      advance(1);
    }
    expect(enemy.dead).toBe(true);
    expect(nearby.hp).toBeLessThan(nearby.maxHp);
    expect(sim.damageByAttack.basic).toBe(lethalHit * 4);
    const strikes = sim.weapons.effects.filter((effect) => effect.kind === 'mark' && !effect.variant);
    expect(strikes).toHaveLength(1);
    expect(strikes[0].points).toEqual([{ x: enemy.x, y: enemy.y }, { x: nearby.x, y: nearby.y }]);
  });

  it('낙뢰는 생존한 적에게 기본탄이 세 번 적중할 때마다 발동한다', () => {
    const { sim, target } = setup('mark');
    const enemy = target(145);
    sim.damageEnemy(enemy, 1, 'basic');
    sim.damageEnemy(enemy, 1, 'echo');
    sim.damageEnemy(enemy, 1, 'basic');
    expect(sim.damageByAttack.mark).toBeUndefined();
    sim.damageEnemy(enemy, 1, 'basic');
    expect(sim.damageByAttack.mark).toBeGreaterThan(0);
    const damage = sim.damageByAttack.mark;
    sim.damageEnemy(enemy, 1, 'basic');
    sim.damageEnemy(enemy, 1000, 'echo');
    expect(sim.damageByAttack.mark).toBe(damage);
  });

  it('잔영이 이전 사격 위치에서 추가탄을 쏜다', () => {
    const { sim, target, advance } = setup('echo');
    target(280);
    sim.player.fireCd = 0;
    const shotOrigin = sim.player.x;
    advance(Math.ceil(0.36 * 60) + 5);
    const echo = sim.playerShots.find((shot) => shot.source === 'echo');
    expect(echo?.x).toBeGreaterThan(shotOrigin);
    expect(echo?.x).toBeLessThan(shotOrigin + 70);
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
    const outside = target(400);
    advance(1);
    expect(sim.weapons.infected.has(first)).toBe(true);
    sim.damageEnemy(first, 1000);
    advance(1);
    expect(sim.weapons.infected.has(second)).toBe(true);
    expect(second.hp).toBeLessThan(second.maxHp);
    expect(sim.weapons.infected.has(outside)).toBe(false);
    expect(sim.weapons.effects.filter((effect) => effect.kind === 'infection' && effect.points.length > 1)
      .map((effect) => effect.points)).toEqual([[{ x: first.x, y: first.y }, { x: second.x, y: second.y }]]);
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

  it('Lv 3 지뢰는 1.8초 주기로 설치되고 이전 지뢰가 남는다', () => {
    const sim = makeSim({ presetUpgrades: { mine: 3 } });
    for (let i = 0; i < 112; i++) sim.step(IDLE_INPUT);
    expect(sim.weapons.devices.filter((d) => d.kind === 'mine')).toHaveLength(2);
  });

  it('Lv 3 회전 칼날은 4개를 만들고 메아리는 한 번에 한 발을 쏜다', () => {
    const sim = makeSim({ presetUpgrades: { orbit: 3, echo: 3 } });
    sim.weapons.onShot();
    sim.weapons.onShot();
    for (let i = 0; i < 30; i++) sim.step(IDLE_INPUT);
    expect(sim.weapons.blades).toHaveLength(4);
    expect(sim.playerShots.filter((shot) => shot.source === 'echo')).toHaveLength(1);
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

it('무기 등급 보너스는 해당 무기의 전투 피해에만 누적된다', () => {
  const measure = (grade: 'common' | 'legendary') => {
    const sim = makeSim({ presetUpgrades: { chain: 2 } });
    sim.picks[1] = { id: 'chain', grade };
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 120, sim.player.y);
    enemy.hp = enemy.maxHp = 1000;
    sim.step(IDLE_INPUT);
    return { weaponDamage: enemy.maxHp - enemy.hp, basicDamage: sim.playerShots[0].damage };
  };
  const common = measure('common');
  const legendary = measure('legendary');
  expect(legendary.weaponDamage).toBeCloseTo(common.weaponDamage * 1.2);
  expect(legendary.basicDamage).toBe(common.basicDamage);
});

it('7분 기본탄은 화면 밖 적을 겨누며 일반 적을 관통한다', () => {
  const sim = makeSim({ startTime: 420, god: true });
  const { x, y } = sim.player;
  const far = sim.spawnEnemy('chaser', x + 900, y);
  far.speed = 0;
  sim.step(IDLE_INPUT);
  expect(sim.target).toBe(far);
  expect(sim.playerShots[0].pierceLeft).toBe(2);
  expect(sim.playerShots[0].life * sim.stats.projectileSpeed).toBeGreaterThan(900);
  const targets = [60, 100, 145].map((offset) => sim.spawnEnemy('chaser', x + offset, y));
  for (const enemy of targets) {
    enemy.hp = enemy.maxHp = 1000;
    enemy.speed = 0;
  }
  sim.player.fireCd = 999;
  for (let i = 0; i < 22; i++) sim.step(IDLE_INPUT);
  expect(targets.map((enemy) => enemy.maxHp - enemy.hp)).toEqual([sim.stats.damage, sim.stats.damage, sim.stats.damage]);
});

it('엘리트 무기 보상은 준비된 합체를 제시하고 일반 레벨업 몫을 차감하지 않는다', () => {
  const sim = makeSim({ presetUpgrades: { chain: 3, mark: 3 } });
  sim.gainXp(sim.xpNeeded);
  const elite = sim.spawnEnemy('elite', 900, 900);
  sim.damageEnemy(elite, elite.hp);
  sim.step(IDLE_INPUT);
  expect(sim.choices[0].kind).toBe('relic');
  sim.choose(0);
  expect(sim.armoryOpen).toBe(true);
  expect(sim.choices[0]).toEqual({ kind: 'fusion', id: 'storm' });
  sim.choose(0);
  expect(sim.weapons.fusions.has('storm')).toBe(true);
  expect(sim.pendingLevels).toBe(1);
  expect(sim.armoryOpen).toBe(false);
  expect(sim.choices[0].kind).toBe('upgrade');
});

it('메아리의 Lv 3은 Lv 1보다 빠르게 한 발씩 발사한다', () => {
  const fireTicks = (rank: number) => {
    const sim = makeSim({ presetUpgrades: { echo: rank } });
    const times: number[] = [];
    for (let i = 0; i < 160; i++) {
      if (i % 40 === 0) sim.weapons.onShot();
      sim.step(IDLE_INPUT);
      if (sim.playerShots.some((s) => s.source === 'echo')) {
        times.push(sim.tick);
        sim.playerShots.length = 0;
      }
    }
    return times;
  };
  const base = fireTicks(1);
  const upgraded = fireTicks(3);
  expect((base[1] - base[0]) / 60).toBeCloseTo(1.25, 1);
  expect((upgraded[1] - upgraded[0]) / 60).toBeCloseTo(0.75, 1);
  expect(upgraded.length).toBeGreaterThan(base.length);
});

it('처치 전염과 서리 포탑은 하향된 기본 피해를 기록한다', () => {
  for (const [id, multiplier] of [['infection', 0.75], ['turret', 1.35 * 0.86]] as const) {
    const sim = makeSim({ presetUpgrades: { [id]: 1 } });
    const target = sim.spawnEnemy('chaser', sim.player.x + 130, sim.player.y);
    target.hp = target.maxHp = 1000;
    sim.step(IDLE_INPUT);
    expect(sim.damageByAttack[id]).toBeCloseTo(sim.stats.damage * multiplier);
  }
});

it('공격별 피해에 저항과 초과 피해를 반영하고 쓰러진 적이나 무적 보스는 집계에서 제외한다', () => {
  const sim = makeSim({ startTime: 810, god: true });
  const target = sim.spawnEnemy('charger', 900, 900);
  target.hp = 15;
  sim.damageEnemy(target, 10, 'basic');
  sim.damageEnemy(target, 1000, 'echo');
  sim.damageEnemy(target, 1000, 'chain');
  sim.damageBoss(1000, 'storm');
  expect(sim.damageByAttack).toEqual({ basic: 7, echo: 1000 });
  const boss = sim.boss!;
  boss.state = 'idle';
  boss.hp = 100;
  sim.damageBoss(200, 'storm');
  sim.damageBoss(1000, 'chain');
  sim.step(IDLE_INPUT);
  expect(boss.hp).toBe(0);
  expect(sim.result?.damageByAttack).toEqual({ basic: 7, echo: 1000, storm: 200 });
  expect(sim.result?.combatTime).toBeCloseTo(1 / 60);
});
