import { describe, expect, it } from 'vitest';
import { RELICS, validCarry, type RelicId } from '../src/config/relics';
import { tokenReward } from '../src/core/meta';
import type { GameSim } from '../src/core/sim';
import { IDLE_INPUT, type Enemy } from '../src/core/types';
import { makeSim } from './helpers';

const DOC_RELICS: RelicId[] = [
  'whetstone', 'chainOrb', 'slayerSeal', 'ruptureCog', 'twinBlade', 'giantHunter', 'splitHead', 'focusRing', 'executioner', 'sniperGlove', 'pulseBarrel', 'fifthBell',
  'chalice', 'thornMail', 'angelFeather', 'steelHeart', 'battleJoy', 'calmShield', 'mossCharm', 'herbalist', 'lightningRod',
  'windBoots', 'hourglass', 'cloak', 'stormCore', 'lightHands', 'grazeFeather',
  'berserker', 'greedDice', 'glassCannon', 'unstableCore', 'collectorPack', 'gamblerCoin', 'magnetCore', 'fortuneCard', 'clover', 'rottingGem', 'namelessContract', 'hastyInvite',
  'alchemistFlask', 'powderBox', 'migrantFeather', 'riftCrystal',
  'returnRing', 'winterLantern', 'constellation', 'secondBell', 'plagueJar',
];

function withRelics(...ids: RelicId[]): GameSim {
  const sim = makeSim();
  for (const id of ids) sim.relics.acquire(id);
  return sim;
}

function kill(sim: GameSim, e: Enemy, source: Parameters<GameSim['damageEnemy']>[2] = 'mine'): void {
  sim.damageEnemy(e, 1e7, source);
}

/** 이 시각까지 전투 시간을 옮긴다 (스폰 없이) */
function wait(sim: GameSim, seconds: number): void {
  sim.tick += Math.round(seconds * 60);
  sim.relics.update(1 / 60);
}

describe('문서 1~6장 유물 등록', () => {
  it('48종이 모두 등록되고, 무기 전용 5종은 균열 수호자 보상이며 무기가 지정된다', () => {
    expect(DOC_RELICS).toHaveLength(48);
    for (const id of DOC_RELICS) expect(RELICS[id]).toBeDefined();
    for (const id of ['returnRing', 'winterLantern', 'constellation', 'secondBell', 'plagueJar'] as const) {
      expect(RELICS[id].source).toBe('elite');
      expect('weapon' in RELICS[id]).toBe(true);
    }
  });

  it('판 밖 성장 유물(주사위·카드·클로버·초대장)은 다음 판으로 가져갈 수 없다', () => {
    expect(validCarry(['greedDice', 'fortuneCard', 'clover', 'hastyInvite', 'oath'])).toEqual(['oath']);
  });
});

describe('1장: 공격 및 연쇄 처치', () => {
  it('피에 굶주린 숫돌: 처치마다 3초간 사격 속도 +10%, 최대 5중첩', () => {
    const sim = withRelics('whetstone');
    const base = sim.relics.fireRate;
    for (let i = 0; i < 7; i++) kill(sim, sim.spawnEnemy('chaser', 900, 900));
    expect(sim.relics.fireRate).toBeCloseTo(base * 1.5);
    wait(sim, 3.1);
    expect(sim.relics.fireRate).toBeCloseTo(base);
  });

  it('학살자의 인장·다섯째 종: 사격 보정이 한 번씩 적용된다', () => {
    const sim = withRelics('slayerSeal', 'fifthBell');
    for (let i = 0; i < 5; i++) kill(sim, sim.spawnEnemy('chaser', 900, 900));
    expect(sim.relics.volley().damage).toBe(2);
    expect(sim.relics.volley().damage).toBe(1);
    sim.relics.volley();
    sim.relics.volley();
    const fifth = sim.relics.volley();
    expect(fifth).toMatchObject({ damage: 3, pierce: 2 });
    expect(fifth.radius).toBeGreaterThan(1);
  });

  it('파열의 톱니바퀴: 일반 적이 터지며 주변 적에게 최대 체력의 15% 피해', () => {
    const sim = withRelics('ruptureCog');
    const dead = sim.spawnEnemy('chaser', 900, 900);
    const near = sim.spawnEnemy('charger', 940, 900);
    const hp = near.hp;
    kill(sim, dead);
    sim.relics.update(1 / 60);
    expect(hp - near.hp).toBeCloseTo(dead.maxHp * 0.15);
  });

  it('갈라지는 화살촉: 기본·특수 공격 처치 모두 탄 수 ×2 만큼 작은 탄(기본탄 10%)을 낸다', () => {
    const sim = withRelics('splitHead');
    kill(sim, sim.spawnEnemy('chaser', 900, 900), 'basic');
    kill(sim, sim.spawnEnemy('chaser', 300, 900), 'orbit');
    const shots = sim.playerShots.filter((s) => s.source === 'relic');
    expect(shots).toHaveLength(4);
    expect(shots[0].damage).toBeCloseTo(sim.relics.shotDamage() * 0.1);
    kill(sim, sim.spawnEnemy('chaser', 300, 300), 'relic');
    expect(sim.playerShots.filter((s) => s.source === 'relic')).toHaveLength(4);
  });

  it('거인 사냥꾼·집중의 고리·저격수의 장갑: 대상과 거리에 따라 피해 배율이 바뀐다', () => {
    const sim = withRelics('giantHunter', 'focusRing', 'sniperGlove');
    const p = sim.player;
    const elite = sim.spawnEnemy('elite', p.x + 250, p.y);
    const far = sim.spawnEnemy('chaser', p.x + 400, p.y);
    const close = sim.spawnEnemy('chaser', p.x + 100, p.y);
    expect(sim.relics.damageMultiplier(elite, false)).toBeCloseTo(1.3);
    expect(sim.relics.damageMultiplier(far, true)).toBeCloseTo(1.25);
    expect(sim.relics.damageMultiplier(close, true)).toBeCloseTo(0.8);
    for (let i = 0; i < 10; i++) sim.damageEnemy(elite, 0.001, 'basic');
    expect(sim.relics.damageMultiplier(far, true)).toBeCloseTo(1.25 * 1.1);
    sim.hurtPlayer(1, '시험');
    expect(sim.relics.damageMultiplier(far, true)).toBeCloseTo(1.25);
  });

  it('처형인의 저울: 체력 10% 이하 일반 적은 기본탄 한 발에 처치, 사격 속도 −30%', () => {
    const sim = makeSim();
    const base = sim.relics.fireRate;
    sim.relics.acquire('executioner');
    expect(sim.relics.fireRate).toBeCloseTo(base * 0.7);
    const weak = sim.spawnEnemy('charger', 900, 900);
    weak.hp = weak.maxHp * 0.1;
    sim.damageEnemy(weak, 0.01, 'basic');
    expect(weak.dead).toBe(true);
    const elite = sim.spawnEnemy('elite', 900, 900);
    elite.hp = elite.maxHp * 0.05;
    sim.damageEnemy(elite, 0.01, 'basic');
    expect(elite.dead).toBe(false);
  });

  it('맥동 총열: 10초 주기 중 3초는 +60%, 나머지는 −10%', () => {
    const sim = makeSim();
    const base = sim.relics.fireRate;
    sim.relics.acquire('pulseBarrel');
    expect(sim.relics.fireRate).toBeCloseTo(base * 0.9);
    wait(sim, 7.5);
    expect(sim.relics.fireRate).toBeCloseTo(base * 1.6);
  });

  it('연쇄 번개 구슬·쌍둥이 그림자 검: 기본 사격 중 확률 효과가 발동한다', () => {
    const sim = withRelics('chainOrb', 'twinBlade');
    const p = sim.player;
    const target = sim.spawnEnemy('elite', p.x + 300, p.y);
    const near = sim.spawnEnemy('charger', p.x + 340, p.y);
    near.hp = near.maxHp = 1e6;
    for (let i = 0; i < 60; i++) sim.damageEnemy(target, 0.001, 'basic');
    expect(sim.damageByAttack.relic ?? 0).toBeGreaterThan(0);
    let twins = 0;
    for (let i = 0; i < 100; i++) if (sim.relics.volley().twin) twins++;
    expect(twins).toBeGreaterThan(8);
    expect(twins).toBeLessThan(35);
  });
});

describe('2장: 생존, 흡수 및 방어', () => {
  it('흡혈귀의 깨진 성배: 둔화된 적을 때리면 최대 체력 1.5% 회복 (0.5초 재사용)', () => {
    const sim = withRelics('chalice');
    sim.player.hp = 10;
    const e = sim.spawnEnemy('elite', 900, 900);
    sim.damageEnemy(e, 1, 'mine');
    expect(sim.player.hp).toBe(10);
    e.slowUntil = sim.elapsed + 5;
    sim.damageEnemy(e, 1, 'mine');
    sim.damageEnemy(e, 1, 'mine');
    expect(sim.player.hp).toBeCloseTo(10 + sim.relics.maxHp * 0.015);
  });

  it('가시 돋친 철갑: 받은 피해의 150%를 반사하고 피격 무적 +0.4초', () => {
    const sim = withRelics('thornMail');
    const p = sim.player;
    const e = sim.spawnEnemy('chaser', p.x + 100, p.y);
    const hp = e.hp;
    sim.hurtPlayer(10, '시험');
    expect(hp - e.hp).toBeCloseTo(15);
    expect(p.invuln).toBeCloseTo(sim.stats.hurtInvuln + 0.4);
  });

  it('수호천사의 깃털: 한 번 50%로 부활하며 주변 적을 밀쳐낸다', () => {
    const sim = withRelics('angelFeather');
    const p = sim.player;
    const e = sim.spawnEnemy('chaser', p.x + 40, p.y);
    sim.hurtPlayer(9999, '시험');
    sim.step(IDLE_INPUT);
    expect(sim.phase).toBe('combat');
    expect(p.hp).toBeCloseTo(sim.relics.maxHp * 0.5, 0);
    expect(Math.hypot(e.x - p.x, e.y - p.y)).toBeGreaterThan(180);
    p.invuln = 0;
    sim.hurtPlayer(9999, '시험');
    sim.step(IDLE_INPUT);
    expect(sim.phase).toBe('ended');
  });

  it('강철 심장·고요한 방패·네잎 클로버·수집가의 배낭: 최대 체력과 몸 크기', () => {
    const sim = makeSim();
    const base = sim.relics.maxHp;
    sim.relics.acquire('steelHeart');
    expect(sim.relics.maxHp).toBeCloseTo(base * 1.35);
    expect(sim.player.hp).toBeCloseTo(base * 1.35);
    expect(sim.player.r).toBeCloseTo(14 * 1.1);
    expect(sim.relics.moveMultiplier(false)).toBeCloseTo(0.8);
    sim.relics.acquire('calmShield');
    sim.relics.acquire('clover');
    expect(sim.relics.maxHp).toBeCloseTo(base * 1.35 * 0.9 - 10);
    sim.relics.acquire('collectorPack');
    expect(sim.relics.maxHp).toBeCloseTo(base * 1.35 * 0.9 - 10 + 40);
    expect(sim.luck).toBeCloseTo(4);
  });

  it('고요한 방패: 8초 동안 맞지 않으면 다음 피격 1회를 막는다', () => {
    const sim = withRelics('calmShield');
    const p = sim.player;
    const hp = p.hp;
    sim.hurtPlayer(10, '시험');
    expect(p.hp).toBe(hp - 10);
    p.invuln = 0;
    wait(sim, 8);
    expect(sim.relics.shieldReady).toBe(true);
    sim.hurtPlayer(10, '시험');
    expect(p.hp).toBe(hp - 10);
  });

  it('전투의 환희·피뢰침·탐욕의 주사위: 받는 피해 배율', () => {
    const sim = withRelics('lightningRod', 'greedDice');
    expect(sim.relics.damageTaken('shot')).toBeCloseTo(0.7 * 1.2);
    expect(sim.relics.damageTaken('contact')).toBeCloseTo(1.2 * 1.2);
    sim.relics.acquire('battleJoy');
    const p = sim.player;
    for (let i = 0; i < 4; i++) sim.spawnEnemy('chaser', p.x + 60, p.y + i * 10);
    expect(sim.relics.damageTaken()).toBeCloseTo(1.2 * 0.75);
  });

  it('이끼 낀 부적: 멈춰 있으면 초당 2 회복 / 약초꾼의 병: 물약 2배', () => {
    const sim = withRelics('mossCharm', 'herbalist');
    const p = sim.player;
    p.hp = 10;
    sim.relics.onMove(false, 0);
    sim.relics.update(1);
    expect(p.hp).toBeCloseTo(12);
    sim.relics.onMove(true, 3);
    sim.relics.update(1);
    expect(p.hp).toBeCloseTo(12);
    sim.useItem('heal');
    expect(p.hp).toBeCloseTo(62);
    expect(sim.relics.regenMultiplier).toBe(0.5);
  });
});

describe('3장: 기동성 및 특수 무기 순환', () => {
  it('바람의 장화: 회피를 연속 2번 쓸 수 있다', () => {
    for (const boots of [false, true]) {
      const sim = boots ? withRelics('windBoots') : makeSim();
      sim.step({ ...IDLE_INPUT, dodge: true });
      for (let i = 0; i < 20; i++) sim.step(IDLE_INPUT);
      sim.step({ ...IDLE_INPUT, dodge: true });
      expect(sim.dodges).toBe(boots ? 2 : 1);
    }
  });

  it('시간 왜곡의 모래시계: 처치마다 특수 무기 대기시간 −0.1초, 균열 수호자는 −2초', () => {
    const sim = makeSim({ presetUpgrades: { mine: 1 } });
    sim.relics.acquire('hourglass');
    sim.step(IDLE_INPUT);
    const ready = (sim.weapons as unknown as { ready: Map<string, number> }).ready;
    const before = ready.get('mine')!;
    kill(sim, sim.spawnEnemy('chaser', 300, 300));
    expect(ready.get('mine')).toBeCloseTo(before - 0.1);
    kill(sim, sim.spawnEnemy('elite', 300, 300));
    expect(ready.get('mine')).toBeCloseTo(before - 2.1);
  });

  it('잔상 망토: 회피로 적을 통과하면 적 탄을 무시하고 첫 사격 피해 2배', () => {
    const sim = withRelics('cloak');
    const p = sim.player;
    p.dodgeTime = 0.1;
    sim.spawnEnemy('chaser', p.x + 5, p.y);
    sim.relics.update(1 / 60);
    expect(sim.relics.shotImmune).toBe(true);
    expect(sim.relics.volley().damage).toBe(2);
    expect(sim.relics.volley().damage).toBe(1);
  });

  it('폭풍의 핵: 1,500px 이동 뒤 다음 사격이 반경 160px 충격파(공격력 200%)', () => {
    const sim = withRelics('stormCore');
    const p = sim.player;
    const e = sim.spawnEnemy('chaser', p.x + 100, p.y);
    const hp = e.hp;
    sim.relics.onMove(true, 1499);
    sim.relics.volley();
    expect(e.hp).toBe(hp);
    sim.relics.onMove(true, 1);
    sim.relics.volley();
    expect(hp - e.hp).toBeCloseTo(sim.stats.damage * 2);
  });

  it('가벼운 손놀림과 스침의 깃', () => {
    const sim = makeSim();
    const rate = sim.relics.fireRate;
    sim.relics.acquire('lightHands');
    sim.relics.acquire('grazeFeather');
    expect(sim.relics.fireRate).toBeCloseTo(rate * 1.15);
    expect(sim.relics.cooldownMultiplier).toBeCloseTo(0.9);
    const p = sim.player;
    p.dodgeCd = 2;
    p.dodgeTime = 0.1;
    p.invuln = 1;
    sim.spawnEnemyShot(p.x, p.y, 0, 0, 5, 6, '시험 탄');
    sim.step(IDLE_INPUT);
    expect(p.dodgeCd).toBeCloseTo(1 - 1 / 60);
    sim.step(IDLE_INPUT);
    expect(p.dodgeCd).toBeCloseTo(1 - 2 / 60);
  });
});

describe('4장: 리스크-리턴 및 유틸리티', () => {
  it('광전사의 안대와 유리 대포', () => {
    const sim = withRelics('berserker');
    const e = sim.spawnEnemy('chaser', 300, 300);
    sim.player.hp = sim.relics.maxHp / 2;
    expect(sim.relics.damageMultiplier(e, false)).toBeCloseTo(1.4);
    const glass = withRelics('glassCannon');
    expect(glass.relics.maxHp).toBe(1);
    expect(glass.player.hp).toBe(1);
    expect(glass.relics.damageMultiplier(e, false)).toBeCloseTo(1.8);
  });

  it('불안정한 마력 코어: 대기시간 초기화가 일어나고 자해 피해로 쓰러지지 않는다', () => {
    const sim = withRelics('unstableCore');
    sim.player.hp = 1;
    let resets = 0;
    for (let i = 0; i < 400; i++) if (sim.relics.onWeaponActivated()) resets++;
    expect(resets).toBeGreaterThan(60);
    expect(resets).toBeLessThan(140);
    expect(sim.player.hp).toBe(1);
  });

  it('도박꾼의 동전: 던지면 유물 선택이 늘거나, 체력 15%와 선택을 잃는다', () => {
    const outcomes = new Set<string>();
    for (let seed = 1; seed < 20 && outcomes.size < 2; seed++) {
      const sim = makeSim({ seed, presetUpgrades: { mine: 1 } });
      sim.relics.acquire('gamblerCoin');
      kill(sim, sim.spawnEnemy('elite', 900, 900));
      sim.step(IDLE_INPUT);
      expect(sim.choices.map((c) => c.kind)).toEqual(['coin', 'coin']);
      const hp = sim.player.hp;
      sim.choose(0);
      const screens: string[] = [];
      while (sim.phase === 'levelup') {
        screens.push(sim.armoryOpen ? 'armory' : sim.choices[0].kind);
        sim.choose(0);
      }
      if (screens.filter((s) => s === 'relic').length === 2) outcomes.add('win');
      else {
        expect(screens).toEqual(['armory']);
        expect(sim.player.hp).toBeCloseTo(hp * 0.85);
        outcomes.add('lose');
      }
    }
    expect(outcomes).toEqual(new Set(['win', 'lose']));
  });

  it('도박꾼의 동전: 던지지 않으면 평소대로 유물을 고른다', () => {
    const sim = makeSim({ presetUpgrades: { mine: 1 } });
    sim.relics.acquire('gamblerCoin');
    kill(sim, sim.spawnEnemy('elite', 900, 900));
    sim.step(IDLE_INPUT);
    sim.choose(1);
    expect(sim.choices[0].kind).toBe('relic');
  });

  it('자석 핵: 흡수 범위 +60%, 자석 확률 2배, 자석을 주우면 5초간 +50%', () => {
    const sim = makeSim();
    const rate = sim.relics.fireRate;
    sim.relics.acquire('magnetCore');
    expect(sim.relics.pickupRadiusMultiplier).toBeCloseTo(1.6);
    expect(sim.relics.dropChanceMultiplier('magnet')).toBe(2);
    sim.useItem('magnet');
    expect(sim.relics.fireRate).toBeCloseTo(rate * 1.5);
    expect(sim.relics.moveMultiplier(false)).toBeCloseTo(1.5);
    expect(sim.relics.damageMultiplier(sim.spawnEnemy('chaser', 300, 300), false)).toBeCloseTo(1.5);
    wait(sim, 5.1);
    expect(sim.relics.fireRate).toBeCloseTo(rate);
  });

  it('점술가의 카드: 새로고침 +2, 레벨업 후보 2개 (무기 후보는 유지)', () => {
    const sim = makeSim();
    const rerolls = sim.rerollsLeft;
    sim.relics.acquire('fortuneCard');
    expect(sim.rerollsLeft).toBe(rerolls + 2);
    while (sim.level < 4) sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    while (sim.phase === 'levelup') {
      if (sim.choices[0].kind !== 'relic') expect(sim.choices.length).toBeLessThanOrEqual(2);
      sim.choose(0);
    }
    sim.gainXp(sim.xpNeeded);
    sim.step(IDLE_INPUT);
    expect(sim.choices).toHaveLength(2);
    const last = sim.choices[1];
    expect(last.kind === 'upgrade' && last.def.weapon).toBeTruthy();
  });

  it('썩어 가는 보석: 경험치 +100%, 바닥에 10초 지난 보석은 사라진다', () => {
    const sim = makeSim({ god: true });
    sim.relics.acquire('rottingGem');
    expect(sim.relics.xpMultiplier).toBe(2);
    sim.gems.push({ x: 100, y: 100, value: 5, pulled: false });
    for (let i = 0; i < 9 * 60; i++) sim.step(IDLE_INPUT);
    expect(sim.gems.some((g) => g.x === 100 && g.y === 100)).toBe(true);
    for (let i = 0; i < 70 && sim.phase === 'combat'; i++) sim.step(IDLE_INPUT);
    expect(sim.gems.some((g) => g.x === 100 && g.y === 100)).toBe(false);
  });

  it('이름 없는 계약: 필요 경험치 +40%, 레벨업 후보에 일반 등급 없음', () => {
    const sim = makeSim();
    const need = sim.xpNeeded;
    sim.relics.acquire('namelessContract');
    expect(sim.xpNeeded).toBe(Math.round(need * 1.4));
    for (let n = 0; n < 6; n++) {
      sim.gainXp(sim.xpNeeded);
      sim.step(IDLE_INPUT);
      while (sim.phase === 'levelup') {
        for (const c of sim.choices) if (c.kind === 'upgrade' && !c.def.weapon && !sim.armoryOpen) expect(c.grade).not.toBe('common');
        sim.choose(0);
      }
    }
  });

  it('서두른 초대장: 보스가 바로 등장하고 보스 처치 시 토큰 +50%', () => {
    const sim = withRelics('hastyInvite');
    expect(sim.bossSpawned).toBe(true);
    expect(sim.relics.tokenMultiplier(true)).toBe(1.5);
    expect(sim.relics.tokenMultiplier(false)).toBe(1);
    const reward = tokenReward({ survivalTime: 600, killsByKind: {}, outcome: 'victory', tokenMultiplier: 1.4 });
    expect(reward.relics).toBe(Math.round((reward.total - reward.relics) * 0.4));
  });
});

describe('5장: 드랍 아이템 및 엘리트 연동', () => {
  it('연금술사의 병·철새의 깃털·화약 상자', () => {
    const sim = withRelics('alchemistFlask', 'migrantFeather', 'powderBox');
    const e = sim.spawnEnemy('chaser', 300, 300);
    sim.player.hp = 10;
    sim.useItem('heal');
    expect(sim.relics.damageMultiplier(e, false)).toBeCloseTo(1);
    expect(sim.relics.moveMultiplier(false)).toBeCloseTo(1.25);
    sim.player.hp = sim.relics.maxHp;
    sim.useItem('heal');
    expect(sim.relics.damageMultiplier(e, false)).toBeCloseTo(1.3);
    expect(sim.relics.dropChanceMultiplier('bomb')).toBe(3);
    sim.spawnBoss();
    const boss = sim.boss!;
    boss.state = 'idle';
    boss.y = sim.player.y - 200;
    const hp = boss.hp;
    sim.useItem('bomb');
    expect(hp - boss.hp).toBeCloseTo(boss.maxHp * 0.03 * 1.3);
  });

  it('균열 결정: 균열 수호자 처치 뒤 다음 레벨업 후보 1장은 희귀 이상', () => {
    for (let seed = 1; seed <= 8; seed++) {
      const sim = makeSim({ seed });
      sim.relics.acquire('riftCrystal');
      while (sim.level < 3) sim.gainXp(sim.xpNeeded);
      sim.step(IDLE_INPUT);
      while (sim.phase === 'levelup') sim.choose(0);
      kill(sim, sim.spawnEnemy('elite', 900, 900));
      sim.step(IDLE_INPUT);
      while ((sim.phase as string) === 'levelup') sim.choose(0);
      expect(sim.relics.rareCards).toBe(1);
      sim.gainXp(sim.xpNeeded);
      sim.step(IDLE_INPUT);
      const grades = sim.choices.flatMap((c) => (c.kind === 'upgrade' ? [c.grade] : []));
      expect(grades.some((g) => g !== 'common')).toBe(true);
      sim.choose(0);
      expect(sim.relics.rareCards).toBe(0);
    }
  });
});

describe('6장: 특수 무기 전용', () => {
  type Dev = { kind: string; duration: number; r: number; secondary?: boolean; baseR?: number; age: number };
  const devices = (sim: GameSim) => (sim.weapons.devices as unknown as Dev[]);

  it('겨울 등불: 서리 포탑 2대, 지속시간 −30%', () => {
    const sim = makeSim({ presetUpgrades: { turret: 1 } });
    sim.relics.acquire('winterLantern');
    sim.step(IDLE_INPUT);
    const turrets = devices(sim).filter((d) => d.kind === 'turret');
    expect(turrets).toHaveLength(2);
    expect(turrets[0].duration).toBeCloseTo(4.2);
  });

  it('두 번째 종소리: 낙뢰가 2회 명중으로 발동, 범위 −25%', () => {
    const sim = makeSim({ presetUpgrades: { mark: 1 } });
    sim.relics.acquire('secondBell');
    const e = sim.spawnEnemy('elite', 900, 900);
    sim.damageEnemy(e, 0.001, 'basic');
    expect(sim.damageByAttack.mark ?? 0).toBe(0);
    sim.damageEnemy(e, 0.001, 'basic');
    expect(sim.damageByAttack.mark ?? 0).toBeGreaterThan(0);
    const fx = sim.weapons.effects.filter((f) => f.kind === 'mark' && !('variant' in f && f.variant));
    expect(fx.at(-1)!.radius).toBeCloseTo(82 * 0.75);
  });

  it('별자리 창끝: 3마리 이상 꿰뚫으면 끝 지점에서 좌우로 창 2개 (조준 +0.3초)', () => {
    const sim = makeSim({ presetUpgrades: { spear: 1 } });
    sim.relics.acquire('constellation');
    const p = sim.player;
    for (let i = 1; i <= 3; i++) {
      const e = sim.spawnEnemy('elite', p.x + 80 * i, p.y);
      e.hp = e.maxHp = 1e6;
      e.speed = 0;
    }
    sim.step(IDLE_INPUT);
    const spear = devices(sim).find((d) => d.kind === 'spear')!;
    expect(spear.duration).toBeCloseTo(0.68);
    let seen = 0;
    for (let i = 0; i < 50; i++) {
      sim.step(IDLE_INPUT);
      seen = Math.max(seen, devices(sim).filter((d) => d.kind === 'spear' && d.secondary).length);
    }
    expect(seen).toBe(2);
  });

  it('귀환의 고리: 돌아올 때 타격 범위가 1.5배에서 2배로 커지고 투척 간격 +20%', () => {
    const sim = makeSim({ presetUpgrades: { axe: 1 } });
    sim.relics.acquire('returnRing');
    const p = sim.player;
    const e = sim.spawnEnemy('elite', p.x + 300, p.y);
    e.hp = e.maxHp = 1e6;
    e.speed = 0;
    sim.step(IDLE_INPUT);
    const axe = devices(sim).find((d) => d.kind === 'axe')!;
    const base = axe.baseR!;
    const sizes: number[] = [];
    while (devices(sim).includes(axe)) {
      sim.step(IDLE_INPUT);
      sizes.push(axe.r / base);
    }
    expect(Math.min(...sizes)).toBeCloseTo(1);
    expect(sizes.some((s) => s >= 1.5 && s < 1.6)).toBe(true);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(2 + 1e-9);
  });

  it('역병 항아리: 번질 때 범위 밖 적 2마리가 추가로 감염되고 감염 피해 −20%', () => {
    const sim = makeSim({ presetUpgrades: { infection: 1 } });
    sim.relics.acquire('plagueJar');
    const origin = sim.spawnEnemy('chaser', 300, 300);
    const outside = [sim.spawnEnemy('elite', 450, 300), sim.spawnEnemy('elite', 300, 450), sim.spawnEnemy('elite', 160, 300)];
    for (const e of outside) { e.hp = e.maxHp = 1e6; e.speed = 0; }
    sim.weapons.infected.set(origin, 999);
    kill(sim, origin, 'basic');
    sim.weapons.update(1 / 60);
    expect(outside.filter((e) => sim.weapons.infected.has(e))).toHaveLength(2);
  });
});
