// Testes de teclado: mover clipe com Alt+setas, selecionar com Enter/Espaço, separador com setas e abas com setas.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ResizeHandle } from '@/components/ResizeHandle';
import { handleTablistKeyDown } from '@/components/tabKeys';
import { TrackRow } from '@/features/timeline/TrackRow';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { moveSelected, selectClip } from '@/stores/timelineCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Track } from '@/types';

vi.mock('@/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(() => Promise.resolve('blob:teste')),
  revokeObjectUrl: vi.fn(),
}));

vi.mock('@/stores/timelineCommands', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/stores/timelineCommands')>();
  return { ...original, selectClip: vi.fn(), moveSelected: vi.fn() };
});

/** Clipe de texto de 1 s na trilha t1. */
function makeClip(id: string): Clip {
  return {
    id,
    assetId: undefined,
    trackId: 't1',
    startMs: 1000,
    durationMs: 1000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
    text: { content: 'Olá', style: defaultTextStyle() },
  };
}

/** Trilha de texto com os clipes dados. */
function makeTrack(clips: Clip[], locked = false): Track {
  return { id: 't1', kind: 'text', name: 'Texto 1', clips, muted: false, locked, hidden: false };
}

describe('clipe na linha do tempo (teclado)', () => {
  beforeEach(() => {
    useTimelineStore.setState(useTimelineStore.getInitialState());
    vi.mocked(selectClip).mockClear();
    vi.mocked(moveSelected).mockClear();
  });
  afterEach(cleanup);

  it('é focável por Tab e tem nome acessível', () => {
    render(<TrackRow track={makeTrack([makeClip('a')])} trackIndex={0} zoom={100} />);
    const clip = screen.getByRole('group', { name: 'Olá' });
    expect(clip).toHaveAttribute('tabindex', '0');
  });

  it('Enter e Espaço selecionam o clipe', () => {
    render(<TrackRow track={makeTrack([makeClip('a')])} trackIndex={0} zoom={100} />);
    const clip = screen.getByRole('group', { name: 'Olá' });
    fireEvent.keyDown(clip, { key: 'Enter' });
    fireEvent.keyDown(clip, { key: ' ' });
    expect(selectClip).toHaveBeenCalledTimes(2);
    expect(selectClip).toHaveBeenCalledWith('a', false);
  });

  it('Alt+seta move 1 quadro (30 fps por padrão) e Alt+Shift+seta move 1 s, um comando cada', () => {
    render(<TrackRow track={makeTrack([makeClip('a')])} trackIndex={0} zoom={100} />);
    const clip = screen.getByRole('group', { name: 'Olá' });
    fireEvent.keyDown(clip, { key: 'ArrowRight', altKey: true });
    expect(moveSelected).toHaveBeenLastCalledWith(1000 / 30, 0, 'overwrite');
    fireEvent.keyDown(clip, { key: 'ArrowLeft', altKey: true });
    expect(moveSelected).toHaveBeenLastCalledWith(-1000 / 30, 0, 'overwrite');
    fireEvent.keyDown(clip, { key: 'ArrowRight', altKey: true, shiftKey: true });
    expect(moveSelected).toHaveBeenLastCalledWith(1000, 0, 'overwrite');
    expect(moveSelected).toHaveBeenCalledTimes(3);
  });

  it('seta sem Alt não move o clipe', () => {
    render(<TrackRow track={makeTrack([makeClip('a')])} trackIndex={0} zoom={100} />);
    fireEvent.keyDown(screen.getByRole('group', { name: 'Olá' }), { key: 'ArrowRight' });
    expect(moveSelected).not.toHaveBeenCalled();
  });

  it('trilha travada não responde ao teclado e sai da ordem de Tab', () => {
    render(<TrackRow track={makeTrack([makeClip('a')], true)} trackIndex={0} zoom={100} />);
    const clip = screen.getByRole('group', { name: 'Olá' });
    expect(clip).toHaveAttribute('tabindex', '-1');
    fireEvent.keyDown(clip, { key: 'ArrowRight', altKey: true });
    expect(moveSelected).not.toHaveBeenCalled();
  });
});

describe('separador de painéis', () => {
  afterEach(cleanup);

  it('expõe role separator com orientação e valores e move com as setas', () => {
    const onResize = vi.fn();
    render(<ResizeHandle orientation="vertical" label="Largura" value={300} min={200} max={600} onResize={onResize} />);
    const sep = screen.getByRole('separator', { name: 'Largura' });
    expect(sep).toHaveAttribute('aria-orientation', 'vertical');
    expect(sep).toHaveAttribute('aria-valuenow', '300');
    expect(sep).toHaveAttribute('aria-valuemin', '200');
    expect(sep).toHaveAttribute('aria-valuemax', '600');
    fireEvent.keyDown(sep, { key: 'ArrowRight' });
    fireEvent.keyDown(sep, { key: 'ArrowLeft', shiftKey: true });
    expect(onResize).toHaveBeenNthCalledWith(1, 10);
    expect(onResize).toHaveBeenNthCalledWith(2, -50);
  });

  it('separador horizontal usa setas para cima e para baixo', () => {
    const onResize = vi.fn();
    render(<ResizeHandle orientation="horizontal" label="Altura" onResize={onResize} />);
    const sep = screen.getByRole('separator', { name: 'Altura' });
    fireEvent.keyDown(sep, { key: 'ArrowDown' });
    fireEvent.keyDown(sep, { key: 'ArrowUp' });
    expect(onResize).toHaveBeenNthCalledWith(1, 10);
    expect(onResize).toHaveBeenNthCalledWith(2, -10);
  });
});

describe('abas com setas', () => {
  afterEach(cleanup);

  it('seta e Home/End movem o foco e ativam a aba', () => {
    const picked: string[] = [];
    render(
      <div role="tablist">
        {['a', 'b', 'c'].map((id) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={id === 'a'}
            tabIndex={id === 'a' ? 0 : -1}
            onKeyDown={handleTablistKeyDown}
            onClick={() => picked.push(id)}
          >
            {id}
          </button>
        ))}
      </div>,
    );
    const [a, b, c] = screen.getAllByRole('tab');
    if (a === undefined || b === undefined || c === undefined) throw new Error('abas ausentes');
    fireEvent.keyDown(a, { key: 'ArrowRight' });
    expect(b).toHaveFocus();
    fireEvent.keyDown(b, { key: 'End' });
    expect(c).toHaveFocus();
    fireEvent.keyDown(c, { key: 'ArrowRight' });
    expect(a).toHaveFocus();
    fireEvent.keyDown(a, { key: 'ArrowLeft' });
    expect(c).toHaveFocus();
    expect(picked).toEqual(['b', 'c', 'a', 'c']);
  });
});
