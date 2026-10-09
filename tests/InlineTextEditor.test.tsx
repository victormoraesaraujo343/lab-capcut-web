// Testes do editor de texto sobre a prévia: foco e seleção ao abrir, gravação por updateText, teclas que fecham e não vazam para atalhos.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { InlineTextEditor } from '@/features/preview/InlineTextEditor';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { t } from '@/i18n/pt-BR';
import { usePlaybackStore } from '@/stores/playbackStore';
import { useProjectStore } from '@/stores/projectStore';
import { updateText } from '@/stores/textCommands';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project, type Track } from '@/types';

vi.mock('@/stores/textCommands', () => ({
  updateText: vi.fn(),
}));

vi.mock('@/engine/text/textRasterizer', () => ({
  createTextRasterizer: () => ({
    measure: () => ({ width: 400, height: 100 }),
    rasterize: () => {
      throw new Error('não usado nos testes do editor');
    },
    dispose: () => undefined,
  }),
}));

/** Projeto 1920x1080 com um clipe de texto t1 com o conteúdo 'Oi' numa trilha de texto. */
function makeProject(): Project {
  const clip: Clip = {
    id: 't1',
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
    text: { content: 'Oi', style: defaultTextStyle() },
  };
  const track: Track = { id: 'tr1', kind: 'text', name: 'Texto', clips: [clip], muted: false, locked: false, hidden: false };
  return {
    id: 'p1',
    name: 'Projeto',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 5000,
    tracks: [track],
    assets: [],
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Renderiza o editor do clipe t1 com um onClose espião. */
function setup(): { onClose: ReturnType<typeof vi.fn>; area: HTMLTextAreaElement } {
  const onClose = vi.fn();
  useProjectStore.setState({ project: makeProject() });
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
  render(<InlineTextEditor clipId="t1" onClose={onClose} />);
  const area = screen.getByRole('textbox', { name: t.text.content });
  if (!(area instanceof HTMLTextAreaElement)) throw new Error('Editor não renderizou');
  return { onClose, area };
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
});

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
  vi.mocked(updateText).mockClear();
  useProjectStore.setState({ project: null });
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
});

describe('InlineTextEditor', () => {
  it('abre com o texto atual, com foco e seleção total', () => {
    const { area } = setup();
    expect(area).toHaveValue('Oi');
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(0);
    expect(area.selectionEnd).toBe(2);
  });

  it('cada digitação chama updateText com o novo conteúdo', () => {
    const { area } = setup();
    fireEvent.change(area, { target: { value: 'Olá' } });
    expect(updateText).toHaveBeenCalledWith('t1', { content: 'Olá' });
  });

  it('Esc fecha o editor', () => {
    const { area, onClose } = setup();
    fireEvent.keyDown(area, { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Ctrl+Enter fecha e Enter comum não fecha', () => {
    const { area, onClose } = setup();
    fireEvent.keyDown(area, { key: 'Enter' });
    expect(onClose).not.toHaveBeenCalled();
    fireEvent.keyDown(area, { key: 'Enter', ctrlKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('Cmd+Enter também fecha', () => {
    const { area, onClose } = setup();
    fireEvent.keyDown(area, { key: 'Enter', metaKey: true });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('teclas digitadas não chegam aos atalhos globais', () => {
    const { area } = setup();
    const globalListener = vi.fn();
    window.addEventListener('keydown', globalListener);
    try {
      fireEvent.keyDown(area, { key: 'Delete' });
      expect(globalListener).not.toHaveBeenCalled();
    } finally {
      window.removeEventListener('keydown', globalListener);
    }
  });

  it('clique fora da caixa fecha o editor', () => {
    const { onClose } = setup();
    fireEvent.pointerDown(document.body, { clientX: 5, clientY: 5 });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('clique dentro da caixa não fecha o editor', () => {
    const { area, onClose } = setup();
    fireEvent.pointerDown(area, { clientX: 5, clientY: 5 });
    expect(onClose).not.toHaveBeenCalled();
  });
});
