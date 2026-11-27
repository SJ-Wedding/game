import { expect, test } from '@playwright/test';
import { collectErrors, snap } from './util';

const NEW_RELICS = [
  'fuseChain', 'slaughterDrum', 'bountyLedger', 'plagueMask', 'frostShard', 'emberJar', 'sporePouch', 'chargeCell', 'shadowStep',
  'sprintEngine', 'rallyFlag', 'vengeance', 'painVault', 'cliffDance', 'phoenixAsh', 'treasureMap', 'gemStorm', 'luckyStrike',
  'riftCore', 'overcharge', 'echoBrand', 'vortexCharm', 'expansionSeal', 'stoppedWatch', 'soulHarvest',
  'armoryKey', 'fusionCatalyst', 'casingStorm', 'overheat', 'marksman',
  'manaOverload', 'dualGrimoire', 'thunderRod', 'blizzardCore', 'manaBurst',
  'warCry', 'bladeWave', 'counterMaster', 'ironCharge', 'bloodWind',
];

const LOADOUTS = [
  { name: '균열 사수', pick: ['character-ranger'] },
  { name: '루멘 연쇄', pick: ['character-lumen', 'lumen-chain'] },
  { name: '루멘 포탑', pick: ['character-lumen', 'lumen-turret'] },
  { name: '로안', pick: ['character-roan'] },
];

for (const loadout of LOADOUTS) {
  test(`${loadout.name}: 새 유물을 모두 가진 채로 오류 없이 전투하고 효과가 그려진다`, async ({ page }) => {
    const errors = collectErrors(page);
    await page.goto('/?dev=1&god=1&seed=91&start=300');
    await page.getByTestId('play').click();
    for (const id of loadout.pick) await page.getByTestId(id).click();
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
    const owned = await page.evaluate((ids) => {
      const { sim } = (window as any).__rift;
      sim.relics.owned.add('tripleChoice');
      sim.gainXp = () => {};
      for (const id of ids) sim.relics.acquire(id);
      for (let i = 0; i < 14; i++) {
        const a = (i / 14) * Math.PI * 2;
        const e = sim.spawnEnemy(i % 5 ? 'chaser' : 'charger', sim.player.x + Math.cos(a) * (90 + (i % 3) * 60), sim.player.y + Math.sin(a) * (90 + (i % 3) * 60));
        e.hp = e.maxHp = 60;
      }
      return sim.relics.owned.size;
    }, NEW_RELICS);
    expect(owned).toBeGreaterThan(25);
    await page.keyboard.press('Space');
    await expect.poll(() => page.evaluate(() => (window as any).__rift.sim.kills), { timeout: 20_000 }).toBeGreaterThan(5);
    await expect.poll(async () => (await snap(page)).screen).toBe('playing');
    await page.keyboard.press('Tab');
    await expect(page.getByTestId('status-close')).toBeVisible();
    await page.getByTestId('status-close').click();
    expect(errors).toEqual([]);
  });
}
