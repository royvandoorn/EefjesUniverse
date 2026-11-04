import { boardId, requireEditor, secureHandler } from '../../../server/auth/security.ts';
import { methodNotAllowed, sendError } from '../../../server/media/errors.ts';
import { supabaseAdmin } from '../../../server/media/supabase.ts';
import { toElement } from '../../../server/board/store.ts';
import { replaceItemsSchema } from '../../../src/shared/board.ts';

/**
 * PUT /api/elements/:elementId/items — atomically replace the ordered item
 * array of a list card. Runs inside one transaction that bumps the parent
 * element revision (compare-and-swap on expectedRevision).
 */
export default secureHandler(async (req, res) => {
  if (req.method !== 'PUT') return methodNotAllowed(res, 'PUT');
  if (!await requireEditor(req, res)) return;

  const elementId = req.query.elementId;
  if (typeof elementId !== 'string' || !elementId) {
    return sendError(res, 400, 'bad_request', 'Missing element id');
  }
  const parsed = replaceItemsSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'invalid_fields', 'Invalid list items', parsed.error.issues);
  }

  const db = supabaseAdmin();
  const { data: revision, error } = await db.rpc('replace_list_items', {
    p_board: boardId(),
    p_element: elementId,
    p_expected_revision: parsed.data.expectedRevision,
    p_items: parsed.data.items,
  });
  if (error) {
    if (error.message.includes('element_not_found')) {
      return sendError(res, 404, 'not_found', 'List not found');
    }
    if (error.message.includes('revision_conflict')) {
      return sendError(res, 409, 'conflict', 'List changed elsewhere; reload and retry');
    }
    if (error.code === '23514') {
      return sendError(res, 422, 'invalid_fields', 'List items violate constraints');
    }
    throw new Error('List update failed');
  }

  const [{ data: element }, { data: items }] = await Promise.all([
    db.from('elements').select().eq('id', elementId).eq('board_id', boardId()).single(),
    db.from('list_items').select('id, text, completed, position').eq('element_id', elementId).order('position'),
  ]);
  if (!element || revision == null) throw new Error('List reload failed');
  res.status(200).json({ element: toElement(element), items: items ?? [] });
});
