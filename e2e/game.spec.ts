import { expect, test } from '@playwright/test';
import { collectErrors, setTabHidden, snap, startRun, waitElapsed } from './util';

test.describe('균열 아레나 — 핵심 흐름', () => {
  let errors: string[] = [];
  test.beforeEach(({ page }) => {
    errors = collectErrors(page);
  });
  test.afterEach(() => {
    expect(errors, errors.join('\n')).toEqual([]);
  });

  test('새로 시작: 캐릭터를 고르면 이동·공격할 수 있고 HUD 가 표시된다', async ({ page }) => {
    await page.goto('/?dev=1&seed=7');
    await expect(page.getByTestId('play')).toBeVisible();
    await page.getByTestId('play').click();
    await page.getByTestId('character-ranger').click();
    await expect(page.getByTestId('hud-timer')).toHaveText(/^(15:00|14:5\d)$/);
    await expect(page.getByTestId('hud-hp')).toContainText('체력 70 / 70');
    await expect(page.getByTestId('hud-dodge')).toContainText('회피 준비');
    await expect(page.getByTestId('hud-xp')).toContainText('Lv 1');

    const s0 = await snap(page);
    await page.keyboard.down('KeyD');
    await page.waitForTimeout(600);
    await page.keyboard.up('KeyD');
    const s1 = await snap(page);
    expect(s1.player!.x).toBeGreaterThan(s0.player!.x + 50);

    // 클릭 없이도 적이 사거리에 들어오면 자동으로 공격한다
    await expect.poll(async () => (await snap(page)).shotsFired ?? 0, { timeout: 30_000 }).toBeGreaterThan(1);

    await page.keyboard.press('Space');
    await expect.poll(async () => (await snap(page)).player!.dodgeCd).toBeGreaterThan(0);
    await expect(page.getByTestId('hud-dodge')).toContainText('회피');
    await expect(page.getByTestId('hud-timer')).not.toHaveText('15:00');
  });

  test('강화 선택: 레벨업 중에는 시간이 멈추고, 선택한 강화가 적용된다', async ({ page }) => {
    await startRun(page, '&seed=11&god=1');
    await waitElapsed(page, 1);
    await page.evaluate(() => { const r = (window as any).__rift; r.debug.addXp((r.sim.xpNeeded - r.sim.xp) / r.sim.stats.xpGain); }); // 정확히 1레벨
    await expect(page.locator('#overlay[data-screen="levelup"]')).toBeVisible();
    await expect(page.locator('.card')).toHaveCount(3);
    const a = await snap(page);
    expect(a.screen).toBe('levelup');
    await page.waitForTimeout(1000);
    const b = await snap(page);
    expect(b.elapsed).toBe(a.elapsed);
    expect(b.spawned).toBe(a.spawned);

    const picked = a.choices![1];
    await page.keyboard.press('Digit2');
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
    const c = await snap(page);
    expect(c.stacks![picked]).toBe(1);
    await expect(page.locator('.chips .chip')).toHaveCount(1);
    await waitElapsed(page, a.elapsed! + 0.5);

    // 마우스 클릭으로도 고를 수 있다
    await page.evaluate(() => { const r = (window as any).__rift; r.debug.addXp((r.sim.xpNeeded - r.sim.xp) / r.sim.stats.xpGain); }); // 정확히 1레벨
    await expect(page.getByTestId('choice-0')).toBeVisible();
    const choice = (await snap(page)).choices![0];
    await page.getByTestId('choice-0').click();
    await expect(page.getByRole('heading', { name: '레벨 3 유물' })).toBeVisible();
    await expect(page.locator('.relic-card')).toHaveCount(3);
    await page.getByTestId('choice-0').click();
    await expect(page.getByTestId('hud-relics').locator('[data-relic]')).toHaveCount(1);
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
    expect((await snap(page)).stacks![choice]).toBeGreaterThanOrEqual(1);
  });

  test('일시정지: Esc 로 멈추면 시간·스폰이 정지하고 Esc 로 재개된다', async ({ page }) => {
    await startRun(page, '&seed=3&god=1');
    await waitElapsed(page, 3);
    await page.keyboard.press('Escape');
    await expect(page.locator('#overlay[data-screen="pause"]')).toBeVisible();
    const a = await snap(page);
    expect(a.paused).toBe(true);
    await page.waitForTimeout(1500);
    const b = await snap(page);
    expect(b.elapsed).toBe(a.elapsed);
    expect(b.spawned).toBe(a.spawned);
    await expect(page.getByTestId('hud-timer')).toHaveText(await page.getByTestId('hud-timer').innerText());

    await page.keyboard.press('Escape');
    await expect(page.locator('#overlay')).toBeHidden();
    await waitElapsed(page, a.elapsed! + 1);
  });

  test('탭 전환: 탭이 숨겨지면 자동 일시정지되고, 돌아와도 직접 재개할 때까지 멈춰 있다', async ({ page }) => {
    await startRun(page, '&seed=4&god=1');
    await waitElapsed(page, 2);
    await setTabHidden(page, true);
    await expect(page.locator('#overlay[data-screen="pause"]')).toContainText('탭이 숨겨져');
    const a = await snap(page);
    await page.waitForTimeout(1500);
    await setTabHidden(page, false);
    await page.waitForTimeout(800);
    const b = await snap(page);
    expect(b.screen).toBe('paused');
    expect(b.elapsed).toBe(a.elapsed);
    expect(b.spawned).toBe(a.spawned);
    await page.getByTestId('resume').click();
    await waitElapsed(page, a.elapsed! + 1);
  });

  test('보스 처치: 보스 구간에서 보스를 쓰러뜨리면 즉시 승리 결과가 나온다', async ({ page }) => {
    await startRun(page, '&seed=5&start=boss&god=1');
    await expect(page.locator('.boss-bar')).toBeHidden();
    await expect.poll(async () => (await snap(page)).boss?.state ?? 'none', { timeout: 20_000 }).not.toMatch(/none|enter/);
    await expect(page.locator('.boss-bar')).toBeVisible();
    // 보스 체력을 2%로 낮춘 뒤 자동 공격으로 마무리한다 (입력 없음)
    await page.evaluate(() => (window as any).__rift.debug.setBossHp(0.02));
    await expect.poll(async () => (await snap(page)).screen, { timeout: 60_000 }).toBe('result');
    await expect(page.getByTestId('outcome')).toHaveText('승리');
    await expect(page.getByTestId('cause')).toContainText('처치했습니다');
    await expect(page.getByTestId('result-time')).toHaveText(/^1[34]:\d\d$/);
    await expect(page.getByTestId('result-upgrades')).toContainText('연사 숙련');
  });

  test('후반 증원: 예고 뒤 세 방향에서 강화 몬스터가 등장한다', async ({ page }) => {
    await startRun(page, '&seed=6&start=727&god=1');
    await expect(page.getByTestId('hud-banner')).toContainText('2초 후 증원 공세');
    await expect.poll(() => page.evaluate(() => (window as any).__rift.sim.assaultWarning?.gates.length ?? 0)).toBe(3);
    await waitElapsed(page, 730.1);
    await expect.poll(() => page.evaluate(() => (window as any).__rift.sim.spawnLog.filter((entry: { assault?: boolean }) => entry.assault).length)).toBe(24);
  });

  test('연장전: 15:00부터 강화 돌격수만 새로 등장하고 연장 시간이 표시된다', async ({ page }) => {
    await startRun(page, '&seed=6&start=899&god=1');
    await expect(page.getByTestId('hud-timer')).toHaveText(/^\+0:\d\d$/);
    await expect(page.locator('.timer-sub')).toContainText('연장전');
    await waitElapsed(page, 901.5);
    const spawns = await page.evaluate(() =>
      (window as any).__rift.sim.spawnLog.filter((record: { tick: number }) => record.tick >= 900 * 60).map((record: { kind: string }) => record.kind));
    expect(spawns.length).toBeGreaterThan(0);
    expect([...new Set(spawns)]).toEqual(['charger']);
    expect((await snap(page)).result).toBeNull();
  });

  test('재시작: 한 번의 입력으로 다시 시작되고, 반복해도 스폰과 입력이 중복되지 않는다', async ({ page }) => {
    // 보스전부터 시작해 여러 번 끝내고 Enter 로 재시작
    await startRun(page, '&seed=77&start=894&god=1');
    const finishRun = async () => {
      await page.evaluate(() => { (window as any).__rift.sim.player.hp = 0; });
      await expect.poll(async () => (await snap(page)).screen).toBe('result');
    };
    for (let i = 0; i < 4; i++) {
      await finishRun();
      const before = (await snap(page)).runsStarted;
      await page.waitForTimeout(700); // 결과 화면 입력 보호 시간
      await page.keyboard.press('Enter');
      await page.getByTestId('character-ranger').click();
      await expect.poll(async () => (await snap(page)).screen).toBe('playing');
      const after = await snap(page);
      expect(after.runsStarted).toBe(before + 1); // 한 번 눌러 한 판만 시작
      expect(after.listenerInstalls).toBe(1);
      expect(after.elapsed!).toBeLessThan(896); // 새 판 (894초부터 다시)
    }
    // 결과 화면의 버튼 클릭으로도 재시작
    await finishRun();
    await page.getByTestId('restart').click();
    await page.getByTestId('character-ranger').click();
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
  });

  test('재시작 반복 후에도 같은 시드의 스폰 순서와 발사 속도가 첫 판과 같다', async ({ page }) => {
    const measure = async () => {
      await waitElapsed(page, 4.2);
      const spawns = await page.evaluate(() =>
        (window as any).__rift.sim.spawnLog.filter((r: any) => r.tick <= 240).map((r: any) => `${r.tick}:${r.kind}:${r.angle.toFixed(6)}`),
      );
      // 쓰러지지 않는 표적을 옆에 두고 2초간 자동 공격 → 발사 횟수 / 전투 시간
      await page.evaluate(() => {
        const sim = (window as any).__rift.sim;
        const e = sim.spawnEnemy('chaser', sim.player.x + 200, sim.player.y);
        e.hp = e.maxHp = 1e9;
      });
      await page.waitForTimeout(300);
      const s0 = await snap(page);
      await page.waitForTimeout(2000);
      const s1 = await snap(page);
      const rate = (s1.shotsFired! - s0.shotsFired!) / (s1.elapsed! - s0.elapsed!);
      // Space 한 번 → 회피 한 번
      const d0 = await page.evaluate(() => (window as any).__rift.sim.dodges);
      await page.keyboard.press('Space');
      await page.waitForTimeout(200);
      const d1 = await page.evaluate(() => (window as any).__rift.sim.dodges);
      return { spawns, rate, dodges: d1 - d0 };
    };

    await startRun(page, '&seed=4242&god=1');
    const first = await measure();
    expect(first.spawns.length).toBeGreaterThanOrEqual(2);
    expect(first.dodges).toBe(1);

    for (let i = 0; i < 3; i++) {
      await page.keyboard.press('Escape');
      await page.getByTestId('pause-restart').click();
      await expect.poll(async () => (await snap(page)).elapsed!).toBeLessThan(1);
    }
    // 타이틀로 갔다가 다시 시작해도 마찬가지
    await page.keyboard.press('Escape');
    await page.getByTestId('pause-title').click();
    await page.getByTestId('play').click();
    await page.getByTestId('character-ranger').click();
    const again = await measure();
    expect(again.spawns).toEqual(first.spawns);
    expect(again.dodges).toBe(1);
    // 시작 공격 속도 1.2회/초 — 입력이 중복되면 2배가 된다
    expect(first.rate).toBeGreaterThan(0.9);
    expect(first.rate).toBeLessThan(1.6);
    expect(again.rate).toBeGreaterThan(0.9);
    expect(again.rate).toBeLessThan(1.6);
    expect((await snap(page)).listenerInstalls).toBe(1);
  });

  test('새로고침 후 기록·음량 유지', async ({ page }) => {
    await page.goto('/?dev=1&seed=21');
    await expect(page.getByTestId('runs')).toHaveText('0 / 0');
    // 음량 변경
    await page.getByTestId('volume').evaluate((el: HTMLInputElement) => {
      el.value = '20';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    // 개발 옵션 없이 10초 이상 실제로 싸운 뒤(자동 공격으로 처치 발생) 쓰러진다 → 기록에 반영됨
    await page.getByTestId('play').click();
    await page.getByTestId('character-ranger').click();
    await expect.poll(async () => (await snap(page)).kills ?? 0, { timeout: 60_000 }).toBeGreaterThan(0);
    await waitElapsed(page, 10);
    await page.evaluate(() => (window as any).__rift.sim.hurtPlayer(9999, '시험용 일격'));
    await expect.poll(async () => (await snap(page)).screen, { timeout: 10_000 }).toBe('result');
    const s = await snap(page);
    expect(s.result!.cause).toBe('death');
    await expect(page.getByTestId('cause')).toHaveText('시험용 일격에 쓰러졌습니다.');
    const time = await page.getByTestId('result-time').innerText();
    const kills = await page.getByTestId('result-kills').innerText();

    await page.reload();
    await expect(page.getByTestId('runs')).toHaveText('0 / 1');
    await expect(page.getByTestId('best-survival')).toHaveText(time);
    await expect(page.getByTestId('best-kills')).toHaveText(Number(kills) > 0 ? kills : '-');
    await expect(page.getByTestId('volume')).toHaveValue('20');
  });

  test('저장 데이터가 손상돼도 기본값으로 실행된다', async ({ page }) => {
    await page.addInitScript(() => localStorage.setItem('rift-arena/save', '{"version":1,"settings":'));
    await page.goto('/?dev=1');
    await expect(page.getByTestId('runs')).toHaveText('0 / 0');
    await expect(page.getByTestId('volume')).toHaveValue('60');
    await page.getByTestId('play').click();
    await page.getByTestId('character-ranger').click();
    await waitElapsed(page, 1);
  });

  test('배포 빌드(개발 모드 아님)에서는 디버그 도구와 개발 패널이 없다', async ({ page }) => {
    await page.goto('/?seed=5&start=boss&god=1');
    await expect(page.getByTestId('play')).toBeVisible();
    await expect(page.locator('fieldset.dev')).toHaveCount(0);
    expect(await page.evaluate(() => 'undefined' !== typeof (window as any).__rift)).toBe(false);
  });
});
