import type { StatKey } from './player';

/**
 * 영구 성장(메타 진행): 판이 끝나면 토큰을 받고, 타이틀의 '강화 상점'에서 영구 강화를 산다.
 * 영구 강화는 시작 능력치에 먼저 곱해지고, 그 위에 이번 판 강화가 적용된다.
 */

/** 판 종료 시 토큰 지급 */
export const TOKEN_REWARDS = {
  /** 생존 1분(전투 시간)마다 */
  perMinute: 2,
  /** 처치 kills 마리마다 1개 (엘리트·보스 제외 일반 처치 수 기준) */
  killsPerToken: 50,
  /** 엘리트 1마리 처치마다 */
  perElite: 5,
  /** 보스 처치(승리) 보너스 */
  victory: 30,
};

/** 영구 능력치 강화. 단계마다 pctPerLevel 만큼 시작 능력치가 변한다 (음수 = 감소) */
export interface MetaStatDef {
  id: string;
  name: string;
  stat: StatKey;
  pctPerLevel: number;
  pctByLevel?: readonly number[];
  maxLevel: number;
  /** 단계별 가격 (길이 = maxLevel) */
  costs: number[];
}

const STAT_COSTS = [10, 15, 22, 32, 45];

export const META_STATS: MetaStatDef[] = [
  { id: 'hp', name: '최대 체력', stat: 'maxHp', pctPerLevel: 0.05, maxLevel: 5, costs: STAT_COSTS },
  { id: 'damage', name: '공격력', stat: 'damage', pctPerLevel: 0.04, maxLevel: 5, costs: STAT_COSTS },
  { id: 'fireRate', name: '공격 속도', stat: 'fireRate', pctPerLevel: 0.04, maxLevel: 5, costs: STAT_COSTS },
  { id: 'moveSpeed', name: '이동 속도', stat: 'moveSpeed', pctPerLevel: 0.03, maxLevel: 5, costs: STAT_COSTS },
  { id: 'dodge', name: '회피 재사용 대기시간', stat: 'dodgeCooldown', pctPerLevel: -0.03, maxLevel: 5, costs: STAT_COSTS },
  { id: 'pickup', name: '경험치 흡수 범위', stat: 'pickupRadius', pctPerLevel: 0.1, maxLevel: 5, costs: STAT_COSTS },
  { id: 'xp', name: '경험치 획득', stat: 'xpGain', pctPerLevel: 0.12, pctByLevel: [0.12, 0.19, 0.25, 0.30, 0.35], maxLevel: 5, costs: STAT_COSTS },
];

/** 해금 (능력치 외 기능) */
export type MetaUnlockId = 'reroll' | 'revive' | 'startPick' | 'luck';

export interface MetaUnlockDef {
  id: MetaUnlockId;
  name: string;
  description: string;
  maxLevel: number;
  costs: number[];
}

export const META_UNLOCKS: MetaUnlockDef[] = [
  { id: 'reroll', name: '선택지 새로고침 +1', description: '한 판에 쓸 수 있는 레벨업 새로고침 횟수 +1', maxLevel: 2, costs: [40, 80] },
  { id: 'revive', name: '부활', description: '한 판에 한 번, 쓰러지면 체력 50%로 일어납니다', maxLevel: 1, costs: [100] },
  { id: 'startPick', name: '시작 강화', description: '전투 시작 시 강화 1개를 골라 시작합니다', maxLevel: 1, costs: [60] },
  { id: 'luck', name: '행운', description: '단계마다 행운 +1. 일반 강화와 특수 무기의 희귀 이상 등급 확률이 높아집니다.', maxLevel: 5, costs: [50, 100, 130, 160, 200] },
];

/**
 * 밸런스 기준 영구 강화 (토큰 145개 사용, 3~5판 정도 플레이한 상태).
 * 시뮬레이션(npm run sim)과 밸런스 회귀 테스트는 이 상태로 "8분 30초~10분 승리"를 맞춘다.
 */
export const BALANCE_REFERENCE_META: Record<string, number> = {
  hp: 2,
  damage: 2,
  fireRate: 2,
  moveSpeed: 1,
  pickup: 1,
  xp: 1,
  reroll: 1,
};
