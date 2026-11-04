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
