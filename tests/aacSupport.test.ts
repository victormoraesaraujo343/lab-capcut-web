import { afterEach, describe, expect, it, vi } from 'vitest';

/** Carrega o módulo do zero para zerar o cache interno de canEncodeAac. */
async function loadFresh(): Promise<typeof import('../src/engine/export/aacSupport')> {
  vi.resetModules();
  return import('../src/engine/export/aacSupport');
}

describe('canEncodeAac', () => {
  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('devolve true quando o AudioEncoder aceita AAC estéreo 192 kbps', async () => {
    const isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
    vi.stubGlobal('AudioEncoder', { isConfigSupported });
    const { canEncodeAac } = await loadFresh();

    await expect(canEncodeAac()).resolves.toBe(true);
    expect(isConfigSupported).toHaveBeenCalledWith({
      codec: 'mp4a.40.2',
      sampleRate: 48000,
      numberOfChannels: 2,
      bitrate: 192000,
    });
  });

  it('devolve false quando o navegador recusa AAC', async () => {
    vi.stubGlobal('AudioEncoder', { isConfigSupported: vi.fn().mockResolvedValue({ supported: false }) });
    const { canEncodeAac } = await loadFresh();

    await expect(canEncodeAac()).resolves.toBe(false);
  });

  it('devolve false quando AudioEncoder não existe', async () => {
    vi.stubGlobal('AudioEncoder', undefined);
    const { canEncodeAac } = await loadFresh();

    await expect(canEncodeAac()).resolves.toBe(false);
  });

  it('devolve false quando isConfigSupported lança erro', async () => {
    vi.stubGlobal('AudioEncoder', { isConfigSupported: vi.fn().mockRejectedValue(new TypeError('boom')) });
    const { canEncodeAac } = await loadFresh();

    await expect(canEncodeAac()).resolves.toBe(false);
  });

  it('memoiza o resultado: consulta o AudioEncoder uma única vez por taxa', async () => {
    const isConfigSupported = vi.fn().mockResolvedValue({ supported: true });
    vi.stubGlobal('AudioEncoder', { isConfigSupported });
    const { canEncodeAac } = await loadFresh();

    await expect(canEncodeAac()).resolves.toBe(true);
    await expect(canEncodeAac()).resolves.toBe(true);
    expect(isConfigSupported).toHaveBeenCalledTimes(1);

    await canEncodeAac(44100);
    expect(isConfigSupported).toHaveBeenCalledTimes(2);
  });
});
