import { expect, test, type Locator } from '@playwright/test';
import { collectErrors, snap } from './util';

test('작은 화면에서 유물 아이콘이 보유 목록과 선택지의 테두리 안에 들어간다', async ({ page }) => {
  const ids = ['chargeStance', 'migrantFeather', 'alchemistFlask', 'fortuneCard'];
  const expectArtworkFits = async (frames: Locator, count: number) => {
    await expect(frames).toHaveCount(count);
    const artwork = await frames.evaluateAll((items) => items.map((frame) => {
      const icon = frame.querySelector('.relic-art')!;
      const bounds = frame.getBoundingClientRect();
      const art = icon.getBoundingClientRect();
      const style = getComputedStyle(icon);
      return { position: style.backgroundPosition, image: style.backgroundImage,
        fits: art.width > 0 && art.height > 0 && art.left >= bounds.left - 1 && art.top >= bounds.top - 1
          && art.right <= bounds.right + 1 && art.bottom <= bounds.bottom + 1 };
    }));
    expect(artwork.every(({ fits, image }) => fits && image.includes('relic-icons'))).toBe(true);
    expect(new Set(artwork.map(({ position }) => position)).size).toBe(count);
  };

  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/?dev=1&god=1&seed=561');
  await page.getByTestId('play').click();
  await page.getByTestId('character-roan').click();
  await page.getByTestId('hud-hp').waitFor();
  await page.evaluate((relics) => {
    const { sim } = (window as any).__rift;
    for (const id of relics) sim.relics.acquire(id);
  }, ids);
  await expectArtworkFits(page.getByTestId('hud-relics').locator('.relic-icon'), 4);
  await page.keyboard.press('Escape');
  await expectArtworkFits(page.locator('.pause-content .relic-icon'), 4);
  await page.keyboard.press('Escape');
  await page.keyboard.press('Tab');
  await page.getByRole('tab', { name: '보유 유물 4개' }).click();
  await expectArtworkFits(page.getByTestId('status-relics').locator('.relic-icon'), 4);
  await page.getByTestId('status-relics').locator('[data-relic="fortuneCard"]').focus();
  await expect(page.locator('#status-relic-detail')).toContainText('점술가의 카드');
  await expectArtworkFits(page.locator('.status-relic-art'), 1);
  await page.keyboard.press('Escape');

  for (const choices of [ids.slice(0, 3), ids.slice(3)]) {
    await page.evaluate((relics) => {
      const { app, sim } = (window as any).__rift;
      sim.level = 5;
      sim.choices = relics.map((id) => ({ kind: 'relic', source: 'level', id }));
      app.showLevelUp();
    }, choices);
    await expectArtworkFits(page.locator('.relic-card > .choice-art'), choices.length);
  }

  await page.evaluate((relics) => {
    const { app } = (window as any).__rift;
    app.screens.showCarry(relics, () => {}, () => {});
  }, ids.slice(0, 3));
  await expectArtworkFits(page.locator('.relic-pick > .carry-art'), 3);
});

test('로안: 근접 특화 유물을 모두 가지면 수호자의 정수 카드가 나오고, 새 유물이 전투에서 동작한다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?dev=1&god=1&seed=561');
  await page.getByTestId('play').click();
  await page.getByTestId('character-roan').click();
  await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  await page.evaluate(() => {
    const { sim } = (window as any).__rift;
    // 삼중 선택의 인장은 보너스 선택 화면을 열지 않도록 보유 목록에만 넣는다
    sim.relics.owned.add('tripleChoice');
    // 상위 무기를 고르기 전에는 상위 무기 전용 유물이 나오지 않으므로 근접 특화 유물만 모두 가진다
    for (const id of ['elitePact', 'bloodThirst', 'weaponThrow', 'armorBreaker', 'warriorBreath', 'toughMuscle',
      'bountyLedger', 'painVault', 'phoenixAsh', 'riftCore', 'stoppedWatch', 'warCry', 'counterMaster', 'ironCharge']) sim.relics.acquire(id);
    const elite = sim.spawnEnemy('elite', sim.player.x + 400, sim.player.y);
    sim.damageEnemy(elite, 1e9);
  });
  await expect.poll(async () => (await snap(page)).screen).toBe('levelup');
  await expect(page.locator('.essence-card')).toHaveCount(3);
  await expect(page.locator('.panel.levelup h2')).toHaveText('중간 보스 유물');
  await expect(page.locator('.essence-card').first()).toContainText('수호자의 정수');
  await expect(page.locator('.essence-card').first()).toContainText('0 → 1 / 최대 5중첩');
  await page.getByTestId('choice-0').click();
  // 남은 전용 강화 보상 화면도 고른다
  while ((await snap(page)).screen === 'levelup') await page.getByTestId('choice-0').click();
  expect(await page.evaluate(() => Object.values((window as any).__rift.sim.essences).reduce((a: number, b) => a + (b as number), 0))).toBe(1);

  await page.evaluate(() => {
    const { sim } = (window as any).__rift;
    for (const dx of [90, 120]) {
      const target = sim.spawnEnemy('chaser', sim.player.x + dx, sim.player.y);
      target.hp = target.maxHp = 5000;
      target.speed = 0;
    }
  });
  await expect.poll(() => page.evaluate(() => (window as any).__rift.sim.hitsByAttack.sword ?? 0)).toBeGreaterThan(0);
  expect(errors).toEqual([]);
});

for (const weapon of ['chain', 'turret'] as const) {
  test(`루멘 ${weapon}: 전용 균열 수호자 유물을 모두 장착해도 오류 없이 전투한다`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?dev=1&god=1&seed=562');
    await page.getByTestId('play').click();
    await page.getByTestId('character-lumen').click();
    await page.getByTestId(`lumen-${weapon}`).click();
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
    await page.evaluate((w) => {
      const { sim } = (window as any).__rift;
      const ids = w === 'chain'
        ? ['chainCloud', 'chainOverload', 'chainRebound', 'chainDouble', 'chainRod', 'chainConductor']
        : ['turretPermafrost', 'turretScope', 'turretBlast', 'turretShotgun', 'turretMobile', 'turretResonance'];
      for (const id of ['lumenCrystal', 'lumenSight', 'lumenRune', 'lumenCycle', 'lumenCloak', 'lumenStaff', ...ids]) sim.relics.acquire(id);
      for (const [dx, dy] of [[120, 0], [180, 60], [180, -60], [260, 0]]) {
        const target = sim.spawnEnemy('chaser', sim.player.x + dx, sim.player.y + dy);
        target.hp = target.maxHp = 5000;
        target.speed = 0;
      }
    }, weapon);
    expect(await page.evaluate(() => (window as any).__rift.sim.relics.owned.size)).toBe(12);
    await expect.poll(() => page.evaluate((w) => (window as any).__rift.sim.hitsByAttack[w] ?? 0, weapon), { timeout: 15_000 }).toBeGreaterThan(8);
    expect(errors).toEqual([]);
  });
}
