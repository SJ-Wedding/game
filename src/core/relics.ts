import { DEFAULT_LOADOUT, type Loadout } from '../config/characters';
import { OPENING_RELICS, RELICS, RELIC_IDS, TRIPLE_CHOICE_COUNT, relicAllowed, type RelicId, type RelicSource } from '../config/relics';
import type { DropKind } from '../config/drops';
import { ARENA_CONFIG } from '../config/arena';
import { PLAYER_BODY } from '../config/player';
import { FUSION_RELIC_DAMAGE_BONUS, WEAPON_FUSIONS, type FusionId, type WeaponId } from '../config/weapons';
import { bossInvulnerable } from './boss';
import { clamp, dist } from './math';
import type { Rng } from './rng';
import type { GameSim } from './sim';
import type { AttackId, Boss, Enemy, UpgradeChoice } from './types';

type Target = Boss | Enemy;
interface Point { x: number; y: number }

/**
 * 유물 후보 3개를 뽑는다.
 * previous: 전판에 얻은 유물. 다음 판 시작 유물(레벨 3) 선택지에는 나오지 않는다.
 * 제외하고 나서 후보가 하나도 없으면 제외 없이 뽑는다.
 */
export function rollRelics(
  source: RelicSource,
  rng: Rng,
  owned: ReadonlySet<RelicId>,
  loadout: Loadout = DEFAULT_LOADOUT,
  previous: ReadonlySet<RelicId> = new Set(),
): UpgradeChoice[] {
  const offered: readonly RelicId[] = source === 'opening' ? OPENING_RELICS : RELIC_IDS.filter((id) => RELICS[id].source === source);
  let pool = offered.filter((id) => !owned.has(id) && relicAllowed(id, loadout));
  if (source === 'opening' && loadout.character !== 'ranger') {
    const extra = loadout.character === 'roan' ? ['swordScabbard', 'swordRhythm'] as const : ['swarm', 'bloodPrice'] as const;
    pool.push(...extra.filter((id) => !owned.has(id)));
  }
  if (source === 'opening' && previous.size) {
    const fresh = pool.filter((id) => !previous.has(id));
    if (fresh.length) pool = fresh;
  }
  const choices: UpgradeChoice[] = [];
  while (pool.length && choices.length < 3) {
    const id = pool.splice(rng.int(pool.length), 1)[0];
    choices.push({ kind: 'relic', id, source });
  }
  return choices;
}

/** 이번 기본 사격 한 번에 적용되는 유물 효과 */
export interface VolleyMods {
  damage: number;
  pierce: number;
  radius: number;
  twin: boolean;
}

export class RelicEffects {
  readonly owned = new Set<RelicId>();
  private oathKills = 0;
  private bountyKills = 0;
  private lastMatchSpent = false;
  private movingSince: number | null = null;
  private moving = false;

  // 문서 1장
  private whetstoneStacks: number[] = [];
  private slayerKills: number[] = [];
  private slayerReady = false;
  private readonly ruptures: (Point & { damage: number })[] = [];
  private focusHits = 0;
  private pulseFrom = 0;
  private shotCount = 0;
  // 문서 2장
  private chaliceReady = 0;
  private featherSpent = false;
  private lastHurtAt = 0;
  // 문서 3장
  spareDodgeCd = 0;
  private dodgeBoostUntil = -1;
  private cloakUntil = -1;
  private cloakShot = false;
  private cloakChecked = false;
  private stormDistance = 0;
  private grazeReady = 0;
  // 문서 5장
  private magnetUntil = -1;
  private alchemistUntil = -1;
  private migrantUntil = -1;
  /** 균열 결정: 희귀 등급 이상을 보장할 남은 레벨업 수 */
  rareCards = 0;

  constructor(private readonly sim: GameSim) {}

  has(id: RelicId): boolean { return this.owned.has(id); }

  private get now(): number { return this.sim.elapsed; }

  acquire(id: RelicId): void {
    if (this.owned.has(id) || !relicAllowed(id, this.sim.loadout)) return;
    const before = this.maxHp;
    this.owned.add(id);
    const p = this.sim.player;
    if (id === 'tripleChoice') this.sim.grantBonusChoices(TRIPLE_CHOICE_COUNT);
    if (id === 'oath') this.oathKills = this.sim.kills;
    if (id === 'pulseBarrel') this.pulseFrom = this.now;
    if (id === 'calmShield') this.lastHurtAt = this.now;
    if (id === 'steelHeart') p.r = PLAYER_BODY.radius * 1.1;
    if (id === 'fortuneCard') this.sim.rerollsLeft += 2;
    if (id === 'hastyInvite' && !this.sim.bossSpawned) this.sim.spawnBoss();
    // 최대 체력이 늘면 늘어난 만큼 채우고, 줄면 현재 체력을 새 최대치로 자른다
    const after = this.maxHp;
    if (after > before) p.hp += after - before;
    p.hp = Math.min(p.hp, after);
  }

  /** 매 틱 플레이어 이동 뒤 호출: 이동 여부와 실제 이동 거리 */
  onMove(moving: boolean, distance: number): void {
    this.moving = moving;
    if (this.has('stormCore')) this.stormDistance += distance;
  }

  moveMultiplier(moving: boolean): number {
    let multiplier = 1;
    if (this.has('buckle')) {
      if (!moving) this.movingSince = null;
      else {
        this.movingSince ??= this.now;
        if (this.now - this.movingSince >= 2) multiplier *= 1.15;
      }
    }
    if (this.has('steelHeart')) multiplier *= 0.8;
    if (this.now < this.dodgeBoostUntil) multiplier *= 1.25;
    if (this.now < this.migrantUntil) multiplier *= 1.25;
    if (this.now < this.magnetUntil) multiplier *= 1.5;
    return multiplier;
  }

  get maxHp(): number {
    if (this.has('glassCannon')) return 1;
    let hp = this.sim.stats.maxHp;
    if (this.has('steelHeart')) hp *= 1.35;
    if (this.has('calmShield')) hp *= 0.9;
    if (this.has('clover')) hp -= 10;
    if (this.has('collectorPack')) hp += 10 * this.owned.size;
    if (this.lastMatchSpent) hp *= 0.8;
    return Math.max(1, hp);
  }

  get xpMultiplier(): number {
    return 1 + (this.has('swarm') ? 0.25 : 0) + (this.has('bloodPrice') ? 0.35 : 0) + (this.has('elitePact') ? 0.30 : 0)
      + (this.has('rottingGem') ? 1 : 0);
  }

  /** 이름 없는 계약: 레벨업에 필요한 경험치 배율 */
  get xpNeededMultiplier(): number {
    return this.has('namelessContract') ? 1.4 : 1;
  }

  get noCommonGrade(): boolean {
    return this.has('namelessContract');
  }

  get luckBonus(): number {
    return this.has('clover') ? 4 : 0;
  }

  get choiceCount(): number {
    return this.has('fortuneCard') ? 2 : 3;
  }

  get pickupRadiusMultiplier(): number {
    return this.has('magnetCore') ? 1.6 : 1;
  }

  dropChanceMultiplier(kind: DropKind): number {
    if (kind === 'magnet' && this.has('magnetCore')) return 2;
    if (kind === 'bomb' && this.has('powderBox')) return 3;
    return 1;
  }

  get spawnMultiplier(): number {
    return this.has('swarm') ? 1.3 : 1;
  }

  damageTaken(kind?: 'shot' | 'contact'): number {
    let multiplier = this.sim.stats.damageTaken * (this.has('bloodPrice') ? 1.25 : 1) * (this.has('greedDice') ? 1.2 : 1);
    if (this.has('lightningRod')) multiplier *= kind === 'shot' ? 0.7 : kind === 'contact' ? 1.2 : 1;
    if (this.has('battleJoy')) {
      const p = this.sim.player;
      let count = 0;
      for (const e of this.sim.enemies) if (!e.dead && dist(p.x, p.y, e.x, e.y) <= 150 + e.r && ++count >= 4) break;
      if (count >= 4) multiplier *= 0.75;
    }
    return multiplier;
  }

  get hurtInvulnBonus(): number {
    return this.has('thornMail') ? 0.4 : 0;
  }

  get fireRate(): number {
    let rate = this.sim.stats.fireRate * (this.has('oath') ? 0.85 : 1) * (this.has('anvil') ? 0.75 : 1);
    if (this.has('whetstone')) rate *= 1 + 0.1 * this.whetstoneStacks.length;
    if (this.has('executioner')) rate *= 0.7;
    if (this.has('pulseBarrel')) rate *= this.pulseActive ? 1.6 : 0.9;
    if (this.has('fifthBell')) rate *= 0.85;
    if (this.has('lightHands')) rate *= 1.15;
    if (this.now < this.magnetUntil) rate *= 1.5;
    return rate;
  }

  /** 맥동 총열: 10초 주기 중 마지막 3초 */
  get pulseActive(): boolean {
    return (this.now - this.pulseFrom) % 10 >= 7;
  }

  get projectileCount(): number {
    return this.sim.stats.projectileCount + Number(this.has('scatterSeal'));
  }

  get basicReachBonus(): number {
    return this.has('hawkLens') ? 120 : 0;
  }

  get projectileSpeed(): number {
    return this.sim.stats.projectileSpeed * (this.has('hawkLens') ? 1.2 : 1);
  }

  get dodgeCooldown(): number {
    return this.sim.stats.dodgeCooldown + (this.has('compass') ? 0.5 : 0);
  }

  get cooldownMultiplier(): number {
    return (this.heartActive ? 0.75 : 1) * this.periodicHitMultiplier * (this.has('lightHands') ? 0.9 : 1);
  }

  get periodicHitMultiplier(): number {
    return this.has('catalyst') ? 0.75 : 1;
  }

  private get heartActive(): boolean {
    return this.has('heart') && this.sim.player.hp < this.maxHp * 0.3;
  }

  get regenMultiplier(): number {
    return this.has('herbalist') ? 0.5 : 1;
  }

  heal(amount: number): void {
    const p = this.sim.player;
    p.hp = Math.min(this.maxHp, p.hp + amount * (this.heartActive ? 0.5 : 1));
  }

  update(dt: number): void {
    const now = this.now;
    const p = this.sim.player;
    if (this.whetstoneStacks.length) this.whetstoneStacks = this.whetstoneStacks.filter((until) => until > now);
    if (this.spareDodgeCd > 0) this.spareDodgeCd = Math.max(0, this.spareDodgeCd - dt);
    if (this.has('mossCharm') && !this.moving && p.hp > 0) this.heal(2 * dt);
    // 잔상 망토: 회피 중 적과 겹치면 발동 (회피 한 번에 한 번)
    if (p.dodgeTime <= 0) this.cloakChecked = false;
    else if (this.has('cloak') && !this.cloakChecked) {
      for (const e of this.sim.enemies) {
        if (e.dead || dist(p.x, p.y, e.x, e.y) >= p.r + e.r) continue;
        this.cloakChecked = true;
        this.cloakUntil = now + 1.5;
        this.cloakShot = true;
        this.sim.weapons.trace('echo', [p], p.r + 10, 0.4);
        break;
      }
    }
    const ruptures = this.ruptures.splice(0);
    for (const r of ruptures) this.blast(r, 90, r.damage, 'mine');
  }

  /** 회피 키: 바람의 장화의 추가 충전을 쓸 수 있으면 사용한다 */
  useSpareDodge(): boolean {
    if (!this.has('windBoots') || this.spareDodgeCd > 0) return false;
    this.spareDodgeCd = this.dodgeCooldown;
    return true;
  }

  onDodge(): void {
    if (this.has('windBoots')) this.dodgeBoostUntil = this.now + this.sim.stats.dodgeDuration + 1.5;
  }

  /** 잔상 망토: 적 탄 무시 */
  get shotImmune(): boolean {
    return this.now < this.cloakUntil;
  }

  /** 스침의 깃: 회피 중 적 탄과 겹침 */
  onGraze(): void {
    if (!this.has('grazeFeather') || this.now < this.grazeReady) return;
    this.grazeReady = this.now + 1;
    const p = this.sim.player;
    p.dodgeCd = Math.max(0, p.dodgeCd - 1);
  }

  /** 기본 사격 한 번의 보정. 발사할 때 한 번만 호출한다 (충전·발동 소비). */
  volley(): VolleyMods {
    const mods: VolleyMods = { damage: 1, pierce: 0, radius: 1, twin: false };
    this.shotCount++;
    if (this.has('fifthBell') && this.shotCount % 5 === 0) {
      mods.damage *= 3;
      mods.pierce += 2;
      mods.radius = 1.8;
    }
    if (this.slayerReady) {
      this.slayerReady = false;
      mods.damage *= 2;
    }
    if (this.cloakShot && this.now < this.cloakUntil) {
      this.cloakShot = false;
      mods.damage *= 2;
    }
    if (this.has('twinBlade') && this.sim.rngRelicFx.next() < 0.2) mods.twin = true;
    if (this.has('stormCore') && this.stormDistance >= 1500) {
      this.stormDistance = 0;
      this.blast(this.sim.player, 160, this.sim.stats.damage * 2, 'gravity');
    }
    return mods;
  }

  onEnemyKilled(enemy: Enemy, source?: AttackId): void {
    const now = this.now;
    if (this.has('bountyKnot') && this.sim.player.hp > 0) {
      this.bountyKills++;
      if (this.bountyKills % 12 === 0) this.heal(4);
    }
    if (this.has('whetstone')) {
      this.whetstoneStacks.push(now + 3);
      if (this.whetstoneStacks.length > 5) this.whetstoneStacks.shift();
    }
    if (this.has('slayerSeal') && !this.slayerReady) {
      this.slayerKills = this.slayerKills.filter((at) => now - at <= 2);
      this.slayerKills.push(now);
      if (this.slayerKills.length >= 5) {
        this.slayerKills = [];
        this.slayerReady = true;
      }
    }
    if (this.has('ruptureCog') && enemy.kind !== 'elite') this.ruptures.push({ x: enemy.x, y: enemy.y, damage: enemy.maxHp * 0.15 });
    if (this.has('splitHead') && source !== 'relic') this.split(enemy);
    if (this.has('hourglass')) this.sim.weapons.reduceCooldowns(enemy.kind === 'elite' ? 2 : 0.1);
    if (enemy.kind === 'elite' && this.has('riftCrystal')) this.rareCards++;
  }

  /** 갈라지는 화살촉: 처치 자리에서 좌우로 작은 탄 */
  private split(at: Point): void {
    const sim = this.sim;
    const p = sim.player;
    const count = Math.max(1, this.projectileCount) * 2;
    const base = at.x === p.x && at.y === p.y ? p.aim : Math.atan2(at.y - p.y, at.x - p.x);
    const damage = this.shotDamage() * 0.1;
    const perSide = count / 2;
    for (let i = 0; i < count; i++) {
      const side = i < perSide ? 1 : -1;
      const j = i % perSide;
      const angle = base + side * Math.PI / 2 + (j - (perSide - 1) / 2) * 0.25;
      sim.playerShots.push({ x: at.x, y: at.y, vx: Math.cos(angle) * 520, vy: Math.sin(angle) * 520, r: 4, damage, life: 0.6, source: 'relic' });
    }
  }

  /** 기본탄 명중 (일반 적·보스) */
  onBasicHit(target: Target): void {
    if (this.has('focusRing')) this.focusHits++;
    if (this.has('chainOrb') && this.sim.rngRelicFx.next() < 0.15) {
      const hit = new Set<Target>([target]);
      const points: Point[] = [{ x: target.x, y: target.y }];
      let from: Point = target;
      for (let i = 0; i < 3; i++) {
        let next: Enemy | null = null;
        let best = 125;
        for (const e of this.sim.enemies) {
          if (e.dead || hit.has(e)) continue;
          const d = dist(from.x, from.y, e.x, e.y) - e.r;
          if (d < best) { best = d; next = e; }
        }
        if (!next) break;
        hit.add(next);
        points.push({ x: next.x, y: next.y });
        from = next;
        this.sim.damageEnemy(next, this.sim.stats.damage * 0.4, 'relic');
      }
      if (points.length > 1) this.sim.weapons.trace('chain', points, 0, 0.28);
    }
  }

  /** 적에게 피해를 줄 때마다 (흡혈귀의 깨진 성배) */
  onDamageEnemy(enemy: Enemy): void {
    if (!this.has('chalice') || this.now < this.chaliceReady) return;
    const now = this.now;
    const afflicted = enemy.slowUntil > now || enemy.fireSlowUntil > now || this.sim.weapons.afflicted(enemy);
    if (!afflicted) return;
    this.chaliceReady = now + 0.5;
    this.heal(this.maxHp * 0.015);
  }

  /** 처형인의 저울: 이번 기본탄으로 처형되는가 */
  executes(enemy: Enemy): boolean {
    return this.has('executioner') && enemy.kind !== 'elite' && enemy.hp <= enemy.maxHp * 0.1;
  }

  /** 특수 무기 발동 직후 (불안정한 마력 코어). true 면 재사용 대기시간 즉시 초기화 */
  onWeaponActivated(): boolean {
    if (!this.has('unstableCore')) return false;
    const rng = this.sim.rngRelicFx;
    const reset = rng.next() < 0.25;
    if (rng.next() < 0.1 && !this.sim.options.god) {
      const p = this.sim.player;
      p.hp = Math.max(1, p.hp - this.maxHp * 0.05);
      p.hurtFlash = 0.15;
    }
    return reset;
  }

  /** 아이템을 주운 직후. full: 줍기 전에 체력이 가득 찼는가 */
  onItem(kind: DropKind, full: boolean): void {
    const now = this.now;
    if (this.has('migrantFeather')) this.migrantUntil = now + 5;
    if (kind === 'magnet' && this.has('magnetCore')) this.magnetUntil = now + 5;
    if (kind === 'heal' && full && this.has('alchemistFlask')) this.alchemistUntil = now + 8;
  }

  get potionMultiplier(): number {
    return this.has('herbalist') ? 2 : 1;
  }

  onHurt(amount: number): number {
    const p = this.sim.player;
    const now = this.now;
    if (this.has('focusRing')) this.focusHits = 0;
    if (this.has('calmShield')) {
      const ready = now - this.lastHurtAt >= 8;
      this.lastHurtAt = now;
      if (ready) {
        this.sim.weapons.trace('barrier', [p], p.r + 14, 0.4);
        return 0;
      }
    }
    if (amount >= p.hp && this.has('lastMatch') && !this.lastMatchSpent) {
      this.lastMatchSpent = true;
      p.invuln = 2;
      p.hp = Math.max(1, p.hp);
      return p.hp - 1;
    }
    return amount;
  }

  get shieldReady(): boolean {
    return this.has('calmShield') && this.now - this.lastHurtAt >= 8;
  }

  /** 실제로 입은 피해 (가시 돋친 철갑) */
  afterHurt(damage: number): void {
    if (this.has('thornMail') && damage > 0) this.blast(this.sim.player, 150, damage * 1.5, 'barrier');
  }

  /** 수호천사의 깃털: 쓰러질 때 한 번 부활 */
  tryFeather(): boolean {
    if (!this.has('angelFeather') || this.featherSpent) return false;
    this.featherSpent = true;
    const p = this.sim.player;
    p.hp = this.maxHp * 0.5;
    p.invuln = Math.max(p.invuln, 1.5);
    for (const e of this.sim.enemies) {
      const d = dist(p.x, p.y, e.x, e.y);
      if (e.dead || d >= 200 + e.r) continue;
      const angle = d < 1 ? this.sim.rngRelicFx.next() * Math.PI * 2 : Math.atan2(e.y - p.y, e.x - p.x);
      const pad = ARENA_CONFIG.wallPadding + e.r;
      e.x = clamp(p.x + Math.cos(angle) * (200 + e.r), pad, ARENA_CONFIG.width - pad);
      e.y = clamp(p.y + Math.sin(angle) * (200 + e.r), pad, ARENA_CONFIG.height - pad);
    }
    this.sim.weapons.trace('gravity', [p], 200, 0.6);
    return true;
  }

  /** 판 종료 토큰 배율 */
  tokenMultiplier(victory: boolean): number {
    return 1 + (this.has('greedDice') ? 0.4 : 0) + (victory && this.has('hastyInvite') ? 0.5 : 0);
  }

  /** 유물 효과의 범위 피해 */
  private blast(at: Point, radius: number, damage: number, fx: WeaponId): void {
    const { x, y } = at;
    for (const e of this.sim.enemies) {
      if (!e.dead && dist(x, y, e.x, e.y) < radius + e.r) this.sim.damageEnemy(e, damage, 'relic');
    }
    const boss = this.sim.boss;
    if (boss && !boss.dead && !bossInvulnerable(boss) && dist(x, y, boss.x, boss.y) < radius + boss.r) this.sim.damageBoss(damage, 'relic');
    this.sim.weapons.trace(fx, [{ x, y }], radius, 0.45);
  }

  shotDamage(): number {
    let multiplier = 1;
    if (this.has('anvil')) multiplier *= 1.55;
    if (this.has('catalyst')) multiplier *= 0.75;
    if (this.has('scatterSeal')) multiplier *= 0.82;
    return this.sim.stats.damage * multiplier;
  }

  damageMultiplier(target: Boss | Enemy, basic: boolean): number {
    if (!this.owned.size) return 1;
    let multiplier = this.has('oath') ? 1 + Math.min(8, Math.floor((this.sim.kills - this.oathKills) / 25)) * 0.04 : 1;
    for (const id of this.owned) {
      const relic = RELICS[id];
      if ('weapon' in relic && !this.sim.stacks[relic.weapon]) multiplier *= 1.05;
    }
    const p = this.sim.player;
    if (this.has('duel')) {
      const nearby = (e: Enemy | Boss) => !e.dead && dist(p.x, p.y, e.x, e.y) <= 280 + e.r;
      let count = 0;
      for (const e of this.sim.enemies) if (nearby(e) && ++count >= 4) break;
      if (count < 4 && this.sim.boss && nearby(this.sim.boss)) count++;
      if (count === 1 && nearby(target)) multiplier *= 1.25;
      if (count >= 4 && basic) multiplier *= 0.9;
    }
    const strong = !('id' in target) || target.kind === 'elite';
    if (strong && this.has('giantHunter')) multiplier *= 1.3;
    if (basic && this.has('focusRing')) multiplier *= 1 + Math.min(0.3, this.focusHits * 0.01);
    if (basic && this.has('sniperGlove')) {
      const d = dist(p.x, p.y, target.x, target.y);
      if (d > 320) multiplier *= 1.25;
      else if (d < 150) multiplier *= 0.8;
    }
    if (this.has('berserker')) multiplier *= 1 + 0.8 * clamp(1 - p.hp / this.maxHp, 0, 1);
    if (this.has('glassCannon')) multiplier *= 1.8;
    if (this.has('collectorPack')) multiplier *= 1 + 0.04 * this.owned.size;
    if (this.now < this.alchemistUntil) multiplier *= 1.3;
    if (this.now < this.magnetUntil) multiplier *= 1.5;
    return multiplier;
  }

  fusionMultiplier(id: FusionId): number {
    let bonus = 0;
    const { pair } = WEAPON_FUSIONS[id];
    for (const relicId of this.owned) {
      const relic = RELICS[relicId];
      if ('weapon' in relic && pair.some((weapon) => weapon === relic.weapon)) bonus += FUSION_RELIC_DAMAGE_BONUS;
    }
    return 1 + bonus;
  }
}
