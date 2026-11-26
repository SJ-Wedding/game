import { cloudRecords, type CloudRow, type SaveData, type StorageLike } from './save';

/**
 * 계정 저장 (Supabase).
 * 브라우저마다 익명 로그인 사용자가 있고, 게스트 데이터는 그 사용자에 저장된다.
 * 아이디로 회원가입·로그인하면 서버 함수(supabase/accounts.sql)가 이 브라우저를 아이디 계정에 연결해, 다른 브라우저에서도 같은 데이터를 쓴다.
 * 브라우저 저장이 먼저이고, 서버에 닿지 않아도 게임은 그대로 동작한다.
 * 공개(publishable) 키는 원래 브라우저에 노출되는 키이며, 각 계정은 행 단위 권한(RLS)으로 자기 행만 읽고 쓴다.
 */
export const CLOUD_CONFIG = {
  url: 'https://ntjfolhlxnhquvszlmsu.supabase.co',
  key: 'sb_publishable_vxV8wMtf9rhHFUKZzOiR1Q_tJiLkEjO',
} as const;

export const CLOUD_SESSION_KEY = 'rift-arena/cloud-session';

interface Session {
  accessToken: string;
  refreshToken: string;
  /** 만료 시각 (초, epoch) */
  expiresAt: number;
  userId: string;
}

/** 회원가입·로그인 결과. error 는 서버가 돌려준 사유 (username_taken, invalid_credentials, weak_password, invalid_username, offline 등) */
export type AccountResult = { ok: true } | { ok: false; error: string };

type FetchLike = (input: string, init?: RequestInit) => Promise<Pick<Response, 'ok' | 'status' | 'json'>>;

export class CloudSave {
  private session: Session | null = null;
  private pushing: Promise<void> = Promise.resolve();

  constructor(
    private readonly storage: StorageLike | null,
    private readonly fetchFn: FetchLike = (input, init) => fetch(input, init),
    private readonly config: { url: string; key: string } = CLOUD_CONFIG,
    private readonly now: () => number = () => Date.now() / 1000,
  ) {}

  /** 저장된 세션을 쓰고, 만료가 가까우면 갱신하고, 없으면 익명 계정을 만든다 */
  async ensureSession(): Promise<Session | null> {
    if (!this.session) this.session = this.readSession();
    if (this.session && this.session.expiresAt - 60 > this.now()) return this.session;
    if (this.session) {
      const refreshed = await this.auth('token?grant_type=refresh_token', { refresh_token: this.session.refreshToken });
      if (refreshed) return refreshed;
    }
    return this.auth('signup', { data: {} });
  }

  /** 이 브라우저의 저장 데이터 (아이디로 로그인했으면 그 계정, 아니면 게스트). 없거나 실패하면 null */
  async pull(): Promise<CloudRow | null> {
    const r = await this.rpc('pull_save', {});
    const rows = r.ok ? (r.data as CloudRow[] | null) : null;
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  /** 상점 내역과 기록을 서버에 올린다. 앞선 업로드가 끝난 뒤 차례로 보낸다 */
  push(data: SaveData): Promise<void> {
    this.pushing = this.pushing
      .then(() => this.rpc('push_save', { p_meta: data.meta, p_records: cloudRecords(data), p_rev: data.cloudRev ?? 0 }))
      .then(() => undefined, () => undefined);
    return this.pushing;
  }

  /** 아이디 회원가입: 지금 진행 상황으로 계정을 만들고 이 브라우저를 연결한다 */
  async register(username: string, password: string, data: SaveData): Promise<AccountResult> {
    await this.pushing;
    const r = await this.rpc('register_account', { p_username: username, p_password: password, p_meta: data.meta, p_records: cloudRecords(data), p_rev: data.cloudRev ?? 0 });
    return r.ok ? { ok: true } : { ok: false, error: r.error };
  }

  /** 아이디 로그인: 이 브라우저를 계정에 연결하고 계정 데이터를 돌려준다 */
  async login(username: string, password: string): Promise<AccountResult & { row?: CloudRow }> {
    await this.pushing;
    const r = await this.rpc('login_account', { p_username: username, p_password: password });
    const rows = r.ok ? (r.data as CloudRow[] | null) : null;
    return r.ok && Array.isArray(rows) && rows[0] ? { ok: true, row: rows[0] } : { ok: false, error: r.ok ? 'unknown' : r.error };
  }

  /** 로그아웃: 이 브라우저와 계정의 연결만 끊는다 */
  async logout(): Promise<boolean> {
    await this.pushing;
    return (await this.rpc('logout_account', {})).ok;
  }

  private async rpc(name: string, args: unknown): Promise<{ ok: true; data: unknown } | { ok: false; error: string }> {
    const s = await this.ensureSession();
    if (!s) return { ok: false, error: 'offline' };
    const res = await this.request(`rest/v1/rpc/${name}`, { method: 'POST', body: JSON.stringify(args) }, s);
    if (!res) return { ok: false, error: 'offline' };
    const body = await res.json().catch(() => null) as { message?: string } | unknown;
    if (!res.ok) return { ok: false, error: (body as { message?: string } | null)?.message ?? `http_${res.status}` };
    return { ok: true, data: body };
  }

  private async auth(path: string, body: unknown): Promise<Session | null> {
    const res = await this.request(`auth/v1/${path}`, { method: 'POST', body: JSON.stringify(body) }, null);
    if (!res?.ok) return null;
    const json = (await res.json()) as { access_token?: string; refresh_token?: string; expires_at?: number; expires_in?: number; user?: { id?: string } };
    if (!json.access_token || !json.refresh_token || !json.user?.id) return null;
    const session: Session = {
      accessToken: json.access_token,
      refreshToken: json.refresh_token,
      expiresAt: json.expires_at ?? this.now() + (json.expires_in ?? 3600),
      userId: json.user.id,
    };
    this.session = session;
    try {
      this.storage?.setItem(CLOUD_SESSION_KEY, JSON.stringify(session));
    } catch { /* 저장소가 막혀 있으면 이번 접속 동안만 쓴다 */ }
    return session;
  }

  private readSession(): Session | null {
    try {
      const raw = this.storage?.getItem(CLOUD_SESSION_KEY);
      const s = raw ? (JSON.parse(raw) as Partial<Session>) : null;
      return s && typeof s.accessToken === 'string' && typeof s.refreshToken === 'string' && typeof s.userId === 'string' && typeof s.expiresAt === 'number'
        ? (s as Session) : null;
    } catch {
      return null;
    }
  }

  private async request(path: string, init: RequestInit, session: Session | null) {
    try {
      return await this.fetchFn(`${this.config.url}/${path}`, {
        ...init,
        headers: {
          apikey: this.config.key,
          'Content-Type': 'application/json',
          ...(session ? { Authorization: `Bearer ${session.accessToken}` } : {}),
          ...(init.headers as Record<string, string> | undefined),
        },
      });
    } catch {
      return null;
    }
  }
}
