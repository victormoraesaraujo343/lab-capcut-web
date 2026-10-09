// Testes do painel de atalhos: troca de combinação, aviso de conflito, cancelamento, restauração e Esc.
import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShortcutsDialog } from '@/features/shortcuts/ShortcutsDialog';
import { useShortcutsStore } from '@/features/shortcuts/shortcutsStore';
import { t } from '@/i18n/pt-BR';

/** Nome acessível do botão Alterar de uma ação. */
function changeButton(action: string): HTMLElement {
  return screen.getByRole('button', { name: t.shortcuts.changeLabel.replace('{action}', action) });
}

beforeEach(() => {
  window.localStorage.clear();
  useShortcutsStore.setState({ overrides: {} });
});

afterEach(() => {
  cleanup();
  window.localStorage.clear();
});

describe('ShortcutsDialog', () => {
  it('abre como diálogo modal e lista as ações com as teclas', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    const dialog = screen.getByRole('dialog', { name: t.shortcuts.title });
    expect(dialog).toHaveAttribute('aria-modal', 'true');
    expect(screen.getByRole('heading', { name: t.shortcuts.groups.edicao })).toBeInTheDocument();
    expect(changeButton(t.shortcuts.actions.split)).toBeInTheDocument();
  });

  it('grava uma nova combinação digitada depois de Alterar', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    fireEvent.click(changeButton(t.shortcuts.actions.split));
    expect(screen.getByText(t.shortcuts.listening)).toBeInTheDocument();

    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'x' });

    expect(useShortcutsStore.getState().combosFor('split')).toEqual(['X']);
    expect(screen.queryByText(t.shortcuts.listening)).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: t.shortcuts.resetActionLabel.replace('{action}', t.shortcuts.actions.split) })).toBeInTheDocument();
  });

  it('mostra o conflito e não grava quando a combinação já é de outra ação', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    fireEvent.click(changeButton(t.shortcuts.actions.undo));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 's' });

    expect(screen.getByRole('alert')).toHaveTextContent(t.shortcuts.conflict.replace('{action}', t.shortcuts.actions.split));
    expect(useShortcutsStore.getState().overrides).toEqual({});
    expect(screen.getByText(t.shortcuts.listening)).toBeInTheDocument();
  });

  it('Esc cancela a troca sem fechar o painel', () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog onClose={onClose} />);
    fireEvent.click(changeButton(t.shortcuts.actions.undo));
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(screen.queryByText(t.shortcuts.listening)).not.toBeInTheDocument();
    expect(onClose).not.toHaveBeenCalled();
  });

  it('Esc fora da troca fecha o painel', () => {
    const onClose = vi.fn();
    render(<ShortcutsDialog onClose={onClose} />);
    fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Escape' });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('restaura o padrão de uma ação e de todas', () => {
    useShortcutsStore.getState().setCombo('split', 'X');
    useShortcutsStore.getState().setCombo('undo', 'U');
    render(<ShortcutsDialog onClose={vi.fn()} />);

    fireEvent.click(screen.getByRole('button', { name: t.shortcuts.resetActionLabel.replace('{action}', t.shortcuts.actions.split) }));
    expect(useShortcutsStore.getState().overrides).toEqual({ undo: ['U'] });

    fireEvent.click(screen.getByRole('button', { name: t.shortcuts.resetAll }));
    expect(useShortcutsStore.getState().overrides).toEqual({});
    expect(screen.getByRole('button', { name: t.shortcuts.resetAll })).toBeDisabled();
  });

  it('filtra as ações pela busca', () => {
    render(<ShortcutsDialog onClose={vi.fn()} />);
    fireEvent.change(screen.getByRole('searchbox', { name: t.shortcuts.search }), { target: { value: 'desfazer' } });
    expect(changeButton(t.shortcuts.actions.undo)).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: t.shortcuts.changeLabel.replace('{action}', t.shortcuts.actions.split) })).not.toBeInTheDocument();
  });
});
