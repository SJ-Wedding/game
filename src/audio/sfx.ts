import type { SimEventType } from '../core/types';

/**
 * 효과음. 외부 음원 파일 없이 WebAudio 로 짧은 소리를 합성한다.
 * 브라우저 정책상 첫 사용자 입력(플레이 버튼 클릭) 이후에만 소리가 난다 → unlock().
 */
type Wave = OscillatorType;

interface ToneSpec {
  f0: number;
  f1: number;
  dur: number;
  wave: Wave;
  gain: number;
  delay?: number;
}

const SOUNDS: Partial<Record<SimEventType, ToneSpec[]>> = {
  shoot: [{ f0: 900, f1: 600, dur: 0.05, wave: 'square', gain: 0.025 }],
  hit: [{ f0: 260, f1: 180, dur: 0.035, wave: 'triangle', gain: 0.05 }],
  kill: [{ f0: 520, f1: 240, dur: 0.08, wave: 'sine', gain: 0.07 }],
  hurt: [{ f0: 220, f1: 70, dur: 0.22, wave: 'sawtooth', gain: 0.12 }],
  dodge: [{ f0: 300, f1: 950, dur: 0.12, wave: 'sine', gain: 0.07 }],
  pickup: [{ f0: 1200, f1: 1500, dur: 0.04, wave: 'sine', gain: 0.02 }],
  levelup: [
    { f0: 523, f1: 523, dur: 0.1, wave: 'triangle', gain: 0.1 },
    { f0: 659, f1: 659, dur: 0.1, wave: 'triangle', gain: 0.1, delay: 0.09 },
    { f0: 784, f1: 784, dur: 0.18, wave: 'triangle', gain: 0.1, delay: 0.18 },
  ],
  eliteSpawn: [{ f0: 140, f1: 90, dur: 0.5, wave: 'sawtooth', gain: 0.08 }],
  bossSpawn: [
    { f0: 90, f1: 45, dur: 1.2, wave: 'sawtooth', gain: 0.14 },
    { f0: 135, f1: 60, dur: 1.0, wave: 'square', gain: 0.05, delay: 0.1 },
  ],
  bossPhase: [{ f0: 70, f1: 140, dur: 0.8, wave: 'sawtooth', gain: 0.12 }],
  bossAttack: [{ f0: 180, f1: 120, dur: 0.15, wave: 'square', gain: 0.04 }],
  enemyShoot: [{ f0: 420, f1: 300, dur: 0.08, wave: 'triangle', gain: 0.04 }],
  explode: [{ f0: 120, f1: 40, dur: 0.3, wave: 'sawtooth', gain: 0.09 }],
  victory: [
    { f0: 523, f1: 523, dur: 0.15, wave: 'triangle', gain: 0.12 },
    { f0: 659, f1: 659, dur: 0.15, wave: 'triangle', gain: 0.12, delay: 0.14 },
    { f0: 784, f1: 784, dur: 0.15, wave: 'triangle', gain: 0.12, delay: 0.28 },
    { f0: 1046, f1: 1046, dur: 0.4, wave: 'triangle', gain: 0.12, delay: 0.42 },
  ],
  defeat: [
    { f0: 392, f1: 392, dur: 0.2, wave: 'triangle', gain: 0.1 },
    { f0: 311, f1: 311, dur: 0.2, wave: 'triangle', gain: 0.1, delay: 0.2 },
    { f0: 233, f1: 180, dur: 0.6, wave: 'triangle', gain: 0.1, delay: 0.4 },
  ],
};

/** 같은 소리가 너무 자주 겹치지 않게 하는 최소 간격(초) */
const MIN_GAP: Partial<Record<SimEventType, number>> = { shoot: 0.06, hit: 0.04, kill: 0.04, pickup: 0.05, enemyShoot: 0.1, explode: 0.08 };

export class Sfx {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private volume: number;
  private last: Partial<Record<SimEventType, number>> = {};

  constructor(volume: number) {
    this.volume = volume;
  }

  /** 사용자 입력 이벤트 안에서 호출해야 한다 */
  unlock(): void {
    try {
      if (!this.ctx) {
        const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
        if (!Ctor) return;
        this.ctx = new Ctor();
        this.master = this.ctx.createGain();
        this.master.gain.value = this.volume;
        this.master.connect(this.ctx.destination);
      }
      if (this.ctx.state === 'suspended') void this.ctx.resume();
    } catch {
      this.ctx = null;
    }
  }

  setVolume(v: number): void {
    this.volume = v;
    if (this.master) this.master.gain.value = v;
  }

  play(type: SimEventType): void {
    const ctx = this.ctx;
    const master = this.master;
    const spec = SOUNDS[type];
    if (!ctx || !master || !spec || this.volume <= 0 || ctx.state !== 'running') return;
    const now = ctx.currentTime;
    const gap = MIN_GAP[type] ?? 0;
    if (gap && now - (this.last[type] ?? -1) < gap) return;
    this.last[type] = now;
    for (const t of spec) {
      const start = now + (t.delay ?? 0);
      const osc = ctx.createOscillator();
      const g = ctx.createGain();
      osc.type = t.wave;
      osc.frequency.setValueAtTime(t.f0, start);
      osc.frequency.exponentialRampToValueAtTime(Math.max(1, t.f1), start + t.dur);
      g.gain.setValueAtTime(t.gain, start);
      g.gain.exponentialRampToValueAtTime(0.0001, start + t.dur);
      osc.connect(g).connect(master);
      osc.start(start);
      osc.stop(start + t.dur + 0.02);
    }
  }
}
