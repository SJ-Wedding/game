/**
 * 경험치 곡선과 레벨업 선택지.
 * 레벨 L → L+1 에 필요한 경험치 = round(xpBase + xpGrowth × (L-1)^xpExponent)
 */
export const PROGRESSION_CONFIG = {
  xpBase: 22,
  xpGrowth: 4.6,
  xpExponent: 1.3,
  /** 레벨업 때 보여주는 강화 후보 수 */
  choiceCount: 3,
  /** 끌려오는 경험치 보석 속도(px/초) */
  gemMagnetSpeed: 560,
  /** 모든 강화가 최대 중첩일 때 대신 나오는 선택지 */
  fallback: {
    id: 'recover',
    name: '응급 처치',
    description: '체력을 30 회복합니다.',
    heal: 30,
  },
} as const;
