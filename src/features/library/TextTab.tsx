// Aba Texto: botão para adicionar texto no cursor e grade de estilos prontos que viram texto com um clique.

import type { CSSProperties } from 'react';
import { Plus } from 'lucide-react';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { TEXT_PRESETS } from '@/engine/text/textPresets';
import { t } from '@/i18n/pt-BR';
import { addText } from '@/stores/textCommands';
import type { TextStyle } from '@/types';
import styles from './TextTab.module.css';

/** Tamanho da amostra 'Aa' nos cartões, em pixels de tela. */
const SAMPLE_FONT_PX = 26;

/** Nomes de exibição dos estilos prontos, por id. */
const PRESET_NAMES: Partial<Record<string, string>> = t.library.presetNames;

/** Estilo CSS que desenha a amostra com a aparência do estilo pronto, reduzida ao tamanho do cartão. */
export function previewStyle(style: Partial<TextStyle>): CSSProperties {
  const scale = SAMPLE_FONT_PX / (style.fontSize ?? defaultTextStyle().fontSize);
  const shadowOffsetX = style.shadowOffsetX ?? 0;
  const shadowOffsetY = style.shadowOffsetY ?? 0;
  const shadowBlur = style.shadowBlur ?? 0;
  const hasShadow = shadowBlur > 0 || shadowOffsetX !== 0 || shadowOffsetY !== 0;
  const strokeWidth = style.strokeWidth ?? 0;
  const backgroundOpacity = style.backgroundOpacity ?? 0;
  const hasBackground = backgroundOpacity > 0;
  return {
    fontFamily: `"${style.fontFamily ?? defaultTextStyle().fontFamily}", sans-serif`,
    fontSize: `${SAMPLE_FONT_PX}px`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    textDecoration: style.underline ? 'underline' : 'none',
    letterSpacing: `${(style.letterSpacing ?? 0) * scale}px`,
    color: style.color,
    opacity: style.opacity ?? 1,
    WebkitTextStroke: strokeWidth > 0 ? `${strokeWidth * scale}px ${style.strokeColor ?? '#000000'}` : undefined,
    textShadow: hasShadow
      ? `${shadowOffsetX * scale}px ${shadowOffsetY * scale}px ${shadowBlur * scale}px ${style.shadowColor ?? '#000000'}`
      : 'none',
    backgroundColor: hasBackground
      ? `color-mix(in srgb, ${style.backgroundColor ?? '#000000'} ${backgroundOpacity * 100}%, transparent)`
      : undefined,
    borderRadius: hasBackground ? '3px' : undefined,
    padding: hasBackground ? '0 4px' : undefined,
  };
}

/** Aba Texto: adicionar texto em branco e estilos prontos. */
export function TextTab() {
  return (
    <div className={styles.root}>
      <button
        type="button"
        className={styles.addButton}
        onClick={() => {
          addText();
        }}
      >
        <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
        <span>{t.text.add}</span>
      </button>

      <h3 className={styles.sectionTitle}>{t.text.presets}</h3>
      <div className={styles.grid}>
        {TEXT_PRESETS.map((preset) => {
          const name = PRESET_NAMES[preset.id] ?? preset.id;
          return (
            <button
              key={preset.id}
              type="button"
              className={styles.card}
              title={name}
              aria-label={name}
              onClick={() => {
                addText({ presetId: preset.id });
              }}
            >
              <span className={styles.sample} style={previewStyle(preset.style)}>
                {t.library.sampleGlyph}
              </span>
              <span className={styles.cardName}>{name}</span>
            </button>
          );
        })}
      </div>

      <p className={styles.hint}>{t.text.editHint}</p>
    </div>
  );
}
