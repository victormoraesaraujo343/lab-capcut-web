// Seção Filtros do inspetor: intensidade, ajustes manuais e cores HSL de cada filtro de ajuste de cor do clipe.
import { useState } from 'react';
import { RotateCcw, Trash2 } from 'lucide-react';
import { IconButton } from '@/components/IconButton';
import { t } from '@/i18n/pt-BR';
import { COLOR_ADJUST_PARAMS, COLOR_ADJUST_TYPE } from '@/engine/render/filters/colorAdjust';
import { HUE_BANDS, hslParamKey, type HueBandId } from '@/engine/render/filters/colorMath';
import { createId } from '@/engine/project/createProject';
import { updateClip } from '@/engine/timeline/clipOps';
import { addFilter, removeEffect, setFilterIntensity } from '@/stores/effectCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Clip, EffectInstance, ParamValue } from '@/types';
import { EffectParamControl, lookupText, type TextGroup } from './EffectParamControl';
import { NumberField } from './NumberField';
import { Section } from './Section';
import sectionStyles from './Section.module.css';

/** Nomes dos predefinidos de filtro, pelo id (t.filters.names.sepia...). */
const FILTER_NAMES: TextGroup = t.filters.names;
/** Rótulos dos parâmetros de ajuste de cor, pela chave. */
const FILTER_PARAM_TEXTS: TextGroup = t.filters.params;

/** Parâmetros de ajuste básico (sem o HSL), na ordem da tela. */
const BASE_PARAMS = COLOR_ADJUST_PARAMS.filter((spec) => !spec.key.startsWith('hsl'));

/** Propriedades de FiltersSection. */
export interface FiltersSectionProps {
  /** Clipe cujos filtros são editados. */
  clip: Clip;
}

/** Valores neutros de todos os parâmetros do ajuste de cor. */
function neutralParams(): Record<string, ParamValue> {
  return Object.fromEntries(COLOR_ADJUST_PARAMS.map((spec) => [spec.key, spec.default]));
}

/** Zera os ajustes de um filtro numa só edição: parâmetros voltam ao neutro, some o predefinido e os keyframes dele. */
function resetFilter(clipId: string, instanceId: string): void {
  const prefix = `fx:${instanceId}:`;
  useTimelineStore.getState().edit('Redefinir filtro', (tracks) =>
    updateClip(tracks, clipId, (clip) => ({
      ...clip,
      filters: clip.filters.map((inst) => (inst.id === instanceId ? { ...inst, params: neutralParams() } : inst)),
      keyframes: Object.fromEntries(Object.entries(clip.keyframes).filter(([prop]) => !prop.startsWith(prefix))),
    })),
  );
}

/** Editor HSL: escolhe uma das 8 faixas (bolinhas coloridas) e ajusta matiz, saturação e luminosidade dela. */
function HslEditor({ clipId, instanceId, params }: { clipId: string; instanceId: string; params: EffectInstance['params'] }) {
  const [band, setBand] = useState<HueBandId>('red');
  const channels = [
    { channel: 'H', label: t.filters.hslH },
    { channel: 'S', label: t.filters.hslS },
    { channel: 'L', label: t.filters.hslL },
  ] as const;

  return (
    <>
      <div className={sectionStyles.actions} role="group" aria-label={t.filters.hsl}>
        {HUE_BANDS.map((item) => (
          <button
            key={item.id}
            type="button"
            aria-label={t.filters.bands[item.id]}
            aria-pressed={band === item.id}
            title={t.filters.bands[item.id]}
            onClick={() => setBand(item.id)}
            style={{
              width: 18,
              height: 18,
              padding: 0,
              borderRadius: '50%',
              cursor: 'pointer',
              backgroundColor: `hsl(${item.center} 70% 50%)`,
              border: band === item.id ? '2px solid var(--text)' : '1px solid var(--border)',
            }}
          />
        ))}
      </div>
      {channels.map(({ channel, label }) => {
        const spec = COLOR_ADJUST_PARAMS.find((item) => item.key === hslParamKey(band, channel));
        if (spec === undefined) return null;
        return (
          <EffectParamControl
            key={spec.key}
            clipId={clipId}
            instanceId={instanceId}
            spec={spec}
            value={params[spec.key]}
            label={label}
          />
        );
      })}
    </>
  );
}

/** Um filtro de ajuste de cor: nome, intensidade, ajustes manuais recolhíveis, HSL e remoção. */
function ColorAdjustCard({ clip, filter }: { clip: Clip; filter: EffectInstance }) {
  const presetId = typeof filter.params['presetId'] === 'string' ? filter.params['presetId'] : undefined;
  const presetName = presetId === undefined ? undefined : lookupText(FILTER_NAMES, presetId);
  const intensity = typeof filter.params['intensity'] === 'number' ? filter.params['intensity'] : 1;

  return (
    <div className={sectionStyles.stack}>
      <div className={sectionStyles.actions}>
        <span>{presetName ?? t.filters.adjust}</span>
        <IconButton icon={RotateCcw} label={t.filters.reset} onClick={() => resetFilter(clip.id, filter.id)} />
        <IconButton icon={Trash2} label={t.inspector.removeFilter} onClick={() => removeEffect(clip.id, filter.id)} />
      </div>
      <NumberField
        label={t.filters.intensity}
        value={Math.round(intensity * 100)}
        min={0}
        max={100}
        step={1}
        unit={t.inspector.unitPercent}
        onChange={(value) => setFilterIntensity(clip.id, filter.id, value / 100)}
      />
      <Section title={t.filters.adjust} defaultOpen={false}>
        {BASE_PARAMS.map((spec) => (
          <EffectParamControl
            key={spec.key}
            clipId={clip.id}
            instanceId={filter.id}
            spec={spec}
            value={filter.params[spec.key]}
            label={lookupText(FILTER_PARAM_TEXTS, spec.key) ?? spec.key}
          />
        ))}
      </Section>
      <Section title={t.filters.hsl} defaultOpen={false}>
        <HslEditor clipId={clip.id} instanceId={filter.id} params={filter.params} />
      </Section>
    </div>
  );
}

/** Seção Filtros: um cartão por filtro de ajuste de cor; sem filtro, botão para criar um ajuste manual. */
export function FiltersSection({ clip }: FiltersSectionProps) {
  const adjusts = clip.filters.filter((filter) => filter.type === COLOR_ADJUST_TYPE);

  return (
    <Section title={t.filters.title}>
      {adjusts.map((filter) => (
        <ColorAdjustCard key={filter.id} clip={clip} filter={filter} />
      ))}
      {adjusts.length === 0 && (
        <div className={sectionStyles.actions}>
          <button
            type="button"
            className={sectionStyles.action}
            onClick={() => addFilter(clip.id, { id: createId(), type: COLOR_ADJUST_TYPE, params: neutralParams() })}
          >
            {t.inspector.addManualFilter}
          </button>
        </div>
      )}
    </Section>
  );
}
