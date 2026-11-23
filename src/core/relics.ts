import { RELICS, RELIC_IDS, type RelicId, type RelicSource } from '../config/relics';
import { dist } from './math';
import type { Rng } from './rng';
import type { GameSim } from './sim';
import type { Boss, Enemy, UpgradeChoice } from './types';

export function rollRelics(source: RelicSource, rng: Rng, owned: ReadonlySet<RelicId>): UpgradeChoice[] {
  const pool = RELIC_IDS.filter((id) => RELICS[id].source === source && !owned.has(id));
  const choices: UpgradeChoice[] = [];
  while (pool.length && choices.length < 3) {
    const id = pool.splice(rng.int(pool.length), 1)[0];
    choices.push({ kind: 'relic', id, source });
  }
  return choices;
}

export class RelicEffects {
  readonly owned = new Set<RelicId>();
  private oathKills = 0;
  private flintUntil: number | null = null;
  private flintBonus = 0;
  private guardUntil = -Infinity;
  private guardReady = -Infinity;
  private scarCharges = 0;
  private lastMatchSpent = false;
  private movingSince: number | null = null;
  dodgeUntil = -Infinity;

  constructor(private readonly sim: GameSim) {}

  has(id: RelicId): boolean { return this.owned.has(id); }

  acquire(id: RelicId): void {
    if (this.owned.has(id)) return;
    this.owned.add(id);
    if (id === 'oath') this.oathKills = this.sim.kills;
    if (id === 'flint') this.flintUntil = this.sim.elapsed + 60;
  }

  moveMultiplier(moving: boolean): number {
    if (!this.has('buckle')) return 1;
    if (!moving) {
      this.movingSince = null;
      return 1;
    }
    this.movingSince ??= this.sim.elapsed;
    return this.sim.elapsed - this.movingSince >= 2 ? 1.15 : 1;
  }

  get maxHp(): number {
    return (this.sim.stats.maxHp + this.flintBonus) * (this.lastMatchSpent ? 0.8 : 1);
  }

  get fireRate(): number {
    return this.sim.stats.fireRate * (this.has('oath') ? 0.85 : 1);
  }

  get dodgeCooldown(): number {
    return this.sim.stats.dodgeCooldown + (this.has('compass') ? 0.5 : 0);
  }

  get cooldownMultiplier(): number {
    return this.has('heart') && this.sim.player.hp < this.maxHp * 0.3 ? 0.75 : 1;
  }

  heal(amount: number): void {
    const p = this.sim.player;
    p.hp = Math.min(this.maxHp, p.hp + amount * (this.cooldownMultiplier < 1 ? 0.5 : 1));
  }

  update(): void {
    if (this.flintUntil === null || this.sim.elapsed < this.flintUntil) return;
    this.flintUntil = null;
    this.flintBonus = 15;
    this.heal(15);
  }

  onHurt(amount: number): number {
    const now = this.sim.elapsed;
    const p = this.sim.player;
    const damage = amount * (now < this.guardUntil ? 0.6 : 1);
    if (this.has('knot') && damage >= this.maxHp * 0.2 && now >= this.guardReady) {
      this.guardUntil = now + 3;
      this.guardReady = now + 25;
    }
    if (this.has('scars')) this.scarCharges = Math.min(3, this.scarCharges + 1);
    if (damage >= p.hp && this.has('lastMatch') && !this.lastMatchSpent) {
      this.lastMatchSpent = true;
      p.invuln = 2;
      p.hp = Math.max(1, p.hp);
      return p.hp - 1;
    }
    return damage;
  }

  shotDamage(): number {
    let multiplier = this.flintUntil === null ? 1 : 1.25;
    if (this.scarCharges > 0) {
      this.scarCharges--;
      multiplier *= 1.3;
    }
    return this.sim.stats.damage * multiplier;
  }

  damageMultiplier(target: Boss | Enemy, basic: boolean): number {
    if (!this.owned.size) return 1;
    let multiplier = this.has('oath') ? 1 + Math.min(8, Math.floor((this.sim.kills - this.oathKills) / 25)) * 0.04 : 1;
    for (const id of this.owned) {
      const relic = RELICS[id];
      if ('weapon' in relic && !this.sim.stacks[relic.weapon]) multiplier *= 1.05;
    }
    if (this.has('duel')) {
      const p = this.sim.player;
      const nearby = (e: Enemy | Boss) => !e.dead && dist(p.x, p.y, e.x, e.y) <= 280 + e.r;
      let count = 0;
      for (const e of this.sim.enemies) if (nearby(e) && ++count >= 4) break;
      if (count < 4 && this.sim.boss && nearby(this.sim.boss)) count++;
      if (count === 1 && nearby(target)) multiplier *= 1.25;
      if (count >= 4 && basic) multiplier *= 0.9;
    }
    return multiplier;
  }
}
