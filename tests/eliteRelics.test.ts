import { describe, expect, it } from 'vitest';
import { LUMEN, type Loadout } from '../src/config/characters';
import { ESSENCE_MAX_STACK, RELICS, RELIC_IDS, relicAllowed, type RelicId } from '../src/config/relics';
import { rollRelics } from '../src/core/relics';
import { Rng } from '../src/core/rng';
import { GameSim } from '../src/core/sim';
import { IDLE_INPUT } from '../src/core/types';

const roan: Loadout = { character: 'roan' };
const chain: Loadout = { character: 'lumen', weapon: 'chain' };
const turret: Loadout = { character: 'lumen', weapon: 'turret' };

function sim(loadout: Loadout, relics: RelicId[] = [], extra: Partial<ConstructorParameters<typeof GameSim>[0]> = {}): GameSim {
  const s = new GameSim({ seed: 31, god: true, loadout, ...extra });
  for (const id of relics) s.relics.acquire(id);
  return s;
}

function target(s: GameSim, dx: number, dy = 0, kind: 'chaser' | 'elite' = 'chaser') {
  const enemy = s.spawnEnemy(kind, s.player.x + dx, s.player.y + dy);
  enemy.hp = enemy.maxHp = 1000;
  enemy.speed = 0;
  return enemy;
}

function steps(s: GameSim, n: number): void {
  for (let i = 0; i < n; i++) s.step(IDLE_INPUT);
}

describe('균열 수호자 유물 후보', () => {
  const pool = (loadout: Loadout) => RELIC_IDS.filter((id) => RELICS[id].source === 'elite' && relicAllowed(id, loadout));

  it('로안은 근접 6개·상위 무기 전용 39개·전체 공용 2개, 루멘은 무기별 15개의 균열 수호자 유물을 받는다', () => {
    expect(pool(roan)).toHaveLength(47);
    expect(pool(chain)).toHaveLength(15);
    expect(pool(turret)).toHaveLength(15);
    expect(pool(chain).some((id) => id.startsWith('turret') || id === 'winterLantern')).toBe(false);
    expect(pool(turret).some((id) => id.startsWith('chain') || id === 'crown')).toBe(false);
    expect(pool({ character: 'ranger' }).some((id) => id.startsWith('sword') || id.startsWith('lumen'))).toBe(false);
    expect(pool(roan).some((id) => id.startsWith('lumen'))).toBe(false);
  });

  it('유물 후보가 3개보다 적으면 수호자의 정수로 채우고, 정수는 최대 5회까지 중첩된다', () => {
    const s = sim(roan, pool(roan));
    const enemy = target(s, 400, 0, 'elite');
    enemy.hp = 1;
    s.damageEnemy(enemy, 10_000);
    s.step(IDLE_INPUT);
    while (s.phase === 'levelup' && s.choices[0]?.kind !== 'essence') s.choose(0);
    expect(s.phase).toBe('levelup');
    expect(s.choices.map((c) => c.kind)).toEqual(['essence', 'essence', 'essence']);
    expect(s.reroll()).toBe(false);
    const life = s.choices.findIndex((c) => c.kind === 'essence' && c.id === 'life');
    const maxHp = s.relics.maxHp;
    s.player.hp = 50;
    expect(s.choose(life)).toBe(true);
    expect(s.relics.maxHp).toBe(maxHp + 15);
    expect(s.player.hp).toBe(65);
    expect(s.relics.owned.has('weaponThrow')).toBe(true);
    expect([...s.relics.owned].every((id) => Object.hasOwn(RELICS, id))).toBe(true);

    s.essences.power = ESSENCE_MAX_STACK;
    s.essences.life = ESSENCE_MAX_STACK;
    const fill: Parameters<GameSim['choose']>[0][] = [];
    (s as unknown as { fillEssences(c: unknown[]): void }).fillEssences(fill);
    expect(fill).toEqual([{ kind: 'essence', id: 'swift' }]);
    expect(s.relics.damageMultiplier(enemy, false)).toBeCloseTo(1 + 0.04 * ESSENCE_MAX_STACK);
  });

  it('루멘에게는 신속 정수가 나오지 않는다', () => {
    const s = sim(chain);
    const fill: unknown[] = [];
    (s as unknown as { fillEssences(c: unknown[]): void }).fillEssences(fill);
    expect(fill).toHaveLength(2);
    expect(fill.some((c) => (c as { id: string }).id === 'swift')).toBe(false);
  });

  it('후보가 충분하면 정수가 섞이지 않는다', () => {
    const rng = new Rng(3);
    expect(rollRelics('elite', rng, new Set(), roan)).toHaveLength(3);
  });
});

describe('루멘 균열 수호자 유물', () => {
  it('마력 증폭 수정: 전용 강화 1점당 보너스 1.5배, 최대 체력 −10%', () => {
    const s = sim(chain, ['lumenCrystal'], { presetUpgrades: { chainLinks: 2 } });
    const base = sim(chain, [], { presetUpgrades: { chainLinks: 2 } });
    const points = (base.starterDamageMultiplier / LUMEN.baseDamage - 1) / LUMEN.damagePerPoint;
    expect(points).toBeGreaterThan(0);
    expect(s.starterDamageMultiplier).toBeCloseTo(LUMEN.baseDamage * (1 + points * LUMEN.damagePerPoint * 1.5));
    expect(s.relics.maxHp).toBeCloseTo(s.stats.maxHp * 0.9);
  });

  it('현자의 시야: 첫 대상 탐색 거리와 포탑 사격 거리 +25%', () => {
    const far = (390 + 0) * 0.5 * 1.25 - 5;
    const without = sim(chain);
    target(without, far);
    without.step(IDLE_INPUT);
    expect(without.hitsByAttack.chain).toBeUndefined();
    const s = sim(chain, ['lumenSight']);
    target(s, far);
    s.step(IDLE_INPUT);
    expect(s.hitsByAttack.chain).toBe(1);
    const t = sim(turret, ['lumenSight']);
    t.step(IDLE_INPUT);
    expect(t.weapons.devices[0].r).toBeCloseTo(340 * 1.25);
  });

  it('약점 표식의 룬: 전용 무기에 3번 맞은 적은 4초간 받는 피해 +15%', () => {
    const s = sim(chain, ['lumenRune']);
    const enemy = target(s, 90);
    for (let i = 0; i < 2; i++) s.relics.onLumenHit(enemy);
    expect(s.relics.damageMultiplier(enemy, false)).toBe(1);
    s.relics.onLumenHit(enemy);
    expect(s.relics.damageMultiplier(enemy, false)).toBeCloseTo(1.15);
    s.tick += 4.1 * 60;
    expect(s.relics.damageMultiplier(enemy, false)).toBe(1);
  });

  it('마나 순환 고리: 25마리 처치마다 전용 무기 대기시간 초기화', () => {
    const s = sim(chain, ['lumenCycle']);
    target(s, 90);
    s.step(IDLE_INPUT);
    expect(s.hitsByAttack.chain).toBe(1);
    for (let i = 0; i < 25; i++) {
      const enemy = target(s, 900);
      s.damageEnemy(enemy, 10_000);
    }
    s.step(IDLE_INPUT);
    expect(s.hitsByAttack.chain).toBe(2);
  });

  it('정전기 망토: 피격 시 반경 160px에 전용 무기 1타의 60%, 재사용 2초', () => {
    const s = sim(chain, ['lumenCloak'], { god: false });
    const enemy = target(s, 120);
    s.hurtPlayer(1, 'test');
    expect(1000 - enemy.hp).toBeCloseTo(s.weapons.specialistHitDamage() * 0.6);
    s.player.invuln = 0;
    s.hurtPlayer(1, 'test');
    expect(1000 - enemy.hp).toBeCloseTo(s.weapons.specialistHitDamage() * 0.6);
  });

  it('집중의 지팡이: 멈추면 전용 무기 피해 +20%, 움직이면 −5%', () => {
    const still = sim(chain, ['lumenStaff']);
    const base = sim(chain);
    expect(still.weapons.specialistHitDamage()).toBeCloseTo(base.weapons.specialistHitDamage() * 1.2);
    still.step({ ...IDLE_INPUT, moveX: 1 });
    expect(still.weapons.specialistHitDamage()).toBeCloseTo(base.weapons.specialistHitDamage() * 0.95);
  });

  it('뇌운 병: 첫 대상 자리에서 1초마다 세 번 낙뢰', () => {
    const s = sim(chain, ['chainCloud']);
    const enemy = target(s, 90);
    s.step(IDLE_INPUT);
    expect(s.weapons.clouds).toHaveLength(1);
    const after = enemy.hp;
    enemy.x = 9999; // 다음 연쇄가 닿지 않게 옮기고 뇌운 범위 안의 새 적으로 확인
    const inCloud = target(s, 90 + 60);
    s.tick += 0;
    steps(s, Math.round(3.2 * 60));
    expect(after).toBe(enemy.hp);
    expect(inCloud.hp).toBeLessThan(1000);
    expect(s.weapons.clouds.length).toBeGreaterThan(0);
  });

  it('과부하 축전지: 6회 이상 이어지면 마지막 대상 자리에서 폭발', () => {
    const run = (relics: RelicId[]) => {
      const s = sim(chain, relics, { presetUpgrades: { chainLinks: 6 } });
      for (const x of [90, 190, 290, 390, 490, 590, 690]) target(s, x);
      s.step(IDLE_INPUT);
      return s.hitsByAttack.chain ?? 0;
    };
    expect(run(['chainOverload'])).toBeGreaterThan(run([]));
  });

  it('되튐 증폭기: 되튐 피해 45·40·35%, 감쇠 최소 0.5, 발동 간격 +10%', () => {
    const s = sim(chain, ['chainRebound'], { presetUpgrades: { chainLinks: 6 } });
    const first = target(s, 90);
    target(s, 190);
    s.step(IDLE_INPUT);
    const base = s.stats.damage * 1.85 * s.starterDamageMultiplier;
    const repeat = [1, 0.45, 0.40, 0.35, 0.35];
    const expected = base * repeat.reduce((sum, f, i) => sum + f * Math.max(0.5, 0.76 ** (i * 2)), 0);
    expect(1000 - first.hp).toBeCloseTo(expected);
  });

  it('이중 방전 코일: 일부 발동은 0.2초 뒤 피해 60%로 한 번 더 이어진다', () => {
    const s = sim(chain, ['chainDouble']);
    target(s, 90);
    steps(s, 60 * 40);
    const casts = (s.hitsByAttack.chain ?? 0);
    const base = sim(chain);
    target(base, 90);
    steps(base, 60 * 40);
    expect(casts).toBeGreaterThan(base.hitsByAttack.chain ?? 0);
  });

  it('피뢰 표식: 연쇄에 맞은 적이 쓰러지면 주변 두 적에게 튀고, 첫 대상 피해 −10%', () => {
    const s = sim(chain, ['chainRod']);
    const marked = target(s, 90);
    s.step(IDLE_INPUT);
    const plain = sim(chain);
    const ref = target(plain, 90);
    plain.step(IDLE_INPUT);
    expect(1000 - marked.hp).toBeCloseTo((1000 - ref.hp) * 0.9);
    const a = target(s, 90, 150);
    const b = target(s, 90, -150);
    s.damageEnemy(marked, 10_000, 'relic');
    s.step(IDLE_INPUT);
    expect(a.hp).toBeLessThan(1000);
    expect(b.hp).toBeLessThan(1000);
  });

  it('전도체 장갑: 튐 거리 +40%', () => {
    const run = (relics: RelicId[]) => {
      const s = sim(chain, relics);
      target(s, 90);
      target(s, 90 + 330);
      s.step(IDLE_INPUT);
      return s.hitsByAttack.chain;
    };
    expect(run([])).toBe(1);
    expect(run(['chainConductor'])).toBeGreaterThan(1);
  });

  it('영구 동토 핵: 둔화 1.5초, 둔화된 적이 다시 맞으면 0.4초 빙결, 포탑 피해 −10%', () => {
    const s = sim(turret, ['turretPermafrost']);
    const enemy = target(s, 120);
    s.step(IDLE_INPUT);
    expect(enemy.slowUntil).toBeCloseTo(s.elapsed + 1.5);
    expect(enemy.rootedUntil).toBe(0);
    steps(s, 40);
    expect(enemy.rootedUntil).toBeGreaterThan(s.elapsed);
  });

  it('저격 망원경: 사격 거리 +30%, 250px보다 먼 적에게 +20%', () => {
    const run = (relics: RelicId[]) => {
      const s = sim(turret, relics);
      const enemy = target(s, 300);
      s.step(IDLE_INPUT);
      return 1000 - enemy.hp;
    };
    expect(run(['turretScope']) / run([])).toBeCloseTo(1.2);
  });

  it('자폭 냉각기: 포탑이 사라질 때 반경 120px 서리 폭발', () => {
    const s = sim(turret, ['turretBlast']);
    s.step(IDLE_INPUT);
    const device = s.weapons.devices[0];
    const enemy = target(s, 900);
    enemy.x = device.x + 100;
    enemy.y = device.y;
    device.age = device.duration - 0.001;
    device.next = Infinity;
    s.step(IDLE_INPUT);
    expect(enemy.hp).toBeLessThan(1000);
  });

  it('산탄 장전기: 네 번째 사격은 3갈래 산탄', () => {
    const s = sim(turret, ['turretShotgun']);
    for (const [x, y] of [[200, 0], [200, 60], [200, -60]]) target(s, x, y);
    for (let i = 0; i < 400 && (s.weapons.devices[0]?.shots ?? 0) < 4; i++) s.step(IDLE_INPUT);
    expect(s.weapons.devices[0].shots).toBe(4);
    expect(s.hitsByAttack.turret).toBe(3 + 3);
  });

  it('이동식 포대: 포탑이 초당 60px로 따라오고 지속시간 −15%', () => {
    const s = sim(turret, ['turretMobile']);
    s.step(IDLE_INPUT);
    const device = s.weapons.devices[0];
    expect(device.duration).toBeCloseTo(6 * 0.85);
    const x = device.x;
    s.player.x += 200;
    steps(s, 60);
    expect(device.x - x).toBeCloseTo(60, 0);
  });

  it('서리 공명기: 200px 안에 다른 포탑이 있으면 사격 간격 −15%', () => {
    const run = (relics: RelicId[]) => {
      const s = sim(turret, relics, { presetUpgrades: { turretMount: 1 } });
      target(s, 200);
      s.step(IDLE_INPUT);
      return s.weapons.devices.find((d) => d.shots)!.next;
    };
    expect(run(['turretResonance']) / run([])).toBeCloseTo(0.85, 1);
  });
});
