// Testes do store de atalhos: troca de combinação, conflitos, restauração e persistência no navegador.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { SHORTCUTS_STORAGE_KEY, useShortcutsStore } from '@/features/shortcuts/shortcutsStore';
import { SHORTCUT_DEFINITIONS } from '@/features/shortcuts/shortcutRegistry';
import { DEFAULT_KEYMAP } from '@/utils/keymap';

/** Zera o store e o armazenamento antes de cada teste. */
beforeEach(() => {
  window.localStorage.clear();
  useShortcutsStore.setState({ overrides: {} });
});

afterEach(() => {
  vi.resetModules();
  window.localStorage.clear();
});

describe('registro de atalhos', () => {
  it('usa as combinações padrão do editor e inclui ajuda e atalhos', () => {
    const store = useShortcutsStore.getState();
    expect(store.combosFor('split')).toEqual(DEFAULT_KEYMAP.split);
    expect(store.actionForCombo('?')).toBe('help');
    expect(store.actionForCombo('Ctrl+/')).toBe('shortcuts');
    expect(SHORTCUT_DEFINITIONS.length).toBe(Object.keys(DEFAULT_KEYMAP).length + 2);
  });
});

describe('setCombo', () => {
  it('grava uma nova combinação e a ação passa a responder por ela', () => {
    const result = useShortcutsStore.getState().setCombo('split', 'X');
    expect(result).toEqual({ ok: true });
    expect(useShortcutsStore.getState().combosFor('split')).toEqual(['X']);
    expect(useShortcutsStore.getState().actionForCombo('X')).toBe('split');
    expect(useShortcutsStore.getState().actionForCombo('S')).toBeNull();
  });

  it('recusa combinação já usada por outra ação e não altera nada', () => {
    const result = useShortcutsStore.getState().setCombo('bladeTool', 'S');
    expect(result).toEqual({ ok: false, reason: 'conflict', conflictWith: 'split' });
    expect(useShortcutsStore.getState().combosFor('bladeTool')).toEqual(DEFAULT_KEYMAP.bladeTool);
    expect(useShortcutsStore.getState().overrides).toEqual({});
  });

  it('recusa combinação vazia', () => {
    expect(useShortcutsStore.getState().setCombo('split', '')).toEqual({ ok: false, reason: 'empty' });
  });

  it('libera a combinação de uma ação personalizada para outra ação', () => {
    useShortcutsStore.getState().setCombo('split', 'X');
    expect(useShortcutsStore.getState().setCombo('cut', 'Ctrl+B')).toEqual({ ok: true });
    expect(useShortcutsStore.getState().actionForCombo('Ctrl+B')).toBe('cut');
  });

  it('permite regravar a mesma combinação na própria ação', () => {
    expect(useShortcutsStore.getState().setCombo('split', 'S')).toEqual({ ok: true });
  });
});

describe('restaurar', () => {
  it('resetAction volta uma ação ao padrão', () => {
    useShortcutsStore.getState().setCombo('split', 'X');
    useShortcutsStore.getState().resetAction('split');
    expect(useShortcutsStore.getState().combosFor('split')).toEqual(DEFAULT_KEYMAP.split);
    expect(useShortcutsStore.getState().actionForCombo('S')).toBe('split');
  });

  it('resetAll volta todas as ações ao padrão', () => {
    useShortcutsStore.getState().setCombo('split', 'X');
    useShortcutsStore.getState().setCombo('undo', 'U');
    useShortcutsStore.getState().resetAll();
    expect(useShortcutsStore.getState().overrides).toEqual({});
    expect(useShortcutsStore.getState().combosFor('undo')).toEqual(DEFAULT_KEYMAP.undo);
  });
});

describe('persistência', () => {
  it('grava as personalizações no localStorage', () => {
    useShortcutsStore.getState().setCombo('split', 'X');
    const raw = window.localStorage.getItem(SHORTCUTS_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw ?? '{}')).toEqual({ split: ['X'] });
  });

  it('lê as personalizações salvas ao carregar o módulo de novo', async () => {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify({ split: ['X'] }));
    vi.resetModules();
    const fresh = await import('@/features/shortcuts/shortcutsStore');
    expect(fresh.useShortcutsStore.getState().actionForCombo('X')).toBe('split');
  });

  it('ignora dados corrompidos e ações desconhecidas', async () => {
    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, '{ isto não é json');
    vi.resetModules();
    const broken = await import('@/features/shortcuts/shortcutsStore');
    expect(broken.useShortcutsStore.getState().overrides).toEqual({});

    window.localStorage.setItem(SHORTCUTS_STORAGE_KEY, JSON.stringify({ naoExiste: ['Q'], split: 'S', cut: ['Y'] }));
    vi.resetModules();
    const filtered = await import('@/features/shortcuts/shortcutsStore');
    expect(filtered.useShortcutsStore.getState().overrides).toEqual({ cut: ['Y'] });
  });
});
