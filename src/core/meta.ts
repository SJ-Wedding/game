import { DIFFICULTY } from '../config/enemies';
import { META_STATS, META_UNLOCKS, TOKEN_REWARDS, type MetaUnlockId } from '../config/meta';
import { CHARACTER_SHOP_ITEMS, type CharacterShopId } from '../config/characterShop';
import type { Loadout } from '../config/characters';
import type { StatKey } from '../config/player';
import type { RunResult } from './types';

/** 구매 내역: 항목 id → 구매한 단계 수 */
export type MetaPurchases = Record<string, number>;
export const META_SHOP_ITEMS = [...META_STATS, ...META_UNLOCKS, ...CHARACTER_SHOP_ITEMS];

export interface MetaBonus {
  /** 시작 능력치에 곱해지는 비율 (0.1 = +10%) */
  statPct: Partial<Record<StatKey, number>>;
  rerolls: number;
  revives: number;
  startPick: boolean;
  luck: number;
  character: Partial<Record<CharacterShopId, number>>;
}

export function metaLevel(purchases: MetaPurchases | undefined, id: string): number {
  return Math.max(0, Math.floor(purchases?.[id] ?? 0));
}

export function metaBonus(purchases: MetaPurchases | undefined, loadout?: Loadout): MetaBonus {
  const statPct: MetaBonus['statPct'] = {};
  for (const m of META_STATS) {
    const lv = Math.min(m.maxLevel, metaLevel(purchases, m.id));
    if (lv > 0) statPct[m.stat] = (statPct[m.stat] ?? 0) + (m.pctByLevel?.[lv - 1] ?? m.pctPerLevel * lv);
  }
  const unlock = (id: MetaUnlockId) => {
    const def = META_UNLOCKS.find((u) => u.id === id)!;
    return Math.min(def.maxLevel, metaLevel(purchases, id));
  };
  const character: MetaBonus['character'] = {};
  for (const item of CHARACTER_SHOP_ITEMS) {
    if (loadout?.character !== item.character) continue;
    if ('weapon' in item && (loadout.character !== 'lumen' || loadout.weapon !== item.weapon)) continue;
    const level = Math.min(item.maxLevel, metaLevel(purchases, item.id));
    if (level > 0) character[item.id] = level * item.step;
  }
  return {
    statPct,
    rerolls: unlock('reroll'),
    revives: unlock('revive'),
    startPick: unlock('startPick') > 0,
    luck: unlock('luck'),
    character,
  };
}

/** 다음 단계 가격. 최대 단계면 null */
export function nextCost(purchases: MetaPurchases, id: string): number | null {
  const def = META_SHOP_ITEMS.find((d) => d.id === id);
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
  /** 유물로 늘어난 토큰 (탐욕의 황금 주사위, 서두른 초대장) */
  relics: number;
  /** 난이도 보정 (보통 ×0.7 → 음수, 어려움 0) */
  difficulty: number;
  total: number;
}

/** 한 판 결과 → 토큰 */
export function tokenReward(result: Pick<RunResult, 'survivalTime' | 'killsByKind' | 'outcome' | 'tokenMultiplier' | 'difficulty'>): TokenReward {
  const k = result.killsByKind;
  const normalKills = (k.chaser ?? 0) + (k.charger ?? 0) + (k.spitter ?? 0);
  const survival = Math.floor(result.survivalTime / 60) * TOKEN_REWARDS.perMinute;
  const kills = Math.floor(normalKills / TOKEN_REWARDS.killsPerToken);
  const elites = (k.elite ?? 0) * TOKEN_REWARDS.perElite;
  const victory = result.outcome === 'victory' ? TOKEN_REWARDS.victory : 0;
  const base = survival + kills + elites + victory;
  const relics = Math.round(base * Math.max(1, result.tokenMultiplier ?? 1)) - base;
  const total = Math.round((base + relics) * DIFFICULTY[result.difficulty ?? 'hard'].tokens);
  return { survival, kills, elites, victory, relics, difficulty: total - base - relics, total };
}
