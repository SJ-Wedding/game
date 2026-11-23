import type { WeaponId } from '../config/weapons';
import { ARENA_CONFIG } from '../config/arena';
import { bossInvulnerable } from './boss';
import { clamp, compact, dist, distToSegment } from './math';
import type { GameSim } from './sim';
import type { Boss, Enemy } from './types';

interface Point { x: number; y: number }
type Target = Boss | Enemy;
interface Device extends Point {
  kind: WeaponId;
  age: number;
  duration: number;
  r: number;
  angle: number;
  next: number;
  hit: Set<Target>;
}
interface Effect {
  kind: WeaponId;
  points: Point[];
  radius: number;
  life: number;
  duration: number;
}

export class WeaponSystem {
  readonly devices: Device[] = [];
  readonly effects: Effect[] = [];
  readonly blades: Point[] = [];
  private readonly ready = new Map<WeaponId, number>();
  private readonly marks = new Map<Target, number>();
  readonly infected = new Map<Enemy, number>();
  private readonly orbitHits = new Map<Target, number>();
  private readonly contagion: Point[] = [];
  private previousShot: (Point & { angle: number }) | null = null;
  private echo: (Point & { angle: number; at: number }) | null = null;
  private trail: Point | null = null;
  private dodgeTrail: Point | null = null;

  constructor(private readonly sim: GameSim) {}

  private *targets(): Iterable<Target> {
    for (const e of this.sim.enemies) if (!e.dead) yield e;
    const boss = this.sim.boss;
    if (boss && !boss.dead && !bossInvulnerable(boss)) yield boss;
  }

  private nearest(from: Point, range: number, skip?: Set<Target>): Target | null {
    let closest = null;
    for (const target of this.targets()) {
      if (skip?.has(target)) continue;
      const d = dist(from.x, from.y, target.x, target.y) - target.r;
      if (d < range) {
        range = d;
        closest = target;
      }
    }
    return closest;
  }

  private damage(target: Target, factor: number): void {
    const damage = this.sim.stats.damage * factor;
    if ('id' in target) this.sim.damageEnemy(target, damage);
    else this.sim.damageBoss(damage);
  }

  private trace(kind: WeaponId, points: Point[], radius = 0, duration = 0.24): void {
    this.effects.push({ kind, points: points.map(({ x, y }) => ({ x, y })), radius, life: duration, duration });
  }

  private area(kind: WeaponId, point: Point, radius: number, factor: number): void {
    this.trace(kind, [point], radius);
    for (const target of this.targets()) {
      if (dist(point.x, point.y, target.x, target.y) < radius + target.r) this.damage(target, factor);
    }
  }

  private device(kind: WeaponId, origin: Point, duration: number, r: number, angle = 0): void {
    this.devices.push({ kind, x: origin.x, y: origin.y, duration, r, angle, age: 0, next: 0, hit: new Set() });
  }

  private available(kind: WeaponId, interval: number): boolean {
    if (!this.sim.stacks[kind] || this.sim.elapsed < (this.ready.get(kind) ?? 0)) return false;
    this.ready.set(kind, this.sim.elapsed + interval);
    return true;
  }

  onDodge(): void {
    if (this.sim.stacks.barrier) this.dodgeTrail = { x: this.sim.player.x, y: this.sim.player.y };
  }

  onShot(): void {
    if (!this.sim.stacks.echo) return;
    const { x, y, aim: angle } = this.sim.player;
    if (this.previousShot && this.available('echo', 1.25)) {
      this.echo = { ...this.previousShot, at: this.sim.elapsed + 0.36 };
    }
    this.previousShot = { x, y, angle };
  }

  onBulletHit(target: Target): void {
    if (!this.sim.stacks.mark || target.dead) return;
    const hits = (this.marks.get(target) ?? 0) + 1;
    if (hits < 3) {
      this.marks.set(target, hits);
      this.trace('mark', [target], target.r + 4, 0.13);
      return;
    }
    this.marks.delete(target);
    this.area('mark', target, 66, 1.45);
  }

  onEnemyKilled(enemy: Enemy): void {
    if (this.infected.delete(enemy)) this.contagion.push({ x: enemy.x, y: enemy.y });
    this.marks.delete(enemy);
    this.orbitHits.delete(enemy);
  }

  update(dt: number): void {
    const sim = this.sim;
    const p = sim.player;
    const now = sim.elapsed;
    compact(this.effects, (effect) => (effect.life -= dt) > 0);

    if (sim.stacks.chain && now >= (this.ready.get('chain') ?? 0)) this.chain();
    if (this.available('mine', 2.8)) this.device('mine', p, 7.5, 72);
    if (this.available('turret', 6.5)) this.device('turret', p, 5, 270);
    if (sim.stacks.flame && (!this.trail || dist(p.x, p.y, this.trail.x, this.trail.y) >= 36)) {
      this.trail = { x: p.x, y: p.y };
      this.device('flame', p, 1.5, 29);
    }
    if (this.dodgeTrail && p.dodgeTime <= 0) {
      const from = this.dodgeTrail;
      this.dodgeTrail = null;
      const angle = Math.atan2(p.y - from.y, p.x - from.x);
      this.device('barrier', from, 2.4, dist(p.x, p.y, from.x, from.y), angle);
    }

    if ((sim.stacks.axe || sim.stacks.spear || sim.stacks.gravity) && (sim.target || sim.findTarget(450))) {
      if (this.available('axe', 2.5)) this.device('axe', p, 2.2, 13, p.aim);
      if (this.available('spear', 3.2)) this.device('spear', p, 0.38, 450, p.aim);
      if (this.available('gravity', 5.4)) this.device('gravity', p, 1.9, 125, p.aim);
    }
    if (this.echo && this.echo.at <= now) {
      const { x, y, angle } = this.echo;
      this.trace('echo', [{ x, y }, { x: x + Math.cos(angle) * 45, y: y + Math.sin(angle) * 45 }]);
      sim.playerShots.push({ x, y, vx: Math.cos(angle) * 620, vy: Math.sin(angle) * 620,
        r: 5, damage: sim.stats.damage * 1.15, life: 0.7, source: 'echo' });
      this.echo = null;
    }
    if (sim.stacks.orbit) this.orbit();
    if (sim.stacks.infection) this.spread(now);

    for (const device of this.devices) this.updateDevice(device, dt);
    compact(this.devices, (device) => device.age < device.duration);
  }

  private chain(): void {
    const p = this.sim.player;
    let target = this.nearest(p, 390);
    if (!target) return;
    this.ready.set('chain', this.sim.elapsed + 2.15);
    const hit = new Set<Target>();
    const points: Point[] = [p];
    while (target && hit.size < 4) {
      hit.add(target);
      points.push(target);
      this.damage(target, 1.85 * 0.76 ** (hit.size - 1));
      target = this.nearest(target, 125, hit);
    }
    this.trace('chain', points);
  }

  private orbit(): void {
    const { player, elapsed } = this.sim;
    for (let i = 0; i < 2; i++) {
      const angle = elapsed * 4 + i * Math.PI;
      const blade = this.blades[i] ??= { x: 0, y: 0 };
      blade.x = player.x + Math.cos(angle) * 60;
      blade.y = player.y + Math.sin(angle) * 60;
      for (const target of this.targets()) {
        if ((this.orbitHits.get(target) ?? 0) > elapsed
          || dist(blade.x, blade.y, target.x, target.y) >= target.r + 13) continue;
        this.damage(target, 0.8);
        if (!target.dead) this.orbitHits.set(target, elapsed + 0.42);
      }
    }
  }

  private spread(now: number): void {
    for (const [enemy, end] of this.infected) if (end <= now) this.infected.delete(enemy);
    if (this.available('infection', 2.1)) {
      const p = this.sim.player;
      let range = 340;
      let target: Enemy | null = null;
      for (const enemy of this.sim.enemies) {
        if (enemy.dead || this.infected.has(enemy)) continue;
        const distance = dist(p.x, p.y, enemy.x, enemy.y) - enemy.r;
        if (distance >= range) continue;
        range = distance;
        target = enemy;
      }
      if (target) {
        this.infected.set(target, now + 5);
        this.trace('infection', [target], target.r + 7);
        this.damage(target, 1);
      }
    }
    const origins = this.contagion.splice(0);
    for (const origin of origins) {
      this.trace('infection', [origin], 96);
      for (const enemy of this.sim.enemies) {
        if (enemy.dead || this.infected.has(enemy) || dist(enemy.x, enemy.y, origin.x, origin.y) > 96 + enemy.r) continue;
        this.infected.set(enemy, now + 5);
        this.damage(enemy, 1.1);
      }
    }
  }

  private updateDevice(d: Device, dt: number): void {
    const previous = d.age;
    d.age += dt;
    const finished = d.age >= d.duration;
    switch (d.kind) {
      case 'mine':
        if (!finished && d.age >= 0.4 && this.nearest(d, 26)) {
          this.area(d.kind, d, d.r, 2.85);
          d.age = d.duration;
        }
        break;
      case 'turret': {
        if (finished || d.age < d.next) break;
        const target = this.nearest(d, d.r);
        if (!target) break;
        d.next = d.age + 0.68;
        this.trace(d.kind, [d, target], 0, 0.16);
        if ('id' in target) target.slowUntil = this.sim.elapsed + 0.9;
        this.damage(target, 0.86);
        break;
      }
      case 'flame':
        if (!finished && d.age >= d.next) {
          d.next = d.age + 0.45;
          for (const target of this.targets()) {
            if (dist(d.x, d.y, target.x, target.y) < d.r + target.r) this.damage(target, 0.34);
          }
        }
        break;
      case 'spear':
        if (finished) this.sweep(d, 12, 2.6);
        break;
      case 'barrier':
        if (!finished) this.sweep(d, 11, 1.8);
        break;
      case 'axe': {
        const returning = d.age >= 0.62;
        if (returning && previous < 0.62) d.hit.clear();
        const p = this.sim.player;
        if (returning) d.angle = Math.atan2(p.y - d.y, p.x - d.x);
        if (returning && dist(d.x, d.y, p.x, p.y) < 16) {
          d.age = d.duration;
          break;
        }
        this.move(d, dt * (returning ? 520 : 410));
        for (const target of this.targets()) {
          if (d.hit.has(target) || dist(d.x, d.y, target.x, target.y) >= d.r + target.r) continue;
          d.hit.add(target);
          this.damage(target, 1.35);
        }
        break;
      }
      case 'gravity':
        this.move(d, dt * 110);
        for (const e of this.sim.enemies) {
          const distance = dist(e.x, e.y, d.x, d.y);
          if (e.dead || e.kind === 'elite' || e.state === 'dash' || distance >= d.r || distance < 1) continue;
          const ratio = Math.min(dt * 105 / distance, 1);
          const pad = ARENA_CONFIG.wallPadding + e.r;
          e.x = clamp(e.x + (d.x - e.x) * ratio, pad, ARENA_CONFIG.width - pad);
          e.y = clamp(e.y + (d.y - e.y) * ratio, pad, ARENA_CONFIG.height - pad);
        }
        if (finished) this.area(d.kind, d, d.r, 2.5);
        break;
    }
  }

  private move(d: Device, distance: number): void {
    const pad = ARENA_CONFIG.wallPadding;
    d.x = clamp(d.x + Math.cos(d.angle) * distance, pad, ARENA_CONFIG.width - pad);
    d.y = clamp(d.y + Math.sin(d.angle) * distance, pad, ARENA_CONFIG.height - pad);
  }

  private sweep(d: Device, width: number, factor: number): void {
    const end = { x: d.x + Math.cos(d.angle) * d.r, y: d.y + Math.sin(d.angle) * d.r };
    if (d.kind === 'spear') this.trace(d.kind, [d, end], 0, 0.27);
    for (const target of this.targets()) {
      if (d.hit.has(target) || distToSegment(target.x, target.y, d.x, d.y, end.x, end.y) >= target.r + width) continue;
      d.hit.add(target);
      this.damage(target, factor);
    }
  }
}
