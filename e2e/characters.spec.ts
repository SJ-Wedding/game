import { expect, test } from '@playwright/test';
import { collectErrors, snap } from './util';

const starters = [['chain', '연쇄 번개'], ['turret', '서리 포탑']] as const;

for (const [weapon, name] of starters) {
  test(`마도공 루멘: 시작 무기로 ${name} 선택`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?dev=1&god=1&seed=551');
    await page.getByTestId('play').click();
    const selection = page.getByRole('dialog', { name: '캐릭터 선택' });
    await expect(selection.locator('.character-card')).toHaveCount(3);
    await page.getByTestId('character-lumen').click();
    await expect(page.getByRole('dialog', { name: '루멘의 시작 무기' })).toBeVisible();
    expect((await snap(page)).runsStarted).toBe(0);
    await page.keyboard.press('Escape');
    await expect(selection).toBeVisible();
    await page.getByTestId('character-lumen').click();
    await page.getByTestId(`lumen-${weapon}`).click();
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
    await page.evaluate(() => {
      const { sim } = (window as any).__rift;
      const e = sim.spawnEnemy('chaser', sim.player.x + 150, sim.player.y);
      e.speed = 0;
      e.hp = e.maxHp = 1e4;
    });
    await expect.poll(async () => page.evaluate((key) => {
      const { sim, app } = (window as any).__rift;
      return [sim.stacks[key], app.scene.playerImage.texture.key];
    }, weapon)).toEqual([1, `lumen-${weapon}`]);
    await expect.poll(async () => page.evaluate((key) => (window as any).__rift.sim.damageByAttack[key] ?? 0, weapon)).toBeGreaterThan(0);
    expect((await snap(page)).shotsFired).toBe(0);
    await page.keyboard.press('Tab');
    await expect(page.getByRole('heading', { name: '마도공 루멘 · Lv 1' })).toBeVisible();
    await expect(page.getByRole('button', { name: `${name} Lv 1` })).toBeVisible();
    await expect(page.getByText('특수 무기 합체 조합식')).toHaveCount(0);
    expect(errors).toEqual([]);
  });
}

test('철검 수호자 로안: 베기와 전용 강화 스택이 상태창에 표시된다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?dev=1&god=1&seed=552');
  await page.getByTestId('play').click();
  await page.getByTestId('character-roan').click();
  await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  await page.evaluate(() => {
    const { sim } = (window as any).__rift;
    const target = sim.spawnEnemy('chaser', sim.player.x + 90, sim.player.y);
    target.hp = target.maxHp = 1000;
    target.speed = 0;
  });
  await expect.poll(() => page.evaluate(() => (window as any).__rift.sim.hitsByAttack.sword ?? 0)).toBeGreaterThan(0);
  expect((await snap(page)).shotsFired).toBe(0);
  await page.evaluate(() => {
    const { sim } = (window as any).__rift;
    sim.grantBonusChoices(1);
  });
  const mastery = page.locator('.card').filter({ hasText: '전용 강화' }).first();
  const name = await mastery.locator('.name').innerText();
  await mastery.click();
  await page.keyboard.press('Tab');
  const status = page.locator('.status');
  await expect(status).toBeVisible();
  await expect(status.getByRole('heading', { name: '철검 수호자 로안 · Lv 1' })).toBeVisible();
  await expect(status.getByRole('rowheader', { name: '베기 거리' })).toBeVisible();
  await expect(status.locator('.mastery-stack').filter({ hasText: name })).toContainText('1스택');
  await expect(status.locator('.mastery-total')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('로안: 6·12·18레벨에 고른 형태 순서와 다음 베기를 보여 준다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?dev=1&god=1&seed=553');
  await page.getByTestId('play').click();
  await page.getByTestId('character-roan').click();
  await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  const selections = [[6, 'swordCrush', 3], [12, 'swordGuard', 2], [18, 'swordCrescent', 1]] as const;
  for (const [level, choice, count] of selections) {
    await page.evaluate((targetLevel) => {
      const { sim } = (window as any).__rift;
      const noInput = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, dodge: false };
      while (sim.level < targetLevel) {
        sim.gainXp((sim.xpNeeded - sim.xp + 0.00001) / (sim.stats.xpGain * sim.relics.xpMultiplier));
        sim.step(noInput);
        while (sim.level < targetLevel && sim.phase === 'levelup') sim.choose(0);
      }
    }, level);
    await expect(page.getByRole('heading', { name: `로안 공격 형태 · Lv ${level}` })).toBeVisible();
    await expect(page.locator('[data-sword-form]')).toHaveCount(count);
    await expect(page.getByTestId('reroll')).toHaveCount(0);
    await page.locator(`[data-sword-form="${choice}"]`).click();
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  }

  const next = page.getByTestId('hud-sword-next');
  await expect(next).toContainText('강철 파쇄');
  await page.evaluate(() => {
    const { sim } = (window as any).__rift;
    const target = sim.spawnEnemy('chaser', sim.player.x + 75, sim.player.y);
    target.hp = target.maxHp = 1000;
    target.speed = 0;
  });
  await expect(next).toContainText('근위 검무');
  await page.keyboard.press('Tab');
  const order = page.getByTestId('sword-order');
  await expect(order.locator('li')).toHaveCount(3);
  for (const [index, name] of ['강철 파쇄', '근위 검무', '반월 연격'].entries()) {
    await expect(order.locator('li').nth(index)).toContainText(name);
  }
  await expect(order.locator('[aria-current="step"]')).toContainText('근위 검무');
  expect(errors).toEqual([]);
});
