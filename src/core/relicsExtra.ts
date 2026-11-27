import { ARENA_CONFIG } from '../config/arena';
import { PLAYER_BASE_STATS } from '../config/player';
import { WEAPON_FUSIONS, WEAPON_IDS, type FusionId, type WeaponId } from '../config/weapons';
import type { RelicId } from '../config/relics';
import { bossInvulnerable } from './boss';
import { clamp, dist, distToSegment } from './math';
import type { GameSim } from './sim';
import type { AttackId, Boss, Enemy, Gem } from './types';

type Target = Boss | Enemy;
type Point = { x: number; y: number };

/** 유물 추가 기획안 유물의 화면 연출. 렌더러가 그리고, 시뮬레이션에는 영향이 없다. */
export type RelicFxKind = 'blast' | 'shard' | 'spread' | 'crit' | 'ring' | 'pull';
export type RelicFxTone = 'fuse' | 'gem' | 'core' | 'vault' | 'phoenix' | 'heat' | 'frost' | 'spore' | 'vortex' | 'overcharge'
  | 'amp' | 'cry' | 'watch' | 'rally' | 'burst' | 'mark';
export interface RelicFx {
  kind: RelicFxKind;
  tone: RelicFxTone;
  x: number;
  y: number;
  x2?: number;
  y2?: number;
  r: number;
  life: number;
  duration: number;
}

interface Dot { stacks: number; until: number; next: number }
interface QueuedBlast extends Point { r: number; damage: number; depth: number; boss: boolean; at: number }
interface Pull { e: Enemy; fx: number; fy: number; tx: number; ty: number; t: number }

const LIGHTNING = new Set<AttackId>(['chain', 'mark', 'storm']);
const FUSION_KEYS = new Set<string>(Object.keys(WEAPON_FUSIONS));
const isWeaponSource = (source?: AttackId): source is WeaponId | FusionId =>
  source !== undefined && ((WEAPON_IDS as readonly string[]).includes(source) || FUSION_KEYS.has(source));

/** 유물 추가 기획안(공통 25 + 캐릭터별 5)의 효과. RelicEffects 와 GameSim 이 호출한다. */
export class ExtraRelics {
  readonly fx: RelicFx[] = [];
  // 처치 연쇄
  private explosionDepth = 0;
  private readonly blastQueue: QueuedBlast[] = [];
  private readonly blastTimes: number[] = [];
  private fuseKills = 0;
  private drumStacks = 0;
  private drumLast = -99;
  private eliteKills = 0;
  // 상태이상
  readonly burns = new Map<Target, Dot>();
  readonly spores = new Map<Target, Dot>();
  readonly charged = new Map<Target, number>();
  private ticking = false;
  // 회피·이동·정지
  private dodging = false;
  private dodgeFrom: Point | null = null;
  readonly paths: { ax: number; ay: number; bx: number; by: number; until: number; next: number }[] = [];
  private stillTime = 0;
  flag: Point | null = null;
  // 피격·저체력
  private vengeUntil = -1;
  vault = 0;
  private cliffHeals: number[] = [];
  private phoenixUntil = -1;
  private phoenixSelfUsed = false;
  // 드랍·수호자
  private magnetBudget = 0;
  readonly cores: (Point & { until: number; damage: number })[] = [];
  // 주기 무기
  private activations = 0;
  private overchargeKind: WeaponId | FusionId | null = null;
  private overchargeUntil = -1;
  private readonly echoLock = new Map<string, number>();
  private hasteUntil = -1;
  // 밀집·정지
  private vortexNext = -1;
  private readonly pulls: Pull[] = [];
  private watchNext = -1;
  stopUntil = -1;
  readonly souls: (Point & { at: number })[] = [];
  // 균열 사수
  private basicHits = 0;
  overheatUntil = -1;
  readonly marks = new Map<Target, { hits: number; until: number }>();
  // 루멘
  readonly rods: (Point & { until: number; next: number; factor: number })[] = [];
  blizzard: (Point & { r: number }) | null = null;
  private blizzardNext = 0;
  private burstReady = 0;
  private turretOnLand = false;
  // 로안
  private cryDone = false;
  private counterUntil = -1;
  private grazed = false;
  private readonly chargeHits = new Set<Target>();
  private bloodStacks = 0;

  constructor(private readonly sim: GameSim) {}

  private has(id: RelicId): boolean { return this.sim.relics.has(id); }
  private get now(): number { return this.sim.elapsed; }
  private chance(p: number): boolean { return this.sim.rngRelicFx.next() < p; }

  private addFx(kind: RelicFxKind, tone: RelicFxTone, at: Point, r: number, duration: number, to?: Point): void {
    if (this.fx.length > 160) this.fx.shift();
    this.fx.push({ kind, tone, x: at.x, y: at.y, r, life: duration, duration, ...(to ? { x2: to.x, y2: to.y } : {}) });
  }

  /** 1타 피해: 균열 사수 기본탄 1발, 루멘 전용 무기 첫 타격, 로안 근접 공격 1회 */
  get hitDamage(): number {
    const { loadout } = this.sim;
    if (loadout.character === 'roan') return this.sim.roan.damage;
    if (loadout.character === 'lumen') return this.sim.weapons.specialistHitDamage();
    return this.sim.relics.shotDamage();
  }

  // ───────── 배율 ─────────

  get fireRateMultiplier(): number {
    let m = 1;
    if (this.has('slaughterDrum')) m *= 1 + 0.01 * this.drumStacks;
    if (this.rallied) m *= 1.2;
    if (this.has('expansionSeal')) m *= 0.92;
    return m;
  }

  get cooldownMultiplier(): number {
    let m = 1;
    if (this.rallied) m /= 1.2;
    if (this.has('expansionSeal')) m /= 0.92;
    if (this.now < this.hasteUntil) m *= 0.7;
    return m;
  }

  get moveMultiplier(): number {
    return this.has('slaughterDrum') && this.drumStacks >= 30 ? 1.15 : 1;
  }

  get damageTakenMultiplier(): number {
    return this.rallied ? 0.9 : 1;
  }

  get maxHpMultiplier(): number {
    return this.has('warCry') ? 1 + 0.1 * this.gearPicks : 1;
  }

  get dodgeCooldownMultiplier(): number {
    return this.has('cliffDance') && this.low ? 0.5 : 1;
  }

  get dodgeSpeedMultiplier(): number {
    return this.has('ironCharge') ? 1.2 : 1;
  }

  /** 확장의 인장: 모든 범위. 과충전 중인 무기는 +30% */
  areaMultiplier(kind?: WeaponId | FusionId): number {
    let m = this.has('expansionSeal') ? 1.2 : 1;
    if (kind && kind === this.overchargeKind && this.now < this.overchargeUntil) m *= 1.3;
    return m;
  }

  /** 과충전 배터리: 다음 발동 피해 */
  weaponDamageMultiplier(kind: WeaponId | FusionId): number {
    return kind === this.overchargeKind && this.now < this.overchargeUntil ? 2.5 : 1;
  }

  /** 기본탄 피해 (무기고 열쇠) */
  get shotDamageMultiplier(): number {
    if (!this.has('armoryKey')) return 1;
    let bonus = 0;
    for (const kind of WEAPON_IDS) {
      const rank = this.sim.stacks[kind] ?? 0;
      if (rank > 0) bonus += 0.05 + (rank >= 3 ? 0.03 : 0);
    }
    return 1 + bonus;
  }

  damageMultiplier(target: Target, source?: AttackId): number {
    const now = this.now;
    let m = 1;
    if (this.has('bountyLedger')) m *= 1 + 0.06 * Math.min(6, this.eliteKills);
    if (this.has('plagueMask')) m *= 1 + 0.08 * Math.min(4, this.statusCount(target));
    if (this.has('sprintEngine')) m *= 1 + clamp((this.sim.lastMoveSpeed / PLAYER_BASE_STATS.moveSpeed - 1) * 0.6, 0, 0.4);
    if (now < this.vengeUntil) m *= 1.3;
    if (now < this.phoenixUntil) m *= 1.6;
    if ('id' in target && this.frozen(target)) m *= 1.4;
    if (source === 'sword' && this.has('warCry')) m *= 1 + 0.08 * this.gearPicks;
    if (this.has('marksman') && isWeaponSource(source) && (this.marks.get(target)?.until ?? -1) > now) m *= 1.4;
    if (this.has('luckyStrike') && !this.ticking && this.chance(this.sim.luck * 0.015)) {
      m *= 3;
      this.addFx('crit', 'gem', target, target.r + 6, 0.35);
    }
    return m;
  }

  /** 역병 의사의 가면: 걸린 상태이상 종류 수 */
  statusCount(t: Target): number {
    const now = this.now;
    let n = 0;
    if ('id' in t) {
      if (t.slowUntil > now || t.fireSlowUntil > now) n++;
      if (t.rootedUntil > now) n++;
    }
    if (this.burns.has(t) || this.sim.weapons.burning(t)) n++;
    if (this.spores.has(t) || ('id' in t && this.sim.weapons.infected.has(t))) n++;
    if (this.sim.roan.bleeds.has(t)) n++;
    return n;
  }

  private get low(): boolean {
    return this.sim.player.hp <= this.sim.relics.maxHp * 0.3;
  }

  private get rallied(): boolean {
    return this.has('rallyFlag') && this.flag !== null;
  }

  private get gearPicks(): number {
    const roan = this.sim.roan;
    return Number(roan.weapon !== null) + Number(roan.upgrade !== null) + Number(roan.awakened);
  }

  /** 멈춘 회중시계: 멈춘 일반 적 */
  frozen(e: Enemy): boolean {
    return this.now < this.stopUntil && e.kind !== 'elite';
  }

  get timeStopped(): boolean {
    return this.now < this.stopUntil;
  }

  // ───────── 폭발 ─────────

  /** 폭발 피해: 이 안에서 처치된 적은 도화선 사슬로 이어진다 */
  withExplosion(fn: () => void, depth = 1): void {
    const before = this.explosionDepth;
    this.explosionDepth = Math.max(before, depth);
    try { fn(); } finally { this.explosionDepth = before; }
  }

  explode(at: Point, radius: number, damage: number, tone: RelicFxTone, depth = 1, hitBoss = true): void {
    const r = radius * this.areaMultiplier();
    const sim = this.sim;
    this.withExplosion(() => {
      for (const e of sim.enemies) {
        if (!e.dead && dist(at.x, at.y, e.x, e.y) < r + e.r) sim.damageEnemy(e, damage, 'relic');
      }
      const b = sim.boss;
      if (hitBoss && b && !b.dead && !bossInvulnerable(b) && dist(at.x, at.y, b.x, b.y) < r + b.r) sim.damageBoss(damage, 'relic');
    }, depth);
    this.addFx('blast', tone, at, r, tone === 'phoenix' ? 0.7 : 0.45);
  }

  // ───────── 이벤트 ─────────

  onKill(e: Enemy, source?: AttackId): void {
    const now = this.now;
    const depth = this.explosionDepth || (source === 'mine' || source === 'bomb' ? 1 : 0);
    if (this.has('fuseChain')) {
      // 연쇄가 눈에 보이도록 한 단계마다 0.12초 뒤에 터진다
      const at = now + 0.12;
      if (depth > 0 && depth < 4) this.blastQueue.push({ x: e.x, y: e.y, r: 70, damage: e.maxHp * 0.12, depth: depth + 1, boss: false, at });
      else if (depth === 0 && ++this.fuseKills % 15 === 0) this.blastQueue.push({ x: e.x, y: e.y, r: 70, damage: e.maxHp * 0.12, depth: 1, boss: false, at });
    }
    if (this.has('slaughterDrum')) {
      if (now - this.drumLast > 3) this.drumStacks = 0;
      this.drumStacks = Math.min(30, this.drumStacks + 1);
      this.drumLast = now;
    }
    if (e.kind === 'elite') {
      this.eliteKills++;
      if (this.has('riftCore')) this.cores.push({ x: e.x, y: e.y, until: now + 4, damage: e.maxHp * 0.15 });
    }
    if (this.has('frostShard') && (e.slowUntil > now || e.fireSlowUntil > now || e.rootedUntil > now)) this.shatter(e);
    if (this.spores.delete(e)) this.spreadSpores(e);
    if (this.has('cliffDance') && this.low) {
      this.cliffHeals = this.cliffHeals.filter((at) => now - at < 1);
      if (this.cliffHeals.length < 3) {
        this.cliffHeals.push(now);
        this.sim.relics.heal(1);
      }
    }
    if (this.has('echoBrand') && isWeaponSource(source) && now >= (this.echoLock.get(source) ?? 0) && this.chance(0.12)) {
      this.echoLock.set(source, now + 2);
      this.sim.weapons.rearm(source, now + 0.2);
      this.addFx('ring', 'overcharge', this.sim.player, 30, 0.3);
    }
    if (this.has('soulHarvest') && this.chance(0.2)) this.souls.push({ x: e.x, y: e.y, at: now + 0.5 });
    const mark = this.marks.get(e);
    if (mark && mark.until > now && this.has('marksman')) this.radialShots(e, 6, this.sim.relics.shotDamage(), 0);
    this.marks.delete(e);
    this.burns.delete(e);
    this.charged.delete(e);
  }

  /** 모든 피해 직후 (불씨 항아리·역병 포자·전하 축적기) */
  onHit(t: Target, source?: AttackId): void {
    if (this.ticking || t.dead || source === 'bleed') return;
    const now = this.now;
    if (this.has('emberJar') && this.chance(0.1)) {
      const burn = this.burns.get(t) ?? { stacks: 0, until: now, next: now + 0.5 };
      burn.stacks = Math.min(3, burn.stacks + 1);
      burn.until = now + 3;
      this.burns.set(t, burn);
    }
    if (this.has('sporePouch') && !this.spores.has(t) && this.chance(0.08)) this.spores.set(t, { stacks: 1, until: now + 4, next: now + 0.5 });
    if (this.has('chargeCell') && source) {
      if (LIGHTNING.has(source)) this.charged.set(t, now + 3);
      else if (source !== 'relic' && (this.charged.get(t) ?? -1) > now && this.chance(0.2)) this.zap(t);
    }
  }

  onBasicHit(t: Target): void {
    const now = this.now;
    if (this.has('overheat')) {
      if (now < this.overheatUntil) this.explode(t, 50, this.sim.relics.shotDamage() * 0.4, 'heat');
      else if (++this.basicHits >= 30) {
        this.basicHits = 0;
        this.overheatUntil = now + 5;
        this.addFx('ring', 'heat', this.sim.player, 40, 0.5);
      }
    }
    if (this.has('marksman') && !t.dead) {
      const mark = this.marks.get(t) ?? { hits: 0, until: -1 };
      if (++mark.hits >= 3) {
        mark.hits = 0;
        mark.until = now + 4;
      }
      this.marks.set(t, mark);
    }
  }

  /** 기본 사격 한 번 (탄피 폭풍) */
  onVolley(shots: number): void {
    if (this.has('casingStorm') && shots % 20 === 0) this.radialShots(this.sim.player, 12, this.sim.relics.shotDamage() * 0.6, 1);
  }

  /** 특수 무기 발동 (과충전 배터리·융합 촉매) */
  onWeaponActivated(kind: WeaponId | FusionId): void {
    const now = this.now;
    if (this.has('overcharge') && ++this.activations % 5 === 0) {
      this.overchargeKind = kind;
      this.overchargeUntil = now + 1.2;
      this.addFx('ring', 'overcharge', this.sim.player, 46, 0.45);
    }
    if (this.has('fusionCatalyst') && FUSION_KEYS.has(kind)) this.hasteUntil = now + 1.5;
  }

  /** 마력 과부하: 이번 전용 무기 발동이 증폭되는가 */
  amplify(at: Point): boolean {
    if (!this.has('manaOverload') || this.sim.masteryPoints < 10 || !this.chance(0.25)) return false;
    this.addFx('ring', 'amp', at, 54, 0.45);
    return true;
  }

  onDodge(): void {
    const p = this.sim.player;
    const now = this.now;
    this.dodgeFrom = { x: p.x, y: p.y };
    this.grazed = false;
    this.chargeHits.clear();
    if (this.has('painVault') && this.vault > 0) {
      this.explode(p, 200, this.vault * 3, 'vault');
      this.vault = 0;
    }
    if (this.has('counterMaster')) this.counterUntil = now + this.sim.stats.dodgeDuration + 1;
    if (this.has('manaBurst') && now >= this.burstReady && this.sim.loadout.character === 'lumen') {
      this.burstReady = now + 6;
      this.addFx('ring', 'amp', p, 40, 0.4);
      if (this.sim.loadout.weapon === 'chain') this.sim.weapons.rearm('chain', now);
      else this.turretOnLand = true;
    }
  }

  onGraze(): void {
    if (!this.has('counterMaster') || this.grazed) return;
    this.grazed = true;
    const p = this.sim.player;
    p.dodgeCd = Math.max(0, p.dodgeCd - 0.5);
  }

  afterHurt(damage: number): void {
    if (damage <= 0) return;
    if (this.has('vengeance')) this.vengeUntil = this.now + 4;
    if (this.has('painVault')) this.vault = Math.min(this.sim.relics.maxHp, this.vault + damage);
  }

  onHeal(amount: number): void {
    if (this.has('bloodWind') && amount > 0) this.bloodStacks = Math.min(30, this.bloodStacks + amount);
  }

  /** 로안 근접 공격 한 번의 배율 (반격의 달인·피바람), 공격하면 소모 */
  swingBonus(): number {
    let m = 1;
    if (this.now < this.counterUntil) {
      m *= 1.6;
      this.counterUntil = -1;
    }
    if (this.bloodStacks > 0) {
      m *= 1 + 0.02 * this.bloodStacks;
      this.bloodStacks = 0;
    }
    return m;
  }

  /** 마지막 성냥·수호천사의 깃털·부활 발동 */
  onRevive(): void {
    if (!this.has('phoenixAsh')) return;
    this.phoenixUntil = this.now + 10;
    this.explode(this.sim.player, 300, this.hitDamage * 10, 'phoenix');
  }

  /** 불사조의 재: 다른 부활 수단이 모두 없을 때 한 번 */
  trySelfRevive(): boolean {
    if (!this.has('phoenixAsh') || this.phoenixSelfUsed) return false;
    this.phoenixSelfUsed = true;
    const p = this.sim.player;
    p.hp = this.sim.relics.maxHp * 0.3;
    p.invuln = Math.max(p.invuln, 2);
    this.addFx('ring', 'cry', p, 90, 0.6);
    return true;
  }

  onMagnet(): void {
    this.magnetBudget = 30;
  }

  onGem(g: Gem): void {
    if (!this.has('gemStorm')) return;
    if (g.magnet && this.magnetBudget > 0) {
      this.magnetBudget--;
      this.explode(g, 120, this.hitDamage * 1.5, 'gem');
    } else if (this.chance(0.04)) this.explode(g, 120, this.hitDamage * 1.5, 'gem');
  }

  /** 뇌전 피뢰주 */
  addRod(at: Point, factor: number): void {
    if (this.rods.length >= 6) this.rods.shift();
    this.rods.push({ x: at.x, y: at.y, until: this.now + 4, next: this.now + 1, factor });
  }

  // ───────── 매 틱 ─────────

  update(dt: number): void {
    const sim = this.sim;
    const p = sim.player;
    const now = this.now;
    compact(this.fx, (fx) => (fx.life -= dt) > 0);

    // 회피 시작·종료
    const dodging = p.dodgeTime > 0;
    if (this.dodging && !dodging) this.onDodgeEnd();
    this.dodging = dodging;
    if (dodging && this.has('ironCharge')) this.ram();

    // 진지의 깃발
    const moving = sim.relics.isMoving;
    if (moving) {
      this.stillTime = 0;
      this.flag = null;
    } else if ((this.stillTime += dt) >= 1.5 && !this.flag && this.has('rallyFlag')) {
      this.flag = { x: p.x, y: p.y };
      this.addFx('ring', 'rally', p, 220, 0.5);
    }

    // 도화선 사슬 대기열 (초당 20회)
    if (this.blastQueue.length) {
      const due = this.blastQueue.filter((b) => b.at <= now + 1e-9);
      compact(this.blastQueue, (b) => b.at > now + 1e-9);
      for (const b of due) {
        while (this.blastTimes.length && now - this.blastTimes[0] >= 1) this.blastTimes.shift();
        if (this.blastTimes.length >= 20) break;
        this.blastTimes.push(now);
        this.explode(b, b.r, b.damage, 'fuse', b.depth, b.boss);
      }
    }

    this.updateDots(now);
    for (const [t, until] of this.charged) if (until <= now || t.dead) this.charged.delete(t);
    for (const [t, mark] of this.marks) if (t.dead || (mark.until < now && mark.hits === 0)) this.marks.delete(t);

    // 그림자 길
    compact(this.paths, (path) => {
      if (now >= path.next) {
        path.next += 0.25;
        const damage = this.hitDamage * 1.2 * 0.25;
        for (const e of sim.enemies) {
          if (e.dead || distToSegment(e.x, e.y, path.ax, path.ay, path.bx, path.by) > 24 + e.r) continue;
          e.slowUntil = Math.max(e.slowUntil, now + 0.3);
          sim.damageEnemy(e, damage, 'relic');
        }
        const b = sim.boss;
        if (b && !b.dead && !bossInvulnerable(b) && distToSegment(b.x, b.y, path.ax, path.ay, path.bx, path.by) <= 24 + b.r) sim.damageBoss(damage, 'relic');
      }
      return now < path.until;
    });

    // 균열 핵 조각
    compact(this.cores, (core) => {
      for (const e of sim.enemies) {
        if (e.dead || e.kind === 'elite') continue;
        const d = dist(e.x, e.y, core.x, core.y);
        if (d > 260 || d < 12) continue;
        const step = Math.min(d - 10, 150 * dt);
        e.x += (core.x - e.x) / d * step;
        e.y += (core.y - e.y) / d * step;
      }
      if (now < core.until) return true;
      this.explode(core, 200, core.damage, 'core', 1, false);
      return false;
    });

    // 소용돌이 부적
    if (this.has('vortexCharm')) {
      if (this.vortexNext < 0) this.vortexNext = now + 8;
      if (now >= this.vortexNext) {
        this.vortexNext = now + 8;
        this.addFx('pull', 'vortex', p, 320, 0.5);
        for (const e of sim.enemies) {
          if (e.dead || e.kind === 'elite') continue;
          const d = dist(e.x, e.y, p.x, p.y);
          if (d > 320 + e.r || d <= 120) continue;
          this.pulls.push({ e, fx: e.x, fy: e.y, tx: p.x + (e.x - p.x) / d * 120, ty: p.y + (e.y - p.y) / d * 120, t: 0 });
        }
      }
    }
    compact(this.pulls, (pull) => {
      pull.t = Math.min(1, pull.t + dt / 0.35);
      const k = 1 - (1 - pull.t) ** 2;
      if (!pull.e.dead) {
        pull.e.x = pull.fx + (pull.tx - pull.fx) * k;
        pull.e.y = pull.fy + (pull.ty - pull.fy) * k;
      }
      return pull.t < 1 && !pull.e.dead;
    });

    // 멈춘 회중시계
    if (this.has('stoppedWatch')) {
      if (this.watchNext < 0) this.watchNext = now + 40;
      if (now >= this.watchNext) {
        this.watchNext = now + 40;
        this.stopUntil = now + 2;
        this.addFx('ring', 'watch', p, 520, 0.6);
      }
    }

    // 영혼 수확
    compact(this.souls, (soul) => {
      if (now < soul.at) return true;
      let target: Target | null = null;
      let best = 600;
      for (const e of sim.enemies) {
        if (e.dead) continue;
        const d = dist(soul.x, soul.y, e.x, e.y);
        if (d < best) { best = d; target = e; }
      }
      const b = sim.boss;
      if (!target && b && !b.dead && dist(soul.x, soul.y, b.x, b.y) < best) target = b;
      if (!target) return false;
      const a = Math.atan2(target.y - soul.y, target.x - soul.x);
      sim.playerShots.push({
        x: soul.x, y: soul.y, vx: Math.cos(a) * 520, vy: Math.sin(a) * 520, r: 7, damage: this.hitDamage * 1.2, life: 1.3,
        source: 'soul', pierceLeft: 1, hitIds: new Set<number>(),
      });
      return false;
    });

    // 뇌전 피뢰주
    compact(this.rods, (rod) => {
      if (now >= rod.next) {
        rod.next += 1;
        const near = sim.enemies.filter((e) => !e.dead && dist(rod.x, rod.y, e.x, e.y) < 170 + e.r)
          .sort((a, b) => dist(rod.x, rod.y, a.x, a.y) - dist(rod.x, rod.y, b.x, b.y)).slice(0, 3);
        for (const e of near) sim.weapons.strikeChain(rod, e, rod.factor);
      }
      return now < rod.until;
    });

    // 눈보라 핵
    this.blizzard = null;
    if (this.has('blizzardCore')) {
      const turrets = sim.weapons.devices.filter((d) => d.kind === 'turret' && d.age < d.duration);
      if (turrets.length >= 3) {
        const cx = turrets.reduce((s, d) => s + d.x, 0) / turrets.length;
        const cy = turrets.reduce((s, d) => s + d.y, 0) / turrets.length;
        const r = Math.min(260, Math.max(...turrets.map((d) => dist(cx, cy, d.x, d.y))) + 50);
        this.blizzard = { x: cx, y: cy, r };
        if (now >= this.blizzardNext) {
          this.blizzardNext = now + 0.5;
          const damage = sim.weapons.specialistHitDamage() * 0.5 * 0.5;
          for (const e of sim.enemies) {
            if (e.dead || dist(cx, cy, e.x, e.y) > r + e.r) continue;
            e.slowUntil = Math.max(e.slowUntil, now + 0.6);
            sim.damageEnemy(e, damage, 'turret');
          }
        }
      }
    }

    // 전장의 함성: 36레벨 각성
    if (this.has('warCry') && sim.roan.awakened && !this.cryDone) {
      this.cryDone = true;
      for (const e of sim.enemies) if (!e.dead && dist(p.x, p.y, e.x, e.y) < 300 + e.r) e.rootedUntil = Math.max(e.rootedUntil, now + 2);
      this.addFx('ring', 'cry', p, 300, 0.7);
    }
  }

  private onDodgeEnd(): void {
    const p = this.sim.player;
    const from = this.dodgeFrom;
    this.dodgeFrom = null;
    if (from && this.has('shadowStep')) {
      this.paths.push({ ax: from.x, ay: from.y, bx: p.x, by: p.y, until: this.now + 2, next: this.now });
    }
    if (this.turretOnLand) {
      this.turretOnLand = false;
      this.sim.weapons.rearm('turret', this.now);
    }
  }

  /** 철벽 돌진: 회피 중 닿은 적 */
  private ram(): void {
    const sim = this.sim;
    const p = sim.player;
    const damage = this.hitDamage;
    for (const e of sim.enemies) {
      if (e.dead || this.chargeHits.has(e) || dist(p.x, p.y, e.x, e.y) > p.r + e.r + 12) continue;
      this.chargeHits.add(e);
      sim.damageEnemy(e, damage, 'sword');
      if (!e.dead && e.kind !== 'elite') {
        const a = Math.atan2(e.y - p.y, e.x - p.x);
        const pad = ARENA_CONFIG.wallPadding + e.r;
        e.x = clamp(e.x + Math.cos(a) * 60, pad, ARENA_CONFIG.width - pad);
        e.y = clamp(e.y + Math.sin(a) * 60, pad, ARENA_CONFIG.height - pad);
      }
      this.addFx('crit', 'burst', e, e.r + 4, 0.25);
    }
    const b = sim.boss;
    if (b && !b.dead && !this.chargeHits.has(b) && dist(p.x, p.y, b.x, b.y) <= p.r + b.r + 12) {
      this.chargeHits.add(b);
      sim.damageBoss(damage, 'sword');
    }
  }

  private updateDots(now: number): void {
    if (!this.burns.size && !this.spores.size) return;
    const base = this.hitDamage;
    this.ticking = true;
    try {
      for (const [t, burn] of this.burns) {
        if (t.dead || now > burn.until) { this.burns.delete(t); continue; }
        if (now < burn.next) continue;
        burn.next += 0.5;
        this.hitTarget(t, base * 0.25 * 0.5 * burn.stacks);
      }
      for (const [t, spore] of this.spores) {
        if (t.dead || now > spore.until) { this.spores.delete(t); continue; }
        if (now < spore.next) continue;
        spore.next += 0.5;
        this.hitTarget(t, base * 0.2 * 0.5);
      }
    } finally {
      this.ticking = false;
    }
  }

  private hitTarget(t: Target, damage: number): void {
    if ('id' in t) this.sim.damageEnemy(t, damage, 'relic');
    else this.sim.damageBoss(damage, 'relic');
  }

  private nearest(from: Point, radius: number, count: number, skip: (e: Enemy) => boolean): Enemy[] {
    return this.sim.enemies
      .filter((e) => !e.dead && !skip(e) && dist(from.x, from.y, e.x, e.y) < radius + e.r)
      .sort((a, b) => dist(from.x, from.y, a.x, a.y) - dist(from.x, from.y, b.x, b.y))
      .slice(0, count);
  }

  /** 서리 결정 */
  private shatter(e: Enemy): void {
    const now = this.now;
    const damage = e.maxHp * 0.1;
    for (const o of this.nearest(e, 170, 4, (o) => o === e)) {
      o.slowUntil = Math.max(o.slowUntil, now + 1);
      this.sim.damageEnemy(o, damage, 'relic');
      this.addFx('shard', 'frost', e, 4, 0.3, o);
    }
    this.addFx('crit', 'frost', e, e.r + 8, 0.3);
  }

  private spreadSpores(e: Enemy): void {
    const now = this.now;
    for (const o of this.nearest(e, 180, 2, (o) => o === e || this.spores.has(o))) {
      this.spores.set(o, { stacks: 1, until: now + 4, next: now + 0.5 });
      this.addFx('spread', 'spore', e, 4, 0.45, o);
    }
  }

  /** 전하 축적기: 감전 */
  private zap(from: Target): void {
    const damage = this.hitDamage * 0.6;
    for (const o of this.nearest(from, 160, 2, (o) => o === from)) {
      this.sim.damageEnemy(o, damage, 'relic');
      this.sim.weapons.trace('chain', [from, o], 0, 0.24);
    }
  }

  private radialShots(at: Point, count: number, damage: number, pierce: number): void {
    const speed = this.sim.relics.projectileSpeed;
    const life = 360 / speed;
    for (let i = 0; i < count; i++) {
      const a = Math.PI * 2 * i / count;
      this.sim.playerShots.push({
        x: at.x, y: at.y, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, r: this.sim.stats.projectileRadius, damage, life,
        source: 'player', ...(pierce ? { pierceLeft: pierce, hitIds: new Set<number>() } : {}),
      });
    }
    this.addFx('ring', 'mark', at, 26, 0.3);
  }
}

function compact<T>(arr: T[], keep: (item: T) => boolean): void {
  let j = 0;
  for (const item of arr) if (keep(item)) arr[j++] = item;
  arr.length = j;
}
