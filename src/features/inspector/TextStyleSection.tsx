// Seções de estilo do texto: fonte, tamanho, cor, toggles, alinhamento e espaçamento; depois contorno, sombra e fundo.
import { AlignCenter, AlignLeft, AlignRight, Bold, Italic, Underline } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { updateText } from '@/stores/textCommands';
import type { TextStyle } from '@/types';
import { ColorField } from './ColorField';
import { FontPicker } from './FontPicker';
import { NumberField } from './NumberField';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Propriedades de TextStyleSection. */
export interface TextStyleSectionProps {
  /** Id do clipe de texto editado. */
  clipId: string;
  /** Estilo atual do texto. */
  style: TextStyle;
}

/** Seções de estilo: Estilo (fonte, tamanho, cor, negrito, itálico, sublinhado, alinhamento, espaçamento, altura da linha e opacidade), Contorno, Sombra e Fundo. */
export function TextStyleSection({ clipId, style }: TextStyleSectionProps) {
  /** Aplica campos de estilo ao texto; cada chamada de arraste ou digitação se agrupa no histórico. */
  const set = (patch: Partial<TextStyle>): void => updateText(clipId, { style: patch });

  return (
    <>
      <Section title={t.inspector.style}>
        <FontPicker clipId={clipId} fontFamily={style.fontFamily} bold={style.bold} />
        <NumberField
          label={t.text.size}
          value={style.fontSize}
          min={8}
          max={400}
          step={1}
          unit={t.inspector.unitPx}
          onChange={(value) => set({ fontSize: value })}
        />
        <ColorField label={t.text.color} value={style.color} onChange={(value) => set({ color: value })} />
        <div className={sectionStyles.actions} role="group" aria-label={t.text.font}>
          <button
            type="button"
            className={sectionStyles.action}
            aria-label={t.text.bold}
            aria-pressed={style.bold}
            onClick={() => set({ bold: !style.bold })}
          >
            <Bold size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={sectionStyles.action}
            aria-label={t.text.italic}
            aria-pressed={style.italic}
            onClick={() => set({ italic: !style.italic })}
          >
            <Italic size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={sectionStyles.action}
            aria-label={t.text.underline}
            aria-pressed={style.underline}
            onClick={() => set({ underline: !style.underline })}
          >
            <Underline size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={sectionStyles.action}
            aria-label={t.text.alignLeft}
            aria-pressed={style.align === 'left'}
            onClick={() => set({ align: 'left' })}
          >
            <AlignLeft size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={sectionStyles.action}
            aria-label={t.text.alignCenter}
            aria-pressed={style.align === 'center'}
            onClick={() => set({ align: 'center' })}
          >
            <AlignCenter size={14} aria-hidden="true" />
          </button>
          <button
            type="button"
            className={sectionStyles.action}
            aria-label={t.text.alignRight}
            aria-pressed={style.align === 'right'}
            onClick={() => set({ align: 'right' })}
          >
            <AlignRight size={14} aria-hidden="true" />
          </button>
        </div>
        <NumberField
          label={t.text.letterSpacing}
          value={style.letterSpacing}
          min={-20}
          max={100}
          step={1}
          unit={t.inspector.unitPx}
          onChange={(value) => set({ letterSpacing: value })}
        />
        <NumberField
          label={t.text.lineHeight}
          value={style.lineHeight}
          min={0.8}
          max={3}
          step={0.05}
          onChange={(value) => set({ lineHeight: value })}
        />
        <NumberField
          label={t.text.opacity}
          value={style.opacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => set({ opacity: value })}
        />
      </Section>

      <Section title={t.text.stroke} defaultOpen={false}>
        <ColorField label={t.text.color} value={style.strokeColor} onChange={(value) => set({ strokeColor: value })} />
        <NumberField
          label={t.text.strokeWidth}
          value={style.strokeWidth}
          min={0}
          max={30}
          step={1}
          unit={t.inspector.unitPx}
          onChange={(value) => set({ strokeWidth: value })}
        />
      </Section>

      <Section title={t.text.shadow} defaultOpen={false}>
        <ColorField label={t.text.color} value={style.shadowColor} onChange={(value) => set({ shadowColor: value })} />
        <NumberField
          label={t.text.shadowBlur}
          value={style.shadowBlur}
          min={0}
          max={60}
          step={1}
          unit={t.inspector.unitPx}
          onChange={(value) => set({ shadowBlur: value })}
        />
        <NumberField
          label={t.inspector.shadowOffsetX}
          value={style.shadowOffsetX}
          min={-50}
          max={50}
          step={1}
          unit={t.inspector.unitPx}
          onChange={(value) => set({ shadowOffsetX: value })}
        />
        <NumberField
          label={t.inspector.shadowOffsetY}
          value={style.shadowOffsetY}
          min={-50}
          max={50}
          step={1}
          unit={t.inspector.unitPx}
          onChange={(value) => set({ shadowOffsetY: value })}
        />
      </Section>

      <Section title={t.text.background} defaultOpen={false}>
        <ColorField
          label={t.text.color}
          value={style.backgroundColor}
          onChange={(value) => set({ backgroundColor: value })}
        />
        <NumberField
          label={t.text.backgroundOpacity}
          value={style.backgroundOpacity}
          min={0}
          max={1}
          step={0.01}
          onChange={(value) => set({ backgroundOpacity: value })}
        />
      </Section>
    </>
  );
}
