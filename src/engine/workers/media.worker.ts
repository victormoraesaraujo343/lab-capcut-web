/// <reference lib="webworker" />
import { computePeaks } from '../decode/peaks';
import { writeFile } from '../storage/opfs';
import { thumbFileName } from './mediaProtocol';
import type { MediaRequest, MediaResponse } from './mediaProtocol';

const scope = self as unknown as DedicatedWorkerGlobalScope;

/** Gera miniaturas JPEG a partir de frames, grava cada uma e devolve os caminhos. */
async function buildThumbs(
  request: Extract<MediaRequest, { type: 'thumbs' }>,
): Promise<string[]> {
  const paths: string[] = [];
  try {
    for (let i = 0; i < request.frames.length; i++) {
      const frame = request.frames[i];
      if (!frame) {
        throw new Error('Frame ausente');
      }
      const width = request.targetWidth;
      const height = Math.max(1, Math.round((frame.height * width) / frame.width));
      const canvas = new OffscreenCanvas(width, height);
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Contexto 2D indisponível');
      }
      context.drawImage(frame, 0, 0, width, height);
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality: 0.7 });
      const path = `${request.basePath}/${thumbFileName(request.startIndex + i)}`;
      await writeFile(path, blob);
      paths.push(path);
      frame.close();
    }
  } finally {
    for (const frame of request.frames) {
      frame.close();
    }
  }
  return paths;
}

/** Processa uma requisição do worker e devolve a resposta correspondente. */
async function handleRequest(request: MediaRequest): Promise<MediaResponse> {
  if (request.type === 'thumbs') {
    const paths = await buildThumbs(request);
    return { type: 'thumbs-done', requestId: request.requestId, paths };
  }
  const peaks = computePeaks(request.channels, request.buckets);
  return { type: 'peaks-done', requestId: request.requestId, peaks };
}

scope.onmessage = (event: MessageEvent<MediaRequest>) => {
  const request = event.data;
  handleRequest(request)
    .then((response) => {
      scope.postMessage(response);
    })
    .catch((error: unknown) => {
      const message = error instanceof Error ? error.message : String(error);
      const response: MediaResponse = { type: 'error', requestId: request.requestId, message };
      scope.postMessage(response);
    });
};
