// Testes do catálogo de figurinhas: 100 itens únicos, SVG válido, categorias e rótulos.
import { describe, expect, it } from 'vitest';
import { STICKER_CATEGORIES, STICKERS, findSticker } from '@/engine/stickers/stickerCatalog';
import { t } from '@/i18n/pt-BR';

describe('catálogo de figurinhas', () => {
  it('tem exatamente 100 figurinhas com ids únicos', () => {
    expect(STICKERS).toHaveLength(100);
    const ids = new Set(STICKERS.map((s) => s.id));
    expect(ids.size).toBe(100);
  });

  it('todo SVG começa com <svg, tem xmlns e viewBox, e não tem script', () => {
    for (const sticker of STICKERS) {
      const svg = sticker.svg();
      expect(svg.startsWith('<svg')).toBe(true);
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="0 0 256 256"');
      expect(svg.toLowerCase()).not.toContain('<script');
    }
  });

  it('usa só categorias válidas, todas do painel', () => {
    const valid = new Set(STICKER_CATEGORIES.map((c) => c.id));
    expect(valid.size).toBe(8);
    for (const sticker of STICKERS) expect(valid.has(sticker.category)).toBe(true);
  });

  it('tem rótulo em pt-BR para cada figurinha', () => {
    const names: Record<string, string> = t.stickers.names;
    for (const sticker of STICKERS) {
      expect(names[sticker.labelKey]).toBeTruthy();
    }
  });

  it('acha figurinha pelo id e devolve undefined para id desconhecido', () => {
    expect(findSticker('heart')?.category).toBe('emotions');
    expect(findSticker('nao-existe')).toBeUndefined();
  });
});
