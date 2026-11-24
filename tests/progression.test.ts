import { describe, expect, it } from 'vitest';
import { BALANCE_REFERENCE_META, META_STATS, META_UNLOCKS } from '../src/config/meta';
import { PLAYER_BASE_STATS } from '../src/config/player';
import { PROGRESSION_CONFIG } from '../src/config/progression';
import { RUN_CONFIG } from '../src/config/run';
import { buyMeta, metaBonus, tokenReward } from '../src/core/meta';
import { xpToNext } from '../src/core/progression';
import { Rng } from '../src/core/rng';
import { computeStats, effectValue, statLayers } from '../src/core/stats';
import { IDLE_INPUT } from '../src/core/types';
import { gradeWeights, rollChoices, rollGrade, upgradeText } from '../src/core/upgrades';
import { UPGRADE_BY_ID } from '../src/config/upgrades';
import { emptyStacks } from '../src/core/stats';
import { makeSim, runTicks } from './helpers';

const rawXp = (level: number) => PROGRESSION_CONFIG.xpBase + PROGRESSION_CONFIG.xpGrowth * Math.pow(level - 1, PROGRESSION_CONFIG.xpExponent);

describe('시작 능력치 감소', () => {
  it('시작 능력치는 이전보다 낮다 (공격 속도 절반 포함)', () => {
    expect(PLAYER_BASE_STATS).toMatchObject({ maxHp: 70, damage: 9, fireRate: 1.2, moveSpeed: 190, dodgeCooldown: 3.0, pickupRadius: 75 });
    const sim = makeSim();
    expect(sim.player.hp).toBe(70);
    expect(sim.rerollsLeft).toBe(PROGRESSION_CONFIG.baseRerolls);
  });
});

describe('초반 레벨업 경험치 완화', () => {
  it('Lv1은 36%, Lv2~5는 절반, Lv6~9 는 서서히 원래대로, Lv10 부터 원래 값', () => {
    expect(xpToNext(1)).toBe(8);
    for (let lv = 2; lv <= 5; lv++) expect(xpToNext(lv)).toBe(Math.round(rawXp(lv) * 0.5));
    expect(xpToNext(6)).toBe(Math.round(rawXp(6) * 0.6));
    expect(xpToNext(9)).toBe(Math.round(rawXp(9) * 0.9));
    for (let lv = 10; lv <= 30; lv++) expect(xpToNext(lv)).toBe(Math.round(rawXp(lv)));
  });
});

describe('레벨업 보상 등급', () => {
  it('등급 배율이 효과에 적용된다 (%·감소·정수 지정)', () => {
    const power = UPGRADE_BY_ID.power.effects[0];
    expect(effectValue(power, 'common')).toBeCloseTo(0.22);
    expect(effectValue(power, 'rare')).toBeCloseTo(0.33);
    expect(effectValue(power, 'legendary')).toBeCloseTo(0.66);
    const evasion = UPGRADE_BY_ID.evasion.effects[0];
    expect(effectValue(evasion, 'epic')).toBeCloseTo(1 - 0.18 * 2);
    const split = UPGRADE_BY_ID.split.effects[0];
    expect([effectValue(split, 'common'), effectValue(split, 'rare'), effectValue(split, 'epic'), effectValue(split, 'legendary')]).toEqual([1, 1, 2, 2]);
    expect(upgradeText(UPGRADE_BY_ID.power, 'rare')).toBe('피해 +33%');
    expect(upgradeText(UPGRADE_BY_ID.vitality, 'legendary')).toBe('최대 체력 +75, 즉시 75 회복');
  });

  it('같은 강화도 등급이 높으면 능력치가 더 오른다', () => {
    const common = computeStats([{ id: 'power', grade: 'common' }]).damage;
    const legend = computeStats([{ id: 'power', grade: 'legendary' }]).damage;
    expect(legend).toBeGreaterThan(common);
    expect(legend).toBeCloseTo(PLAYER_BASE_STATS.damage * 1.66, 5);
  });

  it('등급 분포는 설정 확률을 따르고, 행운이 높으면 상위 등급이 늘어난다', () => {
    const count = (luck: number) => {
      const rng = new Rng(9);
      const c = { common: 0, rare: 0, epic: 0, legendary: 0 };
      for (let i = 0; i < 20000; i++) c[rollGrade(rng, luck)]++;
      return c;
    };
    const base = count(0);
    expect(base.common / 20000).toBeCloseTo(0.65, 1);
    expect(base.legendary).toBeGreaterThan(0);
    const lucky = count(2);
    expect(lucky.common).toBeLessThan(base.common);
    expect(lucky.legendary).toBeGreaterThan(base.legendary);
    expect(gradeWeights(100)[0]).toBeGreaterThan(0); // 일반 등급이 0 이 되지는 않는다
  });

  it('일반 중첩 수는 등급과 관계없이 선택 횟수로 센다', () => {
    const sim = makeSim({ seed: 4, god: true });
    for (let i = 0; i < 300; i++) {
      sim.gainXp(10_000);
      sim.step(IDLE_INPUT);
      while (sim.phase === 'levelup') sim.choose(0);
    }
    expect(sim.stacks.split).toBeGreaterThan(3);
    expect(sim.picks.filter((p) => p.id === 'split').length).toBe(sim.stacks.split);
  });
});

describe('레벨업 선택지 새로고침', () => {
  it('남은 횟수만큼 새로고침되고, 직전 후보는 가능한 한 다시 나오지 않는다', () => {
    const sim = makeSim({ seed: 21, god: true });
    sim.gainXp(100);
    sim.step(IDLE_INPUT);
    expect(sim.phase).toBe('levelup');
    const before = sim.choices.map((c) => (c.kind === 'upgrade' ? c.def.id : c.id));
    expect(sim.reroll()).toBe(true);
    const after = sim.choices.map((c) => (c.kind === 'upgrade' ? c.def.id : c.id));
    for (const id of after) if (!UPGRADE_BY_ID[id as 'power']?.weapon) expect(before).not.toContain(id);
    expect(sim.rerollsLeft).toBe(PROGRESSION_CONFIG.baseRerolls - 1);
    expect(sim.reroll()).toBe(true);
    expect(sim.reroll()).toBe(false); // 횟수 소진
    expect(sim.rerollsUsed).toBe(2);
    const t = sim.elapsed;
    sim.step(IDLE_INPUT);
    expect(sim.elapsed).toBe(t); // 새로고침해도 레벨업 중에는 시간이 멈춰 있다
  });

  it('기존 한도보다 높은 후보도 새로고침의 제외 규칙을 따른다', () => {
    const stacks = emptyStacks();
    for (const id of ['swift', 'evasion', 'magnet'] as const) stacks[id] = 10;
    const c = rollChoices(new Rng(3), stacks, 0, ['swift', 'evasion', 'magnet']);
    expect(c).toHaveLength(3);
    expect(c.every((choice) => choice.kind === 'upgrade' && !['swift', 'evasion', 'magnet'].includes(choice.def.id))).toBe(true);
  });
});

describe('영구 강화 (토큰 상점)', () => {
  it('영구 강화는 시작 능력치에 곱해지고, 그 위에 판 강화가 적용된다', () => {
    const meta = metaBonus({ damage: 5, fireRate: 5, dodge: 5 });
    const layers = statLayers([{ id: 'power', grade: 'common' }], meta);
    expect(layers.base.damage).toBe(9);
    expect(layers.meta.damage).toBeCloseTo(9 * 1.2);
    expect(layers.final.damage).toBeCloseTo(9 * 1.2 * 1.22);
    expect(layers.meta.fireRate).toBeCloseTo(1.44);
    expect(layers.meta.dodgeCooldown).toBeCloseTo(3.0 * 0.85);
  });

  it('구매 가격·최대 단계·토큰 부족 처리', () => {
    let tokens = 1000;
    let purchases = {};
    for (let i = 0; i < 5; i++) {
      const r = buyMeta(tokens, purchases, 'hp')!;
      tokens = r.tokens;
      purchases = r.purchases;
    }
    expect(tokens).toBe(1000 - (10 + 15 + 22 + 32 + 45));
    expect(buyMeta(tokens, purchases, 'hp')).toBeNull();
    expect(buyMeta(5, {}, 'damage')).toBeNull();
    expect(buyMeta(1000, {}, 'unknown')).toBeNull();
  });

  it('해금: 새로고침 추가·부활·시작 강화·행운이 판에 반영된다', () => {
    const sim = makeSim({ meta: { reroll: 2, revive: 1, startPick: 1, luck: 2 } });
    expect(sim.rerollsLeft).toBe(PROGRESSION_CONFIG.baseRerolls + 2);
    expect(sim.revivesLeft).toBe(1);
    expect(sim.meta.luck).toBe(2);
    // 시작 강화: 전투 시작 전에 레벨업 창이 열리고 시간은 0 에서 멈춰 있다
    expect(sim.phase).toBe('levelup');
    expect(sim.startPickOpen).toBe(true);
    sim.step(IDLE_INPUT);
    expect(sim.elapsed).toBe(0);
    sim.choose(0);
    expect(sim.phase).toBe('combat');
    expect(sim.level).toBe(1);
    expect(sim.pickOrder).toHaveLength(1);
  });

  it('부활: 한 번 쓰러지면 체력 50%로 일어나고, 두 번째는 패배', () => {
    const sim = makeSim({ meta: { revive: 1 } });
    sim.hurtPlayer(9999, '첫 일격');
    sim.step(IDLE_INPUT);
    expect(sim.phase).toBe('combat');
    expect(sim.player.hp).toBeCloseTo(sim.stats.maxHp * 0.5);
    expect(sim.revived).toBe(1);
    runTicks(sim, 200); // 부활 무적이 끝날 때까지
    sim.player.invuln = 0;
    sim.hurtPlayer(9999, '두 번째 일격');
    sim.step(IDLE_INPUT);
    expect(sim.result).toMatchObject({ cause: 'death', killedBy: '두 번째 일격', revived: 1 });
  });

  it('토큰 보상 계산', () => {
    expect(tokenReward({ survivalTime: 59, killsByKind: {}, outcome: 'defeat' }).total).toBe(0);
    expect(tokenReward({ survivalTime: 900, killsByKind: { chaser: 1000, spitter: 100, charger: 100, elite: 3, boss: 1 }, outcome: 'victory' })).toEqual({
      survival: 30, kills: 24, elites: 15, victory: 30, relics: 0, total: 99,
    });
  });

  it('밸런스 기준 영구 강화는 토큰 약 150개 규모이며, 상점에 있는 항목만 쓴다', () => {
    const all = [...META_STATS, ...META_UNLOCKS];
    let cost = 0;
    for (const [id, lv] of Object.entries(BALANCE_REFERENCE_META)) {
      const def = all.find((d) => d.id === id)!;
      expect(def).toBeDefined();
      cost += def.costs.slice(0, lv).reduce((a, b) => a + b, 0);
    }
    expect(cost).toBeGreaterThanOrEqual(120);
    expect(cost).toBeLessThanOrEqual(180);
  });
});

describe('처치 드랍 아이템', () => {
  it('같은 시드면 같은 처치에서 같은 아이템이 떨어진다', () => {
    const drops = (seed: number) => {
      const sim = makeSim({ seed, god: true });
      const out: string[] = [];
      for (let i = 0; i < 2000; i++) {
        const e = sim.spawnEnemy('chaser', sim.player.x + 500, sim.player.y);
        sim.damageEnemy(e, 9999);
        if (sim.pickups.length) {
          out.push(`${i}:${sim.pickups[0].kind}`);
          sim.pickups.length = 0;
        }
      }
      return out;
    };
    const a = drops(5);
    expect(a.length).toBeGreaterThan(20); // 2000 처치 × 약 2.2% ≈ 44
    expect(a.length).toBeLessThan(80);
    expect(drops(5)).toEqual(a);
    expect(drops(6)).not.toEqual(a);
  });

  it('엘리트는 반드시 회복 물약을 떨어뜨린다', () => {
    const sim = makeSim({ god: true });
    const e = sim.spawnEnemy('elite', sim.player.x + 400, sim.player.y);
    sim.damageEnemy(e, 1e9);
    expect(sim.pickups.map((p) => p.kind)).toEqual(['heal']);
  });

  it('회복·자석·폭탄 효과, 줍기, 사라짐', () => {
    const sim = makeSim({ seed: 2 });
    const p = sim.player;
    sim.hurtPlayer(40, 'x');
    const hp = p.hp;
    sim.pickups.push({ x: p.x + 5, y: p.y, kind: 'heal', life: 20 });
    sim.step(IDLE_INPUT);
    expect(p.hp).toBeCloseTo(hp + 25, 0);
    expect(sim.pickups).toHaveLength(0);

    sim.gems.push({ x: p.x + 1500, y: p.y, value: 1, pulled: false });
    sim.useItem('magnet');
    expect(sim.gems.every((g) => g.pulled)).toBe(true);

    const near = sim.spawnEnemy('charger', p.x + 300, p.y);
    const far = sim.spawnEnemy('charger', p.x + 1200, p.y);
    sim.useItem('bomb');
    expect(near.dead).toBe(true);
    expect(far.dead).toBe(false);

    sim.pickups.push({ x: p.x + 900, y: p.y, kind: 'magnet', life: 1 });
    runTicks(sim, 70);
    expect(sim.pickups).toHaveLength(0); // 20초 수명이 다하면 사라짐 (여기선 1초)
    expect(sim.itemsCollected).toBe(3);
  });

  it('바닥 아이템은 최대 개수를 넘지 않는다', () => {
    const sim = makeSim({ god: true });
    for (let i = 0; i < 20; i++) {
      const e = sim.spawnEnemy('elite', sim.player.x + 800, sim.player.y + i * 5);
      sim.damageEnemy(e, 1e9);
    }
    expect(sim.pickups.length).toBe(8);
  });
});

describe('시간 규칙 유지', () => {
  it('보스는 13:30에 등장한다', () => {
    expect(RUN_CONFIG.bossAt).toBe(810);
  });
});

it('경험치 상점 강화는 구매 단계별 누적 비율을 적용한다', () => {
  const bonuses = [0.12, 0.19, 0.25, 0.30, 0.35];
  bonuses.forEach((bonus, i) => {
    const sim = makeSim({ meta: { xp: i + 1 } });
    sim.gainXp(5);
    expect(sim.xp).toBeCloseTo(5 * (1 + bonus));
    expect(sim.drainEvents().find((event) => event.type === 'pickup')?.amount).toBeCloseTo(sim.xp);
  });
});

it('상점 행운과 전투의 행운의 별을 모두 등급 확률에 반영한다', () => {
  const sim = makeSim({ meta: { luck: 5 }, presetUpgrades: { fortune: 2 } });
  expect(sim.luck).toBe(7);
  const weights = gradeWeights(sim.luck);
  expect(weights[0]).toBeLessThan(gradeWeights(0)[0]);
  expect(weights[3]).toBeGreaterThan(gradeWeights(0)[3]);
  expect(gradeWeights(5)).toEqual([25, 45, 21, 9]);
  const firstRun = makeSim({ meta: { luck: 5 } });
  firstRun.gainXp(firstRun.xpNeeded);
  firstRun.step(IDLE_INPUT);
  expect(firstRun.choices.every((choice) => choice.kind === 'upgrade' && choice.def.weapon)).toBe(true);
  expect(firstRun.choices.some((choice) => choice.kind === 'upgrade' && choice.grade !== 'common')).toBe(true);
});
