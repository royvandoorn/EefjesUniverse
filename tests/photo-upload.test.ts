import { afterEach, describe, expect, it, vi } from 'vitest';
import { ApiError, uploadImage } from '../src/features/board/api.ts';

const photo = (type = 'image/jpeg', size = 12) => ({ type, size } as File);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status });
afterEach(() => vi.unstubAllGlobals());

describe('private photo uploads', () => {
  it('rejects unsupported, empty and oversized files before requesting a ticket', async () => {
    const fetcher = vi.fn();
    vi.stubGlobal('fetch', fetcher);
    for (const file of [photo('image/heic'), photo('image/svg+xml'), photo('image/jpeg', 0), photo('image/png', 10 * 1024 * 1024 + 1)]) {
      await expect(uploadImage('csrf', file, vi.fn())).rejects.toThrow();
    }
    expect(fetcher).not.toHaveBeenCalled();
  });

  it('uploads bytes directly without session credentials and finalizes with CSRF', async () => {
    const file = photo('image/png', 10 * 1024 * 1024);
    const ready = { mediaId: 'media', width: 1200, height: 800 };
    const fetcher = vi.fn()
      .mockResolvedValueOnce(json({ uploadId: 'ticket', signedUrl: 'https://storage.example/upload' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json(ready));
    vi.stubGlobal('fetch', fetcher);
    const progress = vi.fn();
    await expect(uploadImage('csrf', file, progress)).resolves.toEqual(ready);
    expect(fetcher.mock.calls[0]).toEqual(['/api/media/uploads', expect.objectContaining({
      headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' },
      body: JSON.stringify({ byteSize: file.size, mimeType: file.type }),
    })]);
    expect(fetcher.mock.calls[1]).toEqual(['https://storage.example/upload', {
      method: 'PUT', credentials: 'omit', referrerPolicy: 'no-referrer', headers: { 'Content-Type': 'image/png' }, body: file,
    }]);
    expect(fetcher.mock.calls[2]).toEqual(['/api/media/uploads/ticket/complete', expect.objectContaining({
      method: 'POST', headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': 'csrf' }, body: '{}',
    })]);
    expect(progress.mock.calls.flat()).toEqual(['Preparing upload…', 'Uploading photo…', 'Processing photo…']);
  });

  it('does not finalize a failed storage upload', async () => {
    const fetcher = vi.fn().mockResolvedValueOnce(json({ uploadId: 'ticket', signedUrl: 'https://storage.example/upload' }))
      .mockResolvedValueOnce(new Response(null, { status: 500 }));
    vi.stubGlobal('fetch', fetcher);
    await expect(uploadImage('csrf', photo(), vi.fn())).rejects.toThrow('Photo upload failed');
    expect(fetcher).toHaveBeenCalledTimes(2);
  });

  it('preserves session expiry and processing errors', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(json({ error: { code: 'expired', message: 'Log in again' } }, 401)));
    await expect(uploadImage('csrf', photo(), vi.fn())).rejects.toBeInstanceOf(ApiError);
    const fetcher = vi.fn().mockResolvedValueOnce(json({ uploadId: 'ticket', signedUrl: 'https://storage.example/upload' }))
      .mockResolvedValueOnce(new Response(null, { status: 200 }))
      .mockResolvedValueOnce(json({ error: { code: 'unsupported_media', message: 'The file is not a valid image' } }, 415));
    vi.stubGlobal('fetch', fetcher);
    await expect(uploadImage('csrf', photo(), vi.fn())).rejects.toThrow('The file is not a valid image');
  });
});
