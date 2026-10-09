// Mede as camadas de texto e de forma da prévia: o tamanho real só existe depois de medir, então preenche sourceWidth/sourceHeight.
import { createTextRasterizer } from '@/engine/text/textRasterizer';
import { createShapeRasterizer, type ShapeRasterizer } from '@/engine/shapes/shapeRasterizer';
import type { Layer } from '@/types';
import type { TextRasterizer } from '@/types/render';

/** Rasterizador de texto único da thread principal, criado na primeira medição. */
let sharedRasterizer: TextRasterizer | null = null;

/** Rasterizador de formas único da thread principal, criado na primeira medição. */
let sharedShapeRasterizer: ShapeRasterizer | null = null;

/** Devolve o rasterizador de texto da thread principal, criando-o se ainda não existir. */
function mainRasterizer(): TextRasterizer {
  sharedRasterizer ??= createTextRasterizer();
  return sharedRasterizer;
}

/** Devolve o rasterizador de formas da thread principal, criando-o se ainda não existir. */
function mainShapeRasterizer(): ShapeRasterizer {
  sharedShapeRasterizer ??= createShapeRasterizer();
  return sharedShapeRasterizer;
}

/** Camadas com o tamanho natural preenchido: texto e forma recebem a medida do rasterizador; mídia passa como está. */
export function measureLayers(layers: Layer[]): Layer[] {
  return layers.map((layer) => {
    if (layer.text !== undefined) {
      const size = mainRasterizer().measure(layer.text.data);
      return { ...layer, sourceWidth: size.width, sourceHeight: size.height };
    }
    if (layer.shape !== undefined) {
      const size = mainShapeRasterizer().measure(layer.shape);
      return { ...layer, sourceWidth: size.width, sourceHeight: size.height };
    }
    return layer;
  });
}
