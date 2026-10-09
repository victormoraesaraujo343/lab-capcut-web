// Executor dos testes de render: desenha cada caso com o compositor real e compara com a referência PNG.
import { createCompositor } from '@/engine/render/compositor';
import { renderFrame } from '@/engine/render/renderFrame';
import { RENDER_CASES } from './allCases';
import type { RenderCase } from './cases';
import { compareImages } from './compare';
import { ensureFont } from '@/engine/text/fontLoader';

/** Situação final de um caso: passou, falhou na comparação, referência criada ou erro. */
export type RenderStatus = 'pass' | 'fail' | 'created' | 'error';

/** Resultado de um caso de teste de render. */
export interface RenderTestResult {
  /** Id do caso (também nome do PNG de referência). */
  id: string;
  /** Situação final do caso. */
  status: RenderStatus;
  /** Fração de pixels ruins na comparação (0 quando não comparou). */
  badRatio: number;
  /** Maior diferença por canal na comparação (0 quando não comparou). */
  maxDelta: number;
  /** Detalhe extra para falhas e erros. */
  message?: string;
}

/** Estado exposto em window.__renderTests para o orquestrador. */
export interface RenderTestsState {
  /** true quando todos os casos terminaram. */
  done: boolean;
  /** Quantidade total de casos. */
  total: number;
  /** Resultados já obtidos, na ordem dos casos. */
  results: RenderTestResult[];
}

/** Miniaturas de um caso para o painel: o que foi desenhado e a referência (null se não existir). */
export interface CaseImages {
  /** PNG do quadro desenhado agora. */
  current: Blob | null;
  /** PNG da referência salva, ou null. */
  reference: Blob | null;
}

/** Opções de uma rodada. */
export interface RunOptions {
  /** true = grava as referências atuais (?update=1) em vez de comparar. */
  update: boolean;
  /** Chamado ao terminar cada caso, para atualizar o painel. */
  onCase?: (result: RenderTestResult, images: CaseImages) => void;
}

declare global {
  interface Window {
    /** Estado dos testes de render, lido pelo orquestrador. */
    __renderTests?: RenderTestsState;
  }
}

/** Lê os pixels de um canvas e devolve o buffer RGBA e o PNG correspondente. */
async function readCanvas(
  source: OffscreenCanvas | HTMLCanvasElement,
  width: number,
  height: number,
): Promise<{ data: Uint8ClampedArray; png: Blob }> {
  const copy = new OffscreenCanvas(width, height);
  const ctx = copy.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('readback-context-unavailable');
  ctx.drawImage(source, 0, 0, width, height);
  const data = ctx.getImageData(0, 0, width, height).data;
  const png = await copy.convertToBlob({ type: 'image/png' });
  return { data, png };
}

/** Busca a referência PNG do caso em tests/render-refs; null se não existir. */
async function fetchReference(id: string): Promise<Blob | null> {
  const response = await fetch(`/tests/render-refs/${id}.png`, { cache: 'no-store' });
  if (!response.ok) return null;
  if (!(response.headers.get('content-type') ?? '').startsWith('image/png')) return null;
  return response.blob();
}

/** Decodifica um PNG em buffer RGBA com as dimensões dadas (sem conversão de cor). */
async function decodePng(blob: Blob): Promise<{ data: Uint8ClampedArray; width: number; height: number }> {
  const bitmap = await createImageBitmap(blob, { colorSpaceConversion: 'none' });
  // Guarda o tamanho antes de fechar: um ImageBitmap fechado passa a ter largura e altura 0.
  const { width, height } = bitmap;
  const copy = new OffscreenCanvas(width, height);
  const ctx = copy.getContext('2d', { willReadFrequently: true });
  if (!ctx) throw new Error('decode-context-unavailable');
  ctx.drawImage(bitmap, 0, 0);
  bitmap.close();
  return { data: ctx.getImageData(0, 0, width, height).data, width, height };
}

/** Envia um PNG para um endpoint de dev; lança erro se o servidor recusar. */
async function postPng(endpoint: string, blob: Blob): Promise<void> {
  const response = await fetch(endpoint, { method: 'POST', body: blob, headers: { 'Content-Type': 'image/png' } });
  if (!response.ok) throw new Error(`save-failed:${response.status}`);
}

/** Desenha um caso, compara com a referência e grava o que for preciso; nunca lança. */
async function runCase(testCase: RenderCase, update: boolean): Promise<{ result: RenderTestResult; images: CaseImages }> {
  const images: CaseImages = { current: null, reference: null };
  const base = { id: testCase.id, badRatio: 0, maxDelta: 0 };
  try {
    const built = testCase.build();
    const { project, timeMs, provider } = built;
    const width = project.width;
    const height = project.height;

    const target = new OffscreenCanvas(width, height);
    const compositor = createCompositor(target);
    let frame: { data: Uint8ClampedArray; png: Blob };
    try {
      await renderFrame(compositor, project, timeMs, provider, { scale: 1, exact: true });
      frame = await readCanvas(compositor.canvas, width, height);
    } finally {
      compositor.dispose();
    }
    images.current = frame.png;

    if (built.expectedMediaTimeMs !== undefined) {
      const requested = provider.calls[0]?.mediaTimeMs;
      if (requested === undefined) {
        return { result: { ...base, status: 'fail', message: 'nenhum quadro pedido ao provider' }, images };
      }
      if (Math.abs(requested - built.expectedMediaTimeMs) > 0.5) {
        return {
          result: {
            ...base,
            status: 'fail',
            message: `tempo de mídia ${requested.toFixed(1)} ms, esperado ${built.expectedMediaTimeMs.toFixed(1)} ms`,
          },
          images,
        };
      }
    }

    const reference = await fetchReference(testCase.id);
    images.reference = reference;
    if (update || reference === null) {
      await postPng(`/__dev/save-ref?name=${encodeURIComponent(`${testCase.id}.png`)}`, frame.png);
      const message = update && reference !== null ? 'referência atualizada' : 'referência criada';
      return { result: { ...base, status: 'created', message }, images };
    }

    const expected = await decodePng(reference);
    if (expected.width !== width || expected.height !== height) {
      return {
        result: {
          ...base,
          status: 'fail',
          message: `referência ${expected.width}x${expected.height}, esperado ${width}x${height}`,
        },
        images,
      };
    }
    const comparison = compareImages(frame.data, expected.data, width, height);
    const result: RenderTestResult = {
      ...base,
      badRatio: comparison.badRatio,
      maxDelta: comparison.maxDelta,
      status: comparison.ok ? 'pass' : 'fail',
    };
    if (!comparison.ok) {
      await postPng(`/__dev/save?name=${encodeURIComponent(`render-fail-${testCase.id}.png`)}`, frame.png);
      result.message = 'pixels diferentes da referência';
    }
    return { result, images };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    return { result: { ...base, status: 'error', message }, images };
  }
}

/** Roda todos os casos em ordem, atualiza window.__renderTests e avisa cada resultado. */
export async function runRenderTests(options: RunOptions): Promise<RenderTestResult[]> {
  const state: RenderTestsState = { done: false, total: RENDER_CASES.length, results: [] };
  window.__renderTests = state;
  // Fontes carregadas antes do primeiro desenho: senão o 1º caso sai na fonte reserva e a comparação fica instável.
  await Promise.all([
    ensureFont('Inter', false, document.baseURI),
    ensureFont('Inter', true, document.baseURI),
    ensureFont('JetBrains Mono', true, document.baseURI),
  ]);
  for (const testCase of RENDER_CASES) {
    const outcome = await runCase(testCase, options.update);
    state.results.push(outcome.result);
    options.onCase?.(outcome.result, outcome.images);
  }
  state.done = true;
  return state.results;
}
