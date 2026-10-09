// Comandos da gravação de narração: pede o microfone, faz a contagem, grava a partir do cursor com a prévia tocando e, ao parar, vira um clipe de áudio.
// Para o som do projeto não entrar na gravação, o ideal é usar fones de ouvido (há uma dica na contagem).
import type { Asset, Track } from '@/types';
import { clipEndMs } from '@/types';
import { t } from '@/i18n/pt-BR';
import { createClipFromAsset } from '@/engine/timeline/clipFactory';
import { addTrack, placeClip } from '@/engine/timeline/trackOps';
import { createLevelMeter, type LevelMeter } from '@/engine/recording/levelMeter';
import {
  createRecorder,
  requestMicrophone,
  RecordingError,
  type Recorder,
  type RecordingErrorCode,
} from '@/engine/recording/recorder';
import { useRecordingStore } from './recordingStore';
import { useProjectStore } from './projectStore';
import { clampTimeMs, usePlaybackStore } from './playbackStore';
import { useTimelineStore } from './timelineStore';

/** Número com que começa a contagem regressiva. */
const COUNTDOWN_START = 3;
/** Duração de cada passo da contagem, em ms. */
const COUNTDOWN_STEP_MS = 1000;
/** Intervalo de atualização do tempo gravado, em ms. */
const ELAPSED_TICK_MS = 100;

/** Gravação em curso: stream do microfone, gravador, medidor e o ponto de início. */
interface Session {
  /** Stream do microfone; as faixas são paradas ao liberar. */
  stream: MediaStream;
  /** Gravador criado quando a contagem termina; null antes disso. */
  recorder: Recorder | null;
  /** Medidor de nível, ou null se o navegador não tem AudioContext. */
  meter: LevelMeter | null;
  /** Contexto de áudio do medidor, fechado ao liberar. */
  audioCtx: AudioContext | null;
  /** Projeto aberto no início, para não colocar o áudio em outro projeto. */
  projectId: string;
  /** Posição do cursor no início da gravação, em ms. */
  startMs: number;
  /** Relógio de parede no início da gravação, em ms. */
  startedAt: number;
}

/** Sessão ativa, ou null. */
let session: Session | null = null;
/** Temporizador da contagem regressiva. */
let countdownTimer: ReturnType<typeof setTimeout> | null = null;
/** Temporizador que atualiza o tempo gravado. */
let elapsedTimer: ReturnType<typeof setInterval> | null = null;
/** Geração do pedido de microfone em curso; cancelar muda este número, e um stream com número velho é descartado. */
let requestToken = 0;

/** Para os temporizadores da contagem e do tempo gravado. */
function stopTimers(): void {
  if (countdownTimer !== null) clearTimeout(countdownTimer);
  if (elapsedTimer !== null) clearInterval(elapsedTimer);
  countdownTimer = null;
  elapsedTimer = null;
}

/** Para os temporizadores e libera o microfone, o medidor e o contexto de áudio. */
function releaseSession(): void {
  stopTimers();
  const current = session;
  session = null;
  if (current === null) return;
  current.stream.getTracks().forEach((track) => track.stop());
  current.meter?.dispose();
  if (current.audioCtx !== null) void current.audioCtx.close().catch(() => undefined);
}

/** Volta a gravação ao estado parado, sem erro. */
function resetState(): void {
  useRecordingStore.setState({ status: 'idle', countdown: 0, elapsedMs: 0, startMs: 0, errorCode: undefined });
}

/** Encerra com erro, libera tudo e, se estava gravando, pausa a prévia. */
function failWith(code: RecordingErrorCode | 'save'): void {
  if (useRecordingStore.getState().status === 'recording') usePlaybackStore.getState().pause();
  releaseSession();
  useRecordingStore.setState({ status: 'error', countdown: 0, errorCode: code });
}

/** Cria o medidor de nível do stream; sem AudioContext, devolve nulos. */
function createMeter(stream: MediaStream): Pick<Session, 'meter' | 'audioCtx'> {
  if (typeof AudioContext !== 'function') return { meter: null, audioCtx: null };
  let ctx: AudioContext | null = null;
  try {
    ctx = new AudioContext();
    return { meter: createLevelMeter(ctx, stream), audioCtx: ctx };
  } catch {
    if (ctx !== null) void ctx.close().catch(() => undefined);
    return { meter: null, audioCtx: null };
  }
}

/** Posição atual do cursor, em ms. */
function playhead(): number {
  return usePlaybackStore.getState().currentTimeMs;
}

/** Mostra a contagem regressiva e, no zero, começa a gravar. */
function tickCountdown(remaining: number): void {
  if (remaining === 0) {
    beginRecording();
    return;
  }
  useRecordingStore.setState({ status: 'countdown', countdown: remaining });
  countdownTimer = setTimeout(() => {
    countdownTimer = null;
    tickCountdown(remaining - 1);
  }, COUNTDOWN_STEP_MS);
}

/**
 * Começa a gravar a partir do cursor e toca a prévia junto. O cursor é resolvido antes (no fim ou além, fica no fim);
 * depois de dar play, o início é lido de novo, porque o player pode voltar ao zero se estiver no fim.
 */
function beginRecording(): void {
  const current = session;
  if (current === null) return;
  const endMs = useProjectStore.getState().project?.durationMs ?? 0;
  const maxMs = endMs > 0 ? endMs : undefined;
  const resolvedMs = clampTimeMs(playhead(), maxMs);
  const playback = usePlaybackStore.getState();
  playback.seek(resolvedMs, maxMs);
  try {
    const recorder = createRecorder();
    recorder.start(current.stream);
    current.recorder = recorder;
  } catch {
    failWith('unsupported');
    return;
  }
  playback.play();
  if (playhead() !== resolvedMs) usePlaybackStore.getState().seek(resolvedMs, maxMs);
  const startMs = playhead();
  current.startMs = startMs;
  current.startedAt = Date.now();
  useRecordingStore.setState({ status: 'recording', countdown: 0, startMs, elapsedMs: 0 });
  elapsedTimer = setInterval(() => {
    useRecordingStore.setState({ elapsedMs: Date.now() - current.startedAt });
  }, ELAPSED_TICK_MS);
}

/** Pede o microfone e inicia a contagem regressiva; sem projeto aberto ou já em andamento, não faz nada. */
export async function startRecording(): Promise<void> {
  const { status } = useRecordingStore.getState();
  const project = useProjectStore.getState().project;
  if (project === null || (status !== 'idle' && status !== 'error')) return;
  const token = ++requestToken;
  useRecordingStore.setState({ status: 'requesting', countdown: 0, errorCode: undefined });
  try {
    const stream = await requestMicrophone();
    if (token !== requestToken) {
      // Cancelado enquanto o navegador pedia o microfone: solta o stream que chegou tarde.
      stream.getTracks().forEach((track) => track.stop());
      return;
    }
    const meter = createMeter(stream);
    session = { stream, recorder: null, ...meter, projectId: project.id, startMs: 0, startedAt: 0 };
    tickCountdown(COUNTDOWN_START);
  } catch (error) {
    if (token !== requestToken) return;
    failWith(error instanceof RecordingError ? error.code : 'busy');
  }
}

/** Para a gravação, cria o clipe de áudio no cursor de início e o seleciona. */
export async function stopRecording(): Promise<void> {
  const current = session;
  if (useRecordingStore.getState().status !== 'recording' || current === null || current.recorder === null) return;
  const recorder = current.recorder;
  const durationMs = Math.max(1, Date.now() - current.startedAt);
  usePlaybackStore.getState().pause();
  stopTimers();
  useRecordingStore.setState({ status: 'saving', elapsedMs: durationMs });
  let blob: Blob;
  try {
    blob = await recorder.stop();
  } catch {
    failWith('save');
    return;
  }
  releaseSession();
  await saveNarration(current, blob, durationMs);
}

/** Importa o áudio gravado e o coloca na linha do tempo; cada passo fica num único item do histórico. */
async function saveNarration(current: Session, blob: Blob, durationMs: number): Promise<void> {
  const before = new Set((useProjectStore.getState().project?.assets ?? []).map((a) => a.id));
  const file = new File([blob], narrationFileName(current.startedAt, blob.type), {
    type: blob.type || 'audio/webm',
  });
  try {
    await useProjectStore.getState().importFiles([file]);
  } catch {
    failWith('save');
    return;
  }
  const project = useProjectStore.getState().project;
  const asset = project?.assets.find((a) => a.kind === 'audio' && !before.has(a.id));
  if (project === null || asset === undefined || project.id !== current.projectId) {
    failWith('save');
    return;
  }
  // A duração real do arquivo (lida na importação) manda; o relógio só vale se o arquivo não trouxer duração.
  const clipMs = asset.durationMs !== undefined && asset.durationMs > 0 ? asset.durationMs : durationMs;
  const plan = placeRecordingClip(project.tracks, asset, current.startMs, clipMs);
  useTimelineStore.getState().edit('record', () => plan.tracks, [plan.clipId]);
  resetState();
}

/** Coloca o áudio gravado numa trilha de áudio livre em [startMs, startMs + durationMs]; se não houver, cria uma trilha. */
export function placeRecordingClip(
  tracks: Track[],
  asset: Asset,
  startMs: number,
  durationMs: number,
): { tracks: Track[]; clipId: string } {
  const end = startMs + durationMs;
  const free = tracks.find(
    (track) =>
      track.kind === 'audio' &&
      !track.locked &&
      track.clips.every((clip) => clipEndMs(clip) <= startMs || clip.startMs >= end),
  );
  const added = free === undefined ? addTrack(tracks, 'audio', undefined, t.timeline.trackKinds.audio) : null;
  const base = added?.tracks ?? tracks;
  const trackId = added?.trackId ?? free?.id ?? '';
  const clip = { ...createClipFromAsset(asset, trackId, startMs), durationMs: Math.round(durationMs) };
  return { tracks: placeClip(base, clip, trackId, startMs, 'overwrite'), clipId: clip.id };
}

/** Cancela a gravação: pedindo o microfone, invalida o pedido; na contagem, só cancela; gravando, descarta o que foi captado. Libera sempre o microfone. */
export function cancelRecording(): void {
  const { status } = useRecordingStore.getState();
  if (status === 'requesting') {
    requestToken++;
    resetState();
    return;
  }
  if (status === 'countdown') {
    releaseSession();
    resetState();
    return;
  }
  if (status !== 'recording' || session === null) return;
  usePlaybackStore.getState().pause();
  session.recorder?.cancel();
  releaseSession();
  resetState();
}

/** Tira o erro da tela e volta ao estado parado. */
export function dismissRecordingError(): void {
  if (useRecordingStore.getState().status === 'error') resetState();
}

/** Nível atual do microfone entre 0 e 1, ou 0 sem gravação com medidor. */
export function readRecordingLevel(): number {
  return session?.meter?.level() ?? 0;
}

/** Nome do arquivo da narração, com a data e a hora do início: "Narração AAAA-MM-DD HHhMM.ext". */
export function narrationFileName(atMs: number, mimeType: string): string {
  const date = new Date(atMs);
  const pad = (n: number): string => String(n).padStart(2, '0');
  const stamp = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}h${pad(date.getMinutes())}`;
  const extension = mimeType.includes('ogg') ? 'ogg' : 'webm';
  return `${t.recording.fileName} ${stamp}.${extension}`;
}
