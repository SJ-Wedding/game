import type { GameObjects } from 'phaser';
import type { ResonanceEffect, TempestFlight } from '../core/weapons';
import { drawBolt, drawFlame } from './weaponEffects';

type Graphics = GameObjects.Graphics;
type Point = { x: number; y: number };
type Frame = { ground: Graphics; g: Graphics; center: Point; r: number; t: number; alpha: number; angle: number };
export interface FusionArt extends Point {
  frame: number;
  size: number;
  alpha: number;
  rotation?: number;
  originX?: number;
  originY?: number;
}
const TAU = 2 * Math.PI;
const RESONANCE_COLORS: Record<ResonanceEffect['kind'], number> = {
  storm: 0x8fa7ff, bastion: 0x94eaff, inferno: 0xff984f, volley: 0x82ffd7, eclipse: 0xc6a3ff,
};
const ART_LAYOUT = {
  storm: { frame: 0, scale: 1.09, originX: 0.53, originY: 0.75 },
  bastion: { frame: 1, scale: 0.74, originX: 0.5, originY: 0.77 },
  inferno: { frame: 3, scale: 1.09, originX: 0.5, originY: 0.58 },
  volley: { frame: 4, scale: 1.12, originX: 0.65, originY: 0.5 },
  eclipse: { frame: 5, scale: 0.74, originX: 0.5, originY: 0.53 },
} satisfies Record<ResonanceEffect['kind'], { frame: number; scale: number; originX: number; originY: number }>;

function polar(origin: Point, angle: number, distance: number): Point {
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
}

function arc(g: Graphics, p: Point, radius: number, a: number, b: number, width: number, color: number, alpha: number): void {
  g.lineStyle(width, color, alpha).beginPath().arc(p.x, p.y, radius, a, b).strokePath();
}

function storm({ g, center, r, t, alpha }: Frame, targets: readonly Point[]): void {
  const seed = Math.min(4, Math.floor(t * 11));
  const strike = Math.max(0, 1 - t * 1.13);
  drawBolt(g, { x: center.x - r * 0.31, y: center.y - r * 1.23 }, center, 0xb398ff, strike * 0.82, 21 + seed, 1.35);
  for (let i = 1; i < targets.length; i++) drawBolt(g, center, targets[i], 0x63ecff, alpha, seed + i * 13, 0.69);
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4;
    const p = polar(center, a, r * (0.22 + t * 0.64));
    const end = polar(p, a + (i % 2 ? 0.75 : -0.6), r * 0.12);
    g.lineStyle(2.5, 0xbbf2ff, strike * 0.82).lineBetween(p.x, p.y, end.x, end.y);
  }
  g.fillStyle(0xe8fdff, strike ** 2).fillRect(center.x - 4, center.y - 4, 8, 8);
}

function bastion({ g, center, r, t, alpha }: Frame): void {
  const expansion = 1 - (1 - t) ** 3;
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10 + 0.09;
    const k = i % 3;
    const foot = polar(center, a, r * (0.18 + expansion * (0.42 + k * 0.13)));
    const width = r * (0.023 + k * 0.009);
    const height = r * (0.10 + (2 - k) * 0.06) * (0.36 + expansion * 0.64);
    const left = polar(foot, a - Math.PI / 2, width);
    const right = polar(foot, a + Math.PI / 2, width);
    const tip = polar(foot, a, height * 0.51);
    tip.y -= height * 0.66;
    const hip = polar(foot, a, -height * 0.25);
    g.fillStyle(0x164e80, alpha * 0.95).fillPoints([hip, left, tip, right], true);
    g.fillStyle(k === 0 ? 0xc3f7ff : 0x62cfff, alpha * 0.93).fillPoints([left, tip, foot, hip], true);
    g.lineStyle(2, 0xc8f9ff, alpha * 0.87).lineBetween(tip.x, tip.y, right.x, right.y);
    const chip = polar(foot, a - 0.27, r * (0.05 + t * 0.15));
    g.fillStyle(0xb4ecff, alpha).fillRect(chip.x, chip.y - height * 0.7, 2.8, 2.8);
    if (k === 0) {
      const ember = polar(center, a, r * expansion * 0.86);
      g.fillStyle(0xffce8a, alpha * 0.95).fillRect(ember.x, ember.y, 4, 3);
    }
  }
}

export function drawTempestTrail(g: Graphics, flight: TempestFlight): void {
  const trail = polar(flight, flight.angle, flight.returning ? -64 : -86);
  const color = flight.returning ? 0x8edfde : 0xffc273;
  g.lineStyle(4, 0x27344a, 0.75).lineBetween(trail.x, trail.y, flight.x, flight.y);
  g.lineStyle(2.2, color, 0.83).lineBetween(trail.x, trail.y, flight.x, flight.y);
  for (let i = 2; i < flight.bladeCount; i++) {
    const head = tempestRotation(flight) + (i - 1) * TAU / flight.bladeCount;
    const reach = flight.radius * 0.83;
    const tip = polar(flight, head, reach);
    const base = polar(flight, head - 0.3, reach * 0.65);
    g.lineStyle(4, 0x182335, 0.9).lineBetween(base.x, base.y, tip.x, tip.y);
    g.lineStyle(2, 0xe5cbff, 1).lineBetween(base.x, base.y, tip.x, tip.y);
  }
}

function tempestRotation(flight: TempestFlight): number {
  return (flight.age - flight.returnAge) * 13 - flight.returnAge * 14;
}

export function tempestArt(flight: TempestFlight): FusionArt {
  return { x: flight.x, y: flight.y, frame: 2, size: Math.min(150, flight.radius * 1.68), rotation: tempestRotation(flight), alpha: 1 };
}

export function resonanceArt(fx: ResonanceEffect): FusionArt {
  const { frame, scale, originX, originY } = ART_LAYOUT[fx.kind];
  const t = 1 - fx.life / fx.duration;
  const alpha = (1 - t) ** 0.76;
  const center = fx.points[0];
  const size = Math.min(228, fx.radius * scale * (0.64 + 0.36 * Math.min(1, t * 5)));
  if (fx.kind === 'volley') {
    const [, origin, end] = fx.points;
    const travel = Math.min(1, t * 2.8);
    return { x: origin.x + (end.x - origin.x) * travel, y: origin.y + (end.y - origin.y) * travel, frame, size,
      alpha: alpha * (1 - Math.max(0, travel - 0.86) * 2.6), rotation: fx.angle, originX, originY };
  }
  const rotation = fx.kind === 'inferno' ? fx.angle + 0.18 : fx.kind === 'eclipse' ? -t * 1.9 : 0;
  return { ...center, frame, size, alpha: alpha * 0.92, rotation, originX, originY };
}

function inferno({ ground, g, center, r, t, alpha, angle }: Frame): void {
  const direction = angle + Math.PI * 0.2;
  const reach = r * (0.46 + 0.51 * Math.min(1, t * 4));
  const crack = Array.from({ length: 9 }, (_, i) =>
    polar(polar(center, direction, (i - 4) * reach / 4), direction + Math.PI / 2, i === 4 ? 0 : (i % 2 ? 8 : -8)));
  ground.lineStyle(12, 0x4c293b, alpha * 0.75).strokePoints(crack);
  ground.lineStyle(6, 0xe9653c, alpha * 0.78).strokePoints(crack);
  ground.lineStyle(4, 0xffc976, alpha).strokePoints(crack);
  for (const i of [1, 4, 7]) {
    const p = crack[i];
    const branch = polar(p, direction + (i === 4 ? 1.33 : -1.25), r * 0.22);
    const split = polar(branch, direction + (i === 4 ? 0.82 : -0.84), r * 0.22);
    ground.lineStyle(5, 0xf3774d, alpha * 0.76).strokePoints([p, branch, split]);
    drawFlame(ground, g, p.x, p.y, r * 0.18, t + i * 0.16, 1 + i * 0.16, 0.46);
  }
}

function volley({ g, center, r, t, alpha, angle }: Frame, origin: Point, end: Point): void {
  g.lineStyle(6, 0x2d776d, alpha * 0.42).lineBetween(origin.x, origin.y, end.x, end.y);
  g.lineStyle(2, 0xaaffed, alpha * 0.69).lineBetween(origin.x, origin.y, end.x, end.y);
  for (let i = -1; i <= 1; i++) {
    const shadow = i !== 0;
    const origin = polar(center, angle + Math.PI / 2, i * r * (0.15 + t * 0.29));
    const a = angle + i * 0.13;
    const reach = r * (0.57 + Math.min(1, t * 3.4) * 0.43);
    const tip = polar(origin, a, reach);
    const tail = polar(origin, a, -reach * 0.93);
    const shoulder = polar(tip, a, -r * 0.32);
    const left = polar(shoulder, a - Math.PI / 2, shadow ? 6 : 12);
    const right = polar(shoulder, a + Math.PI / 2, shadow ? 6 : 12);
    g.lineStyle(shadow ? 8 : 17, 0x53f7db, alpha * 0.24).lineBetween(tail.x, tail.y, tip.x, tip.y);
    g.lineStyle(shadow ? 3 : 6, shadow ? 0x7ee8d6 : 0xfff4bf, alpha * 0.95).lineBetween(tail.x, tail.y, tip.x, tip.y);
    g.fillStyle(shadow ? 0x93ffed : 0xfff4cb, alpha).fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
  }
  for (let i = 0; i < 10; i++) {
    const a = i * TAU / 10;
    const p = polar(center, a, r * (0.4 + t * 0.53));
    const end = polar(p, angle, r * (0.12 + i % 3 * 0.06));
    g.lineStyle(2, 0xaaffed, alpha * 0.65).lineBetween(p.x, p.y, end.x, end.y);
  }
}

function eclipse({ g, center, r, t, alpha }: Frame): void {
  const burst = Math.max(0, (t - 0.48) / 0.52);
  const core = r * (0.21 + Math.sin(Math.PI * t) * 0.1 - burst * 0.13);
  for (let i = 0; i < 24; i++) {
    const travel = (i / 24 + t * 1.2) % 1;
    const a = i * 2.4 + t * 6.7 + travel * 1.7;
    const distance = r * (0.2 + Math.max(burst * 0.68, 0.75 * (1 - travel)));
    const p = polar(center, a, distance);
    const tail = polar(center, a - 0.27, distance + r * 0.095);
    const glow = alpha * Math.sin(Math.PI * travel);
    g.lineStyle(2.5, i % 2 ? 0xac77f6 : 0x5fe49d, glow * 0.88).lineBetween(tail.x, tail.y, p.x, p.y);
    g.fillStyle(0x689b5e, glow * 0.48).fillCircle(p.x, p.y, 3 + (i % 3 + burst) * 1.7);
    g.fillStyle(0xcbff9e, glow * 0.74).fillCircle(p.x, p.y, 2.6);
  }
  g.fillStyle(0x9c6df0, alpha * 0.61).fillCircle(center.x, center.y, core + 5);
  g.fillStyle(0x100b25, alpha * 0.94).fillCircle(center.x, center.y, core);
  const a = t * 6;
  arc(g, center, core, a, a + 2.1, 4, 0xd6a4ff, alpha);
  arc(g, center, core + 5, a + 2.9, a + 5, 3, 0x86f299, alpha * 0.89);
}

export function drawResonance(ground: Graphics, g: Graphics, fx: ResonanceEffect): void {
  const t = 1 - fx.life / fx.duration;
  const center = fx.points[0];
  const color = RESONANCE_COLORS[fx.kind];
  const sweep = 1 - (1 - t) ** 2.6;
  const radius = fx.radius * (0.35 + sweep * 0.62);
  const alpha = 1 - t ** 2;
  for (let i = 0; i < 4; i++) {
    const a = fx.angle + i * TAU / 4 + t * 0.65;
    arc(g, center, radius, a, a + 0.37, 4, 0x101526, alpha * 0.67);
    arc(g, center, radius, a, a + 0.37, 1.6, color, alpha * 0.65);
    const spark = polar(center, a + 0.54, radius);
    g.fillStyle(0xf7fff4, alpha).fillCircle(spark.x, spark.y, 2.6);
  }
  const frame = { ground, g, center, r: fx.radius, t, alpha, angle: fx.angle };
  switch (fx.kind) {
    case 'storm': storm(frame, fx.points); break;
    case 'bastion': bastion(frame); break;
    case 'inferno': inferno(frame); break;
    case 'volley': volley(frame, fx.points[1], fx.points[2]); break;
    case 'eclipse': eclipse(frame); break;
  }
}

/** 화면 밖에서 발동한 융합 공격의 방향을 카메라 가장자리에 표시한다. */
export function drawResonanceDirection(g: Graphics, fx: ResonanceEffect, view: { x: number; y: number; width: number; height: number }): void {
  const middle = { x: view.x + view.width / 2, y: view.y + view.height / 2 };
  const target = fx.points[0];
  const dx = target.x - middle.x;
  const dy = target.y - middle.y;
  if (Math.abs(dx) <= view.width / 2 && Math.abs(dy) <= view.height / 2) return;
  const angle = Math.atan2(dy, dx);
  const verticalMargin = dy < 0 ? 104 : 72;
  const scale = Math.min((view.width / 2 - 55) / Math.abs(dx), (view.height / 2 - verticalMargin) / Math.abs(dy));
  const tip = { x: middle.x + dx * scale, y: middle.y + dy * scale };
  const back = polar(tip, angle, -24);
  const left = polar(back, angle - Math.PI / 2, 11);
  const right = polar(back, angle + Math.PI / 2, 11);
  const opacity = Math.min(1, 2 * fx.life / fx.duration);
  g.fillStyle(0x141e2f, opacity * 0.88).fillPoints([tip, left, right], true);
  g.lineStyle(4, RESONANCE_COLORS[fx.kind], opacity).strokePoints([left, tip, right]);
  const spark = polar(back, angle, -7);
  g.fillStyle(0xf5ffff, opacity).fillCircle(spark.x, spark.y, 2.7);
}
