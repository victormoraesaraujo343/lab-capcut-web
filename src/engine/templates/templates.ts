// Modelos de projeto prontos: trilhas com textos, formas e sobreposições em pt-BR, estilo CapCut.

import type { AspectRatio, Clip, OverlayData, Project, ShapeData, TextData, TextStyle, Track, TrackKind } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import { t } from '@/i18n/pt-BR';
import { createId, createTrack } from '@/engine/project/createProject';
import { createShapeClip, createTextClip } from '@/engine/timeline/clipFactory';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import { defaultParams } from '@/engine/render/registry';
import { registerOverlays } from '@/engine/render/overlays';

/** Identificador de um modelo; é também a chave dos nomes e descrições em t.templates. */
export type TemplateId = keyof typeof t.templates.names;

/** Definição de um modelo de projeto pronto. */
export interface TemplateDef {
  /** Identificador único do modelo. */
  id: TemplateId;
  /** Chave do nome exibido em t.templates.names. */
  labelKey: TemplateId;
  /** Chave da descrição curta em t.templates.descriptions. */
  descriptionKey: TemplateId;
  /** Proporção do projeto. */
  aspectRatio: Extract<AspectRatio, '16:9' | '9:16' | '1:1'>;
  /** Largura do projeto em pixels. */
  width: number;
  /** Altura do projeto em pixels. */
  height: number;
  /** Quadros por segundo do projeto. */
  fps: number;
  /** Cor de destaque da miniatura. */
  accent: string;
  /** Monta as trilhas (com ids novos a cada chamada) e os marcadores. */
  build: () => Pick<Project, 'tracks' | 'markers'>;
}

const TRACK_LABEL = t.timeline.trackKinds;
const S = t.templates.sample;
const FADE_IN = { type: 'fadeIn', durationMs: 400 };

/** Estilo de texto: o padrão do editor com os campos dados por cima. */
function style(fields: Partial<TextStyle>): TextStyle {
  return { ...defaultTextStyle(), ...fields };
}

/** Campos de um texto: estilo, mais a largura máxima da caixa (que fica no conteúdo, não no estilo). */
type TextFields = Partial<TextStyle> & { maxWidth?: number };

/** Clipe de texto com animação de entrada, no instante e posição dados (px a partir do centro). */
function textClip(
  trackId: string,
  startMs: number,
  durationMs: number,
  content: string,
  fields: TextFields,
  x: number,
  y: number,
): Clip {
  const { maxWidth, ...styleFields } = fields;
  const data: TextData = {
    content,
    style: style(styleFields),
    animationIn: FADE_IN,
    ...(maxWidth === undefined ? {} : { maxWidth }),
  };
  const base = createTextClip(trackId, startMs, content, data.style, durationMs);
  return { ...base, text: data, transform: { ...base.transform, x, y } };
}

/** Clipe de forma com posição dada (px a partir do centro). */
function shapeClip(
  trackId: string,
  startMs: number,
  durationMs: number,
  shape: ShapeData,
  x: number,
  y: number,
): Clip {
  const base = createShapeClip(trackId, startMs, shape, durationMs);
  return { ...base, transform: { ...base.transform, x, y } };
}

/** Clipe de sobreposição animada (sem asset), com os parâmetros padrão do registro. */
function overlayClip(trackId: string, startMs: number, durationMs: number, type: string, blend: OverlayData['blend']): Clip {
  registerOverlays();
  return {
    id: createId(),
    trackId,
    startMs,
    durationMs,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    reversed: false,
    audio: defaultAudioFx(),
    overlay: { type, params: defaultParams(type), blend },
  };
}

/** Trilha nova do tipo dado, já com os clipes que a função monta usando o id da própria trilha. */
function trackWith(kind: TrackKind, name: string, makeClips: (trackId: string) => Clip[]): Track {
  const track = createTrack(kind, name);
  return { ...track, clips: makeClips(track.id) };
}

/** Monta o resultado de um modelo: as trilhas dadas por cima, e sempre uma trilha de vídeo e uma de áudio vazias. */
function layout(topTracks: Track[]): Pick<Project, 'tracks' | 'markers'> {
  return {
    tracks: [
      ...topTracks,
      createTrack('video', `${TRACK_LABEL.video} 1`),
      createTrack('audio', `${TRACK_LABEL.audio} 1`),
    ],
    markers: [],
  };
}

/** Os dez modelos de projeto, na ordem em que aparecem no seletor. */
export const TEMPLATES: TemplateDef[] = [
  {
    id: 'vlog', labelKey: 'vlog', descriptionKey: 'vlog',
    aspectRatio: '16:9', width: 1920, height: 1080, fps: 30, accent: '#fb923c',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 4500, S.vlog.title, { fontFamily: 'Inter', fontSize: 150, bold: true, strokeColor: '#000000', strokeWidth: 8 }, 0, -60),
        textClip(id, 500, 4000, S.vlog.subtitle, { fontFamily: 'Space Grotesk', fontSize: 64, color: '#ffd400', shadowColor: '#000000', shadowBlur: 10 }, 0, 80),
        textClip(id, 0, 3000, S.vlog.chapter, { fontFamily: 'Inter', fontSize: 48, bold: true, backgroundColor: '#000000', backgroundOpacity: 0.6 }, -700, -400),
      ]),
    ]),
  },
  {
    id: 'reels', labelKey: 'reels', descriptionKey: 'reels',
    aspectRatio: '9:16', width: 1080, height: 1920, fps: 30, accent: '#ff2d55',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 3000, S.reels.hook, { fontFamily: 'Inter', fontSize: 130, bold: true, strokeColor: '#000000', strokeWidth: 10, maxWidth: 900 }, 0, -420),
        textClip(id, 1500, 3000, S.reels.cta, { fontFamily: 'Inter', fontSize: 70, bold: true, backgroundColor: '#ff2d55', backgroundOpacity: 1 }, 0, 620),
      ]),
    ]),
  },
  {
    id: 'tiktok-legendas', labelKey: 'tiktok-legendas', descriptionKey: 'tiktok-legendas',
    aspectRatio: '9:16', width: 1080, height: 1920, fps: 30, accent: '#00e5ff',
    build: () => layout([
      { ...trackWith('text', t.templates.captionsTrack, () => []), role: 'captions' },
    ]),
  },
  {
    id: 'tutorial', labelKey: 'tutorial', descriptionKey: 'tutorial',
    aspectRatio: '16:9', width: 1920, height: 1080, fps: 30, accent: '#22c55e',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 4000, S.tutorial.title, { fontFamily: 'Space Grotesk', fontSize: 120, bold: true, strokeColor: '#000000', strokeWidth: 6 }, 0, -200),
        textClip(id, 4000, 3000, S.tutorial.step1, { fontFamily: 'Inter', fontSize: 84, bold: true, color: '#22c55e' }, 0, 80),
        textClip(id, 7000, 3000, S.tutorial.step2, { fontFamily: 'Inter', fontSize: 84, bold: true, color: '#22c55e' }, 0, 80),
        textClip(id, 10000, 3000, S.tutorial.step3, { fontFamily: 'Inter', fontSize: 84, bold: true, color: '#22c55e' }, 0, 80),
      ]),
    ]),
  },
  {
    id: 'youtube-intro', labelKey: 'youtube-intro', descriptionKey: 'youtube-intro',
    aspectRatio: '16:9', width: 1920, height: 1080, fps: 24, accent: '#ef4444',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 5000, S.youtubeIntro.title, { fontFamily: 'Michroma', fontSize: 180, color: '#ffffff', shadowColor: '#000000', shadowBlur: 16 }, 0, -40),
        textClip(id, 1000, 4000, S.youtubeIntro.subtitle, { fontFamily: 'Roboto', fontSize: 64, bold: true, color: '#ef4444' }, 0, 150),
      ]),
      trackWith('effect', TRACK_LABEL.effect, (id) => [overlayClip(id, 0, 5000, 'lightLeak', 'screen')]),
    ]),
  },
  {
    id: 'stories', labelKey: 'stories', descriptionKey: 'stories',
    aspectRatio: '9:16', width: 1080, height: 1920, fps: 30, accent: '#a78bfa',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 5000, S.stories.scene1, { fontFamily: 'Space Grotesk', fontSize: 140, bold: true, strokeColor: '#000000', strokeWidth: 8, maxWidth: 900 }, 0, 0),
        textClip(id, 5000, 5000, S.stories.scene2, { fontFamily: 'Gelasio', fontSize: 140, italic: true, color: '#fde047', strokeColor: '#000000', strokeWidth: 8, maxWidth: 900 }, 0, 0),
        textClip(id, 10000, 5000, S.stories.scene3, { fontFamily: 'Inter', fontSize: 120, bold: true, backgroundColor: '#a78bfa', backgroundOpacity: 1, maxWidth: 900 }, 0, 0),
      ]),
    ]),
  },
  {
    id: 'quadrado-post', labelKey: 'quadrado-post', descriptionKey: 'quadrado-post',
    aspectRatio: '1:1', width: 1080, height: 1080, fps: 30, accent: '#f59e0b',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 4000, S.quadrado.title, { fontFamily: 'Inter', fontSize: 140, bold: true, color: '#111111' }, 0, -30),
        textClip(id, 500, 3500, S.quadrado.body, { fontFamily: 'Inter', fontSize: 64, color: '#111111' }, 0, 70),
      ]),
      trackWith('sticker', TRACK_LABEL.sticker, (id) => [
        shapeClip(id, 0, 4000, { shape: 'rectangle', fill: '#f59e0b', stroke: '#f59e0b', strokeWidth: 0, width: 900, height: 260, cornerRadius: 24 }, 0, 0),
      ]),
    ]),
  },
  {
    id: 'apresentacao', labelKey: 'apresentacao', descriptionKey: 'apresentacao',
    aspectRatio: '16:9', width: 1920, height: 1080, fps: 30, accent: '#38bdf8',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 5000, S.apresentacao.title, { fontFamily: 'Space Grotesk', fontSize: 150, bold: true, strokeColor: '#000000', strokeWidth: 6 }, 0, -120),
        textClip(id, 0, 5000, S.apresentacao.subtitle, { fontFamily: 'Inter', fontSize: 60, color: '#cbd5e1' }, 0, 20),
      ]),
      trackWith('sticker', TRACK_LABEL.sticker, (id) => [
        shapeClip(id, 1000, 4000, { shape: 'arrow', fill: '#38bdf8', stroke: '#38bdf8', strokeWidth: 14, width: 360, height: 0, cornerRadius: 0 }, 0, 240),
      ]),
    ]),
  },
  {
    id: 'aniversario', labelKey: 'aniversario', descriptionKey: 'aniversario',
    aspectRatio: '1:1', width: 1080, height: 1080, fps: 30, accent: '#fde047',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 5000, S.aniversario.title, { fontFamily: 'Comic Relief', fontSize: 120, bold: true, color: '#fde047', strokeColor: '#7c2d12', strokeWidth: 8, maxWidth: 900 }, 0, 0),
      ]),
      trackWith('effect', TRACK_LABEL.effect, (id) => [overlayClip(id, 0, 5000, 'bokeh', 'normal')]),
    ]),
  },
  {
    id: 'podcast', labelKey: 'podcast', descriptionKey: 'podcast',
    aspectRatio: '16:9', width: 1920, height: 1080, fps: 30, accent: '#f43f5e',
    build: () => layout([
      trackWith('text', TRACK_LABEL.text, (id) => [
        textClip(id, 0, 5000, S.podcast.title, { fontFamily: 'Michroma', fontSize: 110, color: '#ffffff', shadowColor: '#000000', shadowBlur: 12 }, 0, -260),
        textClip(id, 0, 5000, S.podcast.hosts, { fontFamily: 'Inter', fontSize: 56, bold: true, color: '#ffffff' }, -480, 340),
      ]),
      trackWith('sticker', TRACK_LABEL.sticker, (id) => [
        shapeClip(id, 0, 5000, { shape: 'rectangle', fill: '#f43f5e', stroke: '#f43f5e', strokeWidth: 0, width: 900, height: 130, cornerRadius: 0 }, -480, 340),
      ]),
    ]),
  },
];

/** Devolve a definição do modelo pelo id, ou undefined se não existir. */
export function findTemplate(id: string): TemplateDef | undefined {
  return TEMPLATES.find((template) => template.id === id);
}
