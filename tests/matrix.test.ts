// Testes puros das matrizes de camada: contain, cantos, rotação, deslocamento, recorte e UV.
import { describe, expect, it } from 'vitest';
import {
  containSize,
  cropUvRect,
  layerCorners,
  layerMatrix,
  multiply3,
  transformPoint3,
} from '@/engine/render/matrix';
import { defaultTransform, type Layer, type Transform } from '@/types';

/** Cria uma camada de teste 1920x1080 com a transformação dada. */
function makeLayer(transform: Partial<Transform> = {}): Layer {
  return {
    clipId: 'c1',
    kind: 'video',
    mediaTimeMs: 0,
    localTimeMs: 0,
    transform: { ...defaultTransform(), ...transform },
    sourceWidth: 1920,
    sourceHeight: 1080,
    filters: [],
    effects: [],
    zIndex: 0,
    playbackRate: 1,
  };
}

/** Confere se dois cantos batem com a precisão de décimos de pixel. */
function expectCorner(actual: [number, number], expected: [number, number]): void {
  expect(actual[0]).toBeCloseTo(expected[0], 1);
  expect(actual[1]).toBeCloseTo(expected[1], 1);
}

describe('containSize', () => {
  it('encaixa vídeo 16:9 num quadro 9:16 mantendo a proporção', () => {
    const size = containSize(1920, 1080, 1080, 1920);
    expect(size.width).toBeCloseTo(1080);
    expect(size.height).toBeCloseTo(607.5);
  });
});

describe('multiply3 e transformPoint3', () => {
  it('identidade não altera o ponto e translação desloca', () => {
    const identity = new Float32Array([1, 0, 0, 0, 1, 0, 0, 0, 1]);
    const move = new Float32Array([1, 0, 0, 0, 1, 0, 5, -3, 1]);
    expect(transformPoint3(multiply3(identity, identity), 2, 4)).toEqual([2, 4]);
    expect(transformPoint3(move, 1, 1)).toEqual([6, -2]);
  });
});

describe('layerCorners', () => {
  it('sem transformação, o retângulo fica centralizado no quadro', () => {
    const corners = layerCorners(makeLayer(), 1080, 1920);
    expectCorner(corners[0] ?? [0, 0], [0, 656.25]);
    expectCorner(corners[1] ?? [0, 0], [1080, 656.25]);
    expectCorner(corners[2] ?? [0, 0], [1080, 1263.75]);
    expectCorner(corners[3] ?? [0, 0], [0, 1263.75]);
  });

  it('rotação de 90 graus troca a largura e a altura do retângulo', () => {
    const corners = layerCorners(makeLayer({ rotation: 90 }), 1080, 1920);
    const xs = corners.map((p) => p[0]);
    const ys = corners.map((p) => p[1]);
    expect(Math.max(...xs) - Math.min(...xs)).toBeCloseTo(607.5);
    expect(Math.max(...ys) - Math.min(...ys)).toBeCloseTo(1080);
    expectCorner(corners[0] ?? [0, 0], [843.75, 420]);
  });

  it('x = 100 desloca todos os cantos 100 px para a direita', () => {
    const base = layerCorners(makeLayer(), 1080, 1920);
    const moved = layerCorners(makeLayer({ x: 100 }), 1080, 1920);
    base.forEach((p, i) => {
      expectCorner(moved[i] ?? [0, 0], [p[0] + 100, p[1]]);
    });
  });

  it('crop left de 0.5 deixa só a metade direita', () => {
    const corners = layerCorners(
      makeLayer({ crop: { top: 0, right: 0, bottom: 0, left: 0.5 } }),
      1080,
      1920,
    );
    expectCorner(corners[0] ?? [0, 0], [540, 656.25]);
    expectCorner(corners[1] ?? [0, 0], [1080, 656.25]);
    expectCorner(corners[2] ?? [0, 0], [1080, 1263.75]);
    expectCorner(corners[3] ?? [0, 0], [540, 1263.75]);
  });
});

describe('layerMatrix', () => {
  it('leva o centro do quadro ao centro do espaço de recorte', () => {
    const m = layerMatrix(makeLayer(), 1080, 1920);
    const [cx, cy] = transformPoint3(m, 0, 0);
    expect(cx).toBeCloseTo(0);
    expect(cy).toBeCloseTo(0);
  });
});

describe('cropUvRect', () => {
  it('devolve a faixa não cortada da textura', () => {
    expect(cropUvRect({ top: 0, right: 0, bottom: 0, left: 0.5 })).toEqual([0.5, 0, 1, 1]);
    expect(cropUvRect({ top: 0.1, right: 0.2, bottom: 0.3, left: 0 })).toEqual([0, 0.1, 0.8, 0.7]);
  });
});
