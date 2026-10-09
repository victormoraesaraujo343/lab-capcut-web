// Seção Forma do inspetor: tipo (só leitura), preenchimento, contorno, espessura, tamanho e arredondamento; cada mudança vai para updateShape.
import { t } from '@/i18n/pt-BR';
import { updateShape } from '@/stores/shapeCommands';
import type { Clip, ShapeData } from '@/types';
import { ColorField } from './ColorField';
import { NumberField } from './NumberField';
import fieldStyles from './NumberField.module.css';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Cor que significa 'sem preenchimento'. */
const NO_FILL = 'transparent';

/** Propriedades de ShapeSection. */
export interface ShapeSectionProps {
  /** Clipe de forma (com a propriedade shape). */
  clip: Clip;
}

/** Seção Forma: edita as cores, a espessura do contorno, o tamanho e o arredondamento de um clipe de forma. */
export function ShapeSection({ clip }: ShapeSectionProps) {
  const shape = clip.shape;
  if (shape === undefined) return null;
  const set = (patch: Partial<ShapeData>): void => updateShape(clip.id, patch);
  const hasHeight = shape.shape !== 'arrow' && shape.shape !== 'line';
  const hasRadius = shape.shape === 'rectangle';

  return (
    <Section title={t.shapes.title}>
      <div className={fieldStyles.row}>
        <span className={fieldStyles.label}>{t.shapes.type}</span>
        <span>{t.shapes[shape.shape]}</span>
      </div>
      <ColorField label={t.shapes.fill} value={shape.fill} onChange={(value) => set({ fill: value })} />
      <div className={sectionStyles.actions} role="group" aria-label={t.shapes.fill}>
        <button
          type="button"
          className={sectionStyles.action}
          aria-pressed={shape.fill === NO_FILL}
          onClick={() => set({ fill: NO_FILL })}
        >
          {t.shapes.none}
        </button>
      </div>
      <ColorField label={t.shapes.stroke} value={shape.stroke} onChange={(value) => set({ stroke: value })} />
      <NumberField
        label={t.shapes.strokeWidth}
        value={shape.strokeWidth}
        min={0}
        max={60}
        step={1}
        onChange={(next) => set({ strokeWidth: next })}
      />
      <NumberField
        label={t.shapes.width}
        value={shape.width}
        min={20}
        max={3840}
        step={1}
        onChange={(next) => set({ width: next })}
      />
      {hasHeight ? (
        <NumberField
          label={t.shapes.height}
          value={shape.height}
          min={20}
          max={2160}
          step={1}
          onChange={(next) => set({ height: next })}
        />
      ) : null}
      {hasRadius ? (
        <NumberField
          label={t.shapes.cornerRadius}
          value={shape.cornerRadius}
          min={0}
          max={200}
          step={1}
          onChange={(next) => set({ cornerRadius: next })}
        />
      ) : null}
    </Section>
  );
}
