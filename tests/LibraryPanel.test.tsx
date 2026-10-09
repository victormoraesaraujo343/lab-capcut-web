import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LibraryPanel } from '@/features/library/LibraryPanel';
import { t } from '@/i18n/pt-BR';
import { TEXT_PRESETS } from '@/engine/text/textPresets';
import { addText } from '@/stores/textCommands';
import { useProjectStore } from '@/stores/projectStore';
import type { Project } from '@/types/project';

vi.mock('@/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(() => Promise.resolve('blob:mock')),
}));

vi.mock('@/stores/textCommands', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/stores/textCommands')>();
  return { ...actual, addText: vi.fn(() => 'clip-new') };
});

const STORAGE_KEY = 'capcut-web:library-tab';
const initialProjectState = useProjectStore.getState();

/** Projeto vazio para o painel ter onde trabalhar. */
function makeProject(): Project {
  return {
    id: 'p1',
    name: 'Projeto de teste',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks: [],
    assets: [],
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

/** Aba com o rótulo dado. */
function tab(label: string): HTMLElement {
  return screen.getByRole('tab', { name: label });
}

describe('LibraryPanel', () => {
  beforeEach(() => {
    window.localStorage.clear();
    useProjectStore.setState({ ...initialProjectState, project: makeProject() });
  });

  afterEach(() => {
    cleanup();
    useProjectStore.setState(initialProjectState);
    window.localStorage.clear();
    vi.clearAllMocks();
  });

  it('abre na aba Mídia por padrão e mostra a busca de mídia', () => {
    render(<LibraryPanel />);

    expect(tab(t.library.tabs.media)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByPlaceholderText(t.media.search)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.text.add })).not.toBeInTheDocument();
  });

  it('troca o conteúdo ao clicar em cada aba', () => {
    render(<LibraryPanel />);

    fireEvent.click(tab(t.library.tabs.text));
    expect(tab(t.library.tabs.text)).toHaveAttribute('aria-selected', 'true');
    expect(screen.getByRole('button', { name: t.text.add })).toBeInTheDocument();
    expect(screen.queryByPlaceholderText(t.media.search)).not.toBeInTheDocument();

    fireEvent.click(tab(t.library.tabs.captions));
    expect(screen.getByRole('button', { name: t.captions.generate })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.text.add })).not.toBeInTheDocument();
  });

  it('muda de aba com as setas do teclado', () => {
    render(<LibraryPanel />);

    fireEvent.keyDown(tab(t.library.tabs.media), { key: 'ArrowRight' });
    expect(tab(t.library.tabs.audio)).toHaveAttribute('aria-selected', 'true');
    expect(tab(t.library.tabs.audio)).toHaveFocus();

    fireEvent.keyDown(tab(t.library.tabs.audio), { key: 'ArrowLeft' });
    expect(tab(t.library.tabs.media)).toHaveAttribute('aria-selected', 'true');
  });

  it('lembra a aba ativa entre montagens', () => {
    const first = render(<LibraryPanel />);
    fireEvent.click(tab(t.library.tabs.captions));
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('captions');
    first.unmount();

    render(<LibraryPanel />);
    expect(tab(t.library.tabs.captions)).toHaveAttribute('aria-selected', 'true');
  });

  it('ignora uma aba guardada inválida', () => {
    window.localStorage.setItem(STORAGE_KEY, 'inexistente');
    render(<LibraryPanel />);

    expect(tab(t.library.tabs.media)).toHaveAttribute('aria-selected', 'true');
  });

  it('o botão Adicionar texto chama addText no cursor', () => {
    render(<LibraryPanel />);
    fireEvent.click(tab(t.library.tabs.text));

    fireEvent.click(screen.getByRole('button', { name: t.text.add }));

    expect(addText).toHaveBeenCalledTimes(1);
    expect(addText).toHaveBeenCalledWith();
  });

  it('mostra os estilos prontos e um clique adiciona texto com o estilo', () => {
    render(<LibraryPanel />);
    fireEvent.click(tab(t.library.tabs.text));
    const names: Partial<Record<string, string>> = t.library.presetNames;

    for (const preset of TEXT_PRESETS) {
      expect(screen.getByRole('button', { name: names[preset.id] ?? '' })).toBeInTheDocument();
    }

    const first = TEXT_PRESETS[0];
    expect(first).toBeDefined();
    if (first === undefined) return;
    fireEvent.click(screen.getByRole('button', { name: names[first.id] ?? '' }));
    expect(addText).toHaveBeenCalledWith({ presetId: first.id });
  });
});
