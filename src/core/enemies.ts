import { ARENA_CONFIG } from '../config/arena';
import { ENEMY_CONFIG, ENEMY_SCALING, type EnemyKind } from '../config/enemies';
import { RUN_CONFIG } from '../config/run';
import { clamp, dist } from './math';
import type { GameSim } from './sim';
import type { Enemy } from './types';

/** 적 1마리 생성. t = 현재 전투 시간(초), 시간에 비례해 체력·피해가 오른다. */
export function createEnemy(id: number, kind: EnemyKind, x: number, y: number, t: number): Enemy {
  const c = ENEMY_CONFIG[kind];
  const minutes = t / 60;
  const boosted = kind === 'charger' && t >= RUN_CONFIG.timeLimit;
  const hp = Math.round(c.hp * (1 + ENEMY_SCALING.hpPerMinute * minutes) * (boosted ? ENEMY_SCALING.overtimeChargerHp : 1));
  return {
    id,
    kind,
    x,
    y,
    r: c.radius,
    hp,
    maxHp: hp,
    speed: c.speed,
    slowUntil: 0,
    rootedUntil: 0,
    fireSlowUntil: 0,
    dmgMul: (1 + ENEMY_SCALING.damagePerMinute * minutes) * (boosted ? ENEMY_SCALING.overtimeChargerDamage : 1),
    xp: c.xp,
    basicResistance: t >= ENEMY_SCALING.armorAt && (kind === 'charger' || kind === 'elite')
      ? ENEMY_SCALING.basicResistance : 0,
    reinforced: boosted,
    state: 'move',
    timer: 0,
    // 등장 직후 바로 공격하지 않도록 첫 공격에 약간의 여유
    cd: kind === 'charger' ? 1.0 : kind === 'spitter' ? 1.2 : kind === 'elite' ? 2.0 : 0,
    dx: 0,
    dy: 0,
    flash: 0,
    attackIndex: 0,
    dead: false,
  };
}

function moveToward(e: Enemy, tx: number, ty: number, speed: number, dt: number): void {
  const dx = tx - e.x;
  const dy = ty - e.y;
  const d = Math.hypot(dx, dy);
  if (d < 1) return;
  e.x += (dx / d) * speed * dt;
  e.y += (dy / d) * speed * dt;
}

function lockDirection(e: Enemy, tx: number, ty: number): void {
  const d = Math.hypot(tx - e.x, ty - e.y) || 1;
  e.dx = (tx - e.x) / d;
  e.dy = (ty - e.y) / d;
}

export function updateEnemies(sim: GameSim, dt: number): void {
  const p = sim.player;
  for (const e of sim.enemies) {
    if (e.dead) continue;
    if (e.flash > 0) e.flash -= dt;
    const d = dist(e.x, e.y, p.x, p.y);
    let contactSource: string = ENEMY_CONFIG[e.kind].attackNames.contact;
    let contactDamage = ENEMY_CONFIG[e.kind].contactDamage;

    const rooted = e.rootedUntil > sim.elapsed;
    const speed = rooted ? 0 : e.speed * (e.slowUntil > sim.elapsed ? 0.55 : e.fireSlowUntil > sim.elapsed ? 0.8 : 1);
    switch (e.kind) {
      case 'chaser':
        moveToward(e, p.x, p.y, speed, dt);
        break;

      case 'charger': {
        const c = ENEMY_CONFIG.charger;
        if (e.state === 'move') {
          moveToward(e, p.x, p.y, speed, dt);
          e.cd -= dt;
          if (e.cd <= 0 && d < c.triggerRange) {
            e.state = 'windup';
            e.timer = c.windup;
            lockDirection(e, p.x, p.y);
          }
        } else if (e.state === 'windup') {
          e.timer -= dt;
          if (!rooted && e.timer <= 0) {
            e.state = 'dash';
            e.timer = c.dashTime;
          }
        } else if (e.state === 'dash') {
          e.x += e.dx * c.dashSpeed * dt;
          e.y += e.dy * c.dashSpeed * dt;
          contactSource = c.attackNames.dash;
          contactDamage = c.dashDamage;
          e.timer -= dt;
          if (e.timer <= 0) {
            e.state = 'recover';
            e.timer = c.recover;
          }
        } else if (e.state === 'recover') {
          e.timer -= dt;
          if (e.timer <= 0) {
            e.state = 'move';
            e.cd = c.cooldown;
          }
        }
        break;
      }

      case 'spitter': {
        const c = ENEMY_CONFIG.spitter;
        if (e.state === 'move') {
          const [minR, maxR] = c.preferredRange;
          if (d > maxR) moveToward(e, p.x, p.y, speed, dt);
          else if (d < minR) moveToward(e, e.x * 2 - p.x, e.y * 2 - p.y, speed, dt);
          else {
            // 거리를 유지하며 옆으로 맴돈다 (id 짝/홀로 방향 결정)
            const sgn = e.id % 2 === 0 ? 1 : -1;
            const nx = -(p.y - e.y) / (d || 1);
            const ny = (p.x - e.x) / (d || 1);
            e.x += nx * sgn * speed * 0.5 * dt;
            e.y += ny * sgn * speed * 0.5 * dt;
          }
          e.cd -= dt;
          if (e.cd <= 0 && d < c.fireRange) {
            e.state = 'aim';
            e.timer = c.windup;
          }
        } else if (e.state === 'aim') {
          e.timer -= dt;
          if (e.timer <= 0) {
            const a = Math.atan2(p.y - e.y, p.x - e.x);
            sim.spawnEnemyShot(e.x, e.y, a, c.projectileSpeed, c.projectileDamage * e.dmgMul, c.projectileRadius, c.attackNames.shot, true);
            e.state = 'move';
            e.cd = c.fireInterval;
          }
        }
        break;
      }

      case 'elite': {
        const c = ENEMY_CONFIG.elite;
        if (e.state === 'move') {
          moveToward(e, p.x, p.y, speed, dt);
          e.cd -= dt;
          if (e.cd <= 0 && d < 520) {
            if (e.attackIndex % 2 === 0) {
              e.state = 'windup';
              e.timer = c.chargeWindup;
              lockDirection(e, p.x, p.y);
            } else {
              e.state = 'burstWindup';
              e.timer = c.burstWindup;
            }
            e.attackIndex++;
          }
        } else if (e.state === 'windup') {
          e.timer -= dt;
          if (!rooted && e.timer <= 0) {
            e.state = 'dash';
            e.timer = c.dashTime;
          }
        } else if (e.state === 'dash') {
          e.x += e.dx * c.dashSpeed * dt;
          e.y += e.dy * c.dashSpeed * dt;
          contactSource = c.attackNames.dash;
          contactDamage = c.dashDamage;
          e.timer -= dt;
          if (e.timer <= 0) {
            e.state = 'recover';
            e.timer = c.recover;
          }
        } else if (e.state === 'burstWindup') {
          e.timer -= dt;
          if (e.timer <= 0) {
            for (let i = 0; i < c.burstCount; i++) {
              const a = (i / c.burstCount) * Math.PI * 2 + e.attackIndex * 0.2;
              sim.spawnEnemyShot(e.x, e.y, a, c.burstSpeed, c.burstDamage * e.dmgMul, c.projectileRadius, c.attackNames.burst);
            }
            sim.emit('enemyShoot', e.x, e.y);
            e.state = 'recover';
            e.timer = 0.4;
          }
        } else if (e.state === 'recover') {
          e.timer -= dt;
          if (e.timer <= 0) {
            e.state = 'move';
            e.cd = c.attackInterval;
          }
        }
        break;
      }
    }

    const pad = ARENA_CONFIG.wallPadding + e.r;
    e.x = clamp(e.x, pad, ARENA_CONFIG.width - pad);
    e.y = clamp(e.y, pad, ARENA_CONFIG.height - pad);

    if (dist(e.x, e.y, p.x, p.y) < e.r + p.r) {
      sim.hurtPlayer(contactDamage * e.dmgMul, contactSource, 'contact');
    }
  }
  separate(sim);
}

/** 적끼리 겹치지 않게 밀어낸다. 보스는 움직이지 않는 장애물 취급. */
function separate(sim: GameSim): void {
  const list = sim.enemies;
  for (let i = 0; i < list.length; i++) {
    const a = list[i];
    if (a.dead) continue;
    for (let j = i + 1; j < list.length; j++) {
      const b = list[j];
      if (b.dead) continue;
      const dx = b.x - a.x;
      const dy = b.y - a.y;
      const min = a.r + b.r;
      const d2 = dx * dx + dy * dy;
      if (d2 >= min * min || d2 === 0) continue;
      const d = Math.sqrt(d2);
      const push = (min - d) / 2;
      const nx = dx / d;
      const ny = dy / d;
      // 돌진 중인 적은 밀리지 않는다
      const aw = a.state === 'dash' ? 0 : 1;
      const bw = b.state === 'dash' ? 0 : 1;
      a.x -= nx * push * aw;
      a.y -= ny * push * aw;
      b.x += nx * push * bw;
      b.y += ny * push * bw;
    }
    const boss = sim.boss;
    if (boss && !boss.dead) {
      const dx = a.x - boss.x;
      const dy = a.y - boss.y;
      const min = a.r + boss.r;
      const d = Math.hypot(dx, dy);
      if (d < min && d > 0) {
        a.x += (dx / d) * (min - d);
        a.y += (dy / d) * (min - d);
      }
    }
  }
}
