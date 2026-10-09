// Seção Sobreposição do inspetor: tipo, mistura e parâmetros do tipo registrado; cada mudança vai para updateOverlay.
import { ensureEffectsRegistered } from '@/engine/render/registerAll';
import { getEffect, type EffectParamSpec } from '@/engine/render/registry';
import { t } from '@/i18n/pt-BR';
import { updateOverlay } from '@/stores/overlayCommands';
import type { Clip, OverlayData, ParamValue } from '@/types';
import { ColorField } from './ColorField';
import { lookupText, type TextGroup } from './EffectParamControl';
import { NumberField } from './NumberField';
import fieldStyles from './NumberField.module.css';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Modos de mistura na ordem do seletor. */
const BLEND_OPTIONS: readonly OverlayData['blend'][] = ['screen', 'add', 'normal'];
/** Rótulos dos modos de mistura. */
const BLEND_TEXTS: TextGroup = t.overlays.blends;
/** Rótulos dos parâmetros de sobreposição, pela chave. */
const PARAM_TEXTS: TextGroup = t.overlays.params;
/** Nomes dos tipos de sobreposição. */
const OVERLAY_NAMES: TextGroup = t.overlays.names;

/** Propriedades de OverlayParam. */
interface OverlayParamProps {
  /** Especificação do parâmetro no registro. */
  spec: EffectParamSpec;
  /** Valor salvo no clipe; ausente usa o padrão. */
  value: ParamValue | undefined;
  /** Recebe o novo valor. */
  onChange: (next: ParamValue) => void;
}

/** Controle de um parâmetro de sobreposição: número, liga/desliga, cor ou lista. */
function OverlayParam({ spec, value, onChange }: OverlayParamProps) {
  const label = lookupText(PARAM_TEXTS, spec.key) ?? spec.key;
  const current = value ?? spec.default;

  if (spec.type === 'number') {
    return (
      <NumberField
        label={label}
        value={typeof current === 'number' ? current : Number(spec.default)}
        min={spec.min ?? 0}
        max={spec.max ?? 1}
        step={spec.step ?? 0.01}
        onChange={(next) => onChange(next)}
      />
    );
  }

  if (spec.type === 'boolean') {
    return (
      <div className={fieldStyles.row}>
        <span className={fieldStyles.label}>{label}</span>
        <input
          type="checkbox"
          aria-label={label}
          checked={current === true}
          onChange={(event) => onChange(event.target.checked)}
        />
      </div>
    );
  }

  if (spec.type === 'color') {
    return (
      <ColorField
        label={label}
        value={typeof current === 'string' ? current : String(spec.default)}
        onChange={(next) => onChange(next)}
      />
    );
  }

  return (
    <div className={fieldStyles.row}>
      <span className={fieldStyles.label}>{label}</span>
      <select
        className={sectionStyles.select}
        aria-label={label}
        value={String(current)}
        onChange={(event) => onChange(event.target.value)}
        style={{ gridColumn: 'span 2' }}
      >
        {(spec.options ?? []).map((option) => (
          <option key={option} value={option}>
            {option}
          </option>
        ))}
      </select>
    </div>
  );
}

/** Propriedades de OverlaySection. */
export interface OverlaySectionProps {
  /** Clipe de sobreposição (com a propriedade overlay). */
  clip: Clip;
}

/** Seção Sobreposição: tipo, mistura com o que está embaixo e os parâmetros do tipo; limites vêm do registro. */
export function OverlaySection({ clip }: OverlaySectionProps) {
  const overlay = clip.overlay;
  ensureEffectsRegistered();
  if (overlay === undefined) return null;
  const def = getEffect(overlay.type);
  const typeName = lookupText(OVERLAY_NAMES, overlay.type) ?? overlay.type;
  const blendLabel = t.overlays.blend;

  return (
    <Section title={t.overlays.title}>
      <div className={fieldStyles.row}>
        <span className={fieldStyles.label}>{t.overlays.type}</span>
        <span>{typeName}</span>
      </div>
      <div className={fieldStyles.row}>
        <span className={fieldStyles.label}>{blendLabel}</span>
        <select
          className={sectionStyles.select}
          aria-label={blendLabel}
          value={overlay.blend}
          onChange={(event) => {
            const next = BLEND_OPTIONS.find((option) => option === event.target.value);
            if (next !== undefined) updateOverlay(clip.id, { blend: next });
          }}
          style={{ gridColumn: 'span 2' }}
        >
          {BLEND_OPTIONS.map((option) => (
            <option key={option} value={option}>
              {lookupText(BLEND_TEXTS, option) ?? option}
            </option>
          ))}
        </select>
      </div>
      {(def?.params ?? []).map((spec) => (
        <OverlayParam
          key={spec.key}
          spec={spec}
          value={overlay.params[spec.key]}
          onChange={(next) => updateOverlay(clip.id, { params: { [spec.key]: next } })}
        />
      ))}
    </Section>
  );
}
