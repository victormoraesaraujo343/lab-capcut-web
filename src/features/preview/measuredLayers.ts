// Mede as camadas de texto da prévia: o tamanho real do texto só existe depois de medir, então preenche sourceWidth/sourceHeight.
import { createTextRasterizer } from '@/engine/text/textRasterizer';
import type { Layer } from '@/types';
import type { TextRasterizer } from '@/types/render';

/** Rasterizador único da thread principal, criado na primeira medição. */
let sharedRasterizer: TextRasterizer | null = null;

/** Devolve o rasterizador da thread principal, criando-o se ainda não existir. */
function mainRasterizer(): TextRasterizer {
  sharedRasterizer ??= createTextRasterizer();
  return sharedRasterizer;
}

/** Camadas com o tamanho natural preenchido: texto recebe a medida do rasterizador; mídia e forma passam como estão. */
export function measureLayers(layers: Layer[]): Layer[] {
  return layers.map((layer) => {
    if (layer.text === undefined) return layer;
    const size = mainRasterizer().measure(layer.text.data);
    return { ...layer, sourceWidth: size.width, sourceHeight: size.height };
  });
}
