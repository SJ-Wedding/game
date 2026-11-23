import { describe, expect, it } from 'vitest';
import { RUN_CONFIG } from '../src/config/run';
import { SPAWN_EVENTS, SPAWN_PHASES } from '../src/config/spawns';
import { BALANCE_REFERENCE_META } from '../src/config/meta';
import { Bot, playToEnd } from '../src/core/bot';
import { GameSim } from '../src/core/sim';

/**
 * 밸런스 회귀 테스트: 설정을 바꾼 뒤 15분 설계에서 크게 벗어나면 실패한다.
 * 자세한 수치는 `npm run sim` 으로 확인.
 */
describe('15분 설계', () => {
  it('스폰 시간표가 15분 구간 설계를 따른다', () => {
    const at = (t: number) => SPAWN_PHASES.find((p) => t >= p.from && t < p.to)!;
    expect(Object.keys(at(60).weights)).toEqual(['chaser']);
    expect(Object.keys(at(200).weights)).toContain('charger');
    expect(Object.keys(at(200).weights)).not.toContain('spitter');
    expect(Object.keys(at(400).weights)).toEqual(expect.arrayContaining(['charger', 'spitter']));
    const firstElite = SPAWN_EVENTS.filter((e) => e.kind === 'elite').map((e) => e.at)[0];
    expect(firstElite).toBeGreaterThanOrEqual(420);
    expect(firstElite).toBeLessThan(660);
    expect(RUN_CONFIG.bossAt).toBe(810);
    expect(RUN_CONFIG.timeLimit).toBe(900);
    // 구간이 빈틈없이 0~15분을 덮는다
    for (let t = 0; t < RUN_CONFIG.timeLimit; t += 1) expect(at(t)).toBeDefined();
  });

  const seeds = [101, 102, 103, 104, 105, 106];
  const runs = seeds.map((seed) => {
    // 밸런스 기준: 영구 강화 중간 단계(BALANCE_REFERENCE_META, 토큰 145개)
    const sim = new GameSim({ seed, meta: BALANCE_REFERENCE_META });
    playToEnd(sim, new Bot(seed));
    return { seed, sim, result: sim.result! };
  });

  it('첫 레벨업은 초반 경험치 절반 적용으로 약 30초 이내', () => {
    for (const { sim } of runs) {
      expect(sim.firstLevelUpAt).not.toBeNull();
      expect(sim.firstLevelUpAt!).toBeGreaterThan(8);
      expect(sim.firstLevelUpAt!).toBeLessThanOrEqual(35);
    }
  });

  it('표준 봇(기준 영구 강화)의 승리는 전투 시간 14:00~15:00 사이에 끝난다', () => {
    const wins = runs.filter((r) => r.result.outcome === 'victory');
    expect(wins.length).toBeGreaterThanOrEqual(3);
    for (const w of wins) {
      expect(w.result.survivalTime).toBeGreaterThanOrEqual(840);
      expect(w.result.survivalTime).toBeLessThanOrEqual(900);
    }
  });
});
