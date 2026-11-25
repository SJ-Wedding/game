/**
 * 로안 무기 타입 (로안 무기 타입 개편 기획안).
 * 6레벨에 기본 무기 4종 중 하나, 12레벨에 그 무기의 상위 무기, 18레벨에 상위 무기 각성.
 * 피해·간격은 검(검 피해 계수 SWORD.damage, 간격 SWORD.interval) 대비 배율, 거리는 px, 각도는 도.
 */

export const ROAN_GEAR_LEVELS = { weapon: 6, upgrade: 12, awaken: 18 } as const;
export const DAGGER_THRUST = { damage: 0.35, range: 80, width: 10, widthPerMastery: 2, maxWidth: 24, duration: 0.18 } as const;
export const TWIN_BLADE_DAMAGE_FACTOR = 0.6;

export type RoanMotion = 'slash' | 'thrust' | 'slam' | 'spin' | 'twin';

export interface RoanWeaponDef {
  name: string;
  symbol: string;
  color: number;
  damage: number;
  interval: number;
  range: number;
  angle: number;
  /** 시작 최대 체력 (검 160 기준) */
  maxHp: number;
  /** 받는 피해 배율 */
  damageTaken: number;
  /** 이동 속도 배율 */
  moveSpeed: number;
  /** 회피 대기시간 (초) */
  dodgeCooldown: number;
  motion: RoanMotion;
  special: string;
  description: string;
}

export const ROAN_WEAPONS = {
  sword: {
    name: '검', symbol: '†', color: 0xd9e4f2, damage: 1.0, interval: 1.0, range: 125, angle: 130,
    maxHp: 160, damageTaken: 1.0, moveSpeed: 1.0, dodgeCooldown: 3.0, motion: 'slash',
    special: '연격: 3번째 공격마다 추가 베기(피해 50%)',
    description: '균형 잡힌 검. 거리 125px, 각도 130°.',
  },
  dagger: {
    name: '단검', symbol: '⸸', color: 0xc78cff, damage: DAGGER_THRUST.damage, interval: 0.55, range: DAGGER_THRUST.range, angle: 0,
    maxHp: 150, damageTaken: 1.05, moveSpeed: 1.12, dodgeCooldown: 2.4, motion: 'thrust',
    special: '출혈: 맞은 적에게 3초간 초당 검 피해 15%, 최대 5중첩',
    description: `빠른 직선 찌르기. 피해 ${DAGGER_THRUST.damage * 100}%, 공격 간격 55%, 거리 ${DAGGER_THRUST.range}px·폭 ${DAGGER_THRUST.width}px. 체력 150, 받는 피해 +5%, 이동 속도 +12%, 회피 2.4초.`,
  },
  mace: {
    name: '메이스(한손)', symbol: '⚒', color: 0xffc06e, damage: 1.2, interval: 1.2, range: 125, angle: 110,
    maxHp: 240, damageTaken: 0.85, moveSpeed: 0.94, dodgeCooldown: 3.4, motion: 'slam',
    special: '분쇄: 몬스터 피해 저항 30% 무시. 일반 적 35% 확률로 0.6초 기절 (균열 수호자는 절반 확률)',
    description: '묵직한 한손 메이스. 피해 120%, 공격 간격 120%, 각도 110°. 체력 240, 받는 피해 −15%, 이동 속도 −6%, 회피 3.4초.',
  },
  waraxe: {
    name: '도끼', symbol: '⚔', color: 0xff8f6b, damage: 1.4, interval: 1.5, range: 130, angle: 160,
    maxHp: 230, damageTaken: 0.85, moveSpeed: 0.92, dodgeCooldown: 3.6, motion: 'slash',
    special: '깊은 상처: 적 체력이 낮을수록 피해 증가, 최대 +50%',
    description: '넓게 휘두르는 도끼. 피해 140%, 공격 간격 150%, 각도 160°, 거리 130px. 체력 230, 받는 피해 −15%, 이동 속도 −8%, 회피 3.6초.',
  },
} as const satisfies Record<string, RoanWeaponDef>;

export type RoanWeaponId = keyof typeof ROAN_WEAPONS;
export const ROAN_WEAPON_IDS = Object.keys(ROAN_WEAPONS) as RoanWeaponId[];

export interface RoanUpgradeDef {
  weapon: RoanWeaponId;
  name: string;
  symbol: string;
  /** 검 기준 최종 배율 */
  damage: number;
  interval: number;
  range: number;
  angle: number;
  motion: RoanMotion;
  effect: string;
  awaken: string;
}

export const ROAN_UPGRADES = {
  onehand: {
    weapon: 'sword', name: '한손검', symbol: '†', damage: 1.0, interval: 0.8, range: 125, angle: 130, motion: 'slash',
    effect: '공격 간격 −20%, 연격이 2번째 공격마다 발동', awaken: '연격 추가 베기 피해 50% → 90%',
  },
  greatsword: {
    weapon: 'sword', name: '대검', symbol: '✝', damage: 1.6, interval: 1.3, range: 150, angle: 180, motion: 'slash',
    effect: '피해 +60%, 180°, 거리 +20%, 공격 간격 +30%', awaken: '연격 추가 베기가 360° 회전 베기',
  },
  rapier: {
    weapon: 'sword', name: '레이피어', symbol: '⟊', damage: 1.0, interval: 0.6, range: 200, angle: 30, motion: 'thrust',
    effect: '찌르기(30°, 거리 +60%), 공격 간격 −40%, 적 3마리 관통, 치명타 25%(피해 2배)', awaken: '치명타 40%, 치명타 시 추가 찌르기(피해 50%)',
  },
  stiletto: {
    weapon: 'dagger', name: '단검', symbol: '⸸', damage: DAGGER_THRUST.damage, interval: 0.55, range: DAGGER_THRUST.range, angle: 0, motion: 'thrust',
    effect: '출혈 최대 5 → 8중첩, 출혈 피해 +50%', awaken: '출혈이 최대 중첩에 닿으면 남은 출혈 피해를 한 번에 줌',
  },
  scimitar: {
    weapon: 'dagger', name: '시미터', symbol: '☾', damage: 0.45, interval: 0.55, range: 110, angle: 150, motion: 'slash',
    effect: '베기 150°, 출혈 중인 적에게 직접 피해 +30%', awaken: '출혈 중인 적을 처치하면 출혈이 주변 2마리에 번짐',
  },
  twinblades: {
    weapon: 'dagger', name: '쌍검', symbol: '⚔', damage: DAGGER_THRUST.damage * TWIN_BLADE_DAMAGE_FACTOR,
    interval: 0.55, range: DAGGER_THRUST.range, angle: 0, motion: 'twin',
    effect: `직선 찌르기 2연타 (거리 ${DAGGER_THRUST.range}px·폭 ${DAGGER_THRUST.width}px, 각 단검 피해 ${TWIN_BLADE_DAMAGE_FACTOR * 100}%). 출혈 2배 누적, 중첩 제한 해제.`, awaken: '직선 찌르기 3연타',
  },
  warmace: {
    weapon: 'mace', name: '메이스', symbol: '⚒', damage: 1.56, interval: 1.2, range: 125, angle: 140, motion: 'slam',
    effect: '피해 +30%, 각도 140°, 기절 확률 35% → 50% (균열 수호자 25%)', awaken: '기절한 적에게 피해 +40%',
  },
  morningstar: {
    weapon: 'mace', name: '모닝스타', symbol: '✹', damage: 1.2, interval: 1.2, range: 125, angle: 110, motion: 'slam',
    effect: '적중 시 가시 파편 3개(각 피해 40%)', awaken: '파편 5개, 파편도 기절 판정',
  },
  flail: {
    weapon: 'mace', name: '플레일', symbol: '◎', damage: 1.2, interval: 1.2, range: 125, angle: 360, motion: 'spin',
    effect: '타격 지점을 중심으로 철퇴가 360° 돌며 주변을 때림, 연속 공격할수록 회전 반경 증가(최대 +40%)', awaken: '회전이 2바퀴, 두 번째 피해 50%',
  },
  maul: {
    weapon: 'mace', name: '양손메이스', symbol: '▼', damage: 2.16, interval: 1.68, range: 125, angle: 110, motion: 'slam',
    effect: '피해 +80%, 내려찍기 충격파 반경 100px(피해 50%), 공격 간격 +40%', awaken: '충격파 반경 150px, 충격파에도 기절',
  },
  greataxe: {
    weapon: 'waraxe', name: '대형 도끼', symbol: '⚔', damage: 1.96, interval: 1.8, range: 130, angle: 220, motion: 'slash',
    effect: '220°, 피해 +40%, 공격 간격 +20%', awaken: '깊은 상처 최대 +50% → +100%',
  },
  halberd: {
    weapon: 'waraxe', name: '할버드', symbol: '⫯', damage: 1.4, interval: 1.5, range: 188, angle: 160, motion: 'thrust',
    effect: '거리 +50%, 찌르기와 베기를 번갈아, 일반 적 밀쳐내기', awaken: '베기 180°, 찌르기 폭 2배',
  },
  throwingaxe: {
    weapon: 'waraxe', name: '투척 도끼', symbol: '⟲', damage: 0.75, interval: 0.7, range: 115, angle: 130, motion: 'twin',
    effect: '한손 도끼 2자루: 거리 115px, 공격 간격 0.7, 3번째 공격마다 도끼를 던져 300px에서 돌아옴(피해 80%)', awaken: '매 2번째 공격마다 투척, 돌아올 때도 피해',
  },
} as const satisfies Record<string, RoanUpgradeDef>;

export type RoanUpgradeId = keyof typeof ROAN_UPGRADES;
export const ROAN_UPGRADE_IDS = Object.keys(ROAN_UPGRADES) as RoanUpgradeId[];
export const roanUpgradesOf = (weapon: RoanWeaponId) => ROAN_UPGRADE_IDS.filter((id) => ROAN_UPGRADES[id].weapon === weapon);

/** 로안 장비 선택 (6레벨 무기 · 12레벨 상위 무기 · 18레벨 각성) */
export type RoanGearChoice =
  | { stage: 'weapon'; id: RoanWeaponId }
  | { stage: 'upgrade'; id: RoanUpgradeId }
  | { stage: 'awaken'; id: RoanUpgradeId };

/** 장비별 디자인 키 (스프라이트·휘두르기 모션) */
export type RoanDesign = 'base' | RoanWeaponId | RoanUpgradeId;
export const ROAN_DESIGNS: readonly RoanDesign[] = ['base', ...ROAN_WEAPON_IDS, ...ROAN_UPGRADE_IDS];
