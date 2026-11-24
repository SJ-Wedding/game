import { describe, expect, it } from 'vitest';
import { BOSS_CONFIG } from '../src/config/boss';
import { ENEMY_CONFIG, ENEMY_SCALING } from '../src/config/enemies';
import { createEnemy } from '../src/core/enemies';
import { RUN_CONFIG } from '../src/config/run';
import { IDLE_INPUT } from '../src/core/types';
import { makeSim, runTicks, runUntil } from './helpers';

const BOSS_TICK = RUN_CONFIG.bossAt * RUN_CONFIG.tickRate;

describe('보스 등장', () => {
  it('처음부터 진행하면 정확히 bossAt(13:30)에 보스가 등장한다', () => {
    const sim = makeSim({ seed: 7, god: true });
    runUntil(sim, RUN_CONFIG.bossAt - 1 / RUN_CONFIG.tickRate);
    expect(sim.tick).toBe(BOSS_TICK - 1);
    expect(sim.bossSpawned).toBe(false);
    expect(sim.boss).toBeNull();
    runTicks(sim, 1);
    expect(sim.tick).toBe(BOSS_TICK);
    expect(sim.bossSpawned).toBe(true);
    expect(sim.boss?.hp).toBe(BOSS_CONFIG.hp);
    expect(sim.spawnLog.filter((r) => r.kind === 'boss')).toHaveLength(1);
  });

  it('보스는 한 번만 등장한다', () => {
    const sim = makeSim({ startTime: RUN_CONFIG.bossAt - 2, god: true });
    runUntil(sim, RUN_CONFIG.timeLimit - 1);
    expect(sim.spawnLog.filter((r) => r.kind === 'boss')).toHaveLength(1);
  });

  it('보스 시각 이후로 시작하면 보스가 즉시 등장한다 (개발용 시작 구간)', () => {
    const sim = makeSim({ startTime: RUN_CONFIG.bossAt + 10 });
    expect(sim.boss).not.toBeNull();
  });

  it('등장 연출 중에는 피해를 받지 않는다', () => {
    const sim = makeSim({ startTime: RUN_CONFIG.bossAt, god: true });
    const boss = sim.boss!;
    expect(boss.state).toBe('enter');
    sim.damageBoss(500);
    expect(boss.hp).toBe(boss.maxHp);
  });

  it('체력이 60%가 되면 2페이즈로 전환한다', () => {
    const sim = makeSim({ startTime: RUN_CONFIG.bossAt, god: true });
    runTicks(sim, 120);
    sim.damageBoss(sim.boss!.maxHp * 0.4);
    sim.step(IDLE_INPUT);
    expect(sim.boss!.phase).toBe(2);
    expect(sim.boss!.state).toBe('phaseShift');
  });
});

describe('승리와 패배', () => {
  it('보스를 처치하면 즉시 승리한다', () => {
    const sim = makeSim({ startTime: RUN_CONFIG.bossAt, god: true });
    runTicks(sim, 120); // 등장 연출 이후
    sim.damageBoss(sim.boss!.maxHp);
    sim.step(IDLE_INPUT);
    expect(sim.phase).toBe('ended');
    expect(sim.result?.outcome).toBe('victory');
    expect(sim.result?.cause).toBe('boss');
    expect(sim.result?.survivalTime).toBeLessThan(RUN_CONFIG.timeLimit);
    const t = sim.elapsed;
    sim.step(IDLE_INPUT);
    expect(sim.elapsed).toBe(t); // 종료 후 시간 정지
  });

  it('15:00에 보스가 살아 있으면 강화 돌격수 연장전으로 진입한다', () => {
    const sim = makeSim({ startTime: RUN_CONFIG.timeLimit - 3, god: true });
    sim.player.fireCd = Infinity;
    runUntil(sim, RUN_CONFIG.timeLimit - 1 / RUN_CONFIG.tickRate);
    expect(sim.overtime).toBe(false);
    runTicks(sim, 1);
    expect(sim.overtime).toBe(true);
    expect(sim.phase).toBe('combat');
    expect(sim.result).toBeNull();
    runTicks(sim, 180);
    const spawned = sim.spawnLog.filter((entry) => entry.tick >= RUN_CONFIG.timeLimit * RUN_CONFIG.tickRate);
    expect(spawned.length).toBeGreaterThan(0);
    expect(spawned.every((entry) => entry.kind === 'charger')).toBe(true);
    const normal = createEnemy(0, 'charger', 1000, 1000, RUN_CONFIG.timeLimit - 1 / RUN_CONFIG.tickRate);
    const overtime = createEnemy(0, 'charger', 1000, 1000, RUN_CONFIG.timeLimit);
    const scaledHp = ENEMY_CONFIG.charger.hp * (1 + ENEMY_SCALING.hpPerMinute * RUN_CONFIG.timeLimit / 60);
    expect(overtime.maxHp).toBe(Math.round(scaledHp * 1.5));
    expect(overtime.dmgMul).toBeCloseTo(normal.dmgMul * 2, 3);
  });

  it('연장전에서 보스를 처치해도 승리한다', () => {
    const sim = makeSim({ startTime: RUN_CONFIG.timeLimit, god: true });
    runTicks(sim, 120);
    sim.damageBoss(sim.boss!.maxHp);
    sim.step(IDLE_INPUT);
    expect(sim.result).toMatchObject({ outcome: 'victory', cause: 'boss' });
    expect(sim.result!.survivalTime).toBeGreaterThan(RUN_CONFIG.timeLimit);
  });

  it('사망하면 마지막으로 맞은 공격이 원인으로 기록된다', () => {
    const sim = makeSim();
    sim.hurtPlayer(9999, '시험용 공격');
    sim.step(IDLE_INPUT);
    expect(sim.result).toMatchObject({ outcome: 'defeat', cause: 'death', killedBy: '시험용 공격' });
  });

  it('회피 중에는 피해를 받지 않는다', () => {
    const sim = makeSim();
    sim.step({ ...IDLE_INPUT, dodge: true, moveX: 1 });
    expect(sim.hurtPlayer(50, 'x')).toBe(false);
    expect(sim.player.hp).toBe(sim.stats.maxHp);
  });
});
