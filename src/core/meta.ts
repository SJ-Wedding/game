import { META_STATS, META_UNLOCKS, TOKEN_REWARDS, type MetaUnlockId } from '../config/meta';
import type { StatKey } from '../config/player';
import type { RunResult } from './types';

/** 구매 내역: 항목 id → 구매한 단계 수 */
export type MetaPurchases = Record<string, number>;

export interface MetaBonus {
  /** 시작 능력치에 곱해지는 비율 (0.1 = +10%) */
  statPct: Partial<Record<StatKey, number>>;
  rerolls: number;
  revives: number;
  startPick: boolean;
  luck: number;
}

export function metaLevel(purchases: MetaPurchases | undefined, id: string): number {
  return Math.max(0, Math.floor(purchases?.[id] ?? 0));
}

export function metaBonus(purchases: MetaPurchases | undefined): MetaBonus {
  const statPct: MetaBonus['statPct'] = {};
  for (const m of META_STATS) {
    const lv = Math.min(m.maxLevel, metaLevel(purchases, m.id));
    if (lv > 0) statPct[m.stat] = (statPct[m.stat] ?? 0) + (m.pctByLevel?.[lv - 1] ?? m.pctPerLevel * lv);
  }
  const unlock = (id: MetaUnlockId) => {
    const def = META_UNLOCKS.find((u) => u.id === id)!;
    return Math.min(def.maxLevel, metaLevel(purchases, id));
  };
  return {
    statPct,
    rerolls: unlock('reroll'),
    revives: unlock('revive'),
    startPick: unlock('startPick') > 0,
    luck: unlock('luck'),
  };
}

/** 다음 단계 가격. 최대 단계면 null */
export function nextCost(purchases: MetaPurchases, id: string): number | null {
  const def = [...META_STATS, ...META_UNLOCKS].find((d) => d.id === id);
  if (!def) return null;
  const lv = metaLevel(purchases, id);
  return lv >= def.maxLevel ? null : def.costs[lv];
}

/** 구매 시도. 성공하면 새 토큰·구매 내역을, 실패하면 null 을 돌려준다 (원본 불변) */
export function buyMeta(tokens: number, purchases: MetaPurchases, id: string): { tokens: number; purchases: MetaPurchases } | null {
  const cost = nextCost(purchases, id);
  if (cost === null || tokens < cost) return null;
  return { tokens: tokens - cost, purchases: { ...purchases, [id]: metaLevel(purchases, id) + 1 } };
}

export interface TokenReward {
  survival: number;
  kills: number;
  elites: number;
  victory: number;
  total: number;
}

/** 한 판 결과 → 토큰 */
export function tokenReward(result: Pick<RunResult, 'survivalTime' | 'killsByKind' | 'outcome'>): TokenReward {
  const k = result.killsByKind;
  const normalKills = (k.chaser ?? 0) + (k.charger ?? 0) + (k.spitter ?? 0);
  const survival = Math.floor(result.survivalTime / 60) * TOKEN_REWARDS.perMinute;
  const kills = Math.floor(normalKills / TOKEN_REWARDS.killsPerToken);
  const elites = (k.elite ?? 0) * TOKEN_REWARDS.perElite;
  const victory = result.outcome === 'victory' ? TOKEN_REWARDS.victory : 0;
  return { survival, kills, elites, victory, total: survival + kills + elites + victory };
}
