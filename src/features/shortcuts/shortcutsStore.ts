// Store dos atalhos personalizados: troca de combinação com detecção de conflito, restauração e persistência no navegador.
import { create } from 'zustand';
import { SHORTCUT_DEFINITIONS, defaultCombosFor, isShortcutId, type ShortcutId } from './shortcutRegistry';

/** Chave do localStorage com as combinações personalizadas. */
export const SHORTCUTS_STORAGE_KEY = 'capcut-web:shortcuts';

/** Combinações personalizadas por ação; ações ausentes usam o padrão. */
export type ShortcutOverrides = Partial<Record<ShortcutId, string[]>>;

/** Resultado de gravar uma combinação: sucesso, vazia ou já usada por outra ação. */
export type SetComboResult =
  | { ok: true }
  | { ok: false; reason: 'empty' }
  | { ok: false; reason: 'conflict'; conflictWith: ShortcutId };

/** Combinações válidas de uma ação: a personalizada, se houver, ou o padrão. */
export function resolveCombos(overrides: ShortcutOverrides, id: ShortcutId): string[] {
  return overrides[id]?.slice() ?? defaultCombosFor(id);
}

/** Procura outra ação que já use a combinação; null se estiver livre. */
export function findConflict(overrides: ShortcutOverrides, id: ShortcutId, combo: string): ShortcutId | null {
  for (const definition of SHORTCUT_DEFINITIONS) {
    if (definition.id !== id && resolveCombos(overrides, definition.id).includes(combo)) return definition.id;
  }
  return null;
}

/** Lê as combinações salvas, descartando ações desconhecidas e valores inválidos; sem acesso ao armazenamento usa o padrão. */
function readOverrides(): ShortcutOverrides {
  try {
    const raw = window.localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    if (raw === null) return {};
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return {};
    const result: ShortcutOverrides = {};
    for (const [id, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (!isShortcutId(id) || !Array.isArray(value)) continue;
      const list: unknown[] = value;
      const combos = list.filter((combo): combo is string => typeof combo === 'string' && combo !== '');
      if (combos.length > 0) result[id] = combos;
    }
    return result;
  } catch {
    return {};
  }
}

/** Guarda as combinações no navegador; falhas de armazenamento valem só para esta sessão. */
function saveOverrides(overrides: ShortcutOverrides): void {
  try {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify(overrides));
  } catch {
    // Sem armazenamento disponível os atalhos personalizados valem só até fechar a página.
  }
}

/** Estado e ações dos atalhos. */
export interface ShortcutsState {
  /** Combinações personalizadas por ação. */
  overrides: ShortcutOverrides;
  /** Combinações atuais de uma ação. */
  combosFor: (id: ShortcutId) => string[];
  /** Define a combinação (única) de uma ação; recusa se outra ação já a usa. */
  setCombo: (id: ShortcutId, combo: string) => SetComboResult;
  /** Volta uma ação ao padrão. */
  resetAction: (id: ShortcutId) => void;
  /** Volta todas as ações ao padrão. */
  resetAll: () => void;
  /** Ação que responde à combinação; null se nenhuma. */
  actionForCombo: (combo: string) => ShortcutId | null;
}

/** Hook com o estado e as ações dos atalhos. */
export const useShortcutsStore = create<ShortcutsState>()((set, get) => ({
  overrides: readOverrides(),
  // Combinações atuais de uma ação.
  combosFor: (id) => resolveCombos(get().overrides, id),
  // Grava a combinação se ela estiver livre.
  setCombo: (id, combo) => {
    if (combo === '') return { ok: false, reason: 'empty' };
    const { overrides } = get();
    const conflictWith = findConflict(overrides, id, combo);
    if (conflictWith !== null) return { ok: false, reason: 'conflict', conflictWith };
    const next: ShortcutOverrides = { ...overrides, [id]: [combo] };
    saveOverrides(next);
    set({ overrides: next });
    return { ok: true };
  },
  // Remove a personalização de uma ação.
  resetAction: (id) => {
    const next: ShortcutOverrides = { ...get().overrides };
    delete next[id];
    saveOverrides(next);
    set({ overrides: next });
  },
  // Remove todas as personalizações.
  resetAll: () => {
    saveOverrides({});
    set({ overrides: {} });
  },
  // Procura a ação dona da combinação.
  actionForCombo: (combo) => {
    if (combo === '') return null;
    const { overrides } = get();
    const match = SHORTCUT_DEFINITIONS.find((definition) => resolveCombos(overrides, definition.id).includes(combo));
    return match?.id ?? null;
  },
}));
