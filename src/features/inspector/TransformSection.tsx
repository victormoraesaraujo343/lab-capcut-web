// Seção de transformação do inspetor: posição, escala (com cadeado), rotação e opacidade, com keyframes e painel de curva.
import { useState } from 'react';
import { Link, RotateCcw, Unlink } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { resetClipTransform } from '@/stores/timelineCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import { updateClip } from '@/engine/timeline/clipOps';
import type { Clip, Transform } from '@/types';
import { KeyframeCurvePanel } from './KeyframeCurvePanel';
import type { KeyframeToggleProps } from './KeyframeToggle';
import { NumberField } from './NumberField';
import { Section } from './Section';
import sectionStyles from './Section.module.css';
import { useKeyframeProperty, type KeyframeProperty } from './useKeyframeProperty';

/** Propriedades de TransformSection. */
export interface TransformSectionProps {
  /** Clipe cuja transformação é editada. */
  clip: Clip;
  /** Tamanho do projeto em pixels; limita a posição X e Y. */
  canvas: { width: number; height: number };
}

/** Propriedade focada no painel de curva: nome da chave de keyframe e rótulo mostrado. */
interface CurveTarget {
  /** Chave da propriedade no mapa de keyframes do clipe. */
  property: string;
  /** Rótulo exibido acima do gráfico. */
  label: string;
}

/** Alvos de curva, com identidade estável para não re-renderizar à toa. */
const CURVE_X: CurveTarget = { property: 'x', label: t.inspector.x };
const CURVE_Y: CurveTarget = { property: 'y', label: t.inspector.y };
const CURVE_SCALE: CurveTarget = { property: 'scaleX', label: t.inspector.scale };
const CURVE_SCALE_X: CurveTarget = { property: 'scaleX', label: t.inspector.scaleX };
const CURVE_SCALE_Y: CurveTarget = { property: 'scaleY', label: t.inspector.scaleY };
const CURVE_ROTATION: CurveTarget = { property: 'rotation', label: t.inspector.rotation };
const CURVE_OPACITY: CurveTarget = { property: 'opacity', label: t.inspector.opacity };

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

/** Controle de keyframe de um campo; mexer nele marca o campo como foco do painel de curva. */
function keyframeControl(kf: KeyframeProperty, onTouch: () => void): KeyframeToggleProps {
  return {
    active: kf.onKeyframe,
    animated: kf.hasKeyframes,
    onToggle: () => {
      kf.toggle();
      onTouch();
    },
    onPrev: () => {
      kf.prev();
      onTouch();
    },
    onNext: () => {
      kf.next();
      onTouch();
    },
  };
}

/** Seção Posição: X, Y, escala (uniforme ou separada), rotação, opacidade e redefinir, com keyframes e curva. */
export function TransformSection({ clip, canvas }: TransformSectionProps) {
  const { transform } = clip;
  const [locked, setLocked] = useState(transform.scaleX === transform.scaleY);
  const [focus, setFocus] = useState<CurveTarget | null>(null);
  const x = useKeyframeProperty(clip.id, 'x', (v) => patchTransform(clip.id, 'x', { x: v }));
  const y = useKeyframeProperty(clip.id, 'y', (v) => patchTransform(clip.id, 'y', { y: v }));
  const scaleX = useKeyframeProperty(clip.id, 'scaleX', (v) => patchTransform(clip.id, 'scaleX', { scaleX: v }));
  const scaleY = useKeyframeProperty(clip.id, 'scaleY', (v) => patchTransform(clip.id, 'scaleY', { scaleY: v }));
  const rotation = useKeyframeProperty(clip.id, 'rotation', (v) =>
    patchTransform(clip.id, 'rotation', { rotation: v }),
  );
  const opacity = useKeyframeProperty(clip.id, 'opacity', (v) =>
    patchTransform(clip.id, 'opacity', { opacity: v }),
  );

  /** Escala travada: X e Y andam juntos; sem keyframes grava num passo só, com keyframes grava cada eixo no cursor. */
  const setLockedScale = (value: number, final: boolean): void => {
    const next = value / 100;
    if (scaleX.hasKeyframes || scaleY.hasKeyframes) {
      scaleX.setValue(next, final);
      scaleY.setValue(next, final);
    } else {
      patchTransform(clip.id, 'scale', { scaleX: next, scaleY: next });
    }
    setFocus(CURVE_SCALE);
  };

  /** Losango da escala travada: cria ou remove nos dois eixos, sem desfazer um eixo que já está certo. */
  const toggleLockedScale = (): void => {
    const add = !scaleX.onKeyframe;
    for (const axis of [scaleX, scaleY]) {
      if (axis.onKeyframe !== add) axis.toggle();
    }
    setFocus(CURVE_SCALE);
  };

  const lockedScaleKey: KeyframeToggleProps = {
    active: scaleX.onKeyframe,
    animated: scaleX.hasKeyframes || scaleY.hasKeyframes,
    onToggle: toggleLockedScale,
    onPrev: () => (scaleX.hasKeyframes ? scaleX : scaleY).prev(),
    onNext: () => (scaleX.hasKeyframes ? scaleX : scaleY).next(),
  };

  return (
    <Section title={t.inspector.transform}>
      <NumberField
        label={t.inspector.x}
        value={Math.round(x.value)}
        min={-canvas.width}
        max={canvas.width}
        step={1}
        unit={t.inspector.unitPx}
        onChange={(value, final) => {
          x.setValue(value, final);
          setFocus(CURVE_X);
        }}
        keyframe={keyframeControl(x, () => setFocus(CURVE_X))}
      />
      <NumberField
        label={t.inspector.y}
        value={Math.round(y.value)}
        min={-canvas.height}
        max={canvas.height}
        step={1}
        unit={t.inspector.unitPx}
        onChange={(value, final) => {
          y.setValue(value, final);
          setFocus(CURVE_Y);
        }}
        keyframe={keyframeControl(y, () => setFocus(CURVE_Y))}
      />
      {locked ? (
        <NumberField
          label={t.inspector.scale}
          value={Math.round(scaleX.value * 100)}
          min={1}
          max={1000}
          step={1}
          unit={t.inspector.unitPercent}
          onChange={setLockedScale}
          keyframe={lockedScaleKey}
        />
      ) : (
        <>
          <NumberField
            label={t.inspector.scaleX}
            value={Math.round(scaleX.value * 100)}
            min={1}
            max={1000}
            step={1}
            unit={t.inspector.unitPercent}
            onChange={(value, final) => {
              scaleX.setValue(value / 100, final);
              setFocus(CURVE_SCALE_X);
            }}
            keyframe={keyframeControl(scaleX, () => setFocus(CURVE_SCALE_X))}
          />
          <NumberField
            label={t.inspector.scaleY}
            value={Math.round(scaleY.value * 100)}
            min={1}
            max={1000}
            step={1}
            unit={t.inspector.unitPercent}
            onChange={(value, final) => {
              scaleY.setValue(value / 100, final);
              setFocus(CURVE_SCALE_Y);
            }}
            keyframe={keyframeControl(scaleY, () => setFocus(CURVE_SCALE_Y))}
          />
        </>
      )}
      <NumberField
        label={t.inspector.rotation}
        value={Math.round(rotation.value)}
        min={-360}
        max={360}
        step={1}
        unit={t.inspector.unitDegrees}
        onChange={(value, final) => {
          rotation.setValue(value, final);
          setFocus(CURVE_ROTATION);
        }}
        keyframe={keyframeControl(rotation, () => setFocus(CURVE_ROTATION))}
      />
      <NumberField
        label={t.inspector.opacity}
        value={Math.round(opacity.value * 100)}
        min={0}
        max={100}
        step={1}
        unit={t.inspector.unitPercent}
        onChange={(value, final) => {
          opacity.setValue(value / 100, final);
          setFocus(CURVE_OPACITY);
        }}
        keyframe={keyframeControl(opacity, () => setFocus(CURVE_OPACITY))}
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
      {focus !== null && <KeyframeCurvePanel clipId={clip.id} property={focus.property} label={focus.label} />}
    </Section>
  );
}
