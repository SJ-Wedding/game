/**
 * 플레이어 기본 능력치. 강화(upgrades.ts)는 이 값에 더하거나 곱해진다.
 */
export const PLAYER_BASE_STATS = {
  /** 최대 체력 */
  maxHp: 100,
  /** 이동 속도(px/초) */
  moveSpeed: 220,
  /** 투사체 1발 피해량 */
  damage: 12,
  /** 초당 공격 횟수 */
  fireRate: 2.4,
  /** 한 번 공격할 때 나가는 투사체 수 */
  projectileCount: 1,
  /** 여러 발일 때 투사체 사이 각도(도) */
  spreadDeg: 9,
  /** 투사체 속도(px/초) */
  projectileSpeed: 660,
  /** 투사체 사거리(px). 사거리 / 속도 = 투사체 수명 */
  projectileRange: 580,
  /** 투사체 반지름(px) */
  projectileRadius: 6,
  /** 회피 재사용 대기시간(초) */
  dodgeCooldown: 2.4,
  /** 회피(대시) 지속 시간(초) */
  dodgeDuration: 0.2,
  /** 회피 중 이동 속도(px/초) */
  dodgeSpeed: 680,
  /** 회피 시작부터 무적인 시간(초). 회피 지속시간보다 약간 길게 둔다. */
  dodgeInvuln: 0.32,
  /** 피격 후 무적 시간(초) */
  hurtInvuln: 0.6,
  /** 초당 체력 재생량 */
  regen: 0,
  /** 받는 피해 배율 (1 = 100%) */
  damageTaken: 1,
  /** 경험치 보석을 끌어당기는 거리(px) */
  pickupRadius: 95,
};

export type StatKey = keyof typeof PLAYER_BASE_STATS;
export type PlayerStats = Record<StatKey, number>;

/** 능력치와 무관한 플레이어 고정 값 */
export const PLAYER_BODY = {
  /** 충돌 반지름(px) */
  radius: 14,
} as const;

/**
 * 자동 전투. enabled 가 true 면 마우스 조준·클릭 없이
 * 사거리(range) 안의 가장 가까운 적(보스 포함)을 자동으로 조준하고 계속 공격한다.
 * false 로 바꾸면 마우스 조준 + 좌클릭 유지 공격 방식으로 돌아간다.
 */
export const AUTO_COMBAT = {
  enabled: true,
  /** 자동 조준 거리(px, 적 몸 가장자리 기준). 투사체 사거리보다 약간 짧게 둔다. */
  range: 540,
};
