import { afterEach, describe, expect, it, vi } from 'vitest';
import { canFetchLocalAssets, isFileProtocol } from '../src/engine/env/runtimeEnv';

describe('runtimeEnv', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('reconhece endereço da web', () => {
    vi.stubGlobal('location', { protocol: 'http:' });
    expect(isFileProtocol()).toBe(false);
    expect(canFetchLocalAssets()).toBe(true);
  });

  it('reconhece file://', () => {
    vi.stubGlobal('location', { protocol: 'file:' });
    expect(isFileProtocol()).toBe(true);
    expect(canFetchLocalAssets()).toBe(false);
  });
});
