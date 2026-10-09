// Painel de atalhos: busca, grupos e troca de combinações com aviso de conflito e restauração do padrão.
import { Fragment, useEffect, useId, useMemo, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { t } from '../../i18n/pt-BR';
import { comboFromEvent, formatCombo, formatKey, splitCombo } from './keyCombo';
import {
  SHORTCUT_DEFINITIONS,
  SHORTCUT_GROUPS,
  type ShortcutDefinition,
  type ShortcutGroup,
  type ShortcutId,
} from './shortcutRegistry';
import { resolveCombos, useShortcutsStore, type ShortcutOverrides } from './shortcutsStore';
import styles from './ShortcutsDialog.module.css';

/** Seletores dos elementos que podem receber o foco dentro do diálogo. */
const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Troca que não pôde ser gravada: a ação em edição e a ação que já usa a combinação. */
interface Conflict {
  id: ShortcutId;
  conflictWith: ShortcutId;
}

/** Nome em pt-BR de uma ação; o próprio identificador se a ação não existir. */
function labelFor(id: ShortcutId): string {
  const definition = SHORTCUT_DEFINITIONS.find((item) => item.id === id);
  return definition === undefined ? id : t.shortcuts.actions[definition.labelKey];
}

/** Indica se a ação aparece na busca pelo nome ou por uma de suas combinações (ignora espaços e maiúsculas). */
function matchesQuery(definition: ShortcutDefinition, query: string, overrides: ShortcutOverrides): boolean {
  const needle = query.replace(/\s+/g, '').toLowerCase();
  if (needle === '') return true;
  if (labelFor(definition.id).toLowerCase().includes(query.trim().toLowerCase())) return true;
  return resolveCombos(overrides, definition.id).some((combo) =>
    formatCombo(combo).replace(/\s+/g, '').toLowerCase().includes(needle),
  );
}

/** Teclas de uma combinação, cada uma em um <kbd>. */
function Keys({ combo }: { combo: string }) {
  return (
    <span className={styles.keys}>
      {splitCombo(combo).map((part) => (
        <kbd key={part} className={styles.kbd}>
          {formatKey(part)}
        </kbd>
      ))}
    </span>
  );
}

/** Propriedades do painel de atalhos. */
export interface ShortcutsDialogProps {
  /** Fecha o painel. */
  onClose: () => void;
}

/** Diálogo modal que lista os atalhos por grupo e permite trocar ou restaurar cada um. */
export function ShortcutsDialog({ onClose }: ShortcutsDialogProps) {
  const overrides = useShortcutsStore((state) => state.overrides);
  const setCombo = useShortcutsStore((state) => state.setCombo);
  const resetAction = useShortcutsStore((state) => state.resetAction);
  const resetAll = useShortcutsStore((state) => state.resetAll);
  const [query, setQuery] = useState('');
  const [editingId, setEditingId] = useState<ShortcutId | null>(null);
  const [conflict, setConflict] = useState<Conflict | null>(null);
  const [status, setStatus] = useState('');
  const dialogRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const changeButtons = useRef(new Map<ShortcutId, HTMLButtonElement>());
  const returnFocusTo = useRef<ShortcutId | null>(null);
  const titleId = useId();
  const customCount = Object.keys(overrides).length;

  const groups = useMemo(
    () =>
      SHORTCUT_GROUPS.map((group) => ({
        group,
        items: SHORTCUT_DEFINITIONS.filter((definition) => definition.group === group && matchesQuery(definition, query, overrides)),
      })).filter((entry) => entry.items.length > 0),
    [query, overrides],
  );

  // Foco vai para a busca ao abrir e volta para quem abriu ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    searchRef.current?.focus();
    return () => previous?.focus();
  }, []);

  // Ao terminar uma troca, o foco volta para o botão Alterar daquela ação.
  useEffect(() => {
    if (editingId !== null) return;
    const target = returnFocusTo.current;
    if (target === null) return;
    returnFocusTo.current = null;
    changeButtons.current.get(target)?.focus();
  }, [editingId]);

  /** Sai do modo de troca sem gravar nada. */
  const cancelEdit = (): void => {
    returnFocusTo.current = editingId;
    setEditingId(null);
    setConflict(null);
  };

  /** Tenta gravar a combinação na ação em edição; mostra o conflito se ela já for usada. */
  const applyCombo = (id: ShortcutId, combo: string): void => {
    const result = setCombo(id, combo);
    if (!result.ok) {
      if (result.reason === 'conflict') setConflict({ id, conflictWith: result.conflictWith });
      return;
    }
    returnFocusTo.current = id;
    setEditingId(null);
    setConflict(null);
    setStatus(t.shortcuts.saved);
  };

  /** Esc fecha o painel (ou cancela a troca em andamento); Tab fica preso dentro dele; as outras teclas não chegam aos atalhos. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (editingId !== null && event.key !== 'Tab') {
      event.preventDefault();
      event.stopPropagation();
      if (event.key === 'Escape') {
        cancelEdit();
        return;
      }
      const combo = comboFromEvent(event);
      if (combo !== '') applyCombo(editingId, combo);
      return;
    }
    if (event.key !== 'Tab' && event.key !== 'Escape') event.stopPropagation();
    if (event.key === 'Escape') {
      event.preventDefault();
      onClose();
      return;
    }
    const dialog = dialogRef.current;
    if (event.key !== 'Tab' || dialog === null) return;
    const items = Array.from(dialog.querySelectorAll<HTMLElement>(FOCUSABLE)).filter((el) => !el.hasAttribute('disabled'));
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    const current = document.activeElement;
    const inside = current !== null && dialog.contains(current);
    if (event.shiftKey && (!inside || current === first)) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && (!inside || current === last)) {
      event.preventDefault();
      first.focus();
    }
  };

  /** Volta uma ação ao padrão e encerra a troca, se estiver aberta. */
  const handleReset = (id: ShortcutId): void => {
    resetAction(id);
    setEditingId(null);
    setConflict(null);
    setStatus(t.shortcuts.restored);
  };

  /** Volta todos os atalhos ao padrão. */
  const handleResetAll = (): void => {
    resetAll();
    setEditingId(null);
    setConflict(null);
    setStatus(t.shortcuts.allRestored);
  };

  return (
    <div className={styles.backdrop}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        className={styles.dialog}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>{t.shortcuts.title}</h2>
          <IconButton icon={X} label={t.shortcuts.close} onClick={onClose} />
        </header>

        <div className={styles.toolbar}>
          <input
            ref={searchRef}
            type="search"
            className={styles.search}
            aria-label={t.shortcuts.search}
            placeholder={t.shortcuts.search}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
          />
          <button type="button" className={styles.secondary} disabled={customCount === 0} onClick={handleResetAll}>
            {t.shortcuts.resetAll}
          </button>
        </div>
        <p className={styles.intro}>{t.shortcuts.intro}</p>

        <div className={styles.body}>
          {groups.length === 0 ? <p className={styles.empty}>{t.shortcuts.searchEmpty}</p> : null}
          {groups.map(({ group, items }: { group: ShortcutGroup; items: ShortcutDefinition[] }) => (
            <section key={group} className={styles.group} aria-labelledby={`${titleId}-${group}`}>
              <h3 id={`${titleId}-${group}`} className={styles.groupTitle}>{t.shortcuts.groups[group]}</h3>
              <ul className={styles.list}>
                {items.map((definition) => {
                  const { id } = definition;
                  const label = labelFor(id);
                  const combos = resolveCombos(overrides, id);
                  const isEditing = editingId === id;
                  const isCustom = overrides[id] !== undefined;
                  return (
                    <li key={id} className={styles.row}>
                      <div className={styles.rowMain}>
                        <span className={styles.label}>{label}</span>
                        <span className={styles.combos}>
                          {combos.length === 0 ? <span className={styles.none}>{t.shortcuts.none}</span> : null}
                          {combos.map((combo, index) => (
                            <Fragment key={combo}>
                              {index > 0 ? <span className={styles.or}>{t.shortcuts.or}</span> : null}
                              <Keys combo={combo} />
                            </Fragment>
                          ))}
                        </span>
                        <span className={styles.actions}>
                          <button
                            ref={(node) => {
                              if (node) changeButtons.current.set(id, node);
                              else changeButtons.current.delete(id);
                            }}
                            type="button"
                            className={styles.secondary}
                            aria-label={t.shortcuts.changeLabel.replace('{action}', label)}
                            onClick={() => {
                              setConflict(null);
                              setStatus('');
                              setEditingId(id);
                            }}
                          >
                            {t.shortcuts.change}
                          </button>
                          {isCustom ? (
                            <button
                              type="button"
                              className={styles.ghost}
                              aria-label={t.shortcuts.resetActionLabel.replace('{action}', label)}
                              onClick={() => handleReset(id)}
                            >
                              {t.shortcuts.resetAction}
                            </button>
                          ) : null}
                        </span>
                      </div>
                      {isEditing ? (
                        <div className={styles.editor}>
                          <p className={styles.listening} role="status">
                            {t.shortcuts.listening} <span className={styles.cancelHint}>{t.shortcuts.cancelHint}</span>
                          </p>
                          {conflict?.id === id ? (
                            <p className={styles.conflict} role="alert">
                              {t.shortcuts.conflict.replace('{action}', labelFor(conflict.conflictWith))}
                            </p>
                          ) : null}
                        </div>
                      ) : null}
                    </li>
                  );
                })}
              </ul>
            </section>
          ))}
        </div>

        <p className={styles.status} aria-live="polite">{status}</p>
      </div>
    </div>
  );
}
