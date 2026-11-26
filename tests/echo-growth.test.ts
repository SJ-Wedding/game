import { describe, expect, it } from 'vitest';
import { ECHO_STAGE_THRESHOLDS, echoGrowth, WEAPON_FUSIONS } from '../src/config/weapons';
import type { GameSim } from '../src/core/sim';
import { makeSim } from './helpers';

function recordKills(sim: GameSim, count: number): void {
  for (let i = 0; i < count; i++) {
    const enemy = sim.spawnEnemy('chaser', 300, 300);
    sim.damageEnemy(enemy, 1e6, 'basic');
    sim.enemies.pop();
  }
}

describe('메아리 사격 처치 성장', () => {
  it('행운 보너스는 처치 시점에만 적용되며 메아리 획득 전 처치도 포함한다', () => {
    const sim = makeSim();
    recordKills(sim, 500);
    expect(sim.echoKillStacks).toBe(500);
    sim.stats.luck = 10;
    recordKills(sim, 500);
    expect(sim.kills).toBe(1000);
    expect(sim.echoKillStacks).toBe(1500);
    expect(sim.weapons.echoStats.damageBonus).toBeCloseTo(0.272);
    expect(sim.weapons.echoStats.intervalReduction).toBeCloseTo(0.136);
  });

  it('50스택에서 처음 성장하고, 8,000스택까지 서로 다른 50단계에서 탄과 분신을 따로 늘린다', () => {
    expect(echoGrowth(49)).toMatchObject({ stage: 0, nextAt: 50, damageBonus: 0 });
    expect(echoGrowth(50)).toMatchObject({ stage: 1, nextAt: 100, damageBonus: 0.016 });
    expect(echoGrowth(100).clones).toBe(2);
    expect(echoGrowth(219).shots).toBe(1);
    expect(echoGrowth(220).shots).toBe(2);
    expect(echoGrowth(4400)).toMatchObject({ stage: 35, shots: 4, clones: 7 });
    expect(ECHO_STAGE_THRESHOLDS).toHaveLength(50);
    for (const [index, threshold] of ECHO_STAGE_THRESHOLDS.entries()) {
      expect(echoGrowth(threshold - 0.01).stage).toBe(index);
      expect(echoGrowth(threshold).stage).toBe(index + 1);
    }
    const sim = makeSim();
    recordKills(sim, 8010);
    expect(sim.kills).toBe(8010);
    expect(sim.weapons.echoStats).toEqual({ progress: 8000, stage: 50, nextAt: undefined, shots: 5, clones: 10, damageBonus: 0.8, intervalReduction: 0.4 });
  });

  it('완성된 메아리는 실제로 분신 열 명이 다섯 발씩 쏘고 피해와 발동 속도가 오른다', () => {
    const sim = makeSim({ presetUpgrades: { echo: 3 } });
    recordKills(sim, 8000);
    sim.player.aim = 0;
    const times: number[] = [];
    for (let i = 0; i < 70; i++) {
      sim.tick++;
      if (i % 20 === 0) sim.weapons.onShot();
      sim.weapons.update(1 / 60);
      if (!sim.playerShots.length) continue;
      expect(sim.playerShots).toHaveLength(50);
      expect(new Set(sim.playerShots.map((shot) => `${shot.x},${shot.y}`)).size).toBe(10);
      const damage = sim.weapons.baseDamage * 1.15 * 1.6 * 1.4 * 1.8;
      expect(sim.playerShots[0].damage).toBeCloseTo(damage);
      expect(sim.playerShots[5].damage).toBeCloseTo(damage * 0.65);
      expect(sim.playerShots[45].damage).toBeCloseTo(damage * 0.30);
      times.push(sim.tick);
      sim.playerShots.length = 0;
    }
    expect(times.length).toBeGreaterThanOrEqual(2);
    expect((times[1] - times[0]) / 60).toBeCloseTo(0.45, 1);
  });

  it('같은 메아리 발동의 여러 탄이 적을 처치해도 틈새의 거울은 한 번만 되쏜다', () => {
    const sim = makeSim({ carryRelics: ['mirror'], presetUpgrades: { echo: 1 } });
    recordKills(sim, 220);
    sim.weapons.onShot();
    sim.weapons.update(1 / 60);
    sim.tick += 22;
    sim.weapons.update(1 / 60);
    const volley = sim.playerShots[0].echoVolley;
    expect(volley).toBeDefined();
    expect(sim.playerShots).toHaveLength(8);
    expect(sim.playerShots.every((shot) => shot.echoVolley === volley)).toBe(true);
    sim.weapons.onEchoKill(sim.player, 0, volley);
    sim.weapons.onEchoKill(sim.player, 0, volley);
    expect(sim.playerShots.filter((shot) => shot.echoRepeat)).toHaveLength(8);
  });

  it('잔영 관통포는 처치 성장의 피해와 발동 간격 보너스 절반을 계승한다', () => {
    const sim = makeSim({ presetUpgrades: { echo: 3, spear: 3 } });
    recordKills(sim, 8000);
    expect(sim.weapons.fuse('volley')).toBe(true);
    const target = sim.spawnEnemy('chaser', sim.player.x + 120, sim.player.y);
    target.hp = 1e6;
    sim.weapons.update(1 / 60);
    const damage = sim.weapons.baseDamage * WEAPON_FUSIONS.volley.damage * 1.25 * 1.4;
    expect(sim.damageByAttack.volley).toBeCloseTo(damage);
    sim.tick += 58; // 기본 1.2초에서 처치 성장으로 0.96초가 됨
    sim.weapons.update(1 / 60);
    expect(sim.damageByAttack.volley).toBeCloseTo(damage * 2);
    expect(sim.playerShots).toHaveLength(0);
  });
});
