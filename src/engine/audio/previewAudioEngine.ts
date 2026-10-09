// Motor de áudio da prévia: agenda os trechos no Web Audio e expõe o relógio mestre da reprodução.

import type { Asset, Clip, Project } from '../../types/project';
import { createAudioBufferCache, type AudioBufferCache } from './audioBufferCache';
import { computeSegments, type ScheduledSegment } from './audioSchedule';
import { scheduleSegment, trimPassed, type ActiveNode } from './audioNodes';

/** Folga, em segundos, entre o agendamento e o primeiro som, para dar tempo ao motor de áudio. */
const START_LEAD_S = 0.05;
/** Volume máximo do canal mestre. */
const MAX_MASTER_VOLUME = 2;

/** Motor de áudio da prévia. */
export interface PreviewAudioEngine {
  /** Começa a tocar o projeto a partir do instante dado, em ms da timeline. O relógio começa na hora. */
  play(project: Project, fromTimelineMs: number): Promise<void>;
  /** Retorna o instante atual da timeline, em ms (relógio mestre). */
  currentTimelineMs(): number;
  /** Diz se o relógio está andando (mesmo sem som, quando o áudio não está disponível). */
  isClockRunning(): boolean;
  /** Para a reprodução e desconecta todos os nós. */
  stop(): void;
  /** Se estiver tocando, reagenda a partir do instante atual para refletir edições. */
  reschedule(project: Project): void;
  /** Define o volume do canal mestre, de 0 a 2. */
  setMasterVolume(volume: number): void;
  /** Informa se a reprodução está ativa. */
  isPlaying(): boolean;
  /** Libera o AudioContext e os buffers. */
  dispose(): void;
}

/** Base do relógio: tempo do AudioContext (com som) ou performance.now() (sem som), nunca os dois. */
type ClockBase = { kind: 'audio'; ctxTime: number } | { kind: 'wall'; perfMs: number };

interface Anchor {
  /** Instante da timeline, em ms, no começo da base do relógio. */
  timelineMsAtStart: number;
  /** Base usada para medir o tempo decorrido. */
  base: ClockBase;
}

/** Cria o motor de áudio da prévia, com um único AudioContext preguiçoso. */
export function createPreviewAudioEngine(): PreviewAudioEngine {
  let ctx: AudioContext | null = null;
  let master: GainNode | null = null;
  let cache: AudioBufferCache | null = null;
  let masterVolume = 1;
  let playing = false;
  let anchor: Anchor | null = null;
  let lastTimelineMs = 0;
  let generation = 0;
  let activeNodes: ActiveNode[] = [];

  function ensureContext(): AudioContext {
    if (ctx !== null) {
      return ctx;
    }
    const created = new AudioContext({ latencyHint: 'interactive' });
    const masterNode = created.createGain();
    masterNode.gain.value = masterVolume;
    masterNode.connect(created.destination);
    ctx = created;
    master = masterNode;
    cache = createAudioBufferCache(created);
    return created;
  }

  /** Contexto de áudio, ou null se o navegador não consegue criá-lo (a prévia segue sem som). */
  function obtainContext(): AudioContext | null {
    try {
      return ensureContext();
    } catch {
      return null;
    }
  }

  /** Milissegundos medidos pela base do relógio desde o seu início. */
  function elapsedMs(base: ClockBase): number {
    if (base.kind === 'wall') {
      return performance.now() - base.perfMs;
    }
    return ctx === null ? 0 : (ctx.currentTime - base.ctxTime) * 1000;
  }

  function currentTimelineMs(): number {
    if (!playing || anchor === null) {
      return lastTimelineMs;
    }
    return anchor.timelineMsAtStart + Math.max(0, elapsedMs(anchor.base));
  }

  function stopNodes(): void {
    for (const node of activeNodes) {
      node.source.stop();
      node.source.disconnect();
      node.gain.disconnect();
    }
    activeNodes = [];
  }

  /** Começa o relógio na hora; o áudio é agendado depois, quando cada buffer ficar pronto. */
  function startFrom(project: Project, fromTimelineMs: number): void {
    const token = ++generation;
    playing = true;
    lastTimelineMs = fromTimelineMs;
    stopNodes();
    const context = obtainContext();
    if (context !== null && context.state === 'running') {
      anchor = {
        timelineMsAtStart: fromTimelineMs,
        base: { kind: 'audio', ctxTime: context.currentTime + START_LEAD_S },
      };
      void scheduleSound(token, context, project, computeSegments(project, fromTimelineMs));
      return;
    }
    anchor = { timelineMsAtStart: fromTimelineMs, base: { kind: 'wall', perfMs: performance.now() } };
    if (context !== null) {
      void resumeAndRestart(context, project, token);
    }
  }

  /** Retoma o contexto suspenso; se conseguir, recomeça a partir do instante atual com som. */
  async function resumeAndRestart(context: AudioContext, project: Project, token: number): Promise<void> {
    try {
      await context.resume();
    } catch {
      // Sem som: o relógio continua pelo performance.now().
      return;
    }
    if (token === generation && context.state === 'running') {
      startFrom(project, currentTimelineMs());
    }
  }

  /** Carrega os buffers de cada asset e agenda os trechos assim que cada um estiver pronto. */
  async function scheduleSound(
    token: number,
    context: AudioContext,
    project: Project,
    segments: ScheduledSegment[],
  ): Promise<void> {
    const assets = new Map<string, Asset>(project.assets.map((asset) => [asset.id, asset] as const));
    const clips = indexClips(project);
    const assetIds = Array.from(new Set(segments.map((segment) => segment.assetId)));
    await Promise.all(
      assetIds.map(async (assetId) => {
        const asset = assets.get(assetId);
        if (asset === undefined || cache === null) {
          return;
        }
        const buffer = await loadBuffer(cache, asset);
        const out = master;
        if (buffer === null || out === null || token !== generation) {
          return;
        }
        const mine = segments.filter((segment) => segment.assetId === assetId);
        scheduleReady(context, out, buffer, clips, mine);
      }),
    );
  }

  /** Agenda os trechos de um buffer já carregado, pulando o que já passou e ajustando o início dos demais. */
  function scheduleReady(
    context: AudioContext,
    out: GainNode,
    buffer: AudioBuffer,
    clips: Map<string, Clip>,
    segments: ScheduledSegment[],
  ): void {
    const current = anchor;
    if (current === null || current.base.kind !== 'audio') {
      return;
    }
    const nowMs = currentTimelineMs();
    for (const segment of segments) {
      const clip = clips.get(segment.clipId);
      const remaining = clip === undefined ? null : trimPassed(segment, nowMs);
      if (clip === undefined || remaining === null) {
        continue;
      }
      const when = current.base.ctxTime + (remaining.startAtTimelineMs - current.timelineMsAtStart) / 1000;
      activeNodes.push(scheduleSegment(context, out, buffer, clip, remaining, when));
    }
  }

  return {
    play(project: Project, fromTimelineMs: number): Promise<void> {
      startFrom(project, fromTimelineMs);
      return Promise.resolve();
    },
    currentTimelineMs,
    isClockRunning(): boolean {
      return playing && anchor !== null;
    },
    stop(): void {
      if (!playing) {
        return;
      }
      lastTimelineMs = currentTimelineMs();
      generation++;
      playing = false;
      anchor = null;
      stopNodes();
    },
    reschedule(project: Project): void {
      if (!playing) {
        return;
      }
      startFrom(project, currentTimelineMs());
    },
    setMasterVolume(volume: number): void {
      masterVolume = Math.min(MAX_MASTER_VOLUME, Math.max(0, volume));
      if (master !== null && ctx !== null) {
        master.gain.setValueAtTime(masterVolume, ctx.currentTime);
      }
    },
    isPlaying(): boolean {
      return playing;
    },
    dispose(): void {
      generation++;
      playing = false;
      anchor = null;
      stopNodes();
      cache?.clear();
      cache = null;
      master = null;
      if (ctx !== null) {
        void ctx.close();
      }
      ctx = null;
    },
  };
}

/** Carrega o buffer do asset; falha vira null para a prévia seguir sem esse som. */
async function loadBuffer(bufferCache: AudioBufferCache, asset: Asset): Promise<AudioBuffer | null> {
  try {
    return await bufferCache.get(asset);
  } catch {
    return null;
  }
}

function indexClips(project: Project): Map<string, Clip> {
  const clips = new Map<string, Clip>();
  for (const track of project.tracks) {
    for (const clip of track.clips) {
      clips.set(clip.id, clip);
    }
  }
  return clips;
}
