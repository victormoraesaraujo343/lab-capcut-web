// Testes das miniaturas do clipe: a metade direita de um clipe dividido precisa mostrar imagens.
import { cleanup, render } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ClipThumbnails } from '@/features/timeline/ClipThumbnails';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip } from '@/types';

vi.mock('@/features/media/useObjectUrl', () => ({
  useObjectUrl: vi.fn((path: string | undefined) => (path === undefined ? undefined : `blob:${path}`)),
}));

afterEach(() => cleanup());

/** Cria a metade direita de um clipe de vídeo dividido em 3s. */
function rightHalf(): Clip {
  return {
    id: 'c2',
    assetId: 'a1',
    trackId: 't1',
    startMs: 3000,
    durationMs: 5000,
    trimInMs: 3000,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
  };
}

/** Asset de vídeo de 8s com 4 miniaturas. */
const asset: Asset = {
  id: 'a1',
  kind: 'video',
  name: 'video.mp4',
  mimeType: 'video/mp4',
  opfsPath: 'media/video.mp4',
  sizeBytes: 10,
  durationMs: 8000,
  thumbnails: ['t0', 't1', 't2', 't3'],
  createdAt: 0,
};

describe('ClipThumbnails: metade direita de clipe dividido', () => {
  it('mostra imagens nos slots visíveis', () => {
    const { container } = render(
      <ClipThumbnails
        clip={rightHalf()}
        asset={asset}
        zoom={12}
        heightPx={60}
        range={{ fromPx: 0, toPx: 60 }}
      />,
    );
    const imgs = container.querySelectorAll('img');
    expect(imgs.length).toBeGreaterThan(0);
    expect(imgs[0]?.getAttribute('src')).toBe('blob:t1');
  });
});
