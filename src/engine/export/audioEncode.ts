// Codificação de áudio da exportação: blocos planares de 1024 amostras enviados ao AudioEncoder.
import type { MixedAudio, ResolvedExport } from '../../types/export';
import type { ExportMuxer } from './muxers';

/** Amostras por bloco enviado ao codificador. */
const BLOCK_FRAMES = 1024;
/** Saída sempre estéreo. */
const CHANNELS = 2;
/** Acima desta fila, espera o codificador esvaziar um pouco antes do próximo bloco. */
const MAX_ENCODE_QUEUE = 8;
/** Tempo limite da espera por 'dequeue'. */
const QUEUE_WAIT_MS = 50;

/**
 * Monta um bloco f32-planar estéreo: todas as amostras de L seguidas de R, a partir de offset.
 * Mono usa o mesmo canal nos dois lados; amostras fora do array viram silêncio.
 */
export function planarChunk(channels: Float32Array[], offset: number, frames: number): Float32Array<ArrayBuffer> {
  const out = new Float32Array(frames * CHANNELS);
  const left = channels[0];
  const right = channels[1] ?? left;
  if (left) out.set(left.subarray(offset, offset + frames), 0);
  if (right) out.set(right.subarray(offset, offset + frames), frames);
  return out;
}

/** Espera o próximo 'dequeue' do codificador ou o tempo limite, o que vier primeiro. */
function waitForDequeue(encoder: AudioEncoder): Promise<void> {
  return new Promise<void>((resolve) => {
    const done = (): void => {
      clearTimeout(timer);
      encoder.removeEventListener('dequeue', done);
      resolve();
    };
    const timer = setTimeout(done, QUEUE_WAIT_MS);
    encoder.addEventListener('dequeue', done);
  });
}

/**
 * Codifica o áudio já mixado (começa em 0, cobre o intervalo exportado) e envia os blocos ao muxer.
 * Lança 'unsupported-codec' se o codificador não aceitar a configuração.
 */
export async function encodeAudio(
  audio: MixedAudio,
  config: ResolvedExport,
  muxer: ExportMuxer,
  onProgress: (done: number, total: number) => void,
  isCancelled: () => boolean,
): Promise<void> {
  const encoderConfig: AudioEncoderConfig = {
    codec: config.audioCodec,
    sampleRate: audio.sampleRate,
    numberOfChannels: CHANNELS,
    bitrate: config.audioBitrate,
  };
  const support = await AudioEncoder.isConfigSupported(encoderConfig).catch(() => ({ supported: false }));
  if (!support.supported) throw new Error('unsupported-codec');

  const errors: { error: Error | null } = { error: null };
  const encoder = new AudioEncoder({
    output: (chunk, meta) => muxer.addAudioChunk(chunk, meta),
    error: (error) => {
      errors.error = new Error(`encode:${error.message}`);
    },
  });
  try {
    encoder.configure(encoderConfig);
    const total = audio.channels[0]?.length ?? 0;
    for (let offset = 0; offset < total; offset += BLOCK_FRAMES) {
      if (isCancelled()) break;
      if (errors.error !== null) throw errors.error;
      const frames = Math.min(BLOCK_FRAMES, total - offset);
      const block = new AudioData({
        format: 'f32-planar',
        sampleRate: audio.sampleRate,
        numberOfFrames: frames,
        numberOfChannels: CHANNELS,
        timestamp: Math.round((offset * 1_000_000) / audio.sampleRate),
        data: planarChunk(audio.channels, offset, frames),
      });
      try {
        if (encoder.encodeQueueSize > MAX_ENCODE_QUEUE) await waitForDequeue(encoder);
        encoder.encode(block);
      } finally {
        block.close();
      }
      onProgress(offset + frames, total);
    }
    if (!isCancelled()) {
      await encoder.flush();
      if (errors.error !== null) throw errors.error;
    }
  } finally {
    if (encoder.state !== 'closed') encoder.close();
  }
}
