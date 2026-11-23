/**
 * 색 구분 규칙 (한눈에 구분되도록):
 *  - 플레이어·플레이어 탄: 차가운 청록/흰색
 *  - 적: 보라·주황·노랑 계열의 단색 도형 (종류별 모양도 다름)
 *  - 적 투사체: 진분홍 테두리 + 흰 중심 (배경·적과 겹쳐도 보이도록)
 *  - 공격 예고: 반투명 빨강 영역 + 밝은 빨강 테두리
 *  - 경험치: 초록 마름모
 */
export const PALETTE = {
  bg: 0x0d0e16,
  floor: 0x14151f,
  grid: 0x1b1d2b,
  rune: 0x2a2347,
  wall: 0x231c33,
  wallEdge: 0x7a52b3,

  player: 0x4de8ff,
  playerOutline: 0xffffff,
  playerShot: 0xd9fbff,
  playerHurt: 0xff5a5a,

  chaser: 0x9a6bff,
  chaserDark: 0x4b2d99,
  charger: 0xff9233,
  chargerDark: 0x8a4100,
  spitter: 0xd9cf3a,
  spitterDark: 0x6b6410,
  elite: 0xe0344a,
  eliteTrim: 0xffd166,
  boss: 0xb3123f,
  bossTrim: 0xffb347,
  bossCore: 0xfff1c1,

  enemyShot: 0xff2bd6,
  enemyShotCore: 0xffffff,

  telegraph: 0xff2a3a,
  telegraphEdge: 0xff6070,

  gem: 0x45f08a,
  gemBig: 0xb8ff4d,
  hit: 0xffffff,
} as const;
