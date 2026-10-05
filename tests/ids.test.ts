import { afterEach, describe, expect, it, vi } from 'vitest';
import { createId } from '../src/shared/utils/ids';

describe('createId', () => {
  afterEach(() => vi.unstubAllGlobals());

  it('uses crypto.randomUUID when available', () => {
    const randomUUID = vi.fn(() => '00000000-0000-4000-8000-000000000001');
    vi.stubGlobal('crypto', { randomUUID, getRandomValues: vi.fn() });

    expect(createId()).toBe('00000000-0000-4000-8000-000000000001');
    expect(randomUUID).toHaveBeenCalledOnce();
  });

  it('creates a secure UUID v4 when crypto.randomUUID is unavailable', () => {
    const secureCrypto = globalThis.crypto;
    const getRandomValues = vi.fn((bytes: Uint8Array) => secureCrypto.getRandomValues(bytes));
    vi.stubGlobal('crypto', { getRandomValues });

    expect(createId()).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    expect(getRandomValues).toHaveBeenCalledOnce();
  });

  it('produces distinct consecutive IDs when only getRandomValues is available', () => {
    const secureCrypto = globalThis.crypto;
    vi.stubGlobal('crypto', { getRandomValues: (bytes: Uint8Array) => secureCrypto.getRandomValues(bytes) });
    const ids = Array.from({ length: 1000 }, createId);

    expect(new Set(ids).size).toBe(ids.length);
  });

  it('fails explicitly if no cryptographically secure random source exists', () => {
    vi.stubGlobal('crypto', {});

    expect(() => createId()).toThrow('No hay una fuente criptográfica segura');
  });
});
