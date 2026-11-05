import { describe, expect, it, vi } from 'vitest';
import { BoardSaver, type SaverCallbacks } from '../src/features/saving/saver.ts';
import { ApiError, type BoardApi } from '../src/features/board/api.ts';
import type { BoardElement } from '../src/shared/board.ts';

const tick = () => new Promise(resolve => setTimeout(resolve, 0));

function element(id: string, revision: number): BoardElement {
  return {
    id, type: 'note', x: 0, y: 0, width: 320, height: 240, zIndex: 1,
    groupId: null, mediaId: null, revision,
    content: { body: '', colourKey: 'paper', titleSize: 'medium', bodySize: 'medium', font: 'sans' },
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

  it('keeps the latest drag position visible while an older save is acknowledged', async () => {
    const responses: ((value: { element: BoardElement }) => void)[] = [];
    const client = api({ patchElement: vi.fn(() => new Promise<{ element: BoardElement }>(resolve => responses.push(resolve))) });
    const cb = callbacks();
    const saver = new BoardSaver(client, cb);
    saver.setRevision('e1', 1);
    saver.patch('e1', { x: 100, y: 100 }, true);
    saver.patch('e1', { x: 200, y: 200 }, true);
    responses[0]({ element: { ...element('e1', 2), x: 100, y: 100 } });
    await tick();
    expect(cb.onElement).toHaveBeenLastCalledWith(expect.objectContaining({ x: 200, y: 200, revision: 2 }));
    expect(client.patchElement).toHaveBeenLastCalledWith('e1', { expectedRevision: 2, x: 200, y: 200 });
    responses[1]({ element: { ...element('e1', 3), x: 200, y: 200 } });
    await tick();
    expect(cb.statuses.e1).toBe('saved');
  });

  it('counts an in-flight save as pending so refresh cannot reset its position', async () => {
    let finish!: (value: { element: BoardElement }) => void;
    const saver = new BoardSaver(api({ patchElement: vi.fn(() => new Promise<{ element: BoardElement }>(resolve => { finish = resolve; })) }), callbacks());
    saver.setRevision('e1', 1);
    saver.patch('e1', { x: 200 }, true);
    expect(saver.hasPending('e1')).toBe(true);
    finish({ element: { ...element('e1', 2), x: 200 } });
    await tick();
    expect(saver.hasPending('e1')).toBe(false);
  });

  it('keeps newer content visible when a layout save completes', async () => {
    const responses: ((value: { element: BoardElement }) => void)[] = [];
    const cb = callbacks();
    const saver = new BoardSaver(api({ patchElement: vi.fn(() => new Promise<{ element: BoardElement }>(resolve => responses.push(resolve))) }), cb);
    saver.setRevision('e1', 1);
    saver.patch('e1', { x: 100 }, true);
    const content = { ...element('e1', 1).content, body: 'Still typing' };
    saver.patch('e1', { content });
    responses[0]({ element: { ...element('e1', 2), x: 100 } });
    await tick();
    expect(cb.onElement).toHaveBeenLastCalledWith(expect.objectContaining({ content }));
    responses[1]({ element: { ...element('e1', 3), x: 100, content } });
    await tick();
  });

  it('does not replace newer list edits with an older item response', async () => {
    const responses: ((value: { element: BoardElement; items: { id: string; text: string; completed: boolean; position: number }[] }) => void)[] = [];
    const cb = callbacks();
    const saver = new BoardSaver(api({ replaceItems: vi.fn(() => new Promise<Awaited<ReturnType<BoardApi['replaceItems']>>>(resolve => responses.push(resolve))) }), cb);
    saver.setRevision('e1', 1);
    saver.setItems('e1', [{ text: 'Old', completed: false }], true);
    saver.setItems('e1', [{ text: 'New', completed: false }], true);
    responses[0]({ element: element('e1', 2), items: [{ id: 'i1', text: 'Old', completed: false, position: 0 }] });
    await tick();
    expect(cb.onItems).not.toHaveBeenCalled();
    responses[1]({ element: element('e1', 3), items: [{ id: 'i1', text: 'New', completed: false, position: 0 }] });
    await tick();
    expect(cb.onItems).toHaveBeenLastCalledWith('e1', [expect.objectContaining({ text: 'New' })]);
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

  it('distinguishes a 403 denial from session expiry and keeps the work', async () => {
    const client = api({
      patchElement: vi.fn(async () => {
        throw new ApiError(403, 'forbidden', 'denied');
      }),
    });
    const forbidden = vi.fn();
    const cb = { ...callbacks(), onForbidden: forbidden };
    const saver = new BoardSaver(client, cb, () => Promise.resolve());
    saver.setRevision('e1', 1);
    saver.patch('e1', { x: 1 }, true);
    await tick();
    await tick();
    expect(forbidden).toHaveBeenCalledTimes(1);
    expect(cb.expired).toBe(0);
    expect(cb.statuses.e1).toBe('failed');
    expect(saver.hasPending('e1')).toBe(true);
  });

  it('mirrors unconfirmed work to drafts and clears it once acknowledged', async () => {
    const client = api();
    const drafts: { id: string; draft: unknown }[] = [];
    const cb = { ...callbacks(), onDraftChanged: (id: string, draft: unknown) => drafts.push({ id, draft }) };
    const saver = new BoardSaver(client, cb, () => Promise.resolve());
    saver.setRevision('e1', 3);
    saver.patch('e1', { x: 10 });
    saver.patch('e1', { y: 20 });
    saver.flush('e1');
    await tick();
    await tick();
    expect(drafts[0]).toEqual({ id: 'e1', draft: { patch: { x: 10 } } });
    expect(drafts[1]).toEqual({ id: 'e1', draft: { patch: { x: 10, y: 20 } } });
    expect(drafts.at(-1)).toEqual({ id: 'e1', draft: null });
  });

  it('keeps the draft when a save fails permanently', async () => {
    const client = api({
      patchElement: vi.fn(async () => { throw new ApiError(422, 'invalid_fields', 'bad'); }),
    });
    const drafts: ({ id: string; draft: unknown } | undefined)[] = [];
    const cb = { ...callbacks(), onDraftChanged: (id: string, draft: unknown) => drafts.push({ id, draft }) };
    const saver = new BoardSaver(client, cb, () => Promise.resolve());
    saver.setRevision('e1', 1);
    saver.patch('e1', { x: 5 }, true);
    await tick();
    await tick();
    expect(drafts.at(-1)).toEqual({ id: 'e1', draft: { patch: { x: 5 } } });
    expect(cb.statuses.e1).toBe('failed');
  });

  it('hands unconfirmed work to a new saver after re-login', async () => {
    const client = api({
      patchElement: vi.fn(async () => { throw new ApiError(401, 'unauthorized', 'expired'); }),
    });
    const saver = new BoardSaver(client, callbacks(), () => Promise.resolve());
    saver.setRevision('e1', 2);
    saver.patch('e1', { x: 7, content: { body: 'draft' } }, true);
    await tick();
    await tick();
    const pending = saver.pendingSnapshot();
    expect(pending.get('e1')).toEqual({ patch: { x: 7, content: { body: 'draft' } } });

    const fresh = api();
    const resumed = new BoardSaver(fresh, callbacks(), () => Promise.resolve());
    resumed.setRevision('e1', 2);
    for (const [id, work] of pending) {
      resumed.patch(id, work.patch);
      resumed.flush(id);
    }
    await tick();
    await tick();
    expect(fresh.patchElement).toHaveBeenCalledWith('e1', expect.objectContaining({ expectedRevision: 2, x: 7 }));
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
