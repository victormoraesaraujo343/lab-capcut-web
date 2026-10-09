// Remover fundo: gera a máscara do trecho do clipe, importa o MP4 como asset oculto e liga o efeito ao clipe.
import type { Asset, Clip, EffectInstance } from '@/types';
import { createId } from '@/engine/project/createProject';
import { generateMatte, MatteError, type MatteProgress } from '@/engine/matte/matteClient';
import { getEffect, defaultParams } from '@/engine/render/registry';
import { findClip, updateClip } from '@/engine/timeline/clipOps';
import { mediaOffsetAt } from '@/engine/timeline/speedCurve';
import { scheduleSave } from './projectPersistence';
import { useJobsStore } from './jobsStore';
import { useProjectStore } from './projectStore';
import { useTimelineStore } from './timelineStore';

/** Tipo do efeito que usa a máscara. */
const EFFECT_TYPE = 'removeBackground';
/** Duração, em ms, do trecho de um quadro congelado (freeze frame). */
const FREEZE_SPAN_MS = 1;
/** Parte do progresso total reservada ao download do modelo; o resto é a segmentação. */
const DOWNLOAD_SHARE = 0.2;

/** Falha de um passo do comando, com o código mostrado na interface. */
class CommandFailure extends Error {
  /** Código curto do erro (ex.: 'import'). */
  readonly code: string;

  /** Cria a falha com código e mensagem técnica. */
  constructor(code: string, message: string) {
    super(message);
    this.name = 'CommandFailure';
    this.code = code;
  }
}

/** Intervalo de mídia [startMs, endMs) que o clipe consome, em ms do asset (sem passar do fim da mídia). */
function mediaRangeOf(clip: Clip, assetDurationMs: number | undefined): { startMs: number; endMs: number } {
  if (clip.freezeFrameMs !== undefined) {
    return { startMs: clip.freezeFrameMs, endMs: clip.freezeFrameMs + FREEZE_SPAN_MS };
  }
  const startMs = clip.trimInMs;
  const span = mediaOffsetAt(clip.speed, clip.durationMs, clip.durationMs);
  const endMs = assetDurationMs === undefined ? startMs + span : Math.min(assetDurationMs, startMs + span);
  return { startMs, endMs };
}

/** Progresso total (0 a 1) a partir do progresso de uma geração: download primeiro, depois a segmentação. */
function overallProgress(progress: MatteProgress): number {
  return progress.phase === 'download'
    ? progress.fraction * DOWNLOAD_SHARE
    : DOWNLOAD_SHARE + progress.fraction * (1 - DOWNLOAD_SHARE);
}

/** Código de erro mostrado no trabalho: 'model' se o download do modelo falhou, senão o código do passo. */
function errorCodeOf(error: unknown): string {
  if (error instanceof CommandFailure) return error.code;
  if (error instanceof MatteError && error.phase === 'download') return 'model';
  return 'matte';
}

/** Diz se o erro veio de um cancelamento pelo usuário. */
function isAbort(error: unknown): boolean {
  return error instanceof DOMException && error.name === 'AbortError';
}

/** Importa o MP4 da máscara pela fila de importação e devolve o asset novo (identificado pelo nome). */
async function importMatte(asset: Asset, data: ArrayBuffer): Promise<Asset> {
  const before = new Set(useProjectStore.getState().project?.assets.map((a) => a.id));
  const file = new File([data], `${asset.name} (máscara).mp4`, { type: 'video/mp4' });
  await useProjectStore.getState().importFiles([file]);
  const matte = useProjectStore
    .getState()
    .project?.assets.find((a) => !before.has(a.id) && a.name === file.name);
  if (matte === undefined) throw new CommandFailure('import', 'matte-import-failed');
  return matte;
}

/** Marca o asset importado como máscara do asset de origem, gravando o projeto. */
function markAsMatte(matteId: string, sourceId: string): void {
  const store = useProjectStore.getState();
  const project = store.project;
  if (project === null) return;
  const next = {
    ...project,
    updatedAt: Date.now(),
    assets: project.assets.map((a) =>
      a.id === matteId ? { ...a, role: 'matte' as const, sourceAssetId: sourceId } : a,
    ),
  };
  store.setProject(next);
  scheduleSave(next);
}

/** Liga o efeito removeBackground ao clipe (ou atualiza o existente) com o id da máscara e o deslocamento do trecho, num único passo. */
function linkMatteEffect(clipId: string, matteId: string, offsetMs: number): void {
  if (getEffect(EFFECT_TYPE) === undefined) return;
  const matteParams = { matteAssetId: matteId, matteOffsetMs: offsetMs };
  useTimelineStore.getState().edit('remove-background', (tracks) =>
    updateClip(tracks, clipId, (clip) => {
      const existing = clip.effects.find((e) => e.type === EFFECT_TYPE);
      if (existing === undefined) {
        const instance: EffectInstance = {
          id: createId(),
          type: EFFECT_TYPE,
          params: { ...defaultParams(EFFECT_TYPE), ...matteParams },
        };
        return { ...clip, effects: [...clip.effects, instance] };
      }
      return {
        ...clip,
        effects: clip.effects.map((e) =>
          e.id === existing.id ? { ...e, params: { ...e.params, ...matteParams } } : e,
        ),
      };
    }),
  );
}

/** Id da máscara já ligada ao clipe, se houver (para descartar a antiga ao refazer). */
function previousMatteId(clip: Clip): string | undefined {
  const effect = clip.effects.find((e) => e.type === EFFECT_TYPE);
  const value = effect?.params['matteAssetId'];
  return typeof value === 'string' ? value : undefined;
}

/** Gera a máscara do trecho do clipe e aplica o efeito removeBackground; falhas e cancelamentos ficam no trabalho em segundo plano. */
export async function removeBackground(clipId: string): Promise<void> {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const found = findClip(project.tracks, clipId);
  if (found === null) return;
  const { clip } = found;
  const asset = project.assets.find((a) => a.id === clip.assetId);
  if (asset === undefined || asset.kind !== 'video') return;
  const range = mediaRangeOf(clip, asset.durationMs);
  if (!(range.endMs > range.startMs)) return;

  const jobId = createId();
  const controller = new AbortController();
  useJobsStore.getState().start({ id: jobId, kind: 'removeBackground', clipId, cancel: () => controller.abort() });
  try {
    const data = await generateMatte(
      asset,
      range.startMs,
      range.endMs,
      (progress) => useJobsStore.getState().update(jobId, overallProgress(progress)),
      controller.signal,
    );
    if (controller.signal.aborted) return;
    const matte = await importMatte(asset, data);
    if (controller.signal.aborted) {
      await useProjectStore.getState().removeAsset(matte.id);
      return;
    }
    markAsMatte(matte.id, asset.id);
    const previous = previousMatteId(clip);
    linkMatteEffect(clipId, matte.id, range.startMs);
    if (previous !== undefined && previous !== matte.id) {
      await useProjectStore.getState().removeAsset(previous);
    }
    useJobsStore.getState().finish(jobId);
  } catch (error) {
    if (isAbort(error)) return;
    useJobsStore.getState().fail(jobId, errorCodeOf(error));
  }
}
