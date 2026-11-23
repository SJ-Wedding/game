import { PROGRESSION_CONFIG } from '../config/progression';

/** 레벨 level 에서 다음 레벨까지 필요한 경험치 */
export function xpToNext(level: number): number {
  const { xpBase, xpGrowth, xpExponent } = PROGRESSION_CONFIG;
  return Math.round(xpBase + xpGrowth * Math.pow(Math.max(0, level - 1), xpExponent));
}
