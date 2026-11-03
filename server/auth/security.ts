import type { VercelRequest, VercelResponse } from '@vercel/node';
import { createHash, timingSafeEqual } from 'node:crypto';
import { supabaseAdmin } from '../media/supabase.ts';
import { requireEnv } from '../media/env.ts';
import { sendError } from '../media/errors.ts';

export type Role = 'viewer' | 'editor';
export type Session = { role: Role; expiresAt: string; csrfToken: string; digest: string };
export const boardId = () => process.env.BOARD_ID ?? '00000000-0000-0000-0000-000000000001';
export const digest = (value: string) => createHash('sha256').update(value).digest('hex');
const developmentCookie = () => process.env.NODE_ENV !== 'production' && process.env.DEV_INSECURE_COOKIE === 'true';
export const cookieName = () => developmentCookie() ? 'eefje_dev_session' : '__Host-eefje_session';
export const sessionCookie = (token: string, maxAge = 604800) =>
  `${cookieName()}=${token}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${maxAge}${developmentCookie() ? '' : '; Secure'}`;

export function privateHeaders(res: VercelResponse) {
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'no-referrer');
}

export function checkMutation(req: VercelRequest, res: VercelResponse, session?: Session): boolean {
  if (req.headers.origin !== requireEnv('APP_ORIGIN')) {
    sendError(res, 403, 'origin_denied', 'Request origin denied');
    return false;
  }
  if (req.headers['content-type']?.split(';')[0].trim().toLowerCase() !== 'application/json') {
    sendError(res, 415, 'json_required', 'Use application/json');
    return false;
  }
  if (session) {
    const token = req.headers['x-csrf-token'];
    if (typeof token !== 'string' || token.length !== 64 ||
      !timingSafeEqual(Buffer.from(digest(token)), Buffer.from(digest(session.csrfToken)))) {
      sendError(res, 403, 'csrf_denied', 'Invalid request token');
      return false;
    }
  }
  return true;
}

export async function requireSession(req: VercelRequest, res: VercelResponse): Promise<Session | null> {
  privateHeaders(res);
  const matches = (req.headers.cookie ?? '').split(';').map(part => part.trim())
    .filter(part => part.startsWith(`${cookieName()}=`));
  const token = matches.length === 1 ? matches[0].slice(cookieName().length + 1) : '';
  if (!/^[a-f0-9]{64}$/.test(token)) {
    sendError(res, 401, 'unauthorized', 'Please log in');
    return null;
  }
  const { data, error } = await supabaseAdmin().from('sessions').select('role, expires_at')
    .eq('token_digest', digest(token)).gt('expires_at', new Date().toISOString()).maybeSingle();
  if (error) throw new Error('Session lookup failed');
  if (!data || !['viewer', 'editor'].includes(data.role)) {
    sendError(res, 401, 'unauthorized', 'Please log in');
    return null;
  }
  return { role: data.role, expiresAt: data.expires_at, digest: digest(token), csrfToken: digest(`csrf:${token}`) };
}

export async function requireEditor(req: VercelRequest, res: VercelResponse): Promise<Session | null> {
  const session = await requireSession(req, res);
  if (!session) return null;
  if (session.role !== 'editor') {
    sendError(res, 403, 'editor_required', 'Editing access required');
    return null;
  }
  return checkMutation(req, res, session) ? session : null;
}

export function secureHandler(handler: (req: VercelRequest, res: VercelResponse) => Promise<unknown>) {
  return async (req: VercelRequest, res: VercelResponse) => {
    privateHeaders(res);
    try {
      await handler(req, res);
    } catch {
      if (!res.headersSent) sendError(res, 503, 'unavailable', 'Service temporarily unavailable');
    }
  };
}
