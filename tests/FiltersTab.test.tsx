// Testes da aba Filtros: clique põe o predefinido no clipe, troca o predefinido anterior, sem seleção desabilita e busca filtra.
import { act, cleanup, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FiltersTab } from '@/features/library/FiltersTab';
import { FILTER_PRESETS } from '@/engine/render/filters/filterPresets';
import { t } from '@/i18n/pt-BR';
import { addFilter, removeEffect } from '@/stores/effectCommands';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Clip, type EffectInstance, type Project } from '@/types';

vi.mock('@/stores/effectCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/effectCommands')>();
  return { ...actual, addFilter: vi.fn(), removeEffect: vi.fn() };
});

const initialProjectState = useProjectStore.getState();

/** Clipe de teste com os filtros dados. */
function makeClip(filters: EffectInstance[]): Clip {
  return {
    id: 'c1',
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
    filters,
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
  };
}

/** Projeto com uma trilha de vídeo que contém o clipe c1 com os filtros dados. */
function makeProject(filters: EffectInstance[]): Project {
  return {
    id: 'p1',
    name: 'Projeto de teste',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 3000,
    tracks: [{ id: 't1', kind: 'video', name: 'Vídeo', clips: [makeClip(filters)], muted: false, locked: false, hidden: false }],
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

describe('FiltersTab', () => {
  beforeEach(() => {
    useProjectStore.setState({ ...initialProjectState, project: makeProject([]) });
    useTimelineStore.setState({ selectedClipIds: ['c1'] });
  });

  afterEach(() => {
    cleanup();
    useProjectStore.setState(initialProjectState);
    useTimelineStore.setState({ selectedClipIds: [] });
    vi.clearAllMocks();
  });

  it('mostra os 25 filtros prontos', () => {
    render(<FiltersTab />);

    const grid = screen.getByRole('group', { name: t.library.tabs.filters });
    expect(within(grid).getAllByRole('button')).toHaveLength(FILTER_PRESETS.length);
    expect(FILTER_PRESETS).toHaveLength(25);
  });

  it('clicar num filtro põe o predefinido no clipe selecionado', () => {
    render(<FiltersTab />);

    fireEvent.click(card(t.filters.names.sharp));

    expect(addFilter).toHaveBeenCalledTimes(1);
    expect(addFilter).toHaveBeenCalledWith('c1', expect.objectContaining({ type: 'colorAdjust' }));
    expect(removeEffect).not.toHaveBeenCalled();
  });

  it('um segundo predefinido substitui o primeiro no mesmo clipe', () => {
    render(<FiltersTab />);
    fireEvent.click(card(t.filters.names.sharp));
    const firstInstance = vi.mocked(addFilter).mock.calls[0]?.[1];
    expect(firstInstance).toBeDefined();
    if (firstInstance === undefined) return;
    act(() => {
      useProjectStore.setState({ project: makeProject([firstInstance]) });
    });

    fireEvent.click(card(t.filters.names.vivid));

    expect(removeEffect).toHaveBeenCalledWith('c1', firstInstance.id);
    expect(addFilter).toHaveBeenCalledTimes(2);
  });

  it('sem clipe visual selecionado, os cartões ficam desabilitados e o clique não aplica', () => {
    useTimelineStore.setState({ selectedClipIds: [] });
    render(<FiltersTab />);

    expect(card(t.filters.names.sharp)).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByText(t.library.selectClipFirst)).toBeInTheDocument();
    fireEvent.click(card(t.filters.names.sharp));
    expect(addFilter).not.toHaveBeenCalled();
  });

  it('a busca filtra os filtros pelo nome', () => {
    render(<FiltersTab />);

    fireEvent.change(screen.getByRole('searchbox', { name: t.library.searchItems }), { target: { value: 'noi' } });

    expect(card(t.filters.names.noir)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.filters.names.sharp })).not.toBeInTheDocument();
  });
});
