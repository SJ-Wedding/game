import type { GameObjects } from 'phaser';
import type { RoanDesign } from '../config/roan';
import type { Projectile } from '../core/types';
import type { WeaponEffect } from '../core/weapons';
import { PALETTE } from './palette';

type Graphics = GameObjects.Graphics;
type Point = { x: number; y: number };
const TAU = 2 * Math.PI;

function noise(seed: number): number {
  const value = Math.sin(seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

export function drawBolt(g: Graphics, from: Point, to: Point, color: number, alpha: number, seed: number, width = 1): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy);
  if (length < 1) return;
  const steps = Math.max(3, Math.min(12, Math.ceil(length / 15)));
  const jitter = Math.min(18, length * 0.18);
  const points = [from];
  for (let i = 1; i < steps; i++) {
    const offset = (noise(seed + i) - 0.5) * jitter * 2;
    points.push({ x: from.x + dx * i / steps - dy * offset / length, y: from.y + dy * i / steps + dx * offset / length });
  }
  points.push(to);
  g.lineStyle(12 * width, color, alpha * 0.17).strokePoints(points);
  g.lineStyle(5 * width, color, alpha * 0.8).strokePoints(points);
  g.lineStyle(2 * width, 0xf5ffff, alpha).strokePoints(points);

  if (width < 1 || length < 40) return;
  for (let i = 1; i < steps - 1; i += 2) {
    const a = points[i];
    const side = i % 4 === 1 ? 1 : -1;
    const x = a.x - dy / length * jitter * side;
    const y = a.y + dx / length * jitter * side;
    g.lineStyle(1.4, color, alpha * 0.82).strokePoints([a, { x, y }, { x: x + dx / steps, y: y + dy / steps }]);
  }
}

export function drawLightning(g: Graphics, fx: WeaponEffect): void {
  const progress = 1 - fx.life / fx.duration;
  const alpha = 1 - progress ** 1.5;
  const seed = Math.floor(Math.min(progress, 0.5) * 10);
  const [center, ...targets] = fx.points;
  if (fx.variant === 'markCharge') {
    const x = center.x;
    const y = center.y - fx.radius - 7;
    const spark = [{ x: x + 3, y: y - 8 }, { x: x - 4, y }, { x: x + 3, y: y + 1 }, { x: x - 2, y: y + 8 }];
    g.lineStyle(4, 0x9b63ff, alpha * 0.5).strokePoints(spark);
    g.lineStyle(1.6, 0xf3ddff, alpha).strokePoints(spark);
    return;
  }
  if (fx.kind === 'mark') {
    drawBolt(g, { x: center.x - 32, y: center.y - 225 }, center, 0xc28aff, alpha, seed + 21, 1.5);
    for (const [i, target] of targets.entries()) drawBolt(g, center, target, 0xba87ff, alpha * 0.8, seed + 31 + i * 13, 0.65);
    g.fillStyle(0xf1d6ff, alpha * 0.82).fillCircle(center.x, center.y, 12 * (0.45 + 0.55 * alpha));
    return;
  }
  for (let i = 1; i < fx.points.length; i++) {
    const repeats = fx.reboundCounts?.[i] ?? 0;
    if (repeats > 0) {
      drawChainRebound(g, fx.points[i - 1], fx.points[i], repeats, progress, alpha, seed + i * 17);
      continue;
    }
    drawBolt(g, fx.points[i - 1], fx.points[i], 0x61dfff, alpha, seed + i * 17);
    const { x, y } = fx.points[i];
    g.fillStyle(0xd7faff, alpha * 0.88).fillCircle(x, y, 4 * alpha);
  }
}

function drawChainRebound(g: Graphics, from: Point, to: Point, repeats: number, progress: number, alpha: number, seed: number): void {
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const length = Math.hypot(dx, dy) || 1;
  const offset = (repeats % 2 ? 1 : -1) * Math.min(30, length * 0.24);
  const bend = { x: (from.x + to.x) / 2 - dy / length * offset, y: (from.y + to.y) / 2 + dx / length * offset };
  const violet = 0xb799ff;
  drawBolt(g, from, bend, violet, alpha * 0.9, seed, 0.72);
  drawBolt(g, bend, to, violet, alpha, seed + 13, 0.72);

  const travel = Math.min(1, progress * 2.8);
  const a = travel < 0.5 ? from : bend;
  const b = travel < 0.5 ? bend : to;
  const along = travel < 0.5 ? travel * 2 : travel * 2 - 1;
  g.fillStyle(0xe7d6ff, alpha).fillCircle(a.x + (b.x - a.x) * along, a.y + (b.y - a.y) * along, 4);
  const radius = 10 + progress * 23;
  g.lineStyle(2, violet, alpha * 0.8).strokeCircle(to.x, to.y, radius);
  g.lineStyle(1.5, 0xf3ddff, alpha * 0.68).strokeCircle(to.x, to.y, radius * 0.66);
}

export function drawInfectionSmoke(g: Graphics, fx: WeaponEffect): void {
  const [origin, destination = origin] = fx.points;
  const progress = 1 - fx.life / fx.duration;
  const dx = destination.x - origin.x;
  const dy = destination.y - origin.y;
  for (let i = 0; i < 9; i++) {
    const age = progress * 1.65 - i * 0.066;
    if (age < 0 || age >= 1) continue;
    const travel = Math.min(age * 2, 1);
    const x = origin.x + dx * travel + (noise(i + origin.x) - 0.5) * (12 + age * 24);
    const y = origin.y + dy * travel - age * 17 + (noise(i + 23) - 0.5) * 15;
    const r = 3 + age * 10 + noise(i + 40) * 3 + fx.radius * 0.15;
    const opacity = (1 - age) * Math.min(1, age * 12);
    g.fillStyle(0x416c3c, opacity * 0.57).fillCircle(x, y, r);
    g.fillStyle(0xb2e67d, opacity * 0.42).fillCircle(x - r * 0.27, y - r * 0.2, r * 0.62);
  }
}

export function drawInfected(g: Graphics, x: number, y: number, radius: number, time: number, id: number): void {
  for (let i = 0; i < 3; i++) {
    const age = (time * 1.3 + id * 0.23 + i / 3) % 1;
    const px = x + Math.sin(id + i * 3 + age * 2) * radius * 0.65;
    const py = y - radius * 0.45 - age * 19;
    g.fillStyle(0x90de63, 0.5 * Math.sin(age * Math.PI)).fillCircle(px, py, 2.5 + age * 3.5);
  }
}

export function drawExplosion(ground: Graphics, g: Graphics, fx: WeaponEffect): void {
  const { x, y } = fx.points[0];
  const gravity = fx.kind === 'gravity';
  const color = gravity ? 0x8962fa : 0xff722e;
  const bright = gravity ? 0xf1d5ff : 0xffdc75;
  const dark = gravity ? 0x3c255d : 0x624140;
  const age = 1 - fx.life / fx.duration;
  const spread = 1 - (1 - age) ** 3;
  const alpha = 1 - age;
  ground.fillStyle(color, alpha * 0.18).fillCircle(x, y, fx.radius * (0.3 + 0.65 * spread));

  for (let i = 0; i < 18; i++) {
    const seed = i * 19 + Math.round(x);
    const angle = TAU * (i + noise(seed) * 0.8) / 18;
    const r = fx.radius * (0.09 + noise(seed + 1) * 0.19);
    const outer = i % 3 === 0;
    const travel = outer ? 0.87 + noise(seed + 2) * 0.13 : 0.25 + noise(seed + 2) * 0.61;
    const distance = (fx.radius - r) * (0.18 + spread * 0.82) * travel;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    const size = r * (0.66 + spread * 0.34);
    g.fillStyle(dark, alpha * 0.58).fillCircle(px, py, size);
    g.fillStyle(color, alpha ** 1.6 * 0.8).fillCircle(px - size * 0.17, py + size * 0.12, size * 0.81);
    g.fillStyle(bright, alpha ** 3 * 0.9).fillCircle(px - size * 0.24, py + size * 0.1, size * 0.43);
    if (outer || i % 3 === 1) {
      const reach = Math.min(fx.radius, distance + size * 2.5);
      g.lineStyle(1.5 + alpha, bright, alpha * 0.86).lineBetween(px, py,
        x + Math.cos(angle) * reach, y + Math.sin(angle) * reach);
    }
  }
  if (age < 0.48) {
    const flash = Array.from({ length: 16 }, (_, i) => {
      const angle = i * TAU / 16;
      const length = fx.radius * (0.2 + 0.2 * spread) * (i % 2 ? 0.48 : 1 + noise(i) * 0.38);
      return { x: x + Math.cos(angle) * length, y: y + Math.sin(angle) * length };
    });
    g.fillStyle(bright, 1 - age / 0.48).fillPoints(flash, true);
  }
  if (gravity) {
    for (let i = 0; i < 5; i++) {
      const angle = i * TAU / 5 + age * 1.4;
      g.lineStyle(3, bright, alpha * 0.68).beginPath().arc(x, y, fx.radius * (0.16 + 0.82 * spread), angle, angle + 0.62).strokePath();
    }
  }
}

export function drawGravityPull(g: Graphics, x: number, y: number, radius: number, age: number): void {
  g.fillStyle(0x5f3ed0, 0.1).fillCircle(x, y, radius);
  for (let i = 0; i < 6; i++) {
    const angle = i * TAU / 6 + age * 0.65;
    g.lineStyle(2, 0x9b82ff, 0.35).beginPath().arc(x, y, radius, angle, angle + 0.54).strokePath();
  }
  for (let i = 0; i < 18; i++) {
    const progress = (age * 1.25 + i / 18) % 1;
    const distance = radius * (1 - progress * 0.94);
    const tail = Math.min(radius, distance + radius * 0.18);
    const angle = i * 2.4 + progress * 1.65 + age * 0.7;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    const alpha = Math.sin(progress * Math.PI);
    g.lineStyle(3, 0xa991ff, alpha * 0.58).lineBetween(px, py, x + Math.cos(angle - 0.2) * tail, y + Math.sin(angle - 0.2) * tail);
    g.fillStyle(0xe7d9ff, alpha * 0.8).fillCircle(px, py, 2.4);
  }
}

export function drawFlame(ground: Graphics, g: Graphics, x: number, y: number, radius: number, age: number, duration: number, density = 1): void {
  const fade = Math.min(1, (duration - age) * 2.5);
  const tongueCount = Math.ceil(7 * density);
  const flameAlpha = fade * 7 * density / tongueCount;
  ground.fillStyle(0xd54114, 0.16 * fade * density).fillEllipse(x, y, radius * 1.8, radius * 1.22);
  for (let i = 0; i < tongueCount; i++) {
    const angle = i * 2.4;
    const distance = Math.sqrt(i / tongueCount) * radius * 0.85;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    const pulse = (age * (2.15 + noise(i) * 1.5) + noise(i + 3)) % 1;
    const height = (13 + radius * 0.48 * (0.5 + pulse)) * (0.4 + 0.6 * fade);
    const width = 5 + radius * 0.13;
    const lean = Math.sin(age * 15 + i * 5) * width * 0.43;
    const tongue = (h: number, w: number, color: number, alpha: number) => {
      g.fillStyle(color, flameAlpha * alpha).fillPoints([
        { x: px - w, y: py }, { x: px - w * 0.87, y: py - h * 0.42 },
        { x: px - w * 0.28, y: py - h * 0.57 }, { x: px + lean, y: py - h },
        { x: px + w * 0.56 + lean * 0.48, y: py - h * 0.51 },
        { x: px + w, y: py - h * 0.23 }, { x: px + w * 0.8, y: py },
      ], true);
    };
    tongue(height, width, 0xff5625, 0.84);
    tongue(height * 0.76, width * 0.66, 0xffa035, 0.94);
    tongue(height * 0.46, width * 0.34, 0xffed9e, 0.95);
    const ember = (pulse + 0.31) % 1;
    g.fillStyle(0xffba64, (1 - ember) * flameAlpha).fillRect(px + lean * ember, py - height * (0.55 + ember), 2, 2);
  }
}

export function drawRiftBarrier(g: Graphics, origin: Point, angle: number, length: number, halfWidth: number, life: number, age: number): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const to = { x: origin.x + dx * length, y: origin.y + dy * length };
  const alpha = Math.min(1, life * 2.3);
  const steps = Math.max(2, Math.ceil(length / 15));
  const cracks = [origin];
  for (let i = 1; i < steps; i++) {
    const offset = (noise(i + 31) - 0.5) * halfWidth;
    cracks.push({ x: origin.x + dx * length * i / steps - dy * offset, y: origin.y + dy * length * i / steps + dx * offset });
  }
  cracks.push(to);
  g.lineStyle(halfWidth * 2, 0x582580, alpha * 0.2).lineBetween(origin.x, origin.y, to.x, to.y);
  g.lineStyle(12, 0x110f25, alpha * 0.95).strokePoints(cracks);
  g.lineStyle(7, 0xb266e8, alpha * 0.66).strokePoints(cracks);
  g.lineStyle(2, 0xf3bfff, alpha * 0.83).strokePoints(cracks);
  for (let i = 0; i < cracks.length; i++) {
    const { x, y } = cracks[i];
    const height = 7 + noise(i + 4) * 16;
    const sign = i % 2 ? 1 : -1;
    const tipX = x + sign * (6 + noise(i + 8) * 5);
    const tipY = y - height;
    g.fillStyle(0x552d87, alpha * 0.88).fillTriangle(x - 6, y + 4, tipX, tipY, x + 7, y + 3);
    g.fillStyle(0xd694fc, alpha * 0.9).fillTriangle(x - 3, y, tipX, tipY, x + 2, y - 2);
    const drift = (age * 2 + noise(i + 18)) % 1;
    g.fillStyle(0xe5c4ff, alpha * (1 - drift) * 0.8).fillRect(tipX - sign * drift * 5, tipY - drift * 11, 2, 2);
  }
}

export function drawFrostBarrel(g: Graphics, x: number, y: number, angle: number): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const nx = -dy;
  const ny = dx;
  g.lineStyle(9, 0x17263c, 1).lineBetween(x, y, x + dx * 23, y + dy * 23);
  g.lineStyle(5, 0x68d8f9, 1).lineBetween(x + dx * 4, y + dy * 4, x + dx * 22, y + dy * 22);
  g.lineStyle(2, 0xe1fdff, 1).lineBetween(x + dx * 5 + nx, y + dy * 5 + ny, x + dx * 20 + nx, y + dy * 20 + ny);
}

export function drawFrostShot(g: Graphics, fx: WeaponEffect): void {
  const [base, hit] = fx.points;
  const dx = hit.x - base.x;
  const dy = hit.y - base.y;
  const distance = Math.hypot(dx, dy);
  const barrel = distance > 0 ? Math.min(22 / distance, 0.88) : 0;
  const x = base.x + dx * barrel;
  const y = base.y + dy * barrel;
  const alpha = fx.life / fx.duration;
  g.lineStyle(8, 0x54caff, alpha * 0.24).lineBetween(x, y, hit.x, hit.y);
  g.lineStyle(3, 0x9ae4ff, alpha * 0.85).lineBetween(x, y, hit.x, hit.y);
  g.lineStyle(1, 0xe5fbff, alpha).lineBetween(x, y, hit.x, hit.y);
  g.fillStyle(0xd8fbff, alpha).fillCircle(x, y, 5);
  for (let i = 0; i < 7; i++) {
    const a = i * TAU / 7;
    const reach = 4 + (1 - alpha) * (11 + (i % 3) * 4);
    const px = hit.x + Math.cos(a) * reach;
    const py = hit.y + Math.sin(a) * reach;
    g.lineStyle(2, 0xafedff, alpha).lineBetween(px, py, px + Math.cos(a) * 5, py + Math.sin(a) * 5);
  }
}

function spearhead(g: Graphics, x: number, y: number, dx: number, dy: number, scale: number, alpha: number): void {
  const backX = x - dx * 26 * scale;
  const backY = y - dy * 26 * scale;
  const edgeX = -dy * 9 * scale;
  const edgeY = dx * 9 * scale;
  g.fillStyle(0xffefc3, alpha).fillTriangle(x, y, backX + edgeX, backY + edgeY, backX - edgeX, backY - edgeY);
  g.fillStyle(0xe79a52, alpha).fillTriangle(x, y, backX, backY, backX + edgeX, backY + edgeY);
}

export function drawSpearAim(ground: Graphics, g: Graphics, x: number, y: number, angle: number, length: number, progress: number): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  for (let i = 28; i < length; i += 36) {
    const tip = Math.min(i + 18, length);
    ground.lineStyle(2, 0xeac483, 0.31 + progress * 0.19).lineBetween(x + dx * i, y + dy * i, x + dx * tip, y + dy * tip);
  }
  const distance = 42 + progress * 26;
  g.lineStyle(4, 0xa76c3b, 0.85).lineBetween(x + dx * 20, y + dy * 20, x + dx * distance, y + dy * distance);
  spearhead(g, x + dx * (distance + 9), y + dy * (distance + 9), dx, dy, 0.95, 0.65 + progress * 0.35);
}

export function drawSpearStrike(g: Graphics, fx: WeaponEffect): void {
  const [from, to] = fx.points;
  const dx = to.x - from.x;
  const dy = to.y - from.y;
  const len = Math.hypot(dx, dy) || 1;
  const alpha = fx.life / fx.duration;
  g.lineStyle(20, 0xff9e4d, alpha * 0.25).lineBetween(from.x, from.y, to.x, to.y);
  g.lineStyle(6, 0xffd989, alpha * 0.85).lineBetween(from.x, from.y, to.x, to.y);
  g.lineStyle(2, 0xfffaf0, alpha).lineBetween(from.x, from.y, to.x, to.y);
  spearhead(g, to.x, to.y, dx / len, dy / len, 1.65, alpha);
  for (let i = 0; i < 10; i++) {
    const along = (i / 10 + (1 - alpha) * 0.35) % 1;
    const side = (i % 2 ? 1 : -1) * (0.5 + noise(i)) * (7 + (1 - alpha) * 10);
    const end = Math.min(along + 0.055, 1);
    g.lineStyle(2, 0xffb861, alpha * 0.8).lineBetween(
      from.x + dx * along - dy * side / len, from.y + dy * along + dx * side / len,
      from.x + dx * end - dy * side / len, from.y + dy * end + dx * side / len,
    );
  }
}

export function daggerExtension(progress: number): number {
  const forward = Math.min(1, progress / 0.32);
  const recovery = Math.max(0, (progress - 0.32) / 0.68);
  return (1 - 0.7 * (1 - forward) ** 2) * (1 - recovery ** 1.6);
}

export function drawDaggerThrust(g: Graphics, body: Point, angle: number, extension: number, progress: number, design: RoanDesign, alpha: number, offHand = false): void {
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const hand = offHand ? -1 : 1;
  const point = (forward: number, side: number) => ({ x: body.x + dx * forward - dy * side, y: body.y + dy * forward + dx * side });
  const shoulderSide = (Math.abs(dy) > Math.abs(dx) ? (dy > 0 ? -10 : -6) : (dx > 0 ? 4 : -4)) * hand;
  const wristDistance = 14 + 24 * extension;
  const wristSide = shoulderSide * (1 - extension) * 0.7 + (design === 'twinblades' ? hand * 2 : 0);
  const arm = [
    point(6, shoulderSide),
    point((6 + wristDistance) / 2, (shoulderSide + wristSide) / 2 + 7 * hand * (1 - extension)),
    point(wristDistance, wristSide),
  ];
  g.lineStyle(11, 0x101422, alpha).strokePoints(arm);
  g.lineStyle(8, 0x62788d, alpha).strokePoints(arm);
  g.lineStyle(4, 0xb3c7d5, alpha).strokePoints(arm.slice(1));

  const blade = (forward: number, side: number) => point(wristDistance + forward, wristSide + side);
  const edge = design === 'stiletto' ? 0xd8bbfa : 0xe3eff4;
  const bladeShoulder = design === 'stiletto' ? 3 : 4;
  if (progress < 0.53) {
    const trail = [blade(-3, -5), blade(16, -7), blade(27, -3)];
    g.lineStyle(2, edge, alpha * 0.62 * (1 - progress / 0.53)).strokePoints(trail);
  }
  if (design === 'scimitar') {
    g.fillStyle(0x101422, alpha).fillPoints([blade(3, -7), blade(13, -8), blade(24, -10), blade(34, -5),
      blade(27, 2), blade(19, 6), blade(9, 7), blade(3, 6)], true);
    g.fillStyle(0xffedcb, alpha).fillPoints([blade(5, -5), blade(15, -6), blade(24, -8), blade(31, -5),
      blade(25, 1), blade(17, 4), blade(5, 5)], true);
    g.fillStyle(0x8fa3ad, alpha).fillPoints([blade(5, 0), blade(17, -1), blade(24, -4), blade(31, -5),
      blade(25, 1), blade(17, 4), blade(5, 5)], true);
  } else {
    g.fillStyle(0x101422, alpha).fillPoints([blade(3, -6), blade(16, -5), blade(29, 0), blade(17, 5), blade(3, 6)], true);
    g.fillStyle(edge, alpha).fillPoints([blade(5, -bladeShoulder), blade(16, -3), blade(27, 0), blade(16, 3), blade(5, bladeShoulder)], true);
    g.fillStyle(design === 'stiletto' ? 0x946cc2 : 0x8099ad, alpha).fillPoints([blade(5, 0), blade(27, 0), blade(16, 3), blade(5, bladeShoulder)], true);
  }
  const guard = [blade(5, -5), blade(5, 5)];
  g.lineStyle(4, 0x101422, alpha).strokePoints(guard);
  g.lineStyle(2, design === 'twinblades' ? 0xea776c : design === 'stiletto' ? 0xb88de1 : 0xffcd77, alpha).strokePoints(guard);
  const fist = [blade(-4, -3), blade(1, -4), blade(3, 0), blade(1, 4), blade(-4, 3)];
  g.fillStyle(0x28384d, alpha).fillPoints(fist, true);
  g.fillStyle(0xd7e4ec, alpha).fillPoints([blade(-3, -2), blade(1, -3), blade(2, -1), blade(-1, 1)], true);
}

export function drawSwordCrush(ground: Graphics, g: Graphics, strike: Point & { angle: number; width: number; range: number }, progress: number, color = 0xffb16d): void {
  const { x, y, angle, width, range } = strike;
  const hot = 0xffefd5;
  const dx = Math.cos(angle);
  const dy = Math.sin(angle);
  const dropEnd = 0.23;
  const drop = Math.min(1, progress / dropEnd) ** 2;
  const recovery = Math.max(0, (progress - dropEnd) / (1 - dropEnd));
  const fade = (1 - progress) ** 1.5;
  const contact = drop * fade;
  const impact = (forward: number, side: number) => ({
    x: x + dx * (range * 0.80 + forward) - dy * side,
    y: y + dy * (range * 0.80 + forward) + dx * side,
  });
  const center = impact(0, 0);

  // Keep the actual strike sector legible under the blade and debris.
  const edge = Array.from({ length: 25 }, (_, i) => {
    const a = angle + width * (i / 24 - 0.5);
    return { x: x + Math.cos(a) * range, y: y + Math.sin(a) * range };
  });
  ground.fillStyle(color, fade * 0.12).fillPoints([{ x, y }, ...edge], true);
  ground.fillStyle(color, contact * 0.33).fillEllipse(center.x, center.y, 20 + recovery * 46, 10 + recovery * 18);

  // The fall is vertical in screen space even when Roan aims north.
  const lift = 1 - drop;
  const tip = impact(-30 * lift, 0);
  tip.y -= 64 * lift;
  const bladeAlpha = Math.max(0, 1 - recovery * 3.2);
  if (bladeAlpha > 0) {
    const tilt = 0.20 + dx * 0.45;
    const bladePoint = (along: number, side: number) => ({
      x: tip.x + tilt * along + side,
      y: tip.y + along - tilt * side,
    });
    const left = bladePoint(-47, -8);
    const right = bladePoint(-47, 8);
    const guardLeft = bladePoint(-48, -14);
    const guardRight = bladePoint(-48, 14);
    const pommel = bladePoint(-61, 0);
    g.fillStyle(color, bladeAlpha * 0.30).fillPoints([
      bladePoint(-91, -9), bladePoint(-62, 14), bladePoint(-9, 13), tip,
    ], true);
    g.lineStyle(4, hot, bladeAlpha * 0.58).lineBetween(tip.x + 15, tip.y - 80, tip.x + 15, tip.y - 35);
    g.lineStyle(8, 0x332039, bladeAlpha).lineBetween(pommel.x, pommel.y, tip.x, tip.y);
    g.fillStyle(0x293049, bladeAlpha).fillPoints([bladePoint(2, 0), bladePoint(-47, -10), bladePoint(-47, 10)], true);
    g.fillStyle(hot, bladeAlpha).fillTriangle(tip.x, tip.y, left.x, left.y, right.x, right.y);
    const bevel = bladePoint(-47, 1);
    g.fillStyle(0xd89056, bladeAlpha).fillTriangle(tip.x, tip.y, bevel.x, bevel.y, right.x, right.y);
    g.lineStyle(6, 0xf4ad59, bladeAlpha).lineBetween(guardLeft.x, guardLeft.y, guardRight.x, guardRight.y);
  }

  const spread = range * Math.sin(Math.min(Math.PI / 2, width / 2)) * (0.22 + recovery * 0.54);
  for (const side of [-1, 1]) {
    const fracture = [center, impact(5, side * spread * 0.22), impact(-8, side * spread * 0.56), impact(-3, side * spread)];
    ground.lineStyle(9, 0x251a26, contact * 0.7).strokePoints(fracture);
    ground.lineStyle(2.5, color, contact * 0.9).strokePoints(fracture);
    for (let i = 0; i < 5; i++) {
      const chip = impact(i * 4 - 9, side * (5 + i * spread * 0.18));
      const height = 4 + 4 * i + Math.sin(Math.PI * recovery) * (18 + i * 3);
      const chipSize = 2 + i % 3;
      const chipY = chip.y - height;
      g.fillStyle(i % 2 ? hot : color, contact * 0.9).fillTriangle(chip.x, chipY - chipSize,
        chip.x + side * (chipSize + 2), chipY + 1, chip.x - side, chipY + chipSize);
    }
  }
  const flash = Math.max(0, 1 - recovery * 5) * contact;
  g.fillStyle(hot, flash).fillPoints([
    { x: center.x - 16, y: center.y - 13 }, { x: center.x - 5, y: center.y - 6 },
    { x: center.x, y: center.y - 18 }, { x: center.x + 5, y: center.y - 6 },
    { x: center.x + 19, y: center.y - 10 }, { x: center.x + 9, y: center.y + 3 },
    { x: center.x, y: center.y + 6 }, { x: center.x - 8, y: center.y + 3 },
  ], true);
}

export function drawEcho(ground: Graphics, g: Graphics, fx: WeaponEffect, alpha: number): void {
  const origin = fx.points[0];
  const charging = fx.variant === 'echoCharge';
  const t = 1 - fx.life / fx.duration;
  ground.fillStyle(0x49bca5, alpha * 0.16).fillEllipse(origin.x, origin.y + 11, 36, 15);
  for (let i = 0; i < 6; i++) {
    const angle = i * TAU / 6 + t * 2;
    const radius = charging ? 24 - t * 11 : 13 + t * 22;
    const x = origin.x + Math.cos(angle) * radius;
    const y = origin.y + Math.sin(angle) * radius * 0.68;
    ground.fillStyle(0xa1ffe1, alpha * 0.9).fillRect(x, y, 2.5, 2.5);
  }
  if (!charging) {
    for (let i = 1; i < fx.points.length; i++) {
      const aim = fx.points[i];
      const x = origin.x + (aim.x - origin.x) * 0.38;
      const y = origin.y + (aim.y - origin.y) * 0.38;
      g.lineStyle(9, 0x51dabe, alpha * 0.37).lineBetween(x, y, aim.x, aim.y);
      g.lineStyle(3, 0xb9ffee, alpha * 0.9).lineBetween(x, y, aim.x, aim.y);
    }
  }
}

export function drawPlayerShot(g: Graphics, shot: Projectile): void {
  const { x, y, vx, vy, r } = shot;
  const speed = Math.hypot(vx, vy);
  const dx = speed ? vx / speed : 1;
  const dy = speed ? vy / speed : 0;
  if (shot.source === 'thrownAxe' || shot.source === 'weaponThrow' || shot.source === 'smallAxe') {
    // 회전하며 날아가는 도끼·무기
    const spin = (x + y) * 0.08;
    const len = shot.source === 'smallAxe' ? r * 1.4 : r * 1.8;
    g.lineStyle(3, 0x8a5a33, 1).lineBetween(x - Math.cos(spin) * len, y - Math.sin(spin) * len, x + Math.cos(spin) * len, y + Math.sin(spin) * len);
    g.fillStyle(0xe8eef2, 1).fillTriangle(
      x + Math.cos(spin) * len, y + Math.sin(spin) * len,
      x + Math.cos(spin + 0.9) * len * 0.8, y + Math.sin(spin + 0.9) * len * 0.8,
      x + Math.cos(spin - 0.5) * len * 0.6, y + Math.sin(spin - 0.5) * len * 0.6,
    );
    return;
  }
  if (shot.source === 'shard') {
    g.fillStyle(0xdfe6ee, 1).fillTriangle(x + dx * r * 1.6, y + dy * r * 1.6, x - dy * r, y + dx * r, x + dy * r, y - dx * r);
    return;
  }
  if (shot.source === 'swordWave') {
    // 검기 대검: 진행 방향으로 휜 초승달 모양 검기
    const a = Math.atan2(dy, dx);
    g.lineStyle(9, 0xff9676, 0.35).beginPath().arc(x - dx * r, y - dy * r, r * 1.4, a - 1.1, a + 1.1).strokePath();
    g.lineStyle(3, 0xfff2d5, 0.95).beginPath().arc(x - dx * r, y - dy * r, r * 1.4, a - 1.0, a + 1.0).strokePath();
    return;
  }
  const echo = shot.source === 'echo';
  const piercing = shot.pierceLeft !== undefined;
  const relic = shot.source === 'relic';
  const color = echo ? 0x7ff3cc : relic ? 0xd9a8ff : piercing ? 0xffc071 : PALETTE.player;
  const core = echo ? 0xb8ffdd : relic ? 0xf3e2ff : piercing ? 0xfff1c4 : PALETTE.playerShot;
  const trail = echo ? 26 : piercing ? 35 : 17;
  const width = r * (piercing ? 0.95 : 0.71);
  const tailX = x - dx * trail;
  const tailY = y - dy * trail;
  g.fillStyle(color, echo ? 0.45 : 0.35).fillTriangle(tailX, tailY, x - dy * width, y + dx * width, x + dy * width, y - dx * width);
  g.fillStyle(core, 1).fillTriangle(x + dx * r, y + dy * r, x - dy * width, y + dx * width, x + dy * width, y - dx * width);
  g.fillTriangle(x - dx * r, y - dy * r, x - dy * width, y + dx * width, x + dy * width, y - dx * width);
}
