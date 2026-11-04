import { describe, expect, it, vi } from 'vitest';
import { BoardSaver, type SaverCallbacks } from '../src/features/saving/saver.ts';
import { ApiError, type BoardApi } from '../src/features/board/api.ts';
import type { BoardElement } from '../src/shared/board.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function element(id: string, revision: number): BoardElement {
  return {
    id, type: 'note', x: 0, y: 0, width: 320, height: 240, zIndex: 1,
    groupId: null, mediaId: null, revision,
    content: { body: '', colourKey: 'paper', titleSize: 'medium', bodySize: 'medium' },
    createdAt: '', updatedAt: '',
  };
}

function callbacks(): SaverCallbacks & { statuses: Record<string, string>; conflicts: string[]; expired: number } {
  const state = { statuses: {} as Record<string, string>, conflicts: [] as string[], expired: 0 };
  const cb = {
    statuses: state.statuses,
    conflicts: state.conflicts,
    expired: 0,
    onElement: vi.fn(),
    onItems: vi.fn(),
    onStatus: (id: string, s: string) => { state.statuses[id] = s; },
    onConflict: (id: string) => { state.conflicts.push(id); },
    onSessionExpired: () => { cb.expired += 1; },
  };
  return cb;
}

function api(overrides: Partial<BoardApi> = {}): BoardApi {
  return {
    loadBoard: vi.fn(),
    createElement: vi.fn(),
    deleteElement: vi.fn(),
    replaceItems: vi.fn(),
    patchElement: vi.fn(async (_id: string, patch: Record<string, unknown>) => ({
      element: element('e1', (patch.expectedRevision as number) + 1),
    })),
    ...overrides,
  } as unknown as BoardApi;
}

describe('BoardSaver', () => {
  it('coalesces rapid edits into one request', async () => {
    const client = api();
    const saver = new BoardSaver(client, callbacks(), () => Promise.resolve());
    saver.setRevision('e1', 3);
    saver.patch('e1', { x: 10 });
    saver.patch('e1', { y: 20 });
    saver.flush('e1');
    await tick();
    await tick();
    expect(client.patchElement).toHaveBeenCalledTimes(1);
    expect(client.patchElement).toHaveBeenCalledWith('e1', expect.objectContaining({ expectedRevision: 3, x: 10, y: 20 }));
    expect(saver.revision('e1')).toBe(4);
  });

  it('sends follow-up edits with the acknowledged revision', async () => {
    const client = api();
    const saver = new BoardSaver(client, callbacks(), () => Promise.resolve());
    saver.setRevision('e1', 1);
    saver.patch('e1', { x: 10 }, true);
    await tick();
    await tick();
    saver.patch('e1', { x: 50 }, true);
    await tick();
    await tick();
    expect(client.patchElement).toHaveBeenLastCalledWith('e1', expect.objectContaining({ expectedRevision: 2 }));
  });

  it('retries transient failures and then succeeds', async () => {
    let calls = 0;
    const client = api({
      patchElement: vi.fn(async (_id: string, patch: Record<string, unknown>) => {
        calls += 1;
        if (calls === 1) throw new ApiError(0, 'network', 'down');
        return { element: element('e1', (patch.expectedRevision as number) + 1) };
      }),
    });
    const cb = callbacks();
    const saver = new BoardSaver(client, cb, () => Promise.resolve());
    saver.setRevision('e1', 5);
    saver.patch('e1', { x: 1 }, true);
    for (let i = 0; i < 6; i++) await tick();
    expect(client.patchElement).toHaveBeenCalledTimes(2);
    expect(cb.statuses.e1).toBe('saved');
  });

  it('stops on conflict and reports it', async () => {
    const client = api({
      patchElement: vi.fn(async () => {
        throw new ApiError(409, 'conflict', 'stale', { element: element('e1', 9) });
      }),
    });
    const cb = callbacks();
    const saver = new BoardSaver(client, cb, () => Promise.resolve());
    saver.setRevision('e1', 2);
    saver.patch('e1', { x: 1 }, true);
    await tick();
    await tick();
    expect(cb.conflicts).toEqual(['e1']);
    expect(cb.statuses.e1).toBe('conflict');
    expect(client.patchElement).toHaveBeenCalledTimes(1);
  });

  it('reports session expiry without retrying', async () => {
    const client = api({
      patchElement: vi.fn(async () => {
        throw new ApiError(401, 'unauthorized', 'expired');
      }),
    });
    const cb = callbacks();
    const saver = new BoardSaver(client, cb, () => Promise.resolve());
    saver.setRevision('e1', 1);
    saver.patch('e1', { x: 1 }, true);
    await tick();
    await tick();
    expect(cb.expired).toBe(1);
    expect(cb.statuses.e1).toBe('failed');
    expect(client.patchElement).toHaveBeenCalledTimes(1);
  });
});
