import { catalogRun, type CatalogId } from '../core/catalog';
import type { RunResult } from '../core/types';

export interface ArchivedRun {
  id: string;
  endedAt: number;
  result: RunResult;
  tokens: number | null;
}

export interface ArchiveSnapshot {
  discoveries: ReadonlySet<CatalogId>;
  runs: ArchivedRun[];
  persisted: boolean;
}

const DATABASE = 'rift-arena/archive';
const RUNS = 'runs';
const DISCOVERIES = 'discoveries';

/** 판별 자료는 IndexedDB에 따로 저장해 기존 진행 저장의 크기에 영향을 주지 않는다. */
export class ArchiveStore {
  private opening?: Promise<IDBDatabase | null>;
  private readonly recentRuns = new Map<string, ArchivedRun>();
  private readonly seen = new Set<CatalogId>();
  private persisted = true;

  discover(ids: Iterable<CatalogId>): void {
    const added = [...new Set(ids)].filter((id) => !this.seen.has(id));
    if (!added.length) return;
    for (const id of added) this.seen.add(id);
    void this.write(DISCOVERIES, added);
  }

  record(result: RunResult, tokens: number | null): void {
    if (result.assisted) return;
    const endedAt = Date.now();
    const id = globalThis.crypto?.randomUUID?.() ?? `${endedAt}-${Math.random()}`;
    const run: ArchivedRun = { id, endedAt, result, tokens };
    this.recentRuns.set(id, run);
    this.discover(catalogRun(result));
    void this.write(RUNS, [run]);
  }

  async snapshot(): Promise<ArchiveSnapshot> {
    const db = await this.database();
    const runs = new Map(this.recentRuns);
    const discoveries = new Set(this.seen);
    if (db) {
      try {
        const tx = db.transaction([RUNS, DISCOVERIES], 'readonly');
        const [storedRuns, storedIds] = await Promise.all([
          readAll<ArchivedRun>(tx.objectStore(RUNS)),
          readAll<CatalogId>(tx.objectStore(DISCOVERIES)),
        ]);
        for (const run of storedRuns) if (!runs.has(run.id)) runs.set(run.id, run);
        for (const id of storedIds) discoveries.add(id);
      } catch {
        this.persisted = false;
      }
    }
    return { discoveries, runs: [...runs.values()].sort((a, b) => b.endedAt - a.endedAt || b.id.localeCompare(a.id)), persisted: this.persisted };
  }

  private database(): Promise<IDBDatabase | null> {
    return this.opening ??= this.open();
  }

  private async open(): Promise<IDBDatabase | null> {
    try {
      const db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DATABASE, 1);
        request.onupgradeneeded = () => {
          request.result.createObjectStore(RUNS, { keyPath: 'id' });
          request.result.createObjectStore(DISCOVERIES);
        };
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      db.onversionchange = () => {
        db.close();
        this.opening = undefined;
      };
      return db;
    } catch {
      this.persisted = false;
      return null;
    }
  }

  private async write(store: string, entries: readonly (ArchivedRun | CatalogId)[]): Promise<void> {
    const db = await this.database();
    if (!db) return;
    try {
      await new Promise<void>((resolve, reject) => {
        const tx = db.transaction(store, 'readwrite');
        tx.oncomplete = () => resolve();
        tx.onabort = () => reject(tx.error);
        const data = tx.objectStore(store);
        for (const entry of entries) {
          if (typeof entry === 'string') data.put(entry, entry);
          else data.put(entry);
        }
      });
    } catch {
      this.persisted = false;
    }
  }
}

function readAll<T>(store: IDBObjectStore): Promise<T[]> {
  return new Promise((resolve, reject) => {
    const request = store.getAll();
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}
