import { describe, expect, it } from 'vitest';
import { CLOUD_SESSION_KEY, CloudSave } from '../src/storage/cloud';
import { defaultSave, mergeCloud, type SaveData } from '../src/storage/save';

function memoryStorage() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), map };
}

interface Call { url: string; method: string; headers: Record<string, string>; body: unknown }

/** Supabase 인증과 supabase/accounts.sql 의 서버 함수를 흉내 내는 가짜 서버 */
function fakeServer() {
  const calls: Call[] = [];
  const profiles = new Map<string, { meta: unknown; records: unknown; rev: number }>();
  const accounts = new Map<string, { password: string; meta: unknown; records: unknown; rev: number }>();
  const links = new Map<string, string>();
  let signups = 0;
  const fetchFn = async (url: string, init?: RequestInit) => {
    const headers = (init?.headers ?? {}) as Record<string, string>;
    const body = init?.body ? JSON.parse(String(init.body)) : undefined;
    calls.push({ url, method: init?.method ?? 'GET', headers, body });
    const ok = (json: unknown) => ({ ok: true, status: 200, json: async () => json });
    const fail = (message: string) => ({ ok: false, status: 400, json: async () => ({ code: 'P0001', message }) });
    if (url.endsWith('/auth/v1/signup')) {
      signups++;
      return ok({ access_token: `at${signups}`, refresh_token: `rt${signups}`, expires_in: 3600, user: { id: `user-${signups}`, is_anonymous: true } });
    }
    if (url.includes('/auth/v1/token?grant_type=refresh_token')) {
      return ok({ access_token: 'at-refreshed', refresh_token: 'rt-refreshed', expires_in: 3600, user: { id: 'user-1' } });
    }
    const token = headers.Authorization?.replace('Bearer ', '') ?? '';
    if (!token) return { ok: false, status: 401, json: async () => ({}) };
    const uid = token === 'at-refreshed' ? 'user-1' : `user-${token.slice(2)}`;
    const fn = url.split('/rest/v1/rpc/')[1];
    const linked = links.get(uid);
    switch (fn) {
      case 'pull_save': {
        if (linked) { const a = accounts.get(linked)!; return ok([{ account: linked, meta: a.meta, records: a.records, rev: a.rev }]); }
        const p = profiles.get(uid);
        return ok(p ? [{ account: null, ...p }] : []);
      }
      case 'push_save': {
        const row = { meta: body.p_meta, records: body.p_records, rev: body.p_rev };
        if (linked) accounts.set(linked, { ...accounts.get(linked)!, ...row });
        else profiles.set(uid, row);
        return ok(null);
      }
      case 'register_account':
        if (!/^[a-z0-9_]{3,16}$/.test(body.p_username)) return fail('invalid_username');
        if (body.p_password.length < 6) return fail('weak_password');
        if (accounts.has(body.p_username)) return fail('username_taken');
        accounts.set(body.p_username, { password: body.p_password, meta: body.p_meta, records: body.p_records, rev: body.p_rev });
        links.set(uid, body.p_username);
        profiles.delete(uid);
        return ok(null);
      case 'login_account': {
        const name = String(body.p_username).toLowerCase();
        const a = accounts.get(name);
        if (!a || a.password !== body.p_password) return fail('invalid_credentials');
        links.set(uid, name);
        return ok([{ account: name, meta: a.meta, records: a.records, rev: a.rev }]);
      }
      case 'logout_account':
        links.delete(uid);
        return ok(null);
    }
    return { ok: false, status: 404, json: async () => ({}) };
  };
  return { fetchFn, calls, profiles, accounts, get signups() { return signups; } };
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
    expect(server.profiles.get('user-1')).toMatchObject({ rev: 3, meta: { tokens: 30, purchases: { damage: 2 } } });
    now += 4000;
    const row = await cloud.pull();
    expect(server.calls.some((c) => c.url.includes('grant_type=refresh_token'))).toBe(true);
    expect(server.calls.at(-1)!.headers.Authorization).toBe('Bearer at-refreshed');
    expect(row).toMatchObject({ rev: 3, meta: { tokens: 30 } });
  });

  it('아이디로 회원가입하면 다른 브라우저에서 로그인해 같은 데이터를 쓰고, 로그아웃하면 게스트로 돌아간다', async () => {
    const server = fakeServer();
    const cfg = { url: 'https://x.supabase.co', key: 'pk' };
    const first = new CloudSave(memoryStorage(), server.fetchFn, cfg, () => 1000);
    await first.push(withMeta(31, { xp: 2 }, 1));
    expect(await first.register('Bad Name', 'secret1', withMeta(31, {}, 1))).toEqual({ ok: false, error: 'invalid_username' });
    expect(await first.register('tester', '123', withMeta(31, {}, 1))).toEqual({ ok: false, error: 'weak_password' });
    expect(await first.register('tester', 'secret1', withMeta(31, { xp: 2 }, 1))).toEqual({ ok: true });
    expect(await first.pull()).toMatchObject({ account: 'tester', meta: { tokens: 31 } });

    const second = new CloudSave(memoryStorage(), server.fetchFn, cfg, () => 1000);
    expect(await second.register('tester', 'other12', withMeta(0, {}, 1))).toEqual({ ok: false, error: 'username_taken' });
    expect(await second.login('tester', 'wrong1')).toEqual({ ok: false, error: 'invalid_credentials' });
    const login = await second.login('tester', 'secret1');
    expect(login).toMatchObject({ ok: true, row: { account: 'tester', meta: { tokens: 31, purchases: { xp: 2 } } } });

    await second.push(withMeta(50, { xp: 3 }, 4));
    expect(await first.pull()).toMatchObject({ account: 'tester', rev: 4, meta: { tokens: 50 } });

    expect(await second.logout()).toBe(true);
    expect(await second.pull()).toBeNull();
    expect(await first.pull()).toMatchObject({ account: 'tester' });
  });

  it('로그인하면 상점 내역은 계정 쪽을 그대로 쓴다', () => {
    const local = withMeta(200, { damage: 5 }, 9);
    const merged = mergeCloud(local, { account: 'tester', meta: { tokens: 3, totalEarned: 13, purchases: { xp: 1 } }, records: {}, rev: 2 }, true);
    expect(merged.meta).toEqual({ tokens: 3, totalEarned: 13, purchases: { xp: 1 } });
    expect(merged.cloudRev).toBe(2);
  });

  it('서버에 닿지 않아도 예외 없이 끝난다', async () => {
    const cloud = new CloudSave(memoryStorage(), async () => { throw new Error('offline'); });
    expect(await cloud.pull()).toBeNull();
    await expect(cloud.push(defaultSave())).resolves.toBeUndefined();
    expect(await cloud.login('tester', 'secret1')).toEqual({ ok: false, error: 'offline' });
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
