import type { BoardElement, BoardPayload, ListItem } from '../../shared/board.ts';

export class ApiError extends Error {
  readonly status: number;
  readonly code: string;
  readonly details?: unknown;

  constructor(status: number, code: string, message: string, details?: unknown) {
    super(message);
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

async function request<T>(path: string, init?: RequestInit): Promise<T> {
  let response: Response;
  try {
    response = await fetch(path, init);
  } catch {
    throw new ApiError(0, 'network', 'Connection unavailable');
  }
  const body = (response.status === 204 ? null : await response.json().catch(() => null)) as
    ({ error?: { code?: string; message?: string; details?: unknown } } & Record<string, unknown>) | null;
  if (!response.ok) {
    const error = body?.error;
    throw new ApiError(response.status, error?.code ?? 'unknown', error?.message ?? `Request failed (${response.status})`, error?.details);
  }
  return body as T;
}

export interface UploadedImage {
  mediaId: string;
  width: number;
  height: number;
}

export async function uploadImage(csrfToken: string, file: File, onProgress: (message: string) => void): Promise<UploadedImage> {
  if (!['image/jpeg', 'image/png', 'image/webp'].includes(file.type)) {
    throw new Error('Choose a JPEG, PNG or WebP photo. HEIC is not supported; export it as JPEG first.');
  }
  if (!file.size || file.size > 10 * 1024 * 1024) throw new Error('Choose a photo between 1 byte and 10 MiB.');
  const init = (body: unknown): RequestInit => ({
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body),
  });
  onProgress('Preparing upload…');
  const ticket = await request<{ uploadId: string; signedUrl: string }>(
    '/api/media/uploads', init({ byteSize: file.size, mimeType: file.type }),
  );
  onProgress('Uploading photo…');
  let response: Response;
  try {
    response = await fetch(ticket.signedUrl, {
      method: 'PUT', credentials: 'omit', referrerPolicy: 'no-referrer',
      headers: { 'Content-Type': file.type }, body: file,
    });
  } catch {
    throw new Error('Photo upload failed. Check your connection and try again.');
  }
  if (!response.ok) throw new Error('Photo upload failed. Please try again.');
  onProgress('Processing photo…');
  return request<UploadedImage>(`/api/media/uploads/${ticket.uploadId}/complete`, init({}));
}

export function boardApi(csrfToken: string) {
  const mutation = (method: string, body: unknown): RequestInit => ({
    method,
    headers: { 'Content-Type': 'application/json', 'X-CSRF-Token': csrfToken },
    body: JSON.stringify(body),
  });

  return {
    loadBoard: () => request<BoardPayload>('/api/board'),
    createElement: (input: Record<string, unknown>) =>
      request<{ element: BoardElement }>('/api/elements', mutation('POST', input)),
    patchElement: (id: string, patch: Record<string, unknown>) =>
      request<{ element: BoardElement }>(`/api/elements/${id}`, mutation('PATCH', patch)),
    deleteElement: (id: string, expectedRevision: number) =>
      request<null>(`/api/elements/${id}`, mutation('DELETE', { expectedRevision })),
    replaceItems: (id: string, expectedRevision: number, items: { text: string; completed: boolean }[]) =>
      request<{ element: BoardElement; items: ListItem[] }>(
        `/api/elements/${id}/items`,
        mutation('PUT', { expectedRevision, items }),
      ),
  };
}

export type BoardApi = ReturnType<typeof boardApi>;
