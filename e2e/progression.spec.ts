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
    await expect(page.getByRole('heading', { name: '레벨 3 유물' })).toBeVisible();
    await page.getByTestId('choice-0').click();
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  });

  test('Tab 상태창: 시간이 멈추고 능력치(시작·영구·현재)가 표시된다', async ({ page }) => {
    await startRun(page, '&seed=32&god=1');
    await waitElapsed(page, 2);
    await page.keyboard.press('Tab');
    await expect(page.locator('#overlay[data-screen="status"]')).toBeVisible();
    await expect(page.getByTestId('stat-fireRate')).toHaveText('1.20회/초');
    await expect(page.getByTestId('stat-damage')).toHaveText('26');
    await expect(page.getByTestId('stat-maxHp')).toHaveText('100');
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

  test('Tab 상태창의 특수·융합 무기 효과 이미지를 hover 및 키보드로 볼 수 있다', async ({ page }) => {
    await startRun(page, '&seed=42&god=1');
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      Object.assign(sim.stacks, { mine: 1, chain: 3, mark: 3 });
      sim.picks.push({ id: 'mine', grade: 'rare' });
      if (!sim.weapons.fuse('storm')) throw new Error('뇌광 연쇄를 준비하지 못했습니다.');
    });
    await page.keyboard.press('Tab');
    const overlay = page.locator('#overlay[data-screen="status"]');
    await expect(overlay).toBeVisible();
    const tooltip = page.locator('#status-weapon-preview');
    const image = tooltip.locator('img');
    const checkImage = async (name: string) => {
      await expect(tooltip).toBeVisible();
      await expect(image).toHaveAttribute('alt', `${name} 인게임 효과`);
      await expect.poll(() => image.evaluate((node: HTMLImageElement) => node.naturalWidth)).toBeGreaterThan(0);
    };
    const mine = overlay.getByRole('button', { name: '균열 지뢰 Lv 1' });
    await mine.hover();
    await checkImage('균열 지뢰');
    await overlay.getByRole('heading', { name: '이번 판 강화 스택 (점 색 = 등급)' }).hover();
    await expect(tooltip).toBeHidden();
    const storm = overlay.getByRole('button', { name: '뇌광 연쇄 Lv 3' });
    await storm.focus();
    await checkImage('뇌광 연쇄');
    await page.keyboard.press('Tab');
    await expect(mine).toBeFocused();
    await checkImage('균열 지뢰');
    await overlay.locator('.fusion-recipes summary').click();
    await overlay.getByRole('button', { name: '관통 창 Lv 0' }).hover();
    await checkImage('관통 창');
    await page.keyboard.press('Escape');
    await expect(overlay).toBeHidden();
    await expect(tooltip).toBeHidden();
  });

  test('상태창에서 획득한 강화 스택을 확인하고 보유 유물 탭을 따로 열 수 있다', async ({ page }) => {
    await startRun(page, '&seed=43&god=1');
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      for (const id of ['awl', 'anvil', 'catalyst', 'scatterSeal', 'bountyKnot', 'hawkLens', 'swarm', 'bloodPrice', 'duel', 'cog']) sim.relics.acquire(id);
      sim.picks.push({ id: 'power', grade: 'common' }, { id: 'power', grade: 'rare' }, { id: 'power', grade: 'rare' });
      for (let i = 0; i < 3; i++) sim.picks.push({ id: 'orbit', grade: 'rare' });
      Object.assign(sim.stacks, { orbit: 3, axe: 3 });
      if (!sim.weapons.fuse('tempest')) throw new Error('쌍날 폭풍을 준비하지 못했습니다.');
    });
    const more = page.getByTestId('hud-more-relics');
    await expect(page.getByTestId('hud-relics').locator('[data-relic]')).toHaveCount(6);
    await expect(more).toHaveText('+4 · 전체 보기');
    await page.keyboard.press('Tab');
    const stats = page.getByRole('tabpanel', { name: '능력치·강화' });
    const power = stats.locator('[data-upgrade-id="power"]');
    await expect(power).toContainText('3스택');
    await expect(power.getByTitle('희귀 2회')).toHaveText('2');
    await stats.locator('.fusion-recipes summary').click();
    await expect(stats.locator('.fusion-recipes li').filter({ hasText: '쌍날 폭풍' })).toContainText('3스택');
    await page.getByRole('tab', { name: '보유 유물 10개' }).click();
    await expect(stats).toBeHidden();
    const relics = page.getByTestId('status-relics');
    await expect(relics.locator('[data-relic]')).toHaveCount(10);
    await relics.locator('[data-relic="cog"]').hover();
    await expect(page.locator('#status-relic-detail')).toContainText('쌍날 폭풍 칼날 +1개');
    await page.getByRole('tab', { name: '능력치·강화' }).click();
    await expect(power).toBeVisible();
    await page.keyboard.press('Escape');
    await more.click();
    await expect(relics).toBeVisible();
  });

  test('메아리 처치 성장의 누적 스택과 분신별 탄 수를 상태창에 표시한다', async ({ page }) => {
    await startRun(page, '&seed=43&god=1');
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      sim.stats.luck = 10;
      for (let i = 0; i < 2200; i++) {
        const enemy = sim.spawnEnemy('chaser', 120, 120);
        sim.damageEnemy(enemy, 1e6, 'basic');
        sim.enemies.pop();
      }
      sim.drainEvents();
      sim.stacks.echo = 1;
      sim.picks.push({ id: 'echo', grade: 'common' });
    });
    await page.keyboard.press('Tab');
    const growth = page.getByTestId('echo-growth');
    await expect(growth.locator('summary')).toHaveText('메아리 처치 성장 · 35/50단계 · 4,400 / 8,000스택');
    await expect(growth).toContainText('탄 4발/분신 · 분신 7명 · 피해 +56% · 발동 간격 −28%');
    await expect(growth).toContainText('다음 단계 4,605스택 · 현재 처치당 +2.00스택');
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
    await page.getByTestId('character-ranger').click();
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
    await page.getByTestId('character-ranger').click();
    await waitElapsed(page, 0.5);
    const s = await snap(page);
    expect(s.stats!.damage).toBeCloseTo(26 * 1.04, 5);
  });
  test('승리 후 키보드로 재시작해도 유물 팝업을 거쳐야 하고, 선택 전 새로고침해도 후보가 유지된다', async ({ page }) => {
    await startRun(page, '&seed=39');
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      for (const id of ['oath', 'buckle', 'crown', 'anchor']) sim.relics.acquire(id);
      sim.spawnBoss();
      sim.boss.state = 'idle';
      sim.damageBoss(sim.boss.maxHp);
    });
    await expect(page.getByTestId('outcome')).toHaveText('승리');
    await page.waitForTimeout(700);
    await page.keyboard.press('Enter');
    await page.getByTestId('character-ranger').click();
    const modal = page.getByRole('dialog', { name: '다음 판에 가져갈 유물' });
    await expect(modal).toBeVisible();
    expect((await snap(page)).runsStarted).toBe(1);
    await page.keyboard.press('Escape');
    await expect(page.getByTestId('outcome')).toHaveText('승리');
    await page.reload();
    await page.getByTestId('play').click();
    await page.getByTestId('character-ranger').click();
    await expect(modal).toBeVisible();
    const options = modal.locator('.relic-pick');
    await expect(options).toHaveCount(4);
    for (let i = 0; i < 3; i++) await options.nth(i).click();
    await expect(options.nth(3)).toBeDisabled();
    await expect(page.getByTestId('carry-confirm')).toHaveText('유물 3개로 시작');
    await page.getByTestId('carry-confirm').click();
    await expect(page.getByTestId('hud-relics').locator('[data-relic]')).toHaveCount(3);
    await expect(modal).toBeHidden();
  });

  test('엘리트 처치 시 유물 선택 뒤 준비된 합체를 전용 보상에서 고를 수 있다', async ({ page }) => {
    await startRun(page, '&seed=41&god=1');
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      Object.assign(sim.stacks, { chain: 3, mark: 3 });
      const elite = sim.spawnEnemy('elite', sim.player.x + 150, sim.player.y);
      sim.damageEnemy(elite, 1e6);
    });
    await expect(page.getByRole('heading', { name: '중간 보스 유물' })).toBeVisible();
    await page.getByTestId('choice-0').click();
    await expect(page.getByRole('heading', { name: '수호자의 무기 보상' })).toBeVisible();
    await expect(page.getByTestId('reroll')).toHaveCount(0);
    const fusion = page.locator('.fusion-card').filter({ hasText: '뇌광 연쇄' });
    await expect(fusion).toContainText('재료 공격을 대체');
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      const enemy = sim.spawnEnemy('chaser', sim.player.x + 135, sim.player.y);
      enemy.hp = enemy.maxHp = 1000;
      enemy.speed = 0;
      sim.player.fireCd = 999;
    });
    await fusion.click();
    await expect(page.locator('.chips .fusion-chip')).toHaveText('뇌광 연쇄 Lv 3');
    await expect(page.locator('#overlay')).toBeHidden();
    await expect.poll(() => page.evaluate(() => (window as any).__rift.sim.damageByAttack.storm ?? 0)).toBeGreaterThan(0);
    const materialAttacks = await page.evaluate(() => {
      const { damageByAttack } = (window as any).__rift.sim;
      return [damageByAttack.chain ?? 0, damageByAttack.mark ?? 0];
    });
    expect(materialAttacks).toEqual([0, 0]);
  });

  test('삼중 선택의 인장은 세 번 선택할 수 있고 결과는 초과 피해를 포함한 공격별 피해량과 DPS를 표시한다', async ({ page }) => {
    await startRun(page, '&seed=43&god=1');
    await page.evaluate(() => (window as any).__rift.sim.relics.acquire('tripleChoice'));
    for (const remaining of [3, 2, 1]) {
      await expect(page.getByRole('heading', { name: '삼중 선택의 인장' })).toBeVisible();
      await expect(page.locator('.levelup .muted')).toContainText(`남은 선택 ${remaining}회`);
      await page.getByTestId('choice-0').click();
    }
    await expect(page.locator('#overlay')).toBeHidden();
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      const enemy = sim.spawnEnemy('chaser', 900, 900);
      enemy.hp = 20;
      sim.damageEnemy(enemy, 8, 'basic');
      sim.damageEnemy(enemy, 1000, 'echo');
      sim.spawnBoss();
      sim.boss.state = 'idle';
      sim.boss.hp = 45;
      sim.damageBoss(100, 'volley');
    });
    await expect(page.getByTestId('outcome')).toHaveText('승리');
    const summary = page.getByTestId('damage-breakdown');
    await expect(summary).toContainText('평균 DPS');
    await expect(summary).toContainText('초과 피해를 포함한 총 피해량');
    const combatTime: number = await page.evaluate(() => (window as any).__rift.sim.result.combatTime);
    for (const [id, damage, name] of [['basic', 8, '기본 사격'], ['echo', 1000, '메아리 사격'], ['volley', 100, '잔영 관통포']] as const) {
      const row = summary.locator(`[data-attack="${id}"]`);
      await expect(row).toContainText(name);
      await expect(row.locator('td').first()).toHaveText(String(damage));
      await expect(row.locator('td').nth(1)).toHaveText('1');
      await expect(row.locator('td').last()).toHaveText(String(Number((damage / combatTime).toFixed(1))));
    }
  });

  test('로안: 출혈 피해가 있는 판도 결과 화면이 열리고 출혈 피해량을 보여 준다', async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?dev=1&seed=45&god=1');
    await page.getByTestId('play').click();
    await page.getByTestId('character-roan').click();
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      sim.roan.equip({ stage: 'weapon', id: 'dagger' });
      const enemy = sim.spawnEnemy('chaser', 900, 900);
      sim.damageEnemy(enemy, 7, 'bleed');
      sim.spawnBoss();
      sim.boss.state = 'idle';
      sim.boss.hp = 30;
      sim.damageBoss(100, 'bleed');
    });
    await expect(page.getByTestId('outcome')).toHaveText('승리');
    const row = page.getByTestId('damage-breakdown').locator('[data-attack="bleed"]');
    await expect(row).toContainText('출혈');
    await expect(row.locator('td').nth(1)).toHaveText('2');
    expect(errors).toEqual([]);
  });

  test('도박꾼의 동전: 균열 수호자 처치 뒤 동전 화면이 열리고, 던지면 결과가 다음 보상 화면에 표시된다', async ({ page }) => {
    await startRun(page, '&seed=44&god=1');
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      sim.relics.acquire('gamblerCoin');
      const elite = sim.spawnEnemy('elite', sim.player.x + 150, sim.player.y);
      sim.damageEnemy(elite, 1e6);
    });
    await expect(page.getByRole('heading', { name: '도박꾼의 동전' })).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(2);
    await expect(page.getByTestId('reroll')).toHaveCount(0);
    await page.getByTestId('choice-0').click();
    await expect(page.getByTestId('coin-notice')).toHaveText(/동전 (앞면|뒷면)/);
    await page.getByTestId('choice-0').click();
    await expect(page.getByTestId('coin-notice')).toHaveCount(0);
  });

  test('판이 끝나면 얻은 유물이 저장되고, 다음 판 시작 유물 선택지에서 빠진다', async ({ page }) => {
    await startRun(page, '&seed=45');
    await waitElapsed(page, 0.5);
    await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      for (const id of ['awl', 'anvil', 'catalyst', 'scatterSeal']) sim.relics.acquire(id);
      sim.hurtPlayer(9999, '시험용 일격');
    });
    await expect.poll(async () => (await snap(page)).screen, { timeout: 10_000 }).toBe('result');
    const saved = await page.evaluate(() => JSON.parse(localStorage.getItem('rift-arena/save')!).previousRelics);
    expect(saved).toEqual(['awl', 'anvil', 'catalyst', 'scatterSeal']);
    await page.reload();
    await page.getByTestId('play').click();
    await page.getByTestId('character-ranger').click();
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
    const ids: string[] = await page.evaluate(() => {
      const sim = (window as any).__rift.sim;
      while (sim.level < 3) sim.gainXp(sim.xpNeeded);
      sim.step({ moveX: 0, moveY: 0, aimX: 0, aimY: 0, fire: false, dodge: false });
      while (sim.phase === 'levelup' && !(sim.choices[0].kind === 'relic' && sim.choices[0].source === 'opening')) sim.choose(0);
      return sim.choices.map((c: any) => c.id);
    });
    expect(ids.sort()).toEqual(['bountyKnot', 'hawkLens']);
  });

});
