import type { RunResult } from '../core/types';

/**
 * 브라우저 로컬 저장 (localStorage).
 * 저장 데이터에는 version 이 있으며, 값이 없거나 손상·버전 불일치면 기본값으로 시작한다.
 * 저장 형식을 바꿀 때는 SAVE_VERSION 을 올리고 migrate() 에 변환을 추가한다.
 */
export const SAVE_KEY = 'rift-arena/save';
export const SAVE_VERSION = 1;

export interface SaveRecords {
  runs: number;
  wins: number;
  /** 최장 생존 시간(초) */
  bestSurvival: number;
  bestKills: number;
  /** 최단 승리 시간(초). 승리한 적 없으면 null */
  fastestWin: number | null;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  settings: { volume: number };
  records: SaveRecords;
}

export type LoadStatus = 'ok' | 'missing' | 'corrupt' | 'version' | 'unavailable';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { volume: 0.6 },
    records: { runs: 0, wins: 0, bestSurvival: 0, bestKills: 0, fastestWin: null },
  };
}

const num = (v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : def;

/** 이전 버전 데이터를 현재 버전으로 변환. 변환할 수 없으면 null */
function migrate(obj: Record<string, unknown>): Record<string, unknown> | null {
  if (obj.version === SAVE_VERSION) return obj;
  // 예) if (obj.version === 0) return { ...obj, version: 1, settings: { volume: obj.vol } };
  return null;
}

/** 문자열 → 저장 데이터. 어떤 입력이 와도 예외 없이 유효한 데이터를 돌려준다. */
export function parseSave(raw: string | null): { data: SaveData; status: LoadStatus } {
  if (raw === null || raw === '') return { data: defaultSave(), status: 'missing' };
  let obj: unknown;
  try {
    obj = JSON.parse(raw);
  } catch {
    return { data: defaultSave(), status: 'corrupt' };
  }
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return { data: defaultSave(), status: 'corrupt' };
  const migrated = migrate(obj as Record<string, unknown>);
  if (!migrated) return { data: defaultSave(), status: 'version' };

  // 필드 단위로 검증: 잘못된 값만 기본값으로 바꾼다
  const def = defaultSave();
  const settings = (migrated.settings ?? {}) as Record<string, unknown>;
  const rec = (migrated.records ?? {}) as Record<string, unknown>;
  const data: SaveData = {
    version: SAVE_VERSION,
    settings: { volume: num(settings.volume, def.settings.volume, 0, 1) },
    records: {
      runs: Math.floor(num(rec.runs, 0)),
      wins: Math.floor(num(rec.wins, 0)),
      bestSurvival: num(rec.bestSurvival, 0, 0, 24 * 3600),
      bestKills: Math.floor(num(rec.bestKills, 0)),
      fastestWin: rec.fastestWin === null ? null : num(rec.fastestWin, NaN, 0, 24 * 3600),
    },
  };
  if (Number.isNaN(data.records.fastestWin)) data.records.fastestWin = null;
  return { data, status: 'ok' };
}

export function loadSave(storage: StorageLike | null): { data: SaveData; status: LoadStatus } {
  if (!storage) return { data: defaultSave(), status: 'unavailable' };
  try {
    return parseSave(storage.getItem(SAVE_KEY));
  } catch {
    // 사파리 비공개 모드 등에서 접근 자체가 막힌 경우
    return { data: defaultSave(), status: 'unavailable' };
  }
}

export function writeSave(storage: StorageLike | null, data: SaveData): boolean {
  if (!storage) return false;
  try {
    storage.setItem(SAVE_KEY, JSON.stringify(data));
    return true;
  } catch {
    return false;
  }
}

export type NewRecord = 'survival' | 'kills' | 'fastestWin' | 'firstWin';

/**
 * 한 판 결과를 기록에 반영. 개발 옵션(보스 직전 시작·무적)을 쓴 판은 반영하지 않는다.
 * 원본을 바꾸지 않고 새 데이터를 돌려준다.
 */
export function recordRun(data: SaveData, result: RunResult): { data: SaveData; newRecords: NewRecord[] } {
  if (result.assisted) return { data, newRecords: [] };
  const r = { ...data.records };
  const newRecords: NewRecord[] = [];
  r.runs++;
  if (result.survivalTime > r.bestSurvival) {
    if (r.runs > 1) newRecords.push('survival');
    r.bestSurvival = result.survivalTime;
  }
  if (result.kills > r.bestKills) {
    if (r.runs > 1) newRecords.push('kills');
    r.bestKills = result.kills;
  }
  if (result.outcome === 'victory') {
    if (r.wins === 0) newRecords.push('firstWin');
    r.wins++;
    if (r.fastestWin === null || result.survivalTime < r.fastestWin) {
      if (r.fastestWin !== null) newRecords.push('fastestWin');
      r.fastestWin = result.survivalTime;
    }
  }
  return { data: { ...data, records: r }, newRecords };
}
