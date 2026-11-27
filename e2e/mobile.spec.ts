import { expect, test } from '@playwright/test';
import { collectErrors, snap } from './util';

test.use({ isMobile: true, hasTouch: true, deviceScaleFactor: 1, viewport: { width: 390, height: 844 } });

test('터치 조작 배치를 바꿔도 이동과 회피가 동시에 되고 새로고침 후 배치가 유지된다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?dev=1&god=1&seed=1');
  await expect(page.getByText('조이스틱으로 이동', { exact: true })).toBeVisible();
  await page.getByTestId('play').tap();
  await page.getByTestId('character-ranger').tap();
  const stick = page.getByTestId('touch-stick');
  const dodge = page.getByTestId('touch-dodge');
  const menu = page.getByTestId('hud-menu');
  const layout = page.getByRole('combobox', { name: '터치 조작 배치' });
  await expect(stick).toBeVisible();
  await expect(dodge).toHaveAttribute('aria-disabled', 'false');

  const canvas = page.locator('#game-root canvas');
  await expect.poll(() => canvas.boundingBox()).toMatchObject({ x: 0, y: 0, width: 390, height: 844 });

  const menuBox = (await menu.boundingBox())!;
  expect(menuBox.x).toBeLessThan(24);
  expect(menuBox.y).toBeLessThan(24);
  expect((await stick.boundingBox())!.x).toBeLessThan(24);
  expect((await dodge.boundingBox())!.x).toBeGreaterThan(250);

  await menu.tap();
  await expect(layout).toHaveValue('left');
  await layout.selectOption('right');
  await page.getByTestId('resume').tap();
  await expect(stick).toBeVisible();
  const pad = (await stick.boundingBox())!;
  const key = (await dodge.boundingBox())!;
  expect(pad.y).toBeGreaterThan(600);
  expect(pad.x).toBeGreaterThan(250);
  expect(key.x).toBeLessThan(24);

  const cdp = await page.context().newCDPSession(page);
  const start = { id: 1, x: pad.x + pad.width / 2, y: pad.y + pad.height / 2 };
  const right = { ...start, x: start.x + pad.width * .35 };
  const action = { id: 2, x: key.x + key.width / 2, y: key.y + key.height / 2 };
  const before = (await snap(page)).player!;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [right] });
  await expect.poll(async () => (await snap(page)).player!.x).toBeGreaterThan(before.x + 20);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [right, action] });
  await expect.poll(() => page.evaluate(() => {
    const { sim } = (window as any).__rift;
    return [sim.dodges, Math.round(sim.player.dodgeDx), Math.round(sim.player.dodgeDy)];
  })).toEqual([1, 1, 0]);
  await expect(dodge).toHaveAttribute('aria-disabled', 'true');
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await expect.poll(() => page.evaluate(() => (window as any).__rift.sim.player.dodgeTime)).toBeLessThanOrEqual(0);
  const stopped = (await snap(page)).player!;
  await page.waitForTimeout(180);
  expect((await snap(page)).player!.x).toBe(stopped.x);

  // Rotation while a finger was on the joystick clears the previous movement.
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [start] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [right] });
  await expect.poll(async () => (await snap(page)).player!.x).toBeGreaterThan(stopped.x + 10);
  await page.setViewportSize({ width: 844, height: 390 });
  await expect.poll(() => canvas.boundingBox()).toMatchObject({ x: 0, y: 0, width: 844, height: 390 });
  await expect.poll(() => page.evaluate(() => (window as any).__rift.app.scene.cameras.main.width)).toBe(844);
  const rotated = (await snap(page)).player!;
  await page.waitForTimeout(180);
  expect((await snap(page)).player!.x).toBe(rotated.x);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });

  await menu.tap();
  await expect(page.getByRole('heading', { name: '일시정지' })).toBeVisible();
  await expect(layout).toHaveValue('right');
  await expect(stick).toBeHidden();
  const elapsed = (await snap(page)).elapsed;
  await page.getByTestId('pause-status').tap();
  await expect(page.getByRole('dialog', { name: '상태창' })).toBeVisible();
  await page.getByTestId('status-close').tap();
  expect((await snap(page)).elapsed).toBe(elapsed);
  await page.getByTestId('resume').tap();
  await expect(stick).toBeVisible();
  expect((await stick.boundingBox())!.x).toBeGreaterThan(700);
  expect((await dodge.boundingBox())!.x).toBeLessThan(24);
  await expect.poll(async () => (await snap(page)).elapsed!).toBeGreaterThan(elapsed!);

  await page.evaluate(() => {
    const { sim, debug } = (window as any).__rift;
    debug.addXp((sim.xpNeeded - sim.xp) / sim.stats.xpGain);
  });
  await expect(page.locator('.levelup header .muted')).toHaveText('강화 하나를 선택하세요');
  await expect(stick).toBeHidden();
  await page.getByTestId('choice-0').tap();
  await expect(stick).toBeVisible();

  await page.reload();
  await page.getByTestId('play').tap();
  await page.getByTestId('character-ranger').tap();
  await expect(stick).toBeVisible();
  expect((await stick.boundingBox())!.x).toBeGreaterThan(700);
  await menu.tap();
  await expect(layout).toHaveValue('right');
  await layout.selectOption('left');
  await page.getByTestId('resume').tap();
  await expect(stick).toBeVisible();
  expect((await stick.boundingBox())!.x).toBeLessThan(24);
  expect((await dodge.boundingBox())!.x).toBeGreaterThan(700);
  expect(errors).toEqual([]);
});
