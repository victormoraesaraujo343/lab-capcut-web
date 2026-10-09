// Testes dos construtores de SVG de figurinhas: ícones do lucide, formas, decorativos e escape.
import { describe, expect, it } from 'vitest';
import { badge, escapeXml, hasIcon, speechBubble, textBadge, wrapSvg } from '@/engine/stickers/stickerArt';

describe('stickerArt', () => {
  it('badge com ícone conhecido contém os paths do lucide', () => {
    const svg = badge('heart', { shape: 'circle', bg: '#ff3d7f', fg: '#ffffff' });
    expect(svg).toContain('M2 9.5a5.5 5.5 0 0 1 9.591-3.676');
    expect(svg).toContain('<circle');
    expect(svg).toContain('feDropShadow');
    expect(svg.startsWith('<svg')).toBe(true);
  });

  it('badge com ícone desconhecido ainda gera a forma sem o ícone', () => {
    const svg = badge('nao-existe', { shape: 'roundedSquare', bg: '#000000', fg: '#ffffff' });
    expect(svg).toContain('<rect');
    expect(svg).not.toContain('translate(58 58)');
  });

  it('badge preenchido usa a cor do ícone como fill e o traço fica no fg', () => {
    const svg = badge('star', { shape: 'none', bg: '#000000', fg: '#ff0000', filled: true });
    expect(svg).toContain('fill="#ff0000"');
    expect(svg).toContain('stroke="#ff0000"');
  });

  it('hasIcon reconhece ícones da biblioteca', () => {
    expect(hasIcon('heart')).toBe(true);
    expect(hasIcon('nao-existe')).toBe(false);
  });

  it('escapa texto e atributos para não quebrar o SVG', () => {
    expect(escapeXml('<a href="x">&\'</a>')).toBe('&lt;a href=&quot;x&quot;&gt;&amp;&apos;&lt;/a&gt;');
    const svg = textBadge('<script>', '#ffffff', '#000000');
    expect(svg).not.toContain('<script>');
    expect(svg).toContain('&lt;script&gt;');
  });

  it('decorativos são SVG completos com xmlns e viewBox', () => {
    for (const svg of [speechBubble('#ffffff', '#000000'), textBadge('UAU!', '#ffd000', '#111111', true)]) {
      expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
      expect(svg).toContain('viewBox="0 0 256 256"');
    }
    expect(wrapSvg('<g/>')).toContain('<g/>');
  });
});
