import type { FusionId, WeaponId } from '../config/weapons';
import type { RelicId, RelicSource } from '../config/relics';
import type { EnemyKind } from '../config/enemies';
import type { DropKind } from '../config/drops';
import type { GradeId } from '../config/grades';
import type { UpgradeDef, UpgradeId } from '../config/upgrades';

/** 한 틱 동안의 플레이어 입력. 이동은 -1..1, 조준은 월드 좌표. */
export interface InputState {
  moveX: number;
  moveY: number;
  aimX: number;
  aimY: number;
  /** 좌클릭 유지 */
  fire: boolean;
  /** 회피 키를 이번 프레임에 눌렀는가 (한 번만 소비됨) */
  dodge: boolean;
}

export const IDLE_INPUT: InputState = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, dodge: false };

export interface Player {
  x: number;
  y: number;
  r: number;
  hp: number;
  /** 남은 무적 시간 */
  invuln: number;
  /** 남은 회피(대시) 시간 */
  dodgeTime: number;
  /** 남은 회피 재사용 대기시간 */
  dodgeCd: number;
  dodgeDx: number;
  dodgeDy: number;
  fireCd: number;
  /** 조준 각도(라디안) */
  aim: number;
  facingLeft: boolean;
  /** 피격 연출용 */
  hurtFlash: number;
}

export type EnemyState =
  | 'move'
  | 'windup' // 돌진 예고
  | 'dash'
  | 'recover'
  | 'aim' // 원거리형 발사 예고
  | 'burstWindup'; // 엘리트 원형 탄막 예고

export interface Enemy {
  id: number;
  kind: EnemyKind;
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  speed: number;
  slowUntil: number;
  rootedUntil: number;
  fireSlowUntil: number;
  /** 시간 경과 피해 배율 */
  dmgMul: number;
  xp: number;
  basicResistance: number;
  state: EnemyState;
  /** 현재 상태 남은 시간 */
  timer: number;
  /** 다음 공격까지 */
  cd: number;
  /** 고정된 돌진 방향 */
  dx: number;
  dy: number;
  flash: number;
  /** 엘리트 패턴 교대용 */
  attackIndex: number;
  dead: boolean;
}

export type BossState =
  | 'enter'
  | 'idle'
  | 'ringWindup'
  | 'ringFire'
  | 'chargeWindup'
  | 'charge'
  | 'recover'
  | 'cast'
  | 'phaseShift';

export interface Boss {
  x: number;
  y: number;
  r: number;
  hp: number;
  maxHp: number;
  phase: 1 | 2;
  state: BossState;
  timer: number;
  cd: number;
  dx: number;
  dy: number;
  wavesLeft: number;
  waveIndex: number;
  lastPattern: string | null;
  flash: number;
  dead: boolean;
}

export interface Projectile {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  damage: number;
  life: number;
  /** 적 투사체의 사망 원인 표시용 */
  source: string;
  pierceLeft?: number;
  hitIds?: Set<number>;
}

/** 지연 폭발 장판 (보스 낙화). 그 자체가 공격 예고다. */
export interface Hazard {
  x: number;
  y: number;
  r: number;
  t: number;
  dur: number;
  damage: number;
  source: string;
}

export interface Gem {
  x: number;
  y: number;
  value: number;
  pulled: boolean;
}

/** 바닥에 떨어진 아이템 */
export interface Pickup {
  x: number;
  y: number;
  kind: DropKind;
  /** 남은 시간(초) */
  life: number;
}

export type SimEventType =
  | 'shoot'
  | 'hit'
  | 'kill'
  | 'hurt'
  | 'dodge'
  | 'levelup'
  | 'pickup'
  | 'eliteSpawn'
  | 'bossSpawn'
  | 'bossPhase'
  | 'bossAttack'
  | 'enemyShoot'
  | 'explode'
  | 'item'
  | 'bomb'
  | 'revive'
  | 'reroll'
  | 'victory'
  | 'defeat';

export interface SimEvent {
  type: SimEventType;
  x?: number;
  y?: number;
  amount?: number;
}

/** 레벨업 후보: 실제 강화이거나, 모두 최대일 때의 대체 선택지 */
export type UpgradeChoice =
  | { kind: 'upgrade'; def: UpgradeDef; grade: GradeId; nextStack: number }
  | { kind: 'fusion'; id: FusionId }
  | { kind: 'relic'; id: RelicId; source: RelicSource }
  | { kind: 'fallback'; id: string; name: string; description: string; heal: number };

export type AttackId = 'basic' | 'bomb' | WeaponId | FusionId;

export type RunOutcome = 'victory' | 'defeat';
export type RunEndCause = 'boss' | 'death' | 'timeout';

export interface RunResult {
  outcome: RunOutcome;
  cause: RunEndCause;
  /** 사망 시 마지막으로 받은 공격 */
  killedBy: string | null;
  /** 전투 시간(초) */
  survivalTime: number;
  kills: number;
  killsByKind: Record<string, number>;
  level: number;
  /** 고른 강화 (같은 강화는 묶고, 고른 등급 목록을 함께 표시) */
  upgrades: { id: UpgradeId; name: string; stacks: number; grades: GradeId[] }[];
  pickOrder: string[];
  rerollsUsed: number;
  revived: number;
  itemsCollected: number;
  relics?: RelicId[];
  fusions?: FusionId[];
  /** 적중 시 보정된 피해량의 합. 남은 체력을 초과한 피해도 포함한다. */
  damageByAttack?: Partial<Record<AttackId, number>>;
  combatTime?: number;
  seed: number;
  bossHpRatio: number | null;
  /** 개발 모드 옵션(보스 직전 시작/무적)이 사용된 판인가 — 최고 기록에서 제외 */
  assisted: boolean;
}
