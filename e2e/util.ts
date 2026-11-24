import { expect, type Page } from '@playwright/test';

export type Snapshot = {
  screen: string;
  runsStarted: number;
  listenerInstalls: number;
  elapsed: number | null;
  phase: string | null;
  paused: boolean | null;
  seed: number | null;
  level: number | null;
  hp: number | null;
  kills: number | null;
  enemies: number | null;
  spawned: number | null;
  shotsFired: number | null;
  boss: { hp: number; maxHp: number; state: string; dead: boolean } | null;
  bossSpawned: boolean | null;
  stacks: Record<string, number> | null;
  choices: string[] | null;
  player: { x: number; y: number; dodgeCd: number } | null;
  result: { outcome: string; cause: string; survivalTime: number; kills: number } | null;
  save: { settings: { volume: number }; records: Record<string, number | null> };
  pickups: { kind: string }[] | null;
  lastTokens: { total: number; survival: number } | null;
  tokens: number;
  stats: Record<string, number> | null;
};

export const snap = (page: Page): Promise<Snapshot> =>
  page.evaluate(() => (window as unknown as { __rift: { snapshot(): Snapshot } }).__rift.snapshot());

/** 페이지 오류(예외)를 모아 둔다. GPU 경고 같은 콘솔 warning 은 제외. */
export function collectErrors(page: Page): string[] {
  const errors: string[] = [];
  page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') errors.push(`console.error: ${m.text()}`);
  });
  return errors;
}

export async function startRun(page: Page, query: string): Promise<void> {
  await page.goto(`/?dev=1${query}`);
  await page.getByTestId('play').click();
  await page.getByTestId('character-ranger').click();
  await expect.poll(async () => (await snap(page)).screen).toBe('playing');
}

/** 전투 시간이 t초 이상이 될 때까지 대기 */
export async function waitElapsed(page: Page, t: number, timeout = 60_000): Promise<void> {
  await expect.poll(async () => (await snap(page)).elapsed ?? 0, { timeout }).toBeGreaterThanOrEqual(t);
}

/** 탭 숨김/표시를 흉내 낸다 (헤드리스 브라우저는 실제 탭 전환을 지원하지 않음) */
export async function setTabHidden(page: Page, hidden: boolean): Promise<void> {
  await page.evaluate((h) => {
    Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') });
    Object.defineProperty(document, 'hidden', { configurable: true, get: () => h });
    document.dispatchEvent(new Event('visibilitychange'));
  }, hidden);
}

/** 월드 좌표를 화면 좌표로 바꿔 마우스를 옮긴다 (캔버스 밖이면 가장자리로 제한) */
export async function aimAt(page: Page, x: number, y: number): Promise<void> {
  const pt = await page.evaluate(
    ([wx, wy]) => {
      const r = (window as unknown as { __rift: { worldToClient(x: number, y: number): { x: number; y: number } } }).__rift.worldToClient(wx, wy);
      const rect = document.querySelector('canvas')!.getBoundingClientRect();
      return {
        x: Math.min(rect.right - 2, Math.max(rect.left + 2, r.x)),
        y: Math.min(rect.bottom - 2, Math.max(rect.top + 2, r.y)),
      };
    },
    [x, y],
  );
  await page.mouse.move(pt.x, pt.y);
}
