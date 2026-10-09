// Tipos do motor de render: camadas resolvidas, fontes de quadro e compositor.
// Contrato compartilhado entre composição, decodificação, compositor e prévia/exportação.
import type { Asset, AssetKind, Transform } from './project';
import type { EffectInstance } from './effects';

/** Imagem que o compositor sabe enviar como textura. */
export type FrameImage = VideoFrame | ImageBitmap | HTMLVideoElement | HTMLImageElement | HTMLCanvasElement | OffscreenCanvas;

/** Uma camada visual pronta para desenhar num instante da linha do tempo. */
export interface Layer {
  /** Clipe de origem. */
  clipId: string;
  /** Asset de origem (ausente para texto/forma, que chegam como imagem própria). */
  assetId?: string;
  /** Tipo do asset. */
  kind: AssetKind | 'text' | 'shape';
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
}

/** Opções de um pedido de quadro. */
export interface FrameRequest {
  /** true = precisa do quadro exato (exportação); false = aceita o mais próximo já pronto (prévia). */
  exact: boolean;
  /** Velocidade com que a mídia avança na reprodução (speed do clipe); padrão 1. */
  rate?: number;
}

/** Fornece quadros de mídia por asset e instante. Prévia e exportação usam a mesma interface. */
export interface FrameProvider {
  /** Devolve o quadro do asset no instante de mídia pedido, ou null se não houver. */
  getFrame(asset: Asset, mediaTimeMs: number, request: FrameRequest): Promise<FrameImage | null>;
  /** Avisa que o cursor está perto deste instante, para pré-carregar quadros ao redor. */
  prefetch(asset: Asset, mediaTimeMs: number, direction: 1 | -1): void;
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
