// Sessão de decodificação de um asset: abre o arquivo do OPFS e monta o estado usado pelo worker.
import { isCodecSupported, openMp4 } from './demux';
import type { Mp4Info } from './demux';
import { createFrameCache } from './frameCache';
import type { FrameCache } from './frameCache';
import type { SampleInfo } from './sampleIndex';
import { readFile } from '../storage/opfs';

const CACHE_CAPACITY = 45;
const DEFAULT_FRAME_US = 33_333;

/** Estado de decodificação de um asset aberto. */
export interface Session {
  assetId: string;
  file: File;
  samples: SampleInfo[];
  config: VideoDecoderConfig;
  cache: FrameCache<VideoFrame>;
  frameUs: number;
  decoder: VideoDecoder | null;
  decodeError: string | null;
  /** Próxima amostra (ordem de decodificação) a alimentar; 0 força reinício no próximo pedido. */
  nextIndex: number;
  /** Maior cts já alimentado ao decodificador, em µs. */
  maxFedCtsUs: number;
  /** Id do pedido de quadro mais recente, usado para descartar pedidos superados. */
  latestFrameId: number;
  /** Pedidos de quadro e pré-carregamentos ainda não concluídos. */
  pending: number;
  /** Último instante pedido pelo usuário, em µs. */
  cursorUs: number;
  /** Cadeia que serializa o trabalho de decodificação deste asset. */
  chain: Promise<void>;
  /** Cópias de quadro ainda em andamento (saídas do decodificador sendo destacadas do pool). */
  copies: Set<Promise<void>>;
  /** Já existe uma decodificação adiantada na fila (evita empilhar várias). */
  aheadQueued: boolean;
  closed: boolean;
}

/** Resultado da abertura: a sessão pronta ou o motivo da falha ('unreadable', 'parse' ou 'unsupported'). */
export type OpenResult = { ok: true; session: Session } | { ok: false; reason: 'unreadable' | 'parse' | 'unsupported' };

/** Abre o arquivo do OPFS, lê a trilha de vídeo e monta a sessão; falha se o codec não for suportado. */
export async function openAssetSession(assetId: string, opfsPath: string): Promise<OpenResult> {
  let file: File;
  let info: Mp4Info;
  try {
    file = await readFile(opfsPath);
  } catch {
    return { ok: false, reason: 'unreadable' };
  }
  try {
    info = await openMp4(file);
  } catch {
    return { ok: false, reason: 'parse' };
  }
  const config: VideoDecoderConfig = { codec: info.codec, codedWidth: info.codedWidth, codedHeight: info.codedHeight };
  if (info.description) {
    config.description = info.description;
  }
  if (!(await isCodecSupported(config))) {
    return { ok: false, reason: 'unsupported' };
  }
  const frameUs =
    info.durationUs > 0 && info.samples.length > 0
      ? Math.max(1, Math.round(info.durationUs / info.samples.length))
      : DEFAULT_FRAME_US;
  const session: Session = {
    assetId,
    file,
    samples: info.samples,
    config,
    cache: createFrameCache<VideoFrame>(CACHE_CAPACITY, (frame) => frame.close()),
    frameUs,
    decoder: null,
    decodeError: null,
    nextIndex: 0,
    maxFedCtsUs: Number.NEGATIVE_INFINITY,
    latestFrameId: 0,
    pending: 0,
    cursorUs: 0,
    chain: Promise.resolve(),
    copies: new Set(),
    aheadQueued: false,
    closed: false,
  };
  return { ok: true, session };
}
