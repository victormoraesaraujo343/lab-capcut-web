// Testes da caixa de manipulação da prévia: alças, arrasto gravado ao soltar, Esc, setas, reprodução e trilha travada.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { act, cleanup, fireEvent, render, screen } from '@testing-library/react';
import { TransformOverlay } from '@/features/preview/TransformOverlay';
import { t } from '@/i18n/pt-BR';
import { usePlaybackStore } from '@/stores/playbackStore';
import { usePreviewOverrideStore } from '@/stores/previewOverrideStore';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { setClipTransform } from '@/stores/timelineCommands';
import {
  defaultAudioFx,
  defaultSpeed,
  defaultTransform,
  type Asset,
  type Clip,
  type Project,
  type Track,
} from '@/types';

vi.mock('@/stores/timelineCommands', () => ({
  setClipTransform: vi.fn(),
  selectClip: vi.fn(),
}));

/** Projeto de teste 1920x1080 com um clipe de imagem (c1) numa trilha, travada ou não. */
function makeProject(locked = false): Project {
  const asset: Asset = {
    id: 'a1',
    kind: 'image',
    name: 'foto.png',
    mimeType: 'image/png',
    opfsPath: 'foto.png',
    sizeBytes: 1,
    thumbnails: [],
    width: 1920,
    height: 1080,
    createdAt: 0,
  };
  const clip: Clip = {
    id: 'c1',
    assetId: 'a1',
    trackId: 'tr1',
    startMs: 0,
    durationMs: 5000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    audio: defaultAudioFx(),
    reversed: false,
  };
  const track: Track = { id: 'tr1', kind: 'video', name: 'Vídeo', clips: [clip], muted: false, locked, hidden: false };
  return {
    id: 'p1',
    name: 'Projeto',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 5000,
    tracks: [track],
    assets: [asset],
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Prepara o projeto, a seleção e o cursor; a prévia tem 400 px de largura exibida. */
function setup(locked = false): HTMLElement {
  useProjectStore.setState({ project: makeProject(locked) });
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
  useTimelineStore.setState({ selectedClipIds: ['c1'] });
  const { container } = render(<TransformOverlay />);
  const stage = container.querySelector('[tabindex="0"]');
  if (!(stage instanceof HTMLElement)) throw new Error('Prévia não renderizou');
  return stage;
}

beforeEach(() => {
  vi.stubGlobal(
    'ResizeObserver',
    class {
      observe(): void {
        /* a largura vem do clientWidth simulado */
      }
      unobserve(): void {
        /* sem efeito nos testes */
      }
      disconnect(): void {
        /* sem efeito nos testes */
      }
    },
  );
  vi.spyOn(Element.prototype, 'clientWidth', 'get').mockReturnValue(400);
  Element.prototype.setPointerCapture = (): void => undefined;
  Element.prototype.releasePointerCapture = (): void => undefined;
  Element.prototype.hasPointerCapture = (): boolean => false;
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(setClipTransform).mockClear();
  usePreviewOverrideStore.getState().clearOverride();
  useProjectStore.setState({ project: null });
  useTimelineStore.setState({ selectedClipIds: [] });
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
});

describe('TransformOverlay', () => {
  it('com clipe selecionado mostra 4 alças de canto e a de giro', () => {
    setup();
    expect(screen.getAllByRole('button', { name: t.preview.resize })).toHaveLength(4);
    expect(screen.getByRole('button', { name: t.preview.rotate })).toBeInTheDocument();
  });

  it('sem seleção não mostra alças', () => {
    setup();
    act(() => useTimelineStore.setState({ selectedClipIds: [] }));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
  });

  it('arrastar grava no fim: setOverride durante o movimento e setClipTransform ao soltar', () => {
    const stage = setup();
    fireEvent.pointerDown(stage, { clientX: 200, clientY: 112, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 230, clientY: 112, pointerId: 1 });
    expect(usePreviewOverrideStore.getState().clipId).toBe('c1');
    expect(setClipTransform).not.toHaveBeenCalled();
    fireEvent.pointerUp(stage, { clientX: 230, clientY: 112, pointerId: 1 });
    expect(setClipTransform).toHaveBeenCalledTimes(1);
    const [clipId, transform, label] = vi.mocked(setClipTransform).mock.calls[0] ?? [];
    expect(clipId).toBe('c1');
    expect(transform?.x).toBeCloseTo(144, 0);
    expect(label).toBe('transform');
    expect(usePreviewOverrideStore.getState().clipId).toBeNull();
  });

  it('Esc cancela o arrasto sem gravar', () => {
    const stage = setup();
    fireEvent.pointerDown(stage, { clientX: 200, clientY: 112, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 260, clientY: 112, pointerId: 1 });
    fireEvent.keyDown(stage, { key: 'Escape' });
    expect(setClipTransform).not.toHaveBeenCalled();
    expect(usePreviewOverrideStore.getState().clipId).toBeNull();
  });

  it('setas movem 1 px e Shift+seta move 10 px, gravando com setClipTransform', () => {
    const stage = setup();
    fireEvent.keyDown(stage, { key: 'ArrowRight', shiftKey: true });
    const [clipId, transform] = vi.mocked(setClipTransform).mock.calls[0] ?? [];
    expect(clipId).toBe('c1');
    expect(transform?.x).toBe(10);
    expect(transform?.y).toBe(0);
  });

  it('durante a reprodução esconde as alças e mantém só o contorno', () => {
    setup();
    act(() => usePlaybackStore.setState({ isPlaying: true }));
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    expect(document.querySelector('polygon')).not.toBeNull();
  });

  it('trilha travada não mostra alças nem deixa arrastar', () => {
    const stage = setup(true);
    expect(screen.queryAllByRole('button')).toHaveLength(0);
    fireEvent.pointerDown(stage, { clientX: 200, clientY: 112, pointerId: 1 });
    fireEvent.pointerMove(stage, { clientX: 260, clientY: 112, pointerId: 1 });
    fireEvent.pointerUp(stage, { clientX: 260, clientY: 112, pointerId: 1 });
    expect(usePreviewOverrideStore.getState().clipId).toBeNull();
  });
});
