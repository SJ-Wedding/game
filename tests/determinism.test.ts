import { describe, expect, it } from 'vitest';
import { Bot, playToEnd } from '../src/core/bot';
import { GameSim } from '../src/core/sim';
import { IDLE_INPUT } from '../src/core/types';
import { runTicks } from './helpers';

describe('시드 재현성', () => {
  it('같은 시드 + 같은 입력 → 스폰·강화 후보·결과가 완전히 같다', () => {
    const play = (seed: number) => {
      const sim = new GameSim({ seed });
      playToEnd(sim, new Bot(seed));
      return { spawns: sim.spawnLog, picks: sim.pickOrder, result: sim.result };
    };
    const a = play(2024);
    const b = play(2024);
    expect(a.spawns.length).toBeGreaterThan(20);
    expect(b).toEqual(a);
  });

  it('스폰 난수는 플레이어 행동과 무관하게 같은 순서로 소비된다', () => {
    const a = new GameSim({ seed: 99, god: true });
    const b = new GameSim({ seed: 99, god: true });
    const bot = new Bot(99);
    for (let i = 0; i < 60 * 60; i++) {
      if (a.phase === 'levelup') a.choose(0);
      if (b.phase === 'levelup') b.choose(1);
      a.step(IDLE_INPUT); // 가만히
      b.step(bot.input(b)); // 돌아다니며 공격
    }
    // 같은 시점에 다음 스폰 난수가 같다 → 스폰 종류·위치 난수가 재현된다
    expect(a.rngSpawn.next()).toBe(b.rngSpawn.next());
    const kindsA = a.spawnLog.slice(0, 15).map((r) => [r.tick, r.kind, r.angle, r.distance]);
    const kindsB = b.spawnLog.slice(0, 15).map((r) => [r.tick, r.kind, r.angle, r.distance]);
    expect(kindsB).toEqual(kindsA);
  });

  it('같은 시드·같은 선택이면 레벨업 후보가 같고, 다른 시드면 달라진다', () => {
    const choices = (seed: number) => {
      const sim = new GameSim({ seed, god: true });
      const seen: string[] = [];
      for (let i = 0; i < 8; i++) {
        sim.gainXp(5000);
        runTicks(sim, 0);
        sim.step(IDLE_INPUT);
        while (sim.phase === 'levelup') {
          seen.push(sim.choices.map((c) => (c.kind === 'upgrade' ? c.def.id : c.kind === 'roanGear' ? c.gear.id : c.id)).join('/'));
          sim.choose(0);
        }
      }
      return seen;
    };
    expect(choices(5)).toEqual(choices(5));
    expect(choices(5)).not.toEqual(choices(6));
  });
});
