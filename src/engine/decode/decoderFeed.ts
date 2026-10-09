// Alimentação do VideoDecoder: envia amostras, copia os quadros de saída e espera o quadro alvo.
import { readSampleData } from './demux';
import { canContinueDecode, findSyncBefore } from './sampleIndex';
import type { Session } from './decodeSession';

const SEQUENTIAL_WINDOW_US = 2_000_000;
const MAX_DECODE_QUEUE = 10;
const QUEUE_WAIT_MS = 20;
const MAX_LOOKAHEAD_SAMPLES = 24;

/** Cria um VideoFrame independente do pool do decodificador e fecha o original. */
async function detachFrame(frame: VideoFrame): Promise<VideoFrame> {
  try {
    const bitmap = await createImageBitmap(frame);
    const detached = new VideoFrame(bitmap, { timestamp: frame.timestamp, duration: frame.duration ?? undefined });
    bitmap.close();
    return detached;
  } finally {
    frame.close();
  }
}

/** Devolve o decodificador da sessão, criando outro se o anterior foi fechado por erro. */
function ensureDecoder(session: Session): VideoDecoder {
  if (session.decoder && session.decoder.state !== 'closed') {
    return session.decoder;
  }
  const decoder = new VideoDecoder({
    output: (frame: VideoFrame) => {
      if (session.closed) {
        frame.close();
        return;
      }
      // Copia o quadro para fora do pool do decodificador e devolve o original na hora:
      // segurar VideoFrames do decodificador esgota o pool e trava a decodificação (flush nunca resolve).
      const copy = detachFrame(frame).then((detached) => {
        if (session.closed) {
          detached.close();
          return;
        }
        session.cache.put(detached.timestamp, detached);
        session.cache.evictFarFrom(session.cursorUs);
      });
      session.copies.add(copy);
      void copy.finally(() => session.copies.delete(copy));
    },
    error: (error: DOMException) => {
      session.decodeError = error.message;
    },
  });
  session.decoder = decoder;
  return decoder;
}

/** Espera o próximo evento 'dequeue' do decodificador ou o tempo limite, o que vier primeiro. */
function waitForDequeue(decoder: VideoDecoder, timeoutMs: number): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      decoder.removeEventListener('dequeue', done);
      resolve();
    };
    const timer = setTimeout(done, timeoutMs);
    decoder.addEventListener('dequeue', done);
  });
}

/** Lê e envia uma amostra ao decodificador, respeitando o limite da fila. */
async function feedSample(session: Session, decoder: VideoDecoder, index: number): Promise<void> {
  const sample = session.samples[index];
  if (!sample) {
    return;
  }
  const data = await readSampleData(session.file, sample);
  if (decoder.decodeQueueSize > MAX_DECODE_QUEUE) {
    // O decodificador pode reter quadros até receber mais dados; espera um 'dequeue' por pouco tempo e segue.
    await waitForDequeue(decoder, QUEUE_WAIT_MS);
  }
  decoder.decode(
    new EncodedVideoChunk({
      type: sample.isSync ? 'key' : 'delta',
      timestamp: sample.ctsUs,
      duration: sample.durationUs,
      data,
    }),
  );
  session.nextIndex = index + 1;
  session.maxFedCtsUs = Math.max(session.maxFedCtsUs, sample.ctsUs);
}

/** Alimenta o decodificador de nextIndex até a amostra alvo e espera o quadro alvo sair. */
export async function decodeTo(session: Session, targetIndex: number): Promise<void> {
  if (session.closed) {
    throw new Error('Asset fechado');
  }
  const decoder = ensureDecoder(session);
  session.decodeError = null;
  const continuing =
    decoder.state === 'configured' &&
    canContinueDecode(session.samples, session.nextIndex, targetIndex, session.maxFedCtsUs, SEQUENTIAL_WINDOW_US);
  let start = session.nextIndex;
  if (!continuing) {
    if (decoder.state === 'configured') {
      decoder.reset();
    }
    decoder.configure(session.config);
    start = Math.max(0, findSyncBefore(session.samples, targetIndex));
    session.maxFedCtsUs = Number.NEGATIVE_INFINITY;
  }
  const targetCts = session.samples[targetIndex]?.ctsUs ?? 0;
  const hasTarget = (): boolean => session.cache.getNearest(targetCts, 0) !== null;
  try {
    for (let index = start; index <= targetIndex; index++) {
      await feedSample(session, decoder, index);
    }
    // Sem flush (exigiria recomeçar num quadro-chave): alimenta alguns quadros a mais até o alvo sair do
    // buffer de reordenação. Só no fim do arquivo faz flush e marca recomeço.
    let extra = 0;
    while (!hasTarget() && session.decodeError === null) {
      await Promise.all([...session.copies]);
      if (hasTarget()) break;
      if (session.nextIndex < session.samples.length && extra < MAX_LOOKAHEAD_SAMPLES) {
        await feedSample(session, decoder, session.nextIndex);
        extra += 1;
        await waitForDequeue(decoder, QUEUE_WAIT_MS);
      } else {
        await decoder.flush();
        await Promise.all([...session.copies]);
        session.nextIndex = 0;
        break;
      }
    }
  } catch (error) {
    session.nextIndex = 0;
    throw error;
  }
  if (session.decodeError !== null) {
    session.nextIndex = 0;
    throw new Error(session.decodeError);
  }
}
