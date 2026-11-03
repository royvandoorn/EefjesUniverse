import { methodNotAllowed } from '../../server/media/errors.ts';
import { supabaseAdmin } from '../../server/media/supabase.ts';
import { checkMutation, requireSession, secureHandler, sessionCookie } from '../../server/auth/security.ts';

export default secureHandler(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  const session = await requireSession(req, res);
  if (!session || !checkMutation(req, res, session)) return;
  const { error } = await supabaseAdmin().from('sessions').delete().eq('token_digest', session.digest);
  if (error) throw new Error('Logout failed');
  res.setHeader('Set-Cookie', sessionCookie('', 0));
  res.status(204).end();
});
