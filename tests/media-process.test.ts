import { describe, expect, it } from 'vitest';
import sharp from 'sharp';
import { processUploadedImage } from '../server/media/process';
import { MAX_DISPLAY_DIMENSION } from '../server/media/validation';

async function makeJpeg(width: number, height: number): Promise<Buffer> {
  return sharp({
    create: { width, height, channels: 3, background: { r: 200, g: 100, b: 50 } },
  })
    .jpeg()
    .toBuffer();
}

describe('processUploadedImage', () => {
  it('re-encodes a jpeg to bounded webp with correct dimensions', async () => {
    const input = await makeJpeg(4000, 3000);
    const result = await processUploadedImage(input);
    expect(result.mimeType).toBe('image/webp');
    expect(result.width).toBe(MAX_DISPLAY_DIMENSION);
    expect(result.height).toBe(1800);
    expect(result.byteSize).toBe(result.data.byteLength);
    expect(result.byteSize).toBeLessThan(input.byteLength);
  });

  it('does not enlarge smaller images', async () => {
    const result = await processUploadedImage(await makeJpeg(800, 600));
    expect(result.width).toBe(800);
    expect(result.height).toBe(600);
  });

  it('rejects non-image input', async () => {
    await expect(processUploadedImage(Buffer.from('not an image at all'))).rejects.toThrow();
  });

  it('strips EXIF metadata', async () => {
    const withExif = await sharp(await makeJpeg(100, 100))
        .withMetadata({ exif: { IFD0: { Copyright: 'test', Make: 'phone' } } })
        .jpeg()
        .toBuffer();
    const result = await processUploadedImage(withExif);
    const meta = await sharp(result.data).metadata();
    expect(meta.exif).toBeUndefined();
  });
});
