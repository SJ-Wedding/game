import Phaser from 'phaser';
import { ARENA_CONFIG, VIEW_CONFIG } from '../config/arena';
import { BOSS_CONFIG } from '../config/boss';
import { ENEMY_CONFIG } from '../config/enemies';
import type { App } from '../app/App';
import { BOSS_CHARGE_LENGTH } from '../core/boss';
import { Rng } from '../core/rng';
import type { GameSim } from '../core/sim';
import type { Enemy, InputState, SimEvent } from '../core/types';
import { PALETTE } from './palette';

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
  private g!: Phaser.GameObjects.Graphics;
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

  create(): void {
    this.drawFloor();
    this.g = this.add.graphics();
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
    // 매 프레임 다시 그리지 않도록 한 번 그린 뒤 텍스처로 굽는다
    const f = this.make.graphics({}, false);
    f.fillStyle(PALETTE.floor, 1).fillRect(0, 0, W, H);
    f.lineStyle(1, PALETTE.grid, 1);
    for (let x = 0; x <= W; x += 64) f.lineBetween(x, 0, x, H);
    for (let y = 0; y <= H; y += 64) f.lineBetween(0, y, W, y);
    // 균열 문양 (고정 시드로 항상 같은 모양)
    const rng = new Rng(7);
    for (let i = 0; i < 70; i++) {
      const x = rng.range(pad + 40, W - pad - 40);
      const y = rng.range(pad + 40, H - pad - 40);
      const r = rng.range(14, 46);
      f.lineStyle(2, PALETTE.rune, 0.55).strokeCircle(x, y, r);
      if (rng.next() < 0.5) f.lineStyle(1, PALETTE.rune, 0.45).strokeCircle(x, y, r * 0.55);
    }
    for (let i = 0; i < 26; i++) {
      let x = rng.range(pad, W - pad);
      let y = rng.range(pad, H - pad);
      f.lineStyle(2, PALETTE.rune, 0.6).beginPath().moveTo(x, y);
      for (let k = 0; k < 6; k++) {
        x += rng.range(-60, 60);
        y += rng.range(-60, 60);
        f.lineTo(x, y);
      }
      f.strokePath();
    }
    // 벽
    f.fillStyle(PALETTE.wall, 1);
    f.fillRect(0, 0, W, pad).fillRect(0, H - pad, W, pad).fillRect(0, 0, pad, H).fillRect(W - pad, 0, pad, H);
    f.lineStyle(3, PALETTE.wallEdge, 0.9).strokeRect(pad, pad, W - pad * 2, H - pad * 2);
    if (!this.textures.exists('arena-floor')) f.generateTexture('arena-floor', W, H);
    f.destroy();
    this.add.image(0, 0, 'arena-floor').setOrigin(0, 0);
    this.cameras.main.setBackgroundColor(PALETTE.bg);
  }

  private draw(sim: GameSim | null): void {
    const g = this.g;
    g.clear();
    if (!sim) return;
    const t = sim.elapsed;

    // 1) 장판 예고 (낙화)
    for (const h of sim.hazards) {
      const k = h.t / h.dur;
      const urgent = h.dur - h.t < 0.25;
      g.fillStyle(PALETTE.telegraph, urgent ? 0.4 : 0.16).fillCircle(h.x, h.y, h.r);
      g.fillStyle(PALETTE.telegraph, 0.35).fillCircle(h.x, h.y, h.r * k);
      g.lineStyle(urgent ? 4 : 2, PALETTE.telegraphEdge, 0.95).strokeCircle(h.x, h.y, h.r);
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
        g.lineStyle(4, PALETTE.bossTrim, 0.8).strokeCircle(b.x, b.y, b.r + 40 * (b.timer % 0.4) * 2.5);
      }
    }

    // 3) 경험치
    for (const gem of sim.gems) {
      const big = gem.value >= 10;
      const s = big ? 9 : 5;
      g.fillStyle(big ? PALETTE.gemBig : PALETTE.gem, 1);
      g.fillTriangle(gem.x, gem.y - s, gem.x + s * 0.75, gem.y, gem.x - s * 0.75, gem.y);
      g.fillTriangle(gem.x, gem.y + s, gem.x + s * 0.75, gem.y, gem.x - s * 0.75, gem.y);
    }

    // 4) 적
    for (const e of sim.enemies) this.drawEnemy(e, sim, t);

    // 5) 보스
    if (b && !b.dead) {
      const blink = (b.state === 'enter' || b.state === 'phaseShift') && Math.floor(t * 12) % 2 === 0;
      const body = b.flash > 0 ? PALETTE.hit : blink ? PALETTE.bossTrim : PALETTE.boss;
      const spikes = 10;
      const pts: Phaser.Types.Math.Vector2Like[] = [];
      for (let i = 0; i < spikes * 2; i++) {
        const a = (i / (spikes * 2)) * Math.PI * 2 + t * 0.4;
        const r = i % 2 === 0 ? b.r * 1.12 : b.r * 0.88;
        pts.push({ x: b.x + Math.cos(a) * r, y: b.y + Math.sin(a) * r });
      }
      g.fillStyle(body, 1).fillPoints(pts, true);
      g.lineStyle(3, PALETTE.bossTrim, 1).strokePoints(pts, true);
      g.fillStyle(PALETTE.bossCore, 1).fillCircle(b.x, b.y, b.r * (b.phase === 2 ? 0.42 : 0.32));
      g.fillStyle(b.phase === 2 ? PALETTE.telegraph : PALETTE.boss, 1).fillCircle(b.x, b.y, b.r * 0.16);
    }

    // 6) 플레이어 투사체
    for (const s of sim.playerShots) {
      const l = Math.hypot(s.vx, s.vy) || 1;
      g.lineStyle(s.r, PALETTE.player, 0.35).lineBetween(s.x, s.y, s.x - (s.vx / l) * 16, s.y - (s.vy / l) * 16);
      g.fillStyle(PALETTE.playerShot, 1).fillCircle(s.x, s.y, s.r * 0.8);
    }

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
      g.fillStyle(PALETTE.player, 0.25).fillCircle(p.x - p.dodgeDx * 18, p.y - p.dodgeDy * 18, p.r);
      g.fillStyle(PALETTE.player, 0.15).fillCircle(p.x - p.dodgeDx * 34, p.y - p.dodgeDy * 34, p.r);
    }
    const blink = p.invuln > 0 && !dodging && Math.floor(t * 20) % 2 === 0;
    const col = p.hurtFlash > 0 ? PALETTE.playerHurt : PALETTE.player;
    g.fillStyle(col, blink ? 0.45 : 1).fillCircle(p.x, p.y, p.r);
    g.lineStyle(3, PALETTE.playerOutline, blink ? 0.5 : 1).strokeCircle(p.x, p.y, p.r);
    const ax = Math.cos(p.aim);
    const ay = Math.sin(p.aim);
    g.fillStyle(PALETTE.playerOutline, 1).fillTriangle(
      p.x + ax * (p.r + 12), p.y + ay * (p.r + 12),
      p.x + ax * (p.r + 2) - ay * 6, p.y + ay * (p.r + 2) + ax * 6,
      p.x + ax * (p.r + 2) + ay * 6, p.y + ay * (p.r + 2) - ax * 6,
    );
    // 흡수 범위 (은은하게)
    g.lineStyle(1, PALETTE.gem, 0.12).strokeCircle(p.x, p.y, sim.stats.pickupRadius);

    // 9) 파티클
    for (const q of this.particles) {
      g.fillStyle(q.color, Math.max(0, q.life / q.max)).fillRect(q.x - q.size / 2, q.y - q.size / 2, q.size, q.size);
    }
  }

  private drawEnemy(e: Enemy, sim: GameSim, t: number): void {
    const g = this.g;
    const flash = e.flash > 0;
    switch (e.kind) {
      case 'chaser': {
        const wob = Math.sin(t * 8 + e.id) * 1.5;
        g.fillStyle(flash ? PALETTE.hit : PALETTE.chaser, 1).fillCircle(e.x, e.y, e.r + wob * 0.3);
        g.fillStyle(PALETTE.chaserDark, 1).fillCircle(e.x - 4, e.y - 2, 2.5).fillCircle(e.x + 4, e.y - 2, 2.5);
        break;
      }
      case 'charger': {
        let a = Math.atan2(sim.player.y - e.y, sim.player.x - e.x);
        if (e.state !== 'move') a = Math.atan2(e.dy, e.dx);
        const r = e.r * 1.25;
        const tri = [0, 2.4, -2.4].map((o) => ({ x: e.x + Math.cos(a + o) * r, y: e.y + Math.sin(a + o) * r }));
        const shaking = e.state === 'windup' ? Math.sin(t * 60) * 2 : 0;
        tri.forEach((pt) => (pt.x += shaking));
        g.fillStyle(flash ? PALETTE.hit : PALETTE.charger, 1).fillPoints(tri, true);
        g.lineStyle(2, PALETTE.chargerDark, 1).strokePoints(tri, true);
        break;
      }
      case 'spitter': {
        const swell = e.state === 'aim' ? 1.25 : 1;
        const r = e.r * swell;
        const pts = [
          { x: e.x, y: e.y - r },
          { x: e.x + r, y: e.y },
          { x: e.x, y: e.y + r },
          { x: e.x - r, y: e.y },
        ];
        g.fillStyle(flash ? PALETTE.hit : PALETTE.spitter, 1).fillPoints(pts, true);
        g.fillStyle(e.state === 'aim' ? PALETTE.enemyShot : PALETTE.spitterDark, 1).fillCircle(e.x, e.y, r * 0.38);
        break;
      }
      case 'elite': {
        const pts: Phaser.Types.Math.Vector2Like[] = [];
        for (let i = 0; i < 6; i++) {
          const a = (i / 6) * Math.PI * 2 + t * 0.6;
          pts.push({ x: e.x + Math.cos(a) * e.r, y: e.y + Math.sin(a) * e.r });
        }
        g.fillStyle(flash ? PALETTE.hit : PALETTE.elite, 1).fillPoints(pts, true);
        g.lineStyle(3, PALETTE.eliteTrim, 1).strokePoints(pts, true);
        g.fillStyle(PALETTE.eliteTrim, 1).fillCircle(e.x, e.y, 6);
        // 체력 바
        const w = e.r * 2.2;
        g.fillStyle(0x000000, 0.6).fillRect(e.x - w / 2, e.y - e.r - 14, w, 5);
        g.fillStyle(PALETTE.eliteTrim, 1).fillRect(e.x - w / 2, e.y - e.r - 14, (w * Math.max(0, e.hp)) / e.maxHp, 5);
        break;
      }
    }
  }

  private lineTelegraph(x: number, y: number, dx: number, dy: number, len: number, halfW: number, k: number): void {
    const g = this.g;
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
    const g = this.g;
    const rr = r + 20 + 110 * k;
    g.fillStyle(PALETTE.telegraph, 0.1 + 0.2 * k).fillCircle(x, y, rr);
    g.lineStyle(3, PALETTE.telegraphEdge, 0.9).strokeCircle(x, y, rr);
  }
}
