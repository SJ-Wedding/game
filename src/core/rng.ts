/**
 * 시드 기반 의사난수 (mulberry32). 같은 시드 → 같은 수열.
 * 스폰·강화 후보·보스 패턴이 서로 영향을 주지 않도록 용도별로 스트림을 분리한다.
 */
export class Rng {
  private state: number;

  constructor(seed: number) {
    this.state = seed >>> 0;
  }

  /** [0, 1) */
  next(): number {
    let t = (this.state = (this.state + 0x6d2b79f5) >>> 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  range(min: number, max: number): number {
    return min + this.next() * (max - min);
  }

  int(n: number): number {
    return Math.floor(this.next() * n);
  }
}

/** 시드와 용도 이름으로 독립된 하위 시드를 만든다 (FNV-1a 해시). */
export function deriveSeed(seed: number, salt: string): number {
  let h = (0x811c9dc5 ^ (seed >>> 0)) >>> 0;
  for (let i = 0; i < salt.length; i++) {
    h ^= salt.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  // 시드 자체도 바이트 단위로 섞는다
  for (let i = 0; i < 4; i++) {
    h ^= (seed >>> (i * 8)) & 0xff;
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** 사람이 입력하기 쉬운 시드(0 ~ 999,999) 생성 */
export function randomSeed(): number {
  return Math.floor(Math.random() * 1_000_000);
}
