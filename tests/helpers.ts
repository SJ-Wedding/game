import { RUN_CONFIG } from '../src/config/run';
import { GameSim, type SimOptions } from '../src/core/sim';
import { IDLE_INPUT, type InputState } from '../src/core/types';

export const TICK = 1 / RUN_CONFIG.tickRate;

export function makeSim(opts: Partial<SimOptions> = {}): GameSim {
  return new GameSim({ seed: 1, ...opts });
}

/** 레벨업이 뜨면 첫 번째 후보를 골라 계속 진행하며 n 틱 실행 */
export function runTicks(sim: GameSim, n: number, input: InputState = IDLE_INPUT): void {
  for (let i = 0; i < n && sim.phase !== 'ended'; i++) {
    if (sim.phase === 'levelup') sim.choose(0);
    sim.step(input);
  }
}

/** 전투 시각 t(초)가 될 때까지 진행 */
export function runUntil(sim: GameSim, t: number, input: InputState = IDLE_INPUT): void {
  const target = Math.round(t * RUN_CONFIG.tickRate);
  let guard = 0;
  while (sim.tick < target && sim.phase !== 'ended' && guard++ < 10_000_000) {
    if (sim.phase === 'levelup') {
      sim.choose(0);
      continue;
    }
    sim.step(input);
  }
}

/** 테스트용 메모리 저장소 */
export class MemoryStorage {
  map = new Map<string, string>();
  getItem(k: string): string | null {
    return this.map.has(k) ? this.map.get(k)! : null;
  }
  setItem(k: string, v: string): void {
    this.map.set(k, v);
  }
}
