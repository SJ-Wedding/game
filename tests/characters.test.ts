import { describe, expect, it } from 'vitest';
import { type Loadout } from '../src/config/characters';
import { UPGRADE_BY_ID, type UpgradeId } from '../src/config/upgrades';
import { rollRelics } from '../src/core/relics';
import { Rng } from '../src/core/rng';
import { GameSim } from '../src/core/sim';
import { IDLE_INPUT, type Projectile } from '../src/core/types';

const roan: Loadout = { character: 'roan' };
const chain: Loadout = { character: 'lumen', weapon: 'chain' };
const turret: Loadout = { character: 'lumen', weapon: 'turret' };

function makeTarget(sim: GameSim, dx: number, dy = 0) {
  const enemy = sim.spawnEnemy('chaser', sim.player.x + dx, sim.player.y + dy);
  enemy.hp = enemy.maxHp = 1000;
  enemy.speed = 0;
  return enemy;
}

function makeShot(sim: GameSim, dx: number, dy: number): Projectile {
  return { x: sim.player.x + dx, y: sim.player.y + dy, vx: 0, vy: 0, r: 3, life: 1, damage: 5, source: '적 탄' };
}

describe('캐릭터와 중첩 강화', () => {
  it.each([chain, turret, roan])('전용 빌드 $character 의 시작과 모든 강화 보상은 서로의 공격을 섞지 않는다', (loadout) => {
    const sim = new GameSim({ seed: 11, god: true, loadout, presetUpgrades: { power: 2, mine: 3, echo: 3 } });
    expect(sim.stacks.power).toBe(0);
    expect(sim.stacks.mine).toBe(0);
    expect(sim.weapons.fuse('bastion')).toBe(false);
    if (loadout.character === 'lumen') expect(sim.stacks[loadout.weapon]).toBe(1);

    const assertChoices = () => {
      const path = loadout.character === 'lumen' ? loadout.weapon : 'roan';
      expect(sim.choices).toHaveLength(3);
      expect(sim.choices.some((c) => c.kind === 'upgrade' && (c.def.mastery || c.def.weapon))).toBe(true);
      for (const c of sim.choices) {
        if (c.kind !== 'upgrade') throw new Error('강화 후보가 필요합니다');
        if (c.def.weapon) expect(c.def.weapon).toBe(path);
        else if (c.def.mastery) expect(c.def.id.startsWith(path === 'roan' ? 'sword' : path)).toBe(true);
        else expect(c.def.category).not.toBe('attack');
      }
    };
    sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    assertChoices();
    expect(sim.reroll()).toBe(true);
    assertChoices();
    sim.choose(0);
    sim.relics.acquire('tripleChoice');
    sim.step(IDLE_INPUT);
    expect(sim.bonusOpen).toBe(true);
    for (let i = 0; i < 3; i++) {
      assertChoices();
      sim.choose(0);
    }
    const elite = sim.spawnEnemy('elite', sim.player.x + 260, sim.player.y);
    sim.damageEnemy(elite, 1e6);
    sim.step(IDLE_INPUT);
    expect(sim.choices.every((c) => c.kind === 'relic')).toBe(true);
    expect(sim.choose(0)).toBe(true);
    expect(sim.armoryOpen).toBe(true);
    assertChoices();
  });

  it('같은 전용 강화는 여러 차례 선택되고 등급별 효과가 함께 누적된다', () => {
    const sim = new GameSim({ seed: 12, god: true, loadout: roan });
    const baseRange = sim.swordRange;
    const id: UpgradeId = 'swordRange';
    sim.grantBonusChoices(4);
    sim.step(IDLE_INPUT);
    for (const grade of ['common', 'common', 'rare', 'legendary'] as const) {
      sim.choices = [{ kind: 'upgrade', def: UPGRADE_BY_ID[id], grade, nextStack: sim.stacks[id] + 1 }];
      expect(sim.choose(0)).toBe(true);
    }
    expect(sim.stacks[id]).toBe(4);
    expect(sim.swordRange).toBeCloseTo(baseRange * (1 + 0.12 * (1 + 1 + 1.5 + 3)));
    expect(sim.picks.map((pick) => pick.grade)).toEqual(['common', 'common', 'rare', 'legendary']);
  });

  it('루멘 번개는 기본탄 없이 연쇄 증설과 후반 분기 중첩을 적용한다', () => {
    const sim = new GameSim({ seed: 13, god: true, loadout: chain, presetLevel: 8, presetUpgrades: { chainLinks: 2, chainFork: 2 } });
    for (let i = 0; i < 6; i++) makeTarget(sim, 50 + i * 30);
    for (const [x, y] of [[110, -70], [110, 70], [170, -80], [170, 80]]) makeTarget(sim, x, y);
    sim.step({ ...IDLE_INPUT, fire: true });
    expect(sim.playerShots).toHaveLength(0);
    expect(sim.shotsFired).toBe(0);
    expect(sim.hitsByAttack.chain).toBe(10); // 정상 연쇄 6회, 분기 회로 2중첩으로 갈래 4개
    expect(sim.damageByAttack.basic).toBeUndefined();
  });

  it('루멘 포탑은 거치대가 늘어나고 관통과 빙결이 함께 발동한다', () => {
    const deploy = new GameSim({ seed: 14, god: true, loadout: turret, presetUpgrades: { turretMount: 2 } });
    deploy.step(IDLE_INPUT);
    expect(deploy.weapons.devices.filter((device) => device.kind === 'turret')).toHaveLength(3);
    const sim = new GameSim({ seed: 14, god: true, loadout: turret, presetUpgrades: { turretPierce: 2, turretFrost: 2 } });
    const near = makeTarget(sim, 100);
    const far = makeTarget(sim, 155);
    const splash = makeTarget(sim, 142, 45);
    sim.step(IDLE_INPUT);
    expect(sim.hitsByAttack.turret).toBe(3);
    expect(near.hp).toBeLessThan(1000);
    expect(far.hp).toBeLessThan(1000);
    expect(splash.hp).toBeLessThan(1000);
    expect(splash.slowUntil).toBeGreaterThan(sim.elapsed + 1.5);
    expect(sim.playerShots).toHaveLength(0);
  });

  it('로안은 검 궤적의 탄만 최대 세 개 지우고 세 번째 베기는 뒤쪽도 때린다', () => {
    const sim = new GameSim({ seed: 15, god: true, loadout: roan, carryRelics: ['swordScabbard', 'swordCircle', 'swordRhythm'] });
    for (const x of [65, 80, 90, 100]) makeTarget(sim, x);
    const behind = makeTarget(sim, -90);
    const frontShots = [30, 40, 50, 55].map((x) => makeShot(sim, x, 0));
    const rearShot = makeShot(sim, -50, 0);
    sim.enemyShots.push(...frontShots, rearShot);

    sim.step(IDLE_INPUT);
    expect(sim.hitsByAttack.sword).toBe(4);
    expect(behind.hp).toBe(1000);
    expect(sim.enemyShots).toEqual([frontShots[3], rearShot]);
    expect(sim.player.fireCd).toBeCloseTo(sim.swordInterval * 0.65, 1);
    for (let i = 0; i < 2; i++) {
      sim.player.fireCd = 0;
      sim.step(IDLE_INPUT);
    }
    expect(sim.swordSweep?.width).toBe(Math.PI * 2);
    expect(behind.hp).toBeLessThan(1000);
    expect(sim.enemyShots).not.toContain(rearShot);
    expect(sim.playerShots).toHaveLength(0);
  });

  it('캐릭터와 무기에 맞는 유물만 등장하고 이전 판에서 계승된다', () => {
    const sim = new GameSim({ seed: 16, loadout: chain, carryRelics: ['swordScabbard', 'winterLantern', 'crown'] });
    expect([...sim.relics.owned]).toEqual(['crown']);
    const rng = new Rng(16);
    const rewards = Array.from({ length: 20 }, () => rollRelics('elite', rng, new Set(), roan)).flat();
    expect(rewards.some((c) => c.kind === 'relic' && c.id === 'swordCircle')).toBe(true);
    expect(rewards.some((c) => c.kind === 'relic' && (c.id === 'crown' || c.id === 'winterLantern'))).toBe(false);
  });
});
