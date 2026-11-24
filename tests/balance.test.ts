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
    expect(Object.keys(at(40).weights)).toEqual(['chaser']);
    expect(Object.keys(at(90).weights)).toContain('charger');
    expect(Object.keys(at(90).weights)).not.toContain('spitter');
    expect(Object.keys(at(400).weights)).toEqual(expect.arrayContaining(['charger', 'spitter']));
    const firstElite = SPAWN_EVENTS.filter((e) => e.kind === 'elite').map((e) => e.at)[0];
    expect(firstElite).toBe(120);
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

  it('첫 레벨업은 초반 경험치 절반 적용으로 20초 이내', () => {
    for (const { sim } of runs) {
      expect(sim.firstLevelUpAt).not.toBeNull();
      expect(sim.firstLevelUpAt!).toBeGreaterThan(8);
      expect(sim.firstLevelUpAt!).toBeLessThanOrEqual(20);
    }
  });

  it('표준 봇(기준 영구 강화)의 승리는 전투 시간 13:30~15:00 사이에 끝난다', () => {
    const wins = runs.filter((r) => r.result.outcome === 'victory');
    expect(wins.length).toBeGreaterThanOrEqual(3);
    for (const w of wins) {
      expect(w.result.survivalTime).toBeGreaterThanOrEqual(RUN_CONFIG.bossAt);
      expect(w.result.survivalTime).toBeLessThanOrEqual(RUN_CONFIG.timeLimit);
    }
  });
});

it('후반 적은 더 높은 체력을 가지며 갑주는 기본탄 피해에만 적용된다', () => {
  const sim = new GameSim({ seed: 7, startTime: 540 });
  const late = sim.spawnEnemy('charger', 900, 900);
  const early = new GameSim({ seed: 7 }).spawnEnemy('charger', 900, 900);
  expect(late.maxHp).toBeGreaterThan(early.maxHp);
  expect(late.basicResistance).toBe(0.30);
  sim.damageEnemy(late, 20, 'basic');
  expect(late.maxHp - late.hp).toBeCloseTo(14);
  sim.damageEnemy(late, 20);
  expect(late.maxHp - late.hp).toBeCloseTo(34);
});
