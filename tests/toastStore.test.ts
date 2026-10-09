import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { runWithToast, useToastStore } from '../src/stores/toastStore';

describe('toastStore', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    useToastStore.setState({ toasts: [] });
  });

  afterEach(() => {
    useToastStore.setState({ toasts: [] });
    vi.clearAllTimers();
    vi.useRealTimers();
  });

  it('adiciona um aviso de erro por padrão', () => {
    useToastStore.getState().pushToast('Falhou');
    const [toast] = useToastStore.getState().toasts;
    expect(useToastStore.getState().toasts).toHaveLength(1);
    expect(toast?.message).toBe('Falhou');
    expect(toast?.kind).toBe('error');
  });

  it('aceita o tipo info', () => {
    useToastStore.getState().pushToast('Pronto', 'info');
    expect(useToastStore.getState().toasts[0]?.kind).toBe('info');
  });

  it('fecha um aviso pelo id sem mexer nos outros', () => {
    const { pushToast, dismissToast } = useToastStore.getState();
    pushToast('um');
    pushToast('dois');
    const [first, second] = useToastStore.getState().toasts;
    expect(first).toBeDefined();
    expect(second).toBeDefined();
    dismissToast(first?.id ?? '');
    expect(useToastStore.getState().toasts.map((t) => t.message)).toEqual(['dois']);
    expect(second?.id).not.toBe(first?.id);
  });

  it('some sozinho depois de 6 segundos', () => {
    useToastStore.getState().pushToast('temporário');
    vi.advanceTimersByTime(5999);
    expect(useToastStore.getState().toasts).toHaveLength(1);
    vi.advanceTimersByTime(1);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('runWithToast devolve o valor quando a promise funciona', async () => {
    const result = await runWithToast(Promise.resolve(42), 'erro');
    expect(result).toBe(42);
    expect(useToastStore.getState().toasts).toHaveLength(0);
  });

  it('runWithToast captura o erro e mostra a mensagem', async () => {
    const result = await runWithToast(Promise.reject(new Error('boom')), 'Não deu certo');
    expect(result).toBeUndefined();
    const toasts = useToastStore.getState().toasts;
    expect(toasts).toHaveLength(1);
    expect(toasts[0]?.message).toBe('Não deu certo');
    expect(toasts[0]?.kind).toBe('error');
  });
});
