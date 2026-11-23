import { describe, expect, it } from 'vitest';
import type { RunResult } from '../src/core/types';
import { defaultSave, loadSave, parseSave, recordRun, SAVE_KEY, SAVE_VERSION, writeSave } from '../src/storage/save';
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

  it('개발 옵션을 쓴 판은 기록에 반영하지 않는다', () => {
    const d = defaultSave();
    const r = recordRun(d, result({ assisted: true, kills: 9999 }));
    expect(r.data).toBe(d);
    expect(r.newRecords).toEqual([]);
  });
});
