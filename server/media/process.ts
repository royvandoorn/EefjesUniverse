import sharp from 'sharp';
import { DISPLAY_QUALITY, MAX_DISPLAY_DIMENSION } from './validation.ts';

export type ProcessedImage = {
  data: Buffer;
  mimeType: 'image/webp';
  width: number;
  height: number;
  byteSize: number;
};

/**
 * Validates that `input` actually decodes as an image, applies EXIF
 * orientation, strips all metadata (including GPS), bounds the longest
 * edge to MAX_DISPLAY_DIMENSION and re-encodes to WebP.
 *
 * Throws if the input is not a decodable image.
 */
export async function processUploadedImage(input: Buffer): Promise<ProcessedImage> {
  const data = await sharp(input, { failOn: 'error' })
    .rotate()
    .resize({
      width: MAX_DISPLAY_DIMENSION,
      height: MAX_DISPLAY_DIMENSION,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: DISPLAY_QUALITY })
    .toBuffer({ resolveWithObject: false });

  const meta = await sharp(data).metadata();
  if (!meta.width || !meta.height) {
    throw new Error('Processed image has no dimensions');
  }
  return {
    data,
    mimeType: 'image/webp',
    width: meta.width,
    height: meta.height,
    byteSize: data.byteLength,
  };
}
