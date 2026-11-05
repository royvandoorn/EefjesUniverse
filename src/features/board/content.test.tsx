import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, expect, it, vi } from 'vitest';
import { CardEditor } from './CardEditor.tsx';
import { PhotoUpload } from './PhotoUpload.tsx';
import { boardApi, uploadImage, type BoardApi } from './api.ts';
import { BoardView } from './BoardView.tsx';
import type { BoardElement } from '../../shared/board.ts';

vi.mock('./api.ts', async importOriginal => ({ ...await importOriginal<object>(), uploadImage: vi.fn(), boardApi: vi.fn() }));
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('IS_REACT_ACT_ENVIRONMENT', true);
  HTMLDialogElement.prototype.showModal = vi.fn();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(async () => {
  await act(async () => root.unmount());
  host.remove();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.clearAllMocks();
});

const element: BoardElement = {
  id: 'list', type: 'list', x: 0, y: 0, width: 320, height: 240, zIndex: 1,
  groupId: null, mediaId: null, revision: 1, createdAt: '', updatedAt: '',
  content: { title: 'Plans', colourKey: 'rose', titleSize: 'large', itemSize: 'small' },
};

function mockBoard(elements: BoardElement[] = []): BoardApi {
  const client: BoardApi = {
    loadBoard: vi.fn().mockResolvedValue({ board: { id: 'board', title: 'Board', minWidth: 2400, minHeight: 1600 }, groups: [], elements, items: {} }),
    createElement: vi.fn(), patchElement: vi.fn(), deleteElement: vi.fn(), replaceItems: vi.fn(),
  };
  vi.mocked(boardApi).mockReturnValue(client);
  vi.stubGlobal('requestAnimationFrame', vi.fn());
  return client;
}

it('ignores duplicate create clicks while the first card is being created', async () => {
  const client = mockBoard();
  let finish!: (value: { element: BoardElement }) => void;
  vi.mocked(client.createElement).mockImplementation(() => new Promise(resolve => { finish = resolve; }));
  await act(async () => root.render(<BoardView session={{ role: 'editor', csrfToken: 'csrf', expiresAt: '' }} onLogout={vi.fn()} onSession={vi.fn()} />));
  const add = [...host.querySelectorAll('button')].find(button => button.textContent?.includes('+ Note'))!;
  await act(async () => { add.click(); add.click(); });
  expect(client.createElement).toHaveBeenCalledTimes(1);
  expect(add.disabled).toBe(true);
  await act(async () => finish({ element: { ...element, type: 'note', content: { body: '', colourKey: 'paper', titleSize: 'medium', bodySize: 'medium' } } }));
  expect(add.disabled).toBe(false);
  expect(host.querySelectorAll('article')).toHaveLength(1);
});

it('shows deletion progress and restores controls if the request fails', async () => {
  const client = mockBoard([element]);
  let fail!: (error: Error) => void;
  vi.mocked(client.deleteElement).mockImplementation(() => new Promise((_resolve, reject) => { fail = reject; }));
  vi.spyOn(window, 'confirm').mockReturnValue(true);
  await act(async () => root.render(<BoardView session={{ role: 'editor', csrfToken: 'csrf', expiresAt: '' }} onLogout={vi.fn()} onSession={vi.fn()} />));
  await act(async () => (host.querySelector('[aria-label="Delete card"]') as HTMLButtonElement).click());
  expect(host.querySelector('article')?.textContent).toContain('Deleting…');
  expect(host.querySelector('[aria-label="Delete card"]')).toBeNull();
  await act(async () => fail(new Error('Network unavailable')));
  expect(host.querySelector('[aria-label="Delete card"]')).not.toBeNull();
  expect(host.textContent).toContain('Could not delete the card');
});

it('lets viewers open, zoom, fit, and close a photo without changing the board', async () => {
  const photo: BoardElement = { ...element, type: 'image', mediaId: 'photo', content: { mediaId: 'photo', caption: 'A favourite photo' } };
  const client = mockBoard([photo]);
  await act(async () => root.render(<BoardView session={{ role: 'viewer', csrfToken: 'csrf', expiresAt: '' }} onLogout={vi.fn()} onSession={vi.fn()} />));
  await act(async () => (host.querySelector('[aria-label="View photo full screen"]') as HTMLButtonElement).click());
  const viewer = document.querySelector('[aria-label="Full-screen photo"]')!;
  expect(viewer).not.toBeNull();
  expect(viewer.querySelector('img')?.alt).toBe('A favourite photo');
  await act(async () => (viewer.querySelector('[aria-label="Zoom photo in"]') as HTMLButtonElement).click());
  expect(viewer.textContent).toContain('150%');
  await act(async () => (viewer.querySelector('[aria-label="Fit photo to screen"]') as HTMLButtonElement).click());
  expect(viewer.textContent).toContain('100%');
  await act(async () => viewer.dispatchEvent(new Event('cancel', { bubbles: true, cancelable: true })));
  expect(document.querySelector('[aria-label="Full-screen photo"]')).toBeNull();
  await act(async () => (host.querySelector('[aria-label="View photo full screen"]') as HTMLButtonElement).click());
  await act(async () => [...document.querySelectorAll('button')].find(button => button.textContent === 'Close photo')!.click());
  expect(document.querySelector('[aria-label="Full-screen photo"]')).toBeNull();
  expect(client.patchElement).not.toHaveBeenCalled();
});

it('saves enlarged photo dimensions through the existing autosave queue', async () => {
  const photo: BoardElement = { ...element, type: 'image', width: 1000, height: 800, content: { mediaId: 'photo' } };
  const client = mockBoard([photo]);
  vi.mocked(client.patchElement).mockResolvedValue({ element: { ...photo, width: 1250, height: 1000, revision: 2 } });
  await act(async () => root.render(<BoardView session={{ role: 'editor', csrfToken: 'csrf', expiresAt: '' }} onLogout={vi.fn()} onSession={vi.fn()} />));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent?.trim() === 'Edit')!.click());
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Larger photo')!.click());
  expect(client.patchElement).toHaveBeenCalledWith(photo.id, { expectedRevision: 1, width: 1250, height: 1000 });
  expect((host.querySelector('article') as HTMLElement).style.width).toBe('1250px');
});

it('provides touch-friendly photo size controls in the editor', async () => {
  const resize = vi.fn();
  const photo: BoardElement = { ...element, type: 'image', content: { mediaId: 'photo' } };
  await act(async () => root.render(<CardEditor element={photo} items={[]} csrfToken="csrf" onPatchContent={vi.fn()}
    onReplaceItems={vi.fn()} onClose={vi.fn()} onReplaceImage={vi.fn()} onSessionExpired={vi.fn()} onResizePhoto={resize} />));
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Larger photo')!.click());
  expect(resize).toHaveBeenLastCalledWith(1.25);
  await act(async () => [...host.querySelectorAll('button')].find(button => button.textContent === 'Smaller photo')!.click());
  expect(resize).toHaveBeenLastCalledWith(0.8);
});

it('preserves list styling when changing its title', async () => {
  const patch = vi.fn();
  await act(async () => root.render(<CardEditor element={element} items={[]} csrfToken="csrf"
    onPatchContent={patch} onReplaceItems={vi.fn()} onClose={vi.fn()} onReplaceImage={vi.fn()} onSessionExpired={vi.fn()} />));
  const input = host.querySelector('input')!;
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, 'Travel plans');
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
  expect(patch).toHaveBeenCalledWith({ ...element.content, title: 'Travel plans' });
});

it('explains photo selection before enabling upload', async () => {
  await act(async () => root.render(<PhotoUpload csrfToken="csrf" onAttach={vi.fn()} onBusy={vi.fn()} onSessionExpired={vi.fn()} />));
  const button = host.querySelector('button')!;
  expect(button.disabled).toBe(true);
  expect(button.textContent).toBe('Choose a photo first');
  expect(host.querySelector('label')?.textContent).toContain('1. Choose a photo from your device');
  const input = host.querySelector('input')!;
  Object.defineProperty(input, 'files', { value: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(button.disabled).toBe(false);
  expect(button.textContent).toBe('2. Add photo');
});

it('retries attachment without uploading a ready photo a second time', async () => {
  const image = { mediaId: 'photo', width: 1200, height: 800 };
  vi.mocked(uploadImage).mockResolvedValue(image);
  const attach = vi.fn().mockRejectedValueOnce(new Error('Connection unavailable')).mockResolvedValueOnce(undefined);
  await act(async () => root.render(<PhotoUpload csrfToken="csrf" onAttach={attach} onBusy={vi.fn()} onSessionExpired={vi.fn()} />));
  const input = host.querySelector('input')!;
  const file = new File(['photo'], 'photo.jpg', { type: 'image/jpeg' });
  Object.defineProperty(input, 'files', { value: [file] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await act(async () => host.querySelector('button')!.click());
  expect(host.querySelector('[role="alert"]')?.textContent).toContain('Connection unavailable');
  await act(async () => host.querySelector('button')!.click());
  expect(uploadImage).toHaveBeenCalledTimes(1);
  expect(attach).toHaveBeenCalledTimes(2);
  expect(attach).toHaveBeenLastCalledWith(image);
});

it('only applies an uploaded replacement after Done and confirmation', async () => {
  const image = { mediaId: 'replacement', width: 1200, height: 800 };
  vi.mocked(uploadImage).mockResolvedValue(image);
  const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
  const attach = vi.fn();
  await act(async () => root.render(<PhotoUpload csrfToken="csrf" replacing onAttach={attach} onBusy={vi.fn()} onSessionExpired={vi.fn()} />));
  const done = [...host.querySelectorAll('button')].find(button => button.textContent === 'Done')!;
  expect(done.disabled).toBe(true);
  const input = host.querySelector('input')!;
  Object.defineProperty(input, 'files', { value: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  expect(done.disabled).toBe(true);
  await act(async () => host.querySelector('button')!.click());
  expect(done.disabled).toBe(false);
  expect(attach).not.toHaveBeenCalled();
  await act(async () => done.click());
  expect(confirm).toHaveBeenCalled();
  expect(attach).not.toHaveBeenCalled();
  confirm.mockReturnValue(true);
  await act(async () => done.click());
  expect(attach).toHaveBeenCalledWith(image);
  expect(uploadImage).toHaveBeenCalledTimes(1);
});

it('cancels an uploaded replacement without changing the original photo', async () => {
  vi.mocked(uploadImage).mockResolvedValue({ mediaId: 'replacement', width: 1200, height: 800 });
  const attach = vi.fn();
  await act(async () => root.render(<PhotoUpload csrfToken="csrf" replacing onAttach={attach} onBusy={vi.fn()} onSessionExpired={vi.fn()} />));
  const input = host.querySelector('input')!;
  Object.defineProperty(input, 'files', { value: [new File(['photo'], 'photo.jpg', { type: 'image/jpeg' })] });
  await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
  await act(async () => host.querySelector('button')!.click());
  const cancel = [...host.querySelectorAll('button')].find(button => button.textContent === 'Cancel replacement')!;
  await act(async () => cancel.click());
  expect(attach).not.toHaveBeenCalled();
  expect(host.textContent).toContain('The original photo is unchanged');
  expect([...host.querySelectorAll('button')].find(button => button.textContent === 'Done')!.disabled).toBe(true);
});
