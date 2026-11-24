import {
  DEFAULT_LOADOUT, LUMEN, SWORD, SWORD_FORMS, SWORD_FORM_IDS, SWORD_FORM_LEVELS, characterUpgradeValue,
  crescentFollowupDelay, crushArmorPierce, type CharacterUpgradeId, type Loadout, type SwordFormId,
} from '../config/characters';
import { ECHO_GROWTH, FUSION_ARMOR_PIERCE, FUSION_IDS, WEAPON_FUSIONS, isFusionIngredient } from '../config/weapons';
import { OPENING_RELIC_LEVEL, validCarry, type RelicId, type RelicSource } from '../config/relics';
import { RelicEffects, rollRelics } from './relics';
import { ARENA_CONFIG } from '../config/arena';
import { BOSS_CONFIG } from '../config/boss';
import { ENEMY_CONFIG, ENEMY_SCALING, type EnemyKind, type NormalEnemyKind } from '../config/enemies';
import { AUTO_COMBAT, COMBAT_REACH, PLAYER_BODY, type PlayerStats } from '../config/player';
import { PROGRESSION_CONFIG } from '../config/progression';
import { RUN_CONFIG } from '../config/run';
import { ASSAULT_CONFIG, SPAWN_EVENTS, SPAWN_PHASES, type SpawnPhase } from '../config/spawns';
import { DROPS, DROP_CONFIG, type DropKind } from '../config/drops';
import { ALL_UPGRADES, UPGRADE_BY_ID, WEAPON_UPGRADES, type UpgradeDef, type UpgradeId } from '../config/upgrades';
import { metaBonus, type MetaBonus, type MetaPurchases } from './meta';
import { bossInvulnerable, createBoss, updateBoss } from './boss';
import { createEnemy, updateEnemies } from './enemies';
import { clamp, compact, dist, dist2, distToSegment, lerp } from './math';
import { xpToNext } from './progression';
import { deriveSeed, Rng } from './rng';
import { computeStats, emptyStacks, healOnPick, picksFromCounts, type Stacks, type UpgradePick } from './stats';
import type {
  AttackId, Boss, Enemy, Gem, Hazard, InputState, Pickup, Player, Projectile, RunEndCause, RunOutcome, RunResult,
  SimEvent, SimEventType, UpgradeChoice,
} from './types';
import { WeaponSystem } from './weapons';

function shotAttack(source: string): AttackId | undefined {
  return source === 'player' ? 'basic' : source === 'echo' ? 'echo' : source === 'relic' ? 'relic' : undefined;
}
import { applyUpgrade, luckFor, rollChoices, rollGrade, rollMasteryChoices, rollRunChoices, upgradeAvailable } from './upgrades';

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
  loadout?: Loadout;
}

export type SimPhase = 'combat' | 'levelup' | 'ended';

/** 스폰 기록 (시드 재현성 검증용) */
export interface SpawnRecord {
  tick: number;
  kind: EnemyKind | 'boss';
  /** 플레이어 기준 오프셋 난수 (각도, 거리) */
  angle: number;
  distance: number;
  assault?: true;
}

interface AssaultWarning {
  at: number;
  count: number;
  origin: { x: number; y: number };
  gates: { x: number; y: number; angle: number; distance: number }[];
}

type SwordTarget = Enemy | Boss;

interface SwordStrike {
  form?: SwordFormId;
  angle: number;
  width: number;
  range: number;
  factor: number;
  armorPierce?: number;
  followup?: true;
}

interface SwordSweep extends SwordStrike {
  x: number;
  y: number;
  at: number;
  blocked: { x: number; y: number }[];
}

interface SwordFollowup {
  at: number;
  strike: SwordStrike;
  firstHits: SwordTarget[];
  rhythmReduction: number;
}

const ASSAULT_LINEUP = ['charger', 'spitter', 'charger', 'chaser', 'charger', 'spitter', 'chaser', 'chaser'] as const;

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
  /** 유물 효과 판정 전용 난수 (다른 난수 흐름을 바꾸지 않는다) */
  readonly rngRelicFx: Rng;
  private readonly pendingRewards: (RelicSource | 'armory' | 'bonus' | 'coin')[] = [];
  /** 도박꾼의 동전 결과 안내 (다음 보상 화면에 한 번 표시) */
  coinNotice: string | null = null;
  /** 균열 결정 보장이 지금 후보에 적용되었는가 */
  private rareApplied = false;
  armoryOpen = false;
  bonusOpen = false;
  readonly options: SimOptions;
  readonly loadout: Loadout;
  private readonly masteryValues: Partial<Record<CharacterUpgradeId, number>> = {};
  private masteryPower = 0;
  swordSwings = 0;
  private readonly learnedSwordForms: SwordFormId[] = [];
  readonly swordForms: readonly SwordFormId[] = this.learnedSwordForms;
  private lastSwordForm?: SwordFormId;
  private swordFollowup: SwordFollowup | null = null;
  readonly swordSweeps: SwordSweep[] = [];

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
  assaultWarning: AssaultWarning | null = null;
  playerShots: Projectile[] = [];
  enemyShots: Projectile[] = [];
  hazards: Hazard[] = [];
  gems: Gem[] = [];

  kills = 0;
  private echoKillUnits = 0;
  killsByKind: Record<string, number> = {};
  /** 공격 입력이 실제로 발사된 횟수 (입력 중복 검사용) */
  shotsFired = 0;
  dodges = 0;
  damageTakenTotal = 0;
  readonly damageByAttack: Partial<Record<AttackId, number>> = {};
  readonly hitsByAttack: Partial<Record<AttackId, number>> = {};
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
    this.loadout = options.loadout ?? DEFAULT_LOADOUT;
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
    this.rngRelicFx = new Rng(deriveSeed(this.seed, 'relicFx'));

    if (options.presetLevel) this.level = options.presetLevel;
    if (this.loadout.character === 'roan') {
      const unlocked = SWORD_FORM_LEVELS.filter((level) => level <= this.level).length;
      this.learnedSwordForms.push(...SWORD_FORM_IDS.slice(0, unlocked));
    }
    if (options.presetUpgrades) {
      for (const pick of picksFromCounts(options.presetUpgrades)) {
        const def = UPGRADE_BY_ID[pick.id];
        if (def && upgradeAvailable(this.loadout, def, this.level, this.swordForms)) this.addUpgrade(def, pick.grade);
      }
    }
    if (this.loadout.character === 'lumen') this.stacks[this.loadout.weapon] = Math.max(1, this.stacks[this.loadout.weapon]);
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
      facing: 'south',
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

  get overtime(): boolean {
    return this.elapsed >= RUN_CONFIG.timeLimit;
  }

  get assisted(): boolean {
    return !!(this.options.god || this.options.startTime || this.options.presetUpgrades);
  }

  get xpNeeded(): number {
    return this.xpFor(this.level);
  }

  xpFor(level: number): number {
    const need = xpToNext(level);
    return this.relics.xpNeededMultiplier === 1 ? need : Math.round(need * this.relics.xpNeededMultiplier);
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

    this.relics.update(dt);
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
    if (s.regen > 0 && p.hp > 0) this.relics.heal(s.regen * this.relics.regenMultiplier * dt);

    let mx = input.moveX;
    let my = input.moveY;
    const len = Math.hypot(mx, my);
    if (len > 1) {
      mx /= len;
      my /= len;
    }

    // 조준: 자동 전투면 가장 가까운 적, 아니면 마우스 위치
    let fire = input.fire;
    if (this.loadout.character === 'lumen') {
      fire = false;
      this.target = null;
      if (len > 0.01) p.aim = Math.atan2(my, mx);
    } else if (AUTO_COMBAT.enabled) {
      const range = this.loadout.character === 'roan' ? this.nextSwordRange : AUTO_COMBAT.range + this.reachBonus + this.relics.basicReachBonus;
      this.target = this.findTarget(range);
      if (!this.target && this.loadout.character === 'roan' && this.relics.has('swordScabbard')) {
        this.target = this.enemyShots.find((shot) => shot.life > 0 && dist(p.x, p.y, shot.x, shot.y) <= range + shot.r) ?? null;
      }
      fire = this.target !== null;
      if (this.target) p.aim = Math.atan2(this.target.y - p.y, this.target.x - p.x);
      else if (len > 0.01) p.aim = Math.atan2(my, mx);
    } else {
      this.target = null;
      p.aim = Math.atan2(input.aimY - p.y, input.aimX - p.x);
    }

    // 바람의 장화: 기본 회피가 대기 중이면 추가 충전을 쓴다
    if (input.dodge && p.dodgeTime <= 0 && (p.dodgeCd <= 0 || this.relics.useSpareDodge())) {
      if (len > 0.01) {
        p.dodgeDx = mx / Math.hypot(mx, my);
        p.dodgeDy = my / Math.hypot(mx, my);
      } else {
        p.dodgeDx = Math.cos(p.aim);
        p.dodgeDy = Math.sin(p.aim);
      }
      p.dodgeTime = s.dodgeDuration;
      if (p.dodgeCd <= 0) p.dodgeCd = this.relics.dodgeCooldown;
      p.invuln = Math.max(p.invuln, s.dodgeInvuln);
      this.dodges++;
      this.weapons.onDodge();
      this.relics.onDodge();
      this.emit('dodge', p.x, p.y);
    }

    const horizontal = p.dodgeTime > 0 ? p.dodgeDx : mx;
    if (Math.abs(horizontal) > 0.08) p.facingLeft = horizontal < 0;
    const vertical = p.dodgeTime > 0 ? p.dodgeDy : my;
    if (Math.hypot(horizontal, vertical) > 0.08) this.facePlayer(horizontal, vertical);

    const moving = len > 0.01 || p.dodgeTime > 0;
    const moveSpeed = s.moveSpeed * this.relics.moveMultiplier(moving);
    const fromX = p.x;
    const fromY = p.y;
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
    this.relics.onMove(moving, Math.hypot(p.x - fromX, p.y - fromY));

    p.fireCd -= dt;
    if (this.loadout.character === 'roan') {
      this.updateSwordFollowup();
      if (p.fireCd <= 0) {
        p.fireCd = 0;
        if (fire && !this.swordFollowup) this.swingSword();
      }
    } else if (p.fireCd <= 0) {
      if (fire) {
        this.firePlayer();
        p.fireCd += 1 / this.relics.fireRate;
      }
      p.fireCd = Math.max(0, p.fireCd);
    }
  }

  /** 사거리 안에서 몸 가장자리까지 가장 가까운 적(보스 포함). 무적 연출 중인 보스는 제외. */
  get reachBonus(): number {
    return COMBAT_REACH.bonus * clamp((this.elapsed - COMBAT_REACH.start) / (COMBAT_REACH.peak - COMBAT_REACH.start), 0, 1);
  }

  get luck(): number {
    return luckFor(this.level, this.meta.luck + this.stats.luck + this.relics.luckBonus);
  }

  get echoKillStacks(): number {
    return this.echoKillUnits / ECHO_GROWTH.unitsPerStack;
  }

  private countKill(): void {
    this.kills++;
    const { maxStacks, unitsPerStack, luckPerPoint } = ECHO_GROWTH;
    if (this.echoKillUnits >= maxStacks * unitsPerStack || this.loadout.character !== 'ranger') return;
    const units = Math.round((1 + Math.max(0, this.luck) * luckPerPoint) * unitsPerStack);
    this.echoKillUnits = Math.min(maxStacks * unitsPerStack, this.echoKillUnits + units);
  }

  /** 사거리 안에서 몸 가장자리까지 가장 가까운 적(보스 포함). 무적 연출 중인 보스는 제외. */
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

  private facePlayer(dx: number, dy: number): void {
    this.player.facing = Math.abs(dx) >= Math.abs(dy) ? (dx < 0 ? 'west' : 'east') : (dy < 0 ? 'north' : 'south');
  }

  mastery(id: CharacterUpgradeId): number {
    return this.masteryValues[id] ?? 0;
  }

  get starterDamageMultiplier(): number {
    return LUMEN.baseDamage * (1 + this.masteryPower * LUMEN.damagePerPoint);
  }

  get swordRange(): number {
    return Math.min(SWORD.maxRange, SWORD.range * (1 + 0.12 * this.mastery('swordRange')));
  }

  get nextSwordForm(): SwordFormId | undefined {
    const previous = this.lastSwordForm ? this.swordForms.indexOf(this.lastSwordForm) : -1;
    return this.swordForms[(previous + 1) % (this.swordForms.length || 1)];
  }

  get swordSweep(): SwordSweep | null {
    return this.swordSweeps.at(-1) ?? null;
  }

  private get nextSwordRange(): number {
    return this.swordRange * (this.nextSwordForm === 'swordGuard' ? SWORD_FORMS.swordGuard.range : 1);
  }

  get swordAngle(): number {
    return Math.min(360, SWORD.angle + 20 * this.mastery('swordArc'));
  }

  get swordInterval(): number {
    return Math.max(0.12, SWORD.interval / this.relics.fireRate * 0.9 ** this.mastery('swordSpeed')
      * (1 + SWORD.intervalPerDamageMastery * this.mastery('swordDamage')));
  }

  get swordDamage(): number {
    return this.stats.damage * SWORD.damage * (1 + SWORD.damagePerMastery * this.mastery('swordDamage'));
  }

  private swingSword(): void {
    const p = this.player;
    const form = this.nextSwordForm;
    const range = this.nextSwordRange;
    // 이동이 끝난 위치에서 유효한 대상을 확인한 뒤에만 순서를 넘긴다.
    if (AUTO_COMBAT.enabled) {
      const target = this.findTarget(range) ?? (this.relics.has('swordScabbard')
        ? this.enemyShots.find((shot) => shot.life > 0 && dist(p.x, p.y, shot.x, shot.y) <= range + shot.r) : undefined);
      if (!target) return;
      p.aim = Math.atan2(target.y - p.y, target.x - p.x);
    }
    this.facePlayer(Math.cos(p.aim), Math.sin(p.aim));
    this.lastSwordForm = form;
    this.swordSwings++;

    const config = form ? SWORD_FORMS[form] : undefined;
    const angleBonus = this.swordAngle - SWORD.angle;
    let width = this.swordAngle;
    if (form === 'swordCrush') width = Math.min(150, SWORD_FORMS.swordCrush.angle + angleBonus * 0.35 + 8 * this.mastery('swordCrushWidth'));
    if (form === 'swordGuard') width = Math.min(360, SWORD_FORMS.swordGuard.angle + angleBonus * 0.35 + 12 * this.mastery('swordGuardWidth'));
    const spin = this.relics.has('swordCircle') && this.swordSwings % 3 === 0;
    const factor = (config?.damage ?? 1) + (form === 'swordGuard' ? 0.08 * this.mastery('swordGuardEdge') : 0);
    const hits = this.hitSword({
      form, angle: p.aim, range, width: spin ? Math.PI * 2 : width * Math.PI / 180,
      factor: factor * (spin ? 0.8 : 1),
      armorPierce: form === 'swordCrush' ? crushArmorPierce(this.mastery('swordCrushPierce')) : 0,
    });
    const interval = this.swordInterval * (form === 'swordCrush' ? SWORD_FORMS.swordCrush.interval : 1);
    const rhythmReduction = this.relics.has('swordRhythm') ? interval * 0.35 : 0;
    p.fireCd = interval - (hits.length >= 4 ? rhythmReduction : 0);
    if (form === 'swordCrescent') {
      const edge = this.mastery('swordCrescentEdge');
      this.swordFollowup = {
        at: this.elapsed + crescentFollowupDelay(this.mastery('swordCrescentTempo')),
        strike: {
          form, angle: p.aim, range, width: Math.min(360, this.swordAngle + 8 * edge) * Math.PI / 180,
          factor: SWORD_FORMS.swordCrescent.followupDamage + 0.08 * edge, followup: true,
        },
        firstHits: hits,
        rhythmReduction: hits.length < 4 ? rhythmReduction : 0,
      };
    }
  }

  private updateSwordFollowup(): void {
    compact(this.swordSweeps, (sweep) => this.elapsed - sweep.at < SWORD.sweepDuration);
    const followup = this.swordFollowup;
    if (!followup || this.elapsed + 1e-6 < followup.at) return;
    this.swordFollowup = null;
    const hits = this.hitSword(followup.strike);
    if (followup.rhythmReduction && new Set([...followup.firstHits, ...hits]).size >= 4) {
      this.player.fireCd -= followup.rhythmReduction;
    }
  }

  private hitSword(strike: SwordStrike): SwordTarget[] {
    // 두 번째 베기도 발동 시점의 플레이어 위치에서 판정한다.
    const { x, y } = this.player;
    const { angle, width, range, factor, armorPierce = 0 } = strike;
    const intersects = (target: { x: number; y: number; r: number }) => {
      const dx = target.x - x;
      const dy = target.y - y;
      if (Math.hypot(dx, dy) > range + target.r) return false;
      const delta = Math.atan2(Math.sin(Math.atan2(dy, dx) - angle), Math.cos(Math.atan2(dy, dx) - angle));
      if (Math.abs(delta) <= width / 2) return true;
      const edge = angle + Math.sign(delta) * width / 2;
      return distToSegment(target.x, target.y, x, y, x + Math.cos(edge) * range, y + Math.sin(edge) * range) <= target.r;
    };
    const hits: SwordTarget[] = this.enemies.filter((enemy) => !enemy.dead && intersects(enemy));
    const boss = this.boss;
    if (boss && !boss.dead && !bossInvulnerable(boss) && intersects(boss)) hits.push(boss);
    const damage = this.swordDamage * factor * (hits.length === 1 && this.relics.has('swordDuel') ? 1.5 : 1);
    for (const target of hits) {
      if ('id' in target) this.damageEnemy(target, damage, 'sword', armorPierce);
      else this.damageBoss(damage, 'sword', armorPierce);
    }
    const blocked: { x: number; y: number }[] = [];
    if (this.relics.has('swordScabbard')) {
      for (const shot of this.enemyShots) {
        if (blocked.length === 3) break;
        if (shot.life <= 0 || !intersects(shot)) continue;
        shot.life = 0;
        blocked.push({ x: shot.x, y: shot.y });
      }
    }
    this.swordSweeps.push({ ...strike, x, y, at: this.elapsed, blocked });
    this.emit('swing', x, y);
    return hits;
  }

  private firePlayer(): void {
    const p = this.player;
    const s = this.stats;
    const n = Math.max(1, this.relics.projectileCount);
    const spread = (s.spreadDeg * Math.PI) / 180;
    const speed = this.relics.projectileSpeed;
    const life = (s.projectileRange + this.reachBonus + this.relics.basicReachBonus) / speed;
    const mods = this.relics.volley();
    const pierceLeft = (this.elapsed >= COMBAT_REACH.pierceAt ? 2 : 0) + Number(this.relics.has('awl')) + mods.pierce;
    const damage = this.relics.shotDamage() * mods.damage;
    const shoot = (a: number, back: number) => {
      const c = Math.cos(a);
      const si = Math.sin(a);
      this.playerShots.push({
        x: p.x + c * (p.r + 4 - back),
        y: p.y + si * (p.r + 4 - back),
        vx: c * speed,
        vy: si * speed,
        r: s.projectileRadius * mods.radius,
        damage,
        life,
        source: 'player',
        ...(mods.radius > 1 ? { big: true } : {}),
        ...(pierceLeft ? { pierceLeft, hitIds: new Set<number>() } : {}),
      });
    };
    for (let i = 0; i < n; i++) shoot(p.aim + (i - (n - 1) / 2) * spread, 0);
    // 쌍둥이 그림자 검: 같은 방향으로 잔상 탄 1발
    if (mods.twin) shoot(p.aim, 22);
    this.weapons.onShot();
    this.shotsFired++;
    this.emit('shoot', p.x, p.y);
  }

  /** 플레이어 피해 처리. 무적·회피 중이면 무시. 실제로 피해를 입었으면 true */
  hurtPlayer(amount: number, source: string, kind?: 'shot' | 'contact'): boolean {
    const p = this.player;
    if (this.phase !== 'combat' || p.hp <= 0) return false;
    if (p.invuln > 0 || p.dodgeTime > 0) return false;
    if (this.options.god) return false;
    const dmg = this.relics.onHurt(amount * this.relics.damageTaken(kind));
    p.hp = Math.max(0, p.hp - dmg);
    p.invuln = Math.max(p.invuln, this.stats.hurtInvuln + this.relics.hurtInvulnBonus);
    p.hurtFlash = 0.25;
    this.damageTakenTotal += dmg;
    this.lastDamageSource = source;
    this.emit('hurt', p.x, p.y);
    this.relics.afterHurt(dmg);
    return true;
  }

  // ───────────────────────── 스폰 ─────────────────────────

  currentSpawnPhase(t: number = this.elapsed): SpawnPhase | null {
    for (const ph of SPAWN_PHASES) if (t >= ph.from && t < ph.to) return ph;
    return null;
  }

  private updateSpawner(dt: number): void {
    const t = this.elapsed;

    if (this.assaultWarning && t >= this.assaultWarning.at) this.spawnAssault(this.assaultWarning);
    while (this.eventIndex < SPAWN_EVENTS.length) {
      const ev = SPAWN_EVENTS[this.eventIndex];
      if (t < ev.at - (ev.kind === 'assault' ? ASSAULT_CONFIG.warning : 0)) break;
      this.eventIndex++;
      if (ev.kind === 'assault') {
        if (!ev.bossOnly || (this.boss && !this.boss.dead)) this.warnAssault(ev.at, ev.count);
        continue;
      }
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
    // 보스전 웨이브의 긴 대기시간을 연장전 첫 돌격수 웨이브에 넘기지 않는다.
    if (t === RUN_CONFIG.timeLimit) this.spawnTimer = 0;
    this.spawnTimer -= dt;
    if (this.spawnTimer > 0) return;
    const progress = clamp((t - ph.from) / (ph.to - ph.from), 0, 1);
    const density = this.relics.spawnMultiplier;
    this.spawnTimer += lerp(ph.interval[0], ph.interval[1], progress) / density;
    const weights = this.boss?.phase === 2 && ph.phase2Weights ? ph.phase2Weights : ph.weights;
    const xpMultiplier = ph.xpMultiplier ?? 1;
    const flank = t >= RUN_CONFIG.finalAssaultAt && t < 720;
    const direction = flank ? this.escapeAngle() : undefined;
    for (let i = 0; i < ph.batch; i++) {
      // 난수는 생성 여부와 관계없이 항상 같은 개수를 소비 → 같은 시드면 같은 스폰 순서
      const kind = this.rollKind(weights);
      const pos = this.rollSpawnPosition(kind === 'chaser' ? undefined : direction, kind === 'spitter');
      const alive = this.enemies.length;
      if (alive >= Math.floor(ph.maxAlive * density)) continue;
      this.spawnLog.push({ tick: this.tick, kind, angle: pos.angle, distance: pos.distance });
      this.spawnEnemy(kind, pos.x, pos.y).xp *= xpMultiplier;
    }
  }

  private rollKind(weights: SpawnPhase['weights']): NormalEnemyKind {
    const entries = Object.entries(weights) as [NormalEnemyKind, number][];
    const total = entries.reduce((s, [, w]) => s + w, 0);
    let r = this.rngSpawn.next() * total;
    for (const [k, w] of entries) {
      r -= w;
      if (r < 0) return k;
    }
    return entries[entries.length - 1][0];
  }

  private escapeAngle(): number {
    const dx = ARENA_CONFIG.width / 2 - this.player.x;
    const dy = ARENA_CONFIG.height / 2 - this.player.y;
    return Math.hypot(dx, dy) < 64 ? this.player.aim : Math.atan2(dy, dx);
  }

  private spawnPoint(origin: { x: number; y: number }, angle: number, distance: number): { x: number; y: number } {
    const pad = ARENA_CONFIG.wallPadding + 30;
    return {
      x: clamp(origin.x + Math.cos(angle) * distance, pad, ARENA_CONFIG.width - pad),
      y: clamp(origin.y + Math.sin(angle) * distance, pad, ARENA_CONFIG.height - pad),
    };
  }

  private warnAssault(at: number, count: number): void {
    const { x, y } = this.player;
    const origin = { x, y };
    const escape = this.escapeAngle();
    const range = ARENA_CONFIG.spawnDistance[0];
    const gates = [-Math.PI / 2, Math.PI / 2, Math.PI].map((offset) => {
      const wanted = escape + offset;
      let best = { ...this.spawnPoint(origin, wanted, range), angle: wanted, distance: 0 };
      for (const shift of [0, -0.45, 0.45, -0.95, 0.95]) {
        const point = this.spawnPoint(origin, wanted + shift, range);
        const distance = dist(x, y, point.x, point.y);
        if (distance > best.distance) best = { ...point, angle: Math.atan2(point.y - y, point.x - x), distance };
        if (distance >= ARENA_CONFIG.minSpawnDistance) break;
      }
      return best;
    });
    this.assaultWarning = { at, count, origin, gates };
    this.emit('assaultWarning', x, y, count);
  }

  private spawnAssault(assault: AssaultWarning): void {
    this.assaultWarning = null;
    const ph = this.currentSpawnPhase()!;
    const budget = Math.floor(ph.maxAlive * this.relics.spawnMultiplier) + assault.count;
    const gateCount = assault.gates.length;
    for (let i = 0; i < assault.count && this.enemies.length < budget; i++) {
      // 좌·우·뒤를 번갈아 채우고, 각 방향의 실제 인원수로 대형을 가운데 정렬한다.
      const gateIndex = i % gateCount;
      const gate = assault.gates[gateIndex];
      const row = Math.floor(i / gateCount);
      const rows = Math.ceil((assault.count - gateIndex) / gateCount);
      const angle = gate.angle + (row - (rows - 1) / 2) * 0.025;
      const pos = this.spawnPoint(assault.origin, angle, gate.distance + (row % 3) * 36);
      const kind = ASSAULT_LINEUP[row % ASSAULT_LINEUP.length];
      const enemy = this.spawnEnemy(kind, pos.x, pos.y);
      enemy.reinforced = true;
      enemy.maxHp = Math.round(enemy.maxHp * ASSAULT_CONFIG.hpMultiplier);
      enemy.hp = enemy.maxHp;
      enemy.dmgMul *= ASSAULT_CONFIG.damageMultiplier;
      enemy.xp *= ASSAULT_CONFIG.xpMultiplier;
      this.spawnLog.push({ tick: this.tick, kind, angle, distance: gate.distance, assault: true });
    }
  }

  /** 화면 밖 위치를 고른다. 난수 2개(각도·거리)를 소비. */
  private rollSpawnPosition(direction?: number, behind = false): { x: number; y: number; angle: number; distance: number } {
    const sample = this.rngSpawn.next();
    const angle = direction === undefined ? sample * Math.PI * 2
      : direction + (behind ? Math.PI : sample < 0.5 ? -Math.PI / 2 : Math.PI / 2) + (sample % 0.5 - 0.25);
    const [dMin, dMax] = ARENA_CONFIG.spawnDistance;
    const distance = lerp(dMin, dMax, this.rngSpawn.next());
    const p = this.player;
    let pos = this.spawnPoint(p, angle, distance);
    if (dist(pos.x, pos.y, p.x, p.y) < ARENA_CONFIG.minSpawnDistance) {
      const alt = this.spawnPoint(p, angle + Math.PI, distance);
      if (dist(alt.x, alt.y, p.x, p.y) > dist(pos.x, pos.y, p.x, p.y)) pos = alt;
    }
    return { ...pos, angle, distance };
  }

  spawnEnemy(kind: EnemyKind, x: number, y: number): Enemy {
    const e = createEnemy(this.nextId++, kind, x, y, this.elapsed);
    this.enemies.push(e);
    return e;
  }

  spawnBoss(): void {
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
          this.damageEnemy(e, s.damage, shotAttack(s.source));
          if (s.source === 'echo' && e.dead && !s.echoRepeat) this.weapons.onEchoKill(e, Math.atan2(s.vy, s.vx), s.echoVolley);
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
          this.damageBoss(s.damage, shotAttack(s.source));
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
        // 무적(회피) 중이면 통과한다. 잔상 망토가 켜져 있으면 맞지 않는다.
        if (p.dodgeTime > 0) this.relics.onGraze();
        if (!this.relics.shotImmune && this.hurtPlayer(s.damage, s.source, 'shot')) s.life = 0;
      }
    }
    compact(this.enemyShots, (s) => s.life > 0 && this.inArena(s.x, s.y));
  }

  private recordAttackDamage(source: AttackId | undefined, damage: number): void {
    if (source && damage > 0) {
      this.damageByAttack[source] = (this.damageByAttack[source] ?? 0) + damage;
      this.hitsByAttack[source] = (this.hitsByAttack[source] ?? 0) + 1;
    }
  }

  damageEnemy(e: Enemy, amount: number, source?: AttackId, swordArmorPierce = 0): void {
    if (e.dead) return;
    const basic = source === 'basic';
    const t = this.elapsed;
    const { resistanceAt, initialResistance, resistancePerMinute, finalResistancePerMinute, maxResistance, eliteDurability } = ENEMY_SCALING;
    const finalAt = RUN_CONFIG.finalAssaultAt;
    const regularMinutes = (Math.min(t, finalAt) - resistanceAt) / 60;
    const finalMinutes = Math.max(0, t - finalAt) / 60;
    const resistance = t < resistanceAt ? 0 : Math.min(maxResistance,
      initialResistance + regularMinutes * resistancePerMinute + finalMinutes * finalResistancePerMinute);
    const resistanceMultiplier = source === 'sword' ? 0.85 ** this.mastery('swordPierce') * (1 - swordArmorPierce)
      : source && Object.hasOwn(WEAPON_FUSIONS, source) ? 1 - FUSION_ARMOR_PIERCE : 1;
    const armor = basic || source === 'sword' ? e.basicResistance * resistanceMultiplier : 0;
    let damage = amount * this.relics.damageMultiplier(e, basic) * (1 - resistance * resistanceMultiplier) * (1 - armor);
    if (e.kind === 'elite') damage /= eliteDurability;
    if (basic && this.relics.executes(e)) damage = Math.max(damage, e.hp);
    e.hp -= damage;
    this.relics.onDamageEnemy(e);
    this.recordAttackDamage(source, damage);
    e.flash = 0.08;
    this.emit('hit', e.x, e.y);
    if (e.hp <= 0) {
      e.dead = true;
      this.countKill();
      this.relics.onEnemyKilled(e, source);
      if (e.kind === 'elite') this.pendingRewards.push(...(this.relics.has('gamblerCoin') ? ['coin' as const] : []), 'elite', 'armory');
      this.killsByKind[e.kind] = (this.killsByKind[e.kind] ?? 0) + 1;
      this.gems.push({ x: e.x, y: e.y, value: e.xp, pulled: false });
      this.rollDrop(e);
      this.weapons.onEnemyKilled(e);
      this.emit('kill', e.x, e.y);
    }
    if (basic) {
      this.weapons.onBulletHit(e);
      this.relics.onBasicHit(e);
    }
  }

  damageBoss(amount: number, source?: AttackId, swordArmorPierce = 0): void {
    const b = this.boss;
    if (!b || b.dead || bossInvulnerable(b)) return;
    const basic = source === 'basic';
    const armor = basic ? BOSS_CONFIG.basicResistance
      : source === 'sword' ? BOSS_CONFIG.basicResistance * 0.85 ** this.mastery('swordPierce') * (1 - swordArmorPierce) : 0;
    const damage = amount * this.relics.damageMultiplier(b, basic) * (1 - armor);
    b.hp = Math.max(0, b.hp - damage);
    this.recordAttackDamage(source, damage);
    b.flash = 0.06;
    this.emit('hit', b.x, b.y);
    if (b.hp <= 0) {
      b.dead = true;
      this.killsByKind.boss = 1;
      this.countKill();
    }
    if (basic) {
      this.weapons.onBulletHit(b);
      this.relics.onBasicHit(b);
    }
  }

  private updateHazards(dt: number): void {
    const p = this.player;
    for (const h of this.hazards) {
      h.t += dt;
      if (h.t >= h.dur) {
        if (dist2(h.x, h.y, p.x, p.y) <= h.r * h.r) this.hurtPlayer(h.damage, h.source);
        this.emit('explode', h.x, h.y);
      }
    }
    compact(this.hazards, (h) => h.t < h.dur);
  }

  // ───────────────────────── 경험치 ─────────────────────────

  private updateGems(dt: number): void {
    const p = this.player;
    const radius = this.stats.pickupRadius * this.relics.pickupRadiusMultiplier;
    const rotting = this.relics.has('rottingGem');
    const speed = PROGRESSION_CONFIG.gemMagnetSpeed;
    for (const g of this.gems) {
      g.age = (g.age ?? 0) + dt;
      // 썩어 가는 보석: 끌려오지 않은 보석은 10초 뒤 사라진다
      if (rotting && !g.pulled && g.age > 10) {
        g.value = 0;
        continue;
      }
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
    while (this.xp >= this.xpFor(this.level)) {
      this.xp -= this.xpFor(this.level);
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
    const luck = luckFor(this.pendingLevel, this.meta.luck + this.stats.luck + this.relics.luckBonus);
    // 시작 강화는 무기 후보 규칙(레벨 2·5·8…)을 따르지 않는다
    const level = this.startPickOpen ? 0 : this.pendingLevel;
    if (this.loadout.character === 'roan' && SWORD_FORM_LEVELS.includes(level)) {
      const forms = SWORD_FORM_IDS.filter((id) => !this.swordForms.includes(id));
      if (forms.length) {
        this.rareApplied = false;
        return forms.map((id): UpgradeChoice => ({ kind: 'swordForm', id }));
      }
    }
    const choices = this.loadout.character === 'ranger'
      ? rollRunChoices(this.rngUpgrade, this.rngWeapon, this.stacks, level, luck, exclude)
      : rollMasteryChoices(this.rngUpgrade, this.stacks, this.loadout, this.pendingLevel, luck, { exclude, forms: this.swordForms });
    let out = [...(level >= 3 ? this.fusionChoices() : []), ...choices].slice(0, PROGRESSION_CONFIG.choiceCount);
    // 점술가의 카드: 후보 2개. 무기 후보(마지막 칸)는 남긴다.
    if (out.length > this.relics.choiceCount) out = [out[0], ...out.slice(out.length - this.relics.choiceCount + 1)];
    this.applyGradeRelics(out, luck, true);
    return out;
  }

  /** 이름 없는 계약(일반 등급 제외)과 균열 결정(희귀 이상 1장 보장) */
  private applyGradeRelics(choices: UpgradeChoice[], luck: number, crystal: boolean): void {
    if (this.relics.noCommonGrade) {
      for (const c of choices) if (c.kind === 'upgrade' && c.grade === 'common') c.grade = rollGrade(this.rngRelicFx, luck, true);
    }
    this.rareApplied = false;
    if (crystal && this.relics.rareCards > 0) {
      const cards = choices.filter((c) => c.kind === 'upgrade');
      if (cards.length) {
        this.rareApplied = true;
        if (cards.every((c) => c.grade === 'common')) cards[0].grade = 'rare';
      }
    }
  }

  private fusionChoices(): UpgradeChoice[] {
    if (this.loadout.character !== 'ranger') return [];
    return FUSION_IDS.filter((id) => this.weapons.canFuse(id))
      .map((id) => ({ kind: 'fusion', id }));
  }

  private rollArmoryChoices(): UpgradeChoice[] {
    if (this.loadout.character !== 'ranger') return rollMasteryChoices(this.rngWeapon, this.stacks, this.loadout, this.level, this.luck, { armory: true, forms: this.swordForms });
    const choices = this.fusionChoices().slice(0, PROGRESSION_CONFIG.choiceCount);
    const available = WEAPON_UPGRADES.filter((def) => this.stacks[def.id] < def.maxStacks);
    const featured = new Set<UpgradeId>();
    for (const id of FUSION_IDS) {
      if (this.weapons.fusions.has(id)) continue;
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
        this.choices = this.loadout.character === 'ranger'
          ? [...this.fusionChoices(), ...rollChoices(this.rngUpgrade, this.stacks, this.luck)].slice(0, PROGRESSION_CONFIG.choiceCount)
          : rollMasteryChoices(this.rngUpgrade, this.stacks, this.loadout, this.level, this.luck, { forms: this.swordForms });
        this.applyGradeRelics(this.choices, this.luck, false);
        this.bonusOpen = true;
      } else if (source === 'coin') {
        // 다음에 열릴 엘리트 유물 선택이 남아 있을 때만 동전을 던질 수 있다
        if (this.pendingRewards.includes('elite')) this.choices = [{ kind: 'coin', id: 'flip' }, { kind: 'coin', id: 'pass' }];
      } else {
        this.choices = rollRelics(source, this.rngRelic, this.relics.owned, this.loadout);
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
    if (c.kind !== 'coin') this.coinNotice = null;
    if (c.kind === 'coin') {
      this.flipCoin(c.id === 'flip');
    } else if (c.kind === 'relic') {
      this.relics.acquire(c.id);
    } else {
      const rewardLevel = !this.armoryOpen && !this.bonusOpen && !this.startPickOpen ? this.pendingLevel : 0;
      if (c.kind === 'fusion') {
        if (!this.weapons.fuse(c.id)) return false;
        this.pickOrder.push(c.id);
      } else if (c.kind === 'swordForm') {
        if (this.loadout.character !== 'roan' || !SWORD_FORM_LEVELS.includes(rewardLevel) || this.swordForms.includes(c.id)) return false;
        this.learnedSwordForms.push(c.id);
        this.pickOrder.push(c.id);
      } else if (c.kind === 'upgrade') {
        if (c.def.weapon && isFusionIngredient(this.weapons.fusions, c.def.weapon)) return false;
        if (!upgradeAvailable(this.loadout, c.def, this.level, this.swordForms) || !this.addUpgrade(c.def, c.grade)) return false;
        this.stats = computeStats(this.picks, this.meta);
        this.relics.heal(healOnPick(c.def.id, c.grade));
      } else {
        this.relics.heal(c.heal);
        this.pickOrder.push(c.id);
      }
      if (!this.armoryOpen && !this.bonusOpen) {
        if (this.rareApplied && !this.startPickOpen) this.relics.rareCards--;
        this.rareApplied = false;
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

  private addUpgrade(def: UpgradeDef, grade: UpgradePick['grade']): boolean {
    if (!applyUpgrade(this.stacks, def.id)) return false;
    this.picks.push({ id: def.id, grade });
    this.pickOrder.push(def.id);
    if (def.mastery) {
      const value = characterUpgradeValue(def.mastery, grade);
      this.masteryValues[def.mastery] = this.mastery(def.mastery) + value;
      this.masteryPower += value;
    }
    return true;
  }

  /** 도박꾼의 동전: 앞면이면 엘리트 유물 선택 1회 추가, 뒷면이면 현재 체력 15%와 이번 유물 선택을 잃는다 */
  private flipCoin(flip: boolean): void {
    if (!flip) {
      this.coinNotice = null;
      return;
    }
    const p = this.player;
    if (this.rngRelicFx.next() < 0.5) {
      this.pendingRewards.unshift('elite');
      this.coinNotice = '동전 앞면! 유물 선택 1회 추가';
    } else {
      const i = this.pendingRewards.indexOf('elite');
      if (i >= 0) this.pendingRewards.splice(i, 1);
      if (!this.options.god) p.hp = Math.max(1, p.hp * 0.85);
      p.hurtFlash = 0.25;
      this.coinNotice = '동전 뒷면… 체력 15%와 유물 선택을 잃었습니다';
    }
  }

  /** 레벨업 후보 새로고침. 남은 횟수가 없거나 레벨업 중이 아니면 false */
  reroll(): boolean {
    if (this.phase !== 'levelup' || this.rerollsLeft <= 0 || this.armoryOpen || this.bonusOpen || this.choices[0]?.kind === 'relic' || this.choices[0]?.kind === 'coin' || this.choices[0]?.kind === 'swordForm') return false;
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
        acc += d.chance * this.relics.dropChanceMultiplier(d.kind);
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
    const full = p.hp >= this.relics.maxHp - 1e-6;
    if (kind === 'heal') {
      this.relics.heal(DROP_CONFIG.healAmount * this.relics.potionMultiplier);
    } else if (kind === 'magnet') {
      for (const g of this.gems) g.pulled = true;
    } else {
      for (const e of this.enemies) {
        if (!e.dead && Math.abs(e.x - p.x) < DROP_CONFIG.bombHalfWidth && Math.abs(e.y - p.y) < DROP_CONFIG.bombHalfHeight) {
          this.damageEnemy(e, DROP_CONFIG.bombDamage, 'bomb');
        }
      }
      // 화약 상자: 폭탄 범위 안의 보스에게 최대 체력의 3%
      const b = this.boss;
      if (b && this.relics.has('powderBox') && Math.abs(b.x - p.x) < DROP_CONFIG.bombHalfWidth && Math.abs(b.y - p.y) < DROP_CONFIG.bombHalfHeight) {
        this.damageBoss(b.maxHp * 0.03, 'bomb');
      }
      this.emit('bomb', p.x, p.y);
    }
    this.relics.onItem(kind, full);
    this.emit('item', p.x, p.y);
  }

  // ───────────────────────── 종료 ─────────────────────────

  private cleanup(): void {
    compact(this.enemies, (e) => !e.dead);
  }

  private checkEnd(): void {
    const p = this.player;
    if (!this.boss?.dead && p.hp <= 0 && this.relics.tryFeather()) {
      this.emit('revive', p.x, p.y);
    }
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
  }

  private end(outcome: RunOutcome, cause: RunEndCause): void {
    this.phase = 'ended';
    this.choices = [];
    this.result = {
      loadout: this.loadout,
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
      tokenMultiplier: this.relics.tokenMultiplier(outcome === 'victory'),
      fusions: [...this.weapons.fusions],
      damageByAttack: { ...this.damageByAttack },
      hitsByAttack: { ...this.hitsByAttack },
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
