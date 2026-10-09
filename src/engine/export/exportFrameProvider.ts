// Provedor de quadros da exportação: roda no worker (sem DOM), decodifica em sequência e entrega clones dos quadros.
import type { Asset } from '../../types/project';
import type { FrameImage, FrameProvider } from '../../types/render';
import { openAssetSession } from '../decode/decodeSession';
import type { Session } from '../decode/decodeSession';
import { decodeTo } from '../decode/decoderFeed';
import { clampSampleIndex } from '../decode/sampleIndex';
import { readFile } from '../storage/opfs';

/** Tolerância, em fração de quadro, para aceitar o quadro mais próximo quando o exato não chegou ao cache. */
const NEAREST_TOLERANCE_FRAMES = 0.5;

/** Cria o provedor da exportação: uma sessão de decodificação por vídeo e um bitmap por imagem, sem worker aninhado. */
export function createExportFrameProvider(): FrameProvider {
  const videoSessions = new Map<string, Promise<Session>>();
  const bitmaps = new Map<string, Promise<ImageBitmap>>();
  let disposed = false;

  /** Abre a sessão do vídeo uma única vez; falha vira Error('decode:<id>'). */
  function openSession(asset: Asset): Promise<Session> {
    const existing = videoSessions.get(asset.id);
    if (existing !== undefined) return existing;
    const opening = openAssetSession(asset.id, asset.opfsPath)
      .then((result) => {
        if (!result.ok) throw new Error(`decode:${asset.id}`);
        return result.session;
      })
      .catch(() => {
        throw new Error(`decode:${asset.id}`);
      });
    videoSessions.set(asset.id, opening);
    return opening;
  }

  /** Devolve um clone do quadro exato no instante de mídia; decodifica só quando o cache não tem o quadro. */
  async function videoFrame(asset: Asset, mediaTimeMs: number): Promise<FrameImage | null> {
    const session = await openSession(asset);
    const targetUs = Math.round(mediaTimeMs * 1000);
    const index = clampSampleIndex(session.samples, targetUs);
    if (index < 0) return null;
    const targetCts = session.samples[index]?.ctsUs ?? targetUs;
    let hit = session.cache.getNearest(targetCts, 0);
    if (hit === null) {
      session.cursorUs = targetUs;
      try {
        await decodeTo(session, index);
      } catch {
        throw new Error(`decode:${asset.id}`);
      }
      session.cache.evictFarFrom(targetUs);
      // Quadro exato ausente após decodificar (raro, ex. timestamps irregulares): usa o mais próximo dentro de meio quadro.
      hit = session.cache.getNearest(targetCts, session.frameUs * NEAREST_TOLERANCE_FRAMES);
    }
    return hit === null ? null : hit.item.clone();
  }

  /** Devolve o bitmap da imagem (decodificado uma vez por asset) ou falha com Error('decode:<id>'). */
  function imageBitmap(asset: Asset): Promise<ImageBitmap> {
    const existing = bitmaps.get(asset.id);
    if (existing !== undefined) return existing;
    const decoding = readFile(asset.opfsPath)
      .then((file) => createImageBitmap(file))
      .then((bitmap) => {
        if (disposed) {
          bitmap.close();
          throw new Error('provider-disposed');
        }
        return bitmap;
      })
      .catch(() => {
        throw new Error(`decode:${asset.id}`);
      });
    bitmaps.set(asset.id, decoding);
    return decoding;
  }

  /** Obtém o quadro do asset no instante de mídia (exato, pois a exportação anda para frente). */
  async function getFrame(asset: Asset, mediaTimeMs: number): Promise<FrameImage | null> {
    if (disposed) throw new Error('provider-disposed');
    if (asset.kind === 'image' || asset.kind === 'sticker') return imageBitmap(asset);
    if (asset.kind !== 'video') return null;
    return videoFrame(asset, mediaTimeMs);
  }

  /** Sem pré-carga: a exportação é sequencial e a continuação do decodificador já adianta os quadros. */
  function prefetch(): void {
    return;
  }

  /** Fecha só clones de VideoFrame; bitmaps pertencem ao cache e saem no dispose ou closeAsset. */
  function releaseFrame(frame: FrameImage): void {
    if (typeof VideoFrame !== 'undefined' && frame instanceof VideoFrame) {
      frame.close();
    }
  }

  /** Fecha a sessão de vídeo e o bitmap de um asset que saiu do projeto. */
  function closeAsset(assetId: string): void {
    const session = videoSessions.get(assetId);
    videoSessions.delete(assetId);
    if (session !== undefined) void session.then(closeSession, () => undefined);
    const bitmap = bitmaps.get(assetId);
    bitmaps.delete(assetId);
    if (bitmap !== undefined) void bitmap.then((image) => image.close(), () => undefined);
  }

  /** Libera todas as sessões, decodificadores e bitmaps; novos pedidos passam a falhar. */
  function dispose(): void {
    disposed = true;
    for (const session of videoSessions.values()) {
      void session.then(closeSession, () => undefined);
    }
    for (const bitmap of bitmaps.values()) {
      void bitmap.then((image) => image.close(), () => undefined);
    }
    videoSessions.clear();
    bitmaps.clear();
  }

  return { getFrame, prefetch, releaseFrame, closeAsset, dispose };
}

/** Fecha a sessão: esvazia o cache de quadros e fecha o decodificador (quadros em voo se fecham sozinhos). */
function closeSession(session: Session): void {
  session.closed = true;
  session.cache.clear();
  if (session.decoder && session.decoder.state !== 'closed') {
    session.decoder.close();
  }
  session.decoder = null;
}
