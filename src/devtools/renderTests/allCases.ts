// Lista completa de casos da bateria de render, na ordem de exibição: base, geradores por registro, extras, cobertura e combinações.
import { registerEffects } from '@/engine/render/effects';
import { FILTER_PRESETS, presetToFilter, registerFilters } from '@/engine/render/filters';
import { defaultParams, listEffects, type EffectDefinition, type EffectParamSpec } from '@/engine/render/registry';
import { registerTransitions } from '@/engine/render/transitions';
import type { ParamValue } from '@/types';
import {
  GREEN,
  GRADIENT,
  SOURCES,
  VIDEO_TRACK,
  baseSemEfeito,
  baseTexto,
  baseTransformacao,
  buildProject,
  makeTrack,
  speedConstante,
  speedCurvaHero,
  videoClip,
  type RenderCase,
} from './cases';
import { createSyntheticProvider } from './sources';
import { extraCases } from './casesExtra';
import { coverageCases } from './casesCoverage';
import { comboCases } from './casesCombos';
import { stage9Cases } from './casesStage9';

/** Transforma um id livre numa chave segura para nome de arquivo. */
function safeId(raw: string): string {
  return raw.replace(/[^\w-]/g, '_');
}

/** Valor de um parâmetro não neutro: nunca o padrão, para o efeito aparecer no teste. */
function nonNeutralValue(spec: EffectParamSpec): ParamValue {
  if (spec.type === 'boolean') return !spec.default;
  if (spec.type === 'select') {
    const options = spec.options ?? [];
    const last = options[options.length - 1];
    if (last !== undefined && last !== spec.default) return last;
    return options[0] ?? String(spec.default);
  }
  if (spec.type === 'number') {
    const min = spec.min;
    const max = spec.max;
    if (min === undefined || max === undefined) return Number(spec.default) + 1;
    const candidate = min + (max - min) * 0.7;
    const value = candidate === Number(spec.default) ? min + (max - min) * 0.3 : candidate;
    return spec.step ? Math.round(value / spec.step) * spec.step : value;
  }
  return spec.default;
}

/** Parâmetros do efeito com valores não neutros (cores ficam no padrão, para o chroma key ainda pegar o verde). */
function nonNeutralParams(def: EffectDefinition): Record<string, ParamValue> {
  const params = defaultParams(def.type);
  for (const spec of def.params) {
    params[spec.key] = nonNeutralValue(spec);
  }
  return params;
}


/** Um caso por efeito registrado: clipe com parâmetros não neutros, sobre a fonte adequada. */
export function effectCases(): RenderCase[] {
  registerEffects();
  return listEffects('effect').map((def) => {
    const keyed = /chroma|key|green|matte|background/i.test(def.type);
    const asset = keyed ? GREEN : GRADIENT;
    return {
      id: safeId(`effect-${def.type}`),
      build: () => {
        const clip = videoClip(asset, 2000, 0, {
          effects: [{ id: `fx-${def.type}`, type: def.type, params: nonNeutralParams(def) }],
        });
        return {
          project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GRADIENT, GREEN]),
          timeMs: 500,
          provider: createSyntheticProvider(SOURCES),
          expectedMediaTimeMs: 500,
        };
      },
    };
  });
}

/** Um caso por transição: corte em 2000 ms; a transição (1000 ms) fica no clipe que SAI e é centrada no corte, então em 2000 ms o progresso é 0,5. */
export function transitionCases(): RenderCase[] {
  registerTransitions();
  return listEffects('transition').map((def) => ({
    id: safeId(`transition-${def.type}`),
    build: () => {
      const outgoing = videoClip(GRADIENT, 2000, 0, {
        transitionOut: { type: def.type, durationMs: 1000, params: nonNeutralParams(def) },
      });
      const incoming = videoClip(GREEN, 2000, 2000);
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [outgoing, incoming])], [GRADIENT, GREEN]),
        timeMs: 2000,
        provider: createSyntheticProvider(SOURCES),
      };
    },
  }));
}

/** Um caso por filtro pronto (FILTER_PRESETS), aplicado na intensidade padrão sobre o gradiente. */
export function filterCases(): RenderCase[] {
  registerFilters();
  return FILTER_PRESETS.map((preset) => ({
    id: safeId(`filter-${preset.id}`),
    build: () => {
      const clip = videoClip(GRADIENT, 2000, 0, { filters: [presetToFilter(preset.id)] });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GRADIENT]),
        timeMs: 500,
        provider: createSyntheticProvider(SOURCES),
        expectedMediaTimeMs: 500,
      };
    },
  }));
}

/** Casos da bateria, na ordem de exibição: base, efeitos, transições, filtros, extras, cobertura e combinações. */
export const RENDER_CASES: RenderCase[] = [
  baseSemEfeito(),
  baseTransformacao(),
  baseTexto(),
  speedConstante(),
  speedCurvaHero(),
  ...effectCases(),
  ...transitionCases(),
  ...filterCases(),
  ...extraCases(),
  ...coverageCases(),
  ...comboCases(),
  ...stage9Cases(),
];
