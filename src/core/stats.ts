import { PLAYER_BASE_STATS, type PlayerStats, type StatKey } from '../config/player';
import { ALL_UPGRADES, UPGRADES, type UpgradeId } from '../config/upgrades';

export type Stacks = Record<UpgradeId, number>;

export function emptyStacks(): Stacks {
  return Object.fromEntries(ALL_UPGRADES.map((u) => [u.id, 0])) as Stacks;
}

/** 기본 능력치 + 강화 중첩 → 최종 능력치 */
export function computeStats(stacks: Stacks): PlayerStats {
  const add: Partial<Record<StatKey, number>> = {};
  const pct: Partial<Record<StatKey, number>> = {};
  const mul: Partial<Record<StatKey, number>> = {};
  for (const u of UPGRADES) {
    const n = stacks[u.id] ?? 0;
    if (n <= 0) continue;
    for (const e of u.effects) {
      if (e.op === 'add') add[e.stat] = (add[e.stat] ?? 0) + e.value * n;
      else if (e.op === 'pct') pct[e.stat] = (pct[e.stat] ?? 0) + e.value * n;
      else mul[e.stat] = (mul[e.stat] ?? 1) * Math.pow(e.value, n);
    }
  }
  const out = { ...PLAYER_BASE_STATS } as PlayerStats;
  for (const key of Object.keys(out) as StatKey[]) {
    out[key] = (out[key] + (add[key] ?? 0)) * (1 + (pct[key] ?? 0)) * (mul[key] ?? 1);
  }
  out.projectileCount = Math.round(out.projectileCount);
  return out;
}
