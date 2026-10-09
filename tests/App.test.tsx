import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import App from '../src/App';
import { t } from '../src/i18n/pt-BR';
import { createProject } from '../src/engine/project/createProject';
import { useProjectStore, useUiStore } from '../src/stores';

vi.mock('../src/engine/storage/opfs', () => ({
  getObjectUrl: vi.fn(() => Promise.resolve('blob:test')),
}));

vi.mock('@/features/media/MediaPanel', async () => {
  const React = await import('react');
  return {
    MediaPanel: () => React.createElement('section', null, 'Mídia'),
  };
});

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useUiStore.setState({ theme: 'dark' });
    document.documentElement.dataset.theme = 'dark';
    useProjectStore.setState({
      project: null,
      projects: [],
      projectsLoaded: true,
      loadProjects: vi.fn(() => Promise.resolve()),
    });
  });

  it('sem projeto aberto mostra a tela inicial', () => {
    render(createElement(App));
    expect(screen.getByRole('heading', { name: t.home.title })).toBeInTheDocument();
    expect(screen.queryByText('Mídia')).not.toBeInTheDocument();
  });

  it('carrega os projetos ao montar', () => {
    const loadProjects = vi.fn(() => Promise.resolve());
    useProjectStore.setState({ loadProjects });
    render(createElement(App));
    expect(loadProjects).toHaveBeenCalledTimes(1);
  });

  it('com projeto aberto mostra os quatro painéis', () => {
    useProjectStore.setState({ project: createProject('Teste') });
    render(createElement(App));
    expect(screen.getByText('Mídia')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.panels.preview })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.panels.inspector })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.panels.timeline })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: t.home.title })).not.toBeInTheDocument();
  });

  it('alterna o tema ao clicar no botão de tema', () => {
    render(createElement(App));
    fireEvent.click(screen.getByRole('button', { name: t.app.toggleTheme }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
