/// <reference lib="webworker" />
// Worker da prévia leve: transcodifica um vídeo inteiro (sem áudio) com o mesmo pipeline da exportação.
import type { ExportRequest, ExportResponse } from '../../types/export';
import { runExportJob } from '../export/exportJob';

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Ids de trabalhos cancelados pela thread principal (o trabalho checa isso a cada quadro). */
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
    cancelled.add(request.jobId);
    return;
  }
  const jobId = request.jobId;
  void runExportJob(
    { project: request.project, config: request.config, audio: null, assetBaseUrl: request.assetBaseUrl },
    post,
    () => cancelled.has(jobId),
    jobId,
  ).finally(() => cancelled.delete(jobId));
};
