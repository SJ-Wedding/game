import { GRADE_CONFIG, GRADES, type GradeId } from '../config/grades';
import type { StatKey } from '../config/player';
import { PROGRESSION_CONFIG } from '../config/progression';
import { UPGRADES, UPGRADE_BY_ID, WEAPON_UPGRADES, type UpgradeDef, type UpgradeId } from '../config/upgrades';
import type { Rng } from './rng';
import { effectValue, healOnPick, type Stacks } from './stats';
import type { UpgradeChoice } from './types';

/** 아직 최대 중첩에 도달하지 않은 강화 목록 */
export function eligibleUpgrades(stacks: Stacks) {
  return UPGRADES.filter((u) => (stacks[u.id] ?? 0) < u.maxStacks);
}

/** 등급별 가중치 (행운 반영) */
export function gradeWeights(luck: number): number[] {
  const w = GRADES.map((g) => Math.max(0, g.weight + g.luckShift * luck));
  w[0] = Math.max(GRADE_CONFIG.minCommonWeight, w[0]);
  return w;
}

/** 등급 1개 추첨. 난수는 항상 1개 소비. */
export function rollGrade(rng: Rng, luck: number): GradeId {
  const w = gradeWeights(luck);
  let r = rng.next() * w.reduce((a, b) => a + b, 0);
  for (let i = 0; i < w.length; i++) {
    r -= w[i];
    if (r < 0) return GRADES[i].id;
  }
  return 'common';
}

/** 레벨에 따른 행운 + 영구 강화 행운 */
export function luckFor(level: number, metaLuck: number): number {
  return metaLuck + Math.max(0, level - 1) * GRADE_CONFIG.luckPerLevel;
}

/**
 * 레벨업 후보를 뽑는다. 최대 중첩인 강화는 제외하며, 같은 강화가 두 번 나오지 않는다.
 * exclude 에 있는 강화(새로고침 직전 후보)는 다른 후보가 충분하면 제외한다.
 * 후보가 하나도 없으면 대체 선택지(응급 처치)를 준다.
 * 후보 1개마다 난수 2개(종류·등급)를 소비하므로 같은 시드·같은 선택 → 같은 후보.
 */
export function rollChoices(
  rng: Rng,
  stacks: Stacks,
  luck = 0,
  exclude: UpgradeId[] = [],
  count: number = PROGRESSION_CONFIG.choiceCount,
): UpgradeChoice[] {
  const all = eligibleUpgrades(stacks);
  const fresh = all.filter((u) => !exclude.includes(u.id));
  const pool = (fresh.length >= count ? fresh : [...fresh, ...all.filter((u) => exclude.includes(u.id))]).slice();
  const out: UpgradeChoice[] = [];
  while (out.length < count && pool.length > 0) {
    const def = pool.splice(rng.int(pool.length), 1)[0];
    const grade = rollGrade(rng, luck);
    out.push({ kind: 'upgrade', def, grade, nextStack: (stacks[def.id] ?? 0) + 1 });
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

/** 레벨 2·5·8…에는 새 무기, 레벨 3·6·9…에는 보유 무기 강화를 제시한다. */
export function rollRunChoices(
  rng: Rng,
  weaponRng: Rng,
  stacks: Stacks,
  level: number,
  luck = 0,
  exclude: UpgradeId[] = [],
): UpgradeChoice[] {
  if (level === 2) {
    const available = WEAPON_UPGRADES.filter((def) => !stacks[def.id]);
    const fresh = available.filter((def) => !exclude.includes(def.id));
    const pool = fresh.length >= PROGRESSION_CONFIG.choiceCount ? fresh : available;
    const opening: UpgradeChoice[] = [];
    while (pool.length && opening.length < PROGRESSION_CONFIG.choiceCount) {
      const def = pool.splice(weaponRng.int(pool.length), 1)[0];
      opening.push({ kind: 'upgrade', def, grade: rollGrade(weaponRng, luck), nextStack: 1 });
    }
    if (opening.length) return opening;
  }
  const choices = rollChoices(rng, stacks, luck, exclude);
  const acquireWeapon = level % 3 === 2;
  const improveWeapon = level > 0 && level % 3 === 0;
  const onlyWeaponsRemain = choices[0].kind === 'fallback' && level > 0;
  if (!acquireWeapon && !improveWeapon && !onlyWeaponsRemain) return choices;

  const available = WEAPON_UPGRADES.filter((def) => (stacks[def.id] ?? 0) < def.maxStacks);
  const preferred = available.filter((def) => acquireWeapon ? !stacks[def.id] : stacks[def.id] > 0);
  const eligible = preferred.length ? preferred : acquireWeapon || onlyWeaponsRemain ? available : [];
  if (!eligible.length) return choices;
  const fresh = eligible.filter((def) => !exclude.includes(def.id));
  const pool = fresh.length ? fresh : eligible;
  const def = pool[weaponRng.int(pool.length)];
  const weapon: UpgradeChoice = { kind: 'upgrade', def, grade: rollGrade(weaponRng, luck), nextStack: (stacks[def.id] ?? 0) + 1 };
  if (choices[0].kind === 'fallback') return [weapon];
  return [...choices.slice(0, PROGRESSION_CONFIG.choiceCount - 1), weapon];
}

const STAT_LABEL: Partial<Record<StatKey, string>> = {
  fireRate: '공격 속도',
  damage: '피해',
  projectileCount: '투사체',
  maxHp: '최대 체력',
  regen: '초당 체력 회복',
  damageTaken: '받는 피해',
  moveSpeed: '이동 속도',
  dodgeCooldown: '회피 재사용 대기시간',
  pickupRadius: '경험치 흡수 범위',
  xpGain: '경험치 획득량',
  luck: '행운',
};

const fmt = (n: number) => (Math.abs(n - Math.round(n)) < 1e-6 ? String(Math.round(n)) : n.toFixed(1).replace(/\.0$/, ''));

/** 등급을 반영한 카드 효과 문구 (예: "피해 +33%") */
export function upgradeText(def: UpgradeDef, grade: GradeId): string {
  if (def.weapon || def.effects.length === 0) return def.description;
  const parts = def.effects.map((e) => {
    const v = effectValue(e, grade);
    const label = STAT_LABEL[e.stat] ?? e.stat;
    if (e.op === 'pct') return `${label} +${fmt(v * 100)}%`;
    if (e.op === 'mul') return `${label} -${fmt((1 - v) * 100)}%`;
    return `${label} +${fmt(v)}`;
  });
  const heal = healOnPick(def.id, grade);
  if (heal > 0) parts.push(`즉시 ${fmt(heal)} 회복`);
  if (def.id === 'split') parts[0] += ' (부채꼴)';
  return parts.join(', ');
}
