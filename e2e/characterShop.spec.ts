import { expect, test } from '@playwright/test';
import { collectErrors } from './util';

test('전용 강화 상점은 탭과 구매를 유지하고 선택한 캐릭터에만 강화가 적용된다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1536, height: 1024 });
  await page.goto('/?dev=1&god=1&seed=53');
  await page.getByTestId('open-shop').click();
  await expect(page.getByTestId('buy-hp')).toBeDisabled();
  await page.evaluate(() => (window as any).__rift.debug.addTokens(260));
  await page.keyboard.press('Escape');
  await page.getByTestId('open-shop').click();
  await page.getByTestId('buy-hp').click();
  await expect(page.getByTestId('shop-tokens')).toHaveText('◆ 250');
  await page.getByTestId('shop-tab-common').focus();
  await page.keyboard.press('ArrowRight');
  await expect(page.getByTestId('shop-tab-ranger')).toBeFocused();
  await expect(page.getByTestId('shop-tab-ranger')).toHaveAttribute('aria-selected', 'true');
  await expect(page.locator('.shop-grid .shop-item')).toHaveCount(7);
  expect(await page.getByRole('tabpanel').evaluate((panel) => panel.scrollHeight - panel.clientHeight)).toBeLessThanOrEqual(1);
  await page.getByTestId('buy-rangerAim').click();
  await expect(page.getByTestId('lv-rangerAim')).toHaveText('1/5');
  await expect(page.getByTestId('shop-tokens')).toHaveText('◆ 235');
  await expect(page.getByTestId('shop-tab-ranger')).toHaveAttribute('aria-selected', 'true');
  await expect(page.getByTestId('buy-rangerAim')).toBeFocused();
  await expect(page.getByTestId('buy-rangerAim')).toContainText('35');
  await expect(page.getByText('사거리 +3% → +6%')).toBeVisible();
  await expect(page.getByTestId('buy-rangerExtraPierce')).toContainText('100');
  await page.getByTestId('buy-rangerExtraPierce').click();
  await expect(page.getByTestId('lv-rangerExtraPierce')).toHaveText('1/1');
  await expect(page.getByTestId('buy-rangerExtraPierce')).toBeDisabled();
  await expect(page.getByTestId('shop-tokens')).toHaveText('◆ 135');
  await page.getByTestId('shop-tab-lumen').click();
  await expect(page.locator('.shop-grid .shop-item')).toHaveCount(7);
  expect(await page.getByRole('tabpanel').evaluate((panel) => panel.scrollHeight - panel.clientHeight)).toBeLessThanOrEqual(1);
  await expect(page.getByText('서리 포탑 전용').first()).toBeVisible();
  await expect(page.getByTestId('buy-lumenTurretPierce')).toContainText('100');
  await page.getByTestId('buy-lumenTurretPierce').click();
  await expect(page.getByTestId('lv-lumenTurretPierce')).toHaveText('1/1');
  await expect(page.getByTestId('buy-lumenTurretPierce')).toBeDisabled();
  await expect(page.getByTestId('shop-tokens')).toHaveText('◆ 35');
  await page.getByTestId('buy-lumenWard').click();
  await page.getByTestId('shop-tab-roan').click();
  await expect(page.locator('.shop-grid .shop-item')).toHaveCount(6);
  await expect(page.getByTestId('buy-roanPierce')).toBeEnabled();
  await expect(page.getByText('Lv24')).toBeVisible();
  await page.getByTestId('buy-roanReach').click();

  await page.reload();
  await page.getByTestId('open-shop').click();
  await expect(page.getByTestId('shop-tokens')).toHaveText('◆ 5');
  await expect(page.getByTestId('lv-hp')).toHaveText('1/5');
  for (const [tab, upgrade] of [['ranger', 'rangerAim'], ['lumen', 'lumenWard'], ['roan', 'roanReach']] as const) {
    await page.getByTestId(`shop-tab-${tab}`).click();
    await expect(page.getByTestId(`lv-${upgrade}`)).toHaveText('1/5');
    await expect(page.getByTestId(`buy-${upgrade}`)).toBeDisabled();
  }
  await page.getByTestId('shop-back').click();
  await page.getByTestId('play').click();
  await page.getByTestId('character-roan').click();
  await expect(page.getByTestId('hud-hp')).toBeVisible();
  const combat = await page.evaluate(() => {
    const { sim } = (window as any).__rift;
    return [sim.roan.range, sim.characterShopBonus('lumenWard'), sim.characterShopBonus('rangerAim')];
  });
  expect(combat).toEqual([127.5, 0, 0]);
  expect(errors).toEqual([]);
});
