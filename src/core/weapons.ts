import { WEAPON_FUSIONS, SPECIAL_WEAPON_POWER, WEAPON_GRADE_DAMAGE, WEAPON_DAMAGE_PER_RANK, WEAPON_MAX_RANK, type FusionId, weaponRankEffect, type WeaponId } from '../config/weapons';
import { ARENA_CONFIG } from '../config/arena';
import { bossInvulnerable } from './boss';
import { clamp, compact, dist, distToSegment } from './math';
import type { GameSim } from './sim';
import type { Boss, Enemy } from './types';

interface Point { x: number; y: number }
type Target = Boss | Enemy;
type FusionBurst = Exclude<FusionId, 'tempest'>;
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
  /** 귀환의 고리: 커지기 전 도끼 타격 반경 */
  baseR?: number;
  exposures?: Map<Target, number>;
}
interface EffectTiming {
  points: Point[];
  radius: number;
  life: number;
  duration: number;
}

export interface WeaponEffect extends EffectTiming {
  kind: WeaponId;
  variant?: 'markCharge' | 'echoCharge';
}

export interface ResonanceEffect extends EffectTiming {
  kind: FusionBurst;
  variant: 'resonance';
  angle: number;
}

export interface TempestFlight extends Point {
  angle: number;
  age: number;
  returnAge: number;
  returning: boolean;
  radius: number;
  baseRadius: number;
  distanceLeft: number;
  damage: number;
  bladeCount: number;
  hit: Set<Target>;
}

const RESONANCE_DURATION: Record<FusionBurst, number> = {
  storm: 0.85, bastion: 0.95, inferno: 1.02, volley: 0.84, eclipse: 1.04,
};
const ECHO_DELAY = 0.36;
const TEMPEST_RETURN_SPEED = 750;
const TEMPEST_OUT_SPEED = 630;

export class WeaponSystem {
  private qualityPickCount = -1;
  private readonly quality = new Map<WeaponId, number>();
  private readonly activeFusions = new Set<FusionId>();
  readonly fusions: ReadonlySet<FusionId> = this.activeFusions;
  private readonly fusedIngredients = new Set<WeaponId>();
  readonly devices: Device[] = [];
  readonly effects: (WeaponEffect | ResonanceEffect)[] = [];
  readonly blades: Point[] = [];
  readonly tempestFlights: TempestFlight[] = [];
  private readonly aimingVolleys: { at: number; center: Point; origin: Point; radius: number }[] = [];
  private readonly ready = new Map<WeaponId | FusionId, number>();
  private readonly marks = new Map<Target, number>();
  readonly infected = new Map<Enemy, number>();
  private readonly orbitHits = new Map<Target, number>();
  private readonly contagion: Point[] = [];
  private previousShot: (Point & { angle: number; at: number }) | null = null;
  private echo: (Point & { angle: number; at: number }) | null = null;
  private trail: Point | null = null;
  private dodgeTrail: Point | null = null;
  /** 쌍월 톱니: 회전 칼날 처치 수 */
  private cogKills = 0;
  /** 두 번째 도화선: 지뢰 폭발 뒤 남는 장판 */
  readonly mineFields: (Point & { r: number; until: number; next: number; damage: number; fusion?: 'bastion' })[] = [];
  /** 용광로의 신발끈: 화상 (대상 → 끝나는 시각, 다음 피해 시각) */
  private readonly burns = new Map<Target, { until: number; next: number; fusionDamage?: number }>();

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

  private gradeBonus(kind: WeaponId): number {
    if (this.qualityPickCount !== this.sim.picks.length) {
      this.qualityPickCount = this.sim.picks.length;
      this.quality.clear();
      for (const pick of this.sim.picks) {
        if (!Object.hasOwn(SPECIAL_WEAPON_POWER, pick.id)) continue;
        const weapon = pick.id as WeaponId;
        this.quality.set(weapon, (this.quality.get(weapon) ?? 0) + WEAPON_GRADE_DAMAGE[pick.grade]);
      }
    }
    return this.quality.get(kind) ?? 0;
  }

  private weaponDamage(kind: WeaponId, factor: number): number {
    const upgrades = Math.max(0, this.sim.stacks[kind] - 1);
    return this.sim.stats.damage * factor * SPECIAL_WEAPON_POWER[kind]
      * (1 + upgrades * WEAPON_DAMAGE_PER_RANK + this.gradeBonus(kind));
  }

  private damage(kind: WeaponId, target: Target, factor: number): void {
    const damage = this.weaponDamage(kind, factor);
    if ('id' in target) this.sim.damageEnemy(target, damage, kind);
    else this.sim.damageBoss(damage, kind);
  }

  private enabled(kind: WeaponId): boolean {
    return this.sim.stacks[kind] > 0 && !this.fusedIngredients.has(kind);
  }

  canFuse(id: FusionId): boolean {
    return WEAPON_FUSIONS[id].pair.every((kind) => this.enabled(kind) && this.sim.stacks[kind] === WEAPON_MAX_RANK);
  }

  fuse(id: FusionId): boolean {
    if (!this.canFuse(id)) return false;
    this.activeFusions.add(id);
    for (const kind of WEAPON_FUSIONS[id].pair) this.fusedIngredients.add(kind);
    compact(this.devices, (device) => !this.fusedIngredients.has(device.kind));
    compact(this.effects, (effect) => effect.variant === 'resonance' || !this.fusedIngredients.has(effect.kind));
    if (id === 'tempest') {
      this.blades.length = 0;
      this.orbitHits.clear();
    } else if (id === 'storm') {
      this.marks.clear();
    } else if (id === 'eclipse') {
      this.infected.clear();
      this.contagion.length = 0;
    } else if (id === 'volley') {
      this.echo = null;
      this.previousShot = null;
      compact(this.sim.playerShots, (shot) => shot.source !== 'echo');
    } else if (id === 'bastion') {
      this.mineFields.length = 0;
    } else if (id === 'inferno') {
      this.burns.clear();
    }
    return true;
  }

  private fusionDamage(id: FusionId): number {
    const recipe = WEAPON_FUSIONS[id];
    const grade = (this.gradeBonus(recipe.pair[0]) + this.gradeBonus(recipe.pair[1])) / 2;
    return this.sim.stats.damage * recipe.damage * (1 + grade) * this.sim.relics.fusionMultiplier(id);
  }

  private hitFusion(id: FusionId, target: Target, damage: number): void {
    if ('id' in target) this.sim.damageEnemy(target, damage, id);
    else this.sim.damageBoss(damage, id);
  }

  private updateFusions(dt: number): void {
    const { player, elapsed, reachBonus, relics } = this.sim;
    compact(this.aimingVolleys, (queued) => {
      if (queued.at > elapsed + 1e-6) return true;
      this.castVolley(queued.origin, queued.center, queued.radius);
      return false;
    });
    for (const id of this.fusions) {
      if (elapsed < (this.ready.get(id) ?? 0)) continue;
      const recipe = WEAPON_FUSIONS[id];
      let radius = recipe.radius + reachBonus * 0.08;
      let interval: number = recipe.interval;
      if (id === 'storm' && relics.has('secondBell')) { radius *= 0.75; interval *= 2 / 3; }
      if (id === 'tempest' && relics.has('returnRing')) interval *= 1.2;
      if (id === 'eclipse' && relics.has('anchor')) radius *= 1.5;
      const range = recipe.range + reachBonus * 0.85;
      const target = this.nearest(player, range);
      if (!target) continue;
      this.ready.set(id, elapsed + interval * relics.cooldownMultiplier);
      if (relics.onWeaponActivated()) this.ready.set(id, elapsed);
      if (id === 'tempest') {
        this.throwTempest(target, range, radius);
      } else if (id === 'volley' && relics.has('constellation')) {
        this.aimingVolleys.push({ at: elapsed + 0.3, origin: { x: player.x, y: player.y }, center: { x: target.x, y: target.y }, radius });
      } else if (id === 'bastion' && relics.has('winterLantern')) {
        const next = this.nearest(player, range, new Set([target]));
        this.castFusion(id, target, radius, 0.7, 0.7);
        this.castFusion(id, next ?? { x: target.x + 35, y: target.y }, radius, 0.7, 0.7);
      } else {
        this.castFusion(id, target, radius);
      }
    }
    compact(this.tempestFlights, (flight) => this.updateTempest(flight, dt));
  }

  private throwTempest(target: Target, range: number, radius: number): void {
    const { player, relics } = this.sim;
    const cog = relics.has('cog');
    const baseRadius = radius * (cog ? 1.2 : 1);
    const dx = target.x - player.x;
    const dy = target.y - player.y;
    const distance = Math.hypot(dx, dy);
    this.tempestFlights.push({
      x: player.x, y: player.y, angle: distance ? Math.atan2(dy, dx) : player.aim,
      age: 0, returning: false, returnAge: 0, radius: baseRadius, baseRadius,
      distanceLeft: clamp(distance + 42, 140, range + target.r),
      damage: this.fusionDamage('tempest'), bladeCount: cog ? 3 : 2, hit: new Set(),
    });
  }

  private updateTempest(flight: TempestFlight, dt: number): boolean {
    const { player, relics, reachBonus } = this.sim;
    const { x, y } = flight;
    flight.age += dt;
    let step = Math.min(flight.distanceLeft, (TEMPEST_OUT_SPEED + reachBonus * 0.45) * dt);
    if (flight.returning) {
      flight.returnAge += dt;
      flight.angle = Math.atan2(player.y - y, player.x - x);
      step = Math.min(TEMPEST_RETURN_SPEED * dt, dist(x, y, player.x, player.y));
      if (relics.has('returnRing')) flight.radius = flight.baseRadius * (1.5 + Math.min(0.5, flight.returnAge * 0.8));
    }
    this.move(flight, step);
    const cogBonus = relics.has('cog') ? 1 + Math.min(0.15, this.cogKills * 0.005) : 1;
    const damage = flight.damage * cogBonus * (flight.returning ? 0.75 : 1);
    for (const target of this.targets()) {
      if (flight.hit.has(target) || distToSegment(target.x, target.y, x, y, flight.x, flight.y) > flight.radius + target.r) continue;
      flight.hit.add(target);
      this.hitFusion('tempest', target, damage);
      if (target.dead && relics.has('cog')) this.cogKills++;
    }
    if (flight.returning) return flight.age < 2.6 && dist(flight.x, flight.y, player.x, player.y) > 9;
    flight.distanceLeft = Math.max(0, flight.distanceLeft - step);
    if (flight.distanceLeft === 0 || dist(x, y, flight.x, flight.y) < step * 0.15) {
      flight.returning = true;
      flight.hit.clear();
    }
    return true;
  }

  private castFusion(id: FusionBurst, center: Point, radius: number, power = 1, durationScale = 1): void {
    const { sim } = this;
    const { player: p, elapsed, relics } = sim;
    if (id === 'volley') { this.castVolley(p, center, radius); return; }
    const { x, y } = center;
    const angle = x === p.x && y === p.y ? p.aim : Math.atan2(y - p.y, x - p.x);
    const points = [{ x, y }];
    const crown = id === 'storm' && relics.has('crown');
    const jar = id === 'eclipse' && relics.has('plagueJar');
    const anchor = id === 'eclipse' && relics.has('anchor');
    const nail = id === 'inferno' && relics.has('nail');
    const laces = id === 'inferno' && relics.has('laces');
    const damage = this.fusionDamage(id) * power * (crown ? 0.75 : 1) * (jar ? 0.8 : 1);
    const duration = RESONANCE_DURATION[id] * durationScale;
    this.effects.push({ kind: id, variant: 'resonance', angle, points, radius, life: duration, duration });
    const targets = new Set([...this.targets()].filter((target) => dist(x, y, target.x, target.y) <= radius + target.r));
    for (let i = 0; (crown || jar) && i < 2; i++) {
      const extra = this.nearest(center, radius * 2, targets);
      if (extra) targets.add(extra);
    }
    for (const target of targets) {
      if (id === 'storm' && target !== center && points.length < (crown ? 8 : 6)) points.push({ x: target.x, y: target.y });
      const canRoot = 'id' in target && target.state !== 'dash';
      if ('id' in target) {
        if (id === 'bastion') target.slowUntil = Math.max(target.slowUntil, elapsed + 1.15 * durationScale);
        if (id === 'inferno') target.fireSlowUntil = Math.max(target.fireSlowUntil, elapsed + (laces ? 2 : 1));
        if (nail && canRoot) target.rootedUntil = Math.max(target.rootedUntil, elapsed + 0.8);
        if (id === 'eclipse' && target.kind !== 'elite' && target.state !== 'dash') {
          const pad = ARENA_CONFIG.wallPadding + target.r;
          const pull = anchor ? 0.45 : 0.3;
          target.x = clamp(target.x + (x - target.x) * pull, pad, ARENA_CONFIG.width - pad);
          target.y = clamp(target.y + (y - target.y) * pull, pad, ARENA_CONFIG.height - pad);
        }
      }
      this.hitFusion(id, target, damage * (nail && !canRoot ? 1.4 : 1));
      if (laces && !target.dead) this.burns.set(target, { until: elapsed + 2, next: this.burns.get(target)?.next ?? elapsed + 0.45, fusionDamage: damage * 0.2 });
    }
    if (crown) {
      // 한 번의 연쇄에서 폭발의 중첩 피해는 대상당 한 번만 계산한다.
      const centers = [...targets];
      for (const target of this.targets()) if (centers.some((at) => at !== target && dist(at.x, at.y, target.x, target.y) <= 54 + target.r)) {
        this.hitFusion('storm', target, damage * 0.45);
      }
    }
    if (id === 'bastion' && relics.has('fuse')) {
      this.mineFields.push({ x, y, r: radius, until: elapsed + 2.05, next: elapsed + 0.5, damage: damage * 0.05, fusion: 'bastion' });
    }
  }

  private castVolley(origin: Point, center: Point, radius: number): void {
    const mirror = this.sim.relics.has('mirror');
    const angle = origin.x === center.x && origin.y === center.y ? this.sim.player.aim : Math.atan2(center.y - origin.y, center.x - origin.x);
    const damage = this.fusionDamage('volley') * (mirror ? 0.7 : 1);
    const range = WEAPON_FUSIONS.volley.range + this.sim.reachBonus * 0.85;
    const hits = new Set<Target>();
    this.volleyRay(origin, angle, range, center, radius, damage, hits);
    if (mirror) {
      const opposite = angle + Math.PI;
      const anchor = { x: origin.x + Math.cos(opposite) * radius, y: origin.y + Math.sin(opposite) * radius };
      this.volleyRay(origin, opposite, range, anchor, radius, damage, hits);
      const killed = [...hits].find((target) => 'id' in target && target.dead);
      if (killed) {
        const echoHits = new Set<Target>();
        this.volleyRay(killed, angle, range, killed, radius, damage, echoHits);
        this.volleyRay(killed, opposite, range, killed, radius, damage, echoHits);
      }
    }
    if (hits.size >= 3 && this.sim.relics.has('constellation')) {
      let last = center;
      let distance = 0;
      for (const target of hits) {
        const along = (target.x - origin.x) * Math.cos(angle) + (target.y - origin.y) * Math.sin(angle);
        if (along > distance) { last = target; distance = along; }
      }
      const branchHits = new Set<Target>(hits);
      for (const spread of [-0.48, 0.48]) this.volleyRay(last, angle + spread, Math.min(range * 0.45, 330), last, radius * 0.42, damage * 0.5, branchHits);
    }
  }

  private volleyRay(origin: Point, angle: number, range: number, center: Point, radius: number, damage: number, hit: Set<Target>): void {
    const end = { x: origin.x + Math.cos(angle) * range, y: origin.y + Math.sin(angle) * range };
    const duration = RESONANCE_DURATION.volley;
    this.effects.push({ kind: 'volley', variant: 'resonance', angle, points: [{ x: center.x, y: center.y }, { x: origin.x, y: origin.y }, end], radius, life: duration, duration });
    for (const target of this.targets()) {
      if (hit.has(target)) continue;
      if (dist(target.x, target.y, center.x, center.y) > radius + target.r
        && distToSegment(target.x, target.y, origin.x, origin.y, end.x, end.y) > 26 + target.r) continue;
      hit.add(target);
      this.hitFusion('volley', target, damage);
    }
  }

  trace(kind: WeaponId, points: Point[], radius = 0, duration = 0.24, variant?: WeaponEffect['variant']): void {
    this.effects.push({ kind, variant, points: points.map(({ x, y }) => ({ x, y })), radius, life: duration, duration });
  }

  private area(kind: WeaponId, point: Point, radius: number, factor: number): void {
    const points = [point];
    for (const target of this.targets()) {
      if (dist(point.x, point.y, target.x, target.y) >= radius + target.r) continue;
      if (kind === 'mark' && target !== point && points.length < 7) points.push(target);
      this.damage(kind, target, factor);
    }
    const duration = kind === 'mine' ? 0.58 : kind === 'gravity' ? 0.62 : kind === 'mark' ? 0.38 : 0.24;
    this.trace(kind, points, radius, duration);
  }

  private device(kind: WeaponId, origin: Point, duration: number, r: number, angle = 0): Device {
    const device: Device = { kind, x: origin.x, y: origin.y, duration, r, angle, age: 0, next: 0, hit: new Set() };
    this.devices.push(device);
    return device;
  }

  private available(kind: WeaponId, interval: number): boolean {
    if (!this.enabled(kind) || this.sim.elapsed < (this.ready.get(kind) ?? 0)) return false;
    this.ready.set(kind, this.sim.elapsed + interval * this.sim.relics.cooldownMultiplier);
    // 불안정한 마력 코어: 25% 확률로 재사용 대기시간 즉시 초기화
    if (this.sim.relics.onWeaponActivated()) this.ready.set(kind, this.sim.elapsed);
    return true;
  }

  /** 시간 왜곡의 모래시계: 모든 특수 무기의 남은 재사용 대기시간 감소 */
  reduceCooldowns(seconds: number): void {
    for (const [kind, at] of this.ready) this.ready.set(kind, at - seconds);
  }

  /** 흡혈귀의 깨진 성배: 감염·화상 상태인가 */
  afflicted(enemy: Enemy): boolean {
    return this.infected.has(enemy) || this.burns.has(enemy);
  }

  onDodge(): void {
    if (this.enabled('barrier') || this.sim.relics.has('compass')) this.dodgeTrail = { x: this.sim.player.x, y: this.sim.player.y };
  }

  onShot(): void {
    if (!this.enabled('echo')) return;
    const { x, y, aim: angle } = this.sim.player;
    this.previousShot = { x, y, angle, at: this.sim.elapsed };
  }

  onBulletHit(target: Target): void {
    if (!this.enabled('mark')) return;
    const hits = (this.marks.get(target) ?? 0) + 1;
    const bell = this.sim.relics.has('secondBell');
    if (!target.dead && hits < (bell ? 2 : 3)) {
      this.marks.set(target, hits);
      this.trace('mark', [target], target.r, 0.2, 'markCharge');
      return;
    }
    this.marks.delete(target);
    this.area('mark', target, (this.rankEffect('mark') + this.sim.reachBonus * 0.12) * (bell ? 0.75 : 1), 1.45);
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

    if (this.enabled('chain') && now >= (this.ready.get('chain') ?? 0)) this.chain();
    if (this.available('mine', this.rankEffect('mine'))) this.device('mine', p, Infinity, 96);
    if (this.available('turret', this.rankEffect('turret'))) {
      // 겨울 등불: 지속시간 −30%, 한 번에 2대
      if (sim.relics.has('winterLantern')) {
        for (const side of [-1, 1]) this.device('turret', { x: p.x + side * 34, y: p.y }, 6 * 0.7, 340 + sim.reachBonus * 0.55);
      } else this.device('turret', p, 6, 340 + sim.reachBonus * 0.55);
    }
    if (this.enabled('flame') && (!this.trail || dist(p.x, p.y, this.trail.x, this.trail.y) >= 28)) {
      this.trail = { x: p.x, y: p.y };
      this.device('flame', p, 2, this.rankEffect('flame'));
    }
    if (this.dodgeTrail && p.dodgeTime <= 0) {
      const from = this.dodgeTrail;
      this.dodgeTrail = null;
      const angle = Math.atan2(p.y - from.y, p.x - from.x);
      if (this.enabled('barrier')) this.device('barrier', from, 3.2, dist(p.x, p.y, from.x, from.y), angle);
      if (sim.relics.has('compass')) {
        if (this.fusions.has('bastion')) {
          const radius = WEAPON_FUSIONS.bastion.radius + sim.reachBonus * 0.08;
          if (this.nearest(p, radius)) this.castFusion('bastion', p, radius);
        } else {
          this.device('mine', p, Infinity, 96).armAt = 0;
        }
      }
    }

    if ((this.enabled('axe') || this.enabled('spear') || this.enabled('gravity')) && (sim.target || sim.findTarget(540 + sim.reachBonus))) {
      if (this.available('axe', 2.0 * (sim.relics.has('returnRing') ? 1.2 : 1))) this.device('axe', p, 2.2, this.rankEffect('axe'), p.aim).baseR = this.rankEffect('axe');
      // 별자리 창끝: 조준 시간 +0.3초
      if (this.available('spear', 2.6)) this.device('spear', p, 0.38 + (sim.relics.has('constellation') ? 0.3 : 0), this.rankEffect('spear') + sim.reachBonus, p.aim);
      // 별의 닻: 중력 구체 크기 +50%
      if (this.available('gravity', 4.2)) this.device('gravity', p, 1.9, (this.rankEffect('gravity') + sim.reachBonus * 0.16) * (sim.relics.has('anchor') ? 1.5 : 1), p.aim);
    }
    if (this.echo && this.echo.at <= now) {
      const { x, y, angle } = this.echo;
      this.fireEcho(x, y, angle, false);
      this.echo = null;
    }
    // 기본탄의 발사 프레임을 기다리지 않아야 잔영의 짧아진 주기가 그대로 적용된다.
    const shot = this.previousShot;
    if (!this.echo && shot && now - shot.at <= 1 / sim.relics.fireRate + 0.2 && this.available('echo', this.rankEffect('echo'))) {
      this.echo = { ...shot, at: now + ECHO_DELAY };
      this.trace('echo', [shot, { x: shot.x + Math.cos(shot.angle) * 45, y: shot.y + Math.sin(shot.angle) * 45 }], 0, ECHO_DELAY, 'echoCharge');
    }
    if (this.enabled('orbit')) this.orbit();
    if (this.enabled('infection')) this.spread(now);
    this.updateFusions(dt);

    for (const device of this.devices) this.updateDevice(device, dt);
    compact(this.devices, (device) => device.age < device.duration);
    this.updateMineFields(now);
    this.updateBurns(now);
  }

  /** 메아리 사격 발사. repeat 은 틈새의 거울로 처치 자리에서 다시 발동한 잔영이다. */
  private fireEcho(x: number, y: number, angle: number, repeat: boolean): void {
    const sim = this.sim;
    const angles = sim.relics.has('mirror') ? [angle, angle + Math.PI] : [angle];
    // 디자인 개선(92359f6) 방식: 양방향 잔영을 하나의 궤적 효과로 그린다
    const points = [{ x, y }];
    for (const direction of angles) {
      const dx = Math.cos(direction);
      const dy = Math.sin(direction);
      points.push({ x: x + dx * 45, y: y + dy * 45 });
      sim.playerShots.push({ x, y, vx: dx * 620, vy: dy * 620, r: 5,
        damage: this.weaponDamage('echo', 1.15 * (angles.length > 1 ? 0.7 : 1)), life: 0.9 + sim.reachBonus / 620, source: 'echo',
        ...(repeat ? { echoRepeat: true } : {}) });
    }
    this.trace('echo', points);
  }

  /** 틈새의 거울: 잔영 탄으로 적을 처치하면 그 자리에서 잔영이 한 번 더 발동한다 (연쇄되지 않음). */
  onEchoKill(at: Point, angle: number): void {
    if (!this.sim.relics.has('mirror') || !this.enabled('echo')) return;
    this.fireEcho(at.x, at.y, angle, true);
  }

  private updateMineFields(now: number): void {
    for (const f of this.mineFields) {
      if (now > f.until || now + 1e-6 < f.next) continue; // 틱 시각과 프레임 시각의 부동소수 오차 허용
      f.next += 0.5;
      for (const target of this.targets()) {
        if (dist(f.x, f.y, target.x, target.y) >= f.r + target.r) continue;
        if (f.fusion) this.hitFusion(f.fusion, target, f.damage);
        else this.damage('mine', target, f.damage);
      }
    }
    compact(this.mineFields, (f) => now <= f.until);
  }

  private updateBurns(now: number): void {
    for (const [target, burn] of this.burns) {
      if (target.dead || now > burn.until) {
        this.burns.delete(target);
        continue;
      }
      if (now + 1e-6 < burn.next) continue;
      burn.next += 0.45;
      // 화상 피해 = 불길 한 번 피해(0.34)의 20%
      if (burn.fusionDamage !== undefined) this.hitFusion('inferno', target, burn.fusionDamage);
      else this.damage('flame', target, 0.34 * 0.2);
    }
  }

  private chain(): void {
    const p = this.sim.player;
    let target = this.nearest(p, 390);
    if (!target) return;
    const crown = this.sim.relics.has('crown');
    this.ready.set('chain', this.sim.elapsed + 2.15 * this.sim.relics.cooldownMultiplier);
    if (this.sim.relics.onWeaponActivated()) this.ready.set('chain', this.sim.elapsed);
    const hit = new Set<Target>();
    const points: Point[] = [p];
    while (target && hit.size < this.rankEffect('chain') + (crown ? 2 : 0)) {
      hit.add(target);
      points.push(target);
      const at = { x: target.x, y: target.y };
      this.damage('chain', target, 1.85 * 0.76 ** (hit.size - 1) * (crown ? 0.75 : 1));
      // 폭풍의 왕관: 연쇄 번개가 맞힌 모든 적 자리에서 폭발
      if (crown) this.area('chain', at, 54, 0.75);
      target = this.nearest(target, 125, hit);
    }
    this.trace('chain', points, 0, 0.32);
  }

  private orbit(): void {
    const { player, elapsed } = this.sim;
    const cog = this.sim.relics.has('cog');
    const bladeCount = this.rankEffect('orbit') + Number(cog);
    const radius = 65 * (cog ? 1.2 : 1) + this.sim.reachBonus * 0.08;
    const cogBonus = cog ? 1 + Math.min(0.15, this.cogKills * 0.005) : 1;
    for (let i = 0; i < bladeCount; i++) {
      const angle = elapsed * 4 + i * Math.PI * 2 / bladeCount;
      const blade = this.blades[i] ??= { x: 0, y: 0 };
      blade.x = player.x + Math.cos(angle) * radius;
      blade.y = player.y + Math.sin(angle) * radius;
      for (const target of this.targets()) {
        if ((this.orbitHits.get(target) ?? 0) > elapsed
          || dist(blade.x, blade.y, target.x, target.y) >= target.r + 13) continue;
        const wasAlive = !target.dead;
        this.damage('orbit', target, 0.8 * cogBonus);
        if (cog && wasAlive && target.dead) this.cogKills++;
        if (!target.dead) this.orbitHits.set(target, elapsed + 0.42 * this.sim.relics.periodicHitMultiplier);
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
        this.trace('infection', [target], target.r, 0.46);
        this.damage('infection', target, this.infectionFactor);
      }
    }
    const origins = this.contagion.splice(0);
    const jar = this.sim.relics.has('plagueJar');
    for (const origin of origins) {
      const radius = this.rankEffect('infection');
      const infect = (enemy: Enemy) => {
        this.infected.set(enemy, now + 5);
        this.trace('infection', [origin, enemy], enemy.r, 0.62);
        this.damage('infection', enemy, 1.1 * this.infectionFactor);
      };
      for (const enemy of this.sim.enemies) {
        if (enemy.dead || this.infected.has(enemy) || dist(enemy.x, enemy.y, origin.x, origin.y) > radius + enemy.r) continue;
        infect(enemy);
      }
      // 역병 항아리: 번질 때 범위 밖에서도 가까운 적 2마리 추가 감염 (반경 2배 안)
      for (let extra = 0; jar && extra < 2; extra++) {
        let best: Enemy | null = null;
        let range = radius * 2;
        for (const enemy of this.sim.enemies) {
          if (enemy.dead || this.infected.has(enemy)) continue;
          const d = dist(enemy.x, enemy.y, origin.x, origin.y) - enemy.r;
          if (d < range) { range = d; best = enemy; }
        }
        if (!best) break;
        infect(best);
      }
    }
  }

  /** 역병 항아리: 감염 피해 −20% */
  private get infectionFactor(): number {
    return this.sim.relics.has('plagueJar') ? 0.8 : 1;
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
            // 두 번째 도화선: 폭발 범위만큼의 장판이 2초간 남아 0.5초마다 폭발 피해의 5%(초당 10%)를 준다
            const now = this.sim.elapsed;
            // 0.5·1.0·1.5·2.0초에 4번 (부동소수 오차로 마지막 틱이 빠지지 않게 약간 여유)
            this.mineFields.push({ x: d.x, y: d.y, r: d.r, until: now + 2.05, next: now + 0.5, damage: 2.85 * 0.05 });
            this.trace('mine', [d], d.r, 2);
          }
        }
        break;
      case 'turret': {
        if (finished || d.age < d.next) break;
        const target = this.nearest(d, d.r);
        if (!target) break;
        d.next = d.age + 0.48 * this.sim.relics.periodicHitMultiplier;
        d.angle = Math.atan2(target.y - d.y, target.x - d.x);
        this.trace(d.kind, [d, target], 0, 0.26);
        if ('id' in target) target.slowUntil = this.sim.elapsed + 0.9;
        this.damage(d.kind, target, 0.86);
        break;
      }
      case 'flame':
        if (!finished && this.sim.relics.has('laces')) this.trackFlame(d, dt);
        if (!finished && d.age >= d.next) {
          d.next = d.age + 0.45 * this.sim.relics.periodicHitMultiplier;
          for (const target of this.targets()) {
            if (dist(d.x, d.y, target.x, target.y) < d.r + target.r) this.damage(d.kind, target, 0.34);
          }
        }
        break;
      case 'spear':
        if (finished) {
          this.sweep(d, 12, d.secondary ? 2.6 * 0.5 : 2.6);
          // 별자리 창끝: 적 3마리 이상을 꿰뚫으면 끝 지점에서 좌우로 창 2개
          if (!d.secondary && d.hit.size >= 3 && this.sim.relics.has('constellation')) {
            const end = { x: d.x + Math.cos(d.angle) * d.r, y: d.y + Math.sin(d.angle) * d.r };
            for (const side of [-1, 1]) this.device('spear', end, 0.12, d.r * 0.6, d.angle + side * Math.PI / 2).secondary = true;
          }
        }
        break;
      case 'barrier':
        if (!finished) this.sweep(d, this.rankEffect('barrier'), 1.8);
        break;
      case 'axe': {
        const returning = d.age >= 0.72;
        if (returning && previous < 0.72) d.hit.clear();
        // 귀환의 고리: 돌아오는 동안 타격 반경 +50% → +100%
        if (this.sim.relics.has('returnRing') && d.baseR) d.r = d.baseR * (returning ? 1.5 + 0.5 * Math.min(1, (d.age - 0.72) / 0.8) : 1);
        const p = this.sim.player;
        if (returning) d.angle = Math.atan2(p.y - d.y, p.x - d.x);
        if (returning && dist(d.x, d.y, p.x, p.y) < 16) {
          d.age = d.duration;
          break;
        }
        this.move(d, dt * (returning ? 640 : 480 + this.sim.reachBonus * 0.45));
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
          // 별의 닻: 끌어오는 힘 +50%
          const ratio = Math.min(dt * 105 * (anchor ? 1.5 : 1) / distance, 1);
          const pad = ARENA_CONFIG.wallPadding + e.r;
          e.x = clamp(e.x + (d.x - e.x) * ratio, pad, ARENA_CONFIG.width - pad);
          e.y = clamp(e.y + (d.y - e.y) * ratio, pad, ARENA_CONFIG.height - pad);
        }
        if (finished) this.area(d.kind, d, d.r, 2.5);
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
      // 1초 이상 머물면 2초간 화상 (머무는 동안 계속 갱신)
      if (duration >= 1) {
        const burn = this.burns.get(target);
        this.burns.set(target, { until: this.sim.elapsed + 2, next: burn?.next ?? this.sim.elapsed + 0.45 });
      }
    }
  }

  private move(d: Point & { angle: number }, distance: number): void {
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
