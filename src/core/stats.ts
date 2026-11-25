import { CHARACTER_MAX_HP, type CharacterId } from '../config/characters';
import { GRADES, GRADE_INDEX, type GradeId } from '../config/grades';
import { PLAYER_BASE_STATS, type PlayerStats, type StatKey } from '../config/player';
import { ALL_UPGRADES, UPGRADE_BY_ID, type UpgradeEffect, type UpgradeId } from '../config/upgrades';
import type { MetaBonus } from './meta';

export type Stacks = Record<UpgradeId, number>;

/** 이번 판에 고른 강화 1개 (등급 포함) */
export interface UpgradePick {
  id: UpgradeId;
  grade: GradeId;
}

export function emptyStacks(): Stacks {
  return Object.fromEntries(ALL_UPGRADES.map((u) => [u.id, 0])) as Stacks;
}

/** 등급을 반영한 효과 값 1개 */
export function effectValue(e: UpgradeEffect, grade: GradeId): number {
  const gi = GRADE_INDEX[grade];
  if (e.gradeValues) return e.gradeValues[gi];
  const m = GRADES[gi].mult;
  if (e.op === 'mul') return Math.max(0.05, 1 - (1 - e.value) * m); // 감소폭에 배율
  return e.value * m;
}

/** 선택 즉시 회복량 (등급 반영) */
export function healOnPick(id: UpgradeId, grade: GradeId): number {
  const def = UPGRADE_BY_ID[id];
  if (!def?.healOnPick) return 0;
  const hp = def.effects.find((e) => e.stat === 'maxHp');
  return hp ? effectValue(hp, grade) : def.healOnPick * GRADES[GRADE_INDEX[grade]].mult;
}

/** 시작 능력치 × 영구 강화 */
export function baseStats(character: CharacterId = 'ranger'): PlayerStats {
  return { ...PLAYER_BASE_STATS, maxHp: CHARACTER_MAX_HP[character] } as PlayerStats;
}

export function metaStats(meta?: Pick<MetaBonus, 'statPct'>, character?: CharacterId): PlayerStats {
  const out = baseStats(character);
  if (!meta) return out;
  for (const [k, pct] of Object.entries(meta.statPct) as [StatKey, number][]) out[k] = out[k] * (1 + pct);
  return out;
}

/** 시작 능력치 → 영구 강화 → 이번 판 강화(등급) → 최종 능력치 */
export function computeStats(picks: UpgradePick[], meta?: Pick<MetaBonus, 'statPct'>, character?: CharacterId): PlayerStats {
  const add: Partial<Record<StatKey, number>> = {};
  const pct: Partial<Record<StatKey, number>> = {};
  const mul: Partial<Record<StatKey, number>> = {};
  for (const pick of picks) {
    const def = UPGRADE_BY_ID[pick.id];
    if (!def) continue;
    for (const e of def.effects) {
      const v = effectValue(e, pick.grade);
      if (e.op === 'add') add[e.stat] = (add[e.stat] ?? 0) + v;
      else if (e.op === 'pct') pct[e.stat] = (pct[e.stat] ?? 0) + v;
      else mul[e.stat] = (mul[e.stat] ?? 1) * v;
    }
  }
  const out = metaStats(meta, character);
  for (const key of Object.keys(out) as StatKey[]) {
    out[key] = (out[key] + (add[key] ?? 0)) * (1 + (pct[key] ?? 0)) * (mul[key] ?? 1);
  }
  out.projectileCount = Math.round(out.projectileCount);
  return out;
}

/** 상태창용: 단계별 능력치 */
export function statLayers(picks: UpgradePick[], meta?: Pick<MetaBonus, 'statPct'>, character?: CharacterId) {
  return { base: baseStats(character), meta: metaStats(meta, character), final: computeStats(picks, meta, character) };
}

/** 같은 시작 강화만 반복한 프리셋 → 일반 등급 선택 목록 (개발·테스트용) */
export function picksFromCounts(counts: Partial<Record<UpgradeId, number>>): UpgradePick[] {
  const out: UpgradePick[] = [];
  for (const [id, n] of Object.entries(counts) as [UpgradeId, number][]) for (let i = 0; i < n; i++) out.push({ id, grade: 'common' });
  return out;
}
