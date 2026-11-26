import { describe, expect, it } from 'vitest';
import { RUN_CONFIG } from '../src/config/run';
import { ENEMY_CONFIG, ENEMY_SCALING } from '../src/config/enemies';
import { SPAWN_EVENTS, SPAWN_PHASES } from '../src/config/spawns';
import { BALANCE_REFERENCE_META } from '../src/config/meta';
import { Bot, playToEnd } from '../src/core/bot';
import { createEnemy, updateEnemies } from '../src/core/enemies';
import { GameSim } from '../src/core/sim';
import { runUntil } from './helpers';

/**
 * 밸런스 회귀 테스트: 설정을 바꾼 뒤 15분 설계에서 크게 벗어나면 실패한다.
 * 자세한 수치는 `npm run sim` 으로 확인.
 */
describe('15분 설계', () => {
  it('스폰 시간표가 15분 구간 설계를 따른다', () => {
    const at = (t: number) => SPAWN_PHASES.find((p) => t >= p.from && t < p.to)!;
    expect(Object.keys(at(40).weights)).toEqual(['chaser']);
    expect(Object.keys(at(90).weights)).toContain('charger');
    expect(Object.keys(at(90).weights)).not.toContain('spitter');
    expect(Object.keys(at(400).weights)).toEqual(expect.arrayContaining(['charger', 'spitter']));
    expect([599, 600, 660, 720, 810, 900].map((t) => at(t).batch)).toEqual([4, 50, 60, 70, 80, 12]);
    const firstElite = SPAWN_EVENTS.filter((e) => e.kind === 'elite').map((e) => e.at)[0];
    expect(firstElite).toBe(120);
    expect(RUN_CONFIG.bossAt).toBe(810);
    expect(RUN_CONFIG.timeLimit).toBe(900);
    // 구간이 빈틈없이 0~15분을 덮는다
    for (let t = 0; t < RUN_CONFIG.timeLimit; t += 1) expect(at(t)).toBeDefined();
  });

  it('강화된 몬스터를 상대로 표준 봇은 보스가 등장하기 전에 사망한다', () => {
    for (const seed of [101, 102, 103, 104, 105, 106]) {
      const sim = new GameSim({ seed, meta: BALANCE_REFERENCE_META });
      playToEnd(sim, new Bot(seed));
      expect(sim.result).toMatchObject({ outcome: 'defeat', cause: 'death' });
      expect(sim.result!.survivalTime).toBeLessThan(RUN_CONFIG.bossAt);
    }
  });
});

it.each([
  ['chaser', 150, 40], ['charger', 420, 90], ['spitter', 300, 60], ['elite', 10500, 150],
] as const)('%s의 시작 체력은 %d이고 접촉 피해는 %d다', (kind, hp, attack) => {
  const sim = new GameSim({ seed: 1 });
  const enemy = sim.spawnEnemy(kind, sim.player.x, sim.player.y);
  expect(enemy.hp).toBe(hp);
  expect(enemy.maxHp).toBe(hp);
  sim.player.hp = 200;
  updateEnemies(sim, 0);
  expect(200 - sim.player.hp).toBe(attack);
});

it.each([[54, 40], [90, 62.83077], [120, 83.2], [480, 92.8]])('그림자 망령은 %d초에 생성되면 접촉 피해를 %d로 적용한다', (time, damage) => {
  const enemy = createEnemy(1, 'chaser', 900, 900, time);
  expect(ENEMY_CONFIG.chaser.contactDamage * enemy.dmgMul).toBeCloseTo(damage);
});

it('8분부터 증원이 늘고 이미 등장한 적도 추가 피해 감소를 얻는다', () => {
  const sim = new GameSim({ seed: 3, startTime: 479 });
  const enemy = sim.spawnEnemy('chaser', 900, 900);
  enemy.hp = 1000;
  const early = sim.currentSpawnPhase()!;
  const late = sim.currentSpawnPhase(480)!;
  expect(late.batch).toBeGreaterThan(early.batch);
  expect(late.maxAlive).toBeGreaterThan(early.maxAlive);
  sim.damageEnemy(enemy, 20, 'echo');
  expect(enemy.hp).toBe(980);
  sim.tick += 60;
  sim.damageEnemy(enemy, 20, 'echo');
  expect(enemy.hp).toBeCloseTo(969.375);
  sim.damageEnemy(enemy, 20, 'volley');
  expect(enemy.hp).toBeCloseTo(954.21371);
});

it('9분에 나온 갑주 적은 기본탄 저항과 후반 피해 감소를 함께 적용한다', () => {
  const sim = new GameSim({ seed: 7, startTime: 540 });
  const late = sim.spawnEnemy('charger', 900, 900);
  const early = new GameSim({ seed: 7 }).spawnEnemy('charger', 900, 900);
  expect(late.maxHp).toBeGreaterThan(early.maxHp);
  expect(late.basicResistance).toBe(0.30);
  sim.damageEnemy(late, 20, 'basic');
  expect(late.maxHp - late.hp).toBeCloseTo(4.01226);
  sim.damageEnemy(late, 20, 'echo');
  expect(late.maxHp - late.hp).toBeCloseTo(12.74852);
});

it('균열 수호자의 강화된 내구도는 받는 피해를 3.5로 나눈다', () => {
  const sim = new GameSim({ seed: 2 });
  const elite = sim.spawnEnemy('elite', 900, 900);
  sim.damageEnemy(elite, 90, 'echo');
  expect(elite.maxHp - elite.hp).toBeCloseTo(90 / 3.5);
});

it.each([[600, 50], [660, 60], [720, 70], [810, 80]])('%d초의 첫 일반 웨이브는 %d마리를 생성한다', (startTime, count) => {
  const sim = new GameSim({ seed: 3, startTime, god: true });
  sim.player.fireCd = Infinity;
  runUntil(sim, startTime + 0.65);
  expect(sim.spawnLog.filter((entry) => entry.kind !== 'boss' && !entry.assault)).toHaveLength(count);
});

it('세 방향 증원을 2초 전에 예고하고 예고한 시각에 70마리를 생성한다', () => {
  const sim = new GameSim({ seed: 2, startTime: 727.5, god: true });
  sim.player.fireCd = Infinity;
  runUntil(sim, 728);
  expect(sim.assaultWarning?.gates).toHaveLength(3);
  expect(sim.assaultWarning?.at).toBe(730);
  expect(sim.assaultWarning?.count).toBe(70);
  expect(sim.spawnLog.some((entry) => entry.assault)).toBe(false);
  const firstUnusedId = Math.max(0, ...sim.enemies.map((enemy) => enemy.id)) + 1;
  runUntil(sim, 730);
  const spawns = sim.spawnLog.filter((entry) => entry.assault);
  expect(spawns).toHaveLength(70);
  expect(spawns.every((entry) => entry.tick === 730 * RUN_CONFIG.tickRate)).toBe(true);
  const reinforcements = sim.enemies.filter((enemy) => enemy.id >= firstUnusedId
    && enemy.reinforced);
  expect(reinforcements).toHaveLength(70);
  for (const enemy of reinforcements) {
    expect(enemy.xp).toBe(ENEMY_CONFIG[enemy.kind].xp * 0.5);
    expect(enemy.dmgMul).toBeCloseTo(10 * (1 + ENEMY_SCALING.damagePerMinute * 730 / 60) * 1.3);
  }
  expect(sim.assaultWarning).toBeNull();
});

it('14:30에 살아 있는 보스에게 마지막 증원 80마리가 합류한다', () => {
  const sim = new GameSim({ seed: 2, startTime: 867.5, god: true });
  sim.player.fireCd = Infinity;
  runUntil(sim, 870);
  expect(sim.spawnLog.filter((entry) => entry.assault)).toHaveLength(80);
});
