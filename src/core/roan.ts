import { AUTO_COMBAT } from '../config/player';
import { SHOP_TIMING } from '../config/characterShop';
import { SWORD } from '../config/characters';
import { RELICS, type RelicId } from '../config/relics';
import {
  DAGGER_BLEED_CHAIN, DAGGER_THRUST, ROAN_DAMAGE_MASTERY_EFFICIENCY, ROAN_SPEED_MASTERY_EFFICIENCY, ROAN_UPGRADE_DAMAGE_TAKEN, ROAN_UPGRADES, ROAN_WEAPONS, SCIMITAR_CRESCENT, SCIMITAR_THRUST_BONUSES, TWIN_BLADE_DAMAGE_FACTOR,
  type RoanDesign, type RoanGearChoice, type RoanMotion, type RoanUpgradeId, type RoanWeaponId,
} from '../config/roan';
import { bossInvulnerable } from './boss';
import { compact, dist, distToSegment } from './math';
import type { GameSim } from './sim';
import type { AttackVariant, Boss, Enemy, Projectile } from './types';

type Target = Enemy | Boss;
interface Point { x: number; y: number }

/** 한 번의 휘두르기 판정 */
export interface SwordStrike {
  angle: number;
  /** 부채꼴 폭 (라디안). 2π면 원 */
  width: number;
  /** 직선 찌르기의 전체 폭(px) */
  lineWidth?: number;
  offHand?: boolean;
  throwing?: boolean;
  range: number;
  factor: number;
  armorPierce?: number;
  /** 판정 중심 (기본: 로안 위치). 플레일은 타격 지점 */
  center?: Point;
  kind: 'main' | 'combo' | 'extra' | 'shock';
  /** 단검 계열 출혈 중첩 (기본: 쌍검 2, 그 외 1) */
  bleed?: number;
  /** 시미터 각성 초승달 검기 (로안 몸이 아닌 처치 지점에서 날아감) */
  wave?: true;
  /** 찌르기 판정 (할버드 찌르기 연계) */
  thrust?: true;
  blocks?: number;
}

export interface SwordSweep {
  x: number;
  y: number;
  angle: number;
  width: number;
  lineWidth?: number;
  offHand?: boolean;
  wave?: true;
  throwing?: boolean;
  range: number;
  at: number;
  kind: SwordStrike['kind'];
  motion: RoanMotion;
  design: RoanDesign;
  color: number;
  blocked: Point[];
  /** 이번 판정이 맞힌 대상 수 */
  hits: number;
}

interface Bleed { stacks: number; until: number; next: number; design: RoanDesign }

const BASE_DEF = { damage: 1, interval: 1, range: SWORD.range, angle: SWORD.angle, motion: 'slash' as RoanMotion };
const THROW_SOURCES = new Set(['shard', 'thrownAxe', 'weaponThrow', 'smallAxe']);

/** 로안의 무기·상위 무기·각성과 근접 유물. GameSim 이 소유한다. */
export class RoanCombat {
  weapon: RoanWeaponId | null = null;
  upgrade: RoanUpgradeId | null = null;
  awakened = false;
  swings = 0;
  readonly sweeps: SwordSweep[] = [];
  readonly bleeds = new Map<Target, Bleed>();
  private readonly timers: { at: number; run: () => void }[] = [];
  private combo = 0;
  private throws = 0;
  private halberdThrust = false;
  private flailStacks = 0;
  private lastSwingAt = -Infinity;
  private lumber = 0;
  private thirstKills = 0;
  private harvests: number[] = [];
  private weaponThrowReady = 0;
  private moveBoostUntil = -1;
  private danceStacks: number[] = [];
  private fencingUntil = -1;
  private counterUntil = -1;
  private readonly armorHits = new WeakMap<Target, { hits: number; until: number }>();
  private readonly vital = new WeakMap<Target, number>();
  private readonly thrustMarks = new WeakMap<Target, number>();
  private readonly zones: { x: number; y: number; until: number; next: number }[] = [];
  private cdCut = 0;

  constructor(private readonly sim: GameSim) {}

  private get now(): number { return this.sim.elapsed; }
  private m(id: Parameters<GameSim['mastery']>[0]): number { return this.sim.mastery(id); }
  private has(id: RelicId): boolean { return this.sim.relics.has(id); }

  /** 고른 상위 무기의 유물만 발동한다 */
  private gear(id: RelicId): boolean {
    const relic = RELICS[id];
    return this.has(id) && 'form' in relic && relic.form === this.upgrade;
  }

  // ───────── 장비 ─────────

  /** 전용 강화·유물 판정용: 고른 기본 무기와 상위 무기 */
  get forms(): string[] {
    return [this.weapon, this.upgrade].filter((id) => id !== null) as string[];
  }

  get design(): RoanDesign {
    return this.upgrade ?? this.weapon ?? 'base';
  }

  equip(choice: RoanGearChoice): boolean {
    if (choice.stage === 'weapon') {
      if (this.weapon) return false;
      this.weapon = choice.id;
    } else if (choice.stage === 'upgrade') {
      if (!this.weapon || this.upgrade || ROAN_UPGRADES[choice.id].weapon !== this.weapon) return false;
      this.upgrade = choice.id;
    } else {
      if (this.upgrade !== choice.id || this.awakened) return false;
      this.awakened = true;
    }
    return true;
  }

  private get def() {
    if (this.upgrade) return ROAN_UPGRADES[this.upgrade];
    if (this.weapon) return ROAN_WEAPONS[this.weapon];
    return BASE_DEF;
  }

  get motion(): RoanMotion { return this.def.motion; }

  get color(): number {
    return this.weapon ? ROAN_WEAPONS[this.weapon].color : 0xff9676;
  }

  /** 무기의 체력·이동 속도·회피 대기시간 (능력치 계산용 기본값) */
  get baseOverrides(): { maxHp?: number; moveSpeedMul: number; dodgeCooldown?: number } {
    if (!this.weapon) return { moveSpeedMul: 1 };
    const w = ROAN_WEAPONS[this.weapon];
    return { maxHp: w.maxHp, moveSpeedMul: w.moveSpeed, dodgeCooldown: w.dodgeCooldown };
  }

  get damageTaken(): number {
    const base = (this.weapon ? ROAN_WEAPONS[this.weapon].damageTaken : 1) * (this.upgrade ? ROAN_UPGRADE_DAMAGE_TAKEN[this.upgrade] ?? 1 : 1);
    return base * (this.gear('guardStance') && this.sim.relics.still ? 0.85 : 1);
  }

  moveMultiplier(): number {
    const now = this.now;
    let m = now < this.moveBoostUntil ? 1.3 : 1;
    this.danceStacks = this.danceStacks.filter((until) => until > now);
    m *= 1 + 0.05 * Math.min(5, this.danceStacks.length);
    if (this.has('toughMuscle')) m *= 0.95;
    if (this.gear('giantGrip')) m *= 0.95;
    return m;
  }

  // ───────── 수치 ─────────

  private family(w: RoanWeaponId): boolean { return this.weapon === w; }

  get damage(): number {
    let mul = 1 + SWORD.damagePerMastery * this.damageMasteryEfficiency * this.m('swordDamage');
    mul *= this.def.damage;
    if (this.upgrade === 'greatsword') mul *= 1 + 0.12 * this.m('greatswordWeight');
    if (this.gear('giantGrip')) mul *= 1.2;
    if (this.gear('deepCut')) mul *= 0.9;
    // 다른 상위 무기의 유물(계승 등): 효과 대신 검 피해 +5%
    for (const id of this.sim.relics.owned) {
      const relic = RELICS[id];
      if ('form' in relic && relic.form !== this.upgrade) mul *= 1.05;
    }
    return this.sim.stats.damage * SWORD.damage * mul;
  }

  /** 묵직한 일격 효율 (공격이 빠른 무기일수록 낮음) */
  get damageMasteryEfficiency(): number {
    return (this.upgrade && ROAN_DAMAGE_MASTERY_EFFICIENCY[this.upgrade]) ?? (this.weapon && ROAN_DAMAGE_MASTERY_EFFICIENCY[this.weapon]) ?? 1;
  }

  get interval(): number {
    const speedEff = (this.weapon && ROAN_SPEED_MASTERY_EFFICIENCY[this.weapon]) ?? 1;
    let t = SWORD.interval * this.def.interval / this.sim.relics.fireRate * (1 - speedEff * (1 - 0.9 ** this.m('swordSpeed')))
      * (1 + SWORD.intervalPerDamageMastery * this.m('swordDamage'));
    if (this.family('dagger')) t *= 0.9 ** this.m('daggerSpeed');
    if (this.family('waraxe')) t *= 0.92 ** this.m('axeSpeed');
    if (this.upgrade === 'onehand') t *= 0.94 ** this.m('onehandSpeed');
    if (this.gear('earthFury')) t *= 1.1;
    if (this.has('warriorBreath') && this.sim.player.hp <= this.sim.relics.maxHp * 0.5) t *= 0.85;
    return Math.max(0.12, t * (1 + this.sim.characterShopBonus('roanTempo')));
  }

  private get rawAngle(): number {
    let a = this.def.angle + 20 * this.m('swordArc');
    if (this.family('waraxe')) a += 20 * this.m('axeArc');
    if (this.upgrade === 'greataxe') a += 20 * this.m('greataxeEdge');
    if (this.upgrade === 'halberd' && this.awakened) a += 20;
    return a;
  }

  private get thrustWidth(): number {
    return (30 + 6 * this.m('swordArc')) * (this.upgrade === 'halberd' && this.awakened ? 2 : 1);
  }

  get lineWidth(): number | undefined {
    if (!this.family('dagger')) return undefined;
    let width = DAGGER_THRUST.width + DAGGER_THRUST.widthPerMastery * this.m('swordArc');
    if (this.upgrade === 'scimitar') {
      width += SCIMITAR_THRUST_BONUSES.widthPerMastery * this.m('scimitarArc');
      if (this.gear('desertWind')) width += SCIMITAR_THRUST_BONUSES.desertWindWidth;
    }
    return Math.min(DAGGER_THRUST.maxWidth, width);
  }

  /** 베기 각도 (도). 찌르기 무기는 찌르기 폭 */
  get angle(): number {
    if (this.lineWidth !== undefined) return 0;
    if (this.upgrade === 'rapier') return this.thrustWidth;
    if (this.motion === 'spin') return 360;
    return Math.min(360, this.rawAngle);
  }

  /** 넓은 베기가 360°를 넘친 20°당 거리 +5%, 최대 +30% */
  private get overflow(): number {
    if (this.lineWidth !== undefined || this.upgrade === 'rapier' || this.motion === 'spin') return 1;
    const excess = Math.max(0, this.rawAngle - 360);
    return 1 + Math.min(SWORD.overflowRangeMax, excess / 20 * SWORD.overflowRangePer20);
  }

  get range(): number {
    const base = this.def.range;
    let r = Math.min(base * SWORD.maxRange / SWORD.range, base * (1 + 0.12 * this.m('swordRange')));
    if (this.upgrade === 'greatsword') r *= 1 + 0.08 * this.m('greatswordReach');
    if (this.upgrade === 'halberd') r *= 1 + 0.1 * this.m('halberdPole');
    return r * this.overflow * (1 + this.sim.characterShopBonus('roanReach'));
  }

  /** 플레일 회전 반경 */
  get flailRadius(): number {
    const max = 0.4 + 0.15 * this.m('flailSpin');
    return 70 * (1 + Math.min(max, 0.1 * this.flailStacks)) * (1 + 0.1 * this.m('flailChain'))
      * Math.min(SWORD.maxRange / SWORD.range, 1 + 0.12 * this.m('swordRange')) * (1 + this.sim.characterShopBonus('roanReach'));
  }

  private get flailMaxed(): boolean {
    return 0.1 * this.flailStacks >= 0.4 + 0.15 * this.m('flailSpin');
  }

  get targetRange(): number {
    return Math.min(AUTO_COMBAT.range, this.range);
  }

  get bleedMax(): number {
    if (this.upgrade === 'twinblades') return Infinity;
    if (this.upgrade === 'stiletto') return 8 + 2 * this.m('stilettoStacks');
    return 5;
  }

  private get bleedDuration(): number {
    return 3 + this.m('daggerPoison') + 0.5 * this.m('twinChain');
  }

  private bleedPerStack(target: Target): number {
    let mul = 1 + 0.2 * this.m('daggerBleed');
    if (this.upgrade === 'stiletto') mul += 0.5 + 0.15 * this.m('stilettoVenom');
    if (this.gear('deepCut')) mul += 0.25;
    const b = this.bleeds.get(target);
    if (b && this.gear('endlessWound')) mul *= 1 + 0.05 * Math.floor(b.stacks / 10);
    return this.damage / this.def.damage * 0.15 * mul;
  }

  private get stunChance(): number {
    if (!this.family('mace')) return 0;
    let c = this.upgrade === 'warmace' ? 0.5 : 0.35;
    c += 0.08 * this.m('maceStun');
    if (this.upgrade === 'warmace') c += 0.06 * this.m('warmaceWeight');
    if (this.gear('bellBlessing')) c += 0.1;
    return c;
  }

  private get stunDuration(): number {
    return 0.6 + 0.2 * this.m('maceDaze') + (this.upgrade === 'warmace' ? 0.15 * this.m('warmaceSkull') : 0);
  }

  private get woundMax(): number {
    if (!this.family('waraxe')) return 0;
    let w = this.upgrade === 'greataxe' && this.awakened ? 1.0 : 0.5;
    w += 0.15 * this.m('axeWound');
    if (this.upgrade === 'greataxe') w += 0.15 * this.m('greataxeInstinct');
    return w;
  }

  /** 절단: 체력 15% 이하 일반 적은 베기에 즉사 */
  executes(e: Enemy): boolean {
    return this.gear('sever') && e.kind !== 'elite' && e.hp <= e.maxHp * 0.15;
  }

  /** 갑옷 파쇄자·급소 표식: 받는 피해 배율 */
  exposure(target: Target): number {
    const now = this.now;
    let m = 1;
    if ((this.armorHits.get(target)?.until ?? -1) > now) m *= 1.12;
    if ((this.vital.get(target) ?? -1) > now) m *= 1.15;
    return m;
  }

  // ───────── 공격 ─────────

  update(fire: boolean, dodgeStarted: boolean): void {
    const now = this.now;
    const p = this.sim.player;
    if (dodgeStarted) {
      this.fencingUntil = now + this.sim.stats.dodgeDuration + 2;
      if (this.sim.characterShopBonus('roanCounter')) this.counterUntil = now + SHOP_TIMING.roanCounter;
    }
    compact(this.sweeps, (s) => now - s.at < SWORD.sweepDuration);
    for (let i = 0; i < this.timers.length;) {
      if (now + 1e-6 >= this.timers[i].at) this.timers.splice(i, 1)[0].run();
      else i++;
    }
    this.updateBleeds(now);
    this.updateZones(now);
    if (p.fireCd <= 0) {
      p.fireCd = 0;
      if (fire) this.swing();
    }
  }

  private swing(): void {
    const sim = this.sim;
    const p = sim.player;
    let center: Point | undefined;
    if (AUTO_COMBAT.enabled) {
      const target = sim.findTarget(this.targetRange);
      if (!target) return;
      p.aim = Math.atan2(target.y - p.y, target.x - p.x);
      center = { x: target.x, y: target.y };
    }
    sim.facePlayerTo(Math.cos(p.aim), Math.sin(p.aim));
    this.swings++;
    const now = this.now;
    if (now - this.lastSwingAt > 2) this.flailStacks = 0;
    this.lastSwingAt = now;
    this.cdCut = 0;

    let bonus = 1;
    if (this.gear('lumberjack') && this.lumber) {
      bonus *= 1 + 0.1 * this.lumber;
      this.lumber = 0;
    }
    if (this.has('weaponThrow') && now >= this.weaponThrowReady) {
      this.weaponThrowReady = now + 12;
      this.projectile('weaponThrow', p.aim, 300, this.damage * 1.5, 99, 10);
    }

    const angle = p.aim;
    const u = this.upgrade;
    let throwing = false;
    if (u === 'throwingaxe') {
      this.throws++;
      const cycle = Math.max(1, (this.awakened ? 2 : 3) - this.m('throwReturn'));
      throwing = this.throws % cycle === 0;
    }
    let hits = 0;
    if (this.motion === 'spin') {
      // 플레일: 타격 지점을 중심으로 360° 회전
      const at = center ?? { x: p.x + Math.cos(angle) * this.range * 0.6, y: p.y + Math.sin(angle) * this.range * 0.6 };
      const factor = this.flailMaxed && this.gear('centrifugeRush') ? 1.3 : 1;
      hits = this.strike({ angle, width: Math.PI * 2, range: this.flailRadius, factor: factor * bonus, center: at, kind: 'main', blocks: this.gear('chainGuard') ? 3 : 0 });
      this.flailStacks++;
      if (this.awakened) this.later(0.2, () => this.strike({ angle, width: Math.PI * 2, range: this.flailRadius, factor: 0.5 * bonus, center: at, kind: 'extra' }));
    } else if (this.motion === 'twin') {
      const twinBlades = u === 'twinblades';
      const count = twinBlades ? (this.awakened ? 3 : 2) + (this.gear('shadowStrike') && this.swings % 5 === 0 ? 2 : 0) : 2;
      const each = twinBlades ? 1 + 0.08 * this.m('twinCross') / TWIN_BLADE_DAMAGE_FACTOR : 0.5;
      for (let i = 0; i < count; i++) {
        const offHand = i % 2 === 1;
        const run = () => this.strike({
          angle: twinBlades ? angle : angle + (offHand ? 0.18 : -0.18),
          width: this.angle * Math.PI / 180, lineWidth: this.lineWidth, offHand, throwing: throwing || undefined,
          range: this.range, factor: each * bonus, kind: i ? 'extra' : 'main',
        });
        if (i === 0) hits = run();
        else this.later(0.08 * i, run);
      }
    } else if (u === 'halberd') {
      this.halberdThrust = !this.halberdThrust;
      hits = this.halberdThrust
        ? this.strike({ angle, width: this.thrustWidth * Math.PI / 180, range: this.range, factor: bonus, kind: 'main', thrust: true })
        : this.strike({ angle, width: this.angle * Math.PI / 180, range: this.range * 0.75, factor: bonus, kind: 'main' });
    } else {
      const armor = this.family('mace') ? 0.3 + 0.1 * this.m('maceArmor') : 0;
      hits = this.strike({
        angle, width: this.angle * Math.PI / 180, range: this.range, factor: bonus, armorPierce: armor, kind: 'main',
        lineWidth: this.lineWidth,
        thrust: u === 'rapier' ? true : undefined, blocks: this.family('sword') ? this.m('swordParry') : 0,
      });
    }

    const end = { x: p.x + Math.cos(angle) * this.range, y: p.y + Math.sin(angle) * this.range };
    // 검 계열: 연격
    if (this.family('sword')) {
      this.combo++;
      const cycle = Math.max(2, (u === 'onehand' ? 2 : 3) - this.m('swordComboCycle'));
      if (this.combo % cycle === 0) {
        const factor = (u === 'onehand' && this.awakened ? 0.9 : 0.5) + 0.15 * this.m('swordComboDamage');
        const width = u === 'greatsword' && this.awakened ? 360 : Math.min(360, this.angle + (u === 'onehand' ? 30 * this.m('onehandArc') : 0));
        this.later(0.15, () => this.strike({ angle: p.aim, width: width * Math.PI / 180, range: this.range, factor, kind: 'combo', blocks: this.gear('sheathReflect') ? 2 : 0 }));
        if (this.gear('comboRhythm')) this.cdCut = Math.max(this.cdCut, 0.3);
      }
    }
    if (u === 'greatsword' && this.gear('earthSplitter')) this.shock(end, 70, 0.4);
    if (u === 'greataxe' && this.gear('whirlwind') && this.swings % 5 === 0) {
      this.strike({ angle, width: Math.PI * 2, range: this.range, factor: 1, kind: 'extra' });
    }
    if (u === 'maul') this.maulShock(end);
    if (u === 'morningstar' && hits) this.shards(center ?? end, (this.awakened ? 5 : 3) + this.m('morningSpikes'));
    if (throwing) {
      const factor = 0.8 + 0.15 * this.m('throwSpin');
      this.throwAxe(angle, factor);
      if (this.gear('twinThrow')) this.throwAxe(angle + 0.2, factor * 0.6);
    }
    if (u === 'greatsword' && this.gear('heavyMomentum') && hits >= 4) this.cdCut = Math.max(this.cdCut, 0.25);
    if (this.has('chargeStance')) this.moveBoostUntil = this.now + 0.4;
    if (this.gear('bladeDance')) for (let i = 0; i < 2; i++) this.danceStacks.push(this.now + 1);

    sim.emit('swing', p.x, p.y);
    p.fireCd = this.interval * (1 - this.cdCut);
  }

  private later(delay: number, run: () => void): void {
    this.timers.push({ at: this.now + delay, run });
  }

  /** 판정 하나. 맞힌 대상 수를 돌려준다 */
  private strike(s: SwordStrike): number {
    const sim = this.sim;
    const origin = s.center ?? sim.player;
    const { x, y } = origin;
    const { lineWidth } = s;
    const aimX = Math.cos(s.angle);
    const aimY = Math.sin(s.angle);
    const intersects = (t: { x: number; y: number; r: number }) => {
      const dx = t.x - x;
      const dy = t.y - y;
      if (lineWidth !== undefined) {
        const forward = dx * aimX + dy * aimY;
        if (forward < 0 || forward > s.range + t.r) return false;
        const side = Math.abs(dy * aimX - dx * aimY);
        return Math.hypot(Math.max(0, forward - s.range), Math.max(0, side - lineWidth / 2)) <= t.r;
      }
      if (Math.hypot(dx, dy) > s.range + t.r) return false;
      if (s.width >= Math.PI * 2 - 1e-6) return true;
      const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - s.angle), Math.cos(Math.atan2(dy, dx) - s.angle));
      if (Math.abs(delta) <= s.width / 2) return true;
      const edge = s.angle + Math.sign(delta) * s.width / 2;
      return distToSegment(t.x, t.y, x, y, x + Math.cos(edge) * s.range, y + Math.sin(edge) * s.range) <= t.r;
    };
    let hits: Target[] = sim.enemies.filter((e) => !e.dead && intersects(e));
    const boss = sim.boss;
    if (boss && !boss.dead && !bossInvulnerable(boss) && intersects(boss)) hits.push(boss);
    // 레이피어: 가까운 순으로 관통 수까지
    if (this.upgrade === 'rapier' && s.kind !== 'shock') {
      const limit = 4 + this.m('rapierPierce');
      hits = hits.sort((a, b) => dist(x, y, a.x, a.y) - dist(x, y, b.x, b.y)).slice(0, limit);
    }
    const now = this.now;
    let counter = 0;
    if (hits.length && !s.wave && s.kind !== 'shock' && now < this.counterUntil) {
      counter = this.sim.characterShopBonus('roanCounter');
      this.counterUntil = -1;
    }
    const base = this.damage * s.factor * (1 + counter);
    const p = sim.player;
    let near = 0;
    if (this.has('meleeInstinct')) for (const e of sim.enemies) if (!e.dead && dist(p.x, p.y, e.x, e.y) <= 100 + e.r) near++;
    const instinct = 1 + Math.min(0.2, 0.02 * near);
    let lonely = false;
    if (this.gear('duelGrace')) {
      let n = 0;
      for (const e of sim.enemies) if (!e.dead && dist(p.x, p.y, e.x, e.y) <= 200 + e.r && ++n > 1) break;
      if (boss && !boss.dead && dist(p.x, p.y, boss.x, boss.y) <= 200 + boss.r) n++;
      lonely = n === 1;
    }
    const armor = s.armorPierce ?? (this.family('mace') ? 0.3 + 0.1 * this.m('maceArmor') : 0);
    const design = this.design;
    const variant = s.wave ? 'crescent' : s.kind === 'main' && (s.thrust || lineWidth !== undefined) ? 'thrust' : s.kind;
    for (const t of hits) {
      const enemy = 'id' in t ? t : null;
      let dealt = base * instinct * (lonely ? 1.35 : 1);
      const woundMax = this.woundMax;
      if (woundMax) dealt *= 1 + woundMax * Math.max(0, 1 - t.hp / t.maxHp);
      const bleeding = this.bleeds.has(t);
      if (this.upgrade === 'scimitar' && bleeding) dealt *= 1.3 + 0.1 * this.m('scimitarScent');
      const stunned = enemy !== null && enemy.rootedUntil > now;
      if (this.upgrade === 'warmace' && this.awakened && stunned) dealt *= 1.4;
      if (!s.thrust && this.gear('thrustLink') && (this.thrustMarks.get(t) ?? -1) > now) dealt *= 1.3;
      if (s.thrust) this.thrustMarks.set(t, now + 2);
      let crit = false;
      if (this.upgrade === 'rapier' && s.kind !== 'shock') {
        const chance = (this.awakened ? 0.4 : 0.25) + 0.06 * this.m('rapierCrit') + (now < this.fencingUntil && this.gear('fencingStep') ? 0.3 : 0);
        crit = this.sim.rngRelicFx.next() < chance;
        if (crit) dealt *= 2;
      }
      if (enemy) sim.damageEnemy(enemy, dealt, 'sword', armor, variant, design);
      else sim.damageBoss(dealt, 'sword', armor, variant, design);
      if (crit) {
        if (this.gear('vitalMark')) this.vital.set(t, now + 3);
        if (s.kind === 'main' && (this.awakened || this.gear('rapidThrust'))) {
          const target = t;
          this.later(0.1, () => {
            if (target.dead) return;
            const extra = this.damage * 0.5;
            if ('id' in target) sim.damageEnemy(target, extra, 'sword', armor, 'critFollowup', design);
            else sim.damageBoss(extra, 'sword', armor, 'critFollowup', design);
          });
        }
      }
      if (this.has('armorBreaker')) {
        const rec = this.armorHits.get(t) ?? { hits: 0, until: -1 };
        if (++rec.hits >= 3) {
          rec.hits = 0;
          rec.until = now + 5;
        }
        this.armorHits.set(t, rec);
      }
      if (t.dead) continue;
      // 단검 계열: 출혈
      if (this.family('dagger') && s.kind !== 'shock') {
        this.addBleed(t, (s.bleed ?? (this.upgrade === 'twinblades' ? 2 : 1)) + (this.gear('bloodHook') && bleeding ? 1 : 0));
      }
      // 메이스 계열: 기절
      if (enemy && this.family('mace')) {
        if (this.gear('stunBeat') && stunned) this.cdCut = Math.max(this.cdCut, 0.2);
        if (s.kind !== 'shock' || (this.upgrade === 'maul' && this.awakened)) this.tryStun(enemy, 0);
      }
      // 할버드: 밀쳐내기
      if (enemy && this.upgrade === 'halberd' && enemy.kind !== 'elite') {
        const a = Math.atan2(enemy.y - p.y, enemy.x - p.x);
        const push = 40 * (1 + 0.3 * this.m('halberdPush'));
        enemy.x += Math.cos(a) * push;
        enemy.y += Math.sin(a) * push;
        if (this.gear('spearWall')) enemy.rootedUntil = Math.max(enemy.rootedUntil, now + 0.5);
      }
      // 플레일: 사슬 감기
      if (enemy && s.center && this.motion === 'spin' && this.gear('chainHook') && enemy.kind !== 'elite') {
        enemy.x += (s.center.x - enemy.x) * 0.5;
        enemy.y += (s.center.y - enemy.y) * 0.5;
      }
    }
    // 적 탄 막기
    const blocked: Point[] = [];
    let blocks = s.blocks ?? 0;
    if (blocks > 0) {
      for (const shot of sim.enemyShots) {
        if (blocks <= 0) break;
        if (shot.life <= 0 || !intersects(shot)) continue;
        shot.life = 0;
        blocked.push({ x: shot.x, y: shot.y });
        blocks--;
      }
    }
    this.sweeps.push({
      x, y, angle: s.angle, width: s.width, lineWidth, offHand: s.offHand, wave: s.wave, throwing: s.throwing,
      range: s.range, at: now, kind: s.kind,
      motion: s.thrust || lineWidth !== undefined ? 'thrust' : this.upgrade === 'halberd' ? 'slash' : this.motion,
      design: this.design, color: this.color, blocked, hits: hits.length,
    });
    return hits.length;
  }

  private tryStun(enemy: Enemy, bonus: number): boolean {
    const chance = (this.stunChance + bonus) * (enemy.kind === 'elite' ? 0.5 : 1);
    if (chance <= 0 || this.sim.rngRelicFx.next() >= chance) return false;
    enemy.rootedUntil = Math.max(enemy.rootedUntil, this.now + this.stunDuration);
    if (this.gear('ironHead')) this.blast(enemy, 60, this.damage * 0.3, false);
    return true;
  }

  /** 범위 피해 (중심 반경, 검 피해 비율) */
  private shock(at: Point, radius: number, factor: number): void {
    this.strike({ angle: 0, width: Math.PI * 2, range: radius, factor, center: at, kind: 'shock' });
  }

  private blast(at: Point, radius: number, damage: number, stun: boolean, maceQuake = false): void {
    const sim = this.sim;
    for (const e of sim.enemies) {
      if (e.dead || dist(at.x, at.y, e.x, e.y) >= radius + e.r) continue;
      sim.damageEnemy(e, damage, 'sword', 0, 'maceShock');
      if (stun && !e.dead) this.tryStun(e, 0);
    }
    const b = sim.boss;
    if (b && !b.dead && !bossInvulnerable(b) && dist(at.x, at.y, b.x, b.y) < radius + b.r) sim.damageBoss(damage, 'sword', 0, 'maceShock');
    sim.weapons.trace('mine', [at], radius, maceQuake ? 0.43 : 0.35, maceQuake ? 'maceQuake' : undefined);
  }

  private maulShock(at: Point): void {
    const radius = (this.awakened ? 150 : 100) + 15 * this.m('maulQuake');
    const damage = this.damage * 0.5 * (1 + 0.15 * this.m('maulCrush'));
    const stunExtra = this.gear('earthFury') ? 0.4 : 0;
    const once = (scale: number) => {
      this.blast(at, radius, damage * scale, this.awakened, true);
      if (stunExtra) for (const e of this.sim.enemies) if (!e.dead && e.rootedUntil > this.now && dist(at.x, at.y, e.x, e.y) < radius + e.r) e.rootedUntil += stunExtra;
    };
    once(1);
    if (this.gear('quakeWave')) this.later(1, () => once(0.5));
    if (this.gear('crushScar')) {
      this.zones.push({ x: at.x, y: at.y, until: this.now + 2, next: this.now + 0.5 });
      this.sim.weapons.trace('mine', [at], 70, 2, 'maceScar');
    }
  }

  private updateZones(now: number): void {
    for (const z of this.zones) {
      if (now + 1e-6 < z.next) continue;
      z.next += 0.5;
      for (const e of this.sim.enemies) {
        if (e.dead || dist(z.x, z.y, e.x, e.y) >= 70 + e.r) continue;
        if (e.kind !== 'elite') e.slowUntil = Math.max(e.slowUntil, now + 0.6);
        this.sim.damageEnemy(e, this.damage * 0.15, 'sword', 0, 'maceScar', 'maul');
      }
    }
    compact(this.zones, (z) => z.next <= z.until + 1e-6);
  }

  private projectile(source: string, angle: number, range: number, damage: number, pierce: number, r: number, extra: Partial<Projectile> = {}): void {
    const p = this.sim.player;
    const speed = 560;
    this.sim.playerShots.push({
      x: p.x, y: p.y, vx: Math.cos(angle) * speed, vy: Math.sin(angle) * speed, r, damage,
      life: range / speed, source, pierceLeft: pierce, hitIds: new Set<number>(), roanDesign: this.design, ...extra,
    });
  }

  private throwAxe(angle: number, factor: number): void {
    const life = 300 / 560;
    const back = this.awakened ? (this.gear('boomerangEdge') ? 1.5 : 1) : 0;
    this.projectile('thrownAxe', angle, 300, this.damage * factor, 99, 12, back ? { returnLife: life, returnPierce: 99, returnScale: back } : {});
  }

  private shards(from: Point, count: number): void {
    const damage = this.damage * (0.4 + 0.1 * this.m('morningSharp'));
    for (let i = 0; i < count; i++) {
      const angle = Math.PI * 2 * i / count + 0.3;
      this.sim.playerShots.push({
        x: from.x, y: from.y, vx: Math.cos(angle) * 420, vy: Math.sin(angle) * 420, r: 5, damage, life: 0.35, source: 'shard', roanDesign: this.design,
        ...(this.gear('spinSpike') ? { pierceLeft: 1, hitIds: new Set<number>() } : {}),
      });
    }
  }

  /** 로안의 투사체가 적에게 맞았을 때 */
  onShotHit(shot: Projectile, target: Target): void {
    if (shot.source === 'shard') {
      if (this.awakened && this.upgrade === 'morningstar' && 'id' in target && !target.dead) this.tryStun(target, 0);
      if (this.gear('poisonSpike') && !target.dead) this.addBleed(target, 1, 2, 0.1 / 0.15);
    }
    if (shot.source === 'thrownAxe' && this.gear('axeRain')) {
      for (let i = 0; i < 3; i++) {
        const angle = Math.PI * 2 * i / 3;
        this.sim.playerShots.push({ x: target.x, y: target.y, vx: Math.cos(angle) * 360, vy: Math.sin(angle) * 360, r: 6, damage: this.damage * 0.25, life: 0.25, source: 'smallAxe', roanDesign: shot.roanDesign ?? this.design });
      }
    }
  }

  static isRoanShot(source: string): boolean {
    return THROW_SOURCES.has(source);
  }

  // ───────── 출혈 ─────────

  private addBleed(t: Target, stacks: number, duration = this.bleedDuration, scale = 1): void {
    const now = this.now;
    const b = this.bleeds.get(t) ?? { stacks: 0, until: now, next: now + 0.5, design: this.design };
    const max = this.bleedMax;
    const before = b.stacks;
    b.stacks = Math.min(max, b.stacks + stacks * scale);
    b.until = Math.max(b.until, now + duration);
    b.design = this.design;
    this.bleeds.set(t, b);
    if (Number.isFinite(max) && before < max && b.stacks >= max) {
      if (this.upgrade === 'stiletto' && this.awakened) {
        const burst = b.stacks * this.bleedPerStack(t) * Math.max(0, b.until - now);
        this.bleeds.delete(t);
        this.hitBleed(t, burst, 'bleedDetonation', b.design);
      }
    }
  }

  private hitBleed(t: Target, amount: number, variant: AttackVariant, design: RoanDesign): void {
    if (t.dead || amount <= 0) return;
    if ('id' in t) this.sim.damageEnemy(t, amount, 'bleed', 0, variant, design);
    else this.sim.damageBoss(amount, 'bleed', 0, variant, design);
  }

  private updateBleeds(now: number): void {
    for (const [t, b] of this.bleeds) {
      if (t.dead || now > b.until + 1e-6) {
        this.bleeds.delete(t);
        continue;
      }
      if (now + 1e-6 < b.next) continue;
      b.next += 0.5;
      this.hitBleed(t, b.stacks * this.bleedPerStack(t) * 0.5, 'bleedTick', b.design);
    }
  }

  // ───────── 처치·피격 ─────────

  onEnemyKilled(e: Enemy, melee: boolean): void {
    const now = this.now;
    const bleed = this.bleeds.get(e);
    this.bleeds.delete(e);
    if (melee && this.has('bloodThirst') && ++this.thirstKills % 10 === 0) this.sim.relics.heal(3);
    if (this.gear('lumberjack')) this.lumber = Math.min(5, this.lumber + 1);
    if (!bleed) return;
    if (this.gear('bloodFeast')) {
      this.harvests = this.harvests.filter((at) => now - at < 1);
      if (this.harvests.length < 3) {
        this.harvests.push(now);
        this.sim.relics.heal(1);
      }
    }
    if (this.gear('crescentEdge')) {
      this.later(0.15, () => this.strike({ angle: this.sim.player.aim, width: 0, lineWidth: this.lineWidth, range: this.range, factor: 1, kind: 'extra' }));
    }
    this.bleedChain(e, bleed);
    if (this.upgrade === 'scimitar' && this.awakened) {
      const at = { x: e.x, y: e.y };
      const aim = this.sim.player.aim;
      this.strike({
        angle: aim, width: 0, lineWidth: SCIMITAR_CRESCENT.width, range: SCIMITAR_CRESCENT.range, center: at,
        factor: SCIMITAR_CRESCENT.damage, kind: 'extra', bleed: SCIMITAR_CRESCENT.bleedStacks, wave: true,
      });
    }
  }

  /** 단검 계열 출혈 연쇄: 가까운 적에게 출혈 절반이 옮고, 남은 출혈 피해가 터진다 */
  private bleedChain(e: Enemy, bleed: Bleed): void {
    if (!this.family('dagger')) return;
    const { spreadTargets, spreadRadius, burstRadius, burstRadiusRelic, burstMinSeconds } = DAGGER_BLEED_CHAIN;
    const now = this.now;
    const stacks = bleed.stacks;
    const near = this.sim.enemies
      .filter((o) => !o.dead && o !== e && dist(e.x, e.y, o.x, o.y) < spreadRadius + o.r)
      .sort((a, b) => dist(e.x, e.y, a.x, a.y) - dist(e.x, e.y, b.x, b.y))
      .slice(0, spreadTargets);
    const burst = stacks * this.bleedPerStack(e) * Math.max(burstMinSeconds, bleed.until - now);
    for (const o of near) this.addBleed(o, Math.ceil(stacks / 2));
    const radius = this.gear('bloodBurst') ? burstRadiusRelic : burstRadius;
    const sim = this.sim;
    for (const o of sim.enemies) {
      if (o === e || o.dead || dist(e.x, e.y, o.x, o.y) >= radius + o.r) continue;
      sim.damageEnemy(o, burst, 'bleed', 0, 'bleedBurst', bleed.design);
    }
    const b = sim.boss;
    if (b && !b.dead && !bossInvulnerable(b) && dist(e.x, e.y, b.x, b.y) < radius + b.r) sim.damageBoss(burst, 'bleed', 0, 'bleedBurst', bleed.design);
    sim.weapons.trace('mine', [e], radius, 0.3, 'bleedBurst');
  }

  onHurt(): void {
    if (this.gear('spikeShield')) this.shards(this.sim.player, 6);
  }
}
