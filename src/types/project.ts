// Modelo de dados do projeto: mídia, trilhas, clipes e suas propriedades.

import type { Effect, EffectInstance, Filter, Keyframe, Transition } from './effects';

/** Tipo de mídia importada. */
export type AssetKind = 'video' | 'audio' | 'image' | 'sticker';

/** Mídia importada no projeto. */
export interface Asset {
  /** Identificador único do asset. */
  id: string;
  /** Tipo de mídia. */
  kind: AssetKind;
  /** Nome original do arquivo. */
  name: string;
  /** Tipo MIME do arquivo (ex.: 'video/mp4'). */
  mimeType: string;
  /** Caminho do arquivo no OPFS. */
  opfsPath: string;
  /** Tamanho do arquivo em bytes. */
  sizeBytes: number;
  /** Duração original da mídia em ms (ausente para imagens). */
  durationMs?: number;
  /** Largura original em pixels. */
  width?: number;
  /** Altura original em pixels. */
  height?: number;
  /** Quadros por segundo da mídia original. */
  fps?: number;
  /** Caminhos OPFS das miniaturas geradas. */
  thumbnails: string[];
  /** Picos da forma de onda, normalizados entre 0 e 1. */
  waveform?: number[];
  /** Pasta na biblioteca de mídia onde o asset está. */
  folderId?: string;
  /** Data de criação em timestamp (ms). */
  createdAt: number;
}

/** Tipo de trilha. */
export type TrackKind = 'video' | 'audio' | 'text' | 'sticker' | 'effect';

/** Transformação visual de um clipe. */
export interface Transform {
  /** Deslocamento horizontal em pixels do projeto, a partir do centro. */
  x: number;
  /** Deslocamento vertical em pixels do projeto, a partir do centro. */
  y: number;
  /** Escala horizontal (1 = tamanho original). */
  scaleX: number;
  /** Escala vertical (1 = tamanho original). */
  scaleY: number;
  /** Rotação em graus. */
  rotation: number;
  /** Opacidade de 0 a 1. */
  opacity: number;
  /** Recorte em fração de 0 a 1 de cada borda. */
  crop: { top: number; right: number; bottom: number; left: number };
}

/** Mapa de keyframes por propriedade. Chave = nome da propriedade (ex.: 'x', 'opacity', 'volume', 'filter:<id>:<param>'). */
export type KeyframeMap = Record<string, Keyframe<number>[]>;

/** Ponto de uma curva de velocidade. */
export interface SpeedCurvePoint {
  /** Posição ao longo do clipe, de 0 (início) a 1 (fim). */
  t: number;
  /** Velocidade neste ponto (1 = normal). */
  speed: number;
}

/** Configuração de velocidade de um clipe. */
export interface Speed {
  /** 'constant' usa value; 'curve' usa curve. */
  mode: 'constant' | 'curve';
  /** Velocidade constante (1 = normal). */
  value: number;
  /** Pontos da curva de velocidade, usados quando mode é 'curve'. */
  curve: SpeedCurvePoint[];
  /** Mantém o tom do áudio ao mudar a velocidade. */
  preservePitch: boolean;
}

/** Estilo de um texto. */
export interface TextStyle {
  /** Nome da fonte (ex.: 'Inter'). */
  fontFamily: string;
  /** Tamanho da fonte em pixels do projeto. */
  fontSize: number;
  /** Cor do texto em CSS. */
  color: string;
  /** Negrito. */
  bold: boolean;
  /** Itálico. */
  italic: boolean;
  /** Sublinhado. */
  underline: boolean;
  /** Alinhamento horizontal do texto. */
  align: 'left' | 'center' | 'right';
  /** Espaçamento entre letras em pixels. */
  letterSpacing: number;
  /** Altura da linha como múltiplo do tamanho da fonte. */
  lineHeight: number;
  /** Cor do contorno em CSS. */
  strokeColor: string;
  /** Espessura do contorno em pixels (0 = sem contorno). */
  strokeWidth: number;
  /** Cor da sombra em CSS. */
  shadowColor: string;
  /** Desfoque da sombra em pixels. */
  shadowBlur: number;
  /** Deslocamento horizontal da sombra em pixels. */
  shadowOffsetX: number;
  /** Deslocamento vertical da sombra em pixels. */
  shadowOffsetY: number;
  /** Cor do fundo do texto em CSS. */
  backgroundColor: string;
  /** Opacidade do fundo de 0 a 1. */
  backgroundOpacity: number;
  /** Opacidade do texto de 0 a 1. */
  opacity: number;
}

/** Animação de entrada, saída ou loop de um texto. */
export interface TextAnimation {
  /** Nome da animação. */
  type: string;
  /** Duração da animação em ms. */
  durationMs: number;
}

/** Conteúdo de um clipe de texto. */
export interface TextData {
  /** Texto exibido. */
  content: string;
  /** Estilo visual do texto. */
  style: TextStyle;
  /** Largura máxima da caixa em px do projeto: linhas mais largas quebram em palavras. Ausente = só quebra em '\n'. */
  maxWidth?: number;
  /** Animação ao entrar. */
  animationIn?: TextAnimation;
  /** Animação ao sair. */
  animationOut?: TextAnimation;
  /** Animação em loop durante o clipe. */
  animationLoop?: TextAnimation;
}

/** Conteúdo de um clipe de forma geométrica. */
export interface ShapeData {
  /** Forma desenhada. */
  shape: 'rectangle' | 'circle' | 'arrow' | 'line';
  /** Cor de preenchimento em CSS. */
  fill: string;
  /** Cor do contorno em CSS. */
  stroke: string;
  /** Espessura do contorno em pixels. */
  strokeWidth: number;
}

/** Configurações de áudio de um clipe. */
export interface AudioFx {
  /** Duração do fade in em ms. */
  fadeInMs: number;
  /** Duração do fade out em ms. */
  fadeOutMs: number;
  /** Ativa redução de ruído. */
  denoise: boolean;
  /** Efeito de voz aplicado ao áudio. */
  voiceEffect?: EffectInstance;
}

/** Clipe posicionado numa trilha. */
export interface Clip {
  /** Identificador único do clipe. */
  id: string;
  /** Asset de mídia usado pelo clipe (ausente para texto, forma etc.). */
  assetId?: string;
  /** Trilha à qual o clipe pertence. */
  trackId: string;
  /** Posição de início do clipe na timeline, em ms. */
  startMs: number;
  /** Duração do clipe na timeline, em ms. */
  durationMs: number;
  /** Quanto foi cortado do início da mídia original, em ms. */
  trimInMs: number;
  /** Quanto foi cortado do fim da mídia original, em ms. */
  trimOutMs: number;
  /** Transformação visual do clipe. */
  transform: Transform;
  /** Configuração de velocidade. */
  speed: Speed;
  /** Volume de 0 a 2 (1 = original). */
  volume: number;
  /** Keyframes animados por propriedade. */
  keyframes: KeyframeMap;
  /** Filtros aplicados ao clipe. */
  filters: Filter[];
  /** Efeitos aplicados ao clipe. */
  effects: Effect[];
  /** Transição de entrada. */
  transitionIn?: Transition;
  /** Transição de saída. */
  transitionOut?: Transition;
  /** Conteúdo, quando o clipe é de texto. */
  text?: TextData;
  /** Conteúdo, quando o clipe é uma forma. */
  shape?: ShapeData;
  /** Configurações de áudio. */
  audio: AudioFx;
  /** Clipe reproduzido de trás para frente. */
  reversed: boolean;
  /** Duração do quadro congelado em ms, quando há freeze frame. */
  freezeFrameMs?: number;
  /** Clipes com o mesmo groupId são editados juntos. */
  groupId?: string;
}

/** Trilha da timeline. */
export interface Track {
  /** Identificador único da trilha. */
  id: string;
  /** Tipo de conteúdo da trilha. */
  kind: TrackKind;
  /** Nome exibido da trilha. */
  name: string;
  /** Papel especial da trilha: 'captions' = legendas automáticas (identifica a trilha mesmo se for renomeada). */
  role?: 'captions';
  /** Clipes da trilha. */
  clips: Clip[];
  /** Trilha silenciada. */
  muted: boolean;
  /** Trilha travada contra edições. */
  locked: boolean;
  /** Trilha oculta na prévia. */
  hidden: boolean;
}

/** Proporção do projeto. 'free' = sem proporção fixa. */
export type AspectRatio = '16:9' | '9:16' | '1:1' | '4:5' | '4:3' | 'free';

/** Pasta da biblioteca de mídia. */
export interface Folder {
  /** Identificador único da pasta. */
  id: string;
  /** Nome da pasta. */
  name: string;
}

/** Projeto completo. */
export interface Project {
  /** Identificador único do projeto. */
  id: string;
  /** Nome do projeto. */
  name: string;
  /** Largura do projeto em pixels. */
  width: number;
  /** Altura do projeto em pixels. */
  height: number;
  /** Quadros por segundo do projeto. */
  fps: number;
  /** Proporção do projeto. */
  aspectRatio: AspectRatio;
  /** Duração total em ms (derivada dos clipes). */
  durationMs: number;
  /** Trilhas da timeline. */
  tracks: Track[];
  /** Biblioteca de mídia. */
  assets: Asset[];
  /** Pastas da biblioteca de mídia. */
  folders: Folder[];
  /** Marcadores na timeline, em ms (ex.: batidas). */
  markers: number[];
  /** Data de criação em timestamp (ms). */
  createdAt: number;
  /** Data da última alteração em timestamp (ms). */
  updatedAt: number;
}

/** Valores padrão de transformação: sem deslocamento, escala 1, opacidade total e sem recorte. */
export function defaultTransform(): Transform {
  return {
    x: 0,
    y: 0,
    scaleX: 1,
    scaleY: 1,
    rotation: 0,
    opacity: 1,
    crop: { top: 0, right: 0, bottom: 0, left: 0 },
  };
}

/** Velocidade padrão: constante 1x, sem curva, com preservação de tom. */
export function defaultSpeed(): Speed {
  return { mode: 'constant', value: 1, curve: [], preservePitch: true };
}

/** Configuração de áudio padrão: sem fades e sem redução de ruído. */
export function defaultAudioFx(): AudioFx {
  return { fadeInMs: 0, fadeOutMs: 0, denoise: false };
}

/** Retorna o instante em ms em que o clipe termina na timeline. */
export function clipEndMs(clip: Clip): number {
  return clip.startMs + clip.durationMs;
}

/** Retorna a duração total do projeto: maior fim entre todos os clipes, ou 0 se não houver clipes. */
export function computeProjectDuration(tracks: Track[]): number {
  let end = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      const clipEnd = clipEndMs(clip);
      if (clipEnd > end) end = clipEnd;
    }
  }
  return end;
}
