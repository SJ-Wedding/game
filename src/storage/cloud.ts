import type { CloudRow, SaveData, StorageLike } from './save';

/**
 * 계정(Supabase 익명 계정) 저장.
 * 브라우저 저장이 먼저이고, 서버는 같은 내용을 계정에 보관한다. 서버에 닿지 않아도 게임은 그대로 동작한다.
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

  /** 서버의 내 행. 행이 없거나 실패하면 null */
  async pull(): Promise<CloudRow | null> {
    const s = await this.ensureSession();
    if (!s) return null;
    const res = await this.request(`rest/v1/profiles?select=meta,records,rev&user_id=eq.${encodeURIComponent(s.userId)}`, { method: 'GET' }, s);
    if (!res?.ok) return null;
    const rows = (await res.json()) as CloudRow[];
    return Array.isArray(rows) && rows[0] ? rows[0] : null;
  }

  /** 상점 내역과 기록을 서버에 올린다. 앞선 업로드가 끝난 뒤 차례로 보낸다 */
  push(data: SaveData): Promise<void> {
    this.pushing = this.pushing.then(async () => {
      const s = await this.ensureSession();
      if (!s) return;
      await this.request('rest/v1/profiles?on_conflict=user_id', {
        method: 'POST',
        headers: { Prefer: 'resolution=merge-duplicates,return=minimal' },
        body: JSON.stringify({ user_id: s.userId, meta: data.meta, records: data.records, rev: data.cloudRev ?? 0, updated_at: new Date(this.now() * 1000).toISOString() }),
      }, s);
    }).catch(() => undefined);
    return this.pushing;
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
