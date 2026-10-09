// Cache de texturas WebGL2 por chave (clipId), com upload de cada quadro e liberação seletiva.
import type { FrameImage } from '../../types/render';

const caches = new WeakMap<WebGL2RenderingContext, Map<string, WebGLTexture>>();

/** Obtém (ou cria) o mapa de texturas de um contexto. */
function cacheFor(gl: WebGL2RenderingContext): Map<string, WebGLTexture> {
  let cache = caches.get(gl);
  if (!cache) {
    cache = new Map<string, WebGLTexture>();
    caches.set(gl, cache);
  }
  return cache;
}

/** Envia a imagem para a textura da chave (criando-a na primeira vez) e devolve a textura. */
export function upload(gl: WebGL2RenderingContext, key: string, image: FrameImage): WebGLTexture {
  const cache = cacheFor(gl);
  let texture = cache.get(key);
  if (!texture) {
    const created = gl.createTexture();
    if (!created) throw new Error('texture-create-failed');
    texture = created;
    cache.set(key, texture);
  }
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.pixelStorei(gl.UNPACK_PREMULTIPLY_ALPHA_WEBGL, true);
  gl.pixelStorei(gl.UNPACK_FLIP_Y_WEBGL, false);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);
  return texture;
}

/** Apaga as texturas cujas chaves não estão em keepKeys. */
export function prune(gl: WebGL2RenderingContext, keepKeys: Set<string>): void {
  const cache = caches.get(gl);
  if (!cache) return;
  for (const [key, texture] of cache) {
    if (!keepKeys.has(key)) {
      gl.deleteTexture(texture);
      cache.delete(key);
    }
  }
}

/** Apaga todas as texturas do contexto e esvazia o cache. */
export function disposeAll(gl: WebGL2RenderingContext): void {
  const cache = caches.get(gl);
  if (!cache) return;
  for (const texture of cache.values()) {
    gl.deleteTexture(texture);
  }
  cache.clear();
  caches.delete(gl);
}
