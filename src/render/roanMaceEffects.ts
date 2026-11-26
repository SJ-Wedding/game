import type { GameObjects } from 'phaser';
import type { SwordSweep } from '../core/roan';
import { drawArm, drawGrip, type RoanPoint as Point } from './roanPose';

type Graphics = GameObjects.Graphics;
const TAU = 2 * Math.PI;
const CONTACT = 0.3;
const FLAIL_SPIN = 0.2;
const OUTLINE = 0x171a27;

const MACE_HEADS = {
  mace: { width: 12, depth: 12, face: 0x879baa, edge: 0xd8e5e7, accent: 0xe7b574 },
  warmace: { width: 16, depth: 13, face: 0x6a7c91, edge: 0xbdcfdc, accent: 0xffbd61 },
  morningstar: { width: 11, depth: 11, face: 0x6b7e93, edge: 0xdfedf3, accent: 0xb6dce8 },
  maul: { width: 22, depth: 15, face: 0x758396, edge: 0xc4d4dc, accent: 0xffa357 },
  flail: { width: 11, depth: 11, face: 0x63758a, edge: 0xc3d1db, accent: 0xd2b082 },
} as const;

const clamp = (value: number) => Math.max(0, Math.min(1, value));
const mix = (from: number, to: number, t: number) => from + (to - from) * t;

export function maceLean(progress: number): number {
  return progress < CONTACT ? mix(-4, 7, (progress / CONTACT) ** 2) : 7 * (1 - (progress - CONTACT) / (1 - CONTACT));
}

function drawHead(g: Graphics, center: Point, angle: number, design: keyof typeof MACE_HEADS, alpha: number): void {
  const { width, depth, edge, face, accent } = MACE_HEADS[design];
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const point = (u: number, v: number) => ({ x: center.x + dx * u - dy * v, y: center.y + dy * u + dx * v });
  const shape = (along: number, across: number) => [
    point(-along, -across * 0.63), point(-along * 0.55, -across), point(along * 0.55, -across), point(along, -across * 0.63),
    point(along, across * 0.63), point(along * 0.55, across), point(-along * 0.55, across), point(-along, across * 0.63),
  ];
  if (design === 'morningstar' || design === 'flail') {
    const spikes = design === 'morningstar' ? 8 : 5;
    for (let i = 0; i < spikes; i++) {
      const a = angle + i * TAU / spikes;
      const spike = (r: number, side: number) => ({ x: center.x + Math.cos(a) * r - Math.sin(a) * side, y: center.y + Math.sin(a) * r + Math.cos(a) * side });
      g.fillStyle(OUTLINE, alpha).fillPoints([spike(6, -5), spike(19, 0), spike(6, 5)], true);
      g.fillStyle(edge, alpha).fillPoints([spike(8, -2.7), spike(15, 0), spike(8, 2.7)], true);
    }
  }
  g.fillStyle(OUTLINE, alpha).fillPoints(shape(depth + 2, width + 2), true);
  g.fillStyle(face, alpha).fillPoints(shape(depth, width), true);
  g.fillStyle(edge, alpha).fillPoints([point(-depth * 0.6, -width * 0.77), point(depth * 0.47, -width * 0.77),
    point(depth * 0.78, -width * 0.45), point(-depth * 0.6, -width * 0.28)], true);
  if (design === 'warmace' || design === 'maul') {
    for (const side of [-1, 1]) {
      g.fillStyle(accent, alpha).fillPoints([point(-depth * 0.56, side * 6), point(depth * 0.67, side * 6),
        point(depth * 0.58, side * 10), point(-depth * 0.55, side * 10)], true);
    }
  } else {
    g.fillStyle(accent, alpha).fillCircle(center.x, center.y, 2.5);
  }
}

function impactReach(sweep: SwordSweep): number {
  return sweep.range * (sweep.design === 'maul' ? 0.66 : 0.53);
}

/** Wind up over the shoulder, drive the head down, then lift it from the ground. */
export function drawMaceWeapon(g: Graphics, body: Point, player: Point, sweep: SwordSweep, progress: number, age: number, alpha: number): void {
  const dx = Math.cos(sweep.angle);
  const dy = Math.sin(sweep.angle);
  const shoulder = { x: body.x + dx * 5 - dy * 6, y: body.y + dy * 5 + dx * 6 };
  if (sweep.design === 'flail') {
    const head = flailHead(sweep, age);
    const wrist = { x: body.x + dx * 19, y: body.y + dy * 19 + 4 };
    const angle = Math.atan2(head.y - wrist.y, head.x - wrist.x);
    const forward = (n: number) => ({ x: wrist.x + Math.cos(angle) * n, y: wrist.y + Math.sin(angle) * n });
    const butt = forward(-8);
    const tip = forward(14);
    const chainLength = Math.hypot(head.x - tip.x, head.y - tip.y);
    const links = Math.max(1, Math.ceil(chainLength / 9));
    drawArm(g, shoulder, wrist, alpha);
    g.lineStyle(8, OUTLINE, alpha).lineBetween(butt.x, butt.y, tip.x, tip.y);
    g.lineStyle(4, 0xa37b59, alpha).lineBetween(butt.x, butt.y, tip.x, tip.y);
    g.lineStyle(4, OUTLINE, alpha).lineBetween(tip.x, tip.y, head.x, head.y);
    for (let i = 0; i < links; i++) {
      const a = (i + 0.16) / links;
      const b = (i + 0.76) / links;
      g.lineStyle(i % 2 ? 2 : 4, i % 2 ? 0x8197a8 : 0xbbc9d2, alpha).lineBetween(
        mix(tip.x, head.x, a), mix(tip.y, head.y, a), mix(tip.x, head.x, b), mix(tip.y, head.y, b),
      );
    }
    drawHead(g, head, angle, 'flail', alpha);
    drawGrip(g, wrist, alpha);
    return;
  }

  const design = sweep.design === 'warmace' || sweep.design === 'morningstar' || sweep.design === 'maul' ? sweep.design : 'mace';
  const twoHands = design === 'maul';
  const reach = impactReach(sweep);
  const windup = clamp(progress / 0.12);
  const swing = clamp((progress - 0.12) / (CONTACT - 0.12)) ** 2;
  const recovery = clamp((progress - CONTACT) / (1 - CONTACT));
  const forward = mix(mix(reach * 0.46, -16, windup), reach, swing) - recovery * reach * 0.41;
  const height = mix(mix(25, twoHands ? 71 : 57, windup), 0, swing) + recovery * 21;
  const head = { x: player.x + dx * forward, y: player.y + dy * forward + 4 - height };
  const wrist = { x: body.x + dx * mix(9, 26, swing), y: body.y + dy * mix(9, 26, swing) - (1 - swing) * 15 + 4 };
  const length = Math.hypot(head.x - wrist.x, head.y - wrist.y) || 1;
  const ux = (head.x - wrist.x) / length;
  const uy = (head.y - wrist.y) / length;
  const butt = { x: wrist.x - ux * (twoHands ? 22 : 9), y: wrist.y - uy * (twoHands ? 22 : 9) };
  const tailGrip = { x: wrist.x - ux * 13, y: wrist.y - uy * 13 };
  if (twoHands) drawArm(g, { x: body.x - dx * 5 + dy * 7, y: body.y - dy * 5 - dx * 7 }, tailGrip, alpha);
  drawArm(g, shoulder, wrist, alpha);
  g.lineStyle(twoHands ? 10 : 8, OUTLINE, alpha).lineBetween(butt.x, butt.y, head.x, head.y);
  g.lineStyle(twoHands ? 6 : 4, 0xaa7755, alpha).lineBetween(butt.x, butt.y, head.x, head.y);
  g.lineStyle(2, 0xe1b77d, alpha).lineBetween(wrist.x, wrist.y, head.x, head.y);
  drawHead(g, head, Math.atan2(uy, ux), design, alpha);
  if (twoHands) drawGrip(g, tailGrip, alpha);
  drawGrip(g, wrist, alpha);
}

function flailHead(sweep: SwordSweep, age: number): Point {
  const theta = sweep.angle + Math.PI + clamp(age / FLAIL_SPIN) * TAU;
  return { x: sweep.x + Math.cos(theta) * sweep.range, y: sweep.y + Math.sin(theta) * sweep.range };
}

export function drawFlailTrail(ground: Graphics, sweep: SwordSweep, age: number, progress: number): void {
  const color = sweep.kind === 'extra' ? 0xffe2a2 : 0xe2a56b;
  ground.lineStyle(2, color, (1 - progress) * 0.35).strokeCircle(sweep.x, sweep.y, sweep.range);
  const trail = Array.from({ length: 9 }, (_, i) => flailHead(sweep, age - 0.065 * i / 8));
  ground.lineStyle(9, color, (1 - progress) * 0.3).strokePoints(trail);
  ground.lineStyle(2, 0xffe9b7, (1 - progress) * 0.75).strokePoints(trail);
}

export function drawMaceImpact(ground: Graphics, g: Graphics, sweep: SwordSweep, progress: number): void {
  if (progress < CONTACT) return;
  const p = (progress - CONTACT) / (1 - CONTACT);
  const dx = Math.cos(sweep.angle);
  const dy = Math.sin(sweep.angle);
  const x = sweep.x + dx * impactReach(sweep);
  const y = sweep.y + dy * impactReach(sweep) + 4;
  const color = MACE_HEADS[sweep.design === 'warmace' || sweep.design === 'morningstar' || sweep.design === 'maul' ? sweep.design : 'mace'].accent;
  const heavy = sweep.design === 'maul';
  const radius = heavy ? 47 : 33;
  const alpha = (1 - p) ** 1.35;
  const start = sweep.angle - sweep.width / 2;
  ground.lineStyle(3, color, alpha * 0.33).beginPath().arc(sweep.x, sweep.y, sweep.range, start, start + sweep.width).strokePath();
  ground.lineStyle(3, color, alpha * 0.78).strokeEllipse(x, y, radius * (0.8 + p * 1.55), radius * (0.39 + p * 0.7));
  drawDebris(ground, g, { x, y }, radius, p, color, heavy ? 10 : 7);
}

function drawDebris(ground: Graphics, g: Graphics, center: Point, radius: number, progress: number, color: number, count: number): void {
  const fade = (1 - progress) ** 1.35;
  for (let i = 0; i < count; i++) {
    const a = i * TAU / count + 0.25 * Math.sin(i * 4);
    const dx = Math.cos(a);
    const dy = Math.sin(a) * 0.59;
    const reach = radius * (0.37 + 0.16 * (i % 3));
    const at = (r: number) => ({ x: center.x + dx * r, y: center.y + dy * r });
    const end = at(reach);
    ground.lineStyle(3, OUTLINE, fade * 0.82).strokePoints([at(6), { x: end.x * 0.54 + center.x * 0.46 - dy * 6,
      y: end.y * 0.54 + center.y * 0.46 + dx * 4 }, end]);
    const chip = at(reach * (0.38 + 1.5 * progress));
    const height = 7 + Math.sin(progress * Math.PI) * (8 + 4 * (i % 4));
    const size = i % 2 + 2;
    g.fillStyle(i % 2 ? color : 0xf3dcc2, fade * 0.9).fillRect(chip.x - size / 2, chip.y - height, size, size);
  }
  ground.fillStyle(0xffedd1, fade * Math.max(0, 0.55 - progress * 1.7)).fillEllipse(center.x, center.y, radius * 0.76, radius * 0.34);
}

export function drawMaceQuake(ground: Graphics, g: Graphics, center: Point, range: number, progress: number, scar: boolean): void {
  const color = 0xe2a66c;
  const radius = range * (scar ? 0.68 : 0.25 + 0.75 * progress);
  const alpha = (1 - progress) ** 1.3;
  if (!scar) for (const scale of [1, 0.68]) {
    ground.lineStyle(3, color, alpha * 0.82).strokeCircle(center.x, center.y, radius * scale);
  }
  drawDebris(ground, g, center, radius, progress, color, scar ? 8 : 12);
}
