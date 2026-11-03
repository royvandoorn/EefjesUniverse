import { methodNotAllowed } from '../../server/media/errors.ts';
import { requireSession, secureHandler } from '../../server/auth/security.ts';

export default secureHandler(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  const session = await requireSession(req, res);
  if (!session) return;
  res.status(200).json({ role: session.role, expiresAt: session.expiresAt, csrfToken: session.csrfToken });
});
