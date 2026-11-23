import { expect, test } from '@playwright/test';
import { collectErrors, snap, startRun, waitElapsed } from './util';

/** v0.3.0: 등급·새로고침·상태창·드랍·토큰·강화 상점 */
test.describe('성장 시스템', () => {
  let errors: string[] = [];
  test.beforeEach(({ page }) => {
    errors = collectErrors(page);
  });
  test.afterEach(() => {
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('레벨업 카드에 등급이 표시되고, 새로고침으로 후보가 바뀐다', async ({ page }) => {
    await startRun(page, '&seed=31&god=1');
    await waitElapsed(page, 1);
    await page.evaluate(() => { const r = (window as any).__rift; r.debug.addXp((r.sim.xpNeeded - r.sim.xp) / r.sim.stats.xpGain); }); // 정확히 1레벨
    await expect(page.locator('.card .cat').filter({ hasText: '특수 무기 획득' })).toHaveCount(3);
    await page.keyboard.press('Digit1');
    await page.evaluate(() => { const r = (window as any).__rift; r.debug.addXp((r.sim.xpNeeded - r.sim.xp) / r.sim.stats.xpGain); });
    await expect(page.locator('#overlay[data-screen="levelup"]')).toBeVisible();
    const cards = page.locator('.card');
    await expect(cards).toHaveCount(3);
    // 일반 강화 카드에는 등급 속성과 "등급 · 분류" 표시가 있다
    const graded = page.locator('.card[data-grade]:not([data-grade=""])');
    expect(await graded.count()).toBeGreaterThan(0);
    await expect(graded.first().locator('.cat')).toHaveText(/^(일반|희귀|영웅|전설) · /);

    const before = (await snap(page)).choices;
    await expect(page.getByTestId('reroll')).toContainText('남은 2회');
    await page.keyboard.press('KeyR');
    await expect(page.getByTestId('reroll')).toContainText('남은 1회');
    const after = (await snap(page)).choices;
    expect(after).not.toEqual(before);
    await page.getByTestId('reroll').click();
    await expect(page.getByTestId('reroll')).toBeDisabled();
    const t = (await snap(page)).elapsed;
    await page.waitForTimeout(500);
    expect((await snap(page)).elapsed).toBe(t);
    await page.keyboard.press('Digit1');
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  });

  test('Tab 상태창: 시간이 멈추고 능력치(시작·영구·현재)가 표시된다', async ({ page }) => {
    await startRun(page, '&seed=32&god=1');
    await waitElapsed(page, 2);
    await page.keyboard.press('Tab');
    await expect(page.locator('#overlay[data-screen="status"]')).toBeVisible();
    await expect(page.getByTestId('stat-fireRate')).toHaveText('1.20회/초');
    await expect(page.getByTestId('stat-damage')).toHaveText('9');
    await expect(page.getByTestId('stat-maxHp')).toHaveText('70');
    const a = await snap(page);
    expect(a.paused).toBe(true);
    await page.waitForTimeout(800);
    expect((await snap(page)).elapsed).toBe(a.elapsed);
    await page.keyboard.press('Tab');
    await expect(page.locator('#overlay')).toBeHidden();
    await waitElapsed(page, a.elapsed! + 0.5);
    // 일시정지 메뉴에서 열고 닫으면 일시정지 메뉴로 돌아간다
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-status').click();
    await expect(page.locator('#overlay[data-screen="status"]')).toBeVisible();
    await page.getByTestId('status-close').click();
    await expect(page.locator('#overlay[data-screen="pause"]')).toBeVisible();
  });

  test('드랍 아이템을 밟으면 효과가 적용된다 (회복 물약)', async ({ page }) => {
    await startRun(page, '&seed=33');
    await waitElapsed(page, 1);
    await page.evaluate(() => {
      const r = (window as any).__rift;
      r.sim.player.hp = 30;
      r.debug.dropItem('heal', 120, 0);
    });
    await page.keyboard.down('KeyD');
    await expect.poll(async () => (await snap(page)).hp!, { timeout: 5000 }).toBeGreaterThan(50);
    await page.keyboard.up('KeyD');
    expect((await snap(page)).pickups).toEqual([]);
  });

  test('판 종료 → 토큰 지급 → 상점 구매 → 새로고침 후 유지 → 다음 판 능력치 반영', async ({ page }) => {
    await page.goto('/?dev=1&seed=34');
    await expect(page.getByTestId('title-tokens')).toHaveText('◆ 0');
    await page.getByTestId('play').click();
    await waitElapsed(page, 1);
    // 생존 1분(토큰 2)을 만들기 위해 개발 훅으로 전투 시간을 1:01 로 옮긴 뒤 쓰러진다
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      sim.tick = 61 * 60;
      sim.hurtPlayer(9999, '시험용 일격');
    });
    await expect.poll(async () => (await snap(page)).screen, { timeout: 10_000 }).toBe('result');
    await expect(page.getByTestId('result-tokens')).toContainText('획득 토큰 ◆');
    const earned = (await snap(page)).lastTokens!;
    expect(earned.survival).toBe(2);

    // 상점 가격(10)을 맞추기 위해 개발 훅으로 토큰을 보충한 뒤 실제 버튼으로 구매
    await page.getByTestId('result-title').click();
    await page.evaluate(() => (window as any).__rift.debug.addTokens(20));
    await page.getByTestId('open-shop').click();
    const tokens = earned.total + 20;
    await expect(page.getByTestId('shop-tokens')).toHaveText(`◆ ${tokens}`);
    await page.getByTestId('buy-damage').click();
    await expect(page.getByTestId('lv-damage')).toHaveText(' 1/5');
    await expect(page.getByTestId('shop-tokens')).toHaveText(`◆ ${tokens - 10}`);

    await page.reload();
    await expect(page.getByTestId('title-tokens')).toHaveText(`◆ ${tokens - 10}`);
    await page.getByTestId('play').click();
    await waitElapsed(page, 0.5);
    const s = await snap(page);
    expect(s.stats!.damage).toBeCloseTo(9 * 1.04, 5);
  });
});
