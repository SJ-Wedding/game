/** 아레나(맵)와 카메라 크기. 단위: 픽셀(월드 좌표). */
export const ARENA_CONFIG = {
  /** 아레나 크기. 넓히면 도망칠 공간이 늘고 적이 플레이어에게 닿는 시간이 길어진다. */
  width: 2400,
  height: 1800,
  /** 벽 두께. 플레이어·적은 이 안쪽으로만 움직인다. */
  wallPadding: 40,
  /** 적이 생성되는 플레이어 기준 거리 범위. 화면(대각선 절반 ≈ 734px) 밖에서 나타나게 한다. */
  spawnDistance: [760, 920] as [number, number],
  /** 벽 때문에 위치가 보정됐을 때 플레이어와 최소한 이만큼은 떨어져 있어야 한다. */
  minSpawnDistance: 620,
} as const;

/** 게임 화면(카메라)의 논리 해상도. 브라우저 창 크기에 맞춰 비율을 유지하며 확대/축소된다. */
export const VIEW_CONFIG = {
  width: 1280,
  height: 720,
} as const;
