import { cleanup, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { Toaster } from '../src/components/Toaster';
import { t } from '../src/i18n/pt-BR';
import { useToastStore } from '../src/stores/toastStore';

describe('Toaster', () => {
  beforeEach(() => {
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    cleanup();
    useToastStore.setState({ toasts: [] });
  });

  it('mostra o erro com role alert', () => {
    useToastStore.getState().pushToast('Não foi possível salvar', 'error');
    render(<Toaster />);
    const alert = screen.getByRole('alert');
    expect(alert).toHaveTextContent('Não foi possível salvar');
  });

  it('fecha o aviso pelo botão', () => {
    useToastStore.getState().pushToast('Falhou');
    render(<Toaster />);
    fireEvent.click(screen.getByRole('button', { name: t.errors.dismiss }));
    expect(screen.queryByRole('alert')).toBeNull();
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('não renderiza nada sem avisos', () => {
    const { container } = render(<Toaster />);
    expect(container).toBeEmptyDOMElement();
  });
});
