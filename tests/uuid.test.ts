import { webcrypto } from 'node:crypto';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { createUuid } from '../src/shared/uuid.ts';

const uuidV4 = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;
afterEach(() => vi.unstubAllGlobals());

describe('createUuid', () => {
  it('uses native UUID generation when available', () => {
    const randomUUID = vi.fn(() => '12345678-1234-4234-8234-123456789abc');
    vi.stubGlobal('crypto', { randomUUID });
    expect(createUuid()).toBe('12345678-1234-4234-8234-123456789abc');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('generates version 4 UUIDs over LAN HTTP without randomUUID', () => {
    vi.stubGlobal('crypto', { getRandomValues: webcrypto.getRandomValues.bind(webcrypto) });
    const ids = Array.from({ length: 100 }, () => createUuid());
    expect(ids.every(id => uuidV4.test(id))).toBe(true);
    expect(new Set(ids).size).toBe(100);
  });

  it('sets UUID version and variant bits even with all-zero random bytes', () => {
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => bytes.fill(0) });
    expect(createUuid()).toBe('00000000-0000-4000-8000-000000000000');
  });
});
