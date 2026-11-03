import type { VercelRequest, VercelResponse } from '@vercel/node';
import { supabaseAdmin } from '../../../server/media/supabase';
import { methodNotAllowed, sendError } from '../../../server/media/errors';
import { DISPLAY_VARIANT, MEDIA_BUCKET } from '../../../server/media/constants';

/**
 * GET /api/media/:mediaId/:variant
 * Streams media bytes from the private bucket. Auth (session + role)
 * lands in phase 2; the bucket itself has no public policies.
 */
export default async function handler(req: VercelRequest, res: VercelResponse) {
  if (req.method !== 'GET') {
    return methodNotAllowed(res, 'GET');
  }

  const { mediaId, variant } = req.query;
  if (typeof mediaId !== 'string' || typeof variant !== 'string') {
    return sendError(res, 400, 'bad_request', 'Missing media id or variant');
  }
  if (variant !== DISPLAY_VARIANT) {
    return sendError(res, 404, 'not_found', 'Unknown variant');
  }

  const supabase = supabaseAdmin();
  const { data: asset, error: lookupError } = await supabase
    .from('media_assets')
    .select('storage_key, mime_type, status')
    .eq('id', mediaId)
    .eq('status', 'ready')
    .single();
  if (lookupError || !asset?.storage_key) {
    return sendError(res, 404, 'not_found', 'Media not found');
  }

  const { data: file, error: downloadError } = await supabase.storage
    .from(MEDIA_BUCKET)
    .download(asset.storage_key);
  if (downloadError || !file) {
    return sendError(res, 404, 'not_found', 'Media file not found');
  }

  res.setHeader('Content-Type', asset.mime_type ?? 'application/octet-stream');
  res.setHeader('Cache-Control', 'private, no-store');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.send(Buffer.from(await file.arrayBuffer()));
}
