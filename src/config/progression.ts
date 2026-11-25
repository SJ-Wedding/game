/**
 * 경험치 곡선과 레벨업 선택지.
 * 레벨 L → L+1 에 필요한 경험치 = round((xpBase + xpGrowth × (L-1)^xpExponent) × earlyScale[L-1])
 */
export const PROGRESSION_CONFIG = {
  xpBase: 22,
  xpGrowth: 4.6,
  xpExponent: 1.3,
  /**
   * 초반 레벨업 필요 경험치 배율. index 0 = Lv1→2. 목록보다 높은 레벨은 1.0.
   * Lv1 은 0.36, Lv2~5 는 절반, Lv6~9 는 0.6→0.9 로 서서히 원래대로 돌아온다.
   */
  earlyScale: [0.36, 0.5, 0.5, 0.5, 0.5, 0.6, 0.7, 0.8, 0.9] as readonly number[],
  /** 판마다 기본으로 주는 레벨업 선택지 새로고침 횟수 (영구 강화로 추가) */
  baseRerolls: 2,
  /** 레벨업 때 보여주는 강화 후보 수 */
  choiceCount: 3,
  /** 끌려오는 경험치 보석 속도(px/초) */
  gemMagnetSpeed: 560,
  /** 후보가 없을 때 대신 나오는 선택지 */
  fallback: {
    id: 'recover',
    name: '응급 처치',
    description: '체력을 30 회복합니다.',
    heal: 30,
  },
} as const;

const XP_VISUALS = [
  { min: 40, color: 0xffd474, size: 11 },
  { min: 10, color: 0xff9ecb, size: 9 },
  { min: 4, color: 0xc3a3ff, size: 8 },
  { min: 3, color: 0x79c9ff, size: 7 },
] as const;
const XP_DEFAULT_VISUAL = { color: 0x7cf4aa, size: 6 } as const;

export function xpVisual(amount: number): { color: number; size: number } {
  for (const tier of XP_VISUALS) if (amount >= tier.min) return tier;
  return XP_DEFAULT_VISUAL;
}
