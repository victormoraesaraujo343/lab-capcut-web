import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MediaPanel } from '@/features/media/MediaPanel';
import { t } from '@/i18n/pt-BR';
import { useProjectStore, type ProjectState } from '@/stores';
import type { Asset, Folder, Project } from '@/types/project';

vi.mock('@/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(() => Promise.resolve('blob:mock')),
}));

const initialState = useProjectStore.getState();

function makeAsset(overrides: Partial<Asset> & Pick<Asset, 'id' | 'name'>): Asset {
  return {
    kind: 'video',
    mimeType: 'video/mp4',
    opfsPath: `media/${overrides.id}`,
    sizeBytes: 2048,
    durationMs: 65000,
    thumbnails: [],
    createdAt: 1,
    ...overrides,
  };
}

function makeProject(assets: Asset[], folders: Folder[] = []): Project {
  return {
    id: 'p1',
    name: 'Projeto de teste',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks: [],
    assets,
    folders,
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

const assets: Asset[] = [
  makeAsset({ id: 'a1', name: 'praia.mp4', createdAt: 10, thumbnails: ['thumbs/a1.jpg'] }),
  makeAsset({ id: 'a2', name: 'entrevista.mov', createdAt: 20 }),
];

/** Prepara o store com um projeto e ações mockadas. */
function setupStore(overrides: Partial<ProjectState> = {}) {
  const importFiles = vi.fn<(files: File[]) => Promise<void>>(() => Promise.resolve());
  const dismissImportError = vi.fn<(id: string) => void>((id) =>
    useProjectStore.setState((state) => ({ importErrors: state.importErrors.filter((error) => error.id !== id) })),
  );
  const createFolder = vi.fn<(name: string) => string>(() => 'f-new');
  const moveAssetToFolder = vi.fn<(assetId: string, folderId: string | undefined) => void>();
  useProjectStore.setState({
    project: makeProject(assets),
    importProgress: null,
    importErrors: [],
    importFiles,
    removeAsset: vi.fn<(assetId: string) => Promise<void>>(() => Promise.resolve()),
    dismissImportError,
    createFolder,
    renameFolder: vi.fn<(id: string, name: string) => void>(),
    deleteFolder: vi.fn<(id: string) => void>(),
    moveAssetToFolder,
    ...overrides,
  });
  return { importFiles, dismissImportError, createFolder, moveAssetToFolder };
}

describe('MediaPanel', () => {
  beforeEach(() => {
    setupStore();
  });

  afterEach(() => {
    cleanup();
    useProjectStore.setState(initialState, true);
  });

  it('mostra os cards com os nomes dos assets', async () => {
    render(<MediaPanel />);
    expect(screen.getByText('praia.mp4')).toBeInTheDocument();
    expect(screen.getByText('entrevista.mov')).toBeInTheDocument();
    expect(screen.getAllByText('1:05')).toHaveLength(2);
    await waitFor(() => expect(document.querySelector('img')).not.toBeNull());
  });

  it('filtra os cards pela busca', () => {
    render(<MediaPanel />);
    fireEvent.change(screen.getByRole('searchbox', { name: t.media.search }), { target: { value: 'Entre' } });
    expect(screen.queryByText('praia.mp4')).toBeNull();
    expect(screen.getByText('entrevista.mov')).toBeInTheDocument();
  });

  it('mostra a mensagem de busca sem resultado', () => {
    render(<MediaPanel />);
    fireEvent.change(screen.getByRole('searchbox', { name: t.media.search }), { target: { value: 'zzz' } });
    expect(screen.getByText(t.media.noResults)).toBeInTheDocument();
  });

  it('chama importFiles ao escolher arquivos no seletor', () => {
    const { importFiles } = setupStore();
    const { container } = render(<MediaPanel />);
    fireEvent.click(screen.getByRole('button', { name: t.media.import }));
    const input = container.querySelector('input[type="file"]');
    expect(input).not.toBeNull();
    const file = new File(['conteudo'], 'nova.mp4', { type: 'video/mp4' });
    fireEvent.change(input as HTMLInputElement, { target: { files: [file] } });
    expect(importFiles).toHaveBeenCalledWith([file], undefined);
  });

  it('mostra o progresso da importação', () => {
    setupStore({ importProgress: { total: 3, done: 1, currentName: 'clipe.mp4' } });
    render(<MediaPanel />);
    const status = screen.getByRole('status');
    expect(status).toHaveTextContent('1/3');
    expect(status).toHaveTextContent('clipe.mp4');
  });

  it('mostra o erro de importação e fecha ao clicar no botão', () => {
    const { dismissImportError } = setupStore({
      importErrors: [{ id: 'e1', fileName: 'ruim.mp4', code: 'notFound' }],
    });
    render(<MediaPanel />);
    expect(screen.getByRole('alert')).toHaveTextContent('ruim.mp4');
    expect(screen.getByText(t.errors.notFound)).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: t.errors.dismiss }));
    expect(dismissImportError).toHaveBeenCalledWith('e1');
    expect(screen.queryByRole('alert')).toBeNull();
  });

  it('cria uma pasta pelo input inline com Enter', () => {
    const { createFolder } = setupStore();
    render(<MediaPanel />);
    fireEvent.click(screen.getByRole('button', { name: t.media.newFolder }));
    const input = screen.getByRole('textbox', { name: t.media.folderName });
    fireEvent.change(input, { target: { value: 'Trilha' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(createFolder).toHaveBeenCalledWith('Trilha');
  });

  it('não mostra a grade sem projeto aberto', () => {
    setupStore({ project: null });
    render(<MediaPanel />);
    expect(screen.queryByText('praia.mp4')).toBeNull();
    expect(screen.getByRole('button', { name: t.media.import })).toBeDisabled();
  });
});
