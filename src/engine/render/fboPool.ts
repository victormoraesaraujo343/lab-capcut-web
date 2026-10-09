// Pool de framebuffers RGBA8 com textura, reutilizados por tamanho para os passes de efeitos e transições.

/** Framebuffer com a textura em que ele escreve. */
export interface FboEntry {
  /** Framebuffer que recebe o desenho. */
  framebuffer: WebGLFramebuffer;
  /** Textura de cor do framebuffer (pode ser lida depois). */
  texture: WebGLTexture;
  /** Largura em px. */
  width: number;
  /** Altura em px. */
  height: number;
}

/** Pool de framebuffers de um contexto. */
export interface FboPool {
  /** Pega um framebuffer do tamanho pedido (reaproveita um livre ou cria). Não altera o alvo atual de desenho. */
  acquire(width: number, height: number): FboEntry;
  /** Devolve o framebuffer ao pool para reuso. */
  release(entry: FboEntry): void;
  /** Devolve ao pool o framebuffer cuja textura é a dada; não faz nada se a textura não estiver em uso. */
  releaseTexture(texture: WebGLTexture): void;
  /** Apaga os framebuffers livres (ex.: o compositor chama ao mudar o tamanho de saída). Os em uso não são tocados. */
  trim(): void;
  /** Apaga todos os framebuffers e texturas do pool. */
  dispose(): void;
}

/** Máximo de framebuffers livres guardados por tamanho; o excedente é apagado ao ser devolvido. */
const MAX_FREE_PER_SIZE = 4;
/** Máximo de framebuffers livres guardados no total, somando todos os tamanhos. */
const MAX_FREE_TOTAL = 24;

/** Chave de tamanho usada para agrupar framebuffers livres. */
function sizeKey(width: number, height: number): string {
  return `${width}x${height}`;
}

/** Cria framebuffer + textura RGBA8 do tamanho dado e restaura o framebuffer que estava ligado. */
function createEntry(gl: WebGL2RenderingContext, width: number, height: number): FboEntry {
  const previous = gl.getParameter(gl.FRAMEBUFFER_BINDING) as WebGLFramebuffer | null;
  const texture = gl.createTexture();
  if (!texture) throw new Error('texture-create-failed');
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA8, width, height, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);

  const framebuffer = gl.createFramebuffer();
  if (!framebuffer) throw new Error('framebuffer-create-failed');
  gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  const status = gl.checkFramebufferStatus(gl.FRAMEBUFFER);
  gl.bindFramebuffer(gl.FRAMEBUFFER, previous);
  if (status !== gl.FRAMEBUFFER_COMPLETE) throw new Error(`framebuffer-incomplete:${status}`);
  return { framebuffer, texture, width, height };
}

/** Cria o pool de framebuffers sobre o contexto dado. */
export function createFboPool(gl: WebGL2RenderingContext): FboPool {
  const free = new Map<string, FboEntry[]>();
  const busy = new Map<WebGLTexture, FboEntry>();
  const all = new Set<FboEntry>();
  let freeCount = 0;

  // Apaga o framebuffer e a textura de uma entrada que não está na lista de livres.
  const destroy = (entry: FboEntry): void => {
    gl.deleteFramebuffer(entry.framebuffer);
    gl.deleteTexture(entry.texture);
    all.delete(entry);
  };

  // Devolve a entrada ao pool; guarda como livre só até os limites, senão apaga.
  const release = (entry: FboEntry): void => {
    if (!busy.has(entry.texture)) return;
    busy.delete(entry.texture);
    const key = sizeKey(entry.width, entry.height);
    const list = free.get(key) ?? [];
    if (list.length >= MAX_FREE_PER_SIZE || freeCount >= MAX_FREE_TOTAL) {
      destroy(entry);
      return;
    }
    list.push(entry);
    free.set(key, list);
    freeCount += 1;
  };

  return {
    acquire(width: number, height: number): FboEntry {
      const w = Math.max(1, Math.round(width));
      const h = Math.max(1, Math.round(height));
      const reused = free.get(sizeKey(w, h))?.pop();
      if (reused) freeCount -= 1;
      const entry = reused ?? createEntry(gl, w, h);
      if (!reused) all.add(entry);
      busy.set(entry.texture, entry);
      return entry;
    },
    release,
    releaseTexture(texture: WebGLTexture): void {
      const entry = busy.get(texture);
      if (entry) release(entry);
    },
    trim(): void {
      for (const list of free.values()) {
        for (const entry of list) destroy(entry);
      }
      free.clear();
      freeCount = 0;
    },
    dispose(): void {
      for (const entry of all) {
        gl.deleteFramebuffer(entry.framebuffer);
        gl.deleteTexture(entry.texture);
      }
      all.clear();
      free.clear();
      busy.clear();
      freeCount = 0;
    },
  };
}
