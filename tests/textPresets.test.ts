// Testes puros dos estilos prontos de texto: quantidade, ids, fontes embutidas e aplicação sobre o estilo base.
import { describe, expect, it } from 'vitest';
import { CAPTION_PRESET_ID, TEXT_PRESETS, applyPreset } from '@/engine/text/textPresets';
import { TEXT_ANIMATIONS } from '@/engine/text/textAnimations';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';

/** Fontes embutidas no app (public/fonts). */
const EMBEDDED_FONTS = new Set<string>([
  'Inter',
  'Roboto',
  'Space Grotesk',
  'Michroma',
  'Comic Relief',
  'JetBrains Mono',
  'Gelasio',
  'Ubuntu',
  'DejaVu Sans',
  'Liberation Serif',
  'Noto Serif',
  'Caladea',
]);

describe('TEXT_PRESETS', () => {
  it('tem 20 estilos com ids únicos', () => {
    expect(TEXT_PRESETS).toHaveLength(20);
    const ids = new Set(TEXT_PRESETS.map((p) => p.id));
    expect(ids.size).toBe(20);
  });

  it('usa só fontes embutidas', () => {
    for (const preset of TEXT_PRESETS) {
      const family = preset.style.fontFamily;
      if (family !== undefined) expect(EMBEDDED_FONTS.has(family)).toBe(true);
    }
  });

  it('animações sugeridas existem no registro de animações de entrada', () => {
    const inTypes = new Set(TEXT_ANIMATIONS.filter((d) => d.kind === 'in').map((d) => d.type));
    for (const preset of TEXT_PRESETS) {
      if (preset.animationIn) expect(inTypes.has(preset.animationIn.type)).toBe(true);
    }
  });

  it('o estilo de legenda padrão existe na lista', () => {
    expect(TEXT_PRESETS.some((p) => p.id === CAPTION_PRESET_ID)).toBe(true);
  });
});

describe('applyPreset', () => {
  it('sobrescreve só os campos do estilo pronto e mantém o resto do base', () => {
    const base = defaultTextStyle();
    const preset = TEXT_PRESETS.find((p) => p.id === 'classic-outline');
    expect(preset).toBeDefined();
    if (!preset) return;
    const result = applyPreset(base, preset);
    expect(result.strokeWidth).toBe(6);
    expect(result.strokeColor).toBe('#000000');
    expect(result.fontSize).toBe(base.fontSize);
    expect(result.align).toBe(base.align);
  });

  it('não altera o estilo base', () => {
    const base = defaultTextStyle();
    const snapshot = JSON.stringify(base);
    const preset = TEXT_PRESETS[0];
    if (!preset) throw new Error('lista de estilos vazia');
    applyPreset(base, preset);
    expect(JSON.stringify(base)).toBe(snapshot);
  });
});
