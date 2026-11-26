import { describe, expect, it } from 'vitest';
import { CLOUD_SESSION_KEY, CloudSave } from '../src/storage/cloud';
import { defaultSave, mergeCloud, type SaveData } from '../src/storage/save';

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }

/** Supabase 인증·REST 를 흉내 내는 가짜 서버 */
function fakeServer() {
  const calls: Call[] = [];
  const rows = new Map<string, { meta: unknown; records: unknown; rev: number }>();
  let signups = 0;
  const fetchFn = async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', headers, body });
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
    if (url.endsWith('/auth/v1/signup')) {
      signups++;
      return ok({ access_token: `at${signups}`, refresh_token: `rt${signups}`, expires_in: 3600, user: { id: `user-${signups}`, is_anonymous: true } });
    }
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
      return ok({ access_token: 'at-refreshed', refresh_token: 'rt-refreshed', expires_in: 3600, user: { id: 'user-1' } });
    }
    const user = headers.Authorization?.replace('Bearer ', '') ?? '';
    if (!user) return { ok: false, status: 401, json: async () => ({}) };
    if (url.includes('/rest/v1/profiles?select=')) {
      const id = decodeURIComponent(url.split('user_id=eq.')[1]);
      return ok(rows.has(id) ? [rows.get(id)] : []);
    }
    if (url.includes('/rest/v1/profiles?on_conflict=user_id')) {
      const b = body as { user_id: string; meta: unknown; records: unknown; rev: number };
      rows.set(b.user_id, { meta: b.meta, records: b.records, rev: b.rev });
      return ok(null);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, calls, rows, get signups() { return signups; } };
}

const withMeta = (tokens: number, purchases: Record<string, number>, rev?: number): SaveData => ({
  ...defaultSave(), meta: { tokens, totalEarned: tokens + 10, purchases }, ...(rev ? { cloudRev: rev } : {}),
});

describe('계정 저장 (익명 계정)', () => {
  it('세션이 없으면 익명 계정을 만들고, 다음 접속에서는 저장된 세션을 다시 쓴다', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    const cloud = new CloudSave(storage, server.fetchFn, { url: 'https://x.supabase.co', key: 'pk' }, () => 1000);
    expect(await cloud.pull()).toBeNull();
    expect(server.signups).toBe(1);
    expect(server.calls[0].headers.apikey).toBe('pk');
    expect(JSON.parse(storage.getItem(CLOUD_SESSION_KEY)!).userId).toBe('user-1');

    const again = new CloudSave(storage, server.fetchFn, { url: 'https://x.supabase.co', key: 'pk' }, () => 1000);
    await again.pull();
    expect(server.signups).toBe(1);
    expect(server.calls.at(-1)!.headers.Authorization).toBe('Bearer at1');
  });

  it('만료가 가까운 세션은 새로 고치고, 올린 상점 내역을 다시 받아 온다', async () => {
    const storage = memoryStorage();
    const server = fakeServer();
    let now = 1000;
    const cloud = new CloudSave(storage, server.fetchFn, { url: 'https://x.supabase.co', key: 'pk' }, () => now);
    await cloud.push(withMeta(30, { damage: 2 }, 3));
    expect(server.rows.get('user-1')).toMatchObject({ rev: 3, meta: { tokens: 30, purchases: { damage: 2 } } });
    now += 4000;
    const row = await cloud.pull();
    expect(server.calls.some((c) => c.url.includes('grant_type=refresh_token'))).toBe(true);
    expect(server.calls.at(-1)!.headers.Authorization).toBe('Bearer at-refreshed');
    expect(row).toMatchObject({ rev: 3, meta: { tokens: 30 } });
  });

  it('서버에 닿지 않아도 예외 없이 끝난다', async () => {
    const cloud = new CloudSave(memoryStorage(), async () => { throw new Error('offline'); });
    expect(await cloud.pull()).toBeNull();
    await expect(cloud.push(defaultSave())).resolves.toBeUndefined();
  });
});

describe('브라우저 저장과 계정 저장 합치기', () => {
  it('저장 번호가 큰 쪽의 상점 내역을 쓰고, 기록은 항목마다 더 좋은 값을 쓴다', () => {
    const local = { ...withMeta(5, { damage: 1 }, 2), records: { runs: 10, wins: 2, bestSurvival: 500, bestKills: 900, fastestWin: 700 } };
    const newer = mergeCloud(local, { meta: { tokens: 40, totalEarned: 90, purchases: { damage: 3, hp: 2 } }, records: { runs: 4, wins: 3, bestSurvival: 800, bestKills: 100, fastestWin: 650 }, rev: 5 });
    expect(newer.meta).toEqual({ tokens: 40, totalEarned: 90, purchases: { damage: 3, hp: 2 } });
    expect(newer.records).toEqual({ runs: 10, wins: 3, bestSurvival: 800, bestKills: 900, fastestWin: 650 });
    expect(newer.cloudRev).toBe(5);

    const older = mergeCloud(local, { meta: { tokens: 1, totalEarned: 15, purchases: { damage: 5 } }, records: {}, rev: 1 });
    expect(older.meta).toEqual(local.meta);
    expect(older.cloudRev).toBe(2);
  });

  it('누적 획득 토큰이 더 많은 쪽을 먼저 본다: 저장 번호가 빠진 옛 저장의 토큰을 잃지 않는다', () => {
    const oldTab = withMeta(20, {});
    const merged = mergeCloud(oldTab, { meta: { tokens: 0, totalEarned: 0, purchases: {} }, records: {}, rev: 4 });
    expect(merged.meta.tokens).toBe(20);
    expect(merged.cloudRev).toBe(4);
    const lessEarned = mergeCloud(withMeta(5, { damage: 1 }, 9), { meta: { tokens: 40, totalEarned: 90, purchases: {} }, records: {}, rev: 1 });
    expect(lessEarned.meta.tokens).toBe(40);
  });

  it('서버 값도 브라우저 저장과 같은 검증을 거친다', () => {
    const merged = mergeCloud(defaultSave(), { meta: { tokens: -5, totalEarned: 'x', purchases: { damage: 999, unknown: 3 } }, records: null, rev: 1 });
    expect(merged.meta.tokens).toBe(0);
    expect(merged.meta.totalEarned).toBe(0);
    expect(merged.meta.purchases.damage ?? 0).toBeLessThanOrEqual(5);
    expect(merged.meta.purchases).not.toHaveProperty('unknown');
  });
});
