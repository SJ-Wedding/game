/**
 * 일반 적 3종 + 엘리트 1종의 능력치.
 * hp/contactDamage 등은 "0분 기준" 값이며 ENEMY_SCALING에 따라 시간이 지날수록 강해진다.
 */
export type NormalEnemyKind = 'chaser' | 'charger' | 'spitter';
export type EnemyKind = NormalEnemyKind | 'elite';

export interface EnemyBaseConfig {
  /** 화면·결과에 표시되는 이름 */
  name: string;
  hp: number;
  /** 이동 속도(px/초) */
  speed: number;
  /** 충돌 반지름(px) */
  radius: number;
  /** 몸에 닿았을 때 피해 */
  contactDamage: number;
  /** 처치 시 떨어뜨리는 경험치 */
  xp: number;
  /** 사망 원인 표시에 쓰는 공격 이름 */
  attackNames: Record<string, string>;
}

export interface ChaserConfig extends EnemyBaseConfig {}

export interface ChargerConfig extends EnemyBaseConfig {
  /** 플레이어가 이 거리 안에 들어오면 돌진 준비 */
  triggerRange: number;
  /** 돌진 예고(조준선 표시) 시간(초). 늘리면 피하기 쉬워진다. */
  windup: number;
  dashSpeed: number;
  dashTime: number;
  dashDamage: number;
  /** 돌진 후 멈춰 있는 시간(초) */
  recover: number;
  /** 다음 돌진까지 대기(초) */
  cooldown: number;
}

export interface SpitterConfig extends EnemyBaseConfig {
  /** 유지하려는 거리 [최소, 최대] */
  preferredRange: [number, number];
  /** 이 거리 안이면 발사 */
  fireRange: number;
  fireInterval: number;
  /** 발사 전 부풀어 오르는 예고 시간(초) */
  windup: number;
  projectileSpeed: number;
  projectileDamage: number;
  projectileRadius: number;
}

export interface EliteConfig extends EnemyBaseConfig {
  attackInterval: number;
  chargeWindup: number;
  dashSpeed: number;
  dashTime: number;
  dashDamage: number;
  recover: number;
  burstWindup: number;
  burstCount: number;
  burstSpeed: number;
  burstDamage: number;
  projectileRadius: number;
}

export const ENEMY_CONFIG: {
  chaser: ChaserConfig;
  charger: ChargerConfig;
  spitter: SpitterConfig;
  elite: EliteConfig;
} = {
  chaser: {
    name: '그림자 망령',
    hp: 15,
    speed: 92,
    radius: 13,
    contactDamage: 8,
    xp: 1,
    attackNames: { contact: '그림자 망령의 접촉' },
  },
  charger: {
    name: '뿔 돌격수',
    hp: 42,
    speed: 76,
    radius: 16,
    contactDamage: 9,
    xp: 4,
    triggerRange: 360,
    windup: 0.8,
    dashSpeed: 600,
    dashTime: 0.7,
    dashDamage: 18,
    recover: 0.7,
    cooldown: 2.8,
    attackNames: { contact: '뿔 돌격수의 접촉', dash: '뿔 돌격수의 돌진' },
  },
  spitter: {
    name: '가시 포자',
    hp: 30,
    speed: 72,
    radius: 14,
    contactDamage: 6,
    xp: 3,
    preferredRange: [300, 430],
    fireRange: 560,
    fireInterval: 3.0,
    windup: 0.5,
    projectileSpeed: 230,
    projectileDamage: 8,
    projectileRadius: 8,
    attackNames: { contact: '가시 포자의 접촉', shot: '가시 포자의 독침' },
  },
  elite: {
    name: '균열 수호자',
    hp: 700,
    speed: 84,
    radius: 30,
    contactDamage: 15,
    xp: 40,
    attackInterval: 3.0,
    chargeWindup: 0.9,
    dashSpeed: 700,
    dashTime: 0.6,
    dashDamage: 24,
    recover: 0.8,
    burstWindup: 0.8,
    burstCount: 14,
    burstSpeed: 210,
    burstDamage: 12,
    projectileRadius: 9,
    attackNames: {
      contact: '균열 수호자의 접촉',
      dash: '균열 수호자의 돌진',
      burst: '균열 수호자의 파편',
    },
  },
};

/**
 * 시간 경과에 따른 적 강화. 등장 시각(분) × 비율만큼 더해진다.
 * 예) hpPerMinute 0.1 이면 10분에 등장한 적의 체력은 기본값의 2배.
 */
export const ENEMY_SCALING = {
  hpPerMinute: 0.09,
  armorAt: 540,
  basicResistance: 0.30,
  damagePerMinute: 0.02,
} as const;
