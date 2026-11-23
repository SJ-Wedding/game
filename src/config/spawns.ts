import { RUN_CONFIG } from './run';
import type { NormalEnemyKind } from './enemies';

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
  /** 구간이 시작될 때 화면 중앙에 잠깐 띄우는 안내 문구 (선택) */
  announce?: string;
}

/** 특정 시각에 한 번 발생하는 이벤트(엘리트 등장 등) */
export interface SpawnEvent {
  at: number;
  kind: 'elite';
  count: number;
}

export const SPAWN_PHASES: SpawnPhase[] = [
  { label: '적응', from: 0, to: 55, interval: [0.95, 0.75], batch: 1, maxAlive: 28, weights: { chaser: 1 } },
  { label: '돌진형 등장', from: 55, to: 125, interval: [0.85, 0.74], batch: 1, maxAlive: 36, weights: { chaser: 3, charger: 1 }, announce: '뿔 돌격수 출현 — 붉은 예고선 밖으로 피하세요' },
  { label: '원거리형 등장', from: 125, to: 210, interval: [0.8, 0.7], batch: 1, maxAlive: 42, weights: { chaser: 3, charger: 1, spitter: 1.2 }, announce: '가시 포자 출현 — 분홍 독침을 조심하세요' },
  { label: '혼합', from: 210, to: 390, interval: [1.03, 0.86], batch: 2, maxAlive: 66, weights: { chaser: 3, charger: 1.5, spitter: 1.5 } },
  { label: '고밀도', from: 390, to: RUN_CONFIG.bossAt, interval: [1.02, 0.85], batch: 3, maxAlive: 92, weights: { chaser: 4, charger: 1.6, spitter: 1.6 }, announce: '균열이 넓어진다 — 적이 몰려옵니다' },
  { label: '보스전', from: RUN_CONFIG.bossAt, to: RUN_CONFIG.timeLimit, interval: [3.0, 3.0], batch: 1, maxAlive: 10, weights: { chaser: 1 } },
];

export const SPAWN_EVENTS: SpawnEvent[] = [
  { at: 120, kind: 'elite', count: 1 }, // 2:00 첫 엘리트
  { at: 240, kind: 'elite', count: 1 }, // 4:00
  { at: 390, kind: 'elite', count: 1 }, // 6:30
];
