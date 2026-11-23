/**
 * 레벨업 보상 등급. 카드마다 등급을 뽑고, 등급 배율만큼 효과가 커진다.
 * weights: 기본 확률 가중치. 행운(luck) 1 마다 luckShift 만큼 일반 → 상위 등급으로 옮겨진다.
 */
export type GradeId = 'common' | 'rare' | 'epic' | 'legendary';

export interface GradeDef {
  id: GradeId;
  name: string;
  /** 효과 배율 */
  mult: number;
  /** 기본 가중치(%) */
  weight: number;
  /** 행운 1 당 가중치 변화 */
  luckShift: number;
  /** 카드 테두리 색 (CSS) */
  color: string;
}

export const GRADES: GradeDef[] = [
  { id: 'common', name: '일반', mult: 1.0, weight: 65, luckShift: -6, color: '#9aa0b5' },
  { id: 'rare', name: '희귀', mult: 1.5, weight: 25, luckShift: 3.5, color: '#4ea3ff' },
  { id: 'epic', name: '영웅', mult: 2.0, weight: 8, luckShift: 1.8, color: '#b36bff' },
  { id: 'legendary', name: '전설', mult: 3.0, weight: 2, luckShift: 0.7, color: '#ffc43d' },
];

export const GRADE_INDEX: Record<GradeId, number> = { common: 0, rare: 1, epic: 2, legendary: 3 };

export const GRADE_CONFIG = {
  /** 레벨이 오를수록 행운 증가: 행운 += (레벨 - 1) × luckPerLevel */
  luckPerLevel: 0.06,
  /** 일반 등급 최소 가중치 (행운이 아무리 높아도 이 아래로 내려가지 않음) */
  minCommonWeight: 20,
};
