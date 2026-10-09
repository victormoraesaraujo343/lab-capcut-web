// Comandos da fala sintética: cria, edita e ouve clipes de texto para fala, sem asset, em trilhas de áudio.
import type { Clip, TtsData, Track } from '@/types';
import { defaultAudioFx, defaultSpeed, defaultTransform } from '@/types';
import { t } from '@/i18n/pt-BR';
import { createId } from '@/engine/project/createProject';
import { findClip } from '@/engine/timeline/clipOps';
import { addTrack, sortClips } from '@/engine/timeline/trackOps';
import { estimateSpeechMs } from '@/engine/tts/ttsDuration';
import { browserSpeechOutput } from '@/engine/tts/ttsPlayer';
import { useProjectStore } from './projectStore';
import { usePlaybackStore } from './playbackStore';
import { useTimelineStore } from './timelineStore';

/** Opções ao criar uma fala; o que faltar vem do padrão (voz automática, velocidade 1, tom 1, cursor atual). */
export interface SpeechOptions {
  /** voiceURI da voz escolhida. */
  voiceURI?: string;
  /** Velocidade da fala, de 0.5 a 2. */
  rate?: number;
  /** Tom da fala, de 0 a 2. */
  pitch?: number;
  /** Início do clipe na timeline, em ms; padrão é o cursor. */
  atMs?: number;
}

/** Limita a velocidade da fala ao intervalo 0.5..2. */
function clampRate(rate: number): number {
  return Math.min(2, Math.max(0.5, Number.isFinite(rate) ? rate : 1));
}

/** Limita o tom da fala ao intervalo 0..2. */
function clampPitch(pitch: number): number {
  return Math.min(2, Math.max(0, Number.isFinite(pitch) ? pitch : 1));
}

/** Trilhas do projeto aberto, ou lista vazia. */
function currentTracks(): Track[] {
  return useProjectStore.getState().project?.tracks ?? [];
}

/** Primeira trilha de áudio destravada sem clipe no intervalo [startMs, endMs); undefined se nenhuma estiver livre. */
function freeAudioTrack(tracks: Track[], startMs: number, endMs: number): Track | undefined {
  return tracks.find(
    (track) =>
      track.kind === 'audio' &&
      !track.locked &&
      track.clips.every((clip) => clip.startMs >= endMs || clip.startMs + clip.durationMs <= startMs),
  );
}

/** Cria um clipe de fala: sem asset, sem som na mixagem (o navegador não grava a voz), com a fala associada. */
function createSpeechClip(trackId: string, startMs: number, durationMs: number, tts: TtsData): Clip {
  return {
    id: createId(),
    trackId,
    startMs: Math.max(0, startMs),
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
    tts,
  };
}

/** Acrescenta um clipe à trilha dada, mantendo os clipes ordenados por início. */
function appendClip(tracks: Track[], trackId: string, clip: Clip): Track[] {
  return tracks.map((track) =>
    track.id === trackId ? { ...track, clips: sortClips([...track.clips, clip]) } : track,
  );
}

/** Troca a duração e a fala de um clipe; se ele cresceu e encostou no próximo, empurra os clipes seguintes como o ripple. */
function resizeSpeech(tracks: Track[], clipId: string, tts: TtsData, durationMs: number): Track[] {
  const found = findClip(tracks, clipId);
  if (found === null) return tracks;
  const oldEnd = found.clip.startMs + found.clip.durationMs;
  const newEnd = found.clip.startMs + durationMs;
  return tracks.map((track) => {
    if (track.id !== found.track.id) return track;
    const nextStart = track.clips
      .filter((clip) => clip.id !== clipId && clip.startMs >= oldEnd)
      .reduce((min, clip) => Math.min(min, clip.startMs), Number.POSITIVE_INFINITY);
    const push = Math.max(0, newEnd - nextStart);
    const clips = track.clips.map((clip) => {
      if (clip.id === clipId) return { ...clip, tts, durationMs };
      if (push > 0 && clip.startMs >= oldEnd) return { ...clip, startMs: clip.startMs + push };
      return clip;
    });
    return { ...track, clips: sortClips(clips) };
  });
}

/** Adiciona uma fala na linha do tempo, em trilha de áudio livre no intervalo (ou nova trilha), com duração estimada; seleciona o clipe e devolve o id ('' se vazio ou sem projeto). */
export function addSpeech(text: string, options: SpeechOptions = {}): string {
  const project = useProjectStore.getState().project;
  if (project === null || text.trim() === '') return '';
  const tts: TtsData = {
    text: text.trim(),
    voiceURI: options.voiceURI ?? '',
    rate: clampRate(options.rate ?? 1),
    pitch: clampPitch(options.pitch ?? 1),
  };
  const at = Math.max(0, options.atMs ?? usePlaybackStore.getState().currentTimeMs);
  const durationMs = estimateSpeechMs(tts.text, tts.rate);
  let clipId = '';
  useTimelineStore.getState().edit('speech-add', (tracks) => {
    const free = freeAudioTrack(tracks, at, at + durationMs);
    const added = free
      ? { tracks, trackId: free.id }
      : addTrack(tracks, 'audio', undefined, t.timeline.trackKinds.audio);
    const clip = createSpeechClip(added.trackId, at, durationMs, tts);
    clipId = clip.id;
    return appendClip(added.tracks, added.trackId, clip);
  });
  if (clipId !== '') useTimelineStore.getState().selectClips([clipId]);
  return clipId;
}

/** Altera a fala de um clipe (texto, voz, velocidade ou tom). Se texto ou velocidade mudarem, a duração é re-estimada; edições seguidas viram um passo só. */
export function updateSpeech(clipId: string, patch: Partial<TtsData>): void {
  const found = findClip(currentTracks(), clipId);
  if (found?.clip.tts === undefined || found.track.locked) return;
  const current = found.clip.tts;
  const next: TtsData = {
    text: patch.text ?? current.text,
    voiceURI: patch.voiceURI ?? current.voiceURI,
    rate: clampRate(patch.rate ?? current.rate),
    pitch: clampPitch(patch.pitch ?? current.pitch),
  };
  const timingChanged = next.text !== current.text || next.rate !== current.rate;
  const durationMs = timingChanged ? estimateSpeechMs(next.text, next.rate) : found.clip.durationMs;
  useTimelineStore.getState().edit(
    'speech-update',
    (tracks) => resizeSpeech(tracks, clipId, next, durationMs),
    undefined,
    { coalesceKey: `speech:${clipId}` },
  );
}

/** Fala o texto agora, para o botão "Ouvir"; cala a fala anterior. Sem suporte ao speechSynthesis não faz nada. */
export function previewSpeech(text: string, voiceURI: string, rate: number, pitch: number): void {
  const output = browserSpeechOutput();
  if (output === null || text.trim() === '') return;
  output.cancel();
  output.speak({ text, voiceURI, rate: clampRate(rate), pitch: clampPitch(pitch), volume: 1 });
}
