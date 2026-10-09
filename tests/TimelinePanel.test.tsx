import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { t } from '@/i18n/pt-BR';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { usePlaybackStore } from '@/stores/playbackStore';
import type { Project, Track } from '@/types';
import { TimelinePanel } from '@/features/timeline/TimelinePanel';
import { ASSET_DRAG_MIME } from '@/features/timeline/layout';
import { addAssetToNewTrack } from '@/stores/timelineCommands';

vi.mock('@/features/timeline/TrackRow', () => ({
  TrackRow: () => <div data-testid="track-row" />,
}));
vi.mock('@/features/timeline/TrackHeader', () => ({
  TrackHeader: () => <div data-testid="track-header" />,
}));
vi.mock('@/features/timeline/TimelineToolbar', () => ({
  TimelineToolbar: () => null,
}));
vi.mock('@/stores/timelineCommands', async (importOriginal) => {
  const original = await importOriginal<typeof import('@/stores/timelineCommands')>();
  return { ...original, addAssetToNewTrack: vi.fn() };
});

const initialProject = useProjectStore.getState().project;

/** Trilha vazia de vídeo com o id dado. */
function makeTrack(id: string): Track {
  return { id, kind: 'video', name: id, clips: [], muted: false, locked: false, hidden: false };
}

/** Projeto mínimo com as trilhas dadas. */
function makeProject(tracks: Track[]): Project {
  return {
    id: 'p1',
    name: 'Projeto de teste',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks,
    assets: [],
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

beforeEach(() => {
  vi.clearAllMocks();
  usePlaybackStore.setState({ currentTimeMs: 0, isPlaying: false });
});

afterEach(() => {
  cleanup();
  useProjectStore.setState({ project: initialProject });
  useTimelineStore.setState({ selectedClipIds: [], scrollLeft: 0, zoom: 100 });
});

describe('TimelinePanel', () => {
  it('renderiza um cabeçalho e uma faixa por trilha', () => {
    useProjectStore.setState({ project: makeProject([makeTrack('t1'), makeTrack('t2')]) });
    render(<TimelinePanel />);
    expect(screen.getAllByTestId('track-header')).toHaveLength(2);
    expect(screen.getAllByTestId('track-row')).toHaveLength(2);
  });

  it('mostra o texto de vazio quando não há clipes', () => {
    useProjectStore.setState({ project: makeProject([makeTrack('t1'), makeTrack('t2')]) });
    render(<TimelinePanel />);
    expect(screen.getByText(t.timeline.empty)).toBeInTheDocument();
  });

  it('soltar mídia abaixo da última trilha cria trilha nova', () => {
    useProjectStore.setState({ project: makeProject([makeTrack('t1')]) });
    const { container } = render(<TimelinePanel />);
    const tracks = container.querySelector<HTMLElement>('[data-timeline-tracks]');
    if (tracks === null) throw new Error('área de trilhas não renderizada');
    fireEvent.drop(tracks, {
      clientX: 120,
      clientY: 400,
      dataTransfer: { types: [ASSET_DRAG_MIME], getData: () => 'asset9' },
    });
    expect(addAssetToNewTrack).toHaveBeenCalledWith('asset9', expect.any(Number));
  });

  it('barra segurada não alterna play e pausa a cada repetição', () => {
    useProjectStore.setState({ project: { ...makeProject([makeTrack('t1')]), durationMs: 2000 } });
    render(<TimelinePanel />);
    fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
    expect(usePlaybackStore.getState().isPlaying).toBe(false);
    fireEvent.keyDown(window, { key: ' ', code: 'Space' });
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
    fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
    fireEvent.keyDown(window, { key: ' ', code: 'Space', repeat: true });
    expect(usePlaybackStore.getState().isPlaying).toBe(true);
  });

  it('mostra o texto de vazio sem projeto aberto', () => {
    useProjectStore.setState({ project: null });
    render(<TimelinePanel />);
    expect(screen.getByText(t.timeline.empty)).toBeInTheDocument();
    expect(screen.queryAllByTestId('track-row')).toHaveLength(0);
  });
});
