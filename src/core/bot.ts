import type { RelicId } from '../config/relics';
import { ARENA_CONFIG } from '../config/arena';
import { ENEMY_CONFIG } from '../config/enemies';
import { GRADES, GRADE_INDEX } from '../config/grades';
import type { UpgradeId } from '../config/upgrades';
import { BOSS_CHARGE_LENGTH } from './boss';
import { distToSegment } from './math';
import { deriveSeed, Rng } from './rng';
import type { GameSim } from './sim';
import type { InputState } from './types';

/**
 * 밸런스 측정용 자동 플레이어. "표준 난이도의 평범한 플레이어"를 흉내 낸다.
 * - 가장 가까운 적을 조준해 계속 공격
 * - 가까운 적·투사체·예고 범위에서 멀어지고, 안전하면 경험치를 줍는다
 * - 피할 수 없는 공격이 임박하면 회피
 * 완벽하지 않도록 반응에 약간의 지연과 실수를 둔다.
 */
export interface BotOptions {
  /** 0~1. 높을수록 회피를 잘 한다 (표준 0.75) */
  skill?: number;
}

const PICK_WEIGHT: Partial<Record<UpgradeId, number>> = {
  split: 6,
  power: 5,
  rapid: 5,
  vitality: 3.2,
  guard: 2.6,
  regen: 2.2,
  evasion: 2.4,
  swift: 2.2,
  magnet: 1.6,
  wisdom: 2,
  fortune: 2.2,
};

/** 기준 봇이 고르지 않는 유물: 최대 체력 1, 보스 즉시 등장, 후보 축소 등 */
const BOT_AVOID = new Set<RelicId>(['glassCannon', 'hastyInvite', 'fortuneCard', 'namelessContract', 'rottingGem', 'steelHeart']);

export class Bot {
  private rng: Rng;
  private skill: number;
  private reactCooldown = 0;

  constructor(seed: number, opts: BotOptions = {}) {
    this.rng = new Rng(deriveSeed(seed, 'bot'));
    this.skill = opts.skill ?? 0.75;
  }

  /** 레벨업 후보 중 고를 인덱스 */
  choose(sim: GameSim): number {
    if (sim.choices[0]?.kind === 'coin') return 1;
    if (sim.choices[0]?.kind === 'relic') {
      // 기준 봇은 판을 크게 흔드는 유물을 피한다 (밸런스 측정용)
      const safe = sim.choices.findIndex((c) => c.kind === 'relic' && !BOT_AVOID.has(c.id));
      return Math.max(0, safe);
    }
    const lowHp = sim.player.hp / sim.stats.maxHp < 0.5;
    let best = 0;
    let bestScore = -Infinity;
    sim.choices.forEach((c, i) => {
      let score = c.kind === 'fusion' ? 8 : c.kind === 'upgrade' ? (PICK_WEIGHT[c.def.id] ?? 3.1) : 0;
      if (c.kind === 'upgrade') score *= c.def.weapon ? 1 + 0.12 * GRADE_INDEX[c.grade] : GRADES[GRADE_INDEX[c.grade]].mult;
      if (c.kind === 'upgrade' && lowHp && c.def.category === 'survival') score += 2;
      score += this.rng.range(0, 2.5);
      if (score > bestScore) {
        bestScore = score;
        best = i;
      }
    });
    return best;
  }

  /** 후보가 마음에 들지 않으면 새로고침할지 (남은 횟수가 있을 때) */
  wantsReroll(sim: GameSim): boolean {
    if (sim.armoryOpen || sim.bonusOpen || sim.choices.some((choice) => choice.kind === 'relic' || choice.kind === 'fusion' || choice.kind === 'coin' || choice.kind === 'swordForm')) return false;
    if (sim.rerollsLeft <= 0) return false;
    const best = Math.max(
      ...sim.choices.map((c) =>
        c.kind === 'upgrade' ? (PICK_WEIGHT[c.def.id] ?? 3.1) * (c.def.weapon ? 1 + 0.12 * GRADE_INDEX[c.grade] : GRADES[GRADE_INDEX[c.grade]].mult) : 0,
      ),
    );
    return best < 3;
  }

  input(sim: GameSim, dt = 1 / 60): InputState {
    const p = sim.player;
    let fx = 0;
    let fy = 0;
    let danger = 0;
    let wantDodge = false;
    const add = (x: number, y: number, w: number) => {
      const l = Math.hypot(x, y) || 1;
      fx += (x / l) * w;
      fy += (y / l) * w;
    };
    this.reactCooldown -= dt;

    // ── 적과 거리 유지 ──
    let nearest: { x: number; y: number; d: number } | null = null;
    for (const e of sim.enemies) {
      const dx = p.x - e.x;
      const dy = p.y - e.y;
      const d = Math.hypot(dx, dy) || 1;
      if (!nearest || d < nearest.d) nearest = { x: e.x, y: e.y, d };
      const keep = e.r + p.r + (e.kind === 'elite' ? 170 : e.kind === 'chaser' ? 85 : 115);
      if (d < keep) {
        const w = ((keep - d) / keep) * 3;
        add(dx, dy, w);
        danger += w;
      }
      // 돌진 예고선 피하기
      if ((e.kind === 'charger' || e.kind === 'elite') && (e.state === 'windup' || e.state === 'dash')) {
        const c = e.kind === 'charger' ? ENEMY_CONFIG.charger : ENEMY_CONFIG.elite;
        const len = c.dashSpeed * c.dashTime;
        const sd = distToSegment(p.x, p.y, e.x, e.y, e.x + e.dx * len, e.y + e.dy * len);
        if (sd < e.r + p.r + 26) {
          const side = (p.x - e.x) * -e.dy + (p.y - e.y) * e.dx >= 0 ? 1 : -1;
          add(-e.dy * side, e.dx * side, 5);
          danger += 3;
          if (e.state === 'dash' && Math.hypot(p.x - e.x, p.y - e.y) < 140) wantDodge = true;
        }
      }
    }

    // ── 보스 ──
    const b = sim.boss;
    if (b && !b.dead) {
      const dx = p.x - b.x;
      const dy = p.y - b.y;
      const d = Math.hypot(dx, dy) || 1;
      const keep = b.r + p.r + (b.state === 'ringWindup' || b.state === 'ringFire' ? 260 : 200);
      if (d < keep) {
        add(dx, dy, ((keep - d) / keep) * 5);
        danger += 3;
      } else if (d > 420) {
        add(-dx, -dy, 0.8); // 너무 멀어지면 다시 사거리 안으로
      }
      if (b.state === 'chargeWindup' || b.state === 'charge') {
        const sd = distToSegment(p.x, p.y, b.x, b.y, b.x + b.dx * BOSS_CHARGE_LENGTH, b.y + b.dy * BOSS_CHARGE_LENGTH);
        if (sd < b.r + p.r + 30) {
          const side = (p.x - b.x) * -b.dy + (p.y - b.y) * b.dx >= 0 ? 1 : -1;
          add(-b.dy * side, b.dx * side, 7);
          danger += 4;
          if (b.state === 'charge' || (b.state === 'chargeWindup' && b.timer < 0.15)) wantDodge = true;
        }
      }
      if (!nearest || d < nearest.d) nearest = { x: b.x, y: b.y, d };
    }

    // ── 적 투사체 ──
    for (const s of sim.enemyShots) {
      const rx = p.x - s.x;
      const ry = p.y - s.y;
      const v2 = s.vx * s.vx + s.vy * s.vy;
      const tc = (rx * s.vx + ry * s.vy) / v2;
      if (tc < 0 || tc > 0.9) continue;
      const cx = s.x + s.vx * tc - p.x;
      const cy = s.y + s.vy * tc - p.y;
      const miss = Math.hypot(cx, cy);
      if (miss < p.r + s.r + 14) {
        // 탄 진행 방향의 수직으로 비켜선다
        const side = cx * -s.vy + cy * s.vx >= 0 ? -1 : 1;
        add(-s.vy * side, s.vx * side, 2.5);
        danger += 1.5;
        if (tc < 0.14) wantDodge = true;
      }
    }

    // ── 장판 ──
    for (const h of sim.hazards) {
      const dx = p.x - h.x;
      const dy = p.y - h.y;
      const d = Math.hypot(dx, dy);
      if (d < h.r + p.r + 18) {
        add(d < 1 ? 1 : dx, d < 1 ? 0 : dy, 6);
        danger += 4;
        if (h.dur - h.t < 0.22 && d < h.r + p.r * 0.5) wantDodge = true;
      }
    }

    // ── 경험치 보석 (안전할 때) ──
    if (danger < 2.5 && sim.gems.length) {
      let g = sim.gems[0];
      let gd = Infinity;
      for (const gem of sim.gems) {
        const d = Math.hypot(gem.x - p.x, gem.y - p.y);
        if (d < gd) {
          gd = d;
          g = gem;
        }
      }
      if (gd < 520) add(g.x - p.x, g.y - p.y, 1.1);
    }

    // ── 드랍 아이템 (회복은 체력이 깎였을 때 우선) ──
    if (danger < 3.5 && sim.pickups.length) {
      const hurt = p.hp / sim.stats.maxHp < 0.75;
      for (const it of sim.pickups) {
        if (it.kind === 'heal' && !hurt) continue;
        const d = Math.hypot(it.x - p.x, it.y - p.y);
        if (d < 600) add(it.x - p.x, it.y - p.y, it.kind === 'heal' ? 2.2 : 1.4);
      }
    }

    // ── 벽·구석 회피 ──
    const cx = ARENA_CONFIG.width / 2;
    const cy = ARENA_CONFIG.height / 2;
    const edge = Math.min(p.x, p.y, ARENA_CONFIG.width - p.x, ARENA_CONFIG.height - p.y);
    // 위험할 때만 벽에서 강하게 멀어진다 (안전할 때는 벽 근처 보석도 주우러 간다)
    const wallW = danger > 1 ? (edge < 260 ? 2.2 * (1 - edge / 260) + 0.35 : 0.35) : 0.15;
    add(cx - p.x, cy - p.y, wallW);

    // ── 적 무리 주위를 맴돌기 (가만히 서 있지 않도록) ──
    if (nearest && nearest.d < 360) {
      const ox = p.x - nearest.x;
      const oy = p.y - nearest.y;
      add(-oy, ox, 0.7);
    }

    // 반응 실수: 일정 확률로 이번 판단을 무시하고 직전처럼 움직임
    if (this.rng.next() > 0.6 + this.skill * 0.4) {
      fx *= 0.3;
      fy *= 0.3;
    }

    let mx = 0;
    let my = 0;
    const fl = Math.hypot(fx, fy);
    if (fl > 0.05) {
      mx = fx / fl;
      my = fy / fl;
    }

    let dodge = false;
    if (wantDodge && p.dodgeCd <= 0 && this.reactCooldown <= 0) {
      if (this.rng.next() < this.skill) dodge = true;
      this.reactCooldown = 0.25;
    }

    // 조준: 가장 가까운 대상. 보스가 사거리 안이면 보스 우선.
    let aimX = p.x;
    let aimY = p.y - 100;
    let target = nearest;
    if (b && !b.dead && Math.hypot(b.x - p.x, b.y - p.y) < 560) target = { x: b.x, y: b.y, d: 0 };
    if (target) {
      aimX = target.x;
      aimY = target.y;
    }
    return { moveX: mx, moveY: my, aimX, aimY, fire: true, dodge };
  }
}

/** 봇이 한 판을 끝까지 플레이 (Node 시뮬레이션용). */
export function playToEnd(sim: GameSim, bot: Bot, maxTicks = 60 * 60 * 20): void {
  let guard = 0;
  while (sim.phase !== 'ended' && guard++ < maxTicks) {
    if (sim.phase === 'levelup') {
      if (bot.wantsReroll(sim)) sim.reroll();
      else sim.choose(bot.choose(sim));
      continue;
    }
    sim.step(bot.input(sim));
  }
}
