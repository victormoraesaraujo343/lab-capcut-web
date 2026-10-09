// Aba Filtros: os 25 filtros prontos; clicar põe o filtro no clipe visual selecionado, trocando o predefinido anterior.

import { useMemo } from 'react';
import { FILTER_PRESETS, presetToFilter } from '@/engine/render/filters/filterPresets';
import { t } from '@/i18n/pt-BR';
import { addFilter, removeEffect } from '@/stores/effectCommands';
import type { Clip } from '@/types';
import { filterThumbnailBackground } from './itemThumbnails';
import { ItemGrid, ItemThumb, useSelectedVisualClip, type GridItem } from './ItemGrid';

/** Nomes de exibição dos filtros, por id. */
const FILTER_NAMES: Partial<Record<string, string>> = t.filters.names;

/** Põe um filtro pronto no clipe, tirando antes o filtro pronto anterior (reconhecido pelo presetId guardado nos parâmetros). */
function applyPreset(clip: Clip, presetId: string): void {
  for (const filter of clip.filters) {
    if (typeof filter.params['presetId'] === 'string') removeEffect(clip.id, filter.id);
  }
  addFilter(clip.id, presetToFilter(presetId));
}

/** Aba Filtros: grade dos 25 filtros prontos, aplicados ao clipe visual selecionado. */
export function FiltersTab() {
  const selected = useSelectedVisualClip();
  const backgrounds = useMemo(
    () =>
      new Map<string, string>(
        FILTER_PRESETS.map((preset): [string, string] => [preset.id, filterThumbnailBackground(preset.id)]),
      ),
    [],
  );

  const items: GridItem[] = FILTER_PRESETS.map((preset) => {
    const clip = selected?.clip ?? null;
    return {
      id: preset.id,
      name: FILTER_NAMES[preset.id] ?? preset.id,
      thumbnail: <ItemThumb background={backgrounds.get(preset.id) ?? 'transparent'} />,
      disabled: clip === null,
      onActivate: () => {
        if (clip !== null) applyPreset(clip, preset.id);
      },
    };
  });

  return (
    <ItemGrid
      items={items}
      label={t.library.tabs.filters}
      notice={selected === null ? t.library.selectClipFirst : undefined}
    />
  );
}
