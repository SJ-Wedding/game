import type { GameObjects } from 'phaser';
import type { RelicFx, RelicFxTone } from '../core/relicsExtra';
import type { GameSim } from '../core/sim';
import type { Projectile } from '../core/types';

type Graphics = GameObjects.Graphics;
const TAU = Math.PI * 2;

const TONE: Record<RelicFxTone, { main: number; core: number }> = {
  fuse: { main: 0xff8a3d, core: 0xffe3a0 },
  gem: { main: 0x6dffb0, core: 0xe8fff2 },
  core: { main: 0xb36bff, core: 0xf0dcff },
  vault: { main: 0xff4d6d, core: 0xffd0d8 },
  phoenix: { main: 0xff9a2b, core: 0xfff1b0 },
  heat: { main: 0xff5a24, core: 0xffd39a },
  frost: { main: 0x8fe4ff, core: 0xf2fdff },
  spore: { main: 0x8be36b, core: 0xe4ffd6 },
  vortex: { main: 0x9d8cff, core: 0xe6e0ff },
  overcharge: { main: 0x52f0ff, core: 0xf0ffff },
  amp: { main: 0x6fb6ff, core: 0xeaf4ff },
  cry: { main: 0xffd36b, core: 0xfff6d8 },
  watch: { main: 0xcfe3ff, core: 0xffffff },
  rally: { main: 0xffc94d, core: 0xfff3c4 },
  burst: { main: 0xffffff, core: 0xffffff },
  mark: { main: 0xffe27a, core: 0xfffbe0 },
};

function noise(seed: number): number {
  const v = Math.sin(seed * 91.17) * 43758.5453;
  return v - Math.floor(v);
}

/** 바닥에 깔리는 지속 효과 (그림자 길·진지·균열 핵·눈보라·피뢰주) */
export function drawRelicGround(ground: Graphics, g: Graphics, sim: GameSim): void {
  const x = sim.extra;
  const t = sim.elapsed;

  for (const path of x.paths) {
    const fade = Math.min(1, (path.until - t) * 2);
    ground.lineStyle(30, 0x2a1240, 0.55 * fade).lineBetween(path.ax, path.ay, path.bx, path.by);
    ground.lineStyle(14, 0x7a3dc8, 0.45 * fade).lineBetween(path.ax, path.ay, path.bx, path.by);
    const len = Math.hypot(path.bx - path.ax, path.by - path.ay);
    for (let i = 0; i < len / 18; i++) {
      const k = (i + (t * 2 % 1)) * 18 / Math.max(1, len);
      if (k > 1) break;
      const px = path.ax + (path.bx - path.ax) * k + (noise(i) - 0.5) * 16;
      const py = path.ay + (path.by - path.ay) * k + (noise(i + 9) - 0.5) * 16 - (t * 30 + i * 7) % 14;
      ground.fillStyle(0xd6a8ff, 0.7 * fade).fillRect(Math.round(px), Math.round(py), 2, 2);
    }
  }

  if (x.flag) {
    const { x: fx, y: fy } = x.flag;
    const pulse = 0.5 + 0.5 * Math.sin(t * 4);
    ground.fillStyle(0xffc94d, 0.06 + 0.03 * pulse).fillCircle(fx, fy, 220);
    for (let i = 0; i < 24; i++) {
      const a = i * TAU / 24 + t * 0.4;
      ground.fillStyle(0xffd76b, 0.55).fillRect(Math.round(fx + Math.cos(a) * 220) - 2, Math.round(fy + Math.sin(a) * 220) - 2, 4, 4);
    }
    g.lineStyle(2, 0x6b4a22, 1).lineBetween(fx + 14, fy + 10, fx + 14, fy - 30);
    const wave = Math.sin(t * 6) * 3;
    g.fillStyle(0xffc94d, 1).fillTriangle(fx + 15, fy - 30, fx + 36, fy - 23 + wave, fx + 15, fy - 16);
  }

  for (const core of x.cores) {
    const left = core.until - t;
    const k = 1 - left / 4;
    ground.fillStyle(0x3a1460, 0.35).fillCircle(core.x, core.y, 260);
    ground.lineStyle(2, 0xb36bff, 0.55).strokeCircle(core.x, core.y, 260 * (1 - (t * 0.8 % 1)));
    for (let i = 0; i < 10; i++) {
      const a = i * TAU / 10 - t * 3;
      const r1 = 40 + 200 * ((i * 0.37 + t * 0.9) % 1);
      ground.lineStyle(2, 0xd6a8ff, 0.5).lineBetween(core.x + Math.cos(a) * r1, core.y + Math.sin(a) * r1,
        core.x + Math.cos(a + 0.35) * (r1 - 22), core.y + Math.sin(a + 0.35) * (r1 - 22));
    }
    g.fillStyle(0x1b0630, 1).fillCircle(core.x, core.y, 18 + 10 * k);
    g.lineStyle(3, 0xd6a8ff, 0.9).strokeCircle(core.x, core.y, 18 + 10 * k);
    g.fillStyle(0xf0dcff, 0.9).fillCircle(core.x, core.y, 5 + 3 * Math.sin(t * 12));
  }

  const b = x.blizzard;
  if (b) {
    ground.fillStyle(0xbfefff, 0.13).fillCircle(b.x, b.y, b.r);
    ground.lineStyle(2, 0xe2f8ff, 0.5).strokeCircle(b.x, b.y, b.r);
    for (let i = 0; i < 40; i++) {
      const a = noise(i) * TAU + t * (0.6 + noise(i + 3));
      const r = b.r * Math.sqrt(noise(i + 7));
      const fall = (t * 60 + i * 13) % 30;
      g.fillStyle(0xffffff, 0.8).fillRect(Math.round(b.x + Math.cos(a) * r), Math.round(b.y + Math.sin(a) * r + fall - 15), 2, 2);
    }
  }

  for (const rod of x.rods) {
    const fade = Math.min(1, (rod.until - t) * 2);
    ground.lineStyle(2, 0x8fd0ff, 0.35 * fade).strokeCircle(rod.x, rod.y, 170);
    g.fillStyle(0x2a3550, fade).fillRect(rod.x - 3, rod.y - 46, 6, 46);
    g.fillStyle(0xbfe4ff, fade).fillRect(rod.x - 1, rod.y - 46, 2, 46);
    g.fillStyle(0x8fd0ff, fade).fillTriangle(rod.x - 7, rod.y - 46, rod.x + 7, rod.y - 46, rod.x, rod.y - 58);
    if (Math.floor(t * 14) % 3 === 0) {
      g.lineStyle(2, 0xeaf6ff, fade).strokePoints([{ x: rod.x, y: rod.y - 58 }, { x: rod.x + 6, y: rod.y - 66 }, { x: rod.x - 3, y: rod.y - 72 }]);
    }
  }

  // 멈춘 회중시계: 화면 전체가 잠시 멈춘다
  if (x.timeStopped) {
    const left = x.stopUntil - t;
    const p = sim.player;
    ground.fillStyle(0x9fb6d8, 0.12).fillRect(0, 0, 4000, 4000);
    g.lineStyle(3, 0xffffff, 0.6).strokeCircle(p.x, p.y - 60, 16);
    const a = -Math.PI / 2 + (2 - left) * Math.PI;
    g.lineStyle(2, 0xffffff, 0.9).lineBetween(p.x, p.y - 60, p.x + Math.cos(a) * 12, p.y - 60 + Math.sin(a) * 12);
  }
}

/** 적에게 걸린 상태와 한 번 터지는 연출 */
export function drawRelicEffects(g: Graphics, sim: GameSim): void {
  const x = sim.extra;
  const t = sim.elapsed;
  for (const [target, burn] of x.burns) {
    if (target.dead) continue;
    for (let i = 0; i < burn.stacks; i++) {
      const fx = target.x - 6 + i * 6;
      const fy = target.y - target.r - 4 - ((t * 20 + i * 5) % 6);
      g.fillStyle(0xff7a2b, 0.95).fillTriangle(fx - 3, fy + 4, fx + 3, fy + 4, fx, fy - 4);
      g.fillStyle(0xffe08a, 0.95).fillRect(fx - 1, fy, 2, 3);
    }
  }
  for (const [target] of x.spores) {
    if (target.dead) continue;
    for (let i = 0; i < 3; i++) {
      const a = t * 2 + i * TAU / 3;
      g.fillStyle(0x8be36b, 0.85).fillCircle(target.x + Math.cos(a) * (target.r + 4), target.y + Math.sin(a) * (target.r + 4), 2.5);
    }
  }
  for (const [target, until] of x.charged) {
    if (target.dead || until < t || Math.floor(t * 12 + target.x) % 2) continue;
    const sx = target.x + (noise(t + target.x) - 0.5) * target.r * 2;
    const sy = target.y + (noise(t + target.y) - 0.5) * target.r * 2;
    g.lineStyle(1.5, 0xfff27a, 0.95).strokePoints([{ x: sx, y: sy }, { x: sx + 4, y: sy + 3 }, { x: sx + 1, y: sy + 7 }]);
  }
  for (const [target, mark] of x.marks) {
    if (target.dead || mark.until < t) continue;
    const r = target.r + 8;
    g.lineStyle(2, 0xffe27a, 0.9).strokeCircle(target.x, target.y, r);
    for (let i = 0; i < 4; i++) {
      const a = i * Math.PI / 2 + t;
      g.lineBetween(target.x + Math.cos(a) * (r - 4), target.y + Math.sin(a) * (r - 4), target.x + Math.cos(a) * (r + 5), target.y + Math.sin(a) * (r + 5));
    }
  }
  for (const soul of x.souls) {
    const bob = Math.sin(t * 10 + soul.x) * 3;
    g.fillStyle(0xb98cff, 0.35).fillCircle(soul.x, soul.y - 10 + bob, 10);
    g.fillStyle(0xe8d8ff, 0.95).fillCircle(soul.x, soul.y - 10 + bob, 5);
  }
  if (x.overheatUntil > t) {
    const p = sim.player;
    for (let i = 0; i < 5; i++) {
      const fy = p.y - 30 - ((t * 40 + i * 9) % 18);
      g.fillStyle(0xff6a2b, 0.7).fillRect(Math.round(p.x - 10 + i * 5), Math.round(fy), 3, 3);
    }
  }
  for (const fx of x.fx) drawFx(g, fx);
}

function drawFx(g: Graphics, fx: RelicFx): void {
  const k = 1 - fx.life / fx.duration;
  const alpha = Math.max(0, 1 - k);
  const color = TONE[fx.tone];
  switch (fx.kind) {
    case 'blast': {
      const r = fx.r * (0.35 + 0.65 * Math.min(1, k * 2.2));
      g.fillStyle(color.main, 0.16 * alpha).fillCircle(fx.x, fx.y, r);
      g.lineStyle(3, color.main, 0.9 * alpha).strokeCircle(fx.x, fx.y, r);
      g.lineStyle(1, color.core, 0.8 * alpha).strokeCircle(fx.x, fx.y, r * 0.82);
      g.fillStyle(color.core, 0.9 * alpha).fillCircle(fx.x, fx.y, Math.max(2, r * 0.28 * (1 - k * 1.4)));
      for (let i = 0; i < 8; i++) {
        const a = i * TAU / 8 + fx.x * 0.01;
        const d = r * (0.6 + 0.5 * k);
        g.fillStyle(color.core, alpha).fillRect(Math.round(fx.x + Math.cos(a) * d) - 2, Math.round(fx.y + Math.sin(a) * d) - 2, 4, 4);
      }
      break;
    }
    case 'ring': {
      const r = fx.r * (0.2 + 0.8 * k);
      g.lineStyle(3, color.main, 0.85 * alpha).strokeCircle(fx.x, fx.y, r);
      g.lineStyle(1, color.core, alpha).strokeCircle(fx.x, fx.y, r * 0.9);
      break;
    }
    case 'pull': {
      const r = fx.r * (1 - k);
      g.lineStyle(3, color.main, 0.8 * alpha).strokeCircle(fx.x, fx.y, Math.max(8, r));
      for (let i = 0; i < 12; i++) {
        const a = i * TAU / 12 + k * 3;
        g.lineStyle(2, color.core, 0.7 * alpha).lineBetween(fx.x + Math.cos(a) * (r + 30), fx.y + Math.sin(a) * (r + 30),
          fx.x + Math.cos(a + 0.3) * r, fx.y + Math.sin(a + 0.3) * r);
      }
      break;
    }
    case 'shard':
    case 'spread': {
      if (fx.x2 === undefined || fx.y2 === undefined) break;
      const px = fx.x + (fx.x2 - fx.x) * Math.min(1, k * 1.6);
      const py = fx.y + (fx.y2 - fx.y) * Math.min(1, k * 1.6);
      if (fx.kind === 'shard') {
        g.lineStyle(2, color.main, 0.7 * alpha).lineBetween(fx.x, fx.y, px, py);
        g.fillStyle(color.core, alpha).fillTriangle(px - 4, py, px + 4, py, px, py - 7);
      } else {
        for (let i = 0; i < 5; i++) {
          const s = i / 5 * Math.min(1, k * 1.6);
          g.fillStyle(color.main, alpha).fillCircle(fx.x + (fx.x2 - fx.x) * s, fx.y + (fx.y2 - fx.y) * s, 3);
        }
      }
      break;
    }
    case 'crit': {
      const r = fx.r * (0.6 + 0.6 * k);
      g.lineStyle(2, color.main, alpha);
      for (let i = 0; i < 4; i++) {
        const a = i * Math.PI / 4;
        g.lineBetween(fx.x - Math.cos(a) * r, fx.y - Math.sin(a) * r, fx.x + Math.cos(a) * r, fx.y + Math.sin(a) * r);
      }
      g.fillStyle(color.core, alpha).fillCircle(fx.x, fx.y, 3);
      break;
    }
  }
}

/** 영혼 구슬·로안 검기 투사체 */
export function drawRelicShot(g: Graphics, shot: Projectile): boolean {
  const { x, y, vx, vy, r } = shot;
  const speed = Math.hypot(vx, vy) || 1;
  const dx = vx / speed;
  const dy = vy / speed;
  if (shot.source === 'soul') {
    for (let i = 1; i <= 4; i++) g.fillStyle(0x9d6bff, 0.18 * (5 - i)).fillCircle(x - dx * i * 7, y - dy * i * 7, r * (1 - i * 0.15));
    g.fillStyle(0xb98cff, 0.5).fillCircle(x, y, r + 3);
    g.fillStyle(0xf3e8ff, 1).fillCircle(x, y, r * 0.6);
    return true;
  }
  if (shot.source === 'bladeWave') {
    const a = Math.atan2(dy, dx);
    g.lineStyle(10, 0x5ad7ff, 0.3).beginPath().arc(x - dx * r, y - dy * r, r * 1.6, a - 1.15, a + 1.15).strokePath();
    g.lineStyle(3, 0xe8fbff, 0.95).beginPath().arc(x - dx * r, y - dy * r, r * 1.6, a - 1.0, a + 1.0).strokePath();
    return true;
  }
  return false;
}
