import { ApiError, type BoardApi } from '../board/api.ts';
import type { BoardElement, ListItem } from '../../shared/board.ts';

export type SaveState = 'saved' | 'dirty' | 'saving' | 'failed' | 'conflict';

export interface SaverCallbacks {
  onElement(element: BoardElement): void;
  onItems(elementId: string, items: ListItem[]): void;
  onStatus(elementId: string, state: SaveState): void;
  onConflict(elementId: string, element?: BoardElement): void;
  onSessionExpired(): void;
}

type ItemInput = { text: string; completed: boolean };

interface Entry {
  revision: number;
  pending: Record<string, unknown>;
  pendingItems?: ItemInput[];
  sending: boolean;
  timer?: ReturnType<typeof setTimeout>;
  attempts: number;
}

const DEBOUNCE_MS = 600;
const MAX_ATTEMPTS = 4;

const delay = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Serializes writes per card: unsent edits are coalesced into one patch,
 * every request carries the latest acknowledged revision, and transient
 * failures retry with bounded exponential backoff. 409/401/403/422 stop
 * the queue so stale or unauthorized writes never silently overwrite.
 */
export class BoardSaver {
  private entries = new Map<string, Entry>();
  private api: BoardApi;
  private callbacks: SaverCallbacks;
  private sleep: (ms: number) => Promise<unknown>;

  constructor(api: BoardApi, callbacks: SaverCallbacks, sleep: (ms: number) => Promise<unknown> = delay) {
    this.api = api;
    this.callbacks = callbacks;
    this.sleep = sleep;
  }

  private entry(id: string): Entry {
    let entry = this.entries.get(id);
    if (!entry) {
      entry = { revision: 0, pending: {}, sending: false, attempts: 0 };
      this.entries.set(id, entry);
    }
    return entry;
  }

  setRevision(id: string, revision: number) {
    const entry = this.entries.get(id);
    if (entry) entry.revision = revision;
    else this.entries.set(id, { revision, pending: {}, sending: false, attempts: 0 });
  }

  revision(id: string): number {
    return this.entry(id).revision;
  }

  hasPending(id: string): boolean {
    const entry = this.entries.get(id);
    return !!entry && (Object.keys(entry.pending).length > 0 || !!entry.pendingItems);
  }

  /** Queue content/layout fields; flushed after a short debounce or on demand. */
  patch(id: string, fields: Record<string, unknown>, immediate = false) {
    const entry = this.entry(id);
    Object.assign(entry.pending, fields);
    this.callbacks.onStatus(id, 'dirty');
    if (entry.timer) clearTimeout(entry.timer);
    if (immediate) void this.pump(id);
    else entry.timer = setTimeout(() => void this.pump(id), DEBOUNCE_MS);
  }

  /** Queue a full ordered list-item replacement. */
  setItems(id: string, items: ItemInput[], immediate = false) {
    const entry = this.entry(id);
    entry.pendingItems = items;
    this.callbacks.onStatus(id, 'dirty');
    if (entry.timer) clearTimeout(entry.timer);
    if (immediate) void this.pump(id);
    else entry.timer = setTimeout(() => void this.pump(id), DEBOUNCE_MS);
  }

  flush(id: string) {
    const entry = this.entries.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    if (entry) entry.timer = undefined;
    if (this.hasPending(id)) void this.pump(id);
  }

  flushAll() {
    for (const id of this.entries.keys()) this.flush(id);
  }

  /** Re-run a failed queue (e.g. after re-login or an explicit retry). */
  retry(id: string) {
    this.flush(id);
  }

  discard(id: string) {
    const entry = this.entries.get(id);
    if (entry?.timer) clearTimeout(entry.timer);
    this.entries.delete(id);
  }

  private async pump(id: string) {
    const entry = this.entries.get(id);
    if (!entry || entry.sending) return;
    if (entry.timer) {
      clearTimeout(entry.timer);
      entry.timer = undefined;
    }
    entry.sending = true;
    let stop = false;
    try {
      while (!stop && (Object.keys(entry.pending).length > 0 || entry.pendingItems)) {
        this.callbacks.onStatus(id, 'saving');
        let sentPatch: Record<string, unknown> | undefined;
        let sentItems: ItemInput[] | undefined;
        try {
          if (entry.pendingItems) {
            sentItems = entry.pendingItems;
            entry.pendingItems = undefined;
            const { element, items: saved } = await this.api.replaceItems(id, entry.revision, sentItems);
            entry.revision = element.revision;
            this.callbacks.onElement(element);
            this.callbacks.onItems(id, saved);
          } else {
            sentPatch = entry.pending;
            entry.pending = {};
            const { element } = await this.api.patchElement(id, { expectedRevision: entry.revision, ...sentPatch });
            entry.revision = element.revision;
            this.callbacks.onElement(element);
          }
          entry.attempts = 0;
        } catch (error) {
          // Put unsent work back without clobbering edits made in flight.
          if (sentPatch) entry.pending = { ...sentPatch, ...entry.pending };
          if (sentItems && !entry.pendingItems) entry.pendingItems = sentItems;
          if (error instanceof ApiError && error.status === 409) {
            entry.pending = {};
            entry.pendingItems = undefined;
            this.callbacks.onStatus(id, 'conflict');
            this.callbacks.onConflict(id, (error.details as { element?: BoardElement } | undefined)?.element);
            stop = true;
            continue;
          }
          if (error instanceof ApiError && (error.status === 401 || error.status === 403)) {
            this.callbacks.onStatus(id, 'failed');
            this.callbacks.onSessionExpired();
            stop = true;
            continue;
          }
          if (error instanceof ApiError && error.status === 422) {
            this.callbacks.onStatus(id, 'failed');
            stop = true;
            continue;
          }
          // Transient (network/5xx/429): keep the work and retry with backoff.
          entry.attempts += 1;
          if (entry.attempts > MAX_ATTEMPTS) {
            this.callbacks.onStatus(id, 'failed');
            stop = true;
            continue;
          }
          this.callbacks.onStatus(id, 'dirty');
          await this.sleep(Math.min(8000, 500 * 2 ** entry.attempts) * (0.5 + Math.random() * 0.5));
        }
      }
      if (!stop) this.callbacks.onStatus(id, 'saved');
    } finally {
      entry.sending = false;
      if (!stop && (Object.keys(entry.pending).length > 0 || entry.pendingItems)) void this.pump(id);
    }
  }
}
