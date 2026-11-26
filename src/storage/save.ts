import { buyMeta, tokenReward, type MetaPurchases, type TokenReward } from '../core/meta';
import { META_STATS, META_UNLOCKS } from '../config/meta';
import { validCarry, validRelicIds, type RelicId } from '../config/relics';
import type { RunResult } from '../core/types';

/**
 * 브라우저 로컬 저장 (localStorage).
 * 저장 데이터에는 version 이 있으며, 값이 없거나 손상·버전 불일치면 기본값으로 시작한다.
 * 저장 형식을 바꿀 때는 SAVE_VERSION 을 올리고 migrate() 에 변환을 추가한다.
 */
export const SAVE_KEY = 'rift-arena/save';
export const SAVE_VERSION = 2;

export interface SaveRecords {
  runs: number;
  wins: number;
  /** 최장 생존 시간(초) */
  bestSurvival: number;
  bestKills: number;
  /** 최단 승리 시간(초). 승리한 적 없으면 null */
  fastestWin: number | null;
}

/** 영구 성장: 보유 토큰, 누적 획득 토큰, 구매 내역(항목 id → 단계) */
export interface SaveMeta {
  tokens: number;
  totalEarned: number;
  purchases: MetaPurchases;
}

export interface SaveData {
  version: typeof SAVE_VERSION;
  settings: { volume: number };
  records: SaveRecords;
  meta: SaveMeta;
  relicCarry?: RelicId[];
  pendingRelicDraft?: RelicId[];
  /** 전판에 얻은 유물. 다음 판 시작 유물 선택지에서 뺀다 */
  previousRelics?: RelicId[];
  /** 계정(클라우드) 저장 번호. 저장할 때마다 1씩 오르고, 서버와 비교해 더 새로운 쪽을 쓴다 */
  cloudRev?: number;
}

export type LoadStatus = 'ok' | 'missing' | 'corrupt' | 'version' | 'unavailable';

export type StorageLike = Pick<Storage, 'getItem' | 'setItem'>;

export function defaultSave(): SaveData {
  return {
    version: SAVE_VERSION,
    settings: { volume: 0.6 },
    records: { runs: 0, wins: 0, bestSurvival: 0, bestKills: 0, fastestWin: null },
    meta: { tokens: 0, totalEarned: 0, purchases: {} },
  };
}

const num = (v: unknown, def: number, min = 0, max = Number.MAX_SAFE_INTEGER): number =>
  typeof v === 'number' && Number.isFinite(v) && v >= min && v <= max ? v : def;

/** 이전 버전 데이터를 현재 버전으로 변환. 변환할 수 없으면 null */
function migrate(obj: Record<string, unknown>): Record<string, unknown> | null {
  if (obj.version === SAVE_VERSION) return obj;
  // v1 → v2: 영구 성장(토큰·구매 내역) 추가. 음량·최고 기록은 그대로 유지
  if (obj.version === 1) return { ...obj, version: 2, meta: { tokens: 0, totalEarned: 0, purchases: {} } };
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
  const meta = (migrated.meta ?? {}) as Record<string, unknown>;
  const rawPurchases = (meta.purchases && typeof meta.purchases === 'object' ? meta.purchases : {}) as Record<string, unknown>;
  const purchases: MetaPurchases = {};
  for (const d of [...META_STATS, ...META_UNLOCKS]) {
    const lv = num(rawPurchases[d.id], 0, 0, d.maxLevel);
    if (lv > 0) purchases[d.id] = Math.floor(lv);
  }
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
    meta: {
      tokens: Math.floor(num(meta.tokens, 0)),
      totalEarned: Math.floor(num(meta.totalEarned, 0)),
      purchases,
    },
  };
  const carry = validCarry(migrated.relicCarry);
  if (carry.length) data.relicCarry = carry;
  if (Array.isArray(migrated.pendingRelicDraft)) data.pendingRelicDraft = validRelicIds(migrated.pendingRelicDraft);
  if (Array.isArray(migrated.previousRelics)) data.previousRelics = validRelicIds(migrated.previousRelics);
  if (Number.isNaN(data.records.fastestWin)) data.records.fastestWin = null;
  const cloudRev = Math.floor(num(migrated.cloudRev, 0));
  if (cloudRev > 0) data.cloudRev = cloudRev;
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
export function recordRun(
  data: SaveData,
  result: RunResult,
): { data: SaveData; newRecords: NewRecord[]; tokens: TokenReward | null } {
  if (result.assisted) return { data, newRecords: [], tokens: null };
  const tokens = tokenReward(result);
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
  const meta = { ...data.meta, tokens: data.meta.tokens + tokens.total, totalEarned: data.meta.totalEarned + tokens.total };
  return { data: { ...data, records: r, meta }, newRecords, tokens };
}

/** 영구 강화 구매. 토큰이 모자라거나 최대 단계면 null */
export function purchaseMeta(data: SaveData, id: string): SaveData | null {
  const r = buyMeta(data.meta.tokens, data.meta.purchases, id);
  if (!r) return null;
  return { ...data, meta: { ...data.meta, tokens: r.tokens, purchases: r.purchases } };
}

/** 서버(계정)에 저장되는 부분: 상점 강화 내역과 기록 */
export interface CloudRow {
  meta: unknown;
  records: unknown;
  rev: number;
}

/**
 * 브라우저 저장과 서버 저장을 합친다.
 * 상점 내역(토큰·구매)은 누적 획득 토큰이 더 많은 쪽, 같으면 저장 번호가 더 큰 쪽을 그대로 쓰고,
 * 기록은 항목마다 더 좋은 값을 쓴다. 누적 획득 토큰은 줄지 않으므로 저장 번호가 빠진 옛 저장도 잃지 않는다.
 * 서버 값은 브라우저 저장과 같은 검증을 거친다.
 */
export function mergeCloud(local: SaveData, remote: CloudRow | null): SaveData {
  if (!remote) return local;
  const parsed = parseSave(JSON.stringify({ ...local, meta: remote.meta, records: remote.records })).data;
  const localRev = local.cloudRev ?? 0;
  const remoteRev = Math.max(0, Math.floor(Number(remote.rev) || 0));
  const a = local.records;
  const b = parsed.records;
  const fastest = [a.fastestWin, b.fastestWin].filter((v): v is number => v !== null);
  return {
    ...local,
    meta: (parsed.meta.totalEarned !== local.meta.totalEarned ? parsed.meta.totalEarned > local.meta.totalEarned : remoteRev > localRev) ? parsed.meta : local.meta,
    records: {
      runs: Math.max(a.runs, b.runs),
      wins: Math.max(a.wins, b.wins),
      bestSurvival: Math.max(a.bestSurvival, b.bestSurvival),
      bestKills: Math.max(a.bestKills, b.bestKills),
      fastestWin: fastest.length ? Math.min(...fastest) : null,
    },
    cloudRev: Math.max(localRev, remoteRev),
  };
}
