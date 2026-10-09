// Testes da faixa de trilha: posição e largura dos clipes pelo zoom, e seleção ao clicar.
import { cleanup, createEvent, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackRow } from '@/features/timeline/TrackRow';
import { ASSET_DRAG_MIME } from '@/features/timeline/layout';
import { TRANSITION_DRAG_MIME } from '@/features/library/transitionDrag';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { useTimelineStore } from '@/stores/timelineStore';
import { addAssetToTimeline, selectClip } from '@/stores/timelineCommands';
import { removeTransition, setTransition } from '@/stores/transitionCommands';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Track } from '@/types';

vi.mock('@/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(() => Promise.resolve('blob:teste')),
  revokeObjectUrl: vi.fn(),
}));

vi.mock('@/stores/timelineCommands', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/stores/timelineCommands')>();
  return {
    ...original,
    selectClip: vi.fn(),
    moveSelected: vi.fn(),
    splitClipAtTime: vi.fn(),
    trimClip: vi.fn(),
    addAssetToTimeline: vi.fn(),
  };
});

vi.mock('@/stores/transitionCommands', () => ({
  setTransition: vi.fn(),
  removeTransition: vi.fn(),
}));

/** Cria um clipe de teste na trilha dada. */
function makeClip(id: string, startMs: number, durationMs: number): Clip {
  return {
    id,
    assetId: undefined,
    trackId: 't1',
    startMs,
    durationMs,
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
  };
}

/** Cria uma trilha de teste com os clipes dados. */
function makeTrack(clips: Clip[], overrides: Partial<Track> = {}): Track {
  return { id: 't1', kind: 'text', name: 'Texto 1', clips, muted: false, locked: false, hidden: false, ...overrides };
}

/** Evento de arrasto com a posição X do ponteiro (o jsdom não aplica clientX em eventos de arrasto). */
function dragAt(type: 'dragOver' | 'drop', clientX: number, dataTransfer: Record<string, unknown>): Event {
  const event = createEvent[type](document.body, { dataTransfer });
  Object.defineProperty(event, 'clientX', { value: clientX });
  return event;
}

describe('TrackRow', () => {
  beforeEach(() => {
    useTimelineStore.setState(useTimelineStore.getInitialState());
    vi.mocked(selectClip).mockClear();
  });

  afterEach(() => {
    cleanup();
  });

  it('posiciona e dimensiona os clipes em px pelo zoom', () => {
    const track = makeTrack([makeClip('a', 0, 1000), makeClip('b', 2000, 500)]);
    const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    const first = container.querySelector<HTMLElement>('[data-clip-id="a"]');
    const second = container.querySelector<HTMLElement>('[data-clip-id="b"]');
    expect(first?.style.left).toBe('0px');
    expect(first?.style.width).toBe('100px');
    expect(second?.style.left).toBe('200px');
    expect(second?.style.width).toBe('50px');
  });

  it('muda a posição quando o zoom muda', () => {
    const track = makeTrack([makeClip('a', 1000, 1000)]);
    const { container, rerender } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    rerender(<TrackRow track={track} trackIndex={0} zoom={200} />);
    const clip = container.querySelector<HTMLElement>('[data-clip-id="a"]');
    expect(clip?.style.left).toBe('200px');
    expect(clip?.style.width).toBe('200px');
  });

  it('seleciona o clipe ao clicar, sem modificador', () => {
    const track = makeTrack([makeClip('a', 0, 1000)]);
    const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    const clip = container.querySelector<HTMLElement>('[data-clip-id="a"]');
    if (clip === null) throw new Error('clipe não renderizado');
    fireEvent.pointerDown(clip, { button: 0, clientX: 10, clientY: 10 });
    expect(selectClip).toHaveBeenCalledWith('a', false);
  });

  it('seleção com Ctrl é aditiva', () => {
    const track = makeTrack([makeClip('a', 0, 1000)]);
    const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    const clip = container.querySelector<HTMLElement>('[data-clip-id="a"]');
    if (clip === null) throw new Error('clipe não renderizado');
    fireEvent.pointerDown(clip, { button: 0, clientX: 10, clientY: 10, ctrlKey: true });
    expect(selectClip).toHaveBeenCalledWith('a', true);
  });

  it('Ctrl+clique num clipe já selecionado o tira da seleção, sem chamar selectClip', () => {
    useTimelineStore.setState({ selectedClipIds: ['a'] });
    const track = makeTrack([makeClip('a', 0, 1000)]);
    const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    const clip = container.querySelector<HTMLElement>('[data-clip-id="a"]');
    if (clip === null) throw new Error('clipe não renderizado');
    fireEvent.pointerDown(clip, { button: 0, clientX: 10, clientY: 10, ctrlKey: true });
    expect(useTimelineStore.getState().selectedClipIds).toEqual([]);
    expect(selectClip).not.toHaveBeenCalled();
  });

  it('soltar mídia com Alt insere empurrando', () => {
    const track = makeTrack([]);
    const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    const row = container.querySelector<HTMLElement>('[data-track-id="t1"]');
    if (row === null) throw new Error('trilha não renderizada');
    const drop = createEvent.drop(row, {
      dataTransfer: { types: [ASSET_DRAG_MIME], getData: () => 'asset1' },
    });
    Object.defineProperty(drop, 'altKey', { value: true });
    fireEvent(row, drop);
    expect(addAssetToTimeline).toHaveBeenCalledWith('asset1', 't1', expect.any(Number), 'insert');
  });

  it('soltar mídia sem Alt sobrescreve', () => {
    const track = makeTrack([]);
    const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    const row = container.querySelector<HTMLElement>('[data-track-id="t1"]');
    if (row === null) throw new Error('trilha não renderizada');
    fireEvent.drop(row, { dataTransfer: { types: [ASSET_DRAG_MIME], getData: () => 'asset1' } });
    expect(addAssetToTimeline).toHaveBeenCalledWith('asset1', 't1', expect.any(Number), 'overwrite');
  });

  it('clipe de texto mostra a primeira linha do conteúdo, com ícone e cor de texto', () => {
    const text = { ...makeClip('a', 0, 1000), text: { content: 'Olá mundo\nsegunda linha', style: defaultTextStyle() } };
    const track = makeTrack([text], { name: 'Legendas' });
    const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    const clip = container.querySelector<HTMLElement>('[data-clip-id="a"]');
    expect(clip?.textContent).toContain('Olá mundo…');
    expect(clip?.textContent).not.toContain('Clipe');
    expect(clip?.className).toContain('kindText');
    expect(clip?.querySelector('svg')).not.toBeNull();
  });

  it('trilha travada marca a linha e não seleciona clipes', () => {
    const track = makeTrack([makeClip('a', 0, 1000)], { locked: true });
    const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
    const row = container.querySelector<HTMLElement>('[data-track-id="t1"]');
    const clip = container.querySelector<HTMLElement>('[data-clip-id="a"]');
    if (clip === null) throw new Error('clipe não renderizado');
    expect(row?.dataset.locked).toBe('true');
    fireEvent.pointerDown(clip, { button: 0, clientX: 10, clientY: 10 });
    expect(selectClip).not.toHaveBeenCalled();
  });

  describe('transições no corte', () => {
    /** Trilha de vídeo com dois clipes encostados em 1000 ms; o primeiro pode ter transição de saída. */
    function videoTrack(transitionOut?: Clip['transitionOut'], locked = false): Track {
      const first = { ...makeClip('a', 0, 1000), ...(transitionOut ? { transitionOut } : {}) };
      return makeTrack([first, makeClip('b', 1000, 1000)], { kind: 'video', locked });
    }

    beforeEach(() => {
      vi.mocked(setTransition).mockClear();
      vi.mocked(removeTransition).mockClear();
    });

    it('mostra o bloco da transição sobre o corte, com a largura da janela', () => {
      const track = videoTrack({ type: 'dissolve', durationMs: 500, params: {} });
      const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
      const marker = container.querySelector<HTMLElement>('[data-transition-clip="a"]');
      expect(marker?.style.left).toBe('75px');
      expect(marker?.style.width).toBe('50px');
    });

    it('clicar no bloco seleciona o clipe que sai', () => {
      const track = videoTrack({ type: 'dissolve', durationMs: 500, params: {} });
      const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
      const marker = container.querySelector<HTMLElement>('[data-transition-clip="a"]');
      if (marker === null) throw new Error('marcador não renderizado');
      fireEvent.click(marker);
      expect(selectClip).toHaveBeenCalledWith('a', false);
    });

    it('o botão × remove a transição do clipe que sai', () => {
      const track = videoTrack({ type: 'dissolve', durationMs: 500, params: {} });
      const { container } = render(<TrackRow track={track} trackIndex={0} zoom={100} />);
      const remove = container.querySelector<HTMLButtonElement>('[data-transition-clip="a"] button');
      if (remove === null) throw new Error('botão de remover não renderizado');
      fireEvent.click(remove);
      expect(removeTransition).toHaveBeenCalledWith('a');
      expect(selectClip).not.toHaveBeenCalled();
    });

    it('sem transição e sem arrasto não aparece alvo no corte', () => {
      const { container } = render(<TrackRow track={videoTrack()} trackIndex={0} zoom={100} />);
      expect(container.querySelector('[class*="target"]')).toBeNull();
    });

    it('durante um arrasto de transição aparece um alvo no corte', () => {
      const { container } = render(<TrackRow track={videoTrack()} trackIndex={0} zoom={100} />);
      fireEvent(window, Object.assign(new Event('dragstart'), { dataTransfer: { types: [TRANSITION_DRAG_MIME] } }));
      expect(container.querySelectorAll('[class*="target"]').length).toBe(1);
      fireEvent(window, new Event('dragend'));
      expect(container.querySelector('[class*="target"]')).toBeNull();
    });

    it('arrastar a transição até perto do corte destaca o alvo', () => {
      const { container } = render(<TrackRow track={videoTrack()} trackIndex={0} zoom={100} />);
      fireEvent(window, Object.assign(new Event('dragstart'), { dataTransfer: { types: [TRANSITION_DRAG_MIME] } }));
      const row = container.querySelector<HTMLElement>('[data-track-id="t1"]');
      if (row === null) throw new Error('trilha não renderizada');
      fireEvent(row, dragAt('dragOver', 110, { types: [TRANSITION_DRAG_MIME] }));
      expect(container.querySelector('[class*="targetHover"]')).not.toBeNull();
    });

    it('soltar a transição perto do corte põe a transição no clipe que sai', () => {
      const { container } = render(<TrackRow track={videoTrack()} trackIndex={0} zoom={100} />);
      const row = container.querySelector<HTMLElement>('[data-track-id="t1"]');
      if (row === null) throw new Error('trilha não renderizada');
      fireEvent(row, dragAt('drop', 103, { types: [TRANSITION_DRAG_MIME], getData: () => 'dissolve' }));
      expect(setTransition).toHaveBeenCalledWith('a', 'dissolve');
    });

    it('soltar longe de qualquer corte não põe transição', () => {
      const { container } = render(<TrackRow track={videoTrack()} trackIndex={0} zoom={100} />);
      const row = container.querySelector<HTMLElement>('[data-track-id="t1"]');
      if (row === null) throw new Error('trilha não renderizada');
      fireEvent(row, dragAt('drop', 300, { types: [TRANSITION_DRAG_MIME], getData: () => 'dissolve' }));
      expect(setTransition).not.toHaveBeenCalled();
    });

    it('trilha travada não aceita transição', () => {
      const { container } = render(<TrackRow track={videoTrack(undefined, true)} trackIndex={0} zoom={100} />);
      const row = container.querySelector<HTMLElement>('[data-track-id="t1"]');
      if (row === null) throw new Error('trilha não renderizada');
      fireEvent(row, dragAt('drop', 103, { types: [TRANSITION_DRAG_MIME], getData: () => 'dissolve' }));
      expect(setTransition).not.toHaveBeenCalled();
    });
  });
});
