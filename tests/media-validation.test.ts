import { describe, expect, it } from 'vitest';
import {
  ACCEPTED_MIME_TYPES,
  isAcceptedMimeType,
  MAX_UPLOAD_BYTES,
  uploadRequestSchema,
} from '../server/media/validation';

describe('uploadRequestSchema', () => {
  it('accepts a valid jpeg upload request', () => {
    const result = uploadRequestSchema.safeParse({ byteSize: 1024, mimeType: 'image/jpeg' });
    expect(result.success).toBe(true);
  });

  it('accepts all documented mime types', () => {
    for (const mimeType of ACCEPTED_MIME_TYPES) {
      expect(uploadRequestSchema.safeParse({ byteSize: 1, mimeType }).success).toBe(true);
    }
  });

  it('rejects unsupported mime types such as HEIC', () => {
    expect(uploadRequestSchema.safeParse({ byteSize: 1, mimeType: 'image/heic' }).success).toBe(
      false,
    );
    expect(uploadRequestSchema.safeParse({ byteSize: 1, mimeType: 'image/gif' }).success).toBe(
      false,
    );
  });

  it('rejects files over the 10 MiB limit', () => {
    expect(
      uploadRequestSchema.safeParse({ byteSize: MAX_UPLOAD_BYTES + 1, mimeType: 'image/png' })
        .success,
    ).toBe(false);
  });

  it('rejects zero and negative sizes', () => {
    expect(uploadRequestSchema.safeParse({ byteSize: 0, mimeType: 'image/png' }).success).toBe(
      false,
    );
    expect(uploadRequestSchema.safeParse({ byteSize: -5, mimeType: 'image/png' }).success).toBe(
      false,
    );
  });
});

describe('isAcceptedMimeType', () => {
  it('narrows accepted types', () => {
    expect(isAcceptedMimeType('image/webp')).toBe(true);
    expect(isAcceptedMimeType('text/html')).toBe(false);
  });
});
