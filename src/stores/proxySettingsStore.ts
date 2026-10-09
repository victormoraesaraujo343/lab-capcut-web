// Preferência da prévia leve (usar cópias 540p dos vídeos na prévia), guardada no localStorage com tolerância a falhas.
import { create } from 'zustand';

/** Chave do localStorage onde a preferência fica guardada. */
const STORAGE_KEY = 'capcut-web:proxy-preview';

/** Lê a preferência salva; sem acesso ao armazenamento ou sem valor, a prévia leve fica ligada. */
function readEnabled(): boolean {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored === null ? true : stored === '1';
  } catch {
    return true;
  }
}

/** Guarda a preferência; se o armazenamento não estiver disponível, a escolha vale só nesta sessão. */
function writeEnabled(enabled: boolean): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, enabled ? '1' : '0');
  } catch {
    // Sem armazenamento: a preferência continua valendo só em memória.
  }
}

/** Estado e ação da prévia leve. */
export interface ProxySettingsState {
  /** Prévia usa as cópias leves quando existirem (padrão: ligada). */
  enabled: boolean;
  /** Troca a preferência e guarda a escolha; ao ligar, a geração das cópias é pedida por proxyCommands. */
  setEnabled: (enabled: boolean) => void;
}

/** Hook da preferência da prévia leve. */
export const useProxySettingsStore = create<ProxySettingsState>()((set) => ({
  enabled: readEnabled(),
  // Guarda a escolha e atualiza o estado.
  setEnabled: (enabled) => {
    writeEnabled(enabled);
    set({ enabled });
  },
}));
