import type { UpgradeId } from './upgrades';

/**
 * 개발 모드 전용 설정. (?dev=1 또는 npm run dev 에서만 사용)
 * "보스 직전 시작" 시 적용되는 대표 빌드. 보스전을 빠르게 검증하기 위한 고정 강화와 레벨.
 */
export const DEV_CONFIG = {
  /** 보스 직전 시작 시각 = bossAt - bossLeadTime */
  bossLeadTime: 5,
  bossPreset: {
    level: 19,
    upgrades: {
      rapid: 3,
      split: 2,
      power: 3,
      vitality: 2,
      regen: 1,
      guard: 2,
      swift: 2,
      evasion: 2,
      magnet: 1,
    } as Partial<Record<UpgradeId, number>>,
  },
};
