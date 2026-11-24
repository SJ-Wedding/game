import type { GameObjects } from 'phaser';
import type { WeaponEffect } from '../core/weapons';

type Graphics = GameObjects.Graphics;
type Point = { x: number; y: number };
const TAU = 2 * Math.PI;

function noise(seed: number): number {
  const value = Math.sin(seed * 78.233) * 43758.5453;
  return value - Math.floor(value);
}

function bolt(g: Graphics, from: Point, to: Point, color: number, alpha: number, seed: number, width = 1): void {
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
    bolt(g, { x: center.x - 32, y: center.y - 225 }, center, 0xc28aff, alpha, seed + 21, 1.5);
    for (const [i, target] of targets.entries()) bolt(g, center, target, 0xba87ff, alpha * 0.8, seed + 31 + i * 13, 0.65);
    g.fillStyle(0xf1d6ff, alpha * 0.82).fillCircle(center.x, center.y, 12 * (0.45 + 0.55 * alpha));
    return;
  }
  for (let i = 1; i < fx.points.length; i++) {
    bolt(g, fx.points[i - 1], fx.points[i], 0x61dfff, alpha, seed + i * 17);
    const { x, y } = fx.points[i];
    g.fillStyle(0xd7faff, alpha * 0.88).fillCircle(x, y, 4 * alpha);
  }
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

export function drawFlame(ground: Graphics, g: Graphics, x: number, y: number, radius: number, age: number, duration: number): void {
  const fade = Math.min(1, (duration - age) * 2.5);
  ground.fillStyle(0xd54114, 0.16 * fade).fillEllipse(x, y, radius * 1.8, radius * 1.22);
  for (let i = 0; i < 7; i++) {
    const angle = i * 2.4;
    const distance = Math.sqrt(i / 7) * radius * 0.85;
    const px = x + Math.cos(angle) * distance;
    const py = y + Math.sin(angle) * distance;
    const pulse = (age * (2.15 + noise(i) * 1.5) + noise(i + 3)) % 1;
    const height = (13 + radius * 0.48 * (0.5 + pulse)) * (0.4 + 0.6 * fade);
    const width = 5 + radius * 0.13;
    const lean = Math.sin(age * 15 + i * 5) * width * 0.43;
    const tongue = (h: number, w: number, color: number, alpha: number) => {
      g.fillStyle(color, fade * alpha).fillPoints([
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
    g.fillStyle(0xffba64, (1 - ember) * fade).fillRect(px + lean * ember, py - height * (0.55 + ember), 2, 2);
  }
}
