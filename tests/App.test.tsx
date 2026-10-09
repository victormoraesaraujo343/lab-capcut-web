import { createElement } from 'react';
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import App from '../src/App';
import { t } from '../src/i18n/pt-BR';
import { useUiStore } from '../src/stores';

describe('App', () => {
  afterEach(() => {
    cleanup();
  });

  beforeEach(() => {
    useUiStore.setState({ theme: 'dark' });
    document.documentElement.dataset.theme = 'dark';
  });

  it('mostra os quatro painéis', () => {
    render(createElement(App));
    expect(screen.getByRole('heading', { name: t.panels.media })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.panels.preview })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.panels.inspector })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: t.panels.timeline })).toBeInTheDocument();
  });

  it('alterna o tema ao clicar no botão de tema', () => {
    render(createElement(App));
    fireEvent.click(screen.getByRole('button', { name: t.app.toggleTheme }));
    expect(document.documentElement.dataset.theme).toBe('light');
  });
});
