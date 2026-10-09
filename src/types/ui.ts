// Tipos de estado da interface: tema, painéis e qualidade de prévia.

/** Tema visual da interface. */
export type Theme = 'dark' | 'light';

/** Identificador de um painel da interface. */
export type PanelId = 'media' | 'preview' | 'inspector' | 'timeline';

/** Tamanhos dos painéis em pixels. */
export interface PanelSizes {
  /** Largura do painel de mídia. */
  mediaWidth: number;
  /** Largura do painel de propriedades. */
  inspectorWidth: number;
  /** Altura da linha do tempo. */
  timelineHeight: number;
}

/** Fração de resolução usada na prévia: 0.25, 0.5 ou 1 (resolução cheia). */
export type PreviewQuality = 0.25 | 0.5 | 1;
