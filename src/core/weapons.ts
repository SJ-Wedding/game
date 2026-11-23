import { WEAPON_DAMAGE_PER_RANK, weaponRankEffect, type WeaponId } from '../config/weapons';
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
  armAt?: number;
  secondary?: boolean;
  exposures?: Map<Target, number>;
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

  private rankEffect(kind: WeaponId): number {
    return weaponRankEffect(kind, this.sim.stacks[kind]);
  }

  private weaponDamage(kind: WeaponId, factor: number): number {
    const upgrades = Math.max(0, this.sim.stacks[kind] - 1);
    return this.sim.stats.damage * factor * (1 + upgrades * WEAPON_DAMAGE_PER_RANK);
  }

  private damage(kind: WeaponId, target: Target, factor: number): void {
    const damage = this.weaponDamage(kind, factor);
    if ('id' in target) this.sim.damageEnemy(target, damage);
    else this.sim.damageBoss(damage);
  }

  private trace(kind: WeaponId, points: Point[], radius = 0, duration = 0.24): void {
    this.effects.push({ kind, points: points.map(({ x, y }) => ({ x, y })), radius, life: duration, duration });
  }

  private area(kind: WeaponId, point: Point, radius: number, factor: number): void {
    this.trace(kind, [point], radius);
    for (const target of this.targets()) {
      if (dist(point.x, point.y, target.x, target.y) < radius + target.r) this.damage(kind, target, factor);
    }
  }

  private device(kind: WeaponId, origin: Point, duration: number, r: number, angle = 0): Device {
    const device: Device = { kind, x: origin.x, y: origin.y, duration, r, angle, age: 0, next: 0, hit: new Set() };
    this.devices.push(device);
    return device;
  }

  private available(kind: WeaponId, interval: number): boolean {
    if (!this.sim.stacks[kind] || this.sim.elapsed < (this.ready.get(kind) ?? 0)) return false;
    this.ready.set(kind, this.sim.elapsed + interval * this.sim.relics.cooldownMultiplier);
    return true;
  }

  onDodge(): void {
    if (this.sim.stacks.barrier || this.sim.relics.has('compass')) this.dodgeTrail = { x: this.sim.player.x, y: this.sim.player.y };
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
    this.area('mark', target, this.rankEffect('mark'), 1.45);
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
    if (this.available('mine', this.rankEffect('mine'))) this.device('mine', p, Infinity, 72);
    if (this.available('turret', this.rankEffect('turret'))) this.device('turret', p, 5, 270);
    if (sim.stacks.flame && (!this.trail || dist(p.x, p.y, this.trail.x, this.trail.y) >= 36)) {
      this.trail = { x: p.x, y: p.y };
      this.device('flame', p, 1.5, this.rankEffect('flame'));
    }
    if (this.dodgeTrail && p.dodgeTime <= 0) {
      const from = this.dodgeTrail;
      this.dodgeTrail = null;
      const angle = Math.atan2(p.y - from.y, p.x - from.x);
      if (sim.stacks.barrier) this.device('barrier', from, 2.4, dist(p.x, p.y, from.x, from.y), angle);
      if (sim.relics.has('compass')) this.device('mine', p, Infinity, 72).armAt = 0;
    }

    if ((sim.stacks.axe || sim.stacks.spear || sim.stacks.gravity) && (sim.target || sim.findTarget(450))) {
      if (this.available('axe', 2.5)) this.device('axe', p, 2.2, this.rankEffect('axe'), p.aim);
      if (this.available('spear', 3.2)) this.device('spear', p, 0.38, this.rankEffect('spear'), p.aim);
      if (this.available('gravity', 5.4)) this.device('gravity', p, 1.9, this.rankEffect('gravity'), p.aim);
    }
    if (this.echo && this.echo.at <= now) {
      const { x, y, angle } = this.echo;
      const angles = sim.relics.has('mirror') ? [angle, angle + Math.PI] : [angle];
      const count = this.rankEffect('echo');
      for (const direction of angles) {
        for (let i = 0; i < count; i++) {
          const shotAngle = direction + (i - (count - 1) / 2) * 0.2;
          const dx = Math.cos(shotAngle);
          const dy = Math.sin(shotAngle);
          this.trace('echo', [{ x, y }, { x: x + dx * 45, y: y + dy * 45 }]);
          sim.playerShots.push({ x, y, vx: dx * 620, vy: dy * 620, r: 5,
            damage: this.weaponDamage('echo', 1.15 * (angles.length > 1 ? 0.7 : 1)), life: 0.7, source: 'echo' });
        }
      }
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
    const crown = this.sim.relics.has('crown');
    this.ready.set('chain', this.sim.elapsed + 2.15 * this.sim.relics.cooldownMultiplier);
    const hit = new Set<Target>();
    const points: Point[] = [p];
    while (target && hit.size < this.rankEffect('chain') + (crown ? 2 : 0)) {
      hit.add(target);
      points.push(target);
      this.damage('chain', target, 1.85 * 0.76 ** (hit.size - 1) * (crown && hit.size === 1 ? 0.75 : 1));
      target = this.nearest(target, 125, hit);
    }
    this.trace('chain', points);
    if (crown) this.area('chain', points[points.length - 1], 54, 0.75);
  }

  private orbit(): void {
    const { player, elapsed } = this.sim;
    const cog = this.sim.relics.has('cog');
    const bladeCount = this.rankEffect('orbit') + Number(cog);
    const radius = cog ? (elapsed < this.sim.relics.dodgeUntil ? 84 : 48) : 60;
    for (let i = 0; i < bladeCount; i++) {
      const angle = elapsed * 4 + i * Math.PI * 2 / bladeCount;
      const blade = this.blades[i] ??= { x: 0, y: 0 };
      blade.x = player.x + Math.cos(angle) * radius;
      blade.y = player.y + Math.sin(angle) * radius;
      for (const target of this.targets()) {
        if ((this.orbitHits.get(target) ?? 0) > elapsed
          || dist(blade.x, blade.y, target.x, target.y) >= target.r + 13) continue;
        this.damage('orbit', target, 0.8);
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
        this.damage('infection', target, 1);
      }
    }
    const origins = this.contagion.splice(0);
    for (const origin of origins) {
      const radius = this.rankEffect('infection');
      this.trace('infection', [origin], radius);
      for (const enemy of this.sim.enemies) {
        if (enemy.dead || this.infected.has(enemy) || dist(enemy.x, enemy.y, origin.x, origin.y) > radius + enemy.r) continue;
        this.infected.set(enemy, now + 5);
        this.damage('infection', enemy, 1.1);
      }
    }
  }

  private updateDevice(d: Device, dt: number): void {
    const previous = d.age;
    d.age += dt;
    const finished = d.age >= d.duration;
    switch (d.kind) {
      case 'mine':
        if (!finished && d.age >= (d.armAt ?? 0.4) && this.nearest(d, d.secondary ? 20 : 26)) {
          this.area(d.kind, d, d.r, 2.85 * (d.secondary ? 0.4 : 1));
          d.age = d.duration;
          if (!d.secondary && this.sim.relics.has('fuse') && this.sim.stacks.mine) {
            const child = this.device('mine', d, Infinity, 44);
            child.secondary = true;
            child.armAt = 0.7 + dt; // A new device also advances in the current tick.
          }
        }
        break;
      case 'turret': {
        if (finished || d.age < d.next) break;
        const target = this.nearest(d, d.r);
        if (!target) break;
        d.next = d.age + 0.68;
        this.trace(d.kind, [d, target], 0, 0.16);
        if ('id' in target) target.slowUntil = this.sim.elapsed + 0.9;
        this.damage(d.kind, target, 0.86);
        break;
      }
      case 'flame':
        if (!finished && this.sim.relics.has('laces')) this.trackFlame(d, dt);
        if (!finished && d.age >= d.next) {
          d.next = d.age + 0.45;
          for (const target of this.targets()) {
            if (dist(d.x, d.y, target.x, target.y) < d.r + target.r) this.damage(d.kind, target, 0.34);
          }
        }
        break;
      case 'spear':
        if (finished) this.sweep(d, 12, 2.6);
        break;
      case 'barrier':
        if (!finished) this.sweep(d, this.rankEffect('barrier'), 1.8);
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
          this.damage(d.kind, target, 1.35);
        }
        break;
      }
      case 'gravity': {
        const anchor = this.sim.relics.has('anchor');
        if (!anchor) this.move(d, dt * 110);
        for (const e of this.sim.enemies) {
          const distance = dist(e.x, e.y, d.x, d.y);
          if (e.dead || e.kind === 'elite' || e.state === 'dash' || distance >= d.r || distance < 1) continue;
          if (anchor) d.hit.add(e);
          const ratio = Math.min(dt * 105 / distance, 1);
          const pad = ARENA_CONFIG.wallPadding + e.r;
          e.x = clamp(e.x + (d.x - e.x) * ratio, pad, ARENA_CONFIG.width - pad);
          e.y = clamp(e.y + (d.y - e.y) * ratio, pad, ARENA_CONFIG.height - pad);
        }
        if (finished) this.area(d.kind, d, d.r, 2.5 * (1 + Math.min(d.hit.size, 10) * 0.08));
        break;
      }
    }
  }

  private trackFlame(d: Device, dt: number): void {
    const exposures = d.exposures ??= new Map();
    for (const target of this.targets()) {
      if (dist(d.x, d.y, target.x, target.y) >= d.r + target.r) {
        exposures.delete(target);
        continue;
      }
      if ('id' in target) target.fireSlowUntil = this.sim.elapsed + dt * 2;
      const previous = exposures.get(target) ?? 0;
      const duration = previous + dt;
      exposures.set(target, duration);
      if (previous < 1 && duration >= 1) this.damage(d.kind, target, 0.72);
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
      const nail = d.kind === 'barrier' && this.sim.relics.has('nail');
      const canRoot = 'id' in target && target.state !== 'dash';
      if (nail && canRoot) target.rootedUntil = this.sim.elapsed + 0.8;
      this.damage(d.kind, target, factor * (nail && !canRoot ? 1.4 : 1));
    }
  }
}
