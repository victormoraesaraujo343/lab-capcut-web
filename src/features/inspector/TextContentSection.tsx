// Seção de conteúdo do texto: área de digitação que grava a cada tecla (o histórico agrupa a digitação).
import { t } from '@/i18n/pt-BR';
import { updateText } from '@/stores/textCommands';
import type { TextData } from '@/types';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Propriedades de TextContentSection. */
export interface TextContentSectionProps {
  /** Id do clipe de texto editado. */
  clipId: string;
  /** Conteúdo atual do texto. */
  text: TextData;
}

/** Seção Texto: o conteúdo do clipe, editado direto na área de digitação. */
export function TextContentSection({ clipId, text }: TextContentSectionProps) {
  return (
    <Section title={t.text.content}>
      <textarea
        aria-label={t.text.content}
        rows={3}
        className={sectionStyles.textarea}
        value={text.content}
        onChange={(event) => updateText(clipId, { content: event.target.value })}
      />
    </Section>
  );
}
