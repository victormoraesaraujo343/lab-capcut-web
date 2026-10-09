// Testes puros da geometria das formas: tamanho com contorno, pontos da seta e caminho do retângulo arredondado.
import { describe, expect, it } from 'vitest';
import { arrowPoints, roundedRectCommands, shapeCanvasSize } from '../src/engine/shapes/shapeGeometry';
import type { ShapeData } from '../src/types/project';

/** Forma de teste com os campos dados sobre um retângulo padrão sem contorno. */
function makeShape(overrides: Partial<ShapeData> = {}): ShapeData {
  return { shape: 'rectangle', width: 600, height: 340, cornerRadius: 24, fill: '#22d3ee', stroke: '#ffffff', strokeWidth: 0, ...overrides };
}

describe('shapeCanvasSize', () => {
  it('retângulo sem contorno ocupa exatamente o seu tamanho', () => {
    expect(shapeCanvasSize(makeShape())).toEqual({ width: 600, height: 340, pad: 0 });
  });

  it('o contorno soma metade da espessura em cada lado', () => {
    expect(shapeCanvasSize(makeShape({ strokeWidth: 20 }))).toEqual({ width: 620, height: 360, pad: 10 });
  });

  it('metade do contorno é arredondada para cima', () => {
    expect(shapeCanvasSize(makeShape({ strokeWidth: 5 })).pad).toBe(3);
  });

  it('elipse usa largura e altura próprias', () => {
    expect(shapeCanvasSize(makeShape({ shape: 'circle', width: 400, height: 200 }))).toEqual({ width: 400, height: 200, pad: 0 });
  });

  it('seta: comprimento em width e altura igual a max(contorno × 3, 40) mais a margem', () => {
    expect(shapeCanvasSize(makeShape({ shape: 'arrow', width: 600, height: 0, strokeWidth: 18 }))).toEqual({ width: 618, height: 72, pad: 9 });
  });

  it('seta sem contorno tem altura mínima de 40 px', () => {
    expect(shapeCanvasSize(makeShape({ shape: 'arrow', width: 300, height: 0, strokeWidth: 0 }))).toEqual({ width: 300, height: 40, pad: 0 });
  });

  it('linha tem a mesma caixa da seta, com a altura mínima de 40 px', () => {
    expect(shapeCanvasSize(makeShape({ shape: 'line', width: 600, height: 0, strokeWidth: 12 }))).toEqual({ width: 612, height: 52, pad: 6 });
  });

  it('valores inválidos não quebram o tamanho (mínimo de 1 px)', () => {
    const size = shapeCanvasSize(makeShape({ width: Number.NaN, height: -5, strokeWidth: Number.NaN }));
    expect(size).toEqual({ width: 1, height: 1, pad: 0 });
  });
});

describe('arrowPoints', () => {
  it('monta o corpo e a ponta como um polígono de 7 pontos', () => {
    expect(arrowPoints(100, 40)).toHaveLength(7);
  });

  it('a ponta termina em (comprimento, meio da espessura)', () => {
    expect(arrowPoints(100, 40)[3]).toEqual([100, 20]);
  });

  it('a ponta começa exatamente a 48 px do fim (1,2 × espessura), e o corpo fica dentro da caixa', () => {
    const points = arrowPoints(100, 40);
    expect(points[1]?.[0]).toBe(52);
    for (const [x, y] of points) {
      expect(x).toBeGreaterThanOrEqual(0);
      expect(x).toBeLessThanOrEqual(100);
      expect(y).toBeGreaterThanOrEqual(0);
      expect(y).toBeLessThanOrEqual(40);
    }
  });

  it('em seta curta, a ponta não passa da metade do comprimento', () => {
    const points = arrowPoints(20, 40);
    expect(points[1]?.[0]).toBe(10);
  });
});

describe('roundedRectCommands', () => {
  it('começa com movimento, termina fechando e tem quatro arcos', () => {
    const commands = roundedRectCommands(0, 0, 100, 50, 10);
    expect(commands[0]).toEqual({ type: 'move', x: 10, y: 0 });
    expect(commands[commands.length - 1]).toEqual({ type: 'close' });
    expect(commands.filter((c) => c.type === 'arc')).toHaveLength(4);
  });

  it('limita o raio à metade do menor lado', () => {
    const arcs = roundedRectCommands(0, 0, 100, 40, 999).filter((c) => c.type === 'arc');
    for (const arc of arcs) {
      expect(arc.type === 'arc' ? arc.radius : -1).toBe(20);
    }
  });

  it('raio 0 vira canto reto: os arcos têm raio 0', () => {
    const arcs = roundedRectCommands(0, 0, 100, 40, 0).filter((c) => c.type === 'arc');
    expect(arcs.every((arc) => arc.type === 'arc' && arc.radius === 0)).toBe(true);
  });

  it('o canto de baixo à direita é desenhado a partir da borda inferior-direita', () => {
    const commands = roundedRectCommands(5, 5, 100, 50, 10);
    expect(commands[3]).toEqual({ type: 'line', x: 105, y: 45 });
  });
});
