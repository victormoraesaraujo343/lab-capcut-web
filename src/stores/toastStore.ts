// Store dos avisos rápidos (toasts): mostra falhas de operações de projeto e some sozinha depois de alguns segundos.
import { create } from 'zustand';

/** Tipo de aviso: erro (destaque vermelho) ou informação. */
export type ToastKind = 'error' | 'info';

/** Um aviso exibido na tela. */
export interface Toast {
  /** Identificador único do aviso. */
  id: string;
  /** Texto já traduzido exibido ao usuário. */
  message: string;
  /** Tipo do aviso. */
  kind: ToastKind;
}

/** Tempo, em milissegundos, até o aviso sumir sozinho. */
const TOAST_LIFETIME_MS = 6000;

/** Estado e ações da lista de avisos. */
export interface ToastState {
  /** Avisos visíveis, do mais antigo para o mais recente. */
  toasts: Toast[];
  /** Mostra um aviso que some sozinho depois de alguns segundos. */
  pushToast: (message: string, kind?: ToastKind) => void;
  /** Fecha um aviso pelo id. */
  dismissToast: (id: string) => void;
}

/** Contador usado para gerar ids únicos dos avisos. */
let toastCounter = 0;

/** Temporizadores de auto-fechamento, indexados pelo id do aviso. */
const timers = new Map<string, ReturnType<typeof setTimeout>>();

/** Hook com a lista de avisos e as ações para mostrar e fechar. */
export const useToastStore = create<ToastState>()((set) => ({
  toasts: [],

  // Adiciona o aviso e agenda o fechamento automático.
  pushToast: (message, kind = 'error') => {
    toastCounter += 1;
    const id = `toast-${toastCounter}`;
    set((state) => ({ toasts: [...state.toasts, { id, message, kind }] }));
    const timer = setTimeout(() => {
      timers.delete(id);
      set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
    }, TOAST_LIFETIME_MS);
    timers.set(id, timer);
  },

  // Remove o aviso e cancela o temporizador dele.
  dismissToast: (id) => {
    const timer = timers.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.delete(id);
    }
    set((state) => ({ toasts: state.toasts.filter((toast) => toast.id !== id) }));
  },
}));

/** Aguarda a promise; se ela falhar, mostra o aviso de erro e devolve undefined. */
export async function runWithToast<T>(promise: Promise<T>, errorMessage: string): Promise<T | undefined> {
  try {
    return await promise;
  } catch {
    useToastStore.getState().pushToast(errorMessage, 'error');
    return undefined;
  }
}
