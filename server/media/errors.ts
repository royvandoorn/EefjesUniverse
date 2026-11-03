import type { VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';

export type ErrorBody = {
  error: { code: string; message: string; requestId: string; details?: unknown };
};

export function sendError(
  res: VercelResponse,
  status: number,
  code: string,
  message: string,
  details?: unknown,
): void {
  const requestId = randomUUID();
  res.status(status).json({ error: { code, message, requestId, details } } satisfies ErrorBody);
}

export function methodNotAllowed(res: VercelResponse, allowed: string): void {
  res.setHeader('Allow', allowed);
  sendError(res, 405, 'method_not_allowed', `Only ${allowed} is supported here`);
}
