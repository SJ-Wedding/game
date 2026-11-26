import { describe, expect, it } from 'vitest';
import { FUSION_IDS, WEAPON_FUSIONS, type WeaponId } from '../src/config/weapons';
import { IDLE_INPUT, type InputState } from '../src/core/types';
import { makeSim } from './helpers';

function setup(id: WeaponId) {
  const sim = makeSim({ presetUpgrades: { [id]: 1 }, god: true });
  sim.player.fireCd = 999;
  function target(x: number, y = 0) {
    const enemy = sim.spawnEnemy('chaser', sim.player.x + x, sim.player.y + y);
    enemy.speed = 0;
    enemy.hp = enemy.maxHp = 1000;
    return enemy;
  }
  function advance(ticks: number, input: InputState = IDLE_INPUT) {
    for (let i = 0; i < ticks; i++) sim.step(input);
  }
  return { sim, target, advance };
}

describe('특수 무기', () => {
  it('첫 레벨업에서 일반 강화 2개와 특수 무기 1개 중 하나를 고른다', () => {
    const sim = makeSim({ seed: 7 });
    sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    expect(sim.choices).toHaveLength(3);
    const choice = sim.choices[2];
    if (choice.kind !== 'upgrade' || !choice.def.weapon) throw new Error('특수 무기 후보가 없습니다');
    expect(sim.choose(2)).toBe(true);
    expect(sim.stacks[choice.def.weapon]).toBe(1);
  });

  it('번개가 최대 4개 대상을 각각 한 번 타격한다', () => {
    const { target, advance } = setup('chain');
    const enemies = [80, 140, 200, 260, 320].map((x) => target(x));
    advance(1);
    expect(enemies.map((enemy) => enemy.hp < enemy.maxHp)).toEqual([true, true, true, true, false]);
    expect(enemies[0].hp).toBeLessThan(enemies[3].hp);
  });

  it.each([
    ['mine', 35, 28], ['orbit', 60, 1], ['axe', 115, 60],
    ['turret', 150, 1], ['flame', 33, 1], ['spear', 155, 24],
  ] as const)('%s 무기가 자동으로 피해를 준다', (id, x, ticks) => {
    const { target, advance } = setup(id);
    const enemy = target(x);
    advance(ticks);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });

  it('화염 발자국 안에 있는 플레이어는 피해 없이 주변 적을 태운다', () => {
    const sim = makeSim({ presetUpgrades: { flame: 1 }, carryRelics: ['laces'] });
    const { x, y, hp } = sim.player;
    sim.player.fireCd = Infinity;
    const enemy = sim.spawnEnemy('chaser', x + 33, y);
    enemy.speed = 0;
    enemy.hp = 1000;
    for (let i = 0; i < 100; i++) sim.step(IDLE_INPUT);
    expect(sim.player.hp).toBe(hp);
    expect(sim.damageTakenTotal).toBe(0);
    expect(sim.damageByAttack.flame).toBeGreaterThan(0);
  });

  it('설치된 지뢰는 시간이 지나도 남아 있다가 적이 접근하면 제거된다', () => {
    const { sim, target, advance } = setup('mine');
    advance(1);
    const mine = sim.weapons.devices.find((device) => device.kind === 'mine')!;
    sim.weapons.update(10);
    expect(sim.weapons.devices).toContain(mine);
    const enemy = target(20);
    advance(1);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(sim.weapons.devices).not.toContain(mine);
  });

  it('회피 경로는 같은 적에게 반복 피해를 주지 않는다', () => {
    const { target, advance } = setup('barrier');
    const enemy = target(48);
    advance(1, { ...IDLE_INPUT, moveX: 1, dodge: true });
    advance(30);
    const hp = enemy.hp;
    expect(hp).toBeLessThan(enemy.maxHp);
    advance(30);
    expect(enemy.hp).toBe(hp);
  });

  it.each([1, 2, 3])('기본탄 %d번째 명중으로 처치하면 낙뢰가 한 번 발동한다', (lethalHit) => {
    const { sim, target, advance } = setup('mark');
    const enemy = target(145);
    const nearby = target(145, 44);
    enemy.hp = lethalHit * 4;
    for (let i = 0; i < lethalHit; i++) {
      sim.playerShots.push({ x: enemy.x, y: enemy.y, vx: 0, vy: 0, r: 4, damage: 4, life: 1, source: 'player' });
      advance(1);
    }
    expect(enemy.dead).toBe(true);
    expect(nearby.hp).toBeLessThan(nearby.maxHp);
    expect(sim.damageByAttack.basic).toBe(lethalHit * 4);
    const strikes = sim.weapons.effects.filter((effect) => effect.kind === 'mark' && !effect.variant);
    expect(strikes).toHaveLength(1);
    expect(strikes[0].points).toEqual([{ x: enemy.x, y: enemy.y }, { x: nearby.x, y: nearby.y }]);
  });

  it('낙뢰는 생존한 적에게 기본탄이 세 번 적중할 때마다 발동한다', () => {
    const { sim, target } = setup('mark');
    const enemy = target(145);
    sim.damageEnemy(enemy, 1, 'basic');
    sim.damageEnemy(enemy, 1, 'echo');
    sim.damageEnemy(enemy, 1, 'basic');
    expect(sim.damageByAttack.mark).toBeUndefined();
    sim.damageEnemy(enemy, 1, 'basic');
    expect(sim.damageByAttack.mark).toBeGreaterThan(0);
    const damage = sim.damageByAttack.mark;
    sim.damageEnemy(enemy, 1, 'basic');
    sim.damageEnemy(enemy, 1000, 'echo');
    expect(sim.damageByAttack.mark).toBe(damage);
  });

  it('이전 사격 위치에서 잔영이 먼저 나타나고 추가탄을 쏜다', () => {
    const { sim, target, advance } = setup('echo');
    target(280);
    sim.player.fireCd = 0;
    const shotOrigin = sim.player.x;
    advance(1);
    expect(sim.weapons.effects.find((effect) => effect.variant === 'echoCharge')?.points[0].x).toBe(shotOrigin);
    expect(sim.playerShots.some((shot) => shot.source === 'echo')).toBe(false);
    advance(Math.ceil(0.36 * 60) + 4);
    const echo = sim.playerShots.find((shot) => shot.source === 'echo');
    expect(echo?.x).toBeGreaterThan(shotOrigin);
    expect(echo?.x).toBeLessThan(shotOrigin + 70);
  });

  it('서리 포탑 포신과 탄도 연출이 둔화된 적을 향한다', () => {
    const { sim, target, advance } = setup('turret');
    const enemy = target(-110, 70);
    advance(1);
    const turret = sim.weapons.devices.find((device) => device.kind === 'turret')!;
    expect(turret.angle).toBeCloseTo(Math.atan2(enemy.y - turret.y, enemy.x - turret.x));
    const shot = sim.weapons.effects.find((effect) => effect.kind === 'turret');
    expect(shot?.points).toEqual([{ x: turret.x, y: turret.y }, { x: enemy.x, y: enemy.y }]);
    expect(enemy.slowUntil).toBeGreaterThan(sim.elapsed);
  });

  it('중력 구체가 적을 끌어온 뒤 피해를 준다', () => {
    const { target, advance } = setup('gravity');
    target(130); // 첫 구체가 수평으로 출발하도록 가장 가까운 적을 둔다.
    const enemy = target(189, 95);
    const initialY = enemy.y;
    advance(105);
    expect(enemy.y).toBeLessThan(initialY - 30);
    advance(16);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });

  it('감염된 적이 사망하면 주변 적이 감염된다', () => {
    const { sim, target, advance } = setup('infection');
    const first = target(100);
    const second = target(175);
    const outside = target(400);
    advance(1);
    expect(sim.weapons.infected.has(first)).toBe(true);
    sim.damageEnemy(first, 1000);
    advance(1);
    expect(sim.weapons.infected.has(second)).toBe(true);
    expect(second.hp).toBeLessThan(second.maxHp);
    expect(sim.weapons.infected.has(outside)).toBe(false);
    expect(sim.weapons.effects.filter((effect) => effect.kind === 'infection' && effect.points.length > 1)
      .map((effect) => effect.points)).toEqual([[{ x: first.x, y: first.y }, { x: second.x, y: second.y }]]);
  });
});

describe('무기 강화의 추가 효과', () => {
  it('강화한 연쇄 번개는 한 단계마다 한 마리 더 타격한다', () => {
    for (const rank of [2, 3]) {
      const sim = makeSim({ presetUpgrades: { chain: rank } });
      sim.player.fireCd = 999;
      const enemies = Array.from({ length: 7 }, (_, i) => sim.spawnEnemy('chaser', sim.player.x + 70 + i * 55, sim.player.y));
      for (const enemy of enemies) enemy.hp = enemy.maxHp = 1000;
      sim.step(IDLE_INPUT);
      expect(enemies.filter((enemy) => enemy.hp < enemy.maxHp)).toHaveLength(rank + 3);
    }
  });

  it('Lv 3 지뢰는 1.8초 주기로 설치되고 이전 지뢰가 남는다', () => {
    const sim = makeSim({ presetUpgrades: { mine: 3 } });
    for (let i = 0; i < 112; i++) sim.step(IDLE_INPUT);
    expect(sim.weapons.devices.filter((d) => d.kind === 'mine')).toHaveLength(2);
  });

  it('Lv 3 회전 칼날은 4개를 만들고 메아리는 한 번에 한 발을 쏜다', () => {
    const sim = makeSim({ presetUpgrades: { orbit: 3, echo: 3 } });
    sim.weapons.onShot();
    sim.weapons.onShot();
    for (let i = 0; i < 30; i++) sim.step(IDLE_INPUT);
    expect(sim.weapons.blades).toHaveLength(4);
    expect(sim.playerShots.filter((shot) => shot.source === 'echo')).toHaveLength(1);
  });

  it('Lv 3 화염 발자국은 기존 반경 밖의 적까지 타격한다', () => {
    const sim = makeSim({ presetUpgrades: { flame: 3 } });
    sim.player.fireCd = 999;
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 49, sim.player.y);
    sim.step(IDLE_INPUT);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
  });

  it('몬스터마다 다른 값의 경험치 보석을 떨어뜨린다', () => {
    const sim = makeSim();
    for (const kind of ['chaser', 'spitter', 'charger', 'elite'] as const) {
      const enemy = sim.spawnEnemy(kind, 1000, 1000);
      sim.damageEnemy(enemy, 1e6);
    }
    expect(sim.gems.map((gem) => gem.value)).toEqual([1, 3, 4, 40]);
  });
});

describe('특수 무기 합체', () => {
  it('정해진 재료가 둘 다 최대 레벨일 때만 합체 카드가 나오며 한 번만 선택할 수 있다', () => {
    const sim = makeSim({ seed: 7, presetLevel: 8, presetUpgrades: { chain: 3, mark: 2, axe: 3 } });
    const nextLevel = () => {
      sim.gainXp(sim.xpNeeded);
      sim.step(IDLE_INPUT);
    };
    nextLevel();
    expect(sim.choices.some((c) => c.kind === 'fusion')).toBe(false);
    const mark = sim.choices.findIndex((c) => c.kind === 'upgrade' && c.def.id === 'mark');
    expect(mark).toBeGreaterThanOrEqual(0);
    sim.choose(mark);
    nextLevel();
    expect(sim.choices[0]).toEqual({ kind: 'fusion', id: 'storm' });
    expect(sim.choose(0)).toBe(true);
    expect(sim.weapons.fusions.has('storm')).toBe(true);
    expect(sim.stacks.chain).toBe(3);
    expect(sim.stacks.mark).toBe(3);
    if (sim.phase === 'levelup') sim.choose(0); // 레벨 10 유물
    nextLevel();
    expect(sim.choices.some((c) => c.kind === 'fusion')).toBe(false);
    expect(sim.choices.some((c) => c.kind === 'upgrade' && (c.def.id === 'chain' || c.def.id === 'mark'))).toBe(false);
  });

  it.each(FUSION_IDS.filter((id) => id !== 'tempest'))('%s 합체는 재료 공격을 제거하고 주기적으로 합체 피해를 준다', (id) => {
    const recipe = WEAPON_FUSIONS[id];
    const [a, b] = recipe.pair;
    const sim = makeSim({ presetUpgrades: { [a]: 3, [b]: 3 } });
    const { x, y } = sim.player;
    const target = sim.spawnEnemy('chaser', x + 120, y);
    const outside = sim.spawnEnemy('chaser', x + 120, y + recipe.radius + 50);
    target.hp = outside.hp = 1000;
    sim.weapons.update(1 / 60);
    target.hp = outside.hp = 1000;
    expect(sim.weapons.fuse(id)).toBe(true);
    expect(sim.weapons.fuse(id)).toBe(false);
    expect(sim.weapons.blades).toHaveLength(0);
    expect(sim.weapons.infected.size).toBe(0);
    expect(sim.weapons.devices).toHaveLength(0);
    expect(sim.weapons.effects).toHaveLength(0);
    const legacy = { ...sim.damageByAttack };
    sim.weapons.onBulletHit(target);
    sim.weapons.onShot();
    sim.weapons.update(1 / 60);
    expect(sim.weapons.effects[0]).toMatchObject({ kind: id, variant: 'resonance', radius: recipe.radius });
    expect(target.hp).toBeCloseTo(1000 - sim.weapons.baseDamage * recipe.damage * 1.25);
    expect(outside.hp).toBe(1000);
    const hp = target.hp;
    sim.weapons.update(1 / 60);
    expect(target.hp).toBe(hp);
    sim.tick += Math.ceil(recipe.interval * 60) + 1;
    sim.weapons.update(1 / 60);
    expect(target.hp).toBeLessThan(hp);
    expect(sim.damageByAttack[a]).toBe(legacy[a]);
    expect(sim.damageByAttack[b]).toBe(legacy[b]);
    expect(sim.weapons.devices).toHaveLength(0);
    expect(sim.weapons.effects.every((effect) => effect.kind === id)).toBe(true);
  });

  it('쌍날 폭풍이 300px 밖 표적을 왕복 타격하고 이동한 플레이어에게 돌아온다', () => {
    const sim = makeSim({ presetUpgrades: { orbit: 3, axe: 3 } });
    sim.player.fireCd = Infinity;
    const { x, y } = sim.player;
    const target = sim.spawnEnemy('chaser', x + 300, y);
    target.hp = 3000;
    target.speed = 0;
    expect(sim.weapons.fuse('tempest')).toBe(true);
    for (let i = 0; i < 35; i++) sim.step(IDLE_INPUT);
    const flight = sim.weapons.tempestFlights[0];
    expect(flight.returning).toBe(true);
    expect(sim.hitsByAttack.tempest).toBe(2);
    sim.player.y += 130;
    for (let i = 0; i < 29; i++) sim.step(IDLE_INPUT);
    expect(flight.y).toBeGreaterThan(y);
    expect(sim.weapons.tempestFlights).toHaveLength(0);
    expect(sim.damageByAttack.tempest).toBeCloseTo(sim.weapons.baseDamage * WEAPON_FUSIONS.tempest.damage * 1.25 * 1.75);
    expect(sim.damageByAttack.orbit).toBeUndefined();
    expect(sim.damageByAttack.axe).toBeUndefined();
  });

  it('쌍날 폭풍이 쌍월 톱니의 칼날과 귀환의 고리의 확대 효과를 계승한다', () => {
    const sim = makeSim({ presetUpgrades: { orbit: 3, axe: 3 }, carryRelics: ['cog', 'returnRing'] });
    sim.player.fireCd = Infinity;
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 180, sim.player.y);
    enemy.hp = 2500;
    enemy.speed = 0;
    sim.weapons.fuse('tempest');
    sim.step(IDLE_INPUT);
    const flight = sim.weapons.tempestFlights[0];
    expect(flight.bladeCount).toBe(3);
    expect(flight.baseRadius).toBeCloseTo(WEAPON_FUSIONS.tempest.radius * 1.2);
    for (let i = 0; i < 24; i++) sim.step(IDLE_INPUT);
    expect(flight.returning).toBe(true);
    expect(flight.radius).toBeGreaterThan(flight.baseRadius * 1.5);
  });

  it('잔영 관통포가 예약된 잔영과 이미 발사한 잔영탄을 교체하고 먼 적을 관통한다', () => {
    const sim = makeSim({ presetUpgrades: { echo: 3, spear: 3 } });
    const { x, y } = sim.player;
    const first = sim.spawnEnemy('chaser', x + 120, y);
    const distant = sim.spawnEnemy('chaser', x + 480, y);
    first.hp = distant.hp = 1000;
    sim.weapons.onShot();
    sim.weapons.update(1 / 60);
    expect(sim.weapons.effects.some((effect) => effect.variant === 'echoCharge')).toBe(true);
    sim.playerShots.push({ x, y, vx: 620, vy: 0, r: 5, damage: 10, life: 1, source: 'echo' });
    expect(sim.weapons.fuse('volley')).toBe(true);
    expect(sim.playerShots).toHaveLength(0);
    sim.tick += 30;
    sim.weapons.update(1 / 60);
    expect(sim.playerShots).toHaveLength(0);
    expect(distant.hp).toBeLessThan(1000);
  });

  it('합체 피해는 두 재료의 등급 보너스 평균과 재료 유물을 반영한다', () => {
    const sim = makeSim({ presetUpgrades: { chain: 3, mark: 3 } });
    sim.picks.find((pick) => pick.id === 'chain')!.grade = 'legendary';
    sim.relics.acquire('crown');
    const target = sim.spawnEnemy('chaser', sim.player.x + 150, sim.player.y);
    target.hp = 1000;
    expect(sim.weapons.fuse('storm')).toBe(true);
    sim.weapons.update(1 / 60);
    expect(sim.damageByAttack.storm).toBeCloseTo(sim.weapons.baseDamage * WEAPON_FUSIONS.storm.damage * 1.25 * 1.12 * 1.15 * 0.75);
  });

  it('뇌광 연쇄가 종의 빠른 주기와 왕관의 추가 연쇄를 계승한다', () => {
    const sim = makeSim({ presetUpgrades: { chain: 3, mark: 3 }, carryRelics: ['secondBell', 'crown'] });
    const { x, y } = sim.player;
    sim.spawnEnemy('chaser', x + 100, y).hp = 1000;
    const extra = sim.spawnEnemy('chaser', x + 300, y);
    extra.hp = 1000;
    sim.weapons.fuse('storm');
    sim.weapons.update(1 / 60);
    expect(extra.hp).toBeLessThan(1000);
    expect(sim.weapons.effects[0].radius).toBeCloseTo(WEAPON_FUSIONS.storm.radius * 0.75);
    sim.tick += 58;
    sim.weapons.update(1 / 60);
    expect(sim.hitsByAttack.storm).toBe(4);
  });

  it('빙결 지뢰진이 겨울 등불의 이중 폭발과 도화선의 장판을 계승한다', () => {
    const sim = makeSim({ presetUpgrades: { mine: 3, turret: 3 }, carryRelics: ['winterLantern', 'fuse'] });
    const { x, y } = sim.player;
    const targets = [120, 410].map((offset) => sim.spawnEnemy('chaser', x + offset, y));
    targets.forEach((enemy) => { enemy.hp = 1000; });
    sim.weapons.fuse('bastion');
    sim.weapons.update(1 / 60);
    expect(targets.every((enemy) => enemy.hp < 1000)).toBe(true);
    expect(sim.weapons.mineFields.filter((field) => field.fusion === 'bastion')).toHaveLength(2);
    const hits = sim.hitsByAttack.bastion!;
    sim.tick += 31;
    sim.weapons.update(1 / 60);
    expect(sim.hitsByAttack.bastion).toBe(hits + 2);
    expect(sim.hitsByAttack.mine).toBeUndefined();
  });

  it('잿불 균열이 신발끈의 화상과 못의 이동 봉쇄를 계승한다', () => {
    const sim = makeSim({ presetUpgrades: { flame: 3, barrier: 3 }, carryRelics: ['laces', 'nail'] });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 130, sim.player.y);
    enemy.hp = 1000;
    sim.weapons.fuse('inferno');
    sim.weapons.update(1 / 60);
    expect(enemy.rootedUntil).toBe(0.8);
    expect(sim.weapons.afflicted(enemy)).toBe(true);
    sim.tick += 28;
    sim.weapons.update(1 / 60);
    expect(sim.hitsByAttack.inferno).toBe(2);
    expect(sim.hitsByAttack.flame).toBeUndefined();
  });

  it('잔영 관통포가 조준 지연과 양방향 포격, 분기 포격을 계승한다', () => {
    const sim = makeSim({ presetUpgrades: { spear: 3, echo: 3 }, carryRelics: ['constellation', 'mirror'] });
    const { x, y } = sim.player;
    const targets = [[100, 0], [-140, 0], [210, 0], [300, 0], [420, 64]].map(([dx, dy]) => sim.spawnEnemy('chaser', x + dx, y + dy));
    targets.forEach((enemy) => { enemy.hp = 1000; });
    sim.weapons.fuse('volley');
    sim.weapons.update(1 / 60);
    expect(sim.hitsByAttack.volley).toBeUndefined();
    sim.tick += 18;
    sim.weapons.update(1 / 60);
    expect(targets.every((enemy) => enemy.hp < 1000)).toBe(true);
    expect(sim.weapons.effects.filter((effect) => effect.kind === 'volley')).toHaveLength(4);
  });

  it('검은 역병이 닻의 넓은 흡인과 항아리의 추가 전염을 계승한다', () => {
    const sim = makeSim({ presetUpgrades: { gravity: 3, infection: 3 }, carryRelics: ['anchor', 'plagueJar'] });
    const { x, y } = sim.player;
    const targets = [100, 350, 460, 520].map((offset) => sim.spawnEnemy('chaser', x + offset, y));
    targets.forEach((enemy) => { enemy.hp = 1000; });
    sim.weapons.fuse('eclipse');
    sim.weapons.update(1 / 60);
    expect(sim.weapons.effects[0].radius).toBe(WEAPON_FUSIONS.eclipse.radius * 1.5);
    expect(targets[1].x).toBeCloseTo(x + 237.5);
    expect(sim.hitsByAttack.eclipse).toBe(4);
  });

  it('빙결 지뢰진으로 합체하면 남은 지뢰 장판을 지우고 나침반 회피도 합체기로 발동한다', () => {
    const sim = makeSim({ presetUpgrades: { mine: 3, turret: 3 }, carryRelics: ['fuse', 'compass'], god: true });
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 23, sim.player.y);
    enemy.hp = enemy.maxHp = 2000;
    enemy.speed = 0;
    for (let i = 0; i < 28; i++) sim.step(IDLE_INPUT);
    expect(sim.weapons.mineFields.length).toBeGreaterThan(0);
    expect(sim.weapons.fuse('bastion')).toBe(true);
    expect(sim.weapons.mineFields).toHaveLength(0);
    const before = sim.damageByAttack.mine;
    sim.step(IDLE_INPUT);
    const firstBlast = sim.damageByAttack.bastion!;
    sim.weapons.onDodge();
    sim.step(IDLE_INPUT);
    expect(sim.damageByAttack.bastion).toBeGreaterThan(firstBlast);
    expect(sim.damageByAttack.mine).toBe(before);
    expect(sim.weapons.devices).toHaveLength(0);
  });
});

it('무기 등급 보너스는 해당 무기의 전투 피해에만 누적된다', () => {
  const measure = (grade: 'common' | 'legendary') => {
    const sim = makeSim({ presetUpgrades: { chain: 2 } });
    sim.picks[1] = { id: 'chain', grade };
    const enemy = sim.spawnEnemy('chaser', sim.player.x + 120, sim.player.y);
    enemy.hp = enemy.maxHp = 1000;
    sim.step(IDLE_INPUT);
    return { weaponDamage: enemy.maxHp - enemy.hp, basicDamage: sim.playerShots[0].damage };
  };
  const common = measure('common');
  const legendary = measure('legendary');
  expect(legendary.weaponDamage).toBeCloseTo(common.weaponDamage * 1.2);
  expect(legendary.basicDamage).toBe(common.basicDamage);
});

it('7분 기본탄은 화면 밖 적을 겨누며 일반 적을 관통한다', () => {
  const sim = makeSim({ startTime: 420, god: true });
  const { x, y } = sim.player;
  const far = sim.spawnEnemy('chaser', x + 900, y);
  far.speed = 0;
  sim.step(IDLE_INPUT);
  expect(sim.target).toBe(far);
  expect(sim.playerShots[0].pierceLeft).toBe(2);
  expect(sim.playerShots[0].life * sim.stats.projectileSpeed).toBeGreaterThan(900);
  const targets = [60, 100, 145].map((offset) => sim.spawnEnemy('chaser', x + offset, y));
  for (const enemy of targets) {
    enemy.hp = enemy.maxHp = 1000;
    enemy.speed = 0;
  }
  sim.player.fireCd = 999;
  for (let i = 0; i < 22; i++) sim.step(IDLE_INPUT);
  expect(targets.map((enemy) => enemy.maxHp - enemy.hp)).toEqual([sim.stats.damage, sim.stats.damage, sim.stats.damage]);
});

it('엘리트 무기 보상은 준비된 합체를 제시하고 일반 레벨업 몫을 차감하지 않는다', () => {
  const sim = makeSim({ presetUpgrades: { chain: 3, mark: 3 } });
  sim.gainXp(sim.xpNeeded);
  const elite = sim.spawnEnemy('elite', 900, 900);
  sim.damageEnemy(elite, 1e6);
  sim.step(IDLE_INPUT);
  expect(sim.choices[0].kind).toBe('relic');
  sim.choose(0);
  expect(sim.armoryOpen).toBe(true);
  expect(sim.choices[0]).toEqual({ kind: 'fusion', id: 'storm' });
  sim.choose(0);
  expect(sim.weapons.fusions.has('storm')).toBe(true);
  expect(sim.pendingLevels).toBe(1);
  expect(sim.armoryOpen).toBe(false);
  expect(sim.choices[0].kind).toBe('upgrade');
});

it('메아리의 Lv 3은 Lv 1보다 빠르게 한 발씩 발사한다', () => {
  const fireTicks = (rank: number) => {
    const sim = makeSim({ presetUpgrades: { echo: rank } });
    const times: number[] = [];
    for (let i = 0; i < 160; i++) {
      if (i % 40 === 0) sim.weapons.onShot();
      sim.step(IDLE_INPUT);
      if (sim.playerShots.some((s) => s.source === 'echo')) {
        times.push(sim.tick);
        sim.playerShots.length = 0;
      }
    }
    return times;
  };
  const base = fireTicks(1);
  const upgraded = fireTicks(3);
  expect((base[1] - base[0]) / 60).toBeCloseTo(1.25, 1);
  expect((upgraded[1] - upgraded[0]) / 60).toBeCloseTo(0.75, 1);
  expect(upgraded.length).toBeGreaterThan(base.length);
});

it('처치 전염과 서리 포탑은 하향된 기본 피해를 기록한다', () => {
  for (const [id, multiplier] of [['infection', 0.75], ['turret', 1.35 * 0.86]] as const) {
    const sim = makeSim({ presetUpgrades: { [id]: 1 } });
    const target = sim.spawnEnemy('chaser', sim.player.x + 130, sim.player.y);
    target.hp = target.maxHp = 1000;
    sim.step(IDLE_INPUT);
    expect(sim.damageByAttack[id]).toBeCloseTo(sim.weapons.baseDamage * multiplier);
  }
});

it('공격별 피해에 저항과 초과 피해를 반영하고 쓰러진 적이나 무적 보스는 집계에서 제외한다', () => {
  const sim = makeSim({ startTime: 810, god: true });
  const target = sim.spawnEnemy('charger', 900, 900);
  target.hp = 15;
  sim.damageEnemy(target, 10, 'basic');
  sim.damageEnemy(target, 1000, 'echo');
  sim.damageEnemy(target, 1000, 'chain');
  sim.damageBoss(1000, 'storm');
  expect(sim.damageByAttack.basic).toBeCloseTo(0.842246);
  expect(sim.damageByAttack.echo).toBeCloseTo(140.625);
  expect(Object.keys(sim.damageByAttack)).toEqual(['basic', 'echo']);
  const boss = sim.boss!;
  boss.state = 'idle';
  boss.hp = 100;
  sim.damageBoss(200, 'storm');
  sim.damageBoss(1000, 'chain');
  sim.step(IDLE_INPUT);
  expect(boss.hp).toBe(0);
  expect(sim.result?.damageByAttack).toEqual({ basic: expect.closeTo(0.842246), echo: expect.closeTo(140.625), storm: 200 });
  expect(sim.result?.combatTime).toBeCloseTo(1 / 60);
});
