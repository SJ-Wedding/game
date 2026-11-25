import { GRADES, GRADE_INDEX, type GradeId } from './grades';

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

/** 6레벨에 공격 타입 5종 중 1종만 고른다 */
export const SWORD_FORM_LEVELS: readonly number[] = [6];
export const SWORD_FORMS = {
  swordCrescent: { name: '반월 연격', symbol: '☾', color: 0x85e8d7, damage: 0.60, angle: SWORD.angle, followupDamage: 0.55, followupDelay: 0.15 },
  swordCrush: { name: '강철 파쇄', symbol: '◆', color: 0xffb16d, damage: 2.00, angle: 70, maxAngle: 150, armorPierce: 0.25 },
  swordGuard: { name: '근위 검무', symbol: '◔', color: 0xbe9bff, damage: 0.80, angle: 270, range: 1.00 },
  swordWave: {
    name: '검기 발사', symbol: '☽', color: 0x9fd6ff, damage: 0.80, angle: SWORD.angle, interval: 1.1,
    wave: { range: 300, width: 28, pierce: 3, damage: 0.90, speed: 620 },
  },
  swordExecute: { name: '처형 베기', symbol: '⚰', color: 0xff6f7d, damage: 1.40, angle: 200, threshold: 0.25, strongThreshold: 0.30, strongBonus: 1.3 },
} as const;
export type SwordFormId = keyof typeof SWORD_FORMS;
export const SWORD_FORM_IDS = Object.keys(SWORD_FORMS) as SwordFormId[];

export const SWORD_FORM_DESCRIPTIONS: Record<SwordFormId, string> = {
  swordCrescent: '전방을 두 번 벱니다. 첫 베기 피해 60%, 0.15초 뒤 두 번째 베기 피해 55%.',
  swordCrush: '전방 70°를 내려찍습니다. 피해 200%, 몬스터 피해 저항 25% 무시.',
  swordGuard: '몸 주위 270°를 휩씁니다. 피해 80%.',
  swordWave: '베기(피해 80%)마다 전방으로 검기를 날립니다. 사거리 300px, 두께 28px, 적 3마리 관통, 피해 90%. 공격 간격 +10%.',
  swordExecute: '전방 200°를 벱니다. 피해 140%. 체력 25% 이하 일반 적은 즉사, 보스·균열 수호자는 체력 30% 이하일 때 피해 +30%.',
};

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
  swordRange: { path: 'roan', name: '장검 손잡이', text: (n: number) => `모든 검격 거리 +${pct(0.12 * n)}% (기준 거리 최대 ${SWORD.maxRange}px)` },
  swordArc: { path: 'roan', name: '넓은 베기', text: (n: number) => `검격 각도 +${20 * n}° (한도를 넘친 20°당 거리 +5%) · 검기 발사는 검기 두께 +${pct(0.2 * n)}%` },
  swordDamage: { path: 'roan', name: '묵직한 일격', text: (n: number) => `모든 검격 피해 +${pct(SWORD.damagePerMastery * n)}% · 공통 공격 간격 +${pct(SWORD.intervalPerDamageMastery * n)}%` },
  swordPierce: { path: 'roan', name: '틈새 베기', text: (n: number) => `모든 검격이 몬스터 피해 저항 ${pct(1 - 0.85 ** n)}% 무시` },
  swordWavePierce: { path: 'roan', form: 'swordWave', name: '검기 관통', count: true, text: (n: number) => `검기 관통 +${n}마리` },
  swordWaveRange: { path: 'roan', form: 'swordWave', name: '먼 검기', text: (n: number) => `검기 사거리 +${pct(0.15 * n)}%` },
  swordExecuteLine: { path: 'roan', form: 'swordExecute', name: '처형선', text: (n: number) => `즉사 기준 +${pct(Math.min(0.15, 0.03 * n))}%p (최대 +15%p)` },
  swordExecuteBlast: { path: 'roan', form: 'swordExecute', name: '처형 여파', text: (n: number) => `처형한 자리 반경 60px에 피해 ${pct(0.3 * n)}%` },
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
