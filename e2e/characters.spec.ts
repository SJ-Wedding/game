import { expect, test } from '@playwright/test';
import { collectErrors, snap } from './util';

const starters = [['chain', '연쇄 번개'], ['turret', '서리 포탑']] as const;

test('창 크기를 줄여도 균열 사수는 픽셀 렌더링과 방향별 스프라이트를 사용한다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.setViewportSize({ width: 1013, height: 690 });
  await page.goto('/?dev=1&god=1&seed=550');
  await page.getByTestId('play').click();
  await page.getByTestId('character-ranger').click();
  const sprite = () => page.evaluate(() => {
    const { app, sim } = (window as any).__rift;
    const image = app.scene.playerImage;
    return [image.texture.key, Number(image.frame.name), image.frame.width, image.flipX, image.displayWidth, image.displayHeight, sim.player.r];
  });
  await expect.poll(sprite).toEqual(['player', 1, 40, false, 50, 50, 14]);
  await expect(page.locator('canvas')).toHaveCSS('image-rendering', 'pixelated');
  for (const [key, frame, flipped] of [['KeyW', 2, false], ['KeyA', 0, true], ['KeyD', 0, false], ['KeyS', 1, false]] as const) {
    await page.keyboard.down(key);
    await expect.poll(async () => {
      const [texture, current, ...body] = await sprite();
      return [texture, current >= 3 && current < 9, current % 3, ...body];
    }).toEqual(['player', true, frame, 40, flipped, 50, 50, 14]);
    await expect.poll(async () => (await sprite())[1]).toBe(frame + 6);
    await page.keyboard.up(key);
  }
  expect(errors).toEqual([]);
});

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
    await expect(page.getByTestId('hud-hp')).toContainText('체력 85 / 85');
    await page.evaluate(() => {
      const { sim } = (window as any).__rift;
      const e = sim.spawnEnemy('chaser', sim.player.x + 150, sim.player.y);
      e.speed = 0;
      e.hp = e.maxHp = 1e4;
    });
    await expect.poll(async () => page.evaluate((key) => {
      const { sim, app } = (window as any).__rift;
      const image = app.scene.playerImage;
      return [sim.stacks[key], image.texture.key, image.displayWidth, image.displayHeight, sim.player.r];
    }, weapon)).toEqual([1, `lumen-${weapon}`, 50, 50, 14]);
    await expect.poll(async () => page.evaluate((key) => (window as any).__rift.sim.damageByAttack[key] ?? 0, weapon)).toBeGreaterThan(0);
    expect((await snap(page)).shotsFired).toBe(0);
    await page.keyboard.press('Tab');
    const status = page.getByRole('dialog', { name: '상태창' });
    await expect(status.getByText('마도공 루멘 · Lv 1')).toBeVisible();
    await expect(page.getByTestId('stat-damage')).toHaveText(weapon === 'chain' ? '51' : '18.5');
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
  await expect(status.getByText('철검 수호자 로안 · Lv 1')).toBeVisible();
  await expect(status.getByRole('rowheader', { name: '베기 거리' })).toBeVisible();
  await expect(status.locator('.mastery-stack').filter({ hasText: name })).toContainText('1스택');
  await expect(status.locator('.mastery-total')).not.toBeEmpty();
  expect(errors).toEqual([]);
});

test('로안: 장검 손잡이와 넓은 베기는 서로 다른 전용 아이콘을 쓴다', async ({ page }) => {
  await page.goto('/?dev=1&god=1&seed=1');
  await page.getByTestId('play').click();
  await page.getByTestId('character-roan').click();
  await page.getByTestId('hud-hp').waitFor();
  await page.evaluate(() => {
    const { sim } = (window as any).__rift;
    sim.gainXp((sim.xpNeeded - sim.xp + 0.00001) / (sim.stats.xpGain * sim.relics.xpMultiplier));
  });

  const choices = page.locator('.card');
  const range = choices.filter({ hasText: '장검 손잡이' }).locator('.choice-art > .choice-sprite');
  const arc = choices.filter({ hasText: '넓은 베기' }).locator('.choice-art > .choice-sprite');
  await expect(range).toBeVisible();
  await expect(arc).toBeVisible();
  await expect(range).toHaveCSS('background-image', /choice-icons/);
  await expect(arc).toHaveCSS('background-image', /choice-icons/);
  const rangePosition = await range.evaluate((icon) => getComputedStyle(icon).backgroundPosition);
  await expect(arc).not.toHaveCSS('background-position', rangePosition);
});

test('로안: 12레벨 무기, 24레벨 상위 무기를 고르면 디자인과 공격이 바뀐다', async ({ page }) => {
  const errors = collectErrors(page);
  await page.goto('/?dev=1&god=1&seed=553');
  await page.getByTestId('play').click();
  await page.getByTestId('character-roan').click();
  await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  const levelTo = (level: number) => page.evaluate((target) => {
    const { sim } = (window as any).__rift;
    const noInput = { moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, dodge: false };
    while (sim.level < target) {
      sim.gainXp((sim.xpNeeded - sim.xp + 0.00001) / (sim.stats.xpGain * sim.relics.xpMultiplier));
      sim.step(noInput);
      while (sim.level < target && sim.phase === 'levelup') sim.choose(0);
    }
  }, level);
  await levelTo(12);
  await expect(page.getByRole('heading', { name: '로안 무기 선택 · Lv 12' })).toBeVisible();
  await expect(page.locator('[data-gear-stage="weapon"]')).toHaveCount(4);
  await expect(page.locator('.gear-sprite')).toHaveCount(4);
  await expect(page.getByTestId('reroll')).toHaveCount(0);
  await page.keyboard.press('Digit2');
  await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  await expect(page.getByTestId('hud-sword-forms')).toHaveText('무기 · 단검');

  await levelTo(24);
  await expect(page.getByRole('heading', { name: '상위 무기 선택 · Lv 24' })).toBeVisible();
  await expect(page.locator('[data-gear-stage="upgrade"]')).toHaveCount(3);
  const twinblades = page.locator('[data-sword-form="twinblades"]');
  await expect(twinblades).toContainText('직선 찌르기 2연타');
  await twinblades.click();
  await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  await expect(page.getByTestId('hud-sword-forms')).toHaveText('무기 · 쌍검');
  expect(await page.evaluate(() => (window as any).__rift.sim.roan.design)).toBe('twinblades');

  await page.evaluate(() => {
    const { sim } = (window as any).__rift;
    const target = sim.spawnEnemy('chaser', sim.player.x + 70, sim.player.y);
    target.hp = target.maxHp = 50000;
    target.speed = 0;
  });
  await expect.poll(() => page.evaluate(() => (window as any).__rift.sim.hitsByAttack.bleed ?? 0)).toBeGreaterThan(0);
  await page.keyboard.press('Tab');
  const forms = page.getByTestId('sword-forms');
  await expect(forms.getByRole('heading', { name: '로안 무기' })).toBeVisible();
  await expect(forms).toContainText('상위 무기 · 쌍검');
  await expect(forms).toContainText('직선 찌르기 · 폭');
  await expect(page.getByRole('rowheader', { name: '찌르기 거리' })).toBeVisible();
  expect(errors).toEqual([]);
});
