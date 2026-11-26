import { MONSTER_STAT_MULTIPLIERS } from './enemies';

/**
 * 보스 '잿불 군주'. 등장 시각은 run.ts 의 bossAt.
 * [1페이즈 값, 2페이즈 값] 형태의 배열은 체력이 phase2At 비율 이하로 떨어지면 두 번째 값을 쓴다.
 */
export type BossPattern = 'ring' | 'charge' | 'meteor' | 'summon';

export const BOSS_CONFIG = {
  name: '잿불 군주',
  /** 보스 체력. 보스전 길이(= 승리 시각)를 결정하는 가장 중요한 값 */
  hp: 10500 * MONSTER_STAT_MULTIPLIERS.health,
  basicResistance: 0.25,
  radius: 54,
  speed: 72,
  contactDamage: 20 * MONSTER_STAT_MULTIPLIERS.attack,
  /** 등장 연출 시간(초). 이 동안은 무적이며 공격하지 않는다. */
  enterTime: 1.6,
  /** 이 비율 이하 체력이 되면 2페이즈 */
  phase2At: 0.6,
  /** 페이즈 전환 연출(무적) 시간(초) */
  phaseShiftTime: 1.2,
  /** 공격 사이 대기(초) [1페이즈, 2페이즈] */
  attackCooldown: [1.5, 0.9] as [number, number],
  /** 페이즈별 사용 패턴 */
  patterns: {
    1: ['ring', 'charge', 'meteor'] as BossPattern[],
    2: ['ring', 'charge', 'meteor', 'summon'] as BossPattern[],
  },
  /** 불씨 고리: 보스 주위에 원형 탄막 */
  ring: {
    windup: 0.9,
    bullets: [20, 34] as [number, number],
    waves: [1, 3] as [number, number],
    waveGap: 0.4,
    speed: 190,
    damage: 14 * MONSTER_STAT_MULTIPLIERS.attack,
    radius: 9,
  },
  /** 돌진: 조준선 예고 후 직선 돌진 */
  charge: { windup: 1.0, speed: 820, time: 0.65, recover: 0.6, damage: 26 * MONSTER_STAT_MULTIPLIERS.attack },
  /** 낙화: 플레이어 주변에 원형 장판 예고 후 폭발 */
  meteor: {
    count: [4, 8] as [number, number],
    radius: 85,
    delay: 1.2,
    damage: 22 * MONSTER_STAT_MULTIPLIERS.attack,
    spread: 200,
    castTime: 0.5,
  },
  /** 소환(2페이즈): 탄막과 함께 전투에 합류하는 혼성 증원 */
  summon: { kinds: ['chaser', 'charger', 'spitter', 'charger', 'spitter', 'chaser'] as const, castTime: 0.6 },
  attackNames: {
    contact: '잿불 군주의 접촉',
    ring: '잿불 군주의 불씨 고리',
    charge: '잿불 군주의 돌진',
    meteor: '잿불 군주의 낙화',
  },
};
