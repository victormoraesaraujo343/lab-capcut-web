// Testes da aba Transições: clique põe no corte, sem vizinho desabilita com dica, aplicar em todos, arrasto e leitura do drop.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TransitionsTab } from '@/features/library/TransitionsTab';
import { getDraggedTransitionType, readTransitionDrop, TRANSITION_DRAG_MIME } from '@/features/library/transitionDrag';
import { t } from '@/i18n/pt-BR';
import { useProjectStore } from '@/stores/projectStore';
import { applyTransitionToAll, setTransition } from '@/stores/transitionCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project, type Track } from '@/types';

vi.mock('@/stores/transitionCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/transitionCommands')>();
  return { ...actual, setTransition: vi.fn(), applyTransitionToAll: vi.fn() };
});

const initialProjectState = useProjectStore.getState();

/** Clipe de teste com início e duração dados, na trilha t1. */
function makeClip(id: string, startMs: number, durationMs: number): Clip {
  return {
    id,
    assetId: 'a1',
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

/** Projeto com uma trilha de vídeo contendo os clipes dados. */
function makeProject(clips: Clip[]): Project {
  const track: Track = { id: 't1', kind: 'video', name: 'Vídeo', clips, muted: false, locked: false, hidden: false };
  return {
    id: 'p1',
    name: 'Projeto de teste',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 3000,
    tracks: [track],
    assets: [],
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Botão do cartão com o nome dado. */
function card(name: string): HTMLElement {
  return screen.getByRole('button', { name });
}

describe('TransitionsTab', () => {
  beforeEach(() => {
    // c1 termina em 2000 ms e c2 começa ali: há um vizinho encostado depois de c1.
    useProjectStore.setState({
      ...initialProjectState,
      project: makeProject([makeClip('c1', 1000, 1000), makeClip('c2', 2000, 1000)]),
    });
    useTimelineStore.setState({ selectedClipIds: ['c1'] });
  });

  afterEach(() => {
    cleanup();
    useProjectStore.setState(initialProjectState);
    useTimelineStore.setState({ selectedClipIds: [] });
    vi.clearAllMocks();
  });

  it('clicar numa transição põe no corte do clipe selecionado', () => {
    render(<TransitionsTab />);

    fireEvent.click(card(t.transitions.names.dissolve));

    expect(setTransition).toHaveBeenCalledWith('c1', 'dissolve');
  });

  it('sem vizinho encostado depois do clipe, os cartões ficam desabilitados com a dica', () => {
    useProjectStore.setState({ project: makeProject([makeClip('c1', 1000, 1000)]) });
    render(<TransitionsTab />);

    expect(card(t.transitions.names.dissolve)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(t.transitions.dropHint)).toBeInTheDocument();
    fireEvent.click(card(t.transitions.names.dissolve));
    expect(setTransition).not.toHaveBeenCalled();
  });

  it('sem clipe selecionado, os cartões ficam desabilitados', () => {
    useTimelineStore.setState({ selectedClipIds: [] });
    render(<TransitionsTab />);

    expect(card(t.transitions.names.dissolve)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(t.library.selectClipFirst)).toBeInTheDocument();
  });

  it('aplicar em todos usa a última transição escolhida', () => {
    render(<TransitionsTab />);
    fireEvent.click(card(t.transitions.names.blurCross));

    fireEvent.click(screen.getByRole('button', { name: t.transitions.applyAll }));

    expect(applyTransitionToAll).toHaveBeenCalledWith('blurCross');
  });

  it('aplicar em todos funciona mesmo sem clipe selecionado', () => {
    useTimelineStore.setState({ selectedClipIds: [] });
    render(<TransitionsTab />);

    fireEvent.click(screen.getByRole('button', { name: t.transitions.applyAll }));

    expect(applyTransitionToAll).toHaveBeenCalledWith('dissolve');
  });

  it('arrastar guarda o tipo até soltar e o MIME vai no dataTransfer', () => {
    render(<TransitionsTab />);
    const data = { effectAllowed: 'none', setData: vi.fn(), types: [], getData: vi.fn(() => '') };

    fireEvent.dragStart(card(t.transitions.names.dissolve), { dataTransfer: data });

    expect(getDraggedTransitionType()).toBe('dissolve');
    expect(data.setData).toHaveBeenCalledWith(TRANSITION_DRAG_MIME, 'dissolve');
    fireEvent.dragEnd(card(t.transitions.names.dissolve));
    expect(getDraggedTransitionType()).toBeNull();
  });

  it('readTransitionDrop devolve só transições conhecidas vindas do MIME próprio', () => {
    const drop = (type: string) =>
      ({ types: [TRANSITION_DRAG_MIME], getData: (mime: string) => (mime === TRANSITION_DRAG_MIME ? type : '') }) as unknown as DataTransfer;

    expect(readTransitionDrop(drop('slideLeft'))).toBe('slideLeft');
    expect(readTransitionDrop(drop('inexistente'))).toBeNull();
    expect(readTransitionDrop(null)).toBeNull();
    expect(readTransitionDrop({ types: ['text/plain'], getData: () => 'slideLeft' } as unknown as DataTransfer)).toBeNull();
  });
});
