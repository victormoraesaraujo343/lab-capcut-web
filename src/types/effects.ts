// Tipos de efeitos, filtros, transições e keyframes.

/** Valor de um parâmetro de efeito. */
export type ParamValue = number | string | boolean;

/** Instância de um efeito ou filtro aplicado a um clipe. */
export interface EffectInstance {
  /** Identificador único da instância dentro do projeto. */
  id: string;
  /** Tipo do efeito (ex.: 'blur', 'brightness'). */
  type: string;
  /** Parâmetros do efeito, indexados pelo nome. */
  params: Record<string, ParamValue>;
}

/** Filtro aplicado a um clipe (mesma estrutura de EffectInstance). */
export type Filter = EffectInstance;

/** Efeito aplicado a um clipe (mesma estrutura de EffectInstance). */
export type Effect = EffectInstance;

/** Transição entre clipes. */
export interface Transition {
  /** Tipo da transição (ex.: 'fade', 'wipe'). */
  type: string;
  /** Duração da transição em milissegundos. */
  durationMs: number;
  /** Parâmetros específicos da transição. */
  params: Record<string, ParamValue>;
}

/** Curva de interpolação entre keyframes. 'hold' mantém o valor até o próximo keyframe. */
export type Easing = 'linear' | 'easeIn' | 'easeOut' | 'easeInOut' | 'hold';

/** Ponto de animação de uma propriedade. */
export interface Keyframe<T> {
  /** Tempo do keyframe em ms, relativo ao início do clipe (não da timeline). */
  timeMs: number;
  /** Valor da propriedade neste instante. */
  value: T;
  /** Interpolação até o próximo keyframe. */
  easing: Easing;
}
