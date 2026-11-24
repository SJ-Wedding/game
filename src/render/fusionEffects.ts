import type { GameObjects } from 'phaser';
import type { ResonanceEffect, TempestFlight } from '../core/weapons';
import { drawBolt, drawFlame } from './weaponEffects';

type Graphics = GameObjects.Graphics;
type Point = { x: number; y: number };
type Frame = { ground: Graphics; g: Graphics; center: Point; r: number; t: number; alpha: number; angle: number };
const TAU = 2 * Math.PI;
const RESONANCE_COLORS: Record<ResonanceEffect['kind'], number> = {
  storm: 0x8fa7ff, bastion: 0x94eaff, inferno: 0xff984f, volley: 0x82ffd7, eclipse: 0xc6a3ff,
};

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

export function drawTempestFlight(g: Graphics, flight: TempestFlight): void {
  const trail = polar(flight, flight.angle, flight.returning ? -64 : -86);
  g.lineStyle(15, 0xeeb271, 0.21).lineBetween(trail.x, trail.y, flight.x, flight.y);
  g.lineStyle(3, 0xffe9b5, 0.65).lineBetween(trail.x, trail.y, flight.x, flight.y);
  const spin = (flight.age - flight.returnAge) * 13 - flight.returnAge * 14;
  const colors = [0x80dfff, 0xffae61, 0xd5a4ff];
  const reach = flight.radius * 0.76;
  for (let i = 0; i < flight.bladeCount; i++) {
    const head = spin + i * TAU / flight.bladeCount;
    const a = flight.returning ? head : head - 1.05;
    const b = flight.returning ? head + 1.05 : head;
    arc(g, flight, reach, a, b, 13, 0x19233a, 0.82);
    arc(g, flight, reach, a, b, 8, colors[i], 0.78);
    arc(g, flight, reach + 4, a, b, 2, 0xfff6df, 0.97);
    const tip = polar(flight, head + (flight.returning ? -0.26 : 0.26), reach);
    const edge = polar(flight, head, reach + 9);
    const inside = polar(flight, head, reach - 9);
    const back = polar(flight, head + (flight.returning ? 0.45 : -0.45), reach - 4);
    g.fillStyle(0xfff6df, 1).fillPoints([tip, edge, back, inside], true);
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
  const center = fx.points[0];
  const color = RESONANCE_COLORS[fx.kind];
  const sweep = 1 - (1 - t) ** 2.6;
  const radius = fx.radius * (0.35 + sweep * 0.62);
  const alpha = 1 - t ** 2;
  for (let i = 0; i < 4; i++) {
    const a = fx.angle + i * TAU / 4 + t * 0.65;
    arc(g, center, radius, a, a + 0.54, 9, 0x101526, alpha * 0.76);
    arc(g, center, radius, a, a + 0.54, 3, color, alpha * 0.87);
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
