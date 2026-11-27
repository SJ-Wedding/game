import { describe, expect, it } from 'vitest';
import type { Loadout } from '../src/config/characters';
import { RELICS, RELIC_IDS, relicAllowed, type RelicId } from '../src/config/relics';
import { rollRelics } from '../src/core/relics';
import { Rng } from '../src/core/rng';
import { GameSim } from '../src/core/sim';
import { IDLE_INPUT, type Enemy } from '../src/core/types';

const ranger: Loadout = { character: 'ranger' };
const roan: Loadout = { character: 'roan' };
const chain: Loadout = { character: 'lumen', weapon: 'chain' };
const turret: Loadout = { character: 'lumen', weapon: 'turret' };

const NEW_COMMON: RelicId[] = [
  'fuseChain', 'slaughterDrum', 'bountyLedger', 'plagueMask', 'frostShard', 'emberJar', 'sporePouch', 'chargeCell', 'shadowStep',
  'sprintEngine', 'rallyFlag', 'vengeance', 'painVault', 'cliffDance', 'phoenixAsh', 'treasureMap', 'gemStorm', 'luckyStrike',
  'riftCore', 'overcharge', 'echoBrand', 'vortexCharm', 'expansionSeal', 'stoppedWatch', 'soulHarvest',
];

function sim(loadout: Loadout, relics: RelicId[] = [], extra: Partial<ConstructorParameters<typeof GameSim>[0]> = {}): GameSim {
  const s = new GameSim({ seed: 31, god: true, loadout, ...extra });
  for (const id of relics) s.relics.acquire(id);
  return s;
}

/** 스폰을 끄고 적을 직접 놓는다 */
function quiet(s: GameSim): GameSim {
  (s as unknown as { updateSpawner(): void }).updateSpawner = () => {};
  return s;
}

function enemy(s: GameSim, dx: number, dy = 0, hp = 1000, kind: 'chaser' | 'elite' = 'chaser'): Enemy {
  const e = s.spawnEnemy(kind, s.player.x + dx, s.player.y + dy);
  e.hp = e.maxHp = hp;
  e.speed = 0;
  return e;
}

function steps(s: GameSim, n: number, input = IDLE_INPUT): void {
  for (let i = 0; i < n; i++) s.step(input);
}

const seconds = (t: number) => Math.round(t * 60);

describe('유물 추가 기획안: 정의', () => {
  it('공통 25개와 캐릭터별 5개가 있고 후보 규칙을 따른다', () => {
    for (const id of NEW_COMMON) expect(RELICS[id]).toBeDefined();
    const by = (character: string) => RELIC_IDS.filter((id) => (RELICS[id] as { character?: string }).character === character);
    expect(by('ranger')).toEqual(['armoryKey', 'fusionCatalyst', 'casingStorm', 'overheat', 'marksman']);
    expect(['manaOverload', 'dualGrimoire', 'thunderRod', 'blizzardCore', 'manaBurst'].every((id) => by('lumen').includes(id as RelicId))).toBe(true);
    expect(['warCry', 'bladeWave', 'counterMaster', 'ironCharge', 'bloodWind'].every((id) => by('roan').includes(id as RelicId))).toBe(true);
    // 번개·특수 무기가 없는 로안에게는 전하 축적기·과충전 배터리·메아리 각인이 나오지 않는다
    for (const id of ['chargeCell', 'overcharge', 'echoBrand'] as RelicId[]) {
      expect(relicAllowed(id, roan)).toBe(false);
      expect(relicAllowed(id, ranger)).toBe(true);
    }
    expect(relicAllowed('thunderRod', chain)).toBe(true);
    expect(relicAllowed('thunderRod', turret)).toBe(false);
    expect(relicAllowed('blizzardCore', turret)).toBe(true);
    expect(relicAllowed('armoryKey', chain)).toBe(false);
    expect(RELIC_IDS).toHaveLength(175);
  });

  it('루멘·로안의 3레벨 시작 유물 후보가 늘었다', () => {
    const seen = (loadout: Loadout) => {
      const ids = new Set<RelicId>();
      for (let seed = 1; seed < 60; seed++) for (const c of rollRelics('opening', new Rng(seed), new Set(), loadout)) if (c.kind === 'relic') ids.add(c.id);
      return ids;
    };
    expect([...seen(roan)].sort()).toEqual(['bladeWave', 'bountyKnot', 'chargeStance', 'meleeInstinct', 'shadowStep', 'vortexCharm'].sort());
    expect(seen(chain).size).toBe(7);
  });

  it('보물 지도: 균열 수호자 유물 후보가 4장', () => {
    const s = quiet(sim(ranger, ['treasureMap']));
    const e = enemy(s, 300, 0, 1, 'elite');
    s.damageEnemy(e, 10);
    steps(s, 1);
    while (s.phase === 'levelup' && s.choices[0]?.kind !== 'relic') s.choose(0);
    expect(s.choices.filter((c) => c.kind === 'relic' || c.kind === 'essence')).toHaveLength(4);
  });
});

describe('유물 추가 기획안: 처치 연쇄', () => {
  it('도화선 사슬: 폭발로 처치된 적이 0.12초 뒤 폭발을 이어 간다', () => {
    const s = quiet(sim(ranger, ['fuseChain']));
    const first = enemy(s, 300, 0, 1);
    const next = enemy(s, 360, 0, 500);
    s.extra.explode(first, 30, 10, 'fuse');
    expect(first.dead).toBe(true);
    steps(s, 1);
    expect(next.hp).toBe(500); // 한 단계마다 0.12초 뒤에 터진다
    steps(s, seconds(0.15));
    expect(next.hp).toBeLessThan(500);
  });

  it('도화선 사슬: 폭발이 없어도 15번째 처치마다 폭발', () => {
    const s = quiet(sim(ranger, ['fuseChain']));
    const witness = enemy(s, 330, 0, 500);
    for (let i = 0; i < 15; i++) s.damageEnemy(enemy(s, 300, 0, 1), 5);
    steps(s, seconds(0.15));
    expect(witness.hp).toBeLessThan(500);
  });

  it('학살의 북소리: 처치마다 공격 속도 +1%, 30중첩이면 이동 속도 +15%, 3초가 지나면 초기화', () => {
    const s = quiet(sim(ranger, ['slaughterDrum']));
    const rate = s.relics.fireRate;
    for (let i = 0; i < 30; i++) s.damageEnemy(enemy(s, 300, 0, 1), 5);
    expect(s.relics.fireRate / rate).toBeCloseTo(1.3);
    expect(s.extra.moveMultiplier).toBe(1.15);
    steps(s, seconds(3.2));
    s.damageEnemy(enemy(s, 300, 0, 1), 5);
    expect(s.relics.fireRate / rate).toBeCloseTo(1.01);
  });

  it('현상금 장부: 균열 수호자 처치마다 +6%, 최대 +36%', () => {
    const s = quiet(sim(ranger, ['bountyLedger']));
    const dummy = enemy(s, 500, 0);
    for (let i = 0; i < 8; i++) s.damageEnemy(enemy(s, 300, 0, 1, 'elite'), 5);
    expect(s.extra.damageMultiplier(dummy)).toBeCloseTo(1.36);
  });

  it('영혼 수확: 처치하면 영혼 구슬이 0.5초 뒤 적에게 날아간다', () => {
    const s = quiet(sim(ranger, ['soulHarvest']));
    enemy(s, 300, 100, 1e6);
    for (let i = 0; i < 40; i++) s.damageEnemy(enemy(s, 200, 0, 1), 5);
    expect(s.extra.souls.length).toBeGreaterThan(2);
    steps(s, seconds(0.55));
    expect(s.playerShots.some((shot) => shot.source === 'soul')).toBe(true);
  });
});

describe('유물 추가 기획안: 상태이상', () => {
  it('역병 의사의 가면: 상태이상 1종류당 받는 피해 +8%', () => {
    const s = quiet(sim(ranger, ['plagueMask']));
    const e = enemy(s, 300);
    expect(s.extra.damageMultiplier(e)).toBeCloseTo(1);
    e.slowUntil = s.elapsed + 5;
    e.rootedUntil = s.elapsed + 5;
    expect(s.extra.damageMultiplier(e)).toBeCloseTo(1.16);
  });

  it('서리 결정: 둔화된 적이 죽으면 주변 적에게 파편 피해와 둔화', () => {
    const s = quiet(sim(ranger, ['frostShard']));
    const dying = enemy(s, 300, 0, 1);
    dying.slowUntil = s.elapsed + 2;
    const near = enemy(s, 360, 0, 500);
    s.damageEnemy(dying, 5);
    expect(near.hp).toBeLessThan(500);
    expect(near.slowUntil).toBeGreaterThan(s.elapsed);
  });

  it('불씨 항아리·역병 포자: 확률로 화상·감염을 걸고 시간이 지나면 피해, 감염된 적이 죽으면 옮는다', () => {
    const s = quiet(sim(ranger, ['emberJar', 'sporePouch']));
    const e = enemy(s, 300, 0, 1e6);
    for (let i = 0; i < 80; i++) s.damageEnemy(e, 1);
    expect(s.extra.burns.has(e)).toBe(true);
    expect(s.extra.spores.has(e)).toBe(true);
    const hp = e.hp;
    steps(s, seconds(1));
    expect(e.hp).toBeLessThan(hp);
    const a = enemy(s, 300, 60, 1e6);
    const b = enemy(s, 300, -60, 1e6);
    e.hp = 1;
    s.damageEnemy(e, 5);
    expect(s.extra.spores.has(a) && s.extra.spores.has(b)).toBe(true);
  });

  it('전하 축적기: 번개에 맞은 적을 다른 공격이 맞히면 확률로 감전', () => {
    const s = quiet(sim(ranger, ['chargeCell']));
    const e = enemy(s, 300, 0, 1e6);
    const near = enemy(s, 340, 0, 1e6);
    s.damageEnemy(e, 1, 'chain');
    expect(s.extra.charged.has(e)).toBe(true);
    for (let i = 0; i < 40; i++) s.damageEnemy(e, 1, 'basic');
    expect(near.hp).toBeLessThan(1e6);
  });
});

describe('유물 추가 기획안: 회피·이동·정지', () => {
  it('그림자 발자국: 회피를 끝내면 경로에 그림자 길이 남아 적을 둔화시키고 피해를 준다', () => {
    const s = quiet(sim(ranger, ['shadowStep']));
    const from = { x: s.player.x, y: s.player.y };
    steps(s, 1, { ...IDLE_INPUT, dodge: true, moveX: 1 });
    steps(s, seconds(0.4));
    expect(s.extra.paths).toHaveLength(1);
    const e = enemy(s, (from.x + s.player.x) / 2 - s.player.x, 0, 1e6);
    steps(s, seconds(0.5));
    expect(e.hp).toBeLessThan(1e6);
    expect(e.slowUntil).toBeGreaterThan(s.elapsed);
  });

  it('질주 엔진: 기본보다 빠른 이동 속도 1%당 피해 +0.6%, 최대 +40%', () => {
    const s = quiet(sim(ranger, ['sprintEngine']));
    const e = enemy(s, 300);
    s.lastMoveSpeed = 190 * 1.5;
    expect(s.extra.damageMultiplier(e)).toBeCloseTo(1.3);
    s.lastMoveSpeed = 190 * 3;
    expect(s.extra.damageMultiplier(e)).toBeCloseTo(1.4);
  });

  it('진지의 깃발: 1.5초 멈추면 진지, 움직이면 사라진다', () => {
    const s = quiet(sim(ranger, ['rallyFlag']));
    const rate = s.relics.fireRate;
    steps(s, seconds(1.6));
    expect(s.extra.flag).not.toBeNull();
    expect(s.relics.fireRate / rate).toBeCloseTo(1.2);
    expect(s.extra.damageTakenMultiplier).toBeCloseTo(0.9);
    steps(s, 2, { ...IDLE_INPUT, moveX: 1 });
    expect(s.extra.flag).toBeNull();
  });

  it('소용돌이 부적: 8초마다 320px 안의 일반 적을 120px까지 끌어당긴다', () => {
    const s = quiet(sim(ranger, ['vortexCharm']));
    const e = enemy(s, 280, 0, 1e9);
    steps(s, seconds(8.5));
    expect(Math.hypot(e.x - s.player.x, e.y - s.player.y)).toBeLessThan(140);
  });

  it('멈춘 회중시계: 40초마다 2초간 일반 적과 적 탄이 멈추고 받는 피해 +40%', () => {
    const s = quiet(sim(ranger, ['stoppedWatch']));
    steps(s, seconds(40.1));
    expect(s.extra.timeStopped).toBe(true);
    const e = enemy(s, 300);
    e.speed = 100;
    const x = e.x;
    s.spawnEnemyShot(s.player.x + 400, s.player.y, Math.PI, 200, 5, 6, 'test');
    const shotX = s.enemyShots[0].x;
    steps(s, 10);
    expect(e.x).toBe(x);
    expect(s.enemyShots[0].x).toBe(shotX);
    expect(s.extra.damageMultiplier(e)).toBeCloseTo(1.4);
    steps(s, seconds(2));
    expect(s.extra.timeStopped).toBe(false);
  });
});

describe('유물 추가 기획안: 피격·저체력·드랍', () => {
  it('보복의 맹세·고통의 저장고: 맞으면 4초간 +30%, 받은 피해를 저장해 회피로 3배 방출', () => {
    const s = quiet(sim(ranger, ['vengeance', 'painVault'], { god: false }));
    const e = enemy(s, 60, 0, 1e6);
    s.player.hp = 100;
    s.hurtPlayer(20, 'test');
    expect(s.extra.damageMultiplier(e)).toBeCloseTo(1.3);
    expect(s.extra.vault).toBeGreaterThan(0);
    s.player.invuln = 0;
    steps(s, 1, { ...IDLE_INPUT, dodge: true, moveX: 1 });
    expect(e.hp).toBeLessThan(1e6);
    expect(s.extra.vault).toBe(0);
    steps(s, seconds(4.2));
    expect(s.extra.damageMultiplier(e)).toBeCloseTo(1);
  });

  it('벼랑 끝의 춤: 체력 30% 이하에서 회피 대기시간 절반', () => {
    const s = quiet(sim(ranger, ['cliffDance']));
    const normal = s.relics.dodgeCooldown;
    s.player.hp = s.relics.maxHp * 0.2;
    expect(s.relics.dodgeCooldown).toBeCloseTo(normal / 2);
  });

  it('불사조의 재: 부활 수단이 없으면 한 번 체력 30%로 부활, 성냥이 발동하면 폭발과 +60%', () => {
    const s = quiet(sim(ranger, ['phoenixAsh'], { god: false }));
    s.player.hp = 5;
    s.hurtPlayer(500, 'test');
    steps(s, 1);
    expect(s.phase).not.toBe('ended');
    expect(s.player.hp).toBeCloseTo(s.relics.maxHp * 0.3);
    const t = quiet(sim(ranger, ['phoenixAsh', 'lastMatch'], { god: false }));
    const e = enemy(t, 100, 0, 1e6);
    t.player.hp = 5;
    t.hurtPlayer(500, 'test');
    expect(e.hp).toBeLessThan(1e6);
    expect(t.extra.damageMultiplier(e)).toBeCloseTo(1.6);
  });

  it('보석 폭풍: 자석으로 끌려온 보석은 모두 폭발한다', () => {
    const s = quiet(sim(ranger, ['gemStorm']));
    const e = enemy(s, 0, 0, 1e6);
    for (let i = 0; i < 5; i++) s.gems.push({ x: s.player.x + 600, y: s.player.y, value: 1, pulled: false });
    s.useItem('magnet');
    steps(s, seconds(2));
    expect(s.gems).toHaveLength(0);
    expect(e.hp).toBeLessThan(1e6);
  });

  it('행운의 일격: 행운에 비례한 확률로 피해 3배', () => {
    const s = quiet(sim(ranger, ['luckyStrike', 'clover']));
    const e = enemy(s, 300);
    const rolls = Array.from({ length: 400 }, () => s.extra.damageMultiplier(e));
    const crits = rolls.filter((m) => m > 2.9).length;
    expect(crits).toBeGreaterThan(5);
    expect(crits).toBeLessThan(120);
  });

  it('균열 핵 조각: 수호자가 죽은 자리에 핵이 일반 적을 끌어당기고 4초 뒤 폭발', () => {
    const s = quiet(sim(ranger, ['riftCore']));
    const elite = enemy(s, 300, 0, 1, 'elite');
    elite.maxHp = 10000;
    const e = enemy(s, 300, 200, 1e6);
    s.damageEnemy(elite, 5);
    steps(s, 1);
    while (s.phase === 'levelup') s.choose(0);
    expect(s.extra.cores).toHaveLength(1);
    steps(s, seconds(4.2));
    expect(Math.hypot(e.x - elite.x, e.y - elite.y)).toBeLessThan(150);
    expect(e.hp).toBeLessThan(1e6);
    expect(s.extra.cores).toHaveLength(0);
  });
});

describe('유물 추가 기획안: 주기 무기·범위', () => {
  it('과충전 배터리: 5번째 발동의 피해 2.5배·범위 +30%', () => {
    const s = quiet(sim(ranger, ['overcharge']));
    for (let i = 0; i < 4; i++) s.relics.onWeaponActivated('mine');
    expect(s.extra.weaponDamageMultiplier('mine')).toBe(1);
    s.relics.onWeaponActivated('mine');
    expect(s.extra.weaponDamageMultiplier('mine')).toBe(2.5);
    expect(s.extra.areaMultiplier('mine')).toBeCloseTo(1.3);
    expect(s.extra.weaponDamageMultiplier('chain')).toBe(1);
  });

  it('메아리 각인: 특수 무기로 처치하면 확률로 그 무기가 다시 발동', () => {
    const s = quiet(sim(ranger, ['echoBrand'], { presetUpgrades: { chain: 1 } }));
    s.step(IDLE_INPUT);
    const ready = () => (s.weapons as unknown as { ready: Map<string, number> }).ready.get('chain') ?? 0;
    (s.weapons as unknown as { ready: Map<string, number> }).ready.set('chain', s.elapsed + 10);
    for (let i = 0; i < 60 && ready() > s.elapsed + 5; i++) s.damageEnemy(enemy(s, 300, 0, 1), 5, 'chain');
    expect(ready()).toBeLessThan(s.elapsed + 1);
  });

  it('확장의 인장: 범위 +20%, 공격 속도 −8%, 로안 근접 거리도 늘어난다', () => {
    const s = sim(ranger, ['expansionSeal']);
    expect(s.extra.areaMultiplier()).toBeCloseTo(1.2);
    const base = sim(ranger).relics.fireRate;
    expect(s.relics.fireRate / base).toBeCloseTo(0.92);
    const r = sim(roan).roan.range;
    expect(sim(roan, ['expansionSeal']).roan.range / r).toBeCloseTo(1.2);
  });
});

describe('유물 추가 기획안: 균열 사수', () => {
  it('무기고 열쇠: 특수 무기 1종당 +5%, Lv3이면 +3% 추가', () => {
    const s = sim(ranger, ['armoryKey'], { presetUpgrades: { chain: 3, mine: 1 } });
    expect(s.extra.shotDamageMultiplier).toBeCloseTo(1 + 0.08 + 0.05);
  });

  it('융합 촉매: 합체 무기가 발동하면 1.5초간 발동 간격 −30%', () => {
    const s = quiet(sim(ranger, ['fusionCatalyst']));
    const base = s.relics.cooldownMultiplier;
    s.relics.onWeaponActivated('storm');
    expect(s.relics.cooldownMultiplier / base).toBeCloseTo(0.7);
    steps(s, seconds(1.6));
    expect(s.relics.cooldownMultiplier / base).toBeCloseTo(1);
  });

  it('탄피 폭풍: 기본 사격 20회마다 12방향 탄막', () => {
    const s = quiet(sim(ranger, ['casingStorm']));
    s.shotsFired = 19;
    const before = s.playerShots.length;
    s.extra.onVolley(20);
    expect(s.playerShots.length - before).toBe(12);
  });

  it('과열 총신: 30회 명중하면 5초간 명중 지점 폭발', () => {
    const s = quiet(sim(ranger, ['overheat']));
    const e = enemy(s, 300, 0, 1e9);
    const near = enemy(s, 330, 0, 1e9);
    for (let i = 0; i < 30; i++) s.damageEnemy(e, 1, 'basic');
    expect(s.extra.overheatUntil).toBeGreaterThan(s.elapsed);
    s.damageEnemy(e, 1, 'basic');
    expect(near.hp).toBeLessThan(1e9);
  });

  it('사수의 표적: 기본탄 3회 명중 → 특수 무기 피해 +40%, 죽으면 기본탄 6발', () => {
    const s = quiet(sim(ranger, ['marksman']));
    const e = enemy(s, 300, 0, 1e9);
    for (let i = 0; i < 3; i++) s.damageEnemy(e, 1, 'basic');
    expect(s.extra.damageMultiplier(e, 'mine')).toBeCloseTo(1.4);
    expect(s.extra.damageMultiplier(e, 'basic')).toBeCloseTo(1);
    const before = s.playerShots.length;
    e.hp = 1;
    s.damageEnemy(e, 5, 'mine');
    expect(s.playerShots.length - before).toBe(6);
  });
});

describe('유물 추가 기획안: 루멘', () => {
  it('마력 과부하: 전용 강화 10점 미만이면 발동하지 않는다', () => {
    const s = quiet(sim(chain, ['manaOverload']));
    expect(Array.from({ length: 50 }, () => s.extra.amplify(s.player)).some(Boolean)).toBe(false);
    (s as unknown as { masteryPower: number }).masteryPower = 10;
    const hits = Array.from({ length: 200 }, () => s.extra.amplify(s.player)).filter(Boolean).length;
    expect(hits).toBeGreaterThan(25);
    expect(hits).toBeLessThan(80);
  });

  it('이중 시전서: 연쇄 번개 루멘도 서리 포탑을 함께 설치한다', () => {
    const s = quiet(sim(chain, ['dualGrimoire']));
    enemy(s, 200, 0, 1e9);
    steps(s, seconds(3));
    expect(s.weapons.devices.some((d) => d.kind === 'turret')).toBe(true);
    const t = quiet(sim(chain));
    enemy(t, 200, 0, 1e9);
    steps(t, seconds(3));
    expect(t.weapons.devices.some((d) => d.kind === 'turret')).toBe(false);
  });

  it('뇌전 피뢰주: 6회 이상 이어진 연쇄 끝에 피뢰주가 서서 주변을 친다', () => {
    const s = quiet(sim(chain, ['thunderRod'], { presetUpgrades: { chainLinks: 3 } }));
    for (let i = 0; i < 8; i++) enemy(s, 60 + i * 50, 0, 1e9);
    steps(s, seconds(3));
    expect(s.extra.rods.length).toBeGreaterThan(0);
  });

  it('눈보라 핵: 포탑 3대 이상이면 눈보라 영역이 생긴다', () => {
    const s = quiet(sim(turret, ['blizzardCore'], { presetUpgrades: { turretMount: 2 } }));
    enemy(s, 150, 0, 1e9);
    steps(s, seconds(1.5));
    expect(s.weapons.devices.filter((d) => d.kind === 'turret').length).toBeGreaterThanOrEqual(3);
    expect(s.extra.blizzard).not.toBeNull();
  });

  it('마나 폭주 망토: 회피하면 연쇄 번개가 즉시 다시 발동', () => {
    const s = quiet(sim(chain, ['manaBurst']));
    enemy(s, 150, 0, 1e9);
    steps(s, seconds(0.5));
    const cd = () => s.weapons.chainCooldownRemaining;
    expect(cd()).toBeGreaterThan(0.5);
    steps(s, 1, { ...IDLE_INPUT, dodge: true, moveX: 1 });
    expect(cd()).toBeGreaterThan(0.5); // 그 틱 안에 다시 쏘고 대기시간이 새로 잡힌다
    const shots = s.weapons.effects.filter((fx) => fx.kind === 'chain').length;
    expect(shots).toBeGreaterThanOrEqual(1);
  });
});

describe('유물 추가 기획안: 로안', () => {
  it('전장의 함성: 장비마다 최대 체력 +10%·근접 피해 +8%, 각성 때 주변 적 기절', () => {
    const base = sim(roan, [], { presetLevel: 36 }).relics.maxHp;
    const s = quiet(sim(roan, ['warCry'], { presetLevel: 36 }));
    expect(s.relics.maxHp / base).toBeCloseTo(1.3);
    const e = enemy(s, 200);
    expect(s.extra.damageMultiplier(e, 'sword')).toBeCloseTo(1.24);
    steps(s, 1);
    expect(e.rootedUntil).toBeGreaterThan(s.elapsed + 1);
  });

  it('검기: 근접 공격 4회마다 공격 방향으로 관통 검기', () => {
    const s = quiet(sim(roan, ['bladeWave']));
    enemy(s, 80, 0, 1e9);
    let waves = 0;
    for (let i = 0; i < seconds(10) && s.roan.swings < 5; i++) {
      s.step(IDLE_INPUT);
      waves = Math.max(waves, s.playerShots.filter((shot) => shot.source === 'bladeWave').length);
    }
    expect(s.roan.swings).toBeGreaterThanOrEqual(5);
    expect(waves).toBeGreaterThanOrEqual(1);
  });

  it('반격의 달인·피바람: 회피 직후 첫 공격 +60%, 회복 1당 다음 공격 +2%', () => {
    const s = quiet(sim(roan, ['counterMaster', 'bloodWind']));
    steps(s, 1, { ...IDLE_INPUT, dodge: true, moveX: 1 });
    s.player.hp = 50;
    s.relics.heal(10);
    expect(s.extra.swingBonus()).toBeCloseTo(1.6 * 1.2);
    expect(s.extra.swingBonus()).toBe(1);
  });

  it('철벽 돌진: 회피 경로의 적에게 근접 피해를 주고 밀쳐낸다', () => {
    const s = quiet(sim(roan, ['ironCharge']));
    const e = enemy(s, 40, 0, 1e9);
    const x = e.x;
    steps(s, seconds(0.3), { ...IDLE_INPUT, dodge: true, moveX: 1 });
    expect(e.hp).toBeLessThan(1e9);
    expect(e.x).not.toBe(x);
  });
});
