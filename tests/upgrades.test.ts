import { describe, expect, it } from 'vitest';
import { PLAYER_BASE_STATS } from '../src/config/player';
import { ALL_UPGRADES, UPGRADES } from '../src/config/upgrades';
import { Rng } from '../src/core/rng';
import { computeStats, emptyStacks } from '../src/core/stats';
import { IDLE_INPUT } from '../src/core/types';
import { applyUpgrade, rollChoices } from '../src/core/upgrades';
import { makeSim } from './helpers';

describe('강화 구성', () => {
  it('강화는 9종이며 공격·생존·기동에 3개씩 분산된다', () => {
    expect(UPGRADES).toHaveLength(9);
    for (const cat of ['attack', 'survival', 'mobility']) expect(UPGRADES.filter((u) => u.category === cat)).toHaveLength(3);
    expect(new Set(UPGRADES.map((u) => u.id)).size).toBe(9);
  });
});

describe('강화 중첩 한도', () => {
  it('최대 중첩에 도달한 강화는 후보에서 제외된다', () => {
    const stacks = emptyStacks();
    stacks.split = UPGRADES.find((u) => u.id === 'split')!.maxStacks;
    stacks.rapid = UPGRADES.find((u) => u.id === 'rapid')!.maxStacks;
    const rng = new Rng(5);
    for (let i = 0; i < 500; i++) {
      const ids = rollChoices(rng, stacks).map((c) => (c.kind === 'upgrade' ? c.def.id : c.id));
      expect(ids).not.toContain('split');
      expect(ids).not.toContain('rapid');
      expect(new Set(ids).size).toBe(ids.length); // 중복 없음
      expect(ids.length).toBe(3);
    }
  });

  it('남은 강화가 3개 미만이면 그만큼만, 0개면 대체 선택지(응급 처치)를 준다', () => {
    const stacks = emptyStacks();
    for (const u of UPGRADES) stacks[u.id] = u.maxStacks;
    stacks.magnet = 0;
    const one = rollChoices(new Rng(1), stacks);
    expect(one.map((c) => (c.kind === 'upgrade' ? c.def.id : c.id))).toEqual(['magnet']);
    stacks.magnet = 3;
    const none = rollChoices(new Rng(1), stacks);
    expect(none).toHaveLength(1);
    expect(none[0].kind).toBe('fallback');
  });

  it('한도를 넘는 적용은 거부된다', () => {
    const stacks = emptyStacks();
    for (let i = 0; i < 3; i++) expect(applyUpgrade(stacks, 'split')).toBe(true);
    expect(applyUpgrade(stacks, 'split')).toBe(false);
    expect(stacks.split).toBe(3);
  });

  it('게임에서 레벨업을 계속해도 어떤 강화도 한도를 넘지 않고, 모두 채우면 응급 처치만 나온다', () => {
    const sim = makeSim({ seed: 11, god: true });
    const totalStacks = ALL_UPGRADES.reduce((s, u) => s + u.maxStacks, 0);
    for (let lv = 0; lv < totalStacks + 10; lv++) {
      sim.gainXp(100_000);
      sim.step(IDLE_INPUT);
      let guard = 0;
      while (sim.phase === 'levelup' && guard++ < 500) {
        // 매번 다른 위치의 후보를 골라 다양한 조합을 시험
        expect(sim.choose(lv % sim.choices.length)).toBe(true);
        for (const u of ALL_UPGRADES) expect(sim.stacks[u.id]).toBeLessThanOrEqual(u.maxStacks);
      }
    }
    for (const u of ALL_UPGRADES) expect(sim.stacks[u.id]).toBe(u.maxStacks);
    expect(sim.pickOrder.filter((id) => id !== 'recover')).toHaveLength(totalStacks);
    expect(sim.pickOrder).toContain('recover');
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
    const s0 = computeStats(emptyStacks());
    const st = emptyStacks();
    st.evasion = 3;
    expect(computeStats(st).dodgeCooldown).toBeCloseTo(s0.dodgeCooldown * 0.82 ** 3, 6);
  });

  it('강인한 육체: 최대 체력이 늘고 즉시 회복한다', () => {
    // 후보에 강인한 육체가 나오는 시드를 찾는다 (후보는 시드로 결정되므로 항상 같은 시드가 선택됨)
    let found = false;
    for (let seed = 1; seed < 50 && !found; seed++) {
      const sim = makeSim({ seed });
      sim.hurtPlayer(40, 'x');
      sim.gainXp(1);
      sim.gainXp(100);
      sim.step(IDLE_INPUT);
      const idx = sim.choices.findIndex((c) => c.kind === 'upgrade' && c.def.id === 'vitality');
      if (idx < 0) continue;
      found = true;
      const hp = sim.player.hp;
      sim.choose(idx);
      expect(sim.stats.maxHp).toBe(PLAYER_BASE_STATS.maxHp + 25);
      expect(sim.player.hp).toBeCloseTo(hp + 25, 5);
    }
    expect(found).toBe(true);
  });

  it('최대 체력 강화를 고르면 체력 바 최대치에 반영된다 (presets)', () => {
    const sim = makeSim({ presetUpgrades: { vitality: 4 } });
    expect(sim.stats.maxHp).toBe(PLAYER_BASE_STATS.maxHp + 100);
    expect(sim.player.hp).toBe(sim.stats.maxHp);
  });
});
