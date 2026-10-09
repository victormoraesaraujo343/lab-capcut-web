// Casos da bateria de render: base, velocidade, efeitos, transições e filtros, com projeto 320x180 e fontes sintéticas.
import { createClipFromAsset, createTextClip } from '@/engine/timeline/clipFactory';
import { createProject, createTrack } from '@/engine/project/createProject';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { computeProjectDuration, defaultTransform, type Asset, type Clip, type Project, type SpeedCurvePoint, type Track } from '@/types';
import { curveSpeedAt, SPEED_CURVE_PRESETS } from '@/engine/timeline/speedCurve';
import { createSyntheticProvider, frameAt, SOURCE_HEIGHT, SOURCE_WIDTH, type SyntheticProvider, type SyntheticSource } from './sources';

/** Um caso de teste: como montar o projeto, em que instante desenhar e o provider de quadros. */
export interface RenderCase {
  /** Id único do caso; também é o nome do PNG de referência. */
  id: string;
  /** Monta o projeto, o instante e o provider do caso. */
  build(): RenderCaseBuild;
}

/** Projeto pronto para renderizar num caso. */
export interface RenderCaseBuild {
  /** Projeto 320x180 com as trilhas do caso. */
  project: Project;
  /** Instante da linha do tempo a desenhar, em ms. */
  timeMs: number;
  /** Provider sintético que atende os assets do caso. */
  provider: SyntheticProvider;
  /** Tempo de mídia esperado no primeiro pedido de quadro, quando o caso exige um valor exato. */
  expectedMediaTimeMs?: number;
}

/** Fontes sintéticas disponíveis por id de asset. */
export const SOURCES: Record<string, SyntheticSource> = {
  gradient: (mediaTimeMs) => frameAt('gradient', mediaTimeMs),
  green: (mediaTimeMs) => frameAt('greenScreen', mediaTimeMs),
};

/** Curva de velocidade "hero" (preset da engine): câmera lenta no meio do clipe. */
export const HERO_CURVE: SpeedCurvePoint[] = (() => {
  const preset = SPEED_CURVE_PRESETS.find((p) => p.id === 'hero');
  if (!preset) throw new Error('speed-preset-hero-missing');
  return preset.curve;
})();

/** Id da trilha de vídeo dos casos. */
export const VIDEO_TRACK = 'track-video';
/** Id da trilha de texto dos casos. */
export const TEXT_TRACK = 'track-text';

/** Cria um asset de vídeo sintético (sem arquivo), com a fonte indicada pelo id. */
export function syntheticAsset(id: string, durationMs: number): Asset {
  return {
    id,
    kind: 'video',
    name: `${id}.synthetic`,
    mimeType: 'video/mp4',
    opfsPath: '',
    sizeBytes: 0,
    durationMs,
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    fps: 30,
    thumbnails: [],
    createdAt: 0,
  };
}

/** Assets sintéticos usados pelos casos. */
export const GRADIENT = syntheticAsset('gradient', 10000);
/** Asset de tela verde (chroma key e transições). */
export const GREEN = syntheticAsset('green', 10000);

/** Cria uma trilha com os clipes dados (cada clipe recebe o id da trilha). */
export function makeTrack(id: string, kind: Track['kind'], clips: Clip[]): Track {
  return { ...createTrack(kind, id), id, clips: clips.map((clip) => ({ ...clip, trackId: id })) };
}

/** Cria um clipe de vídeo a partir de um asset, com duração e ajustes próprios. */
export function videoClip(asset: Asset, durationMs: number, startMs = 0, patch: Partial<Clip> = {}): Clip {
  return { ...createClipFromAsset(asset, VIDEO_TRACK, startMs), durationMs, ...patch };
}

/** Monta um projeto 320x180 com as trilhas e assets sintéticos dados. */
export function buildProject(tracks: Track[], assets: Asset[]): Project {
  const base = createProject('teste-render');
  return {
    ...base,
    width: SOURCE_WIDTH,
    height: SOURCE_HEIGHT,
    fps: 30,
    tracks,
    assets,
    durationMs: computeProjectDuration(tracks),
  };
}

/** Tempo de mídia dado pela curva de velocidade no instante local do clipe (integral por passos de 0,1 ms). */
export function curveMediaTime(curve: SpeedCurvePoint[], durationMs: number, localMs: number, trimInMs: number): number {
  const step = 0.1;
  let media = 0;
  for (let s = 0; s < localMs; s += step) {
    media += curveSpeedAt(curve, (s + step / 2) / durationMs) * step;
  }
  return trimInMs + media;
}

/** Caso sem efeito: um clipe de gradiente, no meio do clipe. */
export function baseSemEfeito(): RenderCase {
  return {
    id: 'base-sem-efeito',
    build: () => ({
      project: buildProject([makeTrack(VIDEO_TRACK, 'video', [videoClip(GRADIENT, 2000)])], [GRADIENT]),
      timeMs: 500,
      provider: createSyntheticProvider(SOURCES),
      expectedMediaTimeMs: 500,
    }),
  };
}

/** Caso de transformação: deslocamento, escala, rotação, opacidade e recorte juntos. */
export function baseTransformacao(): RenderCase {
  return {
    id: 'base-transformacao',
    build: () => {
      const transform = {
        ...defaultTransform(),
        x: 24,
        y: -12,
        scaleX: 0.8,
        scaleY: 0.6,
        rotation: 17,
        opacity: 0.8,
        crop: { top: 0.05, right: 0.1, bottom: 0, left: 0.12 },
      };
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [videoClip(GRADIENT, 2000, 0, { transform })])], [GRADIENT]),
        timeMs: 500,
        provider: createSyntheticProvider(SOURCES),
        expectedMediaTimeMs: 500,
      };
    },
  };
}

/** Caso de texto: estilo com contorno, sombra e fundo, em 2 linhas. */
export function baseTexto(): RenderCase {
  return {
    id: 'base-texto',
    build: () => {
      const style = {
        ...defaultTextStyle(),
        fontFamily: 'Inter',
        fontSize: 40,
        color: '#ffea00',
        strokeColor: '#000000',
        strokeWidth: 3,
        shadowColor: '#000000',
        shadowBlur: 6,
        shadowOffsetX: 2,
        shadowOffsetY: 3,
        backgroundColor: '#000000',
        backgroundOpacity: 0.5,
      };
      const text = createTextClip(TEXT_TRACK, 0, 'Olá\nmundo', style, 2000);
      return {
        project: buildProject(
          [makeTrack(TEXT_TRACK, 'text', [text]), makeTrack(VIDEO_TRACK, 'video', [videoClip(GRADIENT, 2000)])],
          [GRADIENT],
        ),
        timeMs: 1000,
        provider: createSyntheticProvider(SOURCES),
      };
    },
  };
}

/** Velocidade constante 2x: no instante 1000 ms do clipe a mídia deve estar em 2000 ms. */
export function speedConstante(): RenderCase {
  return {
    id: 'speed-constante-2x',
    build: () => {
      const clip = videoClip(GRADIENT, 2000, 0, {
        speed: { mode: 'constant', value: 2, curve: [], preservePitch: true },
      });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GRADIENT]),
        timeMs: 1000,
        provider: createSyntheticProvider(SOURCES),
        expectedMediaTimeMs: 2000,
      };
    },
  };
}

/** Curva "hero" no meio do clipe: o tempo de mídia esperado é a integral da curva até o instante. */
export function speedCurvaHero(): RenderCase {
  return {
    id: 'speed-curva-hero',
    build: () => {
      const durationMs = 2000;
      const clip = videoClip(GRADIENT, durationMs, 0, {
        speed: { mode: 'curve', value: 1, curve: HERO_CURVE, preservePitch: true },
      });
      return {
        project: buildProject([makeTrack(VIDEO_TRACK, 'video', [clip])], [GRADIENT]),
        timeMs: 1000,
        provider: createSyntheticProvider(SOURCES),
        expectedMediaTimeMs: curveMediaTime(HERO_CURVE, durationMs, 1000, 0),
      };
    },
  };
}
