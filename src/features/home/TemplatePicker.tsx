import { useEffect, useId, useRef, type CSSProperties, type KeyboardEvent, type MouseEvent } from 'react';
import { X } from 'lucide-react';
import { t } from '../../i18n/pt-BR';
import { TEMPLATES, type TemplateDef } from '../../engine/templates/templates';
import { runWithToast, useProjectStore } from '../../stores';
import { createProjectFromTemplate } from '../../stores/projectActions';
import styles from './TemplatePicker.module.css';

/** Propriedades do diálogo de escolha de modelo. */
export interface TemplatePickerProps {
  /** Diálogo visível. */
  open: boolean;
  /** Fecha o diálogo (Esc, botão Fechar ou clique fora). */
  onClose(): void;
}

/** Seletor de elementos focáveis dentro do diálogo. */
const FOCUSABLE = 'button:not([disabled]), [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';

/** Classe da moldura de cada proporção na miniatura. */
const RATIO_CLASS: Record<TemplateDef['aspectRatio'], string> = {
  '16:9': styles.ratio169 ?? '',
  '9:16': styles.ratio916 ?? '',
  '1:1': styles.ratio11 ?? '',
};

/** Diálogo modal com "Projeto em branco" e os dez modelos em grade; foco preso, Esc fecha e o foco volta ao botão que abriu. */
export function TemplatePicker({ open, onClose }: TemplatePickerProps) {
  const titleId = useId();
  const dialogRef = useRef<HTMLDivElement>(null);
  const createNewProject = useProjectStore((s) => s.createNewProject);

  useEffect(() => {
    if (!open) return undefined;
    const opener = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    dialogRef.current?.querySelector<HTMLElement>(FOCUSABLE)?.focus();
    return () => opener?.focus();
  }, [open]);

  if (!open) return null;

  /** Esc fecha; Tab fica preso dentro do diálogo. */
  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Escape') {
      event.stopPropagation();
      onClose();
      return;
    }
    if (event.key !== 'Tab') return;
    const items = Array.from(dialogRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE) ?? []);
    const first = items[0];
    const last = items[items.length - 1];
    if (first === undefined || last === undefined) return;
    const active = document.activeElement;
    if (event.shiftKey && (active === first || !dialogRef.current?.contains(active))) {
      event.preventDefault();
      last.focus();
    } else if (!event.shiftKey && active === last) {
      event.preventDefault();
      first.focus();
    }
  };

  /** Clique no fundo escuro fecha o diálogo. */
  const handleBackdropMouseDown = (event: MouseEvent<HTMLDivElement>): void => {
    if (event.target === event.currentTarget) onClose();
  };

  /** Fecha e cria um projeto em branco pelo caminho normal. */
  const createBlank = (): void => {
    onClose();
    void runWithToast(createNewProject(), t.errors.projectCreate);
  };

  /** Fecha e cria um projeto a partir do modelo escolhido. */
  const createFromTemplate = (id: TemplateDef['id']): void => {
    onClose();
    void runWithToast(createProjectFromTemplate(id), t.errors.projectCreate);
  };

  return (
    <div className={styles.backdrop} onMouseDown={handleBackdropMouseDown}>
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        className={styles.dialog}
        onKeyDown={handleKeyDown}
      >
        <header className={styles.header}>
          <h2 id={titleId} className={styles.title}>{t.templates.title}</h2>
          <button type="button" className={styles.close} onClick={onClose} aria-label={t.templates.close}>
            <X size={18} strokeWidth={1.75} aria-hidden="true" />
          </button>
        </header>
        <div className={styles.grid} role="list">
          <div role="listitem">
            <button type="button" className={styles.card} onClick={createBlank}>
              <span className={styles.thumb} aria-hidden="true">
                <span className={`${styles.frame} ${RATIO_CLASS['16:9']} ${styles.blankFrame ?? ''}`} />
              </span>
              <span className={styles.name}>{t.templates.blank}</span>
              <span className={styles.description}>{t.templates.blankDescription}</span>
            </button>
          </div>
          {TEMPLATES.map((def) => (
            <div role="listitem" key={def.id}>
              <button
                type="button"
                className={styles.card}
                style={{ '--template-accent': def.accent } as CSSProperties}
                onClick={() => createFromTemplate(def.id)}
              >
                <span className={styles.thumb} aria-hidden="true">
                  <span className={`${styles.frame} ${RATIO_CLASS[def.aspectRatio]}`}>
                    <span className={styles.bar} />
                  </span>
                  <span className={styles.badge}>{def.aspectRatio}</span>
                </span>
                <span className={styles.name}>{t.templates.names[def.labelKey]}</span>
                <span className={styles.description}>{t.templates.descriptions[def.descriptionKey]}</span>
              </button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
