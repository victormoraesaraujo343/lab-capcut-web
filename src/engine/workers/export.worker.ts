/// <reference lib="webworker" />
// Worker de exportação: recebe o pedido, roda um job por vez e devolve progresso, arquivo ou erro.
import type { ExportRequest, ExportResponse } from '../../types/export';
import { runExportJob } from '../export/exportJob';

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Id do job em andamento, ou null quando o worker está livre. */
let activeJob: number | null = null;
/** Ids de jobs cancelados pela thread principal (o job checa isso a cada quadro). */
const cancelled = new Set<number>();

/** Envia uma resposta; o buffer do arquivo final é transferido, não copiado. */
function post(response: ExportResponse): void {
  if (response.type === 'done') {
    scope.postMessage(response, [response.data]);
    return;
  }
  scope.postMessage(response);
}

scope.onmessage = (event: MessageEvent<ExportRequest>) => {
  const request = event.data;
  if (request.type === 'cancel') {
    if (request.jobId === activeJob) cancelled.add(request.jobId);
    return;
  }
  const jobId = request.jobId;
  if (activeJob !== null) {
    post({ type: 'error', jobId, code: 'generic', message: 'worker-busy' });
    return;
  }
  activeJob = jobId;
  void runExportJob(
    { project: request.project, config: request.config, audio: request.audio, assetBaseUrl: request.assetBaseUrl },
    post,
    () => cancelled.has(jobId),
    jobId,
  ).finally(() => {
    cancelled.delete(jobId);
    activeJob = null;
  });
};
