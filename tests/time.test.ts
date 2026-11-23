import { describe, expect, it } from 'vitest';
import { RUN_CONFIG } from '../src/config/run';
import { IDLE_INPUT } from '../src/core/types';
import { makeSim, runTicks, TICK } from './helpers';

describe('전투 시간 진행과 일시정지', () => {
  it('전투 중에는 틱마다 정확히 1/tickRate 초씩 흐른다', () => {
    const sim = makeSim({ god: true });
    runTicks(sim, RUN_CONFIG.tickRate * 10);
    expect(sim.elapsed).toBeCloseTo(10, 9);
    expect(sim.remaining).toBeCloseTo(RUN_CONFIG.timeLimit - 10, 9);
  });

  it('일시정지 중에는 시간·스폰·적 이동이 모두 멈춘다', () => {
    const sim = makeSim({ god: true });
    runTicks(sim, 60 * 20);
    const t = sim.elapsed;
    const spawned = sim.spawnLog.length;
    const positions = sim.enemies.map((e) => [e.x, e.y]);
    expect(spawned).toBeGreaterThan(0);

    sim.setPaused(true);
    for (let i = 0; i < 60 * 30; i++) expect(sim.step(IDLE_INPUT)).toBe(false);
    expect(sim.advance(5, IDLE_INPUT)).toBe(0);
    expect(sim.elapsed).toBe(t);
    expect(sim.spawnLog.length).toBe(spawned);
    expect(sim.enemies.map((e) => [e.x, e.y])).toEqual(positions);

    sim.setPaused(false);
    sim.step(IDLE_INPUT);
    expect(sim.elapsed).toBeCloseTo(t + TICK, 9);
  });

  it('강화 선택 중에는 시간과 스폰이 멈추고, 선택하면 다시 흐른다', () => {
    const sim = makeSim({ god: true });
    runTicks(sim, 60 * 5);
    sim.gainXp(1000); // 여러 레벨이 한꺼번에 오른다
    sim.step(IDLE_INPUT);
    expect(sim.phase).toBe('levelup');
    expect(sim.pendingLevels).toBeGreaterThan(1);
    const t = sim.elapsed;
    const spawned = sim.spawnLog.length;
    for (let i = 0; i < 600; i++) sim.step(IDLE_INPUT);
    sim.advance(3, IDLE_INPUT);
    expect(sim.elapsed).toBe(t);
    expect(sim.spawnLog.length).toBe(spawned);

    // 남은 레벨업을 모두 고르면 전투 재개
    let guard = 0;
    while (sim.phase === 'levelup' && guard++ < 100) sim.choose(0);
    expect(sim.phase).toBe('combat');
    expect(sim.pendingLevels).toBe(0);
    sim.step(IDLE_INPUT);
    expect(sim.elapsed).toBeCloseTo(t + TICK, 9);
  });

  it('큰 프레임 간격(탭 복귀·렉)이 와도 한 번에 maxTicksPerFrame 이상 진행하지 않는다', () => {
    const sim = makeSim({ god: true });
    const ticks = sim.advance(30, IDLE_INPUT);
    expect(ticks).toBe(RUN_CONFIG.maxTicksPerFrame);
    expect(sim.elapsed).toBeCloseTo(RUN_CONFIG.maxTicksPerFrame * TICK, 9);
  });

  it('실제 시간에 맞춰 진행한다 (60fps 로 10초 = 전투 10초)', () => {
    const sim = makeSim({ god: true });
    for (let i = 0; i < 600; i++) sim.advance(1 / 60, IDLE_INPUT);
    expect(sim.elapsed).toBeCloseTo(10, 1);
    const sim2 = makeSim({ god: true });
    for (let i = 0; i < 1440; i++) sim2.advance(1 / 144, IDLE_INPUT);
    expect(sim2.elapsed).toBeCloseTo(10, 1);
  });

  it('틱이 돌지 않는 짧은 프레임(고주사율)에 누른 회피도 다음 틱에 반영된다', () => {
    const sim = makeSim({ god: true });
    expect(sim.advance(0.004, { ...IDLE_INPUT, dodge: true })).toBe(0);
    sim.advance(0.02, IDLE_INPUT);
    expect(sim.dodges).toBe(1);
  });

  it('일시정지 중 누른 회피는 재개 후 실행되지 않는다', () => {
    const sim = makeSim({ god: true });
    sim.setPaused(true);
    sim.advance(0.02, { ...IDLE_INPUT, dodge: true });
    sim.setPaused(false);
    sim.advance(0.02, IDLE_INPUT);
    expect(sim.dodges).toBe(0);
  });
});
