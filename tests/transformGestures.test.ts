// Testes puros dos gestos da prévia: escala de exibição, mover, escala, giro, encaixe, escolha de camada e cursor.
import { describe, expect, it, vi } from 'vitest';
import {
  cornerCursor,
  hitTestLayers,
  moveTransform,
  rotateAround,
  scaleFromCorner,
  screenToProject,
  snapToCenter,
} from '@/features/preview/transformGestures';
import { measureLayers } from '@/features/preview/measuredLayers';
import { defaultTransform, type Layer, type Transform } from '@/types';

vi.mock('@/engine/text/textRasterizer', () => ({
  createTextRasterizer: (): { measure: () => { width: number; height: number }; rasterize: () => never; dispose: () => void } => ({
    measure: () => ({ width: 320, height: 120 }),
    rasterize: (): never => {
      throw new Error('não usado nos testes de medida');
    },
    dispose: (): void => undefined,
  }),
}));

/** Cria uma camada de teste 1920x1080 com a transformação dada e o zIndex informado. */
function makeLayer(clipId: string, zIndex: number, transform: Partial<Transform> = {}): Layer {
  return {
    clipId,
    kind: 'image',
    mediaTimeMs: 0,
    localTimeMs: 0,
    transform: { ...defaultTransform(), ...transform },
    sourceWidth: 1920,
    sourceHeight: 1080,
    filters: [],
    effects: [],
    zIndex,
    playbackRate: 1,
    fit: 'contain',
  };
}

describe('screenToProject e moveTransform', () => {
  it('converte pixels da tela com escala de exibição 0.5 e move em px do projeto', () => {
    const [dx] = screenToProject(10, 0, 0.5);
    expect(dx).toBeCloseTo(20);
    const moved = moveTransform(defaultTransform(), dx, 0);
    expect(moved.x).toBeCloseTo(20);
    expect(moved.y).toBe(0);
  });
});

describe('scaleFromCorner', () => {
  it('uniforme dobra a escala quando a distância ao centro dobra', () => {
    const t = scaleFromCorner(defaultTransform(), [0, 0], [100, 100], [200, 200], true);
    expect(t.scaleX).toBeCloseTo(2);
    expect(t.scaleY).toBeCloseTo(2);
  });

  it('livre (Shift) escala só o eixo que mudou', () => {
    const t = scaleFromCorner(defaultTransform(), [0, 0], [100, 100], [200, 100], false);
    expect(t.scaleX).toBeCloseTo(2);
    expect(t.scaleY).toBeCloseTo(1);
  });

  it('nunca desce abaixo de 0.05', () => {
    const t = scaleFromCorner(defaultTransform(), [0, 0], [100, 100], [0, 0], true);
    expect(t.scaleX).toBeCloseTo(0.05);
    expect(t.scaleY).toBeCloseTo(0.05);
  });
});

describe('rotateAround', () => {
  it('gira 90 graus quando o ponteiro vai de +x para +y em torno do centro', () => {
    const t = rotateAround(defaultTransform(), [0, 0], [1, 0], [0, 1], null);
    expect(t.rotation).toBeCloseTo(90);
  });

  it('com snap de 15 graus arredonda para o múltiplo mais próximo', () => {
    const rad = (37 * Math.PI) / 180;
    const t = rotateAround(defaultTransform(), [0, 0], [1, 0], [Math.cos(rad), Math.sin(rad)], 15);
    expect(t.rotation).toBeCloseTo(30);
  });

  it('gruda em 90 quando está a menos de 3 graus', () => {
    const rad = (88 * Math.PI) / 180;
    const t = rotateAround(defaultTransform(), [0, 0], [1, 0], [Math.cos(rad), Math.sin(rad)], null);
    expect(t.rotation).toBeCloseTo(90);
  });
});

describe('snapToCenter', () => {
  it('gruda x no centro quando está perto e deixa y quando está longe', () => {
    const base: Transform = { ...defaultTransform(), x: 4, y: 50 };
    const result = snapToCenter(base, 6);
    expect(result.transform.x).toBe(0);
    expect(result.transform.y).toBe(50);
    expect(result.snappedX).toBe(true);
    expect(result.snappedY).toBe(false);
  });
});

describe('hitTestLayers', () => {
  it('pega a camada de cima (maior zIndex) quando duas se sobrepõem', () => {
    const layers = [makeLayer('below', 0), makeLayer('above', 2)];
    expect(hitTestLayers(layers, 1920, 1080, [960, 540])).toBe('above');
  });

  it('devolve null fora de todos os quadriláteros', () => {
    const layers = [makeLayer('a', 0, { scaleX: 0.1, scaleY: 0.1 })];
    expect(hitTestLayers(layers, 1920, 1080, [10, 10])).toBeNull();
  });
});

describe('cornerCursor', () => {
  it('usa nwse no canto superior esquerdo e nesw no superior direito sem rotação', () => {
    expect(cornerCursor(0, 0)).toBe('nwse-resize');
    expect(cornerCursor(1, 0)).toBe('nesw-resize');
  });

  it('inverte o cursor do canto quando o clipe gira 90 graus', () => {
    expect(cornerCursor(0, 90)).toBe('nesw-resize');
  });
});

describe('measureLayers', () => {
  it('preenche o tamanho de uma camada de texto com a medida do rasterizador', () => {
    const textLayer: Layer = {
      clipId: 't1',
      kind: 'text',
      mediaTimeMs: 0,
      localTimeMs: 0,
      transform: defaultTransform(),
      sourceWidth: 0,
      sourceHeight: 0,
      filters: [],
      effects: [],
      zIndex: 0,
      playbackRate: 0,
      fit: 'none',
      text: {
        reveal: 1,
        data: {
          content: 'Oi',
          style: {
            fontFamily: 'Inter',
            fontSize: 96,
            color: '#fff',
            bold: false,
            italic: false,
            underline: false,
            align: 'center',
            letterSpacing: 0,
            lineHeight: 1.2,
            strokeColor: '#000',
            strokeWidth: 0,
            shadowColor: '#000',
            shadowBlur: 0,
            shadowOffsetX: 0,
            shadowOffsetY: 0,
            backgroundColor: '#000',
            backgroundOpacity: 0,
            opacity: 1,
          },
        },
      },
    };
    const [measured] = measureLayers([textLayer]);
    expect(measured?.sourceWidth).toBe(320);
    expect(measured?.sourceHeight).toBe(120);
    expect(textLayer.sourceWidth).toBe(0);
  });
});
