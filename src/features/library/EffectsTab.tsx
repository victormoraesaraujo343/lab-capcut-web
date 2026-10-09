// Aba Efeitos: grade de efeitos; clicar aplica o efeito no clipe visual selecionado (Remover fundo fica só no inspetor).

import { useMemo } from 'react';
import { ensureEffectsRegistered } from '@/engine/render/registerAll';
import { listEffects, type EffectDefinition } from '@/engine/render/registry';
import { t } from '@/i18n/pt-BR';
import { addEffect } from '@/stores/effectCommands';
import { effectThumbnail } from './itemThumbnails';
import { ItemGrid, ItemThumb, useSelectedVisualClip, type GridItem } from './ItemGrid';

/** Efeito com ação própria no inspetor, que fica fora da grade. */
const EXCLUDED_EFFECT = 'removeBackground';

/** Nomes de exibição dos efeitos, por tipo; o tipo vale como nome se não houver tradução. */
const EFFECT_NAMES: Record<string, unknown> = t.effects;

/** Nome de exibição de um efeito pelo tipo. */
function effectName(type: string): string {
  const name = EFFECT_NAMES[type];
  return typeof name === 'string' ? name : type;
}

/** Aba Efeitos: grade de efeitos que se aplicam ao clipe visual selecionado. */
export function EffectsTab() {
  const selected = useSelectedVisualClip();
  const definitions = useMemo<EffectDefinition[]>(() => {
    ensureEffectsRegistered();
    return listEffects('effect').filter((def) => def.type !== EXCLUDED_EFFECT);
  }, []);

  const clipId = selected?.clip.id ?? null;
  const items: GridItem[] = definitions.map((def) => {
    const { Icon, background } = effectThumbnail(def.type);
    return {
      id: def.type,
      name: effectName(def.type),
      thumbnail: (
        <ItemThumb background={background}>
          <Icon size={26} strokeWidth={1.5} aria-hidden="true" />
        </ItemThumb>
      ),
      disabled: clipId === null,
      onActivate: () => {
        if (clipId !== null) addEffect(clipId, def.type);
      },
    };
  });

  return (
    <ItemGrid
      items={items}
      label={t.library.tabs.effects}
      notice={clipId === null ? t.library.selectClipFirst : undefined}
    />
  );
}
