// Seção de transformação do inspetor: posição, escala (com cadeado), rotação e opacidade de um clipe visual.
import { useState } from 'react';
import { Link, RotateCcw, Unlink } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { resetClipTransform } from '@/stores/timelineCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import { updateClip } from '@/engine/timeline/clipOps';
import type { Clip, Transform } from '@/types';
import { NumberField } from './NumberField';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Propriedades de TransformSection. */
export interface TransformSectionProps {
  /** Clipe cuja transformação é editada. */
  clip: Clip;
  /** Tamanho do projeto em pixels; limita a posição X e Y. */
  canvas: { width: number; height: number };
}

/** Mescla campos na transformação do clipe; cada campo tem a sua chave de agrupamento, então arrastar vira um passo só. */
function patchTransform(clipId: string, key: string, patch: Partial<Transform>): void {
  useTimelineStore.getState().edit(
    'transform',
    (tracks) =>
      updateClip(tracks, clipId, (c) => ({ ...c, transform: { ...c.transform, ...patch } })),
    undefined,
    { coalesceKey: `inspector:${clipId}:${key}` },
  );
}

/** Seção Posição: X, Y, escala (uniforme ou separada), rotação, opacidade e redefinir. */
export function TransformSection({ clip, canvas }: TransformSectionProps) {
  const { transform } = clip;
  const [locked, setLocked] = useState(transform.scaleX === transform.scaleY);
  const uniformPercent = Math.round(transform.scaleX * 100);

  return (
    <Section title={t.inspector.transform}>
      <NumberField
        label={t.inspector.x}
        value={Math.round(transform.x)}
        min={-canvas.width}
        max={canvas.width}
        step={1}
        unit={t.inspector.unitPx}
        onChange={(value) => patchTransform(clip.id, 'x', { x: value })}
      />
      <NumberField
        label={t.inspector.y}
        value={Math.round(transform.y)}
        min={-canvas.height}
        max={canvas.height}
        step={1}
        unit={t.inspector.unitPx}
        onChange={(value) => patchTransform(clip.id, 'y', { y: value })}
      />
      {locked ? (
        <NumberField
          label={t.inspector.scale}
          value={uniformPercent}
          min={1}
          max={1000}
          step={1}
          unit={t.inspector.unitPercent}
          onChange={(value) => patchTransform(clip.id, 'scale', { scaleX: value / 100, scaleY: value / 100 })}
        />
      ) : (
        <>
          <NumberField
            label={t.inspector.scaleX}
            value={Math.round(transform.scaleX * 100)}
            min={1}
            max={1000}
            step={1}
            unit={t.inspector.unitPercent}
            onChange={(value) => patchTransform(clip.id, 'scaleX', { scaleX: value / 100 })}
          />
          <NumberField
            label={t.inspector.scaleY}
            value={Math.round(transform.scaleY * 100)}
            min={1}
            max={1000}
            step={1}
            unit={t.inspector.unitPercent}
            onChange={(value) => patchTransform(clip.id, 'scaleY', { scaleY: value / 100 })}
          />
        </>
      )}
      <NumberField
        label={t.inspector.rotation}
        value={Math.round(transform.rotation)}
        min={-360}
        max={360}
        step={1}
        unit={t.inspector.unitDegrees}
        onChange={(value) => patchTransform(clip.id, 'rotation', { rotation: value })}
      />
      <NumberField
        label={t.inspector.opacity}
        value={Math.round(transform.opacity * 100)}
        min={0}
        max={100}
        step={1}
        unit={t.inspector.unitPercent}
        onChange={(value) => patchTransform(clip.id, 'opacity', { opacity: value / 100 })}
      />
      <div className={sectionStyles.actions}>
        <button
          type="button"
          className={sectionStyles.action}
          aria-pressed={locked}
          aria-label={t.inspector.lockScale}
          title={t.inspector.lockScale}
          onClick={() => setLocked((value) => !value)}
        >
          {locked ? <Link size={14} aria-hidden="true" /> : <Unlink size={14} aria-hidden="true" />}
        </button>
        <button
          type="button"
          className={sectionStyles.action}
          onClick={() => resetClipTransform(clip.id)}
        >
          <RotateCcw size={14} aria-hidden="true" />
          {t.inspector.reset}
        </button>
      </div>
    </Section>
  );
}
