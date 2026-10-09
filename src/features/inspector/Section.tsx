// Seção recolhível do inspetor: cabeçalho clicável com seta e corpo que some ao recolher.
import { useId, useState, type ReactNode } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import styles from './Section.module.css';

/** Propriedades de Section. */
export interface SectionProps {
  /** Título exibido no cabeçalho. */
  title: string;
  /** Se a seção começa aberta. Padrão: true. */
  defaultOpen?: boolean;
  /** Conteúdo da seção. */
  children: ReactNode;
}

/** Seção do inspetor que recolhe e expande pelo cabeçalho (aria-expanded). */
export function Section({ title, defaultOpen = true, children }: SectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  const bodyId = useId();
  const Chevron = open ? ChevronDown : ChevronRight;

  return (
    <section className={styles.section}>
      <button
        type="button"
        className={styles.header}
        aria-expanded={open}
        aria-controls={bodyId}
        onClick={() => setOpen((value) => !value)}
      >
        <Chevron size={14} strokeWidth={2} aria-hidden="true" />
        <span className={styles.title}>{title}</span>
      </button>
      {open && (
        <div id={bodyId} className={styles.body}>
          {children}
        </div>
      )}
    </section>
  );
}
