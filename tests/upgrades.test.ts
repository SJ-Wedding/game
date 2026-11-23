import { describe, expect, it } from 'vitest';
import { WEAPON_MAX_RANK } from '../src/config/weapons';
import { PLAYER_BASE_STATS } from '../src/config/player';
import { UPGRADES, UPGRADE_BY_ID } from '../src/config/upgrades';
import { Rng } from '../src/core/rng';
import { computeStats, effectValue, healOnPick } from '../src/core/stats';
import { emptyStacks } from '../src/core/stats';
import { IDLE_INPUT } from '../src/core/types';
import { applyUpgrade, rollChoices, rollRunChoices, upgradeText } from '../src/core/upgrades';
import { makeSim } from './helpers';

describe('강화 구성', () => {
  it('일반 강화는 공격 3종, 생존 3종, 기동 5종으로 구성된다', () => {
    expect(UPGRADES).toHaveLength(11);
    for (const cat of ['attack', 'survival', 'mobility']) expect(UPGRADES.filter((u) => u.category === cat)).toHaveLength(cat === 'mobility' ? 5 : 3);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(11);
  });
});

describe('강화 중첩 한도', () => {
  it('기존 최대치를 넘어도 일반 강화가 후보에 나오고 적용된다', () => {
    const stacks = emptyStacks();
    for (const upgrade of UPGRADES) stacks[upgrade.id] = 8;
    const rng = new Rng(5);
    const choices = rollChoices(rng, stacks);
    expect(choices).toHaveLength(3);
    for (const choice of choices) {
      if (choice.kind !== 'upgrade') throw new Error('일반 강화 후보가 필요합니다');
      expect(choice.nextStack).toBe(9);
      expect(applyUpgrade(stacks, choice.def.id)).toBe(true);
      expect(stacks[choice.def.id]).toBe(9);
    }
  });

  it('특수 무기는 최대 레벨까지만 강화할 수 있다', () => {
    const stacks = emptyStacks();
    for (let i = 0; i < WEAPON_MAX_RANK; i++) expect(applyUpgrade(stacks, 'chain')).toBe(true);
    expect(applyUpgrade(stacks, 'chain')).toBe(false);
    expect(stacks.chain).toBe(WEAPON_MAX_RANK);
  });

  it('일반 강화 4중첩 이상이 실제 능력치에 반영된다', () => {
    const sim = makeSim({ presetUpgrades: { split: 6, wisdom: 4 } });
    expect(sim.stats.projectileCount).toBe(7);
    expect(sim.stats.xpGain).toBeCloseTo(1.4);
  });
});

describe('강화 효과', () => {
  it('분열 사격: 투사체 수가 늘어난다', () => {
    const sim = makeSim({ presetUpgrades: { split: 3 } });
    sim.spawnEnemy('chaser', sim.player.x + 300, sim.player.y);
    sim.step(IDLE_INPUT);
    expect(sim.playerShots).toHaveLength(4);
  });

  it('연사 숙련: 같은 시간 동안 더 많이 쏜다', () => {
    const count = (n: number) => {
      const sim = makeSim({ presetUpgrades: { rapid: n }, god: true });
      const dummy = sim.spawnEnemy('chaser', sim.player.x + 300, sim.player.y);
      dummy.hp = dummy.maxHp = 1e9; // 쓰러지지 않는 표적
      for (let i = 0; i < 600; i++) sim.step(IDLE_INPUT);
      return sim.shotsFired;
    };
    const base = count(0);
    expect(base).toBeGreaterThanOrEqual(Math.floor(PLAYER_BASE_STATS.fireRate * 10));
    expect(count(5)).toBeGreaterThan(base * 1.7);
  });

  it('순간 회피: 회피 재사용 대기시간이 줄어든다', () => {
    const s0 = computeStats([]);
    const picks = [1, 2, 3].map(() => ({ id: 'evasion' as const, grade: 'common' as const }));
    expect(computeStats(picks).dodgeCooldown).toBeCloseTo(s0.dodgeCooldown * 0.82 ** 3, 6);
  });

  it('강인한 육체: 최대 체력이 늘고 즉시 회복한다', () => {
    // 후보에 강인한 육체가 나오는 시드를 찾는다 (후보는 시드로 결정되므로 항상 같은 시드가 선택됨)
    let found = false;
    for (let seed = 1; seed < 50 && !found; seed++) {
      const sim = makeSim({ seed });
      sim.hurtPlayer(40, 'x');
      sim.gainXp(100);
      sim.step(IDLE_INPUT);
      sim.choose(0); // 첫 레벨업은 특수 무기만 제시된다.
      const idx = sim.choices.findIndex((c) => c.kind === 'upgrade' && c.def.id === 'vitality');
      if (idx < 0) continue;
      found = true;
      const hp = sim.player.hp;
      const choice = sim.choices[idx];
      const grade = choice.kind === 'upgrade' ? choice.grade : 'common';
      sim.choose(idx);
      const bonus = effectValue({ stat: 'maxHp', op: 'add', value: 25, gradeValues: [25, 38, 50, 75] }, grade);
      expect(sim.stats.maxHp).toBe(PLAYER_BASE_STATS.maxHp + bonus);
      expect(sim.player.hp).toBeCloseTo(Math.min(sim.stats.maxHp, hp + healOnPick('vitality', grade)), 5);
    }
    expect(found).toBe(true);
  });

  it('최대 체력 강화를 고르면 체력 바 최대치에 반영된다 (presets)', () => {
    const sim = makeSim({ presetUpgrades: { vitality: 4 } });
    expect(sim.stats.maxHp).toBe(PLAYER_BASE_STATS.maxHp + 100);
    expect(sim.player.hp).toBe(sim.stats.maxHp);
  });
});

describe('특수 무기 및 경험치 성장', () => {
  it('레벨 2에서는 새 무기를, 레벨 3에서는 보유 무기를 제시하고 최대 레벨에 도달하면 제외한다', () => {
    const sim = makeSim({ seed: 7 });
    const levelUp = () => {
      sim.gainXp((sim.xpNeeded - sim.xp) / sim.stats.xpGain);
      sim.step(IDLE_INPUT);
    };
    levelUp();
    expect(sim.choices.every((c) => c.kind === 'upgrade' && c.def.weapon)).toBe(true);
    const first = sim.choices[2];
    if (first.kind !== 'upgrade' || !first.def.weapon) throw new Error('새 무기 후보가 없습니다');
    expect(first.nextStack).toBe(1);
    expect(sim.choose(2)).toBe(true);
    levelUp();
    expect(sim.choices[2]).toMatchObject({ kind: 'upgrade', def: { id: first.def.id }, nextStack: 2 });
    expect(sim.choose(2)).toBe(true);
    expect(applyUpgrade(sim.stacks, first.def.id)).toBe(true);
    expect(applyUpgrade(sim.stacks, first.def.id)).toBe(false);
    const choices = rollRunChoices(new Rng(7), new Rng(8), sim.stacks, 6);
    expect(choices).toHaveLength(3);
    expect(choices.every((c) => c.kind !== 'upgrade' || !c.def.weapon)).toBe(true);
  });

  it('특수 무기 피해는 단계마다 기본 무기 피해의 20%씩 늘고 기본탄은 그대로다', () => {
    const damageAt = (rank: number) => {
      const sim = makeSim({ presetUpgrades: { chain: rank } });
      const enemy = sim.spawnEnemy('chaser', sim.player.x + 120, sim.player.y);
      enemy.hp = enemy.maxHp = 1000;
      sim.step(IDLE_INPUT);
      return { chain: enemy.maxHp - enemy.hp, basic: sim.playerShots[0].damage };
    };
    const base = damageAt(1);
    expect(damageAt(2).chain).toBeCloseTo(base.chain * 1.2);
    expect(damageAt(3).chain).toBeCloseTo(base.chain * 1.4);
    expect(damageAt(3).basic).toBe(base.basic);
  });

  it('균열의 통찰의 등급별 수치가 카드와 실제 경험치에 적용된다', () => {
    expect(upgradeText(UPGRADE_BY_ID.wisdom, 'legendary')).toBe('경험치 획득량 +30%');
    expect(computeStats([{ id: 'wisdom', grade: 'rare' }, { id: 'wisdom', grade: 'epic' }]).xpGain).toBeCloseTo(1.35);
    const sim = makeSim({ presetUpgrades: { wisdom: 2 } });
    const amount = sim.xpNeeded / 2;
    sim.gainXp(amount);
    expect(sim.xp).toBeCloseTo(amount * 1.2);
  });
});
