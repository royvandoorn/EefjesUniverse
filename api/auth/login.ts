import { randomBytes, createHmac } from 'node:crypto';
import { verify } from 'argon2';
import { z } from 'zod';
import { supabaseAdmin } from '../../server/media/supabase.ts';
import { requireEnv } from '../../server/media/env.ts';
import { methodNotAllowed, sendError } from '../../server/media/errors.ts';
import { checkMutation, digest, secureHandler, sessionCookie } from '../../server/auth/security.ts';

export default secureHandler(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  if (!checkMutation(req, res)) return;
  const parsed = z.object({ password: z.string().min(1).max(1024) }).strict().safeParse(req.body);
  if (!parsed.success) return sendError(res, 400, 'invalid_login', 'Invalid login request');
  const hosted = process.env.VERCEL === '1' && process.env.VERCEL_ENV !== 'development';
  const source = hosted ? req.headers['x-vercel-forwarded-for'] : req.socket.remoteAddress;
  if (typeof source !== 'string' || !source) throw new Error('Missing trusted source address');
  const key = createHmac('sha256', requireEnv('THROTTLE_SECRET')).update(source.split(',')[0].trim()).digest('hex');
  const db = supabaseAdmin();
  const { data: allowed, error: throttleError } = await db.rpc('consume_login_attempt', { source_key: key });
  if (throttleError) throw new Error('Throttle unavailable');
  if (!allowed) {
    res.setHeader('Retry-After', '900');
    return sendError(res, 429, 'throttled', 'Too many login attempts. Try again later.');
  }
  const { data: credentials, error } = await db.from('access_credentials').select('role, password_hash');
  const viewer = credentials?.find(row => row.role === 'viewer');
  const editor = credentials?.find(row => row.role === 'editor');
  if (error || !viewer || !editor) throw new Error('Passwords not configured');
  const [isViewer, isEditor] = await Promise.all([
    verify(viewer.password_hash, parsed.data.password),
    verify(editor.password_hash, parsed.data.password),
  ]);
  if (isViewer === isEditor) return sendError(res, 401, 'invalid_credentials', 'Incorrect password');
  const credential = isEditor ? editor : viewer;
  const token = randomBytes(32).toString('hex');
  const { data: expiresAt, error: sessionError } = await db.rpc('create_session', {
    session_digest: digest(token), session_role: credential.role, expected_hash: credential.password_hash,
  });
  if (sessionError) throw new Error('Session creation failed');
  res.setHeader('Set-Cookie', sessionCookie(token));
  res.status(200).json({ role: credential.role, expiresAt, csrfToken: digest(`csrf:${token}`) });
});
