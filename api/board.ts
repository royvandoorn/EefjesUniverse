import { boardId, requireSession, secureHandler } from '../server/auth/security.ts';
import { methodNotAllowed, sendError } from '../server/media/errors.ts';
import { fetchBoardPayload } from '../server/board/store.ts';

/** GET /api/board — the whole board snapshot for the configured board. */
export default secureHandler(async (req, res) => {
  if (req.method !== 'GET') return methodNotAllowed(res, 'GET');
  if (!await requireSession(req, res)) return;
  const payload = await fetchBoardPayload(boardId());
  if (!payload) return sendError(res, 404, 'not_found', 'Board not found');
  res.status(200).json(payload);
});
