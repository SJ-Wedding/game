import { FUSION_IDS, WEAPON_FUSIONS, WEAPON_MAX_RANK } from '../config/weapons';
import { OPENING_RELIC_LEVEL, validCarry, type RelicId, type RelicSource } from '../config/relics';
import { RelicEffects, rollRelics } from './relics';
import { ARENA_CONFIG } from '../config/arena';
import { BOSS_CONFIG } from '../config/boss';
import { ENEMY_CONFIG, type EnemyKind, type NormalEnemyKind } from '../config/enemies';
import { AUTO_COMBAT, COMBAT_REACH, PLAYER_BODY, type PlayerStats } from '../config/player';
import { PROGRESSION_CONFIG } from '../config/progression';
import { RUN_CONFIG } from '../config/run';
import { SPAWN_EVENTS, SPAWN_PHASES, type SpawnPhase } from '../config/spawns';
import { DROPS, DROP_CONFIG, type DropKind } from '../config/drops';
import { ALL_UPGRADES, UPGRADE_BY_ID, WEAPON_UPGRADES, type UpgradeId } from '../config/upgrades';
import { metaBonus, type MetaBonus, type MetaPurchases } from './meta';
import { bossInvulnerable, createBoss, updateBoss } from './boss';
import { createEnemy, updateEnemies } from './enemies';
import { clamp, compact, dist, dist2, lerp } from './math';
import { xpToNext } from './progression';
import { deriveSeed, Rng } from './rng';
import { computeStats, emptyStacks, healOnPick, picksFromCounts, type Stacks, type UpgradePick } from './stats';
import type {
  AttackId, Boss, Enemy, Gem, Hazard, InputState, Pickup, Player, Projectile, RunEndCause, RunOutcome, RunResult,
  SimEvent, SimEventType, UpgradeChoice,
} from './types';
import { WeaponSystem } from './weapons';
import { applyUpgrade, luckFor, rollChoices, rollGrade, rollRunChoices } from './upgrades';

export interface SimOptions {
  seed: number;
  /** 이 전투 시각(초)부터 시작 (개발용). 그 이전 스폰 이벤트는 건너뛰고, bossAt 이후면 보스가 바로 등장한다. */
  startTime?: number;
  /** 피해를 받지 않음 (개발용) */
  god?: boolean;
  /** 시작 시 적용할 강화 (개발용) */
  presetUpgrades?: Partial<Record<UpgradeId, number>>;
  presetLevel?: number;
  /** 영구 강화 구매 내역 (토큰 상점). 없으면 영구 강화 0 */
  meta?: MetaPurchases;
  carryRelics?: readonly RelicId[];
}

export type SimPhase = 'combat' | 'levelup' | 'ended';

/** 스폰 기록 (시드 재현성 검증용) */
export interface SpawnRecord {
  tick: number;
  kind: EnemyKind | 'boss';
  /** 플레이어 기준 오프셋 난수 (각도, 거리) */
  angle: number;
  distance: number;
}

/**
 * 전투 규칙 전체. Phaser·DOM 에 의존하지 않으므로 Node 에서 테스트·시뮬레이션할 수 있다.
 * 시간은 step() 이 호출된 "틱" 수로만 흐른다. 일시정지/강화 선택/종료 상태에서는 step() 이 아무것도 하지 않는다.
 */
export class GameSim {
  readonly seed: number;
  readonly rngSpawn: Rng;
  readonly rngUpgrade: Rng;
  readonly rngAi: Rng;
  private readonly rngWeapon: Rng;
  readonly rngDrop: Rng;
  readonly meta: MetaBonus;
  readonly weapons = new WeaponSystem(this);
  readonly relics = new RelicEffects(this);
  private readonly rngRelic: Rng;
  private readonly pendingRewards: (RelicSource | 'armory' | 'bonus')[] = [];
  armoryOpen = false;
  bonusOpen = false;
  readonly options: SimOptions;

  /** 경과 틱. elapsed = tick / tickRate */
  tick: number;
  phase: SimPhase = 'combat';
  paused = false;

  player: Player;
  stacks: Stacks = emptyStacks();
  stats: PlayerStats;
  level = 1;
  xp = 0;
  pendingLevels = 0;
  choices: UpgradeChoice[] = [];
  pickOrder: string[] = [];
  /** 고른 강화(등급 포함) — 능력치 계산의 근거 */
  picks: UpgradePick[] = [];
  /** 지금 열린 레벨업 창이 '시작 강화' 선택인가 */
  startPickOpen = false;
  rerollsLeft = 0;
  rerollsUsed = 0;
  revivesLeft = 0;
  revived = 0;
  pickups: Pickup[] = [];
  itemsCollected = 0;
  /** 자동 조준 중인 대상 (렌더링 표시용) */
  target: { x: number; y: number; r: number } | null = null;

  enemies: Enemy[] = [];
  boss: Boss | null = null;
  bossSpawned = false;
  playerShots: Projectile[] = [];
  enemyShots: Projectile[] = [];
  hazards: Hazard[] = [];
  gems: Gem[] = [];

  kills = 0;
  killsByKind: Record<string, number> = {};
  /** 공격 입력이 실제로 발사된 횟수 (입력 중복 검사용) */
  shotsFired = 0;
  dodges = 0;
  damageTakenTotal = 0;
  readonly damageByAttack: Partial<Record<AttackId, number>> = {};
  private readonly startingTick: number;
  firstLevelUpAt: number | null = null;
  lastDamageSource: string | null = null;
  spawnLog: SpawnRecord[] = [];
  result: RunResult | null = null;

  /** 렌더/오디오/UI 가 소비하는 이벤트 큐 */
  events: SimEvent[] = [];

  private acc = 0;
  private dodgeBuffered = false;
  private nextId = 1;
  private spawnTimer = 0.6;
  private eventIndex = 0;

  constructor(options: SimOptions) {
    this.options = options;
    this.seed = options.seed >>> 0;
    this.rngSpawn = new Rng(deriveSeed(this.seed, 'spawn'));
    this.rngUpgrade = new Rng(deriveSeed(this.seed, 'upgrade'));
    this.rngAi = new Rng(deriveSeed(this.seed, 'ai'));
    this.rngWeapon = new Rng(deriveSeed(this.seed, 'weapon'));
    this.rngDrop = new Rng(deriveSeed(this.seed, 'drop'));
    this.meta = metaBonus(options.meta);
    this.rerollsLeft = PROGRESSION_CONFIG.baseRerolls + this.meta.rerolls;
    this.revivesLeft = this.meta.revives;
    this.rngRelic = new Rng(deriveSeed(this.seed, 'relic'));

    if (options.presetUpgrades) {
      for (const pick of picksFromCounts(options.presetUpgrades)) {
        if (applyUpgrade(this.stacks, pick.id)) {
          this.picks.push(pick);
          this.pickOrder.push(pick.id);
        }
      }
    }
    if (options.presetLevel) this.level = options.presetLevel;
    this.stats = computeStats(this.picks, this.meta);

    this.player = {
      x: ARENA_CONFIG.width / 2,
      y: ARENA_CONFIG.height / 2,
      r: PLAYER_BODY.radius,
      hp: this.stats.maxHp,
      invuln: 0,
      dodgeTime: 0,
      dodgeCd: 0,
      dodgeDx: 0,
      dodgeDy: 0,
      fireCd: 0,
      aim: -Math.PI / 2,
      facingLeft: false,
      hurtFlash: 0,
    };

    const start = Math.max(0, options.startTime ?? 0);
    this.tick = Math.round(start * RUN_CONFIG.tickRate);
    this.startingTick = this.tick;
    for (const id of validCarry(options.carryRelics)) this.relics.acquire(id);
    while (this.eventIndex < SPAWN_EVENTS.length && SPAWN_EVENTS[this.eventIndex].at < start) this.eventIndex++;
    if (start >= RUN_CONFIG.bossAt) this.spawnBoss();

    // 영구 강화 '시작 강화': 전투 전에 강화 1개를 고른다
    if (this.meta.startPick) {
      this.pendingLevels = 1;
      this.startPickOpen = true;
      this.openLevelUp();
    }
  }

  // ───────────────────────── 시간 ─────────────────────────

  get elapsed(): number {
    return this.tick / RUN_CONFIG.tickRate;
  }

  get remaining(): number {
    return Math.max(0, RUN_CONFIG.timeLimit - this.elapsed);
  }

  get assisted(): boolean {
    return !!(this.options.god || this.options.startTime || this.options.presetUpgrades);
  }

  get xpNeeded(): number {
    return xpToNext(this.level);
  }

  /** 전투 시간이 흐르는 상태인가 */
  get running(): boolean {
    return this.phase === 'combat' && !this.paused;
  }

  setPaused(paused: boolean): void {
    this.paused = paused;
    this.acc = 0;
    this.dodgeBuffered = false;
  }

  /**
   * 실제 경과 시간(초)만큼 고정 틱을 진행한다. 프레임마다 호출.
   * 큰 dt(탭 복귀, 느린 프레임)는 maxTicksPerFrame 으로 잘라 시간이 튀지 않게 한다.
   * @returns 실행한 틱 수
   */
  advance(realDt: number, input: InputState): number {
    if (!this.running) {
      this.acc = 0;
      this.dodgeBuffered = false;
      return 0;
    }
    // 고주사율 모니터에서는 틱이 돌지 않는 프레임이 있으므로 회피 입력을 다음 틱까지 보관한다
    if (input.dodge) this.dodgeBuffered = true;
    const tickDt = 1 / RUN_CONFIG.tickRate;
    this.acc += Math.max(0, Math.min(realDt, RUN_CONFIG.maxTicksPerFrame * tickDt));
    let n = 0;
    while (this.acc >= tickDt - 1e-9 && n < RUN_CONFIG.maxTicksPerFrame) {
      this.acc -= tickDt;
      const dodge = this.dodgeBuffered;
      this.dodgeBuffered = false;
      if (this.step(dodge === input.dodge ? input : { ...input, dodge })) n++;
      if (!this.running) {
        this.acc = 0;
        break;
      }
    }
    return n;
  }

  /** 정확히 한 틱 진행. 시간이 흐르지 않는 상태면 false. */
  step(input: InputState): boolean {
    if (!this.running) return false;
    const dt = 1 / RUN_CONFIG.tickRate;
    this.tick++;

    this.relics.update();
    this.updatePlayer(dt, input);
    this.updateSpawner(dt);
    updateEnemies(this, dt);
    updateBoss(this, dt);
    this.weapons.update(dt);
    this.updateProjectiles(dt);
    this.updateHazards(dt);
    this.updateGems(dt);
    this.updatePickups(dt);
    this.cleanup();
    this.checkEnd();
    if (this.phase === 'combat' && (this.pendingLevels || this.pendingRewards.length)) this.openLevelUp();
    return true;
  }

  // ───────────────────────── 플레이어 ─────────────────────────

  private updatePlayer(dt: number, input: InputState): void {
    const p = this.player;
    const s = this.stats;
    if (p.invuln > 0) p.invuln = Math.max(0, p.invuln - dt);
    if (p.dodgeCd > 0) p.dodgeCd = Math.max(0, p.dodgeCd - dt);
    if (p.hurtFlash > 0) p.hurtFlash -= dt;
    if (s.regen > 0 && p.hp > 0) this.relics.heal(s.regen * dt);

    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    // 조준: 자동 전투면 가장 가까운 적, 아니면 마우스 위치
    let fire = input.fire;
    if (AUTO_COMBAT.enabled) {
      this.target = this.findTarget(AUTO_COMBAT.range + this.reachBonus + this.relics.basicReachBonus);
      fire = this.target !== null;
      if (this.target) p.aim = Math.atan2(this.target.y - p.y, this.target.x - p.x);
      else if (len > 0.01) p.aim = Math.atan2(my, mx);
    } else {
      this.target = null;
      p.aim = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    }

    if (input.dodge && p.dodgeCd <= 0 && p.dodgeTime <= 0) {
      if (len > 0.01) {
        p.dodgeDx = mx / Math.hypot(mx, my);
        p.dodgeDy = my / Math.hypot(mx, my);
      } else {
        p.dodgeDx = Math.cos(p.aim);
        p.dodgeDy = Math.sin(p.aim);
      }
      p.dodgeTime = s.dodgeDuration;
      p.dodgeCd = this.relics.dodgeCooldown;
      this.relics.dodgeUntil = this.elapsed + 2;
      p.invuln = Math.max(p.invuln, s.dodgeInvuln);
      this.dodges++;
      this.weapons.onDodge();
      this.emit('dodge', p.x, p.y);
    }

    const horizontal = p.dodgeTime > 0 ? p.dodgeDx : mx;
    if (Math.abs(horizontal) > 0.08) p.facingLeft = horizontal < 0;

    const moveSpeed = s.moveSpeed * this.relics.moveMultiplier(len > 0.01 || p.dodgeTime > 0);
    if (p.dodgeTime > 0) {
      p.dodgeTime -= dt;
      p.x += p.dodgeDx * s.dodgeSpeed * dt;
      p.y += p.dodgeDy * s.dodgeSpeed * dt;
    } else {
      p.x += mx * moveSpeed * dt;
      p.y += my * moveSpeed * dt;
    }
    const pad = ARENA_CONFIG.wallPadding + p.r;
    p.x = clamp(p.x, pad, ARENA_CONFIG.width - pad);
    p.y = clamp(p.y, pad, ARENA_CONFIG.height - pad);

    p.fireCd -= dt;
    if (fire && p.fireCd <= 0) {
      this.firePlayer();
      p.fireCd += 1 / this.relics.fireRate;
      if (p.fireCd < 0) p.fireCd = 0;
    } else if (!fire && p.fireCd < 0) {
      p.fireCd = 0;
    }
  }

  /** 사거리 안에서 몸 가장자리까지 가장 가까운 적(보스 포함). 무적 연출 중인 보스는 제외. */
  get reachBonus(): number {
    return COMBAT_REACH.bonus * clamp((this.elapsed - COMBAT_REACH.start) / (COMBAT_REACH.peak - COMBAT_REACH.start), 0, 1);
  }

  get luck(): number {
    return luckFor(this.level, this.meta.luck + this.stats.luck);
  }

  findTarget(range: number): { x: number; y: number; r: number } | null {
    const p = this.player;
    let best: { x: number; y: number; r: number } | null = null;
    let bestD = range;
    for (const e of this.enemies) {
      if (e.dead) continue;
      const d = dist(e.x, e.y, p.x, p.y) - e.r;
      if (d < bestD) {
        bestD = d;
        best = e;
      }
    }
    const b = this.boss;
    if (b && !b.dead && !bossInvulnerable(b)) {
      const d = dist(b.x, b.y, p.x, p.y) - b.r;
      if (d < bestD) best = b;
    }
    return best;
  }

  private firePlayer(): void {
    const p = this.player;
    const s = this.stats;
    const n = Math.max(1, this.relics.projectileCount);
    const spread = (s.spreadDeg * Math.PI) / 180;
    const speed = this.relics.projectileSpeed;
    const life = (s.projectileRange + this.reachBonus + this.relics.basicReachBonus) / speed;
    const pierceLeft = (this.elapsed >= COMBAT_REACH.pierceAt ? 2 : 0) + Number(this.relics.has('awl'));
    const damage = this.relics.shotDamage();
    for (let i = 0; i < n; i++) {
      const a = p.aim + (i - (n - 1) / 2) * spread;
      const c = Math.cos(a);
      const si = Math.sin(a);
      this.playerShots.push({
        x: p.x + c * (p.r + 4),
        y: p.y + si * (p.r + 4),
        vx: c * speed,
        vy: si * speed,
        r: s.projectileRadius,
        damage,
        life,
        source: 'player',
        ...(pierceLeft ? { pierceLeft, hitIds: new Set<number>() } : {}),
      });
    }
    this.weapons.onShot();
    this.shotsFired++;
    this.emit('shoot', p.x, p.y);
  }

  /** 플레이어 피해 처리. 무적·회피 중이면 무시. 실제로 피해를 입었으면 true */
  hurtPlayer(amount: number, source: string): boolean {
    const p = this.player;
    if (this.phase !== 'combat' || p.hp <= 0) return false;
    if (p.invuln > 0 || p.dodgeTime > 0) return false;
    if (this.options.god) return false;
    const dmg = this.relics.onHurt(amount * this.relics.damageTaken);
    p.hp = Math.max(0, p.hp - dmg);
    p.invuln = Math.max(p.invuln, this.stats.hurtInvuln);
    p.hurtFlash = 0.25;
    this.damageTakenTotal += dmg;
    this.lastDamageSource = source;
    this.emit('hurt', p.x, p.y);
    return true;
  }

  // ───────────────────────── 스폰 ─────────────────────────

  currentSpawnPhase(t: number = this.elapsed): SpawnPhase | null {
    for (const ph of SPAWN_PHASES) if (t >= ph.from && t < ph.to) return ph;
    return null;
  }

  private updateSpawner(dt: number): void {
    const t = this.elapsed;

    // 시각 이벤트 (엘리트)
    while (this.eventIndex < SPAWN_EVENTS.length && SPAWN_EVENTS[this.eventIndex].at <= t) {
      const ev = SPAWN_EVENTS[this.eventIndex++];
      for (let i = 0; i < ev.count + Number(this.relics.has('elitePact')); i++) {
        const pos = this.rollSpawnPosition();
        this.spawnLog.push({ tick: this.tick, kind: ev.kind, angle: pos.angle, distance: pos.distance });
        this.spawnEnemy(ev.kind, pos.x, pos.y);
        this.emit('eliteSpawn', pos.x, pos.y);
      }
    }

    // 보스
    if (!this.bossSpawned && t >= RUN_CONFIG.bossAt) this.spawnBoss();

    // 주기 스폰
    const ph = this.currentSpawnPhase(t);
    if (!ph) return;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const progress = clamp((t - ph.from) / (ph.to - ph.from), 0, 1);
    const density = this.relics.spawnMultiplier;
    this.spawnTimer += lerp(ph.interval[0], ph.interval[1], progress) / density;
    for (let i = 0; i < ph.batch; i++) {
      // 난수는 생성 여부와 관계없이 항상 같은 개수를 소비 → 같은 시드면 같은 스폰 순서
      const kind = this.rollKind(ph);
      const pos = this.rollSpawnPosition();
      const alive = this.enemies.length;
      if (alive >= Math.floor(ph.maxAlive * density)) continue;
      this.spawnLog.push({ tick: this.tick, kind, angle: pos.angle, distance: pos.distance });
      this.spawnEnemy(kind, pos.x, pos.y);
    }
  }

  private rollKind(ph: SpawnPhase): NormalEnemyKind {
    const entries = Object.entries(ph.weights) as [NormalEnemyKind, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.rngSpawn.next() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r < 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  /** 화면 밖 위치를 고른다. 난수 2개(각도·거리)를 소비. */
  private rollSpawnPosition(): { x: number; y: number; angle: number; distance: number } {
    const angle = this.rngSpawn.next() * Math.PI * 2;
    const [dMin, dMax] = ARENA_CONFIG.spawnDistance;
    const distance = lerp(dMin, dMax, this.rngSpawn.next());
    const p = this.player;
    const place = (a: number) => {
      const pad = ARENA_CONFIG.wallPadding + 30;
      return {
        x: clamp(p.x + Math.cos(a) * distance, pad, ARENA_CONFIG.width - pad),
        y: clamp(p.y + Math.sin(a) * distance, pad, ARENA_CONFIG.height - pad),
      };
    };
    let pos = place(angle);
    if (dist(pos.x, pos.y, p.x, p.y) < ARENA_CONFIG.minSpawnDistance) {
      const alt = place(angle + Math.PI);
      if (dist(alt.x, alt.y, p.x, p.y) > dist(pos.x, pos.y, p.x, p.y)) pos = alt;
    }
    return { ...pos, angle, distance };
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const e = createEnemy(this.nextId++, kind, x, y, this.elapsed);
    this.enemies.push(e);
    return e;
  }

  private spawnBoss(): void {
    this.bossSpawned = true;
    const p = this.player;
    // 아레나 중앙 쪽으로, 플레이어에게서 420px 떨어진 곳
    let dx = ARENA_CONFIG.width / 2 - p.x;
    let dy = ARENA_CONFIG.height / 2 - p.y;
    const d = Math.hypot(dx, dy);
    if (d < 1) {
      dx = 0;
      dy = -1;
    } else {
      dx /= d;
      dy /= d;
    }
    const pad = ARENA_CONFIG.wallPadding + BOSS_CONFIG.radius;
    const x = clamp(p.x + dx * 420, pad, ARENA_CONFIG.width - pad);
    const y = clamp(p.y + dy * 420, pad, ARENA_CONFIG.height - pad);
    this.boss = createBoss(x, y);
    this.spawnLog.push({ tick: this.tick, kind: 'boss', angle: 0, distance: 0 });
    this.emit('bossSpawn', x, y);
  }

  spawnEnemyShot(x: number, y: number, angle: number, speed: number, damage: number, r: number, source: string): void {
    this.enemyShots.push({
      x,
      y,
      vx: Math.cos(angle) * speed,
      vy: Math.sin(angle) * speed,
      r,
      damage,
      life: 6,
      source,
    });
  }

  addHazard(x: number, y: number, r: number, dur: number, damage: number, source: string): void {
    const pad = ARENA_CONFIG.wallPadding;
    this.hazards.push({
      x: clamp(x, pad + r * 0.5, ARENA_CONFIG.width - pad - r * 0.5),
      y: clamp(y, pad + r * 0.5, ARENA_CONFIG.height - pad - r * 0.5),
      r,
      t: 0,
      dur,
      damage,
      source,
    });
  }

  // ───────────────────────── 충돌 ─────────────────────────

  private inArena(x: number, y: number): boolean {
    return x > -20 && y > -20 && x < ARENA_CONFIG.width + 20 && y < ARENA_CONFIG.height + 20;
  }

  private updateProjectiles(dt: number): void {
    const boss = this.boss;
    for (const s of this.playerShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      if (s.life <= 0 || !this.inArena(s.x, s.y)) continue;
      for (const e of this.enemies) {
        if (e.dead || s.hitIds?.has(e.id)) continue;
        const rr = e.r + s.r;
        if (dist2(s.x, s.y, e.x, e.y) < rr * rr) {
          if (s.source === 'player') this.weapons.onBulletHit(e);
          else if (s.source === 'echo') this.weapons.onFusionHit('echo', e);
          this.damageEnemy(e, s.damage, s.source === 'player' ? 'basic' : s.source === 'echo' ? 'echo' : undefined);
          if (s.pierceLeft) {
            s.pierceLeft--;
            s.hitIds?.add(e.id);
            continue;
          }
          s.life = 0;
          break;
        }
      }
      if (s.life > 0 && boss && !boss.dead) {
        const rr = boss.r + s.r;
        if (dist2(s.x, s.y, boss.x, boss.y) < rr * rr) {
          s.life = 0;
          if (!bossInvulnerable(boss)) {
            if (s.source === 'player') this.weapons.onBulletHit(boss);
            else if (s.source === 'echo') this.weapons.onFusionHit('echo', boss);
          }
          this.damageBoss(s.damage, s.source === 'player' ? 'basic' : s.source === 'echo' ? 'echo' : undefined);
        }
      }
    }
    compact(this.playerShots, (s) => s.life > 0 && this.inArena(s.x, s.y));

    const p = this.player;
    for (const s of this.enemyShots) {
      s.x += s.vx * dt;
      s.y += s.vy * dt;
      s.life -= dt;
      const rr = p.r + s.r;
      if (s.life > 0 && dist2(s.x, s.y, p.x, p.y) < rr * rr) {
        // 무적(회피) 중이면 통과한다
        if (this.hurtPlayer(s.damage, s.source)) s.life = 0;
      }
    }
    compact(this.enemyShots, (s) => s.life > 0 && this.inArena(s.x, s.y));
  }

  private recordAttackDamage(source: AttackId | undefined, hpBefore: number, hpAfter: number): void {
    if (!source) return;
    const damage = hpBefore - Math.max(0, hpAfter);
    if (damage > 0) this.damageByAttack[source] = (this.damageByAttack[source] ?? 0) + damage;
  }

  damageEnemy(e: Enemy, amount: number, source?: AttackId): void {
    if (e.dead) return;
    const basic = source === 'basic';
    const hpBefore = e.hp;
    e.hp -= amount * this.relics.damageMultiplier(e, basic) * (basic ? 1 - e.basicResistance : 1);
    this.recordAttackDamage(source, hpBefore, e.hp);
    e.flash = 0.08;
    this.emit('hit', e.x, e.y);
    if (e.hp <= 0) {
      e.dead = true;
      this.kills++;
      this.relics.onEnemyKilled();
      if (e.kind === 'elite') this.pendingRewards.push('elite', 'armory');
      this.killsByKind[e.kind] = (this.killsByKind[e.kind] ?? 0) + 1;
      this.gems.push({ x: e.x, y: e.y, value: e.xp, pulled: false });
      this.rollDrop(e);
      this.weapons.onEnemyKilled(e);
      this.emit('kill', e.x, e.y);
    }
  }

  damageBoss(amount: number, source?: AttackId): void {
    const b = this.boss;
    if (!b || b.dead || bossInvulnerable(b)) return;
    const basic = source === 'basic';
    const hpBefore = b.hp;
    b.hp = Math.max(0, b.hp - amount * this.relics.damageMultiplier(b, basic) * (basic ? 1 - BOSS_CONFIG.basicResistance : 1));
    this.recordAttackDamage(source, hpBefore, b.hp);
    b.flash = 0.06;
    this.emit('hit', b.x, b.y);
    if (b.hp <= 0) {
      b.dead = true;
      this.killsByKind.boss = 1;
      this.kills++;
    }
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      h.t += dt;
      if (h.t >= h.dur) {
        if (dist(h.x, h.y, p.x, p.y) < h.r + p.r * 0.5) this.hurtPlayer(h.damage, h.source);
        this.emit('explode', h.x, h.y);
      }
    }
    compact(this.hazards, (h) => h.t < h.dur);
  }

  // ───────────────────────── 경험치 ─────────────────────────

  private updateGems(dt: number): void {
    const p = this.player;
    const radius = this.stats.pickupRadius;
    const speed = PROGRESSION_CONFIG.gemMagnetSpeed;
    for (const g of this.gems) {
      const d = dist(g.x, g.y, p.x, p.y);
      if (g.pulled || d < radius) {
        g.pulled = true;
        if (d < p.r + 8) {
          this.gainXp(g.value);
          g.value = 0;
          continue;
        }
        const step = Math.min(d, speed * dt);
        g.x += ((p.x - g.x) / d) * step;
        g.y += ((p.y - g.y) / d) * step;
      }
    }
    compact(this.gems, (g) => g.value > 0);
  }

  gainXp(amount: number): void {
    const gained = amount * this.stats.xpGain * this.relics.xpMultiplier;
    this.xp += gained;
    this.emit('pickup', this.player.x, this.player.y, gained);
    while (this.xp >= xpToNext(this.level)) {
      this.xp -= xpToNext(this.level);
      this.level++;
      this.pendingLevels++;
      if (this.firstLevelUpAt === null) this.firstLevelUpAt = this.elapsed;
    }
  }

  /** 지금 고르는 레벨업이 몇 레벨 달성분인가 */
  get pendingLevel(): number {
    return this.startPickOpen ? this.level : this.level - this.pendingLevels + 1;
  }

  private rollLevelChoices(exclude: UpgradeId[] = []) {
    const luck = luckFor(this.pendingLevel, this.meta.luck + this.stats.luck);
    // 시작 강화는 무기 후보 규칙(레벨 2·5·8…)을 따르지 않는다
    const level = this.startPickOpen ? 0 : this.pendingLevel;
    const choices = rollRunChoices(this.rngUpgrade, this.rngWeapon, this.stacks, level, luck, exclude);
    return [...(level >= 3 ? this.fusionChoices() : []), ...choices].slice(0, PROGRESSION_CONFIG.choiceCount);
  }

  private fusionChoices(): UpgradeChoice[] {
    return FUSION_IDS.filter((id) => !this.weapons.fusions.has(id)
      && WEAPON_FUSIONS[id].pair.every((weapon) => this.stacks[weapon] === WEAPON_MAX_RANK))
      .map((id) => ({ kind: 'fusion', id }));
  }

  private rollArmoryChoices(): UpgradeChoice[] {
    const choices = this.fusionChoices().slice(0, PROGRESSION_CONFIG.choiceCount);
    const available = WEAPON_UPGRADES.filter((def) => this.stacks[def.id] < def.maxStacks);
    const featured = new Set<UpgradeId>();
    for (const id of FUSION_IDS) {
      const [a, b] = WEAPON_FUSIONS[id].pair;
      if (this.stacks[a] > 0) featured.add(b);
      if (this.stacks[b] > 0) featured.add(a);
    }
    const groups = [available.filter((def) => featured.has(def.id)), available.filter((def) => !featured.has(def.id))];
    for (const pool of groups) {
      while (choices.length < PROGRESSION_CONFIG.choiceCount && pool.length) {
        const def = pool.splice(this.rngWeapon.int(pool.length), 1)[0];
        choices.push({ kind: 'upgrade', def, grade: rollGrade(this.rngWeapon, this.luck), nextStack: this.stacks[def.id] + 1 });
      }
    }
    return choices;
  }

  grantBonusChoices(count: number): void {
    // 장착 보상은 대기 중인 일반 레벨업과 엘리트 보상보다 먼저 연다.
    for (let i = 0; i < count; i++) this.pendingRewards.unshift('bonus');
  }

  get bonusChoicesLeft(): number {
    return Number(this.bonusOpen) + this.pendingRewards.filter((source) => source === 'bonus').length;
  }

  private openLevelUp(): void {
    this.choices = [];
    this.armoryOpen = false;
    this.bonusOpen = false;
    while (this.pendingRewards.length && !this.choices.length) {
      const source = this.pendingRewards.shift()!;
      if (source === 'armory') {
        this.choices = this.rollArmoryChoices();
        this.armoryOpen = this.choices.length > 0;
      } else if (source === 'bonus') {
        this.choices = [...this.fusionChoices(), ...rollChoices(this.rngUpgrade, this.stacks, this.luck)].slice(0, PROGRESSION_CONFIG.choiceCount);
        this.bonusOpen = true;
      } else {
        this.choices = rollRelics(source, this.rngRelic, this.relics.owned);
      }
    }
    if (!this.choices.length && this.pendingLevels) {
      this.choices = this.rollLevelChoices();
    }
    if (!this.choices.length) {
      this.phase = 'combat';
      return;
    }
    this.phase = 'levelup';
    this.acc = 0;
    this.emit('levelup', this.player.x, this.player.y);
  }

  /** 레벨업 후보 중 하나를 선택. 남은 레벨업이 있으면 다음 후보를 바로 보여준다. */
  choose(index: number): boolean {
    if (this.phase !== 'levelup') return false;
    const c = this.choices[index];
    if (!c) return false;
    if (c.kind === 'relic') {
      this.relics.acquire(c.id);
    } else {
      const rewardLevel = !this.armoryOpen && !this.bonusOpen && !this.startPickOpen ? this.pendingLevel : 0;
      if (c.kind === 'fusion') {
        this.weapons.fusions.add(c.id);
        this.pickOrder.push(c.id);
      } else if (c.kind === 'upgrade') {
        if (!applyUpgrade(this.stacks, c.def.id)) return false;
        this.picks.push({ id: c.def.id, grade: c.grade });
        this.stats = computeStats(this.picks, this.meta);
        this.relics.heal(healOnPick(c.def.id, c.grade));
        this.pickOrder.push(c.def.id);
      } else {
        this.relics.heal(c.heal);
        this.pickOrder.push(c.id);
      }
      if (!this.armoryOpen && !this.bonusOpen) {
        this.pendingLevels--;
        this.startPickOpen = false;
      }
      if (rewardLevel === OPENING_RELIC_LEVEL) this.pendingRewards.push('opening');
      else if (rewardLevel > 0 && rewardLevel % 5 === 0) this.pendingRewards.push('level');
    }
    this.openLevelUp();
    this.acc = 0;
    return true;
  }

  /** 레벨업 후보 새로고침. 남은 횟수가 없거나 레벨업 중이 아니면 false */
  reroll(): boolean {
    if (this.phase !== 'levelup' || this.rerollsLeft <= 0 || this.armoryOpen || this.bonusOpen || this.choices[0]?.kind === 'relic') return false;
    const prev = this.choices.filter((c) => c.kind === 'upgrade').map((c) => (c.kind === 'upgrade' ? c.def.id : ('' as UpgradeId)));
    this.rerollsLeft--;
    this.rerollsUsed++;
    this.choices = this.rollLevelChoices(prev);
    this.emit('reroll', this.player.x, this.player.y);
    return true;
  }

  // ───────────────────────── 아이템 ─────────────────────────

  /** 처치 1회당 드랍 판정. 난수는 처치마다 항상 1개 소비 (같은 시드 → 같은 드랍) */
  private rollDrop(e: Enemy): void {
    const r = this.rngDrop.next();
    let kind: DropKind | null = null;
    if (e.kind === 'elite') kind = DROP_CONFIG.eliteGuaranteed;
    else {
      let acc = 0;
      for (const d of DROPS) {
        acc += d.chance;
        if (r < acc) {
          kind = d.kind;
          break;
        }
      }
    }
    if (!kind || this.pickups.length >= DROP_CONFIG.maxOnField) return;
    this.pickups.push({ x: e.x, y: e.y, kind, life: DROP_CONFIG.life });
  }

  private updatePickups(dt: number): void {
    const p = this.player;
    const reach = p.r + DROP_CONFIG.pickupReach;
    for (const it of this.pickups) {
      it.life -= dt;
      if (it.life > 0 && dist(it.x, it.y, p.x, p.y) < reach) {
        this.useItem(it.kind);
        it.life = 0;
      }
    }
    compact(this.pickups, (it) => it.life > 0);
  }

  useItem(kind: DropKind): void {
    const p = this.player;
    this.itemsCollected++;
    if (kind === 'heal') {
      this.relics.heal(DROP_CONFIG.healAmount);
    } else if (kind === 'magnet') {
      for (const g of this.gems) g.pulled = true;
    } else {
      for (const e of this.enemies) {
        if (!e.dead && Math.abs(e.x - p.x) < DROP_CONFIG.bombHalfWidth && Math.abs(e.y - p.y) < DROP_CONFIG.bombHalfHeight) {
          this.damageEnemy(e, DROP_CONFIG.bombDamage, 'bomb');
        }
      }
      this.emit('bomb', p.x, p.y);
    }
    this.emit('item', p.x, p.y);
  }

  // ───────────────────────── 종료 ─────────────────────────

  private cleanup(): void {
    compact(this.enemies, (e) => !e.dead);
  }

  private checkEnd(): void {
    const p = this.player;
    if (!this.boss?.dead && p.hp <= 0 && this.revivesLeft > 0) {
      // 영구 강화 '부활': 체력 50%로 일어나고 주변 적 탄을 지운다
      this.revivesLeft--;
      this.revived++;
      p.hp = this.relics.maxHp * 0.5;
      p.invuln = 2;
      this.enemyShots.length = 0;
      this.emit('revive', p.x, p.y);
    }
    if (this.boss?.dead) this.end('victory', 'boss');
    else if (p.hp <= 0) this.end('defeat', 'death');
    else if (this.elapsed >= RUN_CONFIG.timeLimit) this.end('defeat', 'timeout');
  }

  private end(outcome: RunOutcome, cause: RunEndCause): void {
    this.phase = 'ended';
    this.choices = [];
    this.result = {
      outcome,
      cause,
      killedBy: cause === 'death' ? this.lastDamageSource : null,
      survivalTime: this.elapsed,
      kills: this.kills,
      killsByKind: { ...this.killsByKind },
      level: this.level,
      upgrades: ALL_UPGRADES.filter((u) => this.stacks[u.id] > 0).map((u) => ({
        id: u.id,
        name: UPGRADE_BY_ID[u.id].name,
        stacks: this.stacks[u.id],
        grades: this.picks.filter((pk) => pk.id === u.id).map((pk) => pk.grade),
      })),
      pickOrder: [...this.pickOrder],
      rerollsUsed: this.rerollsUsed,
      revived: this.revived,
      itemsCollected: this.itemsCollected,
      relics: [...this.relics.owned],
      fusions: [...this.weapons.fusions],
      damageByAttack: { ...this.damageByAttack },
      combatTime: (this.tick - this.startingTick) / RUN_CONFIG.tickRate,
      seed: this.seed,
      bossHpRatio: this.boss ? this.boss.hp / this.boss.maxHp : null,
      assisted: this.assisted,
    };
    this.emit(outcome === 'victory' ? 'victory' : 'defeat', this.player.x, this.player.y);
  }

  emit(type: SimEventType, x?: number, y?: number, amount?: number): void {
    // 소비되지 않을 때(헤드리스 시뮬레이션) 무한히 쌓이지 않도록 제한
    if (this.events.length < 512) this.events.push({ type, x, y, amount });
  }

  drainEvents(): SimEvent[] {
    const out = this.events;
    this.events = [];
    return out;
  }

  /** 테스트/개발용: 다른 적 이름 조회 */
  static enemyName(kind: EnemyKind | 'boss'): string {
    return kind === 'boss' ? BOSS_CONFIG.name : ENEMY_CONFIG[kind].name;
  }
}
