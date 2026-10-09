// Política das prévias leves (proxies): quais vídeos ganham uma cópia 540p, o tamanho dela e como achar a cópia de um asset.
import type { Asset, Project } from '@/types';

/** Lado menor alvo da prévia leve, em pixels (altura em paisagem, largura em retrato). */
export const PROXY_SHORT_SIDE = 540;
/** Altura acima da qual um vídeo ganha proxy. */
export const PROXY_MAX_HEIGHT = 720;
/** Largura acima da qual um vídeo ganha proxy. */
export const PROXY_MAX_WIDTH = 1280;
/** Taxa de quadros acima da qual um vídeo ganha proxy, e o teto da taxa da cópia. */
export const PROXY_MAX_FPS = 30;

/** Arredonda para o par mais próximo (mínimo 2), exigido pelo H.264. */
function evenDimension(n: number): number {
  return Math.max(2, 2 * Math.round(n / 2));
}

/** Diz se um asset precisa de uma cópia leve: vídeo original (sem papel de gerado) maior que 720p ou com mais de 30 fps. */
export function needsProxy(asset: Asset): boolean {
  if (asset.kind !== 'video' || asset.role !== undefined) return false;
  return (
    (asset.height ?? 0) > PROXY_MAX_HEIGHT ||
    (asset.width ?? 0) > PROXY_MAX_WIDTH ||
    (asset.fps ?? 0) > PROXY_MAX_FPS
  );
}

/** Tamanho da cópia leve: 540 no lado menor mantendo a proporção (paisagem: altura 540; retrato: largura 540), com valores pares. */
export function proxySize(width: number, height: number): { width: number; height: number } {
  if (!(width > 0) || !(height > 0)) return { width: PROXY_SHORT_SIDE, height: PROXY_SHORT_SIDE };
  if (width >= height) {
    return { width: evenDimension((width * PROXY_SHORT_SIDE) / height), height: PROXY_SHORT_SIDE };
  }
  return { width: PROXY_SHORT_SIDE, height: evenDimension((height * PROXY_SHORT_SIDE) / width) };
}

/** Taxa de quadros da cópia leve: a do original, limitada a 30 fps. */
export function proxyFps(fps: number | undefined): number {
  if (!(fps !== undefined && fps > 0)) return PROXY_MAX_FPS;
  return Math.min(PROXY_MAX_FPS, Math.max(1, Math.round(fps)));
}

/** Acha a cópia leve já gerada de um asset no projeto (asset com role 'proxy' e sourceAssetId igual ao id dado). */
export function findProxy(project: Project, assetId: string): Asset | undefined {
  return project.assets.find((asset) => asset.role === 'proxy' && asset.sourceAssetId === assetId);
}
