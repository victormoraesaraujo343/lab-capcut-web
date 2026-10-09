// Seção de animações do texto: entrada, saída e repetição, cada uma com tipo e duração.
import { t } from '@/i18n/pt-BR';
import { TEXT_ANIMATIONS } from '@/engine/text/textAnimations';
import { updateClip } from '@/engine/timeline/clipOps';
import { setTextAnimation, type TextAnimationSlot } from '@/stores/textCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import type { TextAnimation, TextData } from '@/types';
import { NumberField } from './NumberField';
import { Section } from './Section';
import fieldStyles from './NumberField.module.css';
import sectionStyles from './Section.module.css';

/** Propriedades de TextAnimationSection. */
export interface TextAnimationSectionProps {
  /** Id do clipe de texto editado. */
  clipId: string;
  /** Conteúdo do texto, com as animações atuais. */
  text: TextData;
}

/** Campo de dados de cada slot no clipe de texto. */
type AnimationField = 'animationIn' | 'animationOut' | 'animationLoop';

/** Slots de animação na ordem da tela, com rótulo, campo e tipo de animação aceito. */
const SLOTS: ReadonlyArray<{
  slot: TextAnimationSlot;
  label: string;
  field: AnimationField;
  kind: 'in' | 'out' | 'loop';
}> = [
  { slot: 'in', label: t.text.animIn, field: 'animationIn', kind: 'in' },
  { slot: 'out', label: t.text.animOut, field: 'animationOut', kind: 'out' },
  { slot: 'loop', label: t.text.animLoop, field: 'animationLoop', kind: 'loop' },
];

/** Rótulos das animações pelo nome interno, vindos da i18n. */
const ANIM_LABELS: Record<string, string> = t.text.anims;

/** Rótulo de uma animação; cai no nome interno se faltar a tradução. */
function animLabel(type: string): string {
  return ANIM_LABELS[type] ?? type;
}

/** Muda só a duração de uma animação já escolhida; arrastar o campo vira um passo no histórico. */
function setDuration(clipId: string, field: AnimationField, animation: TextAnimation, durationMs: number): void {
  useTimelineStore.getState().edit(
    'text-animation',
    (tracks) =>
      updateClip(tracks, clipId, (c) =>
        c.text ? { ...c, text: { ...c.text, [field]: { ...animation, durationMs } } } : c,
      ),
    undefined,
    { coalesceKey: `inspector:${clipId}:anim-${field}` },
  );
}

/** Seção Animação: uma linha por slot (entrada, saída, repetição), com o tipo e, se escolhido, a duração. */
export function TextAnimationSection({ clipId, text }: TextAnimationSectionProps) {
  return (
    <Section title={t.text.animations}>
      {SLOTS.map(({ slot, label, field, kind }) => {
        const current = text[field];
        const options = TEXT_ANIMATIONS.filter((anim) => anim.kind === kind);
        return (
          <div key={slot} className={sectionStyles.stack}>
            <div className={fieldStyles.row}>
              <span className={fieldStyles.label}>{label}</span>
              <select
                className={sectionStyles.select}
                aria-label={label}
                value={current?.type ?? ''}
                onChange={(event) => {
                  const type = event.target.value;
                  if (type === '') {
                    setTextAnimation(clipId, slot, null);
                    return;
                  }
                  const def = options.find((anim) => anim.type === type);
                  setTextAnimation(clipId, slot, { type, durationMs: def?.defaultDurationMs ?? 400 });
                }}
              >
                <option value="">{t.text.animNone}</option>
                {options.map((anim) => (
                  <option key={anim.type} value={anim.type}>
                    {animLabel(anim.type)}
                  </option>
                ))}
              </select>
            </div>
            {current !== undefined && (
              <NumberField
                label={t.text.animDuration}
                value={current.durationMs}
                min={100}
                max={5000}
                step={50}
                unit={t.inspector.unitMs}
                onChange={(value) => setDuration(clipId, field, current, value)}
              />
            )}
          </div>
        );
      })}
    </Section>
  );
}
