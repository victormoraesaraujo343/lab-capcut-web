import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ProjectSummary } from '../src/engine/storage/db';
import { HomeScreen } from '../src/features/home/HomeScreen';
import { t } from '../src/i18n/pt-BR';
import { useProjectStore, useUiStore } from '../src/stores';

vi.mock('../src/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(() => Promise.resolve('blob:capa')),
}));

const samples: ProjectSummary[] = [
  { id: 'p1', name: 'Viagem', createdAt: 1, updatedAt: Date.now(), durationMs: 65000, assetCount: 3 },
  { id: 'p2', name: 'Festa', createdAt: 1, updatedAt: Date.now(), durationMs: 0, assetCount: 1 },
];

describe('HomeScreen', () => {
  let createNewProject: ReturnType<typeof vi.fn<() => Promise<void>>>;
  let renameProjectById: ReturnType<typeof vi.fn<(id: string, name: string) => Promise<void>>>;
  let deleteProjectById: ReturnType<typeof vi.fn<(id: string) => Promise<void>>>;

  beforeEach(() => {
    useUiStore.setState({ theme: 'dark' });
    createNewProject = vi.fn<() => Promise<void>>(() => Promise.resolve());
    renameProjectById = vi.fn<(id: string, name: string) => Promise<void>>(() => Promise.resolve());
    deleteProjectById = vi.fn<(id: string) => Promise<void>>(() => Promise.resolve());
    useProjectStore.setState({
      project: null,
      projects: samples,
      projectsLoaded: true,
      createNewProject,
      openProject: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
      renameProjectById,
      duplicateProjectById: vi.fn<(id: string) => Promise<void>>(() => Promise.resolve()),
      deleteProjectById,
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it('lista os projetos do estado', () => {
    render(createElement(HomeScreen));
    expect(screen.getByText('Viagem')).toBeInTheDocument();
    expect(screen.getByText('Festa')).toBeInTheDocument();
    expect(screen.getByText(/3 mídias/)).toBeInTheDocument();
  });

  it('mostra o carregamento enquanto os projetos não chegaram', () => {
    useProjectStore.setState({ projectsLoaded: false, projects: [] });
    render(createElement(HomeScreen));
    expect(screen.getByText(t.home.loading)).toBeInTheDocument();
  });

  it('clique em "Novo projeto" chama createNewProject', () => {
    render(createElement(HomeScreen));
    fireEvent.click(screen.getByRole('button', { name: t.home.newProject }));
    expect(createNewProject).toHaveBeenCalledTimes(1);
  });

  it('renomear pelo menu chama renameProjectById', () => {
    render(createElement(HomeScreen));
    fireEvent.click(screen.getAllByRole('button', { name: t.home.moreActions })[0]!);
    fireEvent.click(screen.getByRole('menuitem', { name: t.home.rename }));
    const input = screen.getByRole('textbox', { name: t.home.rename });
    fireEvent.change(input, { target: { value: 'Novo nome' } });
    fireEvent.keyDown(input, { key: 'Enter' });
    expect(renameProjectById).toHaveBeenCalledWith('p1', 'Novo nome');
  });

  it('excluir com confirmação chama deleteProjectById', () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true);
    render(createElement(HomeScreen));
    fireEvent.click(screen.getAllByRole('button', { name: t.home.moreActions })[1]!);
    fireEvent.click(screen.getByRole('menuitem', { name: t.home.delete }));
    expect(confirm).toHaveBeenCalledWith(t.home.confirmDelete);
    expect(deleteProjectById).toHaveBeenCalledWith('p2');
  });

  it('excluir sem confirmação não apaga nada', () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    render(createElement(HomeScreen));
    fireEvent.click(screen.getAllByRole('button', { name: t.home.moreActions })[1]!);
    fireEvent.click(screen.getByRole('menuitem', { name: t.home.delete }));
    expect(deleteProjectById).not.toHaveBeenCalled();
  });
});
