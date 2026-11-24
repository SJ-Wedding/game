import { RUN_CONFIG } from './run';
import { ENEMY_SCALING, type NormalEnemyKind } from './enemies';

/**
 * 적 생성 시간표.
 * 각 구간(from ≤ t < to)에서 interval 초마다 batch 마리를 weights 비율로 뽑아 생성한다.
 * interval 은 [구간 시작 값, 구간 끝 값] 사이를 선형으로 변한다.
 * maxAlive 를 넘으면 그 회차 생성은 건너뛴다(이동·회피 공간 확보).
 */
export interface SpawnPhase {
  label: string;
  from: number;
  to: number;
  interval: [number, number];
  batch: number;
  maxAlive: number;
  weights: Partial<Record<NormalEnemyKind, number>>;
  phase2Weights?: Partial<Record<NormalEnemyKind, number>>;
  xpMultiplier?: number;
  /** 구간이 시작될 때 화면 중앙에 잠깐 띄우는 안내 문구 (선택) */
  announce?: string;
}

/** 특정 시각에 한 번 발생하는 이벤트(엘리트 등장 등) */
export type SpawnEvent =
  | { at: number; kind: 'elite'; count: number }
  | { at: number; kind: 'assault'; count: number; bossOnly?: boolean };

export const ASSAULT_CONFIG = { warning: 2, xpMultiplier: 0.5, hpMultiplier: 1.35, damageMultiplier: 1.3 } as const;

export const SPAWN_PHASES: SpawnPhase[] = [
  { label: '적응', from: 0, to: 55, interval: [0.95, 0.75], batch: 1, maxAlive: 28, weights: { chaser: 1 } },
  { label: '돌진형 등장', from: 55, to: 125, interval: [0.85, 0.74], batch: 1, maxAlive: 36, weights: { chaser: 3, charger: 1 }, announce: '뿔 돌격수 출현 — 붉은 예고선 밖으로 피하세요' },
  { label: '원거리형 등장', from: 125, to: 210, interval: [0.8, 0.7], batch: 1, maxAlive: 42, weights: { chaser: 3, charger: 1, spitter: 1.2 }, announce: '가시 포자 출현 — 분홍 독침을 조심하세요' },
  { label: '혼합', from: 210, to: 390, interval: [1.03, 0.86], batch: 2, maxAlive: 66, weights: { chaser: 3, charger: 1.5, spitter: 1.5 } },
  { label: '고밀도', from: 390, to: ENEMY_SCALING.resistanceAt, interval: [1.02, 0.918], batch: 3, maxAlive: 92, weights: { chaser: 4, charger: 1.6, spitter: 1.6 }, announce: '균열이 넓어진다 — 적이 몰려옵니다' },
  { label: '증원 공세', from: ENEMY_SCALING.resistanceAt, to: 540, interval: [0.89, 0.80], batch: 4, maxAlive: 110, weights: { chaser: 4, charger: 1.6, spitter: 1.6 }, announce: '증원 공세 — 적이 더 많이 등장하고 받는 피해가 줄어듭니다' },
  { label: '갑주 공세', from: 540, to: RUN_CONFIG.largeWavesAt, interval: [0.85, 0.81], batch: 4, maxAlive: 128, weights: { chaser: 3, charger: 2.4, spitter: 2 }, announce: '갑주 공세 — 돌격수와 수호자는 기본탄 피해를 추가로 줄입니다' },
  { label: '대규모 증원', from: RUN_CONFIG.largeWavesAt, to: RUN_CONFIG.finalAssaultAt, interval: [2.7, 2.5], batch: 50, maxAlive: 170, xpMultiplier: 0.25, weights: { chaser: 3, charger: 2.4, spitter: 2 }, announce: '마지막 5분! 대규모 증원 · 웨이브당 50마리' },
  { label: '측면 공세', from: RUN_CONFIG.finalAssaultAt, to: 720, interval: [3.0, 2.8], batch: 60, maxAlive: 190, xpMultiplier: 0.30, weights: { chaser: 3, charger: 3, spitter: 2 }, announce: '측면 공세 · 웨이브당 60마리 · 양옆과 후방에 주의하세요' },
  { label: '균열 폭주', from: 720, to: RUN_CONFIG.bossAt, interval: [3.3, 3.1], batch: 70, maxAlive: 215, xpMultiplier: 0.40, weights: { chaser: 4, charger: 4, spitter: 3 }, announce: '균열 폭주 · 웨이브당 70마리 · 세 방향의 추가 증원에 주의하세요' },
  { label: '보스전', from: RUN_CONFIG.bossAt, to: RUN_CONFIG.timeLimit, interval: [3.85, 3.50], batch: 80, maxAlive: 215, xpMultiplier: 0.18, weights: { chaser: 1 }, phase2Weights: { chaser: 2, charger: 2, spitter: 1 }, announce: '보스전 공세 · 웨이브당 80마리' },
  { label: '연장전', from: RUN_CONFIG.timeLimit, to: Infinity, interval: [0.75, 0.75], batch: 12, maxAlive: 185, weights: { charger: 1 }, announce: '연장전 — 강화된 뿔 돌격수만 계속 등장합니다' },
];

export const SPAWN_EVENTS: SpawnEvent[] = [
  { at: 120, kind: 'elite', count: 1 }, // 2:00 첫 엘리트
  { at: 240, kind: 'elite', count: 1 }, // 4:00
  { at: 390, kind: 'elite', count: 1 }, // 6:30
  { at: 540, kind: 'elite', count: 1 }, // 9:00
  { at: 690, kind: 'elite', count: 1 }, // 11:30
  { at: 730, kind: 'assault', count: 70 }, // 12:10
  { at: 750, kind: 'assault', count: 72 },
  { at: 770, kind: 'assault', count: 75 },
  { at: 790, kind: 'assault', count: 77 },
  { at: 870, kind: 'assault', count: 80, bossOnly: true }, // 14:30
];
