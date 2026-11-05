export type DraftItems = { text: string; completed: boolean }[];

/** Unconfirmed changes for one element, kept until the server acknowledges them. */
export interface ElementDraft {
  id: string;
  patch: Record<string, unknown>;
  items?: DraftItems;
  updatedAt: number;
}

const DB_NAME = 'eefjes-universum';
const STORE = 'drafts';

/**
 * Minimal IndexedDB draft store. Every operation degrades to a no-op when
 * IndexedDB is unavailable (private modes, jsdom) — drafts are a safety net,
 * never the primary save path.
 */
export class DraftStore {
  private db: IDBDatabase | null = null;
  private failed = false;

  async open(): Promise<boolean> {
    if (this.db || this.failed) return !!this.db;
    if (typeof indexedDB === 'undefined') {
      this.failed = true;
      return false;
    }
    try {
      this.db = await new Promise<IDBDatabase>((resolve, reject) => {
        const request = indexedDB.open(DB_NAME, 1);
        request.onupgradeneeded = () => request.result.createObjectStore(STORE);
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => reject(request.error);
      });
      return true;
    } catch {
      this.failed = true;
      return false;
    }
  }

  private run<T>(mode: IDBTransactionMode, action: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
    const db = this.db;
    if (!db) return Promise.resolve(undefined);
    return new Promise(resolve => {
      try {
        const request = action(db.transaction(STORE, mode).objectStore(STORE));
        request.onsuccess = () => resolve(request.result);
        request.onerror = () => resolve(undefined);
      } catch {
        resolve(undefined);
      }
    });
  }

  put(draft: ElementDraft): Promise<unknown> {
    return this.run('readwrite', store => store.put(draft, draft.id));
  }

  remove(id: string): Promise<unknown> {
    return this.run('readwrite', store => store.delete(id));
  }

  async all(): Promise<ElementDraft[]> {
    const rows = await this.run('readonly', store => store.getAll() as IDBRequest<ElementDraft[]>);
    return rows ?? [];
  }
}
