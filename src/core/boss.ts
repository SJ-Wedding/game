import { ARENA_CONFIG } from '../config/arena';
import { BOSS_CONFIG, type BossPattern } from '../config/boss';
import { clamp, dist } from './math';
import type { GameSim } from './sim';
import type { Boss } from './types';

export function createBoss(x: number, y: number): Boss {
  return {
    x,
    y,
    r: BOSS_CONFIG.radius,
    hp: BOSS_CONFIG.hp,
    maxHp: BOSS_CONFIG.hp,
    phase: 1,
    state: 'enter',
    timer: BOSS_CONFIG.enterTime,
    cd: 0.8,
    dx: 0,
    dy: 1,
    wavesLeft: 0,
    waveIndex: 0,
    lastPattern: null,
    flash: 0,
    dead: false,
  };
}

/** 등장 연출·페이즈 전환 중에는 피해를 받지 않는다 */
export function bossInvulnerable(b: Boss): boolean {
  return b.state === 'enter' || b.state === 'phaseShift';
}

function pickPattern(sim: GameSim, b: Boss): BossPattern {
  const pool = BOSS_CONFIG.patterns[b.phase].filter((p) => p !== b.lastPattern);
  return pool[sim.rngAi.int(pool.length)];
}

export function updateBoss(sim: GameSim, dt: number): void {
  const b = sim.boss;
  if (!b || b.dead) return;
  const p = sim.player;
  const C = BOSS_CONFIG;
  const pi = b.phase - 1;
  if (b.flash > 0) b.flash -= dt;

  // 페이즈 전환
  if (b.phase === 1 && b.hp <= b.maxHp * C.phase2At) {
    b.phase = 2;
    b.state = 'phaseShift';
    b.timer = C.phaseShiftTime;
    sim.emit('bossPhase', b.x, b.y);
  }

  let contactDamage = C.contactDamage;
  let contactSource = C.attackNames.contact;

  switch (b.state) {
    case 'enter':
    case 'phaseShift':
      b.timer -= dt;
      if (b.timer <= 0) {
        b.state = 'idle';
        b.cd = 0.6;
      }
      break;

    case 'idle': {
      const d = dist(b.x, b.y, p.x, p.y);
      if (d > b.r + p.r + 30) {
        b.x += ((p.x - b.x) / d) * C.speed * dt;
        b.y += ((p.y - b.y) / d) * C.speed * dt;
      }
      b.cd -= dt;
      if (b.cd <= 0) {
        const pattern = pickPattern(sim, b);
        b.lastPattern = pattern;
        sim.emit('bossAttack', b.x, b.y);
        if (pattern === 'ring') {
          b.state = 'ringWindup';
          b.timer = C.ring.windup;
        } else if (pattern === 'charge') {
          b.state = 'chargeWindup';
          b.timer = C.charge.windup;
          const dd = Math.hypot(p.x - b.x, p.y - b.y) || 1;
          b.dx = (p.x - b.x) / dd;
          b.dy = (p.y - b.y) / dd;
        } else if (pattern === 'meteor') {
          const n = C.meteor.count[pi];
          for (let i = 0; i < n; i++) {
            // 첫 장판은 플레이어 위치 정확히, 나머지는 주변에 흩뿌린다 (난수는 항상 2개씩 소비)
            const ox = sim.rngAi.range(-C.meteor.spread, C.meteor.spread);
            const oy = sim.rngAi.range(-C.meteor.spread, C.meteor.spread);
            sim.addHazard(i === 0 ? p.x : p.x + ox, i === 0 ? p.y : p.y + oy, C.meteor.radius, C.meteor.delay, C.meteor.damage, C.attackNames.meteor);
          }
          b.state = 'cast';
          b.timer = C.meteor.castTime;
        } else {
          for (let i = 0; i < C.summon.count; i++) {
            const a = (i / C.summon.count) * Math.PI * 2;
            sim.spawnEnemy('chaser', b.x + Math.cos(a) * (b.r + 40), b.y + Math.sin(a) * (b.r + 40));
          }
          b.state = 'cast';
          b.timer = C.summon.castTime;
        }
      }
      break;
    }

    case 'ringWindup':
      b.timer -= dt;
      if (b.timer <= 0) {
        b.state = 'ringFire';
        b.wavesLeft = C.ring.waves[pi];
        b.waveIndex = 0;
        b.timer = 0;
      }
      break;

    case 'ringFire':
      b.timer -= dt;
      if (b.timer <= 0) {
        const n = C.ring.bullets[pi];
        const offset = (b.waveIndex % 2) * (Math.PI / n);
        for (let i = 0; i < n; i++) {
          sim.spawnEnemyShot(b.x, b.y, (i / n) * Math.PI * 2 + offset, C.ring.speed, C.ring.damage, C.ring.radius, C.attackNames.ring);
        }
        sim.emit('enemyShoot', b.x, b.y);
        b.waveIndex++;
        b.wavesLeft--;
        b.timer = C.ring.waveGap;
        if (b.wavesLeft <= 0) {
          b.state = 'idle';
          b.cd = C.attackCooldown[pi];
        }
      }
      break;

    case 'chargeWindup':
      b.timer -= dt;
      if (b.timer <= 0) {
        b.state = 'charge';
        b.timer = C.charge.time;
      }
      break;

    case 'charge':
      b.x += b.dx * C.charge.speed * dt;
      b.y += b.dy * C.charge.speed * dt;
      contactDamage = C.charge.damage;
      contactSource = C.attackNames.charge;
      b.timer -= dt;
      if (b.timer <= 0) {
        b.state = 'recover';
        b.timer = C.charge.recover;
      }
      break;

    case 'recover':
    case 'cast':
      b.timer -= dt;
      if (b.timer <= 0) {
        b.state = 'idle';
        b.cd = C.attackCooldown[pi];
      }
      break;
  }

  const pad = ARENA_CONFIG.wallPadding + b.r;
  b.x = clamp(b.x, pad, ARENA_CONFIG.width - pad);
  b.y = clamp(b.y, pad, ARENA_CONFIG.height - pad);

  if (b.state !== 'enter' && dist(b.x, b.y, p.x, p.y) < b.r + p.r) {
    sim.hurtPlayer(contactDamage, contactSource);
  }
}

/** 돌진 예고선 길이 */
export const BOSS_CHARGE_LENGTH = BOSS_CONFIG.charge.speed * BOSS_CONFIG.charge.time;
