/**
 * 색 구분 규칙 (한눈에 구분되도록):
 *  - 플레이어·플레이어 탄: 차가운 청록/흰색
 *  - 적: 종류마다 다른 색과 실루엣의 스프라이트
 *  - 적 투사체: 진분홍 테두리 + 흰 중심 (배경·적과 겹쳐도 보이도록)
 *  - 공격 예고: 반투명 빨강 영역 + 밝은 빨강 테두리
 *  - 경험치: 획득량에 따라 색이 달라지는 마름모
 */
export const PALETTE = {
  bg: 0x10161c,

  player: 0x4de8ff,
  playerOutline: 0xffffff,
  playerShot: 0xd9fbff,
  playerHurt: 0xff5a5a,

  chaser: 0x9a6bff,
  eliteTrim: 0xffd166,
  bossTrim: 0xffb347,
  bossCore: 0xfff1c1,

  enemyShot: 0xff2bd6,
  enemyShotCore: 0xffffff,

  telegraph: 0xff2a3a,
  telegraphEdge: 0xff6070,

  gem: 0x45f08a,
  hit: 0xffffff,
} as const;
