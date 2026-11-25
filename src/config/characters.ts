import { GRADES, GRADE_INDEX, type GradeId } from './grades';
import { DAGGER_THRUST } from './roan';

export const CHARACTERS = {
  ranger: { name: '균열 사수', color: '#75d9ff', description: '자동 사격과 여러 특수 무기를 조합합니다.' },
  lumen: { name: '마도공 루멘', color: '#8ce7ff', description: '연쇄 번개나 서리 포탑 하나를 골라 집중적으로 강화합니다.' },
  roan: { name: '철검 수호자 로안', color: '#ff9d8e', description: '전방의 적을 느리고 강한 검으로 한꺼번에 벱니다.' },
} as const;

export type CharacterId = keyof typeof CHARACTERS;
/** 캐릭터별 시작 최대 체력 (균열 사수 기준 70) */
export const CHARACTER_MAX_HP: Record<CharacterId, number> = { ranger: 70, lumen: 60, roan: 160 };
export type LumenWeapon = 'chain' | 'turret';
export type Loadout = { character: 'ranger' } | { character: 'lumen'; weapon: LumenWeapon } | { character: 'roan' };
export const DEFAULT_LOADOUT: Loadout = { character: 'ranger' };
export const LUMEN_WEAPONS = ['chain', 'turret'] as const;
export const LUMEN = { baseDamage: 1.3, damagePerPoint: 0.03 } as const;
export const LUMEN_CHAIN = { interval: 1.9, firstRange: 0.5, jumpRange: 2, repeatDamage: [0.30, 0.25, 0.20] } as const;
export const SWORD = {
  damage: 5.0, interval: 1.45, range: 125, maxRange: 185, angle: 130,
  damagePerMastery: 0.30, intervalPerDamageMastery: 0.03, sweepDuration: 0.27,
  /** 각도 한도를 넘친 20°당 공격 거리 +5%, 최대 +30% */
  overflowRangePer20: 0.05, overflowRangeMax: 0.30,
} as const;

// 첫 효과는 카드 수치와 일치하고, 높은 중첩에서도 발동 간격이 한 틱으로 수렴하지 않는다.
export const chainDelay = (n: number) => 0.35 + 0.65 * (1 - 0.12 / 0.65) ** n;
export const turretDelay = (n: number) => 0.42 + 0.58 * (1 - 0.15 / 0.58) ** n;
export const turretMountDamage = (n: number) => 1 / (1 + (1 / 0.85 - 1) * n + 0.25 * n * Math.max(0, n - 1) / (n + 1));

const pct = (n: number) => Math.round(n * 1000) / 10;
export const CHARACTER_UPGRADES = {
  chainLinks: { path: 'chain', name: '도전선 증설', count: true, text: (n: number) => `최대 연쇄 타격 +${n}회` },
  chainVoltage: { path: 'chain', name: '고전압 축전지', text: (n: number) => `첫 대상 피해 +${pct(0.45 * n)}% · 후속 피해 −${pct(1 - 0.85 ** n)}%` },
  chainSpeed: { path: 'chain', name: '급속 방전', text: (n: number) => `연쇄 발동 간격 −${pct(1 - chainDelay(n))}%` },
  chainFork: { path: 'chain', name: '분기 회로', count: true, minLevel: 8, text: (n: number) => `세 번째 적중에서 분기 +${n * 2}갈래 · 갈래당 원래 피해의 50%` },
  turretMount: { path: 'turret', name: '보조 거치대', count: true, text: (n: number) => `동시 설치 +${n}대 · 한 대의 피해 −${pct(1 - turretMountDamage(n))}%` },
  turretSpeed: { path: 'turret', name: '압축 냉각기', text: (n: number) => `포탑 발사 간격 −${pct(1 - turretDelay(n))}%` },
  turretFrost: { path: 'turret', name: '빙결 탄두', text: (n: number) => `폭발 피해 ${pct(0.35 * n)}% · 폭발 반경 ${Math.round(frostRadius(n))}px · 둔화 ${(n * 0.8).toFixed(1)}초` },
  turretPierce: { path: 'turret', name: '철갑 노즐', count: true, text: (n: number) => `포탑탄 관통 +${n}마리` },
  swordSpeed: { path: 'roan', name: '빠른 회수', text: (n: number) => `공통 공격 간격 −${pct(1 - 0.9 ** n)}%` },
  swordRange: { path: 'roan', name: '장검 손잡이', text: (n: number) => `모든 공격 거리 +${pct(0.12 * n)}% (무기 기본 거리의 최대 148%)` },
  swordArc: { path: 'roan', name: '넓은 베기', text: (n: number) => `베기 각도 +${20 * n}° (360°를 넘친 20°당 거리 +5%) · 레이피어·할버드 찌르기 +${6 * n}° · 단검 폭 +${DAGGER_THRUST.widthPerMastery * n}px (최대 ${DAGGER_THRUST.maxWidth}px)` },
  swordDamage: { path: 'roan', name: '묵직한 일격', text: (n: number) => `모든 검격 피해 +${pct(SWORD.damagePerMastery * n)}% · 공통 공격 간격 +${pct(SWORD.intervalPerDamageMastery * n)}%` },
  swordPierce: { path: 'roan', name: '틈새 베기', text: (n: number) => `모든 검격이 몬스터 피해 저항 ${pct(1 - 0.85 ** n)}% 무시` },
  // ── 로안 기본 무기 전용 (6레벨에 고른 무기) ──
  swordComboDamage: { path: 'roan', form: 'sword', name: '칼날 벌리기', text: (n: number) => `연격 추가 베기 피해 +${pct(0.15 * n)}%p` },
  swordComboCycle: { path: 'roan', form: 'sword', name: '맥을 잇는 검', count: true, text: (n: number) => `연격 주기 −${n}타 (최소 2타)` },
  swordParry: { path: 'roan', form: 'sword', name: '칼날 막기', count: true, text: (n: number) => `베기에 닿은 적 탄 최대 ${n}개 지움` },
  daggerBleed: { path: 'roan', form: 'dagger', name: '깊은 자상', text: (n: number) => `출혈 피해 +${pct(0.2 * n)}%` },
  daggerPoison: { path: 'roan', form: 'dagger', name: '독 바르기', text: (n: number) => `출혈 지속 +${(n).toFixed(1).replace(/\.0$/, '')}초` },
  daggerSpeed: { path: 'roan', form: 'dagger', name: '손놀림', text: (n: number) => `공격 간격 −${pct(1 - 0.9 ** n)}%` },
  maceStun: { path: 'roan', form: 'mace', name: '묵직한 머리', text: (n: number) => `기절 확률 +${pct(0.08 * n)}%p` },
  maceDaze: { path: 'roan', form: 'mace', name: '충격 여운', text: (n: number) => `기절 시간 +${(0.2 * n).toFixed(2).replace(/0$/, '')}초` },
  maceArmor: { path: 'roan', form: 'mace', name: '갑주 가르기', text: (n: number) => `몬스터 피해 저항 무시 +${pct(0.1 * n)}%p` },
  axeArc: { path: 'roan', form: 'waraxe', name: '넓은 날', text: (n: number) => `베기 각도 +${Math.round(20 * n)}°` },
  axeWound: { path: 'roan', form: 'waraxe', name: '벌목꾼', text: (n: number) => `깊은 상처 최대 보너스 +${pct(0.15 * n)}%p` },
  axeSpeed: { path: 'roan', form: 'waraxe', name: '휘두르기 가속', text: (n: number) => `공격 간격 −${pct(1 - 0.92 ** n)}%` },
  // ── 로안 상위 무기 전용 (12레벨에 고른 상위 무기) ──
  onehandSpeed: { path: 'roan', form: 'onehand', name: '가벼운 손목', text: (n: number) => `공격 간격 −${pct(1 - 0.94 ** n)}%` },
  onehandArc: { path: 'roan', form: 'onehand', name: '넓은 연격', text: (n: number) => `연격 추가 베기 각도 +${Math.round(30 * n)}°` },
  greatswordWeight: { path: 'roan', form: 'greatsword', name: '무게 싣기', text: (n: number) => `피해 +${pct(0.12 * n)}%` },
  greatswordReach: { path: 'roan', form: 'greatsword', name: '긴 칼날', text: (n: number) => `거리 +${pct(0.08 * n)}%` },
  rapierCrit: { path: 'roan', form: 'rapier', name: '급소 찌르기', text: (n: number) => `치명타 확률 +${pct(0.06 * n)}%p` },
  rapierPierce: { path: 'roan', form: 'rapier', name: '관통 숙련', count: true, text: (n: number) => `찌르기 관통 +${n}마리` },
  stilettoStacks: { path: 'roan', form: 'stiletto', name: '출혈 심화', count: true, text: (n: number) => `출혈 최대 중첩 +${2 * n}` },
  stilettoVenom: { path: 'roan', form: 'stiletto', name: '칼끝 독', text: (n: number) => `출혈 피해 +${pct(0.15 * n)}%` },
  scimitarArc: { path: 'roan', form: 'scimitar', name: '휘어진 날', text: (n: number) => `베기 각도 +${Math.round(20 * n)}°` },
  scimitarScent: { path: 'roan', form: 'scimitar', name: '피 냄새', text: (n: number) => `출혈 중인 적 직접 피해 +${pct(0.1 * n)}%p` },
  twinCross: { path: 'roan', form: 'twinblades', name: '교차 베기', text: (n: number) => `연타 한 번 피해 +${pct(0.08 * n)}%p` },
  twinChain: { path: 'roan', form: 'twinblades', name: '피의 연쇄', text: (n: number) => `출혈 지속 +${(0.5 * n).toFixed(2).replace(/\.?0+$/, '')}초` },
  warmaceWeight: { path: 'roan', form: 'warmace', name: '철퇴 무게', text: (n: number) => `기절 확률 +${pct(0.06 * n)}%p` },
  warmaceSkull: { path: 'roan', form: 'warmace', name: '머리 강타', text: (n: number) => `기절 시간 +${(0.15 * n).toFixed(2).replace(/\.?0+$/, '')}초` },
  morningSpikes: { path: 'roan', form: 'morningstar', name: '가시 늘리기', count: true, text: (n: number) => `파편 +${n}개` },
  morningSharp: { path: 'roan', form: 'morningstar', name: '날카로운 가시', text: (n: number) => `파편 피해 +${pct(0.1 * n)}%p` },
  flailChain: { path: 'roan', form: 'flail', name: '긴 사슬', text: (n: number) => `회전 반경 +${pct(0.1 * n)}%` },
  flailSpin: { path: 'roan', form: 'flail', name: '가속 회전', text: (n: number) => `연속 공격 반경 보너스 최대 +${pct(0.15 * n)}%p` },
  maulQuake: { path: 'roan', form: 'maul', name: '대지 울림', text: (n: number) => `충격파 반경 +${Math.round(15 * n)}px` },
  maulCrush: { path: 'roan', form: 'maul', name: '짓이기기', text: (n: number) => `충격파 피해 +${pct(0.15 * n)}%` },
  greataxeEdge: { path: 'roan', form: 'greataxe', name: '육중한 날', text: (n: number) => `베기 각도 +${Math.round(20 * n)}°` },
  greataxeInstinct: { path: 'roan', form: 'greataxe', name: '처형 본능', text: (n: number) => `깊은 상처 최대 보너스 +${pct(0.15 * n)}%p` },
  halberdPole: { path: 'roan', form: 'halberd', name: '긴 자루', text: (n: number) => `거리 +${pct(0.1 * n)}%` },
  halberdPush: { path: 'roan', form: 'halberd', name: '밀어내기', text: (n: number) => `밀쳐내는 거리 +${pct(0.3 * n)}%` },
  throwSpin: { path: 'roan', form: 'throwingaxe', name: '회전력', text: (n: number) => `투척 피해 +${pct(0.15 * n)}%p` },
  throwReturn: { path: 'roan', form: 'throwingaxe', name: '빠른 회수', count: true, text: (n: number) => `투척 주기 −${n}타 (최소 매 공격)` },
} as const satisfies Record<string, { path: LumenWeapon | 'roan'; name: string; text: (n: number) => string; count?: true; minLevel?: number; form?: string }>;

export type CharacterUpgradeId = keyof typeof CHARACTER_UPGRADES;
export const CHARACTER_UPGRADE_IDS = Object.keys(CHARACTER_UPGRADES) as CharacterUpgradeId[];

export function characterUpgradeValue(id: CharacterUpgradeId, grade: GradeId): number {
  const def = CHARACTER_UPGRADES[id];
  const index = GRADE_INDEX[grade];
  return 'count' in def ? (index >= 2 ? 2 : 1) : GRADES[index].mult;
}

export function frostRadius(strength: number): number {
  return 42 + strength * 6;
}
