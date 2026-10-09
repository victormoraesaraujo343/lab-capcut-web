// Hook de geração de legendas: prepara o áudio, transcreve no navegador e cria a trilha de legendas no tempo certo.
import { useCallback, useEffect, useRef, useState } from 'react';
import { prepareSpeechAudio } from '@/engine/captions/speechAudio';
import { transcribe, type TranscribeHandle } from '@/engine/captions/transcribeClient';
import type { TimedText } from '@/engine/captions/captionSegmenter';
import type { TranscribeLanguage, WhisperModelSize } from '@/engine/captions/transcribeProtocol';
import { findClip } from '@/engine/timeline/clipOps';
import { useProjectStore } from '@/stores/projectStore';
import { addCaptions, type CaptionInput } from '@/stores/textCommands';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Project, Track } from '@/types';

/** Estados possíveis da geração de legendas. */
export type CaptionStatus = 'idle' | 'preparing' | 'downloading' | 'transcribing' | 'done' | 'error' | 'empty';

/** Estado atual da geração de legendas. */
export interface CaptionGenerationState {
  /** Fase atual. */
  status: CaptionStatus;
  /** Progresso de 0 a 1 dentro da fase atual. */
  progress: number;
  /** Quantas legendas foram criadas na última geração concluída. */
  count: number;
  /** Mensagem técnica do último erro, se houver. */
  message?: string;
}

/** Opções para iniciar uma geração. */
export interface CaptionStartOptions {
  /** Áudio do projeto inteiro ou só do clipe selecionado. */
  source: 'project' | 'selected';
  /** Idioma falado, ou 'auto' para detectar. */
  language: TranscribeLanguage;
  /** Tamanho do modelo de reconhecimento. */
  model: WhisperModelSize;
}

/** Retorno do hook: estado e controles. */
export interface CaptionGeneration {
  /** Estado atual. */
  state: CaptionGenerationState;
  /** Inicia uma geração; ignorada se já houver uma em andamento. */
  start: (options: CaptionStartOptions) => void;
  /** Cancela a geração em andamento e volta ao estado ocioso. */
  cancel: () => void;
}

/** Intervalo de tempo do projeto, em ms. */
interface TimeRange {
  /** Início do intervalo. */
  startMs: number;
  /** Fim do intervalo. */
  endMs: number;
}

/** Uma geração em andamento, com o controle de cancelamento. */
interface Run {
  /** Cancela a preparação do áudio. */
  controller: AbortController;
  /** Transcrição em andamento, quando já começou. */
  handle: TranscribeHandle | null;
}

/** Função que aplica um pedaço de estado. */
type Update = (patch: Partial<CaptionGenerationState>) => void;

/** Estado ocioso, usado no início e após cancelar. */
const IDLE: CaptionGenerationState = { status: 'idle', progress: 0, count: 0 };

/** Intervalo do projeto inteiro: do início ao fim do último clipe; null se o projeto estiver vazio. */
function projectRange(tracks: Track[]): TimeRange | null {
  let endMs = 0;
  for (const track of tracks) {
    for (const clip of track.clips) {
      endMs = Math.max(endMs, clip.startMs + clip.durationMs);
    }
  }
  return endMs > 0 ? { startMs: 0, endMs } : null;
}

/** Intervalo que cobre os clipes selecionados; null se nenhum deles existir. */
function selectedRange(tracks: Track[], ids: string[]): TimeRange | null {
  let startMs = Infinity;
  let endMs = -Infinity;
  for (const id of ids) {
    const location = findClip(tracks, id);
    if (location === null) continue;
    startMs = Math.min(startMs, location.clip.startMs);
    endMs = Math.max(endMs, location.clip.startMs + location.clip.durationMs);
  }
  return endMs > startMs ? { startMs, endMs } : null;
}

/** Converte os trechos do Whisper em legendas na timeline, somando o início do intervalo e limitando ao fim dele. */
function toCaptionInputs(chunks: TimedText[], range: TimeRange): CaptionInput[] {
  return chunks.flatMap((chunk) => {
    const text = chunk.text.trim();
    const startMs = range.startMs + chunk.startMs;
    const endMs = Math.min(range.startMs + chunk.endMs, range.endMs);
    return text !== '' && endMs > startMs ? [{ startMs, endMs, text }] : [];
  });
}

/** Tudo o que a geração precisa, reunido para não passar muitos parâmetros. */
interface Job {
  run: Run;
  project: Project;
  range: TimeRange;
  options: CaptionStartOptions;
  update: Update;
  isCurrent: () => boolean;
}

/** Executa a geração de ponta a ponta; só atualiza o estado enquanto a execução for a atual. */
async function generate(job: Job): Promise<void> {
  const { run, project, range, options, update, isCurrent } = job;
  try {
    const audio = await prepareSpeechAudio(project, range, run.controller.signal);
    if (!isCurrent()) return;
    if (audio === null) {
      update({ status: 'empty', progress: 0 });
      return;
    }
    run.handle = transcribe(audio, { language: options.language, model: options.model }, (progress) => {
      if (!isCurrent()) return;
      update({
        status: progress.phase === 'download' ? 'downloading' : 'transcribing',
        progress: progress.fraction,
      });
    });
    const chunks = await run.handle.result;
    if (!isCurrent()) return;
    const inputs = toCaptionInputs(chunks, range);
    if (inputs.length === 0) {
      update({ status: 'empty', progress: 0 });
      return;
    }
    const ids = addCaptions(inputs);
    update({ status: 'done', progress: 1, count: ids.length });
  } catch (error) {
    if (!isCurrent()) return;
    update({
      status: 'error',
      progress: 0,
      count: 0,
      message: error instanceof Error ? error.message : undefined,
    });
  }
}

/** Hook que gera legendas automáticas do projeto ou do clipe selecionado, com progresso e cancelamento. */
export function useCaptionGeneration(): CaptionGeneration {
  const [state, setState] = useState<CaptionGenerationState>(IDLE);
  const runRef = useRef<Run | null>(null);

  /** Aplica um pedaço de estado. */
  const update = useCallback<Update>((patch) => {
    setState((previous) => ({ ...previous, ...patch }));
  }, []);

  /** Cancela a geração atual, se houver, e volta ao estado ocioso. */
  const cancel = useCallback(() => {
    const run = runRef.current;
    runRef.current = null;
    if (run !== null) {
      run.controller.abort();
      run.handle?.cancel();
    }
    setState(IDLE);
  }, []);

  /** Inicia uma geração com o intervalo escolhido; sem projeto, sem intervalo ou já em andamento, não faz nada. */
  const start = useCallback(
    (options: CaptionStartOptions) => {
      const project = useProjectStore.getState().project;
      if (project === null || runRef.current !== null) return;
      const range =
        options.source === 'selected'
          ? selectedRange(project.tracks, useTimelineStore.getState().selectedClipIds)
          : projectRange(project.tracks);
      if (range === null) {
        setState({ ...IDLE, status: 'empty' });
        return;
      }
      const run: Run = { controller: new AbortController(), handle: null };
      runRef.current = run;
      setState({ status: 'preparing', progress: 0, count: 0 });
      const isCurrent = () => runRef.current === run;
      void generate({ run, project, range, options, update, isCurrent }).finally(() => {
        if (isCurrent()) runRef.current = null;
      });
    },
    [update],
  );

  useEffect(() => {
    return () => {
      const run = runRef.current;
      runRef.current = null;
      run?.controller.abort();
      run?.handle?.cancel();
    };
  }, []);

  return { state, start, cancel };
}
