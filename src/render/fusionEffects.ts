import type { GameObjects } from 'phaser';
import type { ResonanceEffect } from '../core/weapons';
import { drawBolt, drawFlame } from './weaponEffects';

type Graphics = GameObjects.Graphics;
type Point = { x: number; y: number };
type Frame = { ground: Graphics; g: Graphics; center: Point; r: number; t: number; alpha: number; angle: number };
const TAU = 2 * Math.PI;

function polar(origin: Point, angle: number, distance: number): Point {
  return { x: origin.x + Math.cos(angle) * distance, y: origin.y + Math.sin(angle) * distance };
}

function arc(g: Graphics, p: Point, radius: number, a: number, b: number, width: number, color: number, alpha: number): void {
  g.lineStyle(width, color, alpha).beginPath().arc(p.x, p.y, radius, a, b).strokePath();
}

function storm({ ground, g, center, r, t, alpha }: Frame, targets: readonly Point[]): void {
  const seed = Math.min(4, Math.floor(t * 11));
  const strike = Math.max(0, 1 - t * 1.13);
  ground.fillStyle(0x4250da, strike * 0.21).fillCircle(center.x, center.y, r * (0.3 + t * 0.7));
  drawBolt(g, { x: center.x - r * 0.48, y: center.y - r * 2.25 }, center, 0x7981ff, strike, 21 + seed, 1.7);
  drawBolt(g, { x: center.x + r * 0.37, y: center.y - r * 1.28 }, center, 0x86f0ff, strike * 0.76, 32 + seed, 0.78);
  for (let i = 1; i < targets.length; i++) drawBolt(g, center, targets[i], 0x63ecff, alpha, seed + i * 13, 0.69);
  for (let i = 0; i < 8; i++) {
    const a = i * 2.4;
    const p = polar(center, a, r * (0.22 + t * 0.64));
    const end = polar(p, a + (i % 2 ? 0.75 : -0.6), r * 0.12);
    g.lineStyle(2.5, 0xbbf2ff, strike * 0.82).lineBetween(p.x, p.y, end.x, end.y);
  }
  g.fillStyle(0xd7fbff, strike ** 2).fillCircle(center.x, center.y, r * 0.115);
}

function bastion({ ground, g, center, r, t, alpha }: Frame): void {
  const expansion = 1 - (1 - t) ** 3;
  ground.fillStyle(0x479bcf, alpha * 0.17).fillCircle(center.x, center.y, r * (0.38 + expansion * 0.58));
  for (let i = 0; i < 16; i++) {
    const a = i * TAU / 16 + 0.09;
    const k = i % 3;
    const foot = polar(center, a, r * (0.18 + expansion * (0.42 + k * 0.13)));
    const width = r * (0.037 + k * 0.012);
    const height = r * (0.17 + (2 - k) * 0.064) * (0.36 + expansion * 0.64);
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

function tempest({ ground, g, center, r, t, alpha, angle }: Frame): void {
  const sweep = t * 4.25;
  for (let i = 0; i < 2; i++) {
    const sign = i === 0 ? 1 : -1;
    const head = angle + i * Math.PI + sign * sweep;
    const color = i === 0 ? 0x80dfff : 0xffae61;
    const reach = r * (0.71 + i * 0.18);
    const [a, b] = i === 0 ? [head - 1.85, head] : [head, head + 1.85];
    arc(ground, center, reach, a - 0.23, b + 0.23, 22, color, alpha * 0.18);
    arc(g, center, reach, a, b, 11, color, alpha * 0.55);
    arc(g, center, reach + 3, a + 0.15, b - 0.15, 2.6, 0xfff6df, alpha);
    arc(g, center, reach * 0.68, a - 0.3, b - 0.22, 3, color, alpha * 0.68);
    const tip = polar(center, head + sign * 0.18, reach);
    const spine = polar(center, head - sign * 0.37, reach);
    const edge = polar(center, head - sign * 0.08, reach + 8);
    const inside = polar(center, head - sign * 0.1, reach - 9);
    g.fillStyle(0xfff6df, alpha).fillPoints([edge, tip, inside, spine], true);
    for (let j = 0; j < 6; j++) {
      const spark = polar(center, head - sign * (0.35 + j * 0.23), reach + (j % 3 - 1) * r * 0.12);
      g.fillStyle(color, alpha * (0.9 - j * 0.09)).fillRect(spark.x, spark.y, 3, 2);
    }
  }
}

function inferno({ ground, g, center, r, t, alpha, angle }: Frame): void {
  const direction = angle + Math.PI * 0.2;
  const reach = r * (0.46 + 0.51 * Math.min(1, t * 4));
  const crack = Array.from({ length: 9 }, (_, i) =>
    polar(polar(center, direction, (i - 4) * reach / 4), direction + Math.PI / 2, i === 4 ? 0 : (i % 2 ? 8 : -8)));
  ground.lineStyle(27, 0x681943, alpha * 0.47).strokePoints(crack);
  ground.lineStyle(13, 0xe7412b, alpha * 0.84).strokePoints(crack);
  ground.lineStyle(4, 0xffc976, alpha).strokePoints(crack);
  for (const i of [1, 4, 7]) {
    const p = crack[i];
    const branch = polar(p, direction + (i === 4 ? 1.33 : -1.25), r * 0.22);
    const split = polar(branch, direction + (i === 4 ? 0.82 : -0.84), r * 0.22);
    ground.lineStyle(5, 0xf3774d, alpha * 0.76).strokePoints([p, branch, split]);
    drawFlame(ground, g, p.x, p.y, r * 0.2, t + i * 0.16, 1 + i * 0.16);
  }
}

function volley({ ground, g, center, r, t, alpha, angle }: Frame, origin: Point, end: Point): void {
  ground.fillStyle(0x468f84, alpha * 0.14).fillCircle(center.x, center.y, r * (0.65 + t * 0.29));
  g.lineStyle(16, 0x53f7db, alpha * 0.20).lineBetween(origin.x, origin.y, end.x, end.y);
  g.lineStyle(2.8, 0xaaffed, alpha * 0.64).lineBetween(origin.x, origin.y, end.x, end.y);
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

function eclipse({ ground, g, center, r, t, alpha }: Frame): void {
  const burst = Math.max(0, (t - 0.48) / 0.52);
  const core = r * (0.21 + Math.sin(Math.PI * t) * 0.1 - burst * 0.13);
  ground.fillStyle(0x301d59, alpha * 0.56).fillCircle(center.x, center.y, r * (0.71 + t * 0.26));
  ground.fillStyle(0x113631, alpha * 0.45).fillCircle(center.x, center.y, r * (0.64 + t * 0.23));
  for (let i = 0; i < 24; i++) {
    const travel = (i / 24 + t * 1.2) % 1;
    const a = i * 2.4 + t * 6.7 + travel * 1.7;
    const distance = r * (0.2 + Math.max(burst * 0.68, 0.75 * (1 - travel)));
    const p = polar(center, a, distance);
    const tail = polar(center, a - 0.27, distance + r * 0.095);
    const glow = alpha * Math.sin(Math.PI * travel);
    g.lineStyle(2.5, i % 2 ? 0xac77f6 : 0x5fe49d, glow * 0.88).lineBetween(tail.x, tail.y, p.x, p.y);
    g.fillStyle(0x689b5e, glow * 0.58).fillCircle(p.x, p.y, 3 + (i % 3 + burst) * 2.5);
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
  const frame = { ground, g, center: fx.points[0], r: fx.radius, t, alpha: 1 - t ** 1.6, angle: fx.angle };
  switch (fx.kind) {
    case 'storm': storm(frame, fx.points); break;
    case 'bastion': bastion(frame); break;
    case 'tempest': tempest(frame); break;
    case 'inferno': inferno(frame); break;
    case 'volley': volley(frame, fx.points[1], fx.points[2]); break;
    case 'eclipse': eclipse(frame); break;
  }
}
