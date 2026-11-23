import { describe, expect, it } from 'vitest';
import type { RunResult } from '../src/core/types';
import { defaultSave, loadSave, parseSave, purchaseMeta, recordRun, SAVE_KEY, SAVE_VERSION, writeSave } from '../src/storage/save';
import { MemoryStorage } from './helpers';

const result = (over: Partial<RunResult> = {}): RunResult => ({
  outcome: 'defeat',
  cause: 'death',
  killedBy: 'x',
  survivalTime: 300,
  kills: 100,
  killsByKind: {},
  level: 8,
  upgrades: [],
  pickOrder: [],
  seed: 1,
  bossHpRatio: null,
  assisted: false,
  rerollsUsed: 0,
  revived: 0,
  itemsCollected: 0,
  ...over,
});

describe('로컬 저장', () => {
  it('저장 데이터가 없으면 기본값', () => {
    expect(parseSave(null)).toEqual({ data: defaultSave(), status: 'missing' });
  });

  it('손상된 JSON 이면 기본값으로 시작한다', () => {
    for (const raw of ['{', 'not json', '[]', '123', 'null', '"str"']) {
      const r = parseSave(raw);
      expect(r.data).toEqual(defaultSave());
      expect(['corrupt']).toContain(r.status);
    }
  });

  it('버전이 다르면 기본값으로 시작한다', () => {
    const r = parseSave(JSON.stringify({ version: 999, settings: { volume: 0.1 } }));
    expect(r.status).toBe('version');
    expect(r.data).toEqual(defaultSave());
  });

  it('필드 일부가 잘못되면 그 필드만 기본값으로 바꾼다', () => {
    const r = parseSave(
      JSON.stringify({ version: SAVE_VERSION, settings: { volume: 7 }, records: { runs: 3, wins: -1, bestSurvival: 'abc', bestKills: 50, fastestWin: 850 } }),
    );
    expect(r.status).toBe('ok');
    expect(r.data.settings.volume).toBe(defaultSave().settings.volume);
    expect(r.data.records).toEqual({ runs: 3, wins: 0, bestSurvival: 0, bestKills: 50, fastestWin: 850 });
  });

  it('버전 1 저장 데이터는 음량·기록을 유지한 채 버전 2(토큰 0)로 옮겨진다', () => {
    const v1 = { version: 1, settings: { volume: 0.3 }, records: { runs: 4, wins: 1, bestSurvival: 870, bestKills: 1200, fastestWin: 870 } };
    const r = parseSave(JSON.stringify(v1));
    expect(r.status).toBe('ok');
    expect(r.data.version).toBe(2);
    expect(r.data.settings.volume).toBe(0.3);
    expect(r.data.records).toEqual(v1.records);
    expect(r.data.meta).toEqual({ tokens: 0, totalEarned: 0, purchases: {} });
  });

  it('구매 내역의 잘못된 값·없는 항목·최대 초과는 걸러진다', () => {
    const r = parseSave(JSON.stringify({ version: 2, meta: { tokens: 55, totalEarned: 90, purchases: { hp: 3, damage: 99, nope: 2, revive: 'x' } } }));
    expect(r.data.meta).toEqual({ tokens: 55, totalEarned: 90, purchases: { hp: 3 } });
  });

  it('저장 후 다시 읽으면 같은 값 (새로고침 후 유지)', () => {
    const st = new MemoryStorage();
    const d = defaultSave();
    d.settings.volume = 0.25;
    d.records.bestKills = 321;
    expect(writeSave(st, d)).toBe(true);
    expect(JSON.parse(st.getItem(SAVE_KEY)!).version).toBe(SAVE_VERSION);
    expect(loadSave(st)).toEqual({ data: d, status: 'ok' });
  });

  it('저장소 접근이 막혀 있어도 예외 없이 기본값으로 동작한다', () => {
    const broken = { getItem: () => { throw new Error('denied'); }, setItem: () => { throw new Error('denied'); } };
    expect(loadSave(broken).data).toEqual(defaultSave());
    expect(writeSave(broken, defaultSave())).toBe(false);
    expect(loadSave(null).status).toBe('unavailable');
  });

  it('최고 기록 갱신', () => {
    let d = defaultSave();
    ({ data: d } = recordRun(d, result({ survivalTime: 300, kills: 100 })));
    const r2 = recordRun(d, result({ survivalTime: 500, kills: 90 }));
    expect(r2.newRecords).toEqual(['survival']);
    d = r2.data;
    const r3 = recordRun(d, result({ outcome: 'victory', cause: 'boss', survivalTime: 860, kills: 1200 }));
    expect(r3.newRecords).toEqual(expect.arrayContaining(['survival', 'kills', 'firstWin']));
    expect(r3.data.records).toMatchObject({ runs: 3, wins: 1, bestSurvival: 860, bestKills: 1200, fastestWin: 860 });
    const r4 = recordRun(r3.data, result({ outcome: 'victory', cause: 'boss', survivalTime: 845, kills: 10 }));
    expect(r4.newRecords).toEqual(['fastestWin']);
    expect(r4.data.records.fastestWin).toBe(845);
  });

  it('판이 끝나면 토큰을 받고, 토큰으로 영구 강화를 산다', () => {
    let d = defaultSave();
    const r = recordRun(d, result({ survivalTime: 605, killsByKind: { chaser: 130, charger: 10, elite: 2 } }));
    // 생존 10분 × 2 + 처치 140/50 = 2 + 엘리트 2 × 5 = 32
    expect(r.tokens).toEqual({ survival: 20, kills: 2, elites: 10, victory: 0, total: 32 });
    d = r.data;
    expect(d.meta.tokens).toBe(32);
    const win = recordRun(d, result({ outcome: 'victory', cause: 'boss', survivalTime: 860, killsByKind: {} }));
    expect(win.tokens!.victory).toBe(30);
    d = win.data;
    expect(d.meta.totalEarned).toBe(32 + 28 + 30);
    const bought = purchaseMeta(d, 'hp')!;
    expect(bought.meta.tokens).toBe(d.meta.tokens - 10);
    expect(bought.meta.purchases.hp).toBe(1);
    expect(purchaseMeta({ ...d, meta: { ...d.meta, tokens: 5 } }, 'hp')).toBeNull(); // 토큰 부족
    expect(purchaseMeta({ ...d, meta: { ...d.meta, tokens: 999, purchases: { revive: 1 } } }, 'revive')).toBeNull(); // 최대 단계
  });

  it('개발 옵션을 쓴 판은 기록에 반영하지 않는다', () => {
    const d = defaultSave();
    const r = recordRun(d, result({ assisted: true, kills: 9999 }));
    expect(r.data).toBe(d);
    expect(r.newRecords).toEqual([]);
    expect(r.tokens).toBeNull();
  });
});
