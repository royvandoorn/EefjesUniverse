import type { VercelRequest, VercelResponse } from '@vercel/node';
import { randomUUID } from 'node:crypto';
import { supabaseAdmin } from '../../server/media/supabase';
import { methodNotAllowed, sendError } from '../../server/media/errors';
import { uploadRequestSchema } from '../../server/media/validation';
import { STAGING_BUCKET } from '../../server/media/constants';

const SEED_BOARD_ID = process.env.BOARD_ID ?? '00000000-0000-0000-0000-000000000001';

/**
 * POST /api/media/uploads
 * Body: { byteSize, mimeType }
 * Returns a short-lived signed upload URL for the private staging bucket.
 * NOTE: editor authorization lands in phase 2; this is the phase-1 prototype.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
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
}
