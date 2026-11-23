import { expect, test } from '@playwright/test';
import { mkdirSync, writeFileSync } from 'node:fs';
import { collectErrors, snap } from './util';

/**
 * @long — 실시간 15분 플레이 측정.
 *
 * 자동 플레이 봇(src/core/bot.ts)이 매 프레임 화면 상태를 보고, **브라우저 DOM 키보드·마우스 이벤트**
 * (keydown/keyup, mousedown/mousemove/mouseup, 카드 click)를 발생시켜 조작한다.
 * 이벤트는 사람이 입력할 때와 같은 경로(Phaser 입력 → GameScene.sampleInput → GameSim)를 지난다.
 * 자동 전투(AUTO_COMBAT.enabled)가 켜져 있으면 마우스 이벤트는 게임이 무시하고 이동·회피·강화 선택만 의미가 있다.
 * (Playwright 의 원격 입력 API 는 헤드리스 렌더링 부하 때문에 초당 4회 정도만 반응할 수 있어 사람보다 훨씬 느리다.)
 * 개발 옵션(무적·보스 직전 시작)은 쓰지 않는다. 결과는 playtest-results/full-run-<seed>.json 에 저장된다
 * (test-results/ 는 Playwright 가 실행마다 지우므로 쓰지 않는다).
 *
 *   FULL_RUN_SEEDS=1003,1011 npm run test:e2e:full
 */
const seeds = (process.env.FULL_RUN_SEEDS ?? '1003').split(',').map((s) => Number(s.trim()));

/** 페이지 안에서 매 프레임 실행되는 입력 드라이버 */
function installDriver(): void {
  type Rift = {
    app: { screen: string };
    sim: { elapsed: number; level: number; bossSpawned: boolean } | null;
    botInput(): { moveX: number; moveY: number; aimX: number; aimY: number; dodge: boolean } | null;
    botChoose(): number;
    worldToClient(x: number, y: number): { x: number; y: number } | null;
  };
  const w = window as unknown as { __rift: Rift; __driver: Record<string, unknown> };
  const r = w.__rift;
  const canvas = document.querySelector('canvas')!;
  const KEYCODES: Record<string, number> = { KeyW: 87, KeyA: 65, KeyS: 83, KeyD: 68, Space: 32 };
  const held = new Set<string>();
  const state = {
    frames: 0,
    decisions: 0,
    levelUps: [] as { at: number; level: number }[],
    bossAt: null as number | null,
    done: false,
    mouseDown: false,
    lastX: 0,
    lastY: 0,
    spaceUpNext: false,
  };
  w.__driver = state;

  const key = (type: 'keydown' | 'keyup', code: string) => {
    const ev = new KeyboardEvent(type, { code, key: code === 'Space' ? ' ' : code.slice(3).toLowerCase(), bubbles: true, cancelable: true });
    // Phaser 는 keyCode 를 읽는데 KeyboardEvent 생성자는 keyCode 를 지원하지 않는다
    Object.defineProperty(ev, 'keyCode', { get: () => KEYCODES[code] });
    Object.defineProperty(ev, 'which', { get: () => KEYCODES[code] });
    document.body.dispatchEvent(ev);
  };
  const setKey = (code: string, on: boolean) => {
    if (on && !held.has(code)) {
      held.add(code);
      key('keydown', code);
    } else if (!on && held.has(code)) {
      held.delete(code);
      key('keyup', code);
    }
  };
  const mouse = (type: 'mousemove' | 'mousedown' | 'mouseup', x: number, y: number) => {
    const target = type === 'mouseup' ? window : canvas;
    target.dispatchEvent(
      new MouseEvent(type, { clientX: x, clientY: y, button: 0, buttons: type === 'mouseup' ? 0 : state.mouseDown || type === 'mousedown' ? 1 : 0, bubbles: true, cancelable: true }),
    );
  };
  const releaseAll = () => {
    for (const k of [...held]) setKey(k, false);
    if (state.mouseDown) {
      state.mouseDown = false;
      mouse('mouseup', state.lastX, state.lastY);
    }
  };

  const tick = () => {
    state.frames++;
    const screen = r.app.screen;
    const sim = r.sim;
    if (sim?.bossSpawned && state.bossAt === null) state.bossAt = sim.elapsed;
    if (state.spaceUpNext) {
      state.spaceUpNext = false;
      setKey('Space', false);
    }
    if (screen === 'result') {
      releaseAll();
      state.done = true;
      return;
    }
    if (screen === 'levelup' && sim) {
      releaseAll();
      const i = r.botChoose();
      const card = document.querySelector<HTMLButtonElement>(`[data-testid="choice-${i}"]`);
      if (card) {
        state.levelUps.push({ at: sim.elapsed, level: sim.level });
        card.click();
      }
    } else if (screen === 'playing') {
      const inp = r.botInput();
      const pt = inp && r.worldToClient(inp.aimX, inp.aimY);
      if (inp && pt) {
        state.decisions++;
        setKey('KeyD', inp.moveX > 0.38);
        setKey('KeyA', inp.moveX < -0.38);
        setKey('KeyS', inp.moveY > 0.38);
        setKey('KeyW', inp.moveY < -0.38);
        const rect = canvas.getBoundingClientRect();
        state.lastX = Math.min(rect.right - 2, Math.max(rect.left + 2, pt.x));
        state.lastY = Math.min(rect.bottom - 2, Math.max(rect.top + 2, pt.y));
        mouse('mousemove', state.lastX, state.lastY);
        if (!state.mouseDown) {
          mouse('mousedown', state.lastX, state.lastY);
          state.mouseDown = true;
        }
        if (inp.dodge) {
          setKey('Space', true);
          state.spaceUpNext = true;
        }
      }
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}

for (const seed of seeds) {
  test(`@long 실시간 한 판 플레이 (seed ${seed})`, async ({ page }) => {
    test.setTimeout(20 * 60_000);
    const errors = collectErrors(page);
    await page.goto(`/?dev=1&seed=${seed}`);
    await page.getByTestId('play').click();
    const wallStart = Date.now();
    await page.evaluate(installDriver);

    let lastMinute = 0;
    for (;;) {
      await page.waitForTimeout(2000);
      const s = await snap(page);
      if (s.screen === 'result') break;
      const minute = Math.floor((s.elapsed ?? 0) / 60);
      if (minute > lastMinute) {
        lastMinute = minute;
        console.log(`[seed ${seed}] 전투 ${minute}분 · Lv ${s.level} · 체력 ${Math.round(s.hp ?? 0)} · 실제 ${((Date.now() - wallStart) / 1000).toFixed(0)}초`);
      }
      expect(Date.now() - wallStart).toBeLessThan(18 * 60_000);
    }
    const wallSeconds = (Date.now() - wallStart) / 1000;
    const s = await snap(page);
    const d = await page.evaluate(() => (window as unknown as { __driver: { frames: number; decisions: number; levelUps: { at: number }[]; bossAt: number | null } }).__driver);
    const res = s.result as unknown as Record<string, unknown> & { outcome: string; cause: string; survivalTime: number };
    const report = {
      seed,
      outcome: res.outcome,
      cause: res.cause,
      killedBy: res.killedBy,
      combatSeconds: res.survivalTime,
      wallSeconds,
      kills: res.kills,
      level: res.level,
      upgrades: res.upgrades,
      firstLevelUpAt: d.levelUps[0]?.at ?? null,
      levelUps: d.levelUps.length,
      bossSpawnedAt: d.bossAt,
      bossHpRatio: res.bossHpRatio,
      framesPerSecond: d.frames / wallSeconds,
      decisionsPerSecond: d.decisions / wallSeconds,
    };
    mkdirSync('playtest-results', { recursive: true });
    writeFileSync(`playtest-results/full-run-${seed}.json`, JSON.stringify(report, null, 2));
    console.log(JSON.stringify(report));

    expect(errors).toEqual([]);
    expect(['boss', 'death', 'timeout']).toContain(res.cause);
    // 일시정지·탭 숨김이 없으면 전투 시간 ≈ 실제 경과 시간 (레벨업 선택은 같은 프레임에 처리)
    expect(Math.abs(wallSeconds - res.survivalTime)).toBeLessThan(30);
    if (res.survivalTime > 811) expect(d.bossAt).toBeCloseTo(810, 0);
  });
}
