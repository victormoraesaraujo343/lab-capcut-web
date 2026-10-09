// Gravação de áudio com MediaRecorder e pedido de microfone com erros mapeados para códigos estáveis.

/** Códigos de erro da gravação, usados para escolher a mensagem na tela. */
export type RecordingErrorCode = 'denied' | 'notFound' | 'busy' | 'unsupported';

/** Estado do MediaRecorder: parado, gravando ou pausado. */
export type RecorderState = 'inactive' | 'recording' | 'paused';

/** Intervalo, em ms, entre os pedaços de dados entregues durante a gravação. */
const TIMESLICE_MS = 250;

/** Formatos preferidos, na ordem; sem nenhum suportado, usa o padrão do navegador. */
const PREFERRED_MIME_TYPES = ['audio/webm;codecs=opus', 'audio/ogg;codecs=opus'] as const;

/** Erro de gravação com o código que diz o motivo. */
export class RecordingError extends Error {
  /** Código do motivo da falha. */
  readonly code: RecordingErrorCode;

  /** Cria o erro com o código dado. */
  constructor(code: RecordingErrorCode) {
    super(`Recording error: ${code}`);
    this.name = 'RecordingError';
    this.code = code;
  }
}

/** Gravador de um stream de áudio: começa, para (devolvendo o áudio) ou cancela. */
export interface Recorder {
  /** Começa a gravar o stream dado. */
  start(stream: MediaStream): void;
  /** Para a gravação e devolve o áudio gravado. */
  stop(): Promise<Blob>;
  /** Para a gravação e descarta o que foi gravado. */
  cancel(): void;
  /** Estado atual do gravador. */
  readonly state: RecorderState;
}

/** Escolhe o primeiro formato preferido suportado; undefined deixa o navegador decidir. */
export function pickMimeType(isSupported: (type: string) => boolean): string | undefined {
  return PREFERRED_MIME_TYPES.find((type) => isSupported(type));
}

/** Cria um gravador novo com MediaRecorder; cada gravação usa uma instância nova. */
export function createRecorder(): Recorder {
  let recorder: MediaRecorder | null = null;
  let chunks: Blob[] = [];
  let mimeType = '';

  return {
    // Começa a gravar o stream, entregando dados a cada 250 ms.
    start(stream) {
      if (typeof MediaRecorder === 'undefined') throw new RecordingError('unsupported');
      const chosen = pickMimeType((type) => MediaRecorder.isTypeSupported(type));
      chunks = [];
      recorder = chosen === undefined ? new MediaRecorder(stream) : new MediaRecorder(stream, { mimeType: chosen });
      mimeType = recorder.mimeType || chosen || '';
      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data.size > 0) chunks.push(event.data);
      };
      recorder.start(TIMESLICE_MS);
    },
    // Para e devolve o áudio gravado como Blob.
    stop() {
      const active = recorder;
      if (active === null || active.state === 'inactive') {
        return Promise.reject(new Error('Recorder is not recording'));
      }
      return new Promise<Blob>((resolve, reject) => {
        active.onstop = () => resolve(new Blob(chunks, { type: mimeType }));
        active.onerror = () => reject(new Error('MediaRecorder failed'));
        active.stop();
      });
    },
    // Para a gravação e descarta os dados.
    cancel() {
      if (recorder === null || recorder.state === 'inactive') return;
      chunks = [];
      recorder.stop();
    },
    // Estado do MediaRecorder subjacente.
    get state() {
      return recorder?.state ?? 'inactive';
    },
  };
}

/** Pede acesso ao microfone com eco, supressão de ruído e controle de ganho ligados. */
export async function requestMicrophone(): Promise<MediaStream> {
  const devices = typeof navigator === 'undefined' ? undefined : navigator.mediaDevices;
  if (devices === undefined || typeof devices.getUserMedia !== 'function' || typeof MediaRecorder === 'undefined') {
    throw new RecordingError('unsupported');
  }
  try {
    return await devices.getUserMedia({
      audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
    });
  } catch (error) {
    throw new RecordingError(mapMicrophoneError(error));
  }
}

/** Traduz o nome do erro do navegador no código da gravação. */
export function mapMicrophoneError(error: unknown): RecordingErrorCode {
  const name = error instanceof Error ? error.name : '';
  if (name === 'NotAllowedError' || name === 'SecurityError') return 'denied';
  if (name === 'NotFoundError' || name === 'OverconstrainedError') return 'notFound';
  if (name === 'TypeError') return 'unsupported';
  return 'busy';
}
