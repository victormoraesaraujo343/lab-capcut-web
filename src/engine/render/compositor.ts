// Compositor WebGL2: desenha as camadas (com filtros, efeitos, máscara e transições) num canvas HTML ou offscreen.
import * as twgl from 'twgl.js';
import type { Compositor, CompositeOptions, FrameImage, Layer } from '../../types/render';
import { cropUvRect, layerMatrix } from './matrix';
import { applyLayerEffects, bindTarget, layerMargin } from './effectPipeline';
import type { FboEntry, FboPool } from './fboPool';
import { createFboPool } from './fboPool';
import { ensureEffectsRegistered } from './registerAll';
import { getEffect, type EffectDefinition } from './registry';
import { createProgramCache, parseHexColor, setEffectUniforms, type ProgramCache } from './programCache';
import { COPY_FRAGMENT_SHADER, FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import { disposeAll, prune, upload } from './textureCache';

/** Recursos WebGL que dependem do contexto e precisam ser recriados após perda de contexto. */
interface GpuResources {
  /** Programa das camadas (u_matrix, u_uvRect, u_opacity, u_texture). */
  programInfo: twgl.ProgramInfo;
  /** Buffer do quad unitário usado por todas as camadas. */
  quad: twgl.BufferInfo;
  /** Programas dos efeitos, transições e cópias, compilados sob demanda. */
  programs: ProgramCache;
  /** Framebuffers dos passes, reutilizados por tamanho. */
  pool: FboPool;
}

/** Estado de um quadro em desenho: contexto, imagens por chave, opções e texturas usadas (para o prune). */
interface FrameContext {
  /** Contexto WebGL2. */
  gl: WebGL2RenderingContext;
  /** Recursos do contexto. */
  res: GpuResources;
  /** Imagens por chave: clipId, `${clipId}:matte`. */
  images: Map<string, FrameImage>;
  /** Opções do quadro de saída. */
  options: CompositeOptions;
  /** Chaves de textura enviadas neste quadro. */
  keys: Set<string>;
}

/** Cria o compositor WebGL2 sobre o canvas dado; lança 'webgl2-unavailable' se o contexto não existir. */
export function createCompositor(canvas: HTMLCanvasElement | OffscreenCanvas): Compositor {
  ensureEffectsRegistered();
  const gl = (canvas as OffscreenCanvas).getContext('webgl2', {
    premultipliedAlpha: true,
    alpha: false,
    preserveDrawingBuffer: true,
  }) as WebGL2RenderingContext | null;
  if (!gl) throw new Error('webgl2-unavailable');

  let resources: GpuResources | null = buildResources(gl);
  let contextLost = false;

  const onLost = (event: Event): void => {
    event.preventDefault();
    contextLost = true;
    resources = null;
  };
  const onRestored = (): void => {
    contextLost = false;
    disposeAll(gl);
    resources = buildResources(gl);
  };
  canvas.addEventListener('webglcontextlost', onLost);
  canvas.addEventListener('webglcontextrestored', onRestored);

  return {
    canvas,
    draw(layers: Layer[], images: Map<string, FrameImage>, options: CompositeOptions): void {
      if (contextLost || !resources) return;
      drawFrame(gl, resources, layers, images, options, canvas);
    },
    dispose(): void {
      canvas.removeEventListener('webglcontextlost', onLost);
      canvas.removeEventListener('webglcontextrestored', onRestored);
      disposeAll(gl);
      if (resources) {
        resources.programs.dispose();
        resources.pool.dispose();
        gl.deleteProgram(resources.programInfo.program);
      }
      resources = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/** Compila os programas e cria os buffers e pools do contexto. */
function buildResources(gl: WebGL2RenderingContext): GpuResources {
  const programInfo = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER], (msg: string) => {
    throw new Error(`shader-error:${msg}`);
  });
  const quad = twgl.createBufferInfoFromArrays(gl, {
    a_position: { numComponents: 2, data: [-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5] },
  });
  return { programInfo, quad, programs: createProgramCache(gl), pool: createFboPool(gl) };
}

/** Desenha um quadro: limpa o fundo, desenha cada camada (ou transição) em ordem e libera texturas não usadas. */
function drawFrame(
  gl: WebGL2RenderingContext,
  res: GpuResources,
  layers: Layer[],
  images: Map<string, FrameImage>,
  options: CompositeOptions,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): void {
  if (canvas.width !== options.width) canvas.width = options.width;
  if (canvas.height !== options.height) canvas.height = options.height;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, options.width, options.height);
  const [r, g, b] = parseHexColor(options.background);
  gl.clearColor(r, g, b, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  const ctx: FrameContext = { gl, res, images, options, keys: new Set<string>() };
  for (const layer of layers) {
    if (layer.transition) {
      drawTransition(ctx, layer);
      continue;
    }
    const image = images.get(layer.clipId);
    if (image) drawLayer(ctx, layer, image, null);
  }
  prune(gl, ctx.keys);
}

/** Envia a imagem da chave para a textura e registra a chave como usada neste quadro. */
function uploadKeyed(ctx: FrameContext, key: string, image: FrameImage): WebGLTexture {
  ctx.keys.add(key);
  return upload(ctx.gl, key, image);
}

/** Margem da camada em px; zero quando a fonte não tem tamanho válido. */
function marginOf(layer: Layer): { mx: number; my: number } {
  if (!(layer.sourceWidth > 0) || !(layer.sourceHeight > 0)) return { mx: 0, my: 0 };
  return layerMargin(layer, layer.sourceWidth, layer.sourceHeight);
}

/** Camada com o recorte afrouxado pela margem: o quad cobre a imagem mais a margem de cada lado. */
function expandLayer(layer: Layer, mx: number, my: number): Layer {
  const ex = mx / layer.sourceWidth;
  const ey = my / layer.sourceHeight;
  const c = layer.transform.crop;
  return {
    ...layer,
    transform: {
      ...layer.transform,
      crop: { top: c.top - ey, right: c.right - ex, bottom: c.bottom - ey, left: c.left - ex },
    },
  };
}

/** Converte um UV da fonte [u0, v0, u1, v1] para o UV do quadro com margem (a fonte ocupa o miolo). */
function paddedUv(rect: [number, number, number, number], mx: number, my: number, w: number, h: number): [number, number, number, number] {
  const pw = w + 2 * mx;
  const ph = h + 2 * my;
  return [(mx + rect[0] * w) / pw, (my + rect[1] * h) / ph, (mx + rect[2] * w) / pw, (my + rect[3] * h) / ph];
}

/** Desenha uma camada (com efeitos) no alvo: framebuffer dado, ou o canvas quando o alvo é null. */
function drawLayer(ctx: FrameContext, layer: Layer, image: FrameImage, target: FboEntry | null): void {
  const { gl, res } = ctx;
  const texture = uploadKeyed(ctx, layer.clipId, image);
  const matteImage = ctx.images.get(`${layer.clipId}:matte`);
  const matteTexture = matteImage ? uploadKeyed(ctx, `${layer.clipId}:matte`, matteImage) : null;
  const processed = applyLayerEffects(
    gl,
    res.pool,
    res.programs,
    texture,
    layer.sourceWidth,
    layer.sourceHeight,
    layer,
    layer.localTimeMs / 1000,
    matteTexture,
  );
  try {
    drawQuad(ctx, layer, processed, target);
  } finally {
    res.pool.releaseTexture(processed);
  }
}

/** Desenha o quad de uma camada já processada, com a transformação e o recorte (com margem, quando houver). */
function drawQuad(ctx: FrameContext, layer: Layer, texture: WebGLTexture, target: FboEntry | null): void {
  const { gl, res, options } = ctx;
  if (target) {
    bindTarget(gl, target);
  } else {
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, options.width, options.height);
  }
  const { mx, my } = marginOf(layer);
  const geometry = mx > 0 || my > 0 ? expandLayer(layer, mx, my) : layer;
  let uv = cropUvRect(geometry.transform.crop);
  if (mx > 0 || my > 0) uv = paddedUv(uv, mx, my, layer.sourceWidth, layer.sourceHeight);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  gl.useProgram(res.programInfo.program);
  twgl.setBuffersAndAttributes(gl, res.programInfo, res.quad);
  twgl.setUniforms(res.programInfo, {
    u_matrix: layerMatrix(geometry, options.frameWidth, options.frameHeight),
    u_uvRect: uv,
    u_opacity: layer.transform.opacity,
    u_texture: texture,
  });
  twgl.drawBufferInfo(gl, res.quad, gl.TRIANGLE_STRIP);
}

/**
 * Transição: desenha a camada que sai e a que entra em dois framebuffers do tamanho do quadro,
 * combina com o shader da transição e compõe o resultado por cima do quadro (pré-multiplicado).
 * Se a transição não existir no registro, desenha só a camada que sai.
 */
function drawTransition(ctx: FrameContext, layer: Layer): void {
  const transition = layer.transition;
  if (!transition) return;
  const { gl, res, options, images } = ctx;
  const def = getEffect(transition.type);
  const outImage = images.get(layer.clipId);
  if (!def) {
    if (outImage) drawLayer(ctx, layer, outImage, null);
    return;
  }
  const inImage = images.get(transition.incoming.clipId);
  const from = res.pool.acquire(options.width, options.height);
  const to = res.pool.acquire(options.width, options.height);
  const out = res.pool.acquire(options.width, options.height);
  try {
    clearTarget(gl, from);
    if (outImage) drawLayer(ctx, layer, outImage, from);
    clearTarget(gl, to);
    if (inImage) drawLayer(ctx, transition.incoming, inImage, to);
    runTransition(ctx, def, transition, from, to, out, layer.localTimeMs / 1000);
    composeOver(ctx, out.texture);
  } finally {
    res.pool.release(from);
    res.pool.release(to);
    res.pool.release(out);
  }
}

/** Limpa um framebuffer com transparente. */
function clearTarget(gl: WebGL2RenderingContext, target: FboEntry): void {
  bindTarget(gl, target);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
}

/** Roda o shader da transição: lê de `from` e `to` e escreve em `out`. */
function runTransition(
  ctx: FrameContext,
  def: EffectDefinition,
  transition: NonNullable<Layer['transition']>,
  from: FboEntry,
  to: FboEntry,
  out: FboEntry,
  timeSec: number,
): void {
  const { gl, res } = ctx;
  const info = res.programs.forDefinition(def);
  bindTarget(gl, out);
  gl.disable(gl.BLEND);
  gl.useProgram(info.program);
  twgl.setBuffersAndAttributes(gl, info, res.programs.screen);
  setEffectUniforms(gl, info, def, transition.params, {
    resolution: [out.width, out.height],
    timeSec,
    pass: 0,
    texture: from.texture,
    from: from.texture,
    to: to.texture,
    progress: transition.progress,
  });
  twgl.drawBufferInfo(gl, res.programs.screen, gl.TRIANGLE_STRIP);
}

/** Compõe uma textura pré-multiplicada por cima do quadro de saída. */
function composeOver(ctx: FrameContext, texture: WebGLTexture): void {
  const { gl, res, options } = ctx;
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, options.width, options.height);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);
  const info = res.programs.internal('copy', COPY_FRAGMENT_SHADER);
  gl.useProgram(info.program);
  twgl.setBuffersAndAttributes(gl, info, res.programs.screen);
  twgl.setUniforms(info, { u_texture: texture, u_scale: [1, 1], u_offset: [0, 0] });
  twgl.drawBufferInfo(gl, res.programs.screen, gl.TRIANGLE_STRIP);
}
