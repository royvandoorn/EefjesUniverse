import { boardId, requireEditor, secureHandler } from '../server/auth/security.ts';
import { methodNotAllowed, sendError } from '../server/media/errors.ts';
import { supabaseAdmin } from '../server/media/supabase.ts';
import { toElement } from '../server/board/store.ts';
import { contentSchemaFor, createElementSchema, MAX_ELEMENTS } from '../src/shared/board.ts';

/**
 * POST /api/elements — create a card. The client supplies a UUID so a
 * retried create is idempotent: on conflict the existing row is returned.
 */
export default secureHandler(async (req, res) => {
  if (req.method !== 'POST') return methodNotAllowed(res, 'POST');
  if (!await requireEditor(req, res)) return;

  const parsed = createElementSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'invalid_fields', 'Invalid element', parsed.error.issues);
  }
  const input = parsed.data;
  const content = contentSchemaFor(input.type).safeParse(input.content);
  if (!content.success) {
    return sendError(res, 422, 'invalid_fields', 'Invalid element content', content.error.issues);
  }

  const db = supabaseAdmin();
  const board = boardId();

  const { count, error: countError } = await db
    .from('elements').select('id', { count: 'exact', head: true }).eq('board_id', board);
  if (countError) throw new Error('Element count failed');
  if ((count ?? 0) >= MAX_ELEMENTS) {
    return sendError(res, 422, 'board_full', `The board is limited to ${MAX_ELEMENTS} cards`);
  }

  let mediaId: string | null = null;
  if (input.type === 'image') {
    mediaId = (content.data as { mediaId: string }).mediaId;
    const { data: media } = await db.from('media_assets')
      .select('id').eq('id', mediaId).eq('board_id', board).eq('status', 'ready').maybeSingle();
    if (!media) return sendError(res, 422, 'invalid_fields', 'Image media is not available');
  }

  if (input.groupId) {
    const { data: group } = await db.from('visual_groups')
      .select('id').eq('id', input.groupId).eq('board_id', board).maybeSingle();
    if (!group) return sendError(res, 422, 'invalid_fields', 'Unknown group');
  }

  const { data: top } = await db.from('elements').select('z_index')
    .eq('board_id', board).order('z_index', { ascending: false }).limit(1).maybeSingle();
  const zIndex = input.zIndex ?? (top?.z_index ?? 0) + 1;

  const { data: inserted, error: insertError } = await db.from('elements').insert({
    id: input.id,
    board_id: board,
    type: input.type,
    x: input.x,
    y: input.y,
    width: input.width,
    height: input.height,
    z_index: zIndex,
    group_id: input.groupId ?? null,
    media_id: mediaId,
    content: content.data,
  }).select().maybeSingle();

  if (inserted) return res.status(201).json({ element: toElement(inserted) });

  if (insertError?.code === '23505') {
    // Retry of the same client-generated id: return the existing row.
    const { data: existing } = await db.from('elements').select()
      .eq('id', input.id).eq('board_id', board).maybeSingle();
    if (existing) return res.status(200).json({ element: toElement(existing) });
  }
  if (insertError?.code === '23514') {
    return sendError(res, 422, 'invalid_fields', 'Element violates board constraints');
  }
  throw new Error('Element create failed');
});
