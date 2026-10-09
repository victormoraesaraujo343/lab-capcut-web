import { describe, expect, it } from 'vitest';
import type { Asset } from '@/types';
import { IMAGE_DEFAULT_DURATION_MS } from '@/engine/timeline/constants';
import { createClipFromAsset, trackKindForAsset } from '@/engine/timeline/clipFactory';

/** Monta um asset de teste. */
function asset(overrides: Partial<Asset> = {}): Asset {
  return {
    id: 'asset-1',
    kind: 'video',
    name: 'clip.mp4',
    mimeType: 'video/mp4',
    opfsPath: 'media/clip.mp4',
    sizeBytes: 1024,
    thumbnails: [],
    createdAt: 0,
    ...overrides,
  };
}

describe('trackKindForAsset', () => {
  it('mapeia cada tipo de asset para a trilha correspondente', () => {
    expect(trackKindForAsset('video')).toBe('video');
    expect(trackKindForAsset('image')).toBe('video');
    expect(trackKindForAsset('audio')).toBe('audio');
    expect(trackKindForAsset('sticker')).toBe('sticker');
  });
});

describe('createClipFromAsset', () => {
  it('usa a duração do asset quando existe', () => {
    const clip = createClipFromAsset(asset({ durationMs: 3000 }), 'v1', 500);
    expect(clip.durationMs).toBe(3000);
    expect(clip.startMs).toBe(500);
    expect(clip.trackId).toBe('v1');
    expect(clip.assetId).toBe('asset-1');
  });

  it('imagem sem duração recebe a duração padrão', () => {
    const clip = createClipFromAsset(asset({ kind: 'image' }), 'v1', 0);
    expect(clip.durationMs).toBe(IMAGE_DEFAULT_DURATION_MS);
  });

  it('começa com valores padrão de recorte, transformação, velocidade e áudio', () => {
    const clip = createClipFromAsset(asset({ durationMs: 1000 }), 'v1', 0);
    expect(clip.trimInMs).toBe(0);
    expect(clip.trimOutMs).toBe(0);
    expect(clip.volume).toBe(1);
    expect(clip.keyframes).toEqual({});
    expect(clip.filters).toEqual([]);
    expect(clip.effects).toEqual([]);
    expect(clip.reversed).toBe(false);
    expect(clip.transform).toMatchObject({ x: 0, y: 0, scaleX: 1, scaleY: 1, opacity: 1, rotation: 0 });
    expect(clip.speed).toMatchObject({ mode: 'constant', value: 1 });
    expect(clip.audio).toEqual({ fadeInMs: 0, fadeOutMs: 0, denoise: false });
  });

  it('gera um id novo a cada clipe', () => {
    const a = createClipFromAsset(asset(), 'v1', 0);
    const b = createClipFromAsset(asset(), 'v1', 0);
    expect(a.id).not.toBe('');
    expect(a.id).not.toBe(b.id);
  });
});
