import { describe, expect, it } from 'vitest';
import { SWORD, type Loadout } from '../src/config/characters';
import { RELICS, RELIC_IDS, relicAllowed, type RelicId } from '../src/config/relics';
import { ROAN_UPGRADES, ROAN_WEAPONS, ROAN_WEAPON_IDS, roanUpgradesOf, type RoanGearChoice, type RoanUpgradeId, type RoanWeaponId } from '../src/config/roan';
import { MASTERY_UPGRADES, UPGRADE_BY_ID } from '../src/config/upgrades';
import { rollRelics } from '../src/core/relics';
import { Rng } from '../src/core/rng';
import { GameSim } from '../src/core/sim';
import { IDLE_INPUT } from '../src/core/types';
import { upgradeAvailable } from '../src/core/upgrades';

const roan: Loadout = { character: 'roan' };

function gear(weapon?: RoanWeaponId, upgrade?: RoanUpgradeId, awaken = false): RoanGearChoice[] {
  return [
    ...(weapon ? [{ stage: 'weapon', id: weapon } as const] : []),
    ...(upgrade ? [{ stage: 'upgrade', id: upgrade } as const] : []),
    ...(upgrade && awaken ? [{ stage: 'awaken', id: upgrade } as const] : []),
  ];
}

function make(weapon?: RoanWeaponId, upgrade?: RoanUpgradeId, opts: { awaken?: boolean; relics?: RelicId[]; god?: boolean; seed?: number } = {}): GameSim {
  const s = new GameSim({ seed: opts.seed ?? 41, god: opts.god ?? true, loadout: roan, roanGear: gear(weapon, upgrade, opts.awaken) });
  for (const id of opts.relics ?? []) s.relics.acquire(id);
  return s;
}

function target(s: GameSim, dx: number, dy = 0, kind: 'chaser' | 'elite' = 'chaser', hp = 100000) {
  const e = s.spawnEnemy(kind, s.player.x + dx, s.player.y + dy);
  e.hp = e.maxHp = hp;
  e.speed = 0;
  return e;
}

const steps = (s: GameSim, n: number) => { for (let i = 0; i < n; i++) s.step(IDLE_INPUT); };
const swing = (s: GameSim) => { s.player.fireCd = 0; s.step(IDLE_INPUT); };

function levelTo(s: GameSim, level: number, pick: (stage: string, ids: string[]) => number = () => 0): string[][] {
  const seen: string[][] = [];
  while (s.level < level) {
    s.gainXp((s.xpNeeded - s.xp + 0.00001) / (s.stats.xpGain * s.relics.xpMultiplier));
    s.step(IDLE_INPUT);
    while (s.phase === 'levelup') {
      const first = s.choices[0];
      if (first?.kind === 'roanGear') {
        const ids = s.choices.map((c) => (c.kind === 'roanGear' ? c.gear.id : ''));
        seen.push([first.gear.stage, ...ids]);
        expect(s.reroll()).toBe(false);
        expect(s.choose(pick(first.gear.stage, ids))).toBe(true);
      } else expect(s.choose(0)).toBe(true);
    }
  }
  return seen;
}

describe('로안 무기 선택', () => {
  it('6레벨 무기 4종, 12레벨 고른 무기의 상위 무기, 18레벨 각성을 차례로 고른다', () => {
    const s = make();
    const seen = levelTo(s, 19, (stage, ids) => (stage === 'weapon' ? ids.indexOf('mace') : stage === 'upgrade' ? ids.indexOf('flail') : 0));
    expect(seen).toEqual([
      ['weapon', ...ROAN_WEAPON_IDS],
      ['upgrade', ...roanUpgradesOf('mace')],
      ['awaken', 'flail'],
    ]);
    expect(roanUpgradesOf('mace')).toHaveLength(4);
    expect(s.roan.weapon).toBe('mace');
    expect(s.roan.upgrade).toBe('flail');
    expect(s.roan.awakened).toBe(true);
    expect(s.pickOrder).toEqual(expect.arrayContaining(['mace', 'flail', 'awaken:flail']));
  });

  it('무기마다 최대 체력·받는 피해·이동 속도·회피 대기시간이 다르다', () => {
    const base = make();
    expect(base.stats.maxHp).toBe(160);
    for (const id of ROAN_WEAPON_IDS) {
      const s = make(id);
      const w = ROAN_WEAPONS[id];
      expect(s.stats.maxHp).toBe(w.maxHp);
      expect(s.stats.dodgeCooldown).toBeCloseTo(w.dodgeCooldown);
      expect(s.stats.moveSpeed).toBeCloseTo(base.stats.moveSpeed * w.moveSpeed);
      expect(s.relics.damageTaken()).toBeCloseTo(base.relics.damageTaken() * w.damageTaken);
    }
  });

  it('6레벨에 무기를 고르면 늘어난 최대 체력만큼 회복한다', () => {
    const s = make();
    s.player.hp = 100;
    levelTo(s, 6, (_stage, ids) => ids.indexOf('waraxe'));
    expect(s.relics.maxHp).toBe(200 + s.stats.maxHp - 200);
    expect(s.player.hp).toBeGreaterThanOrEqual(140);
  });

  it('무기 피해·공격 간격은 검 대비 배율이다', () => {
    const sword = make('sword');
    for (const id of ROAN_WEAPON_IDS) {
      const s = make(id);
      expect(s.roan.damage).toBeCloseTo(sword.roan.damage * ROAN_WEAPONS[id].damage);
      expect(s.roan.interval).toBeCloseTo(sword.roan.interval * ROAN_WEAPONS[id].interval);
    }
    const rapier = make('sword', 'rapier');
    expect(rapier.roan.interval).toBeCloseTo(sword.roan.interval * 0.6);
    const throwing = make('waraxe', 'throwingaxe');
    expect(throwing.roan.interval).toBeCloseTo(sword.roan.interval * 0.7);
    expect(throwing.roan.range).toBe(115);
  });

  it('넓은 베기가 360°를 넘치면 거리로 바뀐다', () => {
    const s = new GameSim({ seed: 1, god: true, loadout: roan, roanGear: gear('waraxe', 'greataxe'), presetUpgrades: { swordArc: 3 } });
    // 대형 도끼 220° + 60° = 280°
    expect(s.roan.angle).toBe(280);
    const over = new GameSim({ seed: 1, god: true, loadout: roan, roanGear: gear('waraxe', 'greataxe'), presetUpgrades: { swordArc: 9 } });
    // 220 + 180 = 400° → 360°, 넘친 40° → 거리 +10%
    expect(over.roan.angle).toBe(360);
    expect(over.roan.range).toBeCloseTo(ROAN_UPGRADES.greataxe.range * 1.1);
  });
});

describe('무기 특화 기능', () => {
  it('검: 3번째 공격마다 연격(피해 50%), 한손검은 2번째마다', () => {
    const s = make('sword');
    const e = target(s, 70);
    for (let i = 0; i < 3; i++) swing(s);
    steps(s, 12);
    const per = s.roan.damage;
    expect(e.maxHp - e.hp).toBeCloseTo(per * 3.5);
    const one = make('sword', 'onehand');
    const e2 = target(one, 70);
    for (let i = 0; i < 2; i++) swing(one);
    steps(one, 12);
    expect(e2.maxHp - e2.hp).toBeCloseTo(one.roan.damage * 2.5);
  });

  it('단검: 출혈이 쌓이고(최대 5중첩) 초당 검 피해 15%', () => {
    const s = make('dagger');
    const e = target(s, 60);
    for (let i = 0; i < 7; i++) swing(s);
    expect(s.roan.bleeds.get(e)?.stacks).toBe(5);
    const before = s.damageByAttack.bleed ?? 0;
    steps(s, 60);
    const swordDamage = s.roan.damage / ROAN_WEAPONS.dagger.damage;
    expect((s.damageByAttack.bleed ?? 0) - before).toBeGreaterThan(swordDamage * 0.15 * 5 * 0.9);
  });

  it.each([undefined, 'stiletto', 'scimitar'] as const)('단검 계열 %s은 사거리 80px의 직선에서만 검 피해의 35%%로 찌른다', (upgrade) => {
    const s = make('dagger', upgrade);
    const ahead = target(s, 36);
    const edge = target(s, 80, 17);
    const beside = target(s, 60, 25);
    const beyond = target(s, 94);
    const behind = target(s, -60);
    swing(s);
    expect(s.swordSweep).toMatchObject({ range: 80, width: 0, lineWidth: 10, hits: 2 });
    for (const enemy of [ahead, edge]) expect(enemy.maxHp - enemy.hp).toBeCloseTo(make('sword').roan.damage * 0.35);
    for (const enemy of [beside, beyond, behind]) expect(enemy.hp).toBe(enemy.maxHp);
  });

  it('단검의 넓은 베기 강화는 직선 폭만 최대 24px까지 넓힌다', () => {
    const s = new GameSim({ seed: 41, god: true, loadout: roan, roanGear: gear('dagger'), presetUpgrades: { swordArc: 9 } });
    target(s, 42);
    const edge = target(s, 72, 24);
    swing(s);
    expect(s.swordSweep).toMatchObject({ range: 80, width: 0, lineWidth: 24, hits: 2 });
    expect(edge.hp).toBeLessThan(edge.maxHp);
  });

  it('시미터의 전용 강화와 사막의 바람은 찌르기 폭을 합산한다', () => {
    const s = new GameSim({ seed: 41, god: true, loadout: roan, roanGear: gear('dagger', 'scimitar'),
      presetUpgrades: { swordArc: 1, scimitarArc: 1 } });
    s.relics.acquire('desertWind');
    target(s, 40);
    const edge = target(s, 68, 23);
    swing(s);
    expect(s.swordSweep).toMatchObject({ range: 80, width: 0, lineWidth: 21, hits: 2 });
    expect(edge.hp).toBeLessThan(edge.maxHp);
  });

  it('시미터가 출혈 중인 적을 처치하면 각성 전염과 초승달 칼날의 직선 찌르기가 발동한다', () => {
    const s = make('dagger', 'scimitar', { awaken: true, relics: ['crescentEdge'] });
    const victim = target(s, 36);
    const ahead = target(s, 72);
    const beside = target(s, 74, 30);
    swing(s);
    victim.hp = 1;
    const before = ahead.hp;
    swing(s);
    expect(victim.dead).toBe(true);
    expect(before - ahead.hp).toBeCloseTo(s.roan.damage * 1.3);
    expect(s.roan.bleeds.has(beside)).toBe(true);
    steps(s, 9);
    expect(s.swordSweep).toMatchObject({ kind: 'extra', range: 80, lineWidth: 10, hits: 1 });
    expect(beside.hp).toBe(beside.maxHp);
    expect(before - ahead.hp).toBeCloseTo(s.roan.damage * 2.6);
  });

  it('쌍검: 출혈 중첩에 한도가 없다', () => {
    const s = make('dagger', 'twinblades');
    const e = target(s, 60);
    for (let i = 0; i < 6; i++) { swing(s); steps(s, 20); }
    expect(s.roan.bleeds.get(e)!.stacks).toBeGreaterThan(10);
  });

  it.each([false, true])('쌍검: 각성 %s일 때도 같은 직선을 양손으로 번갈아 찌른다', (awaken) => {
    const s = make('dagger', 'twinblades', { awaken });
    const ahead = target(s, 45);
    const beside = target(s, 70, 24);
    const beyond = target(s, 95);
    swing(s);
    steps(s, 10);
    const count = awaken ? 3 : 2;
    expect(s.swordSweeps).toHaveLength(count);
    for (const [i, strike] of s.swordSweeps.entries()) {
      expect(strike).toMatchObject({ angle: 0, width: 0, lineWidth: 10, range: 80, motion: 'thrust', offHand: i % 2 === 1, hits: 1 });
      expect(Math.round((strike.at - s.swordSweeps[0].at) * 60)).toBe(i * 5);
    }
    expect(ahead.maxHp - ahead.hp).toBeCloseTo(make('sword').roan.damage * 0.21 * count);
    expect(s.roan.bleeds.get(ahead)?.stacks).toBe(2 * count);
    expect(beside.hp).toBe(beside.maxHp);
    expect(beyond.hp).toBe(beyond.maxHp);
  });

  it('메이스: 일반 적을 기절시키고, 균열 수호자는 절반 확률, 보스는 기절하지 않는다', () => {
    let normal = 0;
    let elite = 0;
    for (let seed = 0; seed < 40; seed++) {
      const s = make('mace', 'warmace', { seed });
      const a = target(s, 60, -20);
      const b = target(s, 60, 20, 'elite');
      swing(s);
      if (a.rootedUntil > s.elapsed) normal++;
      if (b.rootedUntil > s.elapsed) elite++;
    }
    expect(normal / 40).toBeGreaterThan(0.25);
    expect(elite).toBeLessThan(normal);
  });

  it('도끼: 적 체력이 낮을수록 피해가 커진다 (최대 +50%)', () => {
    const full = make('waraxe');
    const a = target(full, 70);
    swing(full);
    const low = make('waraxe');
    const b = target(low, 70);
    b.hp = 1000;
    b.maxHp = 100000;
    swing(low);
    expect((1000 - b.hp) / (a.maxHp - a.hp)).toBeCloseTo(1 + 0.5 * 0.99, 1);
  });
});

describe('상위 무기', () => {
  it('플레일은 타격 지점을 중심으로 360° 회전한다', () => {
    const s = make('mace', 'flail');
    const near = target(s, 100);
    const behindTarget = target(s, 160);
    swing(s);
    expect(near.hp).toBeLessThan(near.maxHp);
    expect(behindTarget.hp).toBeLessThan(behindTarget.maxHp);
    expect(s.swordSweep!.x).toBeCloseTo(near.x);
  });

  it('양손메이스는 충격파를 일으킨다', () => {
    const s = make('mace', 'maul');
    target(s, 70);
    const far = target(s, 115 + 80);
    swing(s);
    expect(far.hp).toBeLessThan(far.maxHp);
  });

  it('레이피어는 가까운 4마리까지 꿰뚫는다', () => {
    const s = make('sword', 'rapier');
    const line = [40, 70, 100, 130, 160, 190].map((x) => target(s, x));
    swing(s);
    expect(line.filter((e) => e.hp < e.maxHp)).toHaveLength(4);
  });

  it('투척 도끼는 3번째 공격마다 도끼를 던진다', () => {
    const s = make('waraxe', 'throwingaxe');
    target(s, 60);
    swing(s);
    swing(s);
    expect(s.playerShots.filter((p) => p.source === 'thrownAxe')).toHaveLength(0);
    swing(s);
    expect(s.playerShots.filter((p) => p.source === 'thrownAxe')).toHaveLength(1);
  });

  it('할버드는 찌르기와 베기를 번갈아 하고 일반 적을 밀쳐낸다', () => {
    const s = make('waraxe', 'halberd');
    const e = target(s, 80);
    const x = e.x;
    swing(s);
    expect(e.x).toBeGreaterThan(x);
    expect(s.swordSweep!.motion).toBe('thrust');
    swing(s);
    expect(s.swordSweep!.motion).toBe('thrust');
  });
});

describe('전용 강화와 유물', () => {
  it('무기·상위 무기 전용 강화는 고른 뒤에만 나온다', () => {
    const ids = (forms: string[]) => MASTERY_UPGRADES.filter((d) => upgradeAvailable(roan, d, 20, forms)).map((d) => d.id);
    expect(ids([])).toEqual(['swordSpeed', 'swordRange', 'swordArc', 'swordDamage', 'swordPierce']);
    expect(ids(['dagger'])).toEqual([...ids([]), 'daggerBleed', 'daggerPoison', 'daggerSpeed']);
    expect(ids(['dagger', 'twinblades'])).toEqual([...ids(['dagger']), 'twinCross', 'twinChain']);
  });

  it('기존 로안 유물은 없고, 근접 특화 8종과 상위 무기 전용 39종이 있다', () => {
    const roanRelics = RELIC_IDS.filter((id) => 'character' in RELICS[id] && (RELICS[id] as { character: string }).character === 'roan');
    expect(roanRelics).toHaveLength(47);
    expect(roanRelics.filter((id) => 'form' in RELICS[id])).toHaveLength(39);
    for (const id of Object.keys(ROAN_UPGRADES) as RoanUpgradeId[]) {
      expect(roanRelics.filter((r) => (RELICS[r] as { form?: string }).form === id)).toHaveLength(3);
    }
    expect(RELIC_IDS.some((id) => id.startsWith('sword'))).toBe(false);
    expect(relicAllowed('chargeStance', { character: 'ranger' })).toBe(false);
  });

  it('상위 무기 전용 유물은 그 상위 무기를 고른 뒤에만 후보에 나온다', () => {
    const rng = new Rng(7);
    const roll = (forms: string[]) => Array.from({ length: 30 }, () => rollRelics('elite', rng, new Set(), roan, new Set(), forms)).flat()
      .map((c) => (c.kind === 'relic' ? c.id : ''));
    const formOf = (id: string) => (RELICS as Record<string, { form?: string }>)[id]?.form;
    expect(roll([]).some((id) => formOf(id))).toBe(false);
    const flail = roll(['flail']);
    expect(flail.filter((id) => formOf(id)).every((id) => formOf(id) === 'flail')).toBe(true);
    expect(flail).toContain('chainHook');
  });

  it('다른 상위 무기의 유물은 효과 대신 검 피해 +5%', () => {
    const plain = make('sword', 'onehand');
    const other = make('sword', 'onehand', { relics: ['lumberjack'] });
    expect(other.roan.damage).toBeCloseTo(plain.roan.damage * 1.05);
  });

  it('로안 시작 유물 후보에 돌격 자세·근접 본능이 들어간다', () => {
    const choices = rollRelics('opening', new Rng(3), new Set(), roan);
    const pool = new Set<string>();
    const rng = new Rng(3);
    for (let i = 0; i < 30; i++) for (const c of rollRelics('opening', rng, new Set(), roan)) if (c.kind === 'relic') pool.add(c.id);
    expect(choices.length).toBe(3);
    expect(pool.has('chargeStance')).toBe(true);
    expect(pool.has('meleeInstinct')).toBe(true);
  });

  it('근접 특화 유물: 강인한 근육·무기 손질 도구·무기 투척술', () => {
    const s = make('sword', undefined, { relics: ['toughMuscle', 'whetKit', 'weaponThrow'] });
    const plain = make('sword');
    expect(s.relics.maxHp).toBeCloseTo(plain.relics.maxHp * 1.2);
    expect(s.roan.damage).toBeCloseTo(plain.roan.damage * 1.08);
    target(s, 70);
    swing(s);
    expect(s.playerShots.some((p) => p.source === 'weaponThrow')).toBe(true);
  });

  it('상위 무기 유물: 절단(대형 도끼)은 체력 15% 이하 일반 적을 즉사시킨다', () => {
    const s = make('waraxe', 'greataxe', { relics: ['sever'] });
    const e = target(s, 70, 0, 'chaser', 1000);
    e.hp = 140;
    swing(s);
    expect(e.dead).toBe(true);
  });

  it('검 피해 계수는 밸런스 기준(5.0)을 유지한다', () => {
    expect(SWORD.damage).toBe(5.0);
    expect(UPGRADE_BY_ID.swordArc).toBeDefined();
  });
});
