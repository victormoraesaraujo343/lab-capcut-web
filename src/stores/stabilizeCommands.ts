// Estabilização de clipe: analisa o trecho de mídia e grava keyframes de posição (x, y) que compensam o tremor.
import type { Clip, Keyframe } from '@/types';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { containSize } from '@/engine/render/matrix';
import { evaluateNumber } from '@/engine/render/keyframes';
import { curveAverageSpeed } from '@/engine/timeline/speedCurve';
import { analyzeClip, type StabilizeAnalysis } from '@/engine/stabilize/stabilizeClient';
import { accumulate, compensation, cropScaleFor, smooth, type Shift } from '@/engine/stabilize/trajectory';
import { useJobsStore } from './jobsStore';
import { useProjectStore } from './projectStore';
import { useTimelineStore } from './timelineStore';

/** Raio mínimo da média móvel, em amostras (força zero). */
const MIN_RADIUS = 5;
/** Acréscimo do raio em amostras para força máxima (raio final 30). */
const RADIUS_SPAN = 25;

/** Limita a força a [0, 1]. */
function clampStrength(strength: number): number {
  return Math.min(1, Math.max(0, strength));
}

/** Velocidade média do clipe (constante, ou média da curva); usada para converter tempo de mídia em tempo local. */
export function clipSpeedFactor(clip: Clip): number {
  const value = clip.speed.mode === 'curve' ? curveAverageSpeed(clip.speed.curve) : clip.speed.value;
  return value > 0 && Number.isFinite(value) ? value : 1;
}

/** Instante local do clipe (ms) correspondente a um instante de mídia, com a velocidade média (aproximação na curva). */
function mediaToLocal(clip: Clip, mediaMs: number, speedFactor: number): number {
  const consumed = (mediaMs - clip.trimInMs) / speedFactor;
  const local = clip.reversed ? clip.durationMs - consumed : consumed;
  return Math.min(clip.durationMs, Math.max(0, local));
}

/**
 * Junta os keyframes de posição novos (amostras lineares dentro do trecho analisado) com os antigos que caem
 * fora do trecho, mantendo a ordem por tempo. Os antigos dentro do trecho são substituídos pelas amostras.
 */
function mergePositionKeys(
  existing: Keyframe<number>[] | undefined,
  points: { timeMs: number; value: number }[],
): Keyframe<number>[] {
  if (points.length === 0) return existing ?? [];
  const spanStart = Math.min(...points.map((p) => p.timeMs));
  const spanEnd = Math.max(...points.map((p) => p.timeMs));
  const kept = (existing ?? []).filter((k) => k.timeMs < spanStart || k.timeMs > spanEnd);
  const fresh: Keyframe<number>[] = [];
  for (const point of points) {
    const last = fresh[fresh.length - 1];
    if (last && point.timeMs <= last.timeMs) continue;
    fresh.push({ timeMs: point.timeMs, value: point.value, easing: 'linear' });
  }
  return [...kept, ...fresh].sort((a, b) => a.timeMs - b.timeMs);
}

/**
 * Clipe com a estabilização aplicada: a posição animada atual de x e y em cada amostra recebe a compensação
 * (keyframes antigos fora do trecho analisado são mantidos); a escala base e as de scaleX/scaleY, por
 * multiplicação, sobem pelo zoom mínimo que esconde as bordas.
 * Sem análise útil ou com congelamento de quadro, devolve o clipe igual.
 */
export function stabilizedClip(
  clip: Clip,
  analysis: StabilizeAnalysis,
  projectWidth: number,
  projectHeight: number,
  strength: number,
): Clip {
  if (clip.freezeFrameMs !== undefined || analysis.timesMs.length === 0) return clip;
  const fitted = containSize(analysis.sourceWidth, analysis.sourceHeight, projectWidth, projectHeight);
  const shownW = fitted.width * Math.abs(clip.transform.scaleX);
  const shownH = fitted.height * Math.abs(clip.transform.scaleY);
  const kx = shownW / analysis.analysisWidth;
  const ky = shownH / analysis.analysisHeight;
  const projectShifts: Shift[] = analysis.shifts.map((s) => ({ dx: s.dx * kx, dy: s.dy * ky }));
  const raw = accumulate(projectShifts);
  const radius = Math.round(MIN_RADIUS + RADIUS_SPAN * clampStrength(strength));
  const comp = compensation(raw, smooth(raw, radius));
  const scale = cropScaleFor(comp, shownW, shownH);

  const speedFactor = clipSpeedFactor(clip);
  const xPoints: { timeMs: number; value: number }[] = [];
  const yPoints: { timeMs: number; value: number }[] = [];
  for (const [i, mediaMs] of analysis.timesMs.entries()) {
    const c = comp[i];
    if (!c) continue;
    const timeMs = mediaToLocal(clip, mediaMs, speedFactor);
    // Posição animada atual naquele instante (keyframes existentes, ou o valor base) + compensação.
    const currentX = evaluateNumber(clip.keyframes, 'x', timeMs, clip.transform.x);
    const currentY = evaluateNumber(clip.keyframes, 'y', timeMs, clip.transform.y);
    xPoints.push({ timeMs, value: currentX + c.dx });
    yPoints.push({ timeMs, value: currentY + c.dy });
  }
  xPoints.sort((a, b) => a.timeMs - b.timeMs);
  yPoints.sort((a, b) => a.timeMs - b.timeMs);

  const keyframes = { ...clip.keyframes };
  const x = mergePositionKeys(clip.keyframes.x, xPoints);
  const y = mergePositionKeys(clip.keyframes.y, yPoints);
  if (x.length > 0) keyframes.x = x;
  if (y.length > 0) keyframes.y = y;
  for (const key of ['scaleX', 'scaleY'] as const) {
    const existing = keyframes[key];
    if (existing) keyframes[key] = existing.map((k) => ({ ...k, value: k.value * scale }));
  }
  const transform = {
    ...clip.transform,
    scaleX: clip.transform.scaleX * scale,
    scaleY: clip.transform.scaleY * scale,
  };
  return { ...clip, transform, keyframes };
}

/** Erros de precondição ou de análise que aparecem no job (código curto para a interface). */
export type StabilizeErrorCode = 'stabilize-unsupported' | 'stabilize-clip-missing' | 'stabilize-failed';

/** Contador para dar um id único a cada job de estabilização. */
let jobSequence = 0;

/** Estabiliza o clipe: analisa o trecho de mídia, compensa o tremor com keyframes de x/y e grava uma única edição. */
export async function stabilizeClip(clipId: string, strength = 0.5): Promise<void> {
  const jobId = `stabilize-${++jobSequence}`;
  const controller = new AbortController();
  const jobs = useJobsStore.getState();
  jobs.start({ id: jobId, kind: 'stabilize', clipId, cancel: () => controller.abort() });
  try {
    const project = useProjectStore.getState().project;
    const found = project ? findClip(project.tracks, clipId) : null;
    const clip = found?.clip;
    const asset = clip?.assetId ? project?.assets.find((a) => a.id === clip.assetId) : undefined;
    if (!project || !clip || !asset || asset.kind !== 'video' || clip.freezeFrameMs !== undefined) {
      throw new Error('stabilize-unsupported');
    }
    const speedFactor = clipSpeedFactor(clip);
    const startMediaMs = clip.trimInMs;
    const spanEnd = clip.trimInMs + clip.durationMs * speedFactor;
    const endMediaMs = asset.durationMs === undefined ? spanEnd : Math.min(spanEnd, asset.durationMs);
    if (endMediaMs <= startMediaMs) throw new Error('stabilize-unsupported');

    const analysis = await analyzeClip(
      asset,
      startMediaMs,
      endMediaMs,
      (fraction) => useJobsStore.getState().update(jobId, fraction),
      controller.signal,
    );

    const latest = useProjectStore.getState().project;
    if (!latest || !findClip(latest.tracks, clipId)) throw new Error('stabilize-clip-missing');
    useTimelineStore
      .getState()
      .edit('stabilize', (tracks) =>
        updateClip(tracks, clipId, (c) => stabilizedClip(c, analysis, latest.width, latest.height, strength)),
      );
    useJobsStore.getState().finish(jobId);
  } catch (error) {
    if (controller.signal.aborted) return;
    useJobsStore.getState().fail(jobId, toErrorCode(error));
  }
}

/** Converte a falha num código de erro do job; falhas desconhecidas viram 'stabilize-failed'. */
function toErrorCode(error: unknown): StabilizeErrorCode {
  const message = error instanceof Error ? error.message : '';
  if (message === 'stabilize-unsupported' || message === 'stabilize-clip-missing') return message;
  return 'stabilize-failed';
}
