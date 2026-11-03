import { z } from 'zod';

export const MAX_UPLOAD_BYTES = 10 * 1024 * 1024; // 10 MiB
export const MAX_DISPLAY_DIMENSION = 2400;
export const DISPLAY_QUALITY = 82;

export const ACCEPTED_MIME_TYPES = ['image/jpeg', 'image/png', 'image/webp'] as const;
export type AcceptedMimeType = (typeof ACCEPTED_MIME_TYPES)[number];

export const uploadRequestSchema = z.object({
  byteSize: z
    .number()
    .int()
    .positive()
    .max(MAX_UPLOAD_BYTES, `File must be at most ${MAX_UPLOAD_BYTES} bytes`),
  mimeType: z.enum(ACCEPTED_MIME_TYPES),
});

export type UploadRequest = z.infer<typeof uploadRequestSchema>;

export function isAcceptedMimeType(value: string): value is AcceptedMimeType {
  return (ACCEPTED_MIME_TYPES as readonly string[]).includes(value);
}
