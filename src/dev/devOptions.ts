import { DEV_CONFIG } from '../config/dev';
import { RUN_CONFIG } from '../config/run';
import type { SimOptions } from '../core/sim';

/**
 * 개발 모드 옵션. `npm run dev` 이거나 URL 에 ?dev=1 이 있으면 켜진다.
 *   ?dev=1&seed=1234            같은 시드로 시작 (스폰·강화 후보 재현)
 *   ?dev=1&start=boss           보스 직전(13:25)부터 대표 빌드로 시작
 *   ?dev=1&start=880            지정한 전투 시각(초)부터 시작
 *   ?dev=1&god=1                무적
 */
export interface DevOptions {
  enabled: boolean;
  /** null 이면 매 판 무작위 시드 */
  seed: number | null;
  /** 'boss' 또는 시작 시각(초). null 이면 처음부터 */
  start: 'boss' | number | null;
  god: boolean;
}

export function readDevOptions(search: string, isDevBuild: boolean): DevOptions {
  const q = new URLSearchParams(search);
  const enabled = isDevBuild || q.get('dev') === '1';
  if (!enabled) return { enabled: false, seed: null, start: null, god: false };
  const seedStr = q.get('seed');
  const seed = seedStr !== null && /^\d+$/.test(seedStr) ? Number(seedStr) : null;
  const startStr = q.get('start');
  let start: DevOptions['start'] = null;
  if (startStr === 'boss') start = 'boss';
  else if (startStr !== null && /^\d+(\.\d+)?$/.test(startStr)) start = Math.min(Number(startStr), RUN_CONFIG.timeLimit - 1);
  return { enabled, seed, start, god: q.get('god') === '1' };
}

/** 개발 옵션 → 시뮬레이션 옵션 */
export function simOptionsFor(dev: DevOptions, seed: number): SimOptions {
  const opts: SimOptions = { seed };
  if (!dev.enabled) return opts;
  if (dev.start === 'boss') {
    opts.startTime = RUN_CONFIG.bossAt - DEV_CONFIG.bossLeadTime;
    opts.presetUpgrades = DEV_CONFIG.bossPreset.upgrades;
    opts.presetLevel = DEV_CONFIG.bossPreset.level;
  } else if (typeof dev.start === 'number' && dev.start > 0) {
    opts.startTime = dev.start;
  }
  if (dev.god) opts.god = true;
  return opts;
}
