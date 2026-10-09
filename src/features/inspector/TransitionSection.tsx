// Seção Transição do inspetor: tipo, duração (100 a 3000 ms) e remoção da transição de saída do clipe.
import { useState } from 'react';
import { t } from '@/i18n/pt-BR';
import { removeTransition, setTransitionDuration } from '@/stores/transitionCommands';
import type { Clip } from '@/types';
import { lookupText, type TextGroup } from './EffectParamControl';
import { NumberField } from './NumberField';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Nomes das transições, pelo tipo (t.transitions.names.dissolve...). */
const TRANSITION_NAMES: TextGroup = t.transitions.names;

/** Propriedades de TransitionSection. */
export interface TransitionSectionProps {
  /** Clipe que tem transição de saída. */
  clip: Clip;
}

/** Seção da transição de saída do clipe; o arraste da duração vira um passo só ao soltar. */
export function TransitionSection({ clip }: TransitionSectionProps) {
  const [draft, setDraft] = useState<number | null>(null);
  const transition = clip.transitionOut;
  if (transition === undefined) return null;
  const name = lookupText(TRANSITION_NAMES, transition.type) ?? transition.type;

  return (
    <Section title={t.transitions.title}>
      <div className={sectionStyles.actions}>
        <span>{name}</span>
        <button type="button" className={sectionStyles.action} onClick={() => removeTransition(clip.id)}>
          {t.transitions.remove}
        </button>
      </div>
      <NumberField
        label={t.transitions.duration}
        value={draft ?? transition.durationMs}
        min={100}
        max={3000}
        step={50}
        unit={t.inspector.unitMs}
        onChange={(value, final) => {
          if (!final) {
            setDraft(value);
            return;
          }
          setDraft(null);
          setTransitionDuration(clip.id, value);
        }}
      />
    </Section>
  );
}
