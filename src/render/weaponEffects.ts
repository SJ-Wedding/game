import type { GameObjects } from 'phaser';
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
