// Grade dos 20 estilos prontos de texto: cada miniatura é um "Aa" desenhado com o próprio estilo; clique aplica.
import type { CSSProperties } from 'react';
import { t } from '@/i18n/pt-BR';
import { applyTextPreset } from '@/stores/textCommands';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { applyPreset, TEXT_PRESETS, type TextPreset } from '@/engine/text/textPresets';
import type { TextStyle } from '@/types';
import { Section } from './Section';
import styles from './TextPresetGrid.module.css';

/** Propriedades de TextPresetGrid. */
export interface TextPresetGridProps {
  /** Id do clipe de texto que recebe o estilo. */
  clipId: string;
}

/** Fator que reduz as medidas do estilo (contorno, sombra) para caber na miniatura. */
const THUMB_SCALE = 0.3;

/** Mistura uma cor #rrggbb com opacidade; outros formatos são devolvidos como estão. */
function withAlpha(color: string, alpha: number): string {
  const match = /^#([0-9a-f]{6})$/i.exec(color);
  if (match === null || match[1] === undefined) return color;
  const hex = match[1];
  const r = parseInt(hex.slice(0, 2), 16);
  const g = parseInt(hex.slice(2, 4), 16);
  const b = parseInt(hex.slice(4, 6), 16);
  return `rgba(${r}, ${g}, ${b}, ${alpha})`;
}

/** Estilo CSS da miniatura, derivado do estilo completo do predefinido. */
function thumbStyle(style: TextStyle): CSSProperties {
  const background = style.backgroundOpacity > 0 ? withAlpha(style.backgroundColor, style.backgroundOpacity) : 'transparent';
  const shadow =
    style.shadowBlur > 0 || style.shadowOffsetX !== 0 || style.shadowOffsetY !== 0
      ? `${style.shadowOffsetX * THUMB_SCALE}px ${style.shadowOffsetY * THUMB_SCALE}px ${style.shadowBlur * THUMB_SCALE}px ${style.shadowColor}`
      : 'none';
  return {
    fontFamily: `"${style.fontFamily}", sans-serif`,
    fontWeight: style.bold ? 700 : 400,
    fontStyle: style.italic ? 'italic' : 'normal',
    letterSpacing: `${style.letterSpacing * THUMB_SCALE}px`,
    color: style.color,
    background,
    textShadow: shadow,
    WebkitTextStroke: style.strokeWidth > 0 ? `${style.strokeWidth * THUMB_SCALE}px ${style.strokeColor}` : undefined,
    opacity: style.opacity,
  };
}

/** Rótulo do predefinido, vindo da i18n; cai no id se faltar a tradução. */
function presetLabel(preset: TextPreset): string {
  const labels: Record<string, string> = t.inspector.presets;
  return labels[preset.id] ?? preset.id;
}

/** Seção Estilos: grade de miniaturas dos predefinidos; clicar aplica o estilo ao clipe. */
export function TextPresetGrid({ clipId }: TextPresetGridProps) {
  return (
    <Section title={t.text.presets}>
      <div className={styles.grid}>
        {TEXT_PRESETS.map((preset) => {
          const style = applyPreset(defaultTextStyle(), preset);
          const label = presetLabel(preset);
          return (
            <button
              key={preset.id}
              type="button"
              className={styles.tile}
              title={label}
              aria-label={label}
              onClick={() => applyTextPreset(clipId, preset.id)}
            >
              <span className={styles.sample} style={thumbStyle(style)} aria-hidden="true">
                {t.inspector.sampleText}
              </span>
            </button>
          );
        })}
      </div>
    </Section>
  );
}
