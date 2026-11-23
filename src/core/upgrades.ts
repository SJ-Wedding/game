import { PROGRESSION_CONFIG } from '../config/progression';
import { UPGRADES, UPGRADE_BY_ID, WEAPON_UPGRADES, type UpgradeId } from '../config/upgrades';
import type { Rng } from './rng';
import type { Stacks } from './stats';
import type { UpgradeChoice } from './types';

/** 아직 최대 중첩에 도달하지 않은 강화 목록 */
export function eligibleUpgrades(stacks: Stacks) {
  return UPGRADES.filter((u) => (stacks[u.id] ?? 0) < u.maxStacks);
}

/**
 * 레벨업 후보를 뽑는다. 최대 중첩인 강화는 제외하며, 같은 강화가 두 번 나오지 않는다.
 * 후보가 하나도 없으면 대체 선택지(응급 처치)를 준다.
 * 난수는 항상 같은 방식으로 소비되므로 같은 시드·같은 선택 → 같은 후보.
 */
export function rollChoices(rng: Rng, stacks: Stacks, count: number = PROGRESSION_CONFIG.choiceCount): UpgradeChoice[] {
  const pool = eligibleUpgrades(stacks).slice();
  const out: UpgradeChoice[] = [];
  while (out.length < count && pool.length > 0) {
    const def = pool.splice(rng.int(pool.length), 1)[0];
    out.push({ kind: 'upgrade', def, nextStack: (stacks[def.id] ?? 0) + 1 });
  }
  if (out.length === 0) {
    const f = PROGRESSION_CONFIG.fallback;
    out.push({ kind: 'fallback', id: f.id, name: f.name, description: f.description, heal: f.heal });
  }
  return out;
}

/** 강화 1중첩 적용. 최대 중첩이면 false 를 반환하고 아무것도 바꾸지 않는다. */
export function applyUpgrade(stacks: Stacks, id: UpgradeId): boolean {
  const def = UPGRADE_BY_ID[id];
  if (!def) return false;
  if ((stacks[id] ?? 0) >= def.maxStacks) return false;
  stacks[id] = (stacks[id] ?? 0) + 1;
  return true;
}

/** 무기는 처음과 이후 세 레벨마다 일반 강화와 함께 제시된다. */
export function rollRunChoices(rng: Rng, weaponRng: Rng, stacks: Stacks, level: number): UpgradeChoice[] {
  const choices = rollChoices(rng, stacks);
  if (level % 3 !== 2 && choices[0].kind !== 'fallback') return choices;
  const available = WEAPON_UPGRADES.filter((def) => !stacks[def.id]);
  if (!available.length) return choices;
  const weapon: UpgradeChoice = { kind: 'upgrade', def: available[weaponRng.int(available.length)], nextStack: 1 };
  if (choices[0].kind === 'fallback') return [weapon];
  return [...choices.slice(0, PROGRESSION_CONFIG.choiceCount - 1), weapon];
}
