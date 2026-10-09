// Registro das ações de atalho: grupo, rótulo e combinações padrão. As ações do editor usam DEFAULT_KEYMAP como fonte.
import { DEFAULT_KEYMAP, type ShortcutAction } from '@/utils/keymap';
import type { t } from '@/i18n/pt-BR';

/** Grupos em que os atalhos aparecem no painel. */
export type ShortcutGroup = 'reproducao' | 'edicao' | 'linhaDoTempo' | 'geral';

/** Identificador de qualquer atalho: ações do editor mais a ajuda e o painel de atalhos. */
export type ShortcutId = ShortcutAction | 'help' | 'shortcuts';

/** Chave do rótulo em t.shortcuts.actions. */
export type ShortcutLabelKey = keyof typeof t.shortcuts.actions;

/** Descrição de uma ação de atalho. */
export interface ShortcutDefinition {
  id: ShortcutId;
  labelKey: ShortcutLabelKey;
  group: ShortcutGroup;
  defaultCombos: string[];
}

/** Ordem dos grupos no painel de atalhos. */
export const SHORTCUT_GROUPS: readonly ShortcutGroup[] = ['reproducao', 'edicao', 'linhaDoTempo', 'geral'];

/** Grupo de cada ação do editor. */
const EDITOR_GROUPS: Readonly<Record<ShortcutAction, ShortcutGroup>> = {
  playPause: 'reproducao',
  frameBack: 'reproducao',
  frameForward: 'reproducao',
  goToStart: 'reproducao',
  goToEnd: 'reproducao',
  split: 'edicao',
  delete: 'edicao',
  rippleDelete: 'edicao',
  undo: 'edicao',
  redo: 'edicao',
  duplicate: 'edicao',
  copy: 'edicao',
  paste: 'edicao',
  cut: 'edicao',
  trimStartToPlayhead: 'edicao',
  trimEndToPlayhead: 'edicao',
  selectAll: 'edicao',
  group: 'edicao',
  ungroup: 'edicao',
  prevEdge: 'linhaDoTempo',
  nextEdge: 'linhaDoTempo',
  zoomIn: 'linhaDoTempo',
  zoomOut: 'linhaDoTempo',
  bladeTool: 'linhaDoTempo',
  selectTool: 'linhaDoTempo',
  toggleSnap: 'linhaDoTempo',
};

/** Todas as ações de atalho, na ordem de exibição do painel. */
export const SHORTCUT_DEFINITIONS: readonly ShortcutDefinition[] = [
  ...SHORTCUT_GROUPS.flatMap((group) =>
    (Object.keys(EDITOR_GROUPS) as ShortcutAction[])
      .filter((id) => EDITOR_GROUPS[id] === group)
      .map((id): ShortcutDefinition => ({
        id,
        labelKey: id,
        group,
        defaultCombos: [...DEFAULT_KEYMAP[id]],
      })),
  ),
  { id: 'help', labelKey: 'help', group: 'geral', defaultCombos: ['?'] },
  { id: 'shortcuts', labelKey: 'shortcuts', group: 'geral', defaultCombos: ['Ctrl+/'] },
];

/** Devolve as combinações padrão de uma ação; vazio se a ação não existir. */
export function defaultCombosFor(id: ShortcutId): string[] {
  return SHORTCUT_DEFINITIONS.find((definition) => definition.id === id)?.defaultCombos.slice() ?? [];
}

/** Indica se o texto é o identificador de uma ação conhecida. */
export function isShortcutId(value: string): value is ShortcutId {
  return SHORTCUT_DEFINITIONS.some((definition) => definition.id === value);
}
