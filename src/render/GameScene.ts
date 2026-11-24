import Phaser from 'phaser';
import { ARENA_CONFIG, VIEW_CONFIG } from '../config/arena';
import { BOSS_CONFIG } from '../config/boss';
import { DROP_CONFIG } from '../config/drops';
import { ENEMY_CONFIG } from '../config/enemies';
import type { App } from '../app/App';
import { BOSS_CHARGE_LENGTH } from '../core/boss';
import type { GameSim } from '../core/sim';
import type { Enemy, InputState, SimEvent } from '../core/types';
import { PALETTE } from './palette';
import { WEAPONS, weaponRankEffect } from '../config/weapons';
import { ARENA_TEXTURE, ACTOR_TEXTURES, WEAPON_FRAMES, WEAPON_SPRITES, weaponEffects, type WeaponSprite } from './textures';
import {
  drawEcho, drawExplosion, drawFlame, drawFrostBarrel, drawFrostShot, drawGravityPull, drawInfected,
  drawInfectionSmoke, drawLightning, drawPlayerShot, drawRiftBarrier, drawSpearAim, drawSpearStrike,
} from './weaponEffects';
import { drawResonance } from './fusionEffects';

interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  life: number;
  max: number;
  color: number;
  size: number;
}

/**
 * 화면 그리기 + 입력 수집만 담당. 게임 규칙은 core/GameSim, 흐름은 App 이 맡는다.
 * 씬은 앱 전체에서 한 번만 만들어지고 재시작해도 다시 만들지 않으므로 입력 리스너가 중복되지 않는다.
 */
export class GameScene extends Phaser.Scene {
  private readonly app: App;
  private groundEffects!: Phaser.GameObjects.Graphics;
  private g!: Phaser.GameObjects.Graphics;
  private playerImage!: Phaser.GameObjects.Image;
  private bossImage!: Phaser.GameObjects.Image;
  private readonly enemyImages: Phaser.GameObjects.Image[] = [];
  private visibleEnemies = 0;
  private readonly weaponImages: Phaser.GameObjects.Image[] = [];
  private visibleWeapons = 0;
  private keys!: Record<'W' | 'A' | 'S' | 'D' | 'UP' | 'DOWN' | 'LEFT' | 'RIGHT' | 'SPACE', Phaser.Input.Keyboard.Key>;
  private particles: Particle[] = [];
  private renderedSim: GameSim | null = null;
  private lastNow = 0;
  /** 프레임 사이에 눌렀다 뗀 짧은 입력도 놓치지 않도록 이벤트로 받아 둔다 */
  private dodgeQueued = false;
  private clickQueued = false;

  constructor(app: App) {
    super('game');
    this.app = app;
  }

  preload(): void {
    this.load.image('arena-slate', ARENA_TEXTURE);
    for (const [key, url] of Object.entries(ACTOR_TEXTURES)) this.load.image(key, url);
    this.load.spritesheet('weapon-effects', weaponEffects, { frameWidth: 24, frameHeight: 24 });
    for (const [key, url] of Object.entries(WEAPON_SPRITES)) this.load.image(`weapon-${key}`, url);
  }

  create(): void {
    this.drawFloor();
    this.groundEffects = this.add.graphics().setDepth(1);
    this.bossImage = this.add.image(0, 0, 'boss').setDepth(3).setVisible(false);
    this.playerImage = this.add.image(0, 0, 'player').setDepth(5).setVisible(false);
    this.g = this.add.graphics().setDepth(6);
    const kb = this.input.keyboard!;
    // 문자 키는 캡처하지 않는다(개발 패널 입력칸을 방해하지 않도록). Space·방향키만 캡처해 페이지 스크롤을 막는다.
    this.keys = kb.addKeys('W,A,S,D,UP,DOWN,LEFT,RIGHT,SPACE', false) as GameScene['keys'];
    kb.addCapture('SPACE,UP,DOWN,LEFT,RIGHT');
    kb.on('keydown-SPACE', (e: KeyboardEvent) => {
      if (!e.repeat) this.dodgeQueued = true;
    });
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      if (p.leftButtonDown()) this.clickQueued = true;
    });
    this.input.mouse?.disableContextMenu();
    this.cameras.main.setBounds(0, 0, ARENA_CONFIG.width, ARENA_CONFIG.height);
    this.cameras.main.centerOn(ARENA_CONFIG.width / 2, ARENA_CONFIG.height / 2);
    this.app.attachScene(this);
  }

  update(): void {
    // Phaser 의 delta 는 목표 프레임 시간(16.7ms)으로 평활·제한되므로, 느린 기기에서도 실제 시간과 맞도록 직접 잰다
    const now = performance.now();
    const deltaMs = this.lastNow === 0 ? 0 : now - this.lastNow;
    this.lastNow = now;
    if (this.app.screen !== 'playing') {
      // 메뉴·일시정지 중에 누른 입력이 재개 직후 실행되지 않게 버린다
      this.dodgeQueued = false;
      this.clickQueued = false;
    }
    const input = this.sampleInput();
    this.dodgeQueued = false;
    this.clickQueued = false;
    const events = this.app.frame(deltaMs / 1000, input);
    const sim = this.app.sim;
    if (sim !== this.renderedSim) {
      this.particles.length = 0;
      this.renderedSim = sim;
    }
    if (sim) {
      this.handleEvents(events);
      // 시간이 멈춘 동안에는 파티클도 멈춘다
      if (sim.running) this.updateParticles(Math.min(deltaMs / 1000, 0.05));
      this.cameras.main.centerOn(sim.player.x, sim.player.y);
    }
    this.draw(sim);
  }

  /** 월드 좌표 → 브라우저 화면 좌표 (자동 테스트용) */
  worldToClient(x: number, y: number): { x: number; y: number } {
    const cam = this.cameras.main;
    const rect = this.game.canvas.getBoundingClientRect();
    const sx = (x - cam.worldView.x) / VIEW_CONFIG.width;
    const sy = (y - cam.worldView.y) / VIEW_CONFIG.height;
    return { x: rect.left + sx * rect.width, y: rect.top + sy * rect.height };
  }

  private sampleInput(): InputState {
    const k = this.keys;
    const ptr = this.input.activePointer;
    const world = ptr.positionToCamera(this.cameras.main) as Phaser.Math.Vector2;
    return {
      moveX: (k.D.isDown || k.RIGHT.isDown ? 1 : 0) - (k.A.isDown || k.LEFT.isDown ? 1 : 0),
      moveY: (k.S.isDown || k.DOWN.isDown ? 1 : 0) - (k.W.isDown || k.UP.isDown ? 1 : 0),
      aimX: world.x,
      aimY: world.y,
      fire: ptr.leftButtonDown() || this.clickQueued,
      dodge: this.dodgeQueued,
    };
  }

  // ───────────────────────── 이펙트 ─────────────────────────

  private handleEvents(events: SimEvent[]): void {
    for (const ev of events) {
      const x = ev.x ?? 0;
      const y = ev.y ?? 0;
      switch (ev.type) {
        case 'kill':
          this.burst(x, y, PALETTE.chaser, 8, 160, 3);
          break;
        case 'hit':
          this.burst(x, y, PALETTE.hit, 2, 90, 2);
          break;
        case 'hurt':
          this.cameras.main.shake(120, 0.006);
          this.burst(x, y, PALETTE.playerHurt, 10, 200, 3);
          break;
        case 'explode':
          this.burst(x, y, PALETTE.telegraph, 14, 260, 4);
          break;
        case 'bossSpawn':
          this.cameras.main.shake(400, 0.01);
          break;
        case 'bossPhase':
          this.cameras.main.shake(300, 0.012);
          this.burst(x, y, PALETTE.bossTrim, 40, 380, 5);
          break;
        case 'bomb':
          this.cameras.main.flash(180, 255, 220, 160);
          this.cameras.main.shake(200, 0.01);
          break;
        case 'revive':
          this.burst(x, y, 0xffffff, 40, 300, 4);
          break;
        case 'levelup':
          this.burst(x, y, PALETTE.gem, 24, 240, 3);
          break;
        case 'dodge':
          this.burst(x, y, PALETTE.player, 6, 120, 2);
          break;
        case 'victory':
          this.burst(x, y, PALETTE.bossCore, 60, 420, 5);
          break;
      }
    }
  }

  private burst(x: number, y: number, color: number, n: number, speed: number, size: number): void {
    for (let i = 0; i < n && this.particles.length < 400; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.3 + Math.random() * 0.7);
      const life = 0.25 + Math.random() * 0.3;
      this.particles.push({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s, life, max: life, color, size });
    }
  }

  private updateParticles(dt: number): void {
    for (const q of this.particles) {
      q.x += q.vx * dt;
      q.y += q.vy * dt;
      q.vx *= 0.92;
      q.vy *= 0.92;
      q.life -= dt;
    }
    this.particles = this.particles.filter((q) => q.life > 0);
  }

  // ───────────────────────── 그리기 ─────────────────────────

  private drawFloor(): void {
    const W = ARENA_CONFIG.width;
    const H = ARENA_CONFIG.height;
    const pad = ARENA_CONFIG.wallPadding;
    this.add.tileSprite(0, 0, W, H, 'arena-slate').setOrigin(0).setTileScale(3).setTint(0x9ca8be);
    const f = this.add.graphics();
    const cx = W / 2;
    const cy = H / 2;
    f.fillStyle(0x111a2b, 0.34).fillCircle(cx, cy, 265);
    f.lineStyle(1, 0xc69765, 0.28).strokeCircle(cx, cy, 278);
    for (let i = 0; i < 32; i++) {
      const angle = i * Math.PI / 16;
      const x = cx + Math.cos(angle) * 277;
      const y = cy + Math.sin(angle) * 277;
      f.fillStyle(i % 4 === 0 ? 0xd6a271 : PALETTE.rune, 0.65).fillRect(x - 2, y - 2, 4, 4);
    }
    f.lineStyle(2, PALETTE.rune, 0.42);
    for (const r of [104, 116, 254, 266]) f.strokeCircle(cx, cy, r);
    for (let i = 0; i < 8; i++) {
      const a = i * Math.PI / 4;
      const x = cx + Math.cos(a) * 228;
      const y = cy + Math.sin(a) * 228;
      f.strokePoints([
        { x: x + Math.cos(a) * 15, y: y + Math.sin(a) * 15 },
        { x: x - Math.sin(a) * 7, y: y + Math.cos(a) * 7 },
        { x: x - Math.cos(a) * 15, y: y - Math.sin(a) * 15 },
        { x: x + Math.sin(a) * 7, y: y - Math.cos(a) * 7 },
      ], true);
    }

    f.fillStyle(PALETTE.wall, 1);
    f.fillRect(0, 0, W, pad).fillRect(0, H - pad, W, pad)
      .fillRect(0, 0, pad, H).fillRect(W - pad, 0, pad, H);
    f.lineStyle(8, PALETTE.wallTrim, 1).strokeRect(pad - 5, pad - 5, W - pad * 2 + 10, H - pad * 2 + 10);
    f.lineStyle(2, PALETTE.wallEdge, 0.85).strokeRect(pad, pad, W - pad * 2, H - pad * 2);
    f.lineStyle(1, PALETTE.wallEdge, 0.45);
    for (let x = 80; x < W - 40; x += 64) {
      f.lineBetween(x, 6, x, pad - 8).lineBetween(x, H - pad + 8, x, H - 6);
    }
    for (let y = 80; y < H - 40; y += 64) {
      f.lineBetween(6, y, pad - 8, y).lineBetween(W - pad + 8, y, W - 6, y);
    }
    this.cameras.main.setBackgroundColor(PALETTE.bg);
  }

  private draw(sim: GameSim | null): void {
    const ground = this.groundEffects;
    const g = this.g;
    ground.clear();
    g.clear();
    const enemyCount = sim?.enemies.length ?? 0;
    for (let i = enemyCount; i < this.visibleEnemies; i++) this.enemyImages[i].setVisible(false);
    this.visibleEnemies = enemyCount;
    this.playerImage.setVisible(sim !== null);
    this.bossImage.setVisible(Boolean(sim?.boss && !sim.boss.dead));
    this.drawWeapons(sim);
    if (!sim) return;
    const t = sim.elapsed;

    // 1) 장판 예고 (낙화)
    for (const h of sim.hazards) {
      const k = h.t / h.dur;
      const urgent = h.dur - h.t < 0.25;
      ground.fillStyle(PALETTE.telegraph, urgent ? 0.4 : 0.16).fillCircle(h.x, h.y, h.r);
      ground.fillStyle(PALETTE.telegraph, 0.35).fillCircle(h.x, h.y, h.r * k);
      ground.lineStyle(urgent ? 4 : 2, PALETTE.telegraphEdge, 0.95).strokeCircle(h.x, h.y, h.r);
    }

    // 2) 돌진·원형 탄막 예고
    for (const e of sim.enemies) {
      if ((e.kind === 'charger' || e.kind === 'elite') && e.state === 'windup') {
        const c = e.kind === 'charger' ? ENEMY_CONFIG.charger : ENEMY_CONFIG.elite;
        const total = e.kind === 'charger' ? ENEMY_CONFIG.charger.windup : ENEMY_CONFIG.elite.chargeWindup;
        this.lineTelegraph(e.x, e.y, e.dx, e.dy, c.dashSpeed * c.dashTime + e.r, e.r, 1 - e.timer / total);
      } else if (e.kind === 'elite' && e.state === 'burstWindup') {
        this.ringTelegraph(e.x, e.y, e.r, 1 - e.timer / ENEMY_CONFIG.elite.burstWindup);
      }
    }
    const b = sim.boss;
    if (b && !b.dead) {
      if (b.state === 'chargeWindup') this.lineTelegraph(b.x, b.y, b.dx, b.dy, BOSS_CHARGE_LENGTH + b.r, b.r, 1 - b.timer / BOSS_CONFIG.charge.windup);
      if (b.state === 'ringWindup') this.ringTelegraph(b.x, b.y, b.r, 1 - b.timer / BOSS_CONFIG.ring.windup);
      if (b.state === 'enter') {
        ground.lineStyle(4, PALETTE.bossTrim, 0.8).strokeCircle(b.x, b.y, b.r + 40 * (b.timer % 0.4) * 2.5);
      }
    }

    // 3) 경험치
    for (const gem of sim.gems) {
      const big = gem.value >= 10;
      const s = big ? 9 : 5;
      ground.fillStyle(big ? PALETTE.gemBig : PALETTE.gem, 1);
      ground.fillTriangle(gem.x, gem.y - s, gem.x + s * 0.75, gem.y, gem.x - s * 0.75, gem.y);
      ground.fillTriangle(gem.x, gem.y + s, gem.x + s * 0.75, gem.y, gem.x - s * 0.75, gem.y);
    }

    // 3-1) 드랍 아이템 (흰 테두리 원 + 아이콘). 사라지기 직전에는 깜빡인다
    for (const it of sim.pickups) {
      if (it.life < DROP_CONFIG.blinkTime && Math.floor(it.life * 6) % 2 === 0) continue;
      const bob = Math.sin(t * 4 + it.x) * 2;
      const x = it.x;
      const y = it.y + bob;
      g.fillStyle(0x10121c, 0.85).fillCircle(x, y, 13);
      g.lineStyle(2, 0xffffff, 1).strokeCircle(x, y, 13);
      if (it.kind === 'heal') {
        g.fillStyle(0xff4d6d, 1).fillRect(x - 2.5, y - 8, 5, 16).fillRect(x - 8, y - 2.5, 16, 5);
      } else if (it.kind === 'magnet') {
        g.lineStyle(4, 0x6fb7ff, 1).beginPath().arc(x, y + 1, 6, Math.PI, 0, false).strokePath();
        g.fillStyle(0xff4d6d, 1).fillRect(x - 8, y + 1, 4, 5).fillRect(x + 4, y + 1, 4, 5);
      } else {
        g.fillStyle(0x2b2b33, 1).fillCircle(x, y + 2, 7);
        g.lineStyle(2, 0xffd166, 1).lineBetween(x + 3, y - 4, x + 7, y - 9);
        g.fillStyle(0xffd166, 1).fillCircle(x + 7, y - 9, 2);
      }
    }

    // 4) 적
    for (let i = 0; i < enemyCount; i++) this.drawEnemy(sim.enemies[i], i, sim, t);

    // 5) 보스
    if (b && !b.dead) {
      const shifting = b.state === 'enter' || b.state === 'phaseShift';
      const flash = b.flash > 0 || (shifting && Math.floor(t * 12) % 2 === 0);
      const angle = b.state === 'charge' || b.state === 'chargeWindup'
        ? Math.atan2(b.dy, b.dx)
        : Math.atan2(sim.player.y - b.y, sim.player.x - b.x);
      const r = b.r;
      ground.fillStyle(0x070a11, 0.55).fillCircle(b.x, b.y + 3, r);
      ground.lineStyle(2, PALETTE.bossTrim, b.phase === 2 ? 0.9 : 0.48).strokeCircle(b.x, b.y, b.r + 3);
      this.bossImage.setPosition(b.x, b.y).setFlipX(Math.cos(angle) < -0.15).setScale(5);
      if (flash) this.bossImage.setTintFill(PALETTE.hit);
      else this.bossImage.clearTint();
    }

    // 6) 플레이어 투사체
    for (const s of sim.playerShots) drawPlayerShot(g, s);

    // 7) 적 투사체 (가장 위에 — 놓치지 않도록)
    for (const s of sim.enemyShots) {
      g.fillStyle(PALETTE.enemyShot, 0.35).fillCircle(s.x, s.y, s.r + 4);
      g.fillStyle(PALETTE.enemyShot, 1).fillCircle(s.x, s.y, s.r);
      g.fillStyle(PALETTE.enemyShotCore, 1).fillCircle(s.x, s.y, s.r * 0.45);
    }

    // 8) 플레이어
    const p = sim.player;
    const dodging = p.dodgeTime > 0;
    if (dodging) {
      ground.fillStyle(PALETTE.player, 0.25).fillCircle(p.x - p.dodgeDx * 18, p.y - p.dodgeDy * 18, p.r);
      ground.fillStyle(PALETTE.player, 0.15).fillCircle(p.x - p.dodgeDx * 34, p.y - p.dodgeDy * 34, p.r);
    }
    const blink = p.invuln > 0 && !dodging && Math.floor(t * 20) % 2 === 0;
    const col = p.hurtFlash > 0 ? PALETTE.playerHurt : PALETTE.player;
    ground.fillStyle(0x070a11, 0.65).fillCircle(p.x, p.y + 2, p.r + 3);
    ground.lineStyle(2, col, blink ? 0.45 : 0.85).strokeCircle(p.x, p.y, p.r + 7);
    this.playerImage.setPosition(p.x, p.y)
      .setScale(2)
      .setFlipX(p.facingLeft)
      .setAlpha(blink ? 0.45 : 1);
    if (p.hurtFlash > 0) this.playerImage.setTint(PALETTE.playerHurt);
    else this.playerImage.clearTint();
    const ax = Math.cos(p.aim);
    const ay = Math.sin(p.aim);
    g.fillStyle(PALETTE.playerOutline, 1).fillTriangle(
      p.x + ax * (p.r + 18), p.y + ay * (p.r + 18),
      p.x + ax * (p.r + 9) - ay * 4, p.y + ay * (p.r + 9) + ax * 4,
      p.x + ax * (p.r + 9) + ay * 4, p.y + ay * (p.r + 9) - ax * 4,
    );
    // 자동 조준 대상 표시 (청록 꺾쇠)
    const tg = sim.target;
    if (tg) {
      const rr = tg.r + 9;
      const rot = t * 3;
      g.lineStyle(2, PALETTE.player, 0.9);
      for (let i = 0; i < 4; i++) {
        const a = rot + (i * Math.PI) / 2;
        g.beginPath();
        g.arc(tg.x, tg.y, rr, a - 0.35, a + 0.35);
        g.strokePath();
      }
    }
    // 흡수 범위 (은은하게)
    ground.lineStyle(1, PALETTE.gem, 0.12).strokeCircle(p.x, p.y, sim.stats.pickupRadius);

    // 9) 파티클
    for (const q of this.particles) {
      g.fillStyle(q.color, Math.max(0, q.life / q.max)).fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
  }

  private drawWeapons(sim: GameSim | null): void {
    let count = 0;
    const ground = this.groundEffects;
    const g = this.g;
    if (sim) {
      for (const d of sim.weapons.devices) {
        switch (d.kind) {
          case 'spear':
            drawSpearAim(ground, g, d.x, d.y, d.angle, d.r, d.age / d.duration);
            break;
          case 'barrier':
            drawRiftBarrier(ground, d, d.angle, d.r, weaponRankEffect('barrier', sim.stacks.barrier), d.duration - d.age, d.age);
            break;
          case 'flame':
            drawFlame(ground, g, d.x, d.y, d.r, d.age, d.duration);
            break;
          case 'gravity':
            drawGravityPull(ground, d.x, d.y, d.r, d.age);
            this.weaponImage(count++, d.kind, d.x, d.y);
            break;
          case 'axe':
            ground.lineStyle(5, 0xffb660, 0.36).lineBetween(d.x, d.y, d.x - Math.cos(d.angle) * 35, d.y - Math.sin(d.angle) * 35);
            this.weaponImage(count++, d.kind, d.x, d.y, { rotation: d.age * 19, scale: 1.4 });
            break;
          case 'turret':
            this.weaponImage(count++, d.kind, d.x, d.y, { scale: 1.3 });
            drawFrostBarrel(g, d.x, d.y, d.angle);
            break;
          case 'mine':
            this.weaponImage(count++, d.kind, d.x, d.y);
            break;
        }
      }
      for (const blade of sim.weapons.blades) {
        const angle = Math.atan2(blade.y - sim.player.y, blade.x - sim.player.x);
        this.weaponImage(count++, 'orbit', blade.x, blade.y, { rotation: angle + Math.PI / 2, scale: 1.4 });
      }

      for (const fx of sim.weapons.effects) {
        if (fx.variant === 'resonance') {
          drawResonance(ground, g, fx);
          continue;
        }
        if (fx.kind === 'infection') {
          drawInfectionSmoke(g, fx);
          continue;
        }
        if (fx.kind === 'mine' || fx.kind === 'gravity') {
          drawExplosion(ground, g, fx);
          continue;
        }
        if (fx.kind === 'mark' || (fx.kind === 'chain' && !fx.radius)) {
          drawLightning(g, fx);
          continue;
        }
        if (fx.kind === 'turret') {
          drawFrostShot(g, fx);
          continue;
        }
        if (fx.kind === 'spear') {
          drawSpearStrike(g, fx);
          continue;
        }
        const alpha = fx.life / fx.duration;
        const start = fx.points[0];
        if (fx.kind === 'echo') {
          const opacity = fx.variant === 'echoCharge' ? 0.18 + (1 - alpha) * 0.59 : alpha * 0.87;
          this.weaponImage(count++, 'echo', start.x, start.y, { scale: 1.32, alpha: opacity, flipX: fx.points[1].x < start.x });
          drawEcho(ground, g, fx, opacity);
          continue;
        }
        const color = WEAPONS[fx.kind].color;
        if (fx.radius) {
          g.lineStyle(2, color, alpha * 0.85).strokeCircle(start.x, start.y, fx.radius);
          if (fx.radius >= 40) ground.fillStyle(color, alpha * 0.19).fillCircle(start.x, start.y, fx.radius);
        }
      }
      for (const enemy of sim.weapons.infected.keys()) {
        if (enemy.dead) continue;
        drawInfected(g, enemy.x, enemy.y, enemy.r, sim.elapsed, enemy.id);
      }
    }
    for (let i = count; i < this.visibleWeapons; i++) this.weaponImages[i].setVisible(false);
    this.visibleWeapons = count;
  }

  private weaponImage(index: number, kind: WeaponSprite, x: number, y: number,
    { rotation = 0, scale = 1, alpha = 1, flipX = false } = {}): void {
    const usesSheet = kind === 'mine' || kind === 'gravity';
    const texture = usesSheet ? 'weapon-effects' : `weapon-${kind}`;
    const frame = usesSheet ? WEAPON_FRAMES[kind] : undefined;
    let image = this.weaponImages[index];
    if (!image) {
      image = this.add.image(x, y, texture, frame).setDepth(4);
      this.weaponImages[index] = image;
    } else if (image.texture.key !== texture || (frame !== undefined && Number(image.frame.name) !== frame)) {
      image.setTexture(texture, frame);
    }
    image.setPosition(x, y).setRotation(rotation).setScale(scale).setAlpha(alpha).setFlipX(flipX).setVisible(true);
  }

  private drawEnemy(e: Enemy, index: number, sim: GameSim, t: number): void {
    let image = this.enemyImages[index];
    if (!image) {
      image = this.add.image(0, 0, e.kind).setDepth(2);
      this.enemyImages[index] = image;
    } else if (image.texture.key !== e.kind) {
      image.setTexture(e.kind);
    }

    const aim = (e.kind === 'charger' && e.state !== 'move')
      || (e.kind === 'elite' && (e.state === 'windup' || e.state === 'dash'));
    const angle = aim ? Math.atan2(e.dy, e.dx) : Math.atan2(sim.player.y - e.y, sim.player.x - e.x);
    const bob = Math.round(Math.sin(t * 8 + e.id));
    const shake = e.state === 'windup' ? Math.sin(t * 60) * 1.7 : 0;
    this.groundEffects.fillStyle(0x070a11, 0.55).fillCircle(e.x, e.y + 2, e.r);
    image.setVisible(true).setPosition(e.x + shake, e.y + bob)
      .setFlipX(Math.cos(angle) < -0.15).setScale(e.kind === 'elite' ? 3 : 2);
    if (e.basicResistance > 0) {
      this.groundEffects.lineStyle(2, 0xe2c9a3, 0.76).strokeCircle(e.x, e.y, e.r + 5);
    }
    if (e.flash > 0) image.setTintFill(PALETTE.hit);
    else image.clearTint();

    if (e.kind === 'spitter' && e.state === 'aim') {
      this.groundEffects.lineStyle(2, PALETTE.enemyShot, 0.85).strokeCircle(e.x, e.y, e.r * 1.24);
    }
    if (e.kind === 'elite') {
      const w = e.r * 2.2;
      this.g.fillStyle(0x000000, 0.7).fillRect(e.x - w / 2, e.y - e.r - 14, w, 5);
      this.g.fillStyle(PALETTE.eliteTrim, 1).fillRect(e.x - w / 2, e.y - e.r - 14, (w * Math.max(0, e.hp)) / e.maxHp, 5);
    }
  }

  private lineTelegraph(x: number, y: number, dx: number, dy: number, len: number, halfW: number, k: number): void {
    const g = this.groundEffects;
    const nx = -dy;
    const ny = dx;
    const pts = [
      { x: x + nx * halfW, y: y + ny * halfW },
      { x: x + nx * halfW + dx * len, y: y + ny * halfW + dy * len },
      { x: x - nx * halfW + dx * len, y: y - ny * halfW + dy * len },
      { x: x - nx * halfW, y: y - ny * halfW },
    ];
    g.fillStyle(PALETTE.telegraph, 0.12 + 0.25 * k).fillPoints(pts, true);
    g.lineStyle(2, PALETTE.telegraphEdge, 0.9).strokePoints(pts, true);
    // 진행도 표시: 끝으로 차오르는 선
    g.lineStyle(3, PALETTE.telegraphEdge, 1).lineBetween(x, y, x + dx * len * k, y + dy * len * k);
  }

  private ringTelegraph(x: number, y: number, r: number, k: number): void {
    const g = this.groundEffects;
    const rr = r + 20 + 110 * k;
    g.fillStyle(PALETTE.telegraph, 0.1 + 0.2 * k).fillCircle(x, y, rr);
    g.lineStyle(3, PALETTE.telegraphEdge, 0.9).strokeCircle(x, y, rr);
  }
}
