// Detecta se o navegador consegue codificar AAC (mp4a.40.2) via WebCodecs; o resultado fica guardado por taxa de amostragem.
const AAC_CODEC = 'mp4a.40.2';
const AAC_CHANNELS = 2;
const AAC_BITRATE = 192_000;

const cache = new Map<number, Promise<boolean>>();

/** Diz se o AudioEncoder do navegador aceita AAC estéreo 192 kbps; qualquer erro conta como não suportado. */
export function canEncodeAac(sampleRate = 48000): Promise<boolean> {
  const cached = cache.get(sampleRate);
  if (cached) return cached;
  const pending = probeAac(sampleRate);
  cache.set(sampleRate, pending);
  return pending;
}

/** Consulta o AudioEncoder sem lançar exceção. */
async function probeAac(sampleRate: number): Promise<boolean> {
  try {
    if (typeof AudioEncoder === 'undefined') return false;
    const support = await AudioEncoder.isConfigSupported({
      codec: AAC_CODEC,
      sampleRate,
      numberOfChannels: AAC_CHANNELS,
      bitrate: AAC_BITRATE,
    });
    return support.supported === true;
  } catch {
    return false;
  }
}
