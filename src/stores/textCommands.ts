// Comandos de texto e legendas: calculam a edição com funções puras e a aplicam via timelineStore.edit.
import type { Clip, Project, Track, TextAnimation, TextData, TextStyle } from '@/types';
import { defaultTransform } from '@/types';
import { t } from '@/i18n/pt-BR';
import { defaultTextStyle } from '@/engine/text/defaultTextStyle';
import {
  applyPreset,
  CAPTION_PRESET_ID,
  TEXT_PRESETS,
  type TextPreset,
} from '@/engine/text/textPresets';
import { createTextClip } from '@/engine/timeline/clipFactory';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { MIN_CLIP_MS } from '@/engine/timeline/constants';
import { addTrack, sortClips } from '@/engine/timeline/trackOps';
import { createTrack } from '@/engine/project/createProject';
import { useProjectStore } from './projectStore';
import { usePlaybackStore } from './playbackStore';
import { useTimelineStore } from './timelineStore';

/** Slot de animação de um texto: entrada, saída ou repetição. */
export type TextAnimationSlot = 'in' | 'out' | 'loop';

/** Uma legenda: intervalo na timeline e texto. */
export interface CaptionInput {
  /** Início da legenda, em ms. */
  startMs: number;
  /** Fim da legenda, em ms. */
  endMs: number;
  /** Texto da legenda. */
  text: string;
}

/** Campo de TextData que guarda a animação de cada slot. */
const ANIMATION_FIELD = {
  in: 'animationIn',
  out: 'animationOut',
  loop: 'animationLoop',
} as const;

/** Posição vertical das legendas: 35% da altura do projeto abaixo do centro. */
const CAPTION_Y_RATIO = 0.35;

/** Tamanho da fonte das legendas, como fração do menor lado do projeto. */
const CAPTION_FONT_RATIO = 0.06;

/** Largura máxima da caixa de texto, como fração da largura do projeto. */
const TEXT_MAX_WIDTH_RATIO = 0.9;

/** Tamanho da fonte das legendas no projeto dado (cabe em 9:16 com quebra de linha). */
function captionFontSize(project: Project): number {
  return Math.round(Math.min(project.width, project.height) * CAPTION_FONT_RATIO);
}

/** Devolve o clipe com a largura máxima da caixa de texto no projeto dado; clipes sem texto ficam iguais. */
function withMaxWidth(clip: Clip, project: Project): Clip {
  if (!clip.text) return clip;
  const maxWidth = Math.round(project.width * TEXT_MAX_WIDTH_RATIO);
  return { ...clip, text: { ...clip.text, maxWidth } };
}

/** Acha um estilo predefinido pelo id; undefined se não existir ou o id for omitido. */
function findPreset(presetId: string | undefined): TextPreset | undefined {
  if (presetId === undefined) return undefined;
  return TEXT_PRESETS.find((preset) => preset.id === presetId);
}

/** Estilo inicial de um texto novo: o padrão com o estilo do predefinido por cima, se houver. */
function styleFor(preset: TextPreset | undefined): TextStyle {
  return preset ? applyPreset(defaultTextStyle(), preset) : defaultTextStyle();
}

/** Devolve o clipe com a animação de entrada do predefinido, se ele tiver uma. */
function withAnimationIn(clip: Clip, animationIn: TextAnimation | undefined): Clip {
  return clip.text && animationIn ? { ...clip, text: { ...clip.text, animationIn } } : clip;
}

/** Trilhas do projeto aberto, ou lista vazia. */
function currentTracks(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Primeira trilha de texto não travada, que não seja de legendas, sem clipe no intervalo [startMs, endMs); undefined se nenhuma estiver livre. */
function freeTextTrack(tracks: Track[], startMs: number, endMs: number): Track | undefined {
  return tracks.find(
    (track) =>
      track.kind === 'text' &&
      !track.locked &&
      track.role !== 'captions' &&
      track.clips.every((clip) => clip.startMs >= endMs || clip.startMs + clip.durationMs <= startMs),
  );
}

/** Acrescenta um clipe à trilha dada, mantendo os clipes ordenados por início. */
function appendClip(tracks: Track[], trackId: string, clip: Clip): Track[] {
  return tracks.map((track) =>
    track.id === trackId ? { ...track, clips: sortClips([...track.clips, clip]) } : track,
  );
}

/** Aplica uma mudança a um clipe de texto, em um passo de histórico; ignora clipes que não são de texto. */
function editTextClip(
  label: string,
  clipId: string,
  change: (text: TextData) => TextData,
  coalesceKey?: string,
): void {
  const clip = findClip(currentTracks(), clipId)?.clip;
  if (clip?.text === undefined) return;
  useTimelineStore.getState().edit(
    label,
    (tracks) => updateClip(tracks, clipId, (c) => (c.text ? { ...c, text: change(c.text) } : c)),
    undefined,
    coalesceKey === undefined ? undefined : { coalesceKey },
  );
}

/** Cria um texto novo no cursor (ou em atMs), na primeira trilha de texto livre naquele intervalo (senão, nova trilha no topo); seleciona-o e devolve o id ('' sem projeto). */
export function addText(options: { content?: string; presetId?: string; atMs?: number } = {}): string {
  const project = useProjectStore.getState().project;
  if (project === null) return '';
  const preset = findPreset(options.presetId);
  const style = styleFor(preset);
  const animationIn = preset?.animationIn;
  const content = options.content ?? t.text.defaultContent;
  const at = options.atMs ?? usePlaybackStore.getState().currentTimeMs;
  let clipId = '';
  useTimelineStore.getState().edit('text-add', (tracks) => {
    // Rascunho só para saber a duração padrão do texto novo antes de escolher a trilha.
    const draft = createTextClip('', at, content, style);
    const free = freeTextTrack(tracks, draft.startMs, draft.startMs + draft.durationMs);
    const added = free
      ? { tracks, trackId: free.id }
      : addTrack(tracks, 'text', 0, t.timeline.trackKinds.text);
    const clip = withAnimationIn(withMaxWidth({ ...draft, trackId: added.trackId }, project), animationIn);
    clipId = clip.id;
    return appendClip(added.tracks, added.trackId, clip);
  });
  if (clipId !== '') useTimelineStore.getState().selectClips([clipId]);
  return clipId;
}

/** Troca o texto e/ou o estilo de um clipe de texto; edições seguidas do mesmo clipe viram um passo só. */
export function updateText(clipId: string, patch: { content?: string; style?: Partial<TextStyle> }): void {
  editTextClip(
    'text',
    clipId,
    (text) => ({
      ...text,
      content: patch.content ?? text.content,
      style: { ...text.style, ...patch.style },
    }),
    `text:${clipId}`,
  );
}

/** Aplica um estilo predefinido sobre o estilo atual do clipe de texto, e sua animação de entrada se houver. */
export function applyTextPreset(clipId: string, presetId: string): void {
  const preset = findPreset(presetId);
  if (preset === undefined) return;
  editTextClip('text-preset', clipId, (text) => ({
    ...text,
    style: applyPreset(text.style, preset),
    animationIn: preset.animationIn ?? text.animationIn,
  }));
}

/** Define (ou remove, com null) a animação de um slot do clipe de texto. */
export function setTextAnimation(
  clipId: string,
  slot: TextAnimationSlot,
  animation: TextAnimation | null,
): void {
  const field = ANIMATION_FIELD[slot];
  editTextClip('text-animation', clipId, (text) => ({
    ...text,
    [field]: animation ?? undefined,
  }));
}

/** Troca só o texto de uma legenda; é o mesmo que updateText com o conteúdo. */
export function replaceCaptionText(clipId: string, text: string): void {
  updateText(clipId, { content: text });
}

/** Cria uma trilha de legendas (role 'captions') no topo com uma legenda por item, num passo só; devolve os ids dos clipes. */
export function addCaptions(
  captions: CaptionInput[],
  options: { presetId?: string; trackName?: string } = {},
): string[] {
  const project = useProjectStore.getState().project;
  if (project === null || captions.length === 0) return [];
  const preset = findPreset(options.presetId ?? CAPTION_PRESET_ID);
  const fontSize = captionFontSize(project);
  const style: TextStyle = { ...styleFor(preset), fontSize };
  // Centro da caixa de duas linhas: sobe metade da altura estimada (2 linhas = 2 × fonte × entrelinha).
  const y = project.height * CAPTION_Y_RATIO - fontSize * style.lineHeight;
  const track: Track = {
    ...createTrack('text', options.trackName ?? t.captions.trackName),
    role: 'captions',
  };
  const clips = captions.map((caption) => {
    const duration = Math.max(MIN_CLIP_MS, caption.endMs - caption.startMs);
    const clip = createTextClip(track.id, caption.startMs, caption.text, style, duration);
    const sized = withMaxWidth(clip, project);
    return { ...withAnimationIn(sized, preset?.animationIn), transform: { ...defaultTransform(), y } };
  });
  const filled: Track = { ...track, clips: sortClips(clips) };
  useTimelineStore.getState().edit('captions', (tracks) => [filled, ...tracks]);
  return clips.map((clip) => clip.id);
}
