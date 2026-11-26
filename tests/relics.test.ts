import { describe, expect, it } from 'vitest';
import { OPENING_RELICS, RELICS, validCarry } from '../src/config/relics';
import { IDLE_INPUT } from '../src/core/types';
import { parseSave, defaultSave } from '../src/storage/save';
import { makeSim, runUntil } from './helpers';

describe('유물 보상 및 계승', () => {
  it('누적 경험치로 3·5·10레벨을 넘겨도 각각 유물 보상을 받는다', () => {
    const sim = makeSim();
    while (sim.level < 10) sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    let upgrades = 0;
    const rewards: string[] = [];
    while (sim.phase === 'levelup') {
      const choice = sim.choices[0];
      if (choice.kind === 'relic') {
        if (choice.source === 'opening') expect(OPENING_RELICS).toContain(choice.id);
        expect(sim.relics.has(choice.id)).toBe(false);
        rewards.push(choice.source);
      } else upgrades++;
      expect(sim.choose(0)).toBe(true);
    }
    expect(upgrades).toBe(9);
    expect(rewards).toEqual(['opening', 'level', 'level']);
  });

  it('중간 보스 보상은 전투를 멈추고 중복 없는 별도 후보를 보여준다', () => {
    const sim = makeSim({ carryRelics: ['crown'], presetUpgrades: { mark: 2 } });
    const elite = sim.spawnEnemy('elite', 900, 900);
    sim.damageEnemy(elite, 1e6);
    sim.step(IDLE_INPUT);
    expect(sim.phase).toBe('levelup');
    expect(sim.step(IDLE_INPUT)).toBe(false);
    expect(sim.choices).toHaveLength(3);
    expect(sim.reroll()).toBe(false);
    for (const choice of sim.choices) {
      if (choice.kind !== 'relic') throw new Error('중간 보스 유물 후보가 없습니다');
      expect(RELICS[choice.id].source).toBe('elite');
      expect(choice.id).not.toBe('crown');
    }
    sim.choose(0);
    expect(sim.relics.owned.size).toBe(2);
    expect(sim.armoryOpen).toBe(true);
    expect(sim.choices.every((c) => c.kind === 'upgrade' && c.def.weapon)).toBe(true);
    expect(sim.choices.some((c) => c.kind === 'upgrade' && c.def.id === 'chain')).toBe(true);
    expect(sim.reroll()).toBe(false);
    expect(sim.choose(0)).toBe(true);
    expect(sim.pendingLevels).toBe(0);
    expect(sim.phase).toBe('combat');
  });

  it('저장된 계승 목록에서 알 수 없는 유물과 중복을 제거하고 세 개까지만 가져온다', () => {
    const ids = ['oath', 'oath', 'unknown', 'buckle', 'anchor', 'heart'];
    expect(validCarry(ids)).toEqual(['oath', 'buckle', 'anchor']);
    const data = parseSave(JSON.stringify({ ...defaultSave(), relicCarry: ids })).data;
    expect([...makeSim({ carryRelics: data.relicCarry }).relics.owned]).toEqual(['oath', 'buckle', 'anchor']);
  });

  it('삭제된 유물(수호자의 매듭·첫불의 부싯돌·흉터의 인장)은 선택지에 없고, 예전 저장의 계승 목록에서도 빠진다', () => {
    for (const id of ['knot', 'flint', 'scars']) expect(Object.hasOwn(RELICS, id)).toBe(false);
    const data = parseSave(JSON.stringify({ ...defaultSave(), relicCarry: ['flint', 'knot', 'oath', 'scars', 'heart'] })).data;
    expect(data.relicCarry).toEqual(['oath', 'heart']);
  });
});

describe('유물 효과', () => {
  it('사냥꾼의 맹세는 보유 중 처치만 계산하고 다음 판에서 초기화된다', () => {
    const sim = makeSim();
    sim.kills = 100;
    sim.relics.acquire('oath');
    const enemy = sim.spawnEnemy('chaser', 900, 900);
    expect(sim.relics.damageMultiplier(enemy, false)).toBe(1);
    sim.kills += 26;
    expect(sim.relics.damageMultiplier(enemy, false)).toBeCloseTo(1.04);
    expect(makeSim({ carryRelics: ['oath'] }).relics.damageMultiplier(enemy, false)).toBe(1);
  });

  it('마지막 성냥은 치명 피해를 한 번 막고 무적과 최대 체력 감소를 적용한다', () => {
    const sim = makeSim({ carryRelics: ['lastMatch'] });
    expect(sim.hurtPlayer(500, 'test')).toBe(true);
    expect(sim.player.hp).toBe(1);
    expect(sim.player.invuln).toBe(2);
    expect(sim.relics.maxHp).toBeCloseTo(sim.stats.maxHp * 0.8);
    runUntil(sim, 2.1);
    expect(sim.hurtPlayer(500, 'test')).toBe(true);
    expect(sim.player.hp).toBe(0);
  });

  it('매설자의 나침반은 기본 지뢰 없이도 회피 끝에 무장된 지뢰를 놓는다', () => {
    const sim = makeSim({ carryRelics: ['compass'] });
    sim.step({ ...IDLE_INPUT, moveX: 1, dodge: true });
    runUntil(sim, 0.45);
    sim.weapons.update(10);
    expect(sim.weapons.devices.some((d) => d.kind === 'mine' && d.armAt === 0)).toBe(true);
    expect(sim.stacks.mine).toBe(0);
    expect(sim.relics.dodgeCooldown).toBe(sim.stats.dodgeCooldown + 0.5);
  });

  it('쌍월 톱니는 칼날을 하나 더하고 회전 반경을 20% 넓히며, 칼날 처치마다 칼날 피해가 0.5%씩 최대 15% 오른다', () => {
    const sim = makeSim({ carryRelics: ['cog'], presetUpgrades: { orbit: 1 } });
    sim.step(IDLE_INPUT);
    const distance = () => Math.hypot(sim.weapons.blades[0].x - sim.player.x, sim.weapons.blades[0].y - sim.player.y);
    expect(sim.weapons.blades).toHaveLength(3);
    expect(distance()).toBeCloseTo(78);
    sim.step({ ...IDLE_INPUT, moveX: 1, dodge: true });
    expect(distance()).toBeCloseTo(78); // 회피해도 반경은 그대로
    // 칼날 처치 수에 따른 피해 증가: 쿨다운이 없는 표적에 한 번 맞힌 피해를 비교
    const hitDamage = (kills: number) => {
      (sim.weapons as any).cogKills = kills;
      (sim.weapons as any).orbitHits.clear();
      const blade = sim.weapons.blades[0];
      const e = sim.spawnEnemy('chaser', blade.x, blade.y);
      e.hp = e.maxHp = 1e6;
      (sim.weapons as any).orbit();
      return 1e6 - e.hp;
    };
    const base = hitDamage(0);
    expect(hitDamage(10) / base).toBeCloseTo(1.05, 5);
    expect(hitDamage(100) / base).toBeCloseTo(1.15, 5);
  });
});

describe('유물과 전투의 상호작용', () => {
  it('마지막 심장은 체력이 낮을 때 회복을 줄이고 무기 재사용을 앞당긴다', () => {
    const sim = makeSim({ carryRelics: ['heart'], presetUpgrades: { mine: 1 } });
    const lowHp = sim.stats.maxHp * 0.2;
    sim.player.hp = lowHp;
    sim.relics.heal(10);
    expect(sim.player.hp).toBe(lowHp + 5);
    runUntil(sim, 2.2);
    expect(sim.weapons.devices.filter((d) => d.kind === 'mine')).toHaveLength(2);
  });

  it('이동 2초를 채우면 방랑자의 버클이 발동하고 멈추면 초기화된다', () => {
    const sim = makeSim({ carryRelics: ['buckle'] });
    expect(sim.relics.moveMultiplier(true)).toBe(1);
    sim.tick += 120;
    expect(sim.relics.moveMultiplier(true)).toBe(1.15);
    sim.relics.moveMultiplier(false);
    expect(sim.relics.moveMultiplier(true)).toBe(1);
  });

  it('결투자의 인장은 단독 대상과 군중 속 기본탄에 다르게 작용한다', () => {
    const sim = makeSim({ carryRelics: ['duel'] });
    const target = sim.spawnEnemy('chaser', sim.player.x + 75, sim.player.y);
    expect(sim.relics.damageMultiplier(target, false)).toBe(1.25);
    for (let i = 0; i < 3; i++) sim.spawnEnemy('chaser', sim.player.x - i * 20, sim.player.y + 60);
    expect(sim.relics.damageMultiplier(target, true)).toBe(0.9);
    expect(sim.relics.damageMultiplier(target, false)).toBe(1);
  });

  it('폭풍의 왕관은 무기가 없을 때 피해를 높이고, 획득 후 번개를 최대 여섯 번 연결한다', () => {
    const sim = makeSim({ carryRelics: ['crown'], presetUpgrades: { mark: 2 } });
    const enemies = Array.from({ length: 6 }, (_, i) => sim.spawnEnemy('chaser', sim.player.x + 80 + i * 60, sim.player.y));
    enemies.forEach((e) => { e.hp = e.maxHp = 1000; });
    expect(sim.relics.damageMultiplier(enemies[0], false)).toBe(1.05);
    sim.stacks.chain = 1;
    expect(sim.relics.damageMultiplier(enemies[0], false)).toBe(1);
    sim.step(IDLE_INPUT);
    expect(sim.weapons.effects.some((fx) => fx.kind === 'chain' && fx.points.length === 7)).toBe(true);
    expect(enemies.every((enemy) => enemy.hp < enemy.maxHp)).toBe(true);
    // 맞힌 적마다 그 자리에서 폭발 (반경 54)
    expect(sim.weapons.effects.filter((fx) => fx.kind === 'chain' && fx.radius === 54)).toHaveLength(6);
  });

  it('별의 닻은 중력 구체를 제자리에 유지하고, 크기와 끌어오는 힘을 50% 키운다', () => {
    const pull = (relic: boolean) => {
      const sim = makeSim({ carryRelics: relic ? ['anchor'] : [], presetUpgrades: { gravity: 1 } });
      const enemy = sim.spawnEnemy('chaser', sim.player.x + 100, sim.player.y);
      enemy.hp = enemy.maxHp = 1000;
      enemy.speed = 0;
      const x = sim.player.x;
      runUntil(sim, 0.5);
      return { sim, x, device: sim.weapons.devices.find((d) => d.kind === 'gravity')!, moved: x + 100 - enemy.x };
    };
    const base = pull(false);
    const anchored = pull(true);
    expect(anchored.device.x).toBe(anchored.x);
    expect(anchored.device.r).toBeCloseTo(base.device.r * 1.5);
    expect(anchored.moved).toBeGreaterThan(base.moved);
  });

  it('틈새의 거울은 잔영이 양방향으로 사격하게 한다', () => {
    const sim = makeSim({ carryRelics: ['mirror'], presetUpgrades: { echo: 1 } });
    sim.player.aim = 0;
    sim.weapons.onShot();
    sim.weapons.onShot();
    runUntil(sim, 0.4);
    const shots = sim.playerShots.filter((shot) => shot.source === 'echo');
    expect(shots).toHaveLength(2);
    expect(shots[0].vx).toBeCloseTo(-shots[1].vx);
  });

  it('두 번째 도화선은 지뢰 폭발 자리에 2초간 장판을 남겨 초당 폭발 피해의 10%를 준다', () => {
    const sim = makeSim({ carryRelics: ['fuse'], presetUpgrades: { mine: 1 }, god: true });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 27, sim.player.y);
    enemy.hp = enemy.maxHp = 1e6;
    enemy.speed = 0;
    runUntil(sim, 0.5);
    expect(sim.weapons.mineFields).toHaveLength(1);
    expect(sim.weapons.devices.some((d) => d.kind === 'mine' && d.secondary)).toBe(false); // 작은 지뢰는 더 이상 없음
    // 기본 사격 피해와 섞이지 않도록 '지뢰' 피해 기록만 비교한다
    const blast = sim.damageByAttack.mine ?? 0;
    expect(blast).toBeGreaterThan(0);
    sim.player.x -= 400; // 새 지뢰가 이 적 옆에 다시 깔리지 않도록 멀리 이동
    runUntil(sim, 2.6);
    const fieldDamage = (sim.damageByAttack.mine ?? 0) - blast;
    expect(fieldDamage / blast).toBeCloseTo(0.2, 2); // 2초 × 초당 10%
    expect(sim.weapons.mineFields).toHaveLength(0);
  });

  it('틈새의 거울: 잔영 탄으로 처치하면 그 자리에서 잔영이 한 번 더 발동하고, 다시 연쇄되지는 않는다', () => {
    const sim = makeSim({ carryRelics: ['mirror'], presetUpgrades: { echo: 1 }, god: true });
    const victim = sim.spawnEnemy('chaser', sim.player.x + 200, sim.player.y);
    victim.hp = 1;
    victim.speed = 0;
    sim.playerShots.push({ x: victim.x - 20, y: victim.y, vx: 620, vy: 0, r: 5, damage: 50, life: 1, source: 'echo' });
    sim.step(IDLE_INPUT);
    expect(victim.dead).toBe(true);
    const repeats = sim.playerShots.filter((s) => s.echoRepeat);
    expect(repeats).toHaveLength(2); // 양방향
    // 다시 발동한 잔영으로 처치해도 더 이상 생기지 않는다
    const next = sim.spawnEnemy('chaser', repeats[0].x + 10, repeats[0].y);
    next.hp = 1;
    next.speed = 0;
    sim.step(IDLE_INPUT);
    expect(sim.playerShots.filter((s) => s.echoRepeat).length).toBeLessThanOrEqual(2);
  });

  it('용광로의 신발끈: 같은 불길에 1초 이상 머문 적은 2초간 화상 피해를 받는다', () => {
    const sim = makeSim({ carryRelics: ['laces'], presetUpgrades: { flame: 1 }, god: true });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 10, sim.player.y);
    enemy.hp = enemy.maxHp = 1e6;
    enemy.speed = 0;
    runUntil(sim, 1.2);
    expect((sim.weapons as any).burns.has(enemy)).toBe(true);
    // 불길에서 벗어난 뒤에도 2초 동안 화상 피해가 들어간다
    enemy.x += 600;
    const hp = enemy.hp;
    runUntil(sim, 2.5);
    expect(enemy.hp).toBeLessThan(hp);
    runUntil(sim, 4);
    expect((sim.weapons as any).burns.has(enemy)).toBe(false);
  });

  it('불길에 머무는 적을 둔화시키고 장벽에 닿은 적을 잠시 멈춘다', () => {
    const sim = makeSim({ carryRelics: ['laces', 'nail'], presetUpgrades: { flame: 1, barrier: 1 }, god: true });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 28, sim.player.y);
    enemy.hp = enemy.maxHp = 1000;
    enemy.speed = 0;
    sim.step(IDLE_INPUT);
    expect(enemy.fireSlowUntil).toBeGreaterThan(sim.elapsed);
    sim.step({ ...IDLE_INPUT, moveX: 1, dodge: true });
    runUntil(sim, 0.45);
    expect(enemy.rootedUntil).toBeGreaterThan(sim.elapsed);
  });
});

it('위험 유물의 경험치 보너스가 합산되고 피의 계약은 받는 피해를 늘린다', () => {
  const sim = makeSim({ carryRelics: ['swarm', 'bloodPrice', 'elitePact'] });
  sim.gainXp(3);
  expect(sim.xp).toBeCloseTo(5.7);
  sim.hurtPlayer(10, 'test');
  expect(sim.player.hp).toBeCloseTo(sim.relics.maxHp - 12.5);
});

it('군집의 북은 일반 스폰을 늘리고 수호자 인장은 예약된 수호자를 하나 더 생성한다', () => {
  const base = makeSim({ startTime: 119.5, god: true });
  const relics = makeSim({ startTime: 119.5, god: true, carryRelics: ['swarm', 'elitePact'] });
  runUntil(base, 130);
  runUntil(relics, 130);
  expect(base.spawnLog.filter((entry) => entry.kind === 'elite')).toHaveLength(1);
  expect(relics.spawnLog.filter((entry) => entry.kind === 'elite')).toHaveLength(2);
  expect(relics.spawnLog.filter((entry) => entry.kind !== 'elite').length).toBeGreaterThan(base.spawnLog.filter((entry) => entry.kind !== 'elite').length);
});

it('승리 후 미선택 유물은 선택 가능 목록 전체를 저장한다', () => {
  const draft = ['oath', 'buckle', 'crown', 'anchor', 'heart'];
  const data = parseSave(JSON.stringify({ ...defaultSave(), pendingRelicDraft: [...draft, 'bogus', 'oath'] })).data;
  expect(data.pendingRelicDraft).toEqual(draft);
  expect(data.relicCarry).toBeUndefined();
});

describe('초반 전투 유물', () => {
  it('철심 탄환은 시작부터 앞뒤 적 둘을 같은 기본탄으로 맞힌다', () => {
    const sim = makeSim({ carryRelics: ['awl'] });
    const enemies = [55, 100, 145].map((offset) => {
      const e = sim.spawnEnemy('chaser', sim.player.x + offset, sim.player.y);
      e.speed = 0;
      e.hp = e.maxHp = 100;
      return e;
    });
    sim.step(IDLE_INPUT);
    expect(sim.playerShots[0].pierceLeft).toBe(1);
    sim.player.fireCd = 999;
    runUntil(sim, 0.3);
    expect(enemies.map((e) => e.maxHp - e.hp)).toEqual([sim.stats.damage, sim.stats.damage, 0]);
  });

  it('무쇠 공이와 산탄 인장의 피해 보너스는 기본탄에만 적용된다', () => {
    const sim = makeSim({ carryRelics: ['anvil', 'scatterSeal'], presetUpgrades: { chain: 1 } });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 150, sim.player.y);
    enemy.hp = enemy.maxHp = 1000;
    sim.step(IDLE_INPUT);
    expect(sim.playerShots).toHaveLength(2);
    expect(sim.playerShots[0].damage).toBeCloseTo(sim.stats.damage * 1.55 * 0.82);
    expect(sim.relics.fireRate).toBeCloseTo(sim.stats.fireRate * 0.75);
    expect(enemy.maxHp - enemy.hp).toBeCloseTo(sim.weapons.baseDamage * 1.85);
  });

  it('균열 가속기는 지뢰 설치 주기를 앞당기며 일반 회복량은 줄이지 않는다', () => {
    const sim = makeSim({ carryRelics: ['catalyst'], presetUpgrades: { mine: 1 } });
    sim.player.hp = 30;
    sim.relics.heal(4);
    expect(sim.player.hp).toBe(34);
    expect(sim.relics.shotDamage()).toBeCloseTo(sim.stats.damage * 0.75);
    runUntil(sim, 2);
    expect(sim.weapons.devices.filter((d) => d.kind === 'mine')).toHaveLength(2);
  });

  it('현상금의 매듭은 보유 이후 처치로 회복하고 매의 렌즈는 먼 적을 조준한다', () => {
    const sim = makeSim({ carryRelics: ['bountyKnot', 'hawkLens'] });
    sim.player.hp = 30;
    for (let i = 0; i < 12; i++) {
      const e = sim.spawnEnemy('chaser', sim.player.x + 250, sim.player.y);
      sim.damageEnemy(e, e.hp);
    }
    expect(sim.player.hp).toBe(34);
    const distant = sim.spawnEnemy('chaser', sim.player.x + 630, sim.player.y);
    sim.step(IDLE_INPUT);
    expect(sim.target).toBe(distant);
    expect(sim.playerShots[0].vx).toBeCloseTo(sim.stats.projectileSpeed * 1.2);
  });
});

it('삼중 선택의 인장은 판마다 한 번 보너스 3회를 열고 일반 레벨업을 소모하지 않는다', () => {
  const sim = makeSim({ carryRelics: ['tripleChoice'] });
  sim.relics.acquire('tripleChoice');
  sim.gainXp(sim.xpNeeded);
  sim.step(IDLE_INPUT);
  const tick = sim.tick;
  for (const remaining of [3, 2, 1]) {
    expect(sim.bonusOpen).toBe(true);
    expect(sim.bonusChoicesLeft).toBe(remaining);
    expect(sim.pendingLevels).toBe(1);
    expect(sim.step(IDLE_INPUT)).toBe(false);
    expect(sim.reroll()).toBe(false);
    expect(sim.choose(0)).toBe(true);
  }
  expect(sim.bonusOpen).toBe(false);
  expect(sim.bonusChoicesLeft).toBe(0);
  expect(sim.pendingLevels).toBe(1);
  expect(sim.tick).toBe(tick);
  expect(sim.picks).toHaveLength(3);
});

describe('전판 유물 제외', () => {
  it('전판에 얻은 유물은 다음 판 시작 유물(레벨 3) 선택지에 나오지 않는다', () => {
    const previous = ['awl', 'anvil', 'catalyst'] as const;
    for (let seed = 1; seed <= 20; seed++) {
      const sim = makeSim({ seed, previousRelics: [...previous] });
      while (sim.level < 3) sim.gainXp(sim.xpNeeded);
      sim.step(IDLE_INPUT);
      let opening: string[] = [];
      while (sim.phase === 'levelup') {
        const c = sim.choices[0];
        if (c.kind === 'relic' && c.source === 'opening') opening = sim.choices.map((x) => (x.kind === 'relic' ? x.id : ''));
        sim.choose(0);
      }
      expect(opening).toHaveLength(3);
      for (const id of previous) expect(opening).not.toContain(id);
    }
  });

  it('제외하면 후보가 없을 때는 제외 없이 뽑는다', () => {
    const sim = makeSim({ previousRelics: [...OPENING_RELICS] });
    while (sim.level < 3) sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    let count = 0;
    while (sim.phase === 'levelup') {
      const c = sim.choices[0];
      if (c.kind === 'relic' && c.source === 'opening') count = sim.choices.length;
      sim.choose(0);
    }
    expect(count).toBeGreaterThan(0);
  });

  it('전판 유물 목록은 저장되고, 알 수 없는 유물은 빠진다', () => {
    const raw = JSON.stringify({ ...defaultSave(), previousRelics: ['awl', 'scars', 'oath'] });
    expect(parseSave(raw).data.previousRelics).toEqual(['awl', 'oath']);
  });
});
