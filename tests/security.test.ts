import { beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { VercelRequest, VercelResponse } from '@vercel/node';
import { hash, argon2id, verify } from 'argon2';
import login from '../api/auth/login';
import sessionHandler from '../api/auth/session';
import logout from '../api/auth/logout';
import upload from '../api/media/uploads';
import complete from '../api/media/uploads/[uploadId]/complete';
import media from '../api/media/[mediaId]/[variant]';
import { checkMutation, cookieName, digest, sessionCookie } from '../server/auth/security';

const mock = vi.hoisted(() => ({ from: vi.fn(), rpc: vi.fn(), storage: { from: vi.fn() } }));
vi.mock('../server/media/supabase', () => ({ supabaseAdmin: () => mock }));
vi.mock('argon2', async importOriginal => {
  const actual = await importOriginal<typeof import('argon2')>();
  return { ...actual, verify: vi.fn(actual.verify) };
});
const token = 'a'.repeat(64);
const csrfToken = digest(`csrf:${token}`);
let active: { role: string; expires_at: string } | null;
let credentials: { role: string; password_hash: string }[];
let chain: ReturnType<typeof makeChain>;
function makeChain(result: { data: unknown; error: unknown }) {
  const query = {
    select: vi.fn(() => query), eq: vi.fn(() => query), gt: vi.fn(() => query),
    delete: vi.fn(() => query), insert: vi.fn(() => query),
    maybeSingle: vi.fn(async () => result), single: vi.fn(async () => result),
    then: (resolve: (value: typeof result) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}
function request(method = 'GET', authenticated = false, extra = {}): VercelRequest {
  return {
    method, headers: { origin: 'https://example.test', 'content-type': 'application/json',
      ...(authenticated ? { cookie: `${cookieName()}=${token}`, 'x-csrf-token': csrfToken } : {}) },
    query: { mediaId: 'some-id', variant: 'display', uploadId: 'some-id' },
    body: {}, socket: { remoteAddress: '127.0.0.1' }, ...extra,
  } as unknown as VercelRequest;
}
function response() {
  const res = { statusCode: 200, headers: {} as Record<string, unknown>, body: undefined as unknown,
    headersSent: false, setHeader: vi.fn((key: string, value: unknown) => { res.headers[key] = value; }),
    status: vi.fn((code: number) => { res.statusCode = code; return res; }),
    json: vi.fn((body: unknown) => { res.body = body; return res; }),
    end: vi.fn(), send: vi.fn(),
  };
  return res;
}
async function call(handler: typeof login, req: VercelRequest) {
  const res = response();
  await handler(req, res as unknown as VercelResponse);
  return res;
}

beforeAll(async () => {
  credentials = await Promise.all(['viewer', 'editor'].map(async role => ({ role,
    password_hash: await hash(`${role}-password`, { type: argon2id, memoryCost: 65536, timeCost: 3, parallelism: 1 }),
  })));
});
beforeEach(() => {
  vi.clearAllMocks();
  process.env.APP_ORIGIN = 'https://example.test';
  process.env.THROTTLE_SECRET = 'test-only-secret';
  delete process.env.DEV_INSECURE_COOKIE;
  delete process.env.VERCEL;
  active = { role: 'viewer', expires_at: new Date(Date.now() + 60000).toISOString() };
  mock.from.mockImplementation((table: string) => {
    chain = makeChain({ data: table === 'sessions' ? active : table === 'access_credentials' ? credentials : null, error: null });
    return chain;
  });
  mock.rpc.mockImplementation(async (name: string) => ({ data: name === 'consume_login_attempt' ? true : '2030-01-01T00:00:00Z', error: null }));
});

const endpoints = [
  ['session', sessionHandler, 'GET'], ['logout', logout, 'POST'],
  ['upload', upload, 'POST'], ['complete', complete, 'POST'], ['media', media, 'GET'],
] as const;
describe('endpoint authorization matrix', () => {
  it.each(endpoints)('denies anonymous %s', async (_name, handler, method) => {
    const res = await call(handler, request(method));
    expect(res.statusCode).toBe(401);
    expect(res.headers['Cache-Control']).toBe('private, no-store');
    expect(mock.from).not.toHaveBeenCalled();
    expect(mock.storage.from).not.toHaveBeenCalled();
  });
  it.each([['upload', upload], ['complete', complete]] as const)('denies viewer %s', async (_name, handler) => {
    const res = await call(handler, request('POST', true));
    expect(res.statusCode).toBe(403);
    expect(mock.from).toHaveBeenCalledTimes(1);
    expect(mock.storage.from).not.toHaveBeenCalled();
  });
  it('returns only safe session fields for viewer', async () => {
    const res = await call(sessionHandler, request('GET', true));
    expect(res.body).toEqual({ role: 'viewer', expiresAt: active!.expires_at, csrfToken });
    expect(chain.eq).toHaveBeenCalledWith('token_digest', digest(token));
    expect(chain.gt).toHaveBeenCalledWith('expires_at', expect.any(String));
    expect(JSON.stringify(res.body)).not.toContain(token);
  });
  it('allows viewer media lookup scoped to the configured board', async () => {
    const res = await call(media, request('GET', true));
    expect(res.statusCode).toBe(404);
    expect(chain.eq).toHaveBeenCalledWith('board_id', '00000000-0000-0000-0000-000000000001');
  });
  it('revokes viewer logout session and clears cookie', async () => {
    const res = await call(logout, request('POST', true));
    expect(res.statusCode).toBe(204);
    expect(chain.delete).toHaveBeenCalled();
    expect(chain.eq).toHaveBeenCalledWith('token_digest', digest(token));
    expect(res.headers['Set-Cookie']).toContain('Max-Age=0');
  });
  it('denies expired/revoked sessions', async () => {
    active = null;
    expect((await call(sessionHandler, request('GET', true))).statusCode).toBe(401);
  });
  it('does not expose database failures', async () => {
    mock.from.mockImplementation(() => { throw new Error('secret SQL failure'); });
    const res = await call(sessionHandler, request('GET', true));
    expect(res.statusCode).toBe(503);
    expect(JSON.stringify(res.body)).not.toContain('secret SQL');
  });
  it.each([upload, complete])('denies editor mutation without CSRF', async handler => {
    active!.role = 'editor';
    const req = request('POST', true);
    delete req.headers['x-csrf-token'];
    expect((await call(handler, req)).statusCode).toBe(403);
  });
  it('allows editor to reach upload validation', async () => {
    active!.role = 'editor';
    expect((await call(upload, request('POST', true))).statusCode).toBe(422);
  });
  it('scopes editor completion lookup to board', async () => {
    active!.role = 'editor';
    expect((await call(complete, request('POST', true))).statusCode).toBe(404);
    expect(chain.eq).toHaveBeenCalledWith('board_id', '00000000-0000-0000-0000-000000000001');
  });
});

describe('login', () => {
  it.each(['viewer', 'editor', 'wrong'])('checks both Argon2 hashes for %s', async role => {
    const res = await call(login, request('POST', false, { body: { password: `${role}-password` } }));
    expect(verify).toHaveBeenCalledTimes(2);
    if (role === 'wrong') expect(res.statusCode).toBe(401);
    else {
      expect(res.statusCode).toBe(200);
      expect(res.body).toMatchObject({ role, csrfToken: expect.stringMatching(/^[a-f0-9]{64}$/) });
      expect(res.headers['Set-Cookie']).toMatch(/^__Host-eefje_session=[a-f0-9]{64}; Path=\/; HttpOnly; SameSite=Strict; Max-Age=604800; Secure$/);
      const args = mock.rpc.mock.calls.find(([name]) => name === 'create_session')![1];
      expect(args.session_digest).toMatch(/^[a-f0-9]{64}$/);
      expect(JSON.stringify(res.body)).not.toContain(args.session_digest);
    }
  });
  it('blocks throttled requests before expensive verification', async () => {
    mock.rpc.mockResolvedValue({ data: false, error: null });
    expect((await call(login, request('POST', false, { body: { password: 'wrong' } }))).statusCode).toBe(429);
    expect(verify).not.toHaveBeenCalled();
  });
  it('fails closed on throttle errors', async () => {
    mock.rpc.mockResolvedValue({ data: null, error: new Error('db') });
    expect((await call(login, request('POST', false, { body: { password: 'wrong' } }))).statusCode).toBe(503);
  });
  it('hashes trusted address, ignoring spoofed forwarded-for locally', async () => {
    const req = request('POST', false, { body: { password: 'wrong' } });
    req.headers['x-forwarded-for'] = 'attacker-supplied';
    await call(login, req);
    expect(mock.rpc.mock.calls[0][1].source_key).toMatch(/^[a-f0-9]{64}$/);
  });
  it('uses the socket address under vercel dev even when VERCEL=1', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'development');
    try {
      const res = await call(login, request('POST', false, { body: { password: 'wrong' } }));
      expect(res.statusCode).toBe(401);
      expect(mock.rpc).toHaveBeenCalledWith('consume_login_attempt', expect.any(Object));
    } finally { vi.unstubAllEnvs(); }
  });
  it('fails closed when a hosted request lacks the trusted address header', async () => {
    vi.stubEnv('VERCEL', '1');
    vi.stubEnv('VERCEL_ENV', 'production');
    try {
      expect((await call(login, request('POST', false, { body: { password: 'wrong' } }))).statusCode).toBe(503);
      expect(mock.rpc).not.toHaveBeenCalled();
    } finally { vi.unstubAllEnvs(); }
  });
  it('rejects cross-origin login', async () => {
    const req = request('POST');
    req.headers.origin = 'https://evil.test';
    expect((await call(login, req)).statusCode).toBe(403);
    expect(mock.from).not.toHaveBeenCalled();
  });
});

describe('request and cookie protections', () => {
  it('requires exact origin and JSON, then session-bound CSRF', () => {
    const res = response() as unknown as VercelResponse;
    const req = request('POST');
    req.headers.origin = 'https://example.test.evil.test';
    expect(checkMutation(req, res)).toBe(false);
    req.headers.origin = 'https://example.test';
    req.headers['content-type'] = 'text/plain';
    expect(checkMutation(req, res)).toBe(false);
  });
  it('uses separate opt-in insecure development cookie, never in production', () => {
    vi.stubEnv('NODE_ENV', 'development');
    process.env.DEV_INSECURE_COOKIE = 'true';
    expect(sessionCookie(token)).toContain('eefje_dev_session=');
    vi.stubEnv('NODE_ENV', 'production');
    expect(sessionCookie(token)).toContain('__Host-eefje_session=');
    expect(sessionCookie(token)).toContain('; Secure');
    vi.unstubAllEnvs();
  });
});
