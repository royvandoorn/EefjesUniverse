import type { VercelRequest, VercelResponse } from '@vercel/node';
import { boardId, requireEditor, secureHandler } from '../../server/auth/security.ts';
import { methodNotAllowed, sendError } from '../../server/media/errors.ts';
import { supabaseAdmin } from '../../server/media/supabase.ts';
import { toElement } from '../../server/board/store.ts';
import { MEDIA_BUCKET } from '../../server/media/constants.ts';
import { contentSchemaFor, deleteElementSchema, patchElementSchema } from '../../src/shared/board.ts';

/**
 * PATCH  /api/elements/:elementId — compare-and-swap on expectedRevision.
 * DELETE /api/elements/:elementId — delete the aggregate; media file cleanup
 * runs best-effort after the database commit.
 */
export default secureHandler(async (req, res) => {
  if (!await requireEditor(req, res)) return;
  const elementId = req.query.elementId;
  if (typeof elementId !== 'string' || !elementId) {
    return sendError(res, 400, 'bad_request', 'Missing element id');
  }
  if (req.method === 'PATCH') return patch(req, res, elementId);
  if (req.method === 'DELETE') return remove(req, res, elementId);
  return methodNotAllowed(res, 'PATCH, DELETE');
});

const ELEMENT_COLUMNS = 'id, type, x, y, width, height, z_index, group_id, media_id, revision, content, created_at, updated_at';

async function patch(req: VercelRequest, res: VercelResponse, elementId: string) {
  const parsed = patchElementSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'invalid_fields', 'Invalid element update', parsed.error.issues);
  }
  const input = parsed.data;
  const db = supabaseAdmin();
  const board = boardId();

  const { data: current } = await db.from('elements').select(ELEMENT_COLUMNS)
    .eq('id', elementId).eq('board_id', board).maybeSingle();
  if (!current) return sendError(res, 404, 'not_found', 'Card not found');
  if (current.revision !== input.expectedRevision) {
    return sendError(res, 409, 'conflict', 'Card changed elsewhere; reload and retry', { element: toElement(current) });
  }

  const update: Record<string, unknown> = { revision: input.expectedRevision + 1, updated_at: new Date().toISOString() };
  if (input.x !== undefined) update.x = input.x;
  if (input.y !== undefined) update.y = input.y;
  if (input.width !== undefined) update.width = input.width;
  if (input.height !== undefined) update.height = input.height;
  if (input.zIndex !== undefined) update.z_index = input.zIndex;
  if (input.groupId !== undefined) {
    if (input.groupId) {
      const { data: group } = await db.from('visual_groups')
        .select('id').eq('id', input.groupId).eq('board_id', board).maybeSingle();
      if (!group) return sendError(res, 422, 'invalid_fields', 'Unknown group');
    }
    update.group_id = input.groupId;
  }
  if (input.content !== undefined) {
    const content = contentSchemaFor(current.type).safeParse(input.content);
    if (!content.success) {
      return sendError(res, 422, 'invalid_fields', 'Invalid element content', content.error.issues);
    }
    if (current.type === 'image') {
      const mediaId = (content.data as { mediaId: string }).mediaId;
      if (mediaId !== current.media_id) {
        const { data: media } = await db.from('media_assets')
          .select('id').eq('id', mediaId).eq('board_id', board).eq('status', 'ready').maybeSingle();
        if (!media) return sendError(res, 422, 'invalid_fields', 'Image media is not available');
      }
      update.media_id = mediaId;
    }
    update.content = content.data;
  }

  const { data: updated, error } = await db.from('elements').update(update)
    .eq('id', elementId).eq('board_id', board)
    .eq('revision', input.expectedRevision).select(ELEMENT_COLUMNS).maybeSingle();
  if (error) {
    if (error.code === '23514') return sendError(res, 422, 'invalid_fields', 'Element violates board constraints');
    throw new Error('Element update failed');
  }
  if (!updated) {
    return sendError(res, 409, 'conflict', 'Card changed elsewhere; reload and retry');
  }
  if (current.media_id && updated.media_id !== current.media_id) {
    try {
      const { data: references, error: referenceError } = await db.from('elements').select('id')
        .eq('board_id', board).eq('media_id', current.media_id).limit(1);
      if (!referenceError && references?.length === 0) {
        const { data: media } = await db.from('media_assets').update({ status: 'deleted' })
          .eq('id', current.media_id).eq('board_id', board).select('storage_key').maybeSingle();
        if (media?.storage_key) await db.storage.from(MEDIA_BUCKET).remove([media.storage_key]);
      }
    } catch {
      res.status(200).json({ element: toElement(updated) });
      return;
    }
  }
  res.status(200).json({ element: toElement(updated) });
}

async function remove(req: VercelRequest, res: VercelResponse, elementId: string) {
  const parsed = deleteElementSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'invalid_fields', 'Invalid delete request', parsed.error.issues);
  }
  const db = supabaseAdmin();
  const board = boardId();

  const { data: current } = await db.from('elements').select('id, media_id, revision')
    .eq('id', elementId).eq('board_id', board).maybeSingle();
  if (!current) return sendError(res, 404, 'not_found', 'Card not found');
  if (current.revision !== parsed.data.expectedRevision) {
    return sendError(res, 409, 'conflict', 'Card changed elsewhere; reload and retry');
  }

  const { error } = await db.from('elements').delete()
    .eq('id', elementId).eq('board_id', board).eq('revision', parsed.data.expectedRevision);
  if (error) throw new Error('Element delete failed');

  // Database commit done: clean up the media record/file best-effort so a
  // storage failure can never leave the board inconsistent.
  if (current.media_id) {
    const { data: media } = await db.from('media_assets').update({ status: 'deleted' })
      .eq('id', current.media_id).eq('board_id', board).select('storage_key').maybeSingle();
    if (media?.storage_key) {
      await db.storage.from(MEDIA_BUCKET).remove([media.storage_key]);
    }
  }
  res.status(204).end();
}
