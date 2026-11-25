import { describe, expect, it } from 'vitest';
import { SWORD, SWORD_FORMS, SWORD_FORM_IDS, type Loadout, type SwordFormId } from '../src/config/characters';
import { MASTERY_UPGRADES, UPGRADE_BY_ID, type UpgradeId } from '../src/config/upgrades';
import { rollRelics } from '../src/core/relics';
import { Rng } from '../src/core/rng';
import { GameSim } from '../src/core/sim';
import { IDLE_INPUT, type Projectile } from '../src/core/types';
import { upgradeAvailable } from '../src/core/upgrades';

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
    expect(sim.mastery(id)).toBe(6.5);
    expect(sim.swordRange).toBe(Math.min(SWORD.maxRange, baseRange * (1 + 0.12 * 6.5)));
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

  it('루멘 번개는 첫 대상에게는 짧게 닿고 다음 대상까지 두 배 거리로 튄다', () => {
    const sim = new GameSim({ seed: 13, god: true, loadout: chain });
    const first = makeTarget(sim, 215);
    sim.step(IDLE_INPUT);
    expect(sim.damageByAttack.chain).toBeUndefined();

    first.x = sim.player.x + 200;
    const far = makeTarget(sim, 455);
    sim.step(IDLE_INPUT);
    expect(first.hp).toBeLessThan(1000);
    expect(far.hp).toBeLessThan(1000);
    expect(sim.hitsByAttack.chain).toBe(4);
  });

  it('루멘 번개는 같은 대상에게 돌아올 때 이전 적중 횟수만큼 피해를 줄이고 재연쇄 이펙트를 기록한다', () => {
    const sim = new GameSim({ seed: 13, god: true, loadout: chain, presetUpgrades: { chainLinks: 6 } });
    const first = makeTarget(sim, 90);
    const second = makeTarget(sim, 190);
    sim.step(IDLE_INPUT);
    const base = sim.stats.damage * 1.85 * sim.starterDamageMultiplier;
    const repeatDamage = [1, 0.3, 0.25, 0.2, 0.2];
    const expected = (offset: number) => base * repeatDamage.reduce((sum, factor, i) => sum + factor * Math.max(0.4, 0.76 ** (i * 2 + offset)), 0);
    expect(1000 - first.hp).toBeCloseTo(expected(0));
    expect(1000 - second.hp).toBeCloseTo(expected(1));
    expect(sim.hitsByAttack.chain).toBe(10);
    const effect = sim.weapons.effects.find((fx) => fx.kind === 'chain');
    expect(effect?.variant !== 'resonance' && effect?.reboundCounts).toEqual([0, 0, 0, 1, 1, 2, 2, 3, 3, 4, 4]);
  });

  it('루멘 번개는 처음 맞히는 적을 우선하고, 대상 하나만 있으면 한 번 타격한다', () => {
    const sim = new GameSim({ seed: 13, god: true, loadout: chain });
    const ordered = [80, 125, 340, 560].map((x) => makeTarget(sim, x));
    sim.step(IDLE_INPUT);
    expect(ordered.every((enemy) => enemy.hp < 1000)).toBe(true);
    const effect = sim.weapons.effects.find((fx) => fx.kind === 'chain');
    expect(effect?.variant !== 'resonance' && effect?.reboundCounts).toEqual([0, 0, 0, 0, 0]);

    const isolated = new GameSim({ seed: 13, god: true, loadout: chain });
    makeTarget(isolated, 80);
    isolated.step(IDLE_INPUT);
    expect(isolated.hitsByAttack.chain).toBe(1);
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

  it('화살막이 검집은 투사체를 조준하지 않고 적을 벨 때 검격에 닿은 탄만 지운다', () => {
    const sim = new GameSim({ seed: 25, god: true, loadout: roan, carryRelics: ['swordScabbard'] });
    const outOfArc = makeShot(sim, 0, -26);
    const inArc = makeShot(sim, 40, 0);
    sim.enemyShots.push(outOfArc, inArc);

    sim.step(IDLE_INPUT);
    expect(sim.target).toBeNull();
    expect(sim.swordSwings).toBe(0);
    expect(sim.enemyShots).toEqual([outOfArc, inArc]);

    const enemy = makeTarget(sim, 75);
    sim.step(IDLE_INPUT);
    expect(sim.target).toBe(enemy);
    expect(sim.player.facing).toBe('east');
    expect(sim.swordSwings).toBe(1);
    expect(enemy.hp).toBeLessThan(enemy.maxHp);
    expect(sim.enemyShots).toEqual([outOfArc]);
    expect(sim.swordSweep?.blocked).toEqual([{ x: inArc.x, y: inArc.y }]);
  });

  it('로안은 6레벨에 공격 타입 5종 중 하나만 고르고, 12·18레벨에는 형태 선택이 없다', () => {
    const sim = new GameSim({ seed: 21, god: true, loadout: roan });
    makeTarget(sim, 65);
    const swing = (forms: (SwordFormId | undefined)[]) => {
      sim.player.fireCd = 0;
      sim.step(IDLE_INPUT);
      const current = sim.swordSweeps.filter((sweep) => sweep.at === sim.elapsed);
      expect(current.map((sweep) => sweep.form)).toEqual(forms);
      expect(sim.player.fireCd).toBeCloseTo(sim.swordInterval);
    };
    const levelTo = (level: number, pick: (c: GameSim['choices']) => number = () => 0) => {
      sim.player.fireCd = Infinity;
      while (sim.level < level) {
        sim.gainXp((sim.xpNeeded - sim.xp + 0.00001) / (sim.stats.xpGain * sim.relics.xpMultiplier));
        sim.step(IDLE_INPUT);
        while (sim.phase === 'levelup') {
          if (sim.choices[0]?.kind === 'swordForm') {
            expect(sim.pendingLevel).toBe(6);
            expect(sim.choices).toEqual(SWORD_FORM_IDS.map((id) => ({ kind: 'swordForm', id })));
            expect(sim.reroll()).toBe(false);
            expect(sim.choose(pick(sim.choices))).toBe(true);
          } else expect(sim.choose(0)).toBe(true);
        }
      }
    };

    swing([undefined]);
    levelTo(6, (choices) => choices.findIndex((c) => c.kind === 'swordForm' && c.id === 'swordCrush'));
    expect(sim.swordForms).toEqual(['swordCrush']);
    swing(['swordCrush']);
    levelTo(19);
    expect(sim.swordForms).toEqual(['swordCrush']);
    swing(['swordCrush']);
    expect(sim.playerShots).toHaveLength(0);
  });

  it('반월 연격의 되베기는 이동한 로안의 위치에서 적중하며 별도 공격 횟수를 쓰지 않는다', () => {
    const sim = new GameSim({ seed: 22, god: true, loadout: roan, presetLevel: 6 });
    const first = makeTarget(sim, 72);
    sim.step(IDLE_INPUT);
    const hp = first.hp;
    expect(hp).toBeLessThan(first.maxHp);
    sim.player.x += 280;
    const second = makeTarget(sim, 76);
    for (let i = 0; i < 9; i++) sim.step(IDLE_INPUT);
    expect(sim.swordSweep?.x).toBe(sim.player.x);
    expect(sim.swordSweep?.followup).toBe(true);
    expect(first.hp).toBe(hp);
    expect(second.maxHp - second.hp).toBeCloseTo(sim.swordDamage * SWORD_FORMS.swordCrescent.followupDamage);
    expect(sim.swordSwings).toBe(1);
  });

  it('공통 검 강화는 고른 타입에 적용되고, 각도 한도를 넘친 각도는 거리로 바뀐다', () => {
    const sim = new GameSim({ seed: 23, god: true, loadout: roan,
      presetUpgrades: { swordRange: 30, swordArc: 6, swordDamage: 1, swordSpeed: 1 } });
    expect(sim.swordRange).toBe(SWORD.maxRange);
    // 기본 베기 130° + 120° = 250°, 한도 안
    expect(sim.strikeRange()).toBe(SWORD.maxRange);
    const forms = (sim as unknown as { learnedSwordForms: SwordFormId[] }).learnedSwordForms;
    forms.push('swordGuard');
    // 270° + 120° = 390° → 360°, 넘친 30° → 거리 +7.5%
    expect(sim.swordAngle('swordGuard')).toBe(360);
    expect(sim.strikeRange('swordGuard')).toBeCloseTo(SWORD.maxRange * SWORD_FORMS.swordGuard.range * 1.075);
    // 강철 파쇄 70° + 120° = 190° → 150°, 넘친 40° → 거리 +10%
    expect(sim.swordAngle('swordCrush')).toBe(150);
    expect(sim.strikeRange('swordCrush')).toBeCloseTo(SWORD.maxRange * 1.1);
    // 검기 발사: 넓은 베기는 각도 대신 두께
    expect(sim.swordAngle('swordWave')).toBe(SWORD_FORMS.swordWave.angle);
    expect(sim.strikeRange('swordWave')).toBe(SWORD.maxRange);

    const near = makeTarget(sim, 65);
    sim.step(IDLE_INPUT);
    expect(sim.swordSweeps.map((sweep) => sweep.form)).toEqual(['swordGuard']);
    expect(sim.swordDamage).toBeCloseTo(sim.stats.damage * SWORD.damage * 1.30);
    expect(near.maxHp - near.hp).toBeCloseTo(sim.swordDamage * SWORD_FORMS.swordGuard.damage);
    expect(sim.player.fireCd).toBeCloseTo(SWORD.interval / sim.relics.fireRate * 0.9 * 1.03);
    const shared = MASTERY_UPGRADES.filter((def) => upgradeAvailable(roan, def, sim.level));
    expect(shared.map((def) => def.id)).toEqual(['swordSpeed', 'swordRange', 'swordArc', 'swordDamage', 'swordPierce']);
    const wave = MASTERY_UPGRADES.filter((def) => upgradeAvailable(roan, def, sim.level, ['swordWave']));
    expect(wave.map((def) => def.id)).toEqual([...shared.map((def) => def.id), 'swordWavePierce', 'swordWaveRange']);
  });

  it('반월 연격의 되베기는 투사체 차단 한도를 공격 단위로 계산한다', () => {
    const sim = new GameSim({ seed: 24, god: true, loadout: roan, presetLevel: 6, carryRelics: ['swordScabbard', 'swordRhythm'] });
    expect(sim.swordForms).toEqual(['swordCrescent']);
    makeTarget(sim, 65);
    const shots = [makeShot(sim, 30, 0), makeShot(sim, 40, 0), makeShot(sim, 50, 0), makeShot(sim, 55, 0), makeShot(sim, -40, 0)];
    sim.enemyShots.push(...shots);
    sim.step(IDLE_INPUT);
    for (let i = 0; i < 9; i++) sim.step(IDLE_INPUT);
    expect(sim.hitsByAttack.sword).toBe(2);
    expect(sim.swordSweeps.flatMap((sweep) => sweep.blocked)).toHaveLength(3);
    expect(sim.enemyShots).toEqual([shots[3], shots[4]]);
    expect(sim.player.fireCd).toBeCloseTo(sim.swordInterval - 0.15);
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
