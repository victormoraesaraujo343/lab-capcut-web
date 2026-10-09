// Tipos do motor de render: camadas resolvidas, fontes de quadro e compositor.
// Contrato compartilhado entre composição, decodificação, compositor e prévia/exportação.
import type { Asset, AssetKind, OverlayData, ShapeData, TextData, Transform } from './project';
import type { EffectInstance, ParamValue } from './effects';

/** Imagem que o compositor sabe enviar como textura. */
export type FrameImage = VideoFrame | ImageBitmap | HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

/** Uma camada visual pronta para desenhar num instante da linha do tempo. */
export interface Layer {
  /** Clipe de origem. */
  clipId: string;
  /** Asset de origem (ausente para texto/forma, que chegam como imagem própria). */
  assetId?: string;
  /** Tipo do asset. */
  kind: AssetKind | 'text' | 'shape' | 'overlay';
  /** Instante dentro da mídia original a mostrar, em ms (já considera trim, velocidade e inversão). */
  mediaTimeMs: number;
  /** Instante dentro do clipe (0 = início do clipe), em ms. */
  localTimeMs: number;
  /** Transformação já avaliada (keyframes aplicados). */
  transform: Transform;
  /** Largura natural da fonte em px. */
  sourceWidth: number;
  /** Altura natural da fonte em px. */
  sourceHeight: number;
  /** Filtros do clipe (registro de efeitos, etapa 7). */
  filters: EffectInstance[];
  /** Efeitos do clipe (registro de efeitos, etapa 7). */
  effects: EffectInstance[];
  /** Ordem de desenho: menor desenha primeiro (fica embaixo). */
  zIndex: number;
  /** Velocidade de reprodução da mídia neste instante (speed do clipe; 1 = normal). */
  playbackRate: number;
  /** Como o tamanho base é calculado: 'contain' = mídia encaixada no quadro; 'none' = tamanho natural da imagem em px do projeto (texto). */
  fit: 'contain' | 'none';
  /** Só para camadas de texto: o conteúdo/estilo e quanto do texto já apareceu (0..1, animação de digitação). */
  text?: { data: TextData; reveal: number };
  /** Só para camadas de forma: desenhada em canvas 2D (como o texto), tamanho natural = width × height (+ contorno). */
  shape?: ShapeData;
  /** Só para camadas de sobreposição: shader procedural de quadro inteiro, desenhado com a mistura indicada (sem imagem de fonte). */
  overlay?: OverlayData;
  /** Máscara de recorte (efeito 'removeBackground'): quadro de um asset de máscara no mesmo instante de mídia. */
  matte?: { assetId: string; mediaTimeMs: number };
  /**
   * Transição em andamento: esta camada é a que SAI; `incoming` é a camada que ENTRA (já com seus efeitos/transform).
   * O compositor desenha as duas no quadro inteiro e combina com o shader da transição. A camada que entra NÃO aparece
   * separada na lista.
   */
  transition?: { type: string; params: Record<string, ParamValue>; progress: number; incoming: Layer };
}

/** Desenha texto num canvas 2D (funciona na thread principal e em worker). Mesmo desenho na prévia e na exportação. */
export interface TextRasterizer {
  /** Imagem do texto no tamanho natural em px do projeto; o mesmo conteúdo/estilo/reveal reutiliza a imagem do cache. */
  rasterize(data: TextData, reveal: number): OffscreenCanvas | HTMLCanvasElement;
  /** Tamanho natural (px do projeto) que o texto ocupará, sem desenhar. */
  measure(data: TextData): { width: number; height: number };
  /** Libera o cache de imagens. */
  dispose(): void;
}

/** Opções de um pedido de quadro. */
export interface FrameRequest {
  /** true = precisa do quadro exato (exportação); false = aceita o mais próximo já pronto (prévia). */
  exact: boolean;
  /** Velocidade com que a mídia avança na reprodução (speed do clipe); padrão 1. */
  rate?: number;
  /** Quem pede (ex.: id do clipe): o mesmo vídeo em dois clipes ao mesmo tempo ganha um decodificador por pedinte. */
  lane?: string;
}

/** Fornece quadros de mídia por asset e instante. Prévia e exportação usam a mesma interface. */
export interface FrameProvider {
  /** Devolve o quadro do asset no instante de mídia pedido, ou null se não houver. */
  getFrame(asset: Asset, mediaTimeMs: number, request: FrameRequest): Promise<FrameImage | null>;
  /** Avisa que o cursor está perto deste instante, para pré-carregar quadros ao redor. */
  prefetch(asset: Asset, mediaTimeMs: number, direction: 1 | -1, lane?: string): void;
  /** Solta um quadro devolvido por getFrame (fecha VideoFrame/ImageBitmap quando for dono). */
  releaseFrame(frame: FrameImage): void;
  /** Fecha tudo que pertence a um asset (decodificador, elemento, cache), ex. quando ele sai do projeto. */
  closeAsset(assetId: string): void;
  /** Libera tudo (workers, elementos, caches). */
  dispose(): void;
}

/** Opções de desenho de um quadro composto. */
export interface CompositeOptions {
  /** Largura do quadro de saída em px. */
  width: number;
  /** Altura do quadro de saída em px. */
  height: number;
  /** Cor de fundo CSS (ex. '#000000'). */
  background: string;
  /** Largura do espaço de coordenadas das camadas (px do projeto); independe da resolução de saída. */
  frameWidth: number;
  /** Altura do espaço de coordenadas das camadas (px do projeto). */
  frameHeight: number;
}

/** Compositor WebGL2: desenha camadas com suas imagens num canvas. */
export interface Compositor {
  /** Desenha as camadas (já ordenadas por zIndex) usando a imagem de cada uma. */
  draw(layers: Layer[], images: Map<string, FrameImage>, options: CompositeOptions): void;
  /** Canvas de saída. */
  readonly canvas: HTMLCanvasElement | OffscreenCanvas;
  /** Libera texturas, programas e contexto. */
  dispose(): void;
}
