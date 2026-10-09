// Toca na prévia as falas sintéticas (speechSynthesis) quando o cursor entra nos clipes de fala. A voz não entra na exportação.
import type { Clip, Project } from '@/types';
import { currentSynthesis, pickPortugueseVoice } from './voices';

/** Janela, em ms desde o início do clipe, em que a fala é disparada. */
const TRIGGER_WINDOW_MS = 200;

/** Pedido de fala já com os parâmetros do clipe. */
export interface SpeechRequest {
  /** Texto a falar. */
  text: string;
  /** voiceURI pedido pelo clipe (vazio = primeira voz pt-BR). */
  voiceURI: string;
  /** Velocidade da fala. */
  rate: number;
  /** Tom da fala. */
  pitch: number;
  /** Volume de 0 a 1. */
  volume: number;
}

/** Quem efetivamente fala: o navegador, ou um falso nos testes. */
export interface SpeechOutput {
  /** Começa a falar o pedido. */
  speak(request: SpeechRequest): void;
  /** Cala a fala em andamento. */
  cancel(): void;
}

/** Controlador de falas: sincronizado a cada tique da reprodução pelo playbackController. */
export interface TtsPlayer {
  /** Dispara a fala do clipe que o cursor acabou de alcançar e cala a que saiu do cursor; reprodução parada = cancel. */
  sync(project: Project | null, timelineMs: number, playing: boolean): void;
  /** Cala a fala e recomeça a passagem (pausa, seek, fim ou início da reprodução). */
  cancel(): void;
}

/** Saída pelo speechSynthesis do navegador, ou null se a API não existir. */
export function browserSpeechOutput(synth: SpeechSynthesis | null = currentSynthesis()): SpeechOutput | null {
  if (synth === null) return null;
  return {
    speak(request) {
      const utterance = new SpeechSynthesisUtterance(request.text);
      const voice = pickPortugueseVoice(synth.getVoices(), request.voiceURI);
      if (voice !== undefined) utterance.voice = voice;
      utterance.rate = request.rate;
      utterance.pitch = request.pitch;
      utterance.volume = request.volume;
      synth.speak(utterance);
    },
    cancel() {
      synth.cancel();
    },
  };
}

/** Acha um clipe pelo id em todas as trilhas do projeto. */
function findClip(project: Project, clipId: string): Clip | undefined {
  for (const track of project.tracks) {
    const found = track.clips.find((clip) => clip.id === clipId);
    if (found !== undefined) return found;
  }
  return undefined;
}

/** Cria um controlador de falas. Sem saída (sem speechSynthesis), nada é falado. */
export function createTtsPlayer(output: SpeechOutput | null = browserSpeechOutput()): TtsPlayer {
  // Clipes já falados na passagem atual: cada um fala no máximo uma vez por passagem.
  const spoken = new Set<string>();
  let activeClipId: string | null = null;
  let lastMs = Number.NEGATIVE_INFINITY;

  /** Cala a fala em andamento, se houver, e esquece o clipe ativo. */
  function stopActive(): void {
    if (activeClipId === null) return;
    activeClipId = null;
    output?.cancel();
  }

  /** Acha o clipe de fala cujo início o cursor acabou de alcançar, se ainda não foi falado nesta passagem. */
  function findStarting(project: Project, timelineMs: number): Clip | undefined {
    for (const track of project.tracks) {
      if (track.muted) continue;
      for (const clip of track.clips) {
        // Clipe silenciado (botão de mudo) não fala.
        if (clip.tts === undefined || clip.tts.text.trim() === '' || clip.audio.muted === true) continue;
        const inWindow = timelineMs >= clip.startMs && timelineMs < clip.startMs + TRIGGER_WINDOW_MS;
        if (inWindow && !spoken.has(clip.id)) return clip;
      }
    }
    return undefined;
  }

  /** Dispara a fala do clipe com o volume dele e marca-o como falado. */
  function speakClip(clip: Clip): void {
    if (clip.tts === undefined || output === null) return;
    spoken.add(clip.id);
    activeClipId = clip.id;
    output.cancel();
    output.speak({
      text: clip.tts.text,
      voiceURI: clip.tts.voiceURI,
      rate: clip.tts.rate,
      pitch: clip.tts.pitch,
      volume: Math.min(1, Math.max(0, clip.volume)),
    });
  }

  /** Cancela tudo e começa uma passagem nova. */
  function cancel(): void {
    spoken.clear();
    activeClipId = null;
    lastMs = Number.NEGATIVE_INFINITY;
    output?.cancel();
  }

  /** Um tique da reprodução: volta de passagem se o cursor recuou; cala se saiu do clipe; fala se entrou num clipe de fala. */
  function sync(project: Project | null, timelineMs: number, playing: boolean): void {
    if (!playing || project === null) {
      cancel();
      return;
    }
    if (timelineMs < lastMs) spoken.clear();
    lastMs = timelineMs;
    if (activeClipId !== null) {
      const active = findClip(project, activeClipId);
      const stillInside =
        active !== undefined && timelineMs >= active.startMs && timelineMs < active.startMs + active.durationMs;
      if (!stillInside) stopActive();
    }
    const starting = findStarting(project, timelineMs);
    if (starting !== undefined) speakClip(starting);
  }

  return { sync, cancel };
}
