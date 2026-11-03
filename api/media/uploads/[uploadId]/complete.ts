import { boardId, requireEditor, secureHandler } from '../../../../server/auth/security.ts';
import { supabaseAdmin } from '../../../../server/media/supabase.ts';
import { methodNotAllowed, sendError } from '../../../../server/media/errors.ts';
import { processUploadedImage } from '../../../../server/media/process.ts';
import { DISPLAY_VARIANT, MEDIA_BUCKET, STAGING_BUCKET } from '../../../../server/media/constants.ts';

/**
 * POST /api/media/uploads/:uploadId/complete
 * Downloads the staged original, validates and processes it with Sharp,
 * stores the display variant in the private media bucket and marks the
 * media_assets row ready. Staging bytes are removed afterwards.
 * NOTE: editor authorization lands in phase 2; this is the phase-1 prototype.
 */
export default secureHandler(async (req, res) => {
  if (!await requireEditor(req, res)) return;
  if (req.method !== 'POST') {
    return methodNotAllowed(res, 'POST');
  }

  const uploadId = req.query.uploadId;
  if (typeof uploadId !== 'string') {
    return sendError(res, 400, 'bad_request', 'Missing upload id');
  }

  const supabase = supabaseAdmin();
  const { data: asset, error: lookupError } = await supabase
    .from('media_assets')
    .select('id, board_id, staging_key, status')
    .eq('id', uploadId)
    .eq('board_id', boardId())
    .single();

  if (lookupError || !asset) {
    return sendError(res, 404, 'not_found', 'Upload not found');
  }
  if (asset.status === 'ready') {
    return sendError(res, 409, 'already_completed', 'Upload was already finalized');
  }

  const { data: staged, error: downloadError } = await supabase.storage
    .from(STAGING_BUCKET)
    .download(asset.staging_key);
  if (downloadError || !staged) {
    return sendError(res, 404, 'staging_missing', 'No staged file found for this upload');
  }

  const input = Buffer.from(await staged.arrayBuffer());
  let processed;
  try {
    processed = await processUploadedImage(input);
  } catch {
    await supabase.from('media_assets').update({ status: 'rejected' }).eq('id', uploadId);
    return sendError(res, 415, 'unsupported_media', 'The file is not a valid image');
  }

  const storageKey = `${asset.board_id}/${asset.id}/${DISPLAY_VARIANT}.webp`;
  const { error: storeError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .upload(storageKey, processed.data, { contentType: processed.mimeType, upsert: false });
  if (storeError) {
    return sendError(res, 502, 'storage_failed', 'Could not store the processed image');
  }

  const { error: updateError } = await supabase
    .from('media_assets')
    .update({
      status: 'ready',
      storage_key: storageKey,
      mime_type: processed.mimeType,
      width: processed.width,
      height: processed.height,
      byte_size: processed.byteSize,
    })
    .eq('id', uploadId);
  if (updateError) {
    return sendError(res, 502, 'media_record_failed', 'Could not finalize the media record');
  }

  // Best-effort staging cleanup after the durable work succeeded.
  await supabase.storage.from(STAGING_BUCKET).remove([asset.staging_key]);

  res.status(200).json({
    mediaId: asset.id,
    width: processed.width,
    height: processed.height,
    byteSize: processed.byteSize,
    mimeType: processed.mimeType,
  });
});
