import { WEAPONS, WEAPON_IDS, WEAPON_MAX_RANK, type WeaponId } from './weapons';
import type { StatKey } from './player';

/**
 * 일반 강화는 공격, 생존, 기동으로 분류한다.
 * effects 의 계산 방식 (고른 카드마다 등급 값 v 를 구해 합산/곱셈):
 *   add : 기본값 + Σv
 *   pct : 기본값 × (1 + Σv)       (예: 0.18 → 일반 +18%, 전설 +54%)
 *   mul : 기본값 × Πv             (예: 0.82 → 일반 18% 감소, 희귀 27% 감소)
 * description 은 일반 등급 기준 문구. 카드에는 등급 값으로 다시 계산한 문구가 표시된다.
 * 일반 강화에는 선택 횟수 제한이 없다. 특수 무기는 maxStacks에 도달하면 후보에서 제외된다. 등급과 관계없이 1회 선택 = 1중첩.
 */
export type UpgradeCategory = 'attack' | 'survival' | 'mobility';
export type UpgradeId =
  | 'rapid' | 'split' | 'power'
  | 'vitality' | 'regen' | 'guard'
  | 'swift' | 'evasion' | 'magnet' | 'wisdom' | 'fortune'
  | WeaponId;

export interface UpgradeEffect {
  stat: StatKey;
  op: 'add' | 'pct' | 'mul';
  /** 일반 등급 1회 선택 시 값. 다른 등급은 grades.ts 의 배율을 곱한다 (mul 은 감소폭에 곱함) */
  value: number;
  /** 등급별 값을 직접 지정 [일반, 희귀, 영웅, 전설] — 정수가 필요한 효과(투사체 수 등)에 사용 */
  gradeValues?: [number, number, number, number];
}

export interface UpgradeDef {
  id: UpgradeId;
  name: string;
  category: UpgradeCategory;
  description: string;
  maxStacks?: number;
  effects: UpgradeEffect[];
  /** 선택 즉시 회복량 (등급 배율 적용) */
  healOnPick?: number;
  weapon?: WeaponId;
}

export const CATEGORY_LABEL: Record<UpgradeCategory, string> = {
  attack: '공격',
  survival: '생존',
  mobility: '기동',
};

export const UPGRADES: UpgradeDef[] = [
  // ── 공격 ──
  { id: 'rapid', name: '연사 숙련', category: 'attack', description: '공격 속도 +18%',
    effects: [{ stat: 'fireRate', op: 'pct', value: 0.18 }] },
  { id: 'split', name: '분열 사격', category: 'attack', description: '투사체 +1 (부채꼴)',
    effects: [{ stat: 'projectileCount', op: 'add', value: 1, gradeValues: [1, 1, 2, 2] }] },
  { id: 'power', name: '날 선 탄환', category: 'attack', description: '피해 +22%',
    effects: [{ stat: 'damage', op: 'pct', value: 0.22 }] },
  // ── 생존 ──
  { id: 'vitality', name: '강인한 육체', category: 'survival', description: '최대 체력 +25, 즉시 25 회복',
    effects: [{ stat: 'maxHp', op: 'add', value: 25, gradeValues: [25, 38, 50, 75] }], healOnPick: 25 },
  { id: 'regen', name: '재생', category: 'survival', description: '초당 체력 0.8 회복',
    effects: [{ stat: 'regen', op: 'add', value: 0.8 }] },
  { id: 'guard', name: '수호 결계', category: 'survival', description: '받는 피해 -12%',
    effects: [{ stat: 'damageTaken', op: 'mul', value: 0.88 }] },
  // ── 기동 ──
  { id: 'swift', name: '질풍 걸음', category: 'mobility', description: '이동 속도 +10%',
    effects: [{ stat: 'moveSpeed', op: 'pct', value: 0.1 }] },
  { id: 'evasion', name: '순간 회피', category: 'mobility', description: '회피 재사용 대기시간 -18%',
    effects: [{ stat: 'dodgeCooldown', op: 'mul', value: 0.82 }] },
  { id: 'magnet', name: '흡수 영역', category: 'mobility', description: '경험치 흡수 범위 +45%',
    effects: [{ stat: 'pickupRadius', op: 'pct', value: 0.45 }] },
  { id: 'wisdom', name: '균열의 통찰', category: 'mobility', description: '경험치 획득량 +10%',
    effects: [{ stat: 'xpGain', op: 'pct', value: 0.1 }] },
  { id: 'fortune', name: '행운의 별', category: 'mobility', description: '행운 +1',
    effects: [{ stat: 'luck', op: 'add', value: 1 }] },
];

export const WEAPON_UPGRADES: (UpgradeDef & { maxStacks: number })[] = WEAPON_IDS.map((id) => ({
  id, weapon: id, name: WEAPONS[id].name, description: WEAPONS[id].description,
  category: 'attack', maxStacks: WEAPON_MAX_RANK, effects: [],
}));

export const ALL_UPGRADES = [...UPGRADES, ...WEAPON_UPGRADES];

export const UPGRADE_BY_ID: Record<UpgradeId, UpgradeDef> = Object.fromEntries(
  ALL_UPGRADES.map((u) => [u.id, u]),
) as Record<UpgradeId, UpgradeDef>;
