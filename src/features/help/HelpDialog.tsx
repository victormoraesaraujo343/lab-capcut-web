// Página de ajuda em diálogo: sumário lateral à esquerda e a seção escolhida à direita.
import { useEffect, useId, useRef, useState, type KeyboardEvent } from 'react';
import { X } from 'lucide-react';
import { IconButton } from '../../components/IconButton';
import { t } from '../../i18n/pt-BR';
import { HELP_SECTIONS, type HelpBlock } from '../../i18n/helpContent';
import styles from './HelpDialog.module.css';

/** Seletores dos elementos que podem receber o foco dentro do diálogo. */
const FOCUSABLE = 'button, input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Propriedades do diálogo de ajuda. */
export interface HelpDialogProps {
  /** Fecha o diálogo. */
  onClose: () => void;
}

/** Desenha um bloco de texto ou uma lista da seção. */
function Block({ block }: { block: HelpBlock }) {
  if (block.kind === 'text') return <p className={styles.text}>{block.text}</p>;
  return (
    <ul className={styles.list}>
      {block.items.map((item) => (
        <li key={item}>{item}</li>
      ))}
    </ul>
  );
}

/** Diálogo modal com a ajuda do editor, em seções escolhidas pelo sumário. */
export function HelpDialog({ onClose }: HelpDialogProps) {
  const [activeId, setActiveId] = useState(HELP_SECTIONS[0]?.id ?? '');
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const active = HELP_SECTIONS.find((section) => section.id === activeId) ?? HELP_SECTIONS[0];

  // Foco vai para o diálogo ao abrir e volta para quem abriu ao fechar.
  useEffect(() => {
    const previous = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => previous?.focus();
  }, []);

  /** Esc fecha; Tab fica preso dentro do diálogo; as outras teclas não chegam aos atalhos do editor. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
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
          <h2 id={titleId} className={styles.title}>{t.help.title}</h2>
          <IconButton icon={X} label={t.help.close} onClick={onClose} />
        </header>

        <div className={styles.body}>
          <nav className={styles.index} aria-label={t.help.index}>
            <p className={styles.indexTitle}>{t.help.index}</p>
            <ul className={styles.indexList}>
              {HELP_SECTIONS.map((section) => {
                const current = section.id === active?.id;
                return (
                  <li key={section.id}>
                    <button
                      type="button"
                      className={current ? `${styles.indexItem} ${styles.indexItemActive}` : styles.indexItem}
                      aria-current={current ? 'true' : undefined}
                      onClick={() => setActiveId(section.id)}
                    >
                      {section.title}
                    </button>
                  </li>
                );
              })}
            </ul>
          </nav>

          <article className={styles.content}>
            {active !== undefined ? (
              <>
                <h3 className={styles.sectionTitle}>{active.title}</h3>
                {active.blocks.map((block, index) => (
                  <Block key={index} block={block} />
                ))}
              </>
            ) : null}
          </article>
        </div>
      </div>
    </div>
  );
}
