// Testes da faixa de trilha: posição e largura dos clipes pelo zoom, e seleção ao clicar.
import { cleanup, createEvent, fireEvent, render } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TrackRow } from '@/features/timeline/TrackRow';
import { ASSET_DRAG_MIME } from '@/features/timeline/layout';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { useTimelineStore } from '@/stores/timelineStore';
import { addAssetToTimeline, selectClip } from '@/stores/timelineCommands';
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
});
