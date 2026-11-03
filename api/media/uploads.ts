import { boardId, requireEditor, secureHandler } from '../../server/auth/security.ts';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../server/media/supabase.ts';
import { methodNotAllowed, sendError } from '../../server/media/errors.ts';
import { uploadRequestSchema } from '../../server/media/validation.ts';
import { STAGING_BUCKET } from '../../server/media/constants.ts';

const SEED_BOARD_ID = boardId();

/**
 * POST /api/media/uploads
 * Body: { byteSize, mimeType }
 * Returns a short-lived signed upload URL for the private staging bucket.
 * NOTE: editor authorization lands in phase 2; this is the phase-1 prototype.
 */
export default secureHandler(async (req, res) => {
  if (!await requireEditor(req, res)) return;
  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST');
  }

  const parsed = uploadRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return sendError(res, 422, 'invalid_upload', 'Unsupported upload request', parsed.error.issues);
  }

  const mediaId = randomUUID();
  const stagingKey = `${SEED_BOARD_ID}/${mediaId}/original`;
  const supabase = supabaseAdmin();

  const { data: signed, error: signError } = await supabase.storage
    .from(STAGING_BUCKET)
    .createSignedUploadUrl(stagingKey);
  if (signError || !signed) {
    return sendError(res, 502, 'staging_unavailable', 'Could not create an upload ticket');
  }

  const { error: insertError } = await supabase.from('media_assets').insert({
    id: mediaId,
    board_id: SEED_BOARD_ID,
    staging_key: stagingKey,
    declared_mime_type: parsed.data.mimeType,
    declared_byte_size: parsed.data.byteSize,
    status: 'staging',
  });
  if (insertError) {
    return sendError(res, 502, 'media_record_failed', 'Could not register the upload');
  }

  res.status(201).json({
    uploadId: mediaId,
    stagingKey,
    signedUrl: signed.signedUrl,
    token: signed.token,
  });
});
