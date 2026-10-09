// Testes da aba Efeitos: clique aplica no clipe visual selecionado, sem seleção desabilita, busca filtra e a aba aparece.
import { cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { EffectsTab } from '@/features/library/EffectsTab';
import { LibraryPanel } from '@/features/library/LibraryPanel';
import { t } from '@/i18n/pt-BR';
import { addEffect } from '@/stores/effectCommands';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type Project, type Track } from '@/types';

vi.mock('@/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(() => Promise.resolve('blob:mock')),
}));

vi.mock('@/stores/effectCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/effectCommands')>();
  return { ...actual, addEffect: vi.fn() };
});

const initialProjectState = useProjectStore.getState();

/** Clipe de teste começando em 1000 ms. */
function makeClip(id: string): Clip {
  return {
    id,
    assetId: 'a1',
    trackId: 't1',
    startMs: 1000,
    durationMs: 2000,
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

/** Projeto com uma trilha de vídeo que contém o clipe c1. */
function makeProject(kind: Track['kind'] = 'video'): Project {
  const track: Track = { id: 't1', kind, name: 'Vídeo', clips: [makeClip('c1')], muted: false, locked: false, hidden: false };
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

describe('EffectsTab', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useProjectStore.setState({ ...initialProjectState, project: makeProject() });
    useTimelineStore.setState({ selectedClipIds: ['c1'] });
  });

  afterEach(() => {
    cleanup();
    useProjectStore.setState(initialProjectState);
    useTimelineStore.setState({ selectedClipIds: [] });
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('a aba Efeitos aparece no painel e mostra a grade', () => {
    render(<LibraryPanel />);

    fireEvent.click(screen.getByRole('tab', { name: t.library.tabs.effects }));

    expect(screen.getByRole('tab', { name: t.library.tabs.effects })).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('group', { name: t.library.tabs.effects })).toBeInTheDocument();
  });

  it('clicar num efeito aplica no clipe selecionado', () => {
    render(<EffectsTab />);

    fireEvent.click(card(t.effects.blur));

    expect(addEffect).toHaveBeenCalledTimes(1);
    expect(addEffect).toHaveBeenCalledWith('c1', 'blur');
  });

  it('não lista Remover fundo, que fica só no inspetor', () => {
    render(<EffectsTab />);

    expect(screen.queryByRole('button', { name: t.effects.removeBackground })).not.toBeInTheDocument();
  });

  it('sem clipe visual selecionado, os cartões ficam desabilitados e o clique não aplica', () => {
    useTimelineStore.setState({ selectedClipIds: [] });
    render(<EffectsTab />);

    expect(card(t.effects.blur)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(t.library.selectClipFirst)).toBeInTheDocument();
    fireEvent.click(card(t.effects.blur));
    expect(addEffect).not.toHaveBeenCalled();
  });

  it('um clipe de áudio selecionado não conta como clipe visual', () => {
    useProjectStore.setState({ project: makeProject('audio') });
    render(<EffectsTab />);

    expect(card(t.effects.blur)).toHaveAttribute('aria-disabled', 'true');
  });

  it('a busca filtra os efeitos pelo nome, sem acento e sem caixa', () => {
    render(<EffectsTab />);

    fireEvent.change(screen.getByRole('searchbox', { name: t.library.searchItems }), { target: { value: 'DESFOQUE' } });

    const grid = screen.getByRole('group', { name: t.library.tabs.effects });
    expect(within(grid).getByRole('button', { name: t.effects.blur })).toBeInTheDocument();
    expect(within(grid).queryByRole('button', { name: t.effects.mirror })).not.toBeInTheDocument();
  });

  it('as setas do teclado movem o foco entre os cartões', () => {
    render(<EffectsTab />);
    const grid = screen.getByRole('group', { name: t.library.tabs.effects });
    const first = within(grid).getAllByRole('button')[0];
    const second = within(grid).getAllByRole('button')[1];
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    if (first === undefined || second === undefined) return;

    first.focus();
    fireEvent.keyDown(grid, { key: 'ArrowRight' });

    expect(second).toHaveFocus();
  });
});
