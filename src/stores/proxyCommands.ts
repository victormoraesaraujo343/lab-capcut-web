// Geração das cópias leves (proxies) em segundo plano: uma por vez, para cada vídeo grande do projeto aberto.
import { startProxyTranscode, type ProxyHandle } from '@/engine/proxy/proxyTranscode';
import { findProxy, needsProxy } from '@/engine/proxy/proxyPolicy';
import { createId } from '@/engine/project/createProject';
import type { Asset, Project } from '@/types';
import { scheduleSave } from './projectPersistence';
import { useJobsStore } from './jobsStore';
import { useProjectStore } from './projectStore';
import { useProxySettingsStore } from './proxySettingsStore';

/** Vídeo aguardando sua cópia leve: o projeto e o asset dele. */
interface QueuedProxy {
  projectId: string;
  assetId: string;
}

/** Cópia em geração agora, com o id do trabalho e o controle de cancelamento. */
interface RunningProxy {
  jobId: string;
  projectId: string;
  assetId: string;
  /** Transcodificação em andamento; null até o worker começar. */
  handle: ProxyHandle | null;
  cancelled: boolean;
}

/** Fila dos vídeos que ainda esperam a cópia leve. */
const queue: QueuedProxy[] = [];
/** Cópia que está sendo gerada agora, ou null. */
let running: RunningProxy | null = null;

/** Diz se o asset (do projeto dado) já tem cópia leve pronta. */
function hasProxy(project: Project, assetId: string): boolean {
  return findProxy(project, assetId) !== undefined;
}

/** Diz se o asset já está na fila ou sendo gerado. */
function isPending(projectId: string, assetId: string): boolean {
  if (running !== null && running.projectId === projectId && running.assetId === assetId) return true;
  return queue.some((item) => item.projectId === projectId && item.assetId === assetId);
}

/** Pega o próximo item ainda válido da fila (descarta o que é de outro projeto, já tem cópia ou sumiu). */
function takeNext(): QueuedProxy | undefined {
  while (queue.length > 0) {
    const item = queue.shift();
    if (item === undefined) break;
    const project = useProjectStore.getState().project;
    if (project === null || project.id !== item.projectId) continue;
    const asset = project.assets.find((a) => a.id === item.assetId);
    if (asset === undefined || !needsProxy(asset) || hasProxy(project, asset.id)) continue;
    return item;
  }
  return undefined;
}

/** Marca o asset importado como cópia leve da origem: role 'proxy', mesma duração e fora da biblioteca. */
function markProxy(assetId: string, source: Asset): void {
  const project = useProjectStore.getState().project;
  if (project === null) return;
  const next: Project = {
    ...project,
    assets: project.assets.map((asset): Asset =>
      asset.id === assetId
        ? { ...asset, role: 'proxy', sourceAssetId: source.id, durationMs: source.durationMs ?? asset.durationMs }
        : asset,
    ),
    updatedAt: Date.now(),
  };
  useProjectStore.setState({ project: next });
  scheduleSave(next);
}

/** Importa o MP4 leve como asset novo e o marca como cópia da origem; se a origem sumiu no meio, a cópia é removida depois. */
async function attachProxy(projectId: string, source: Asset, blob: Blob): Promise<void> {
  const store = useProjectStore.getState();
  if (store.project === null || store.project.id !== projectId) return;
  const before = new Set(store.project.assets.map((asset) => asset.id));
  await store.importFiles([new File([blob], `${source.name} (prévia leve).mp4`, { type: 'video/mp4' })]);
  const created = useProjectStore.getState().project?.assets.find((asset) => !before.has(asset.id));
  if (created === undefined) throw new Error('encode');
  markProxy(created.id, source);
}

/** Código de erro de uma falha da geração (a interface traduz). */
function errorCodeOf(error: unknown): string {
  return error instanceof Error ? error.message : 'generic';
}

/** Gera a cópia de um item da fila; ao terminar (ou falhar), começa o próximo. */
async function generate(item: QueuedProxy): Promise<void> {
  const jobs = useJobsStore.getState();
  const current: RunningProxy = {
    jobId: createId(),
    projectId: item.projectId,
    assetId: item.assetId,
    handle: null,
    cancelled: false,
  };
  running = current;
  jobs.start({
    id: current.jobId,
    kind: 'proxy',
    // Trabalho de cópia leve: o campo guarda o id do asset de origem (não há clipe).
    clipId: item.assetId,
    cancel: () => {
      current.cancelled = true;
      current.handle?.cancel();
    },
  });
  try {
    const asset = useProjectStore.getState().project?.assets.find((a) => a.id === item.assetId);
    if (asset === undefined) throw new Error('empty');
    current.handle = startProxyTranscode(asset, (fraction) => jobs.update(current.jobId, fraction));
    const blob = await current.handle.result;
    if (current.cancelled) return;
    await attachProxy(item.projectId, asset, blob);
    jobs.finish(current.jobId);
  } catch (error: unknown) {
    if (!current.cancelled) jobs.fail(current.jobId, errorCodeOf(error));
  } finally {
    if (running === current) running = null;
    pump();
  }
}

/** Começa a próxima cópia da fila, se a prévia leve estiver ligada e nada estiver sendo gerado. */
function pump(): void {
  if (running !== null || !useProxySettingsStore.getState().enabled) return;
  const next = takeNext();
  if (next === undefined) return;
  void generate(next);
}

/** Enfileira as cópias que faltam no projeto aberto e começa a geração; não faz nada com a prévia leve desligada. */
export function ensureProxies(): void {
  if (!useProxySettingsStore.getState().enabled) return;
  const project = useProjectStore.getState().project;
  if (project === null) return;
  for (const asset of project.assets) {
    if (!needsProxy(asset) || hasProxy(project, asset.id) || isPending(project.id, asset.id)) continue;
    queue.push({ projectId: project.id, assetId: asset.id });
  }
  pump();
}

/** Liga ou desliga a prévia leve; ao ligar, pede as cópias que faltam. */
export function setProxyPreviewEnabled(enabled: boolean): void {
  useProxySettingsStore.getState().setEnabled(enabled);
  if (enabled) ensureProxies();
}

/** Cancela a geração em andamento e esvazia a fila. */
export function cancelProxies(): void {
  queue.length = 0;
  const current = running;
  running = null;
  if (current === null) return;
  useJobsStore.getState().cancelJob(current.jobId);
}

/** Remove as cópias cuja origem já não existe no projeto. */
function removeOrphanProxies(project: Project): void {
  for (const asset of project.assets) {
    if (asset.role !== 'proxy' || asset.sourceAssetId === undefined) continue;
    const sourceId = asset.sourceAssetId;
    if (!project.assets.some((a) => a.id === sourceId)) {
      void useProjectStore.getState().removeAsset(asset.id);
    }
  }
}

// Acompanha o projeto: ao abrir ou importar mídia pede as cópias que faltam; ao fechar cancela; ao remover a origem remove a cópia.
useProjectStore.subscribe((state, previous) => {
  const project = state.project;
  if (project === null) {
    if (previous.project !== null) cancelProxies();
    return;
  }
  if (project.id === previous.project?.id && project.assets === previous.project.assets) return;
  removeOrphanProxies(project);
  ensureProxies();
});
