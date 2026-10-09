// Sobreposições: o shader procedural roda num framebuffer do tamanho do quadro e o resultado é composto com a mistura do clipe.
import * as twgl from 'twgl.js';
import type { OverlayData } from '../../types/project';
import type { CompositeOptions, Layer } from '../../types/render';
import { bindTarget } from './effectPipeline';
import type { FboPool } from './fboPool';
import { layerMatrix, cropUvRect } from './matrix';
import { uniformValuesFor, type ProgramCache } from './programCache';
import { getEffect } from './registry';

/** Recursos WebGL necessários para desenhar uma sobreposição (os mesmos do compositor). */
export interface OverlayResources {
  /** Programa das camadas (u_matrix, u_uvRect, u_opacity, u_texture). */
  programInfo: twgl.ProgramInfo;
  /** Quad unitário usado pelas camadas. */
  quad: twgl.BufferInfo;
  /** Cache dos programas dos shaders de sobreposição. */
  programs: ProgramCache;
  /** Pool de framebuffers do tamanho do quadro. */
  pool: FboPool;
}

/** Fatores de blend (origem, destino) de cada mistura; o shader devolve cor pré-multiplicada. */
export function blendFactors(gl: WebGL2RenderingContext, blend: OverlayData['blend']): [number, number] {
  switch (blend) {
    case 'add':
      return [gl.ONE, gl.ONE];
    case 'screen':
      return [gl.ONE, gl.ONE_MINUS_SRC_COLOR];
    case 'normal':
      return [gl.ONE, gl.ONE_MINUS_SRC_ALPHA];
  }
}

/** Desenha uma camada de sobreposição: shader no framebuffer do quadro, depois composição com transformação, opacidade e mistura. Tipo desconhecido não desenha nada. */
export function drawOverlayLayer(
  gl: WebGL2RenderingContext,
  res: OverlayResources,
  layer: Layer,
  options: CompositeOptions,
): void {
  const overlay = layer.overlay;
  if (!overlay) return;
  const def = getEffect(overlay.type);
  if (!def || def.category !== 'overlay') return;
  const target = res.pool.acquire(options.width, options.height);
  try {
    renderOverlay(gl, res, overlay, layer.localTimeMs / 1000, target);
    composeOverlay(gl, res, layer, target, options, overlay.blend);
  } finally {
    res.pool.release(target);
  }
}

/** Roda o shader da sobreposição no framebuffer dado (tamanho do quadro), com os parâmetros e o tempo do clipe. */
function renderOverlay(
  gl: WebGL2RenderingContext,
  res: OverlayResources,
  overlay: OverlayData,
  timeSec: number,
  target: { width: number; height: number; framebuffer: WebGLFramebuffer; texture: WebGLTexture },
): void {
  const def = getEffect(overlay.type);
  if (!def) return;
  const info = res.programs.forDefinition(def);
  bindTarget(gl, target);
  gl.disable(gl.BLEND);
  gl.clearColor(0, 0, 0, 0);
  gl.clear(gl.COLOR_BUFFER_BIT);
  gl.useProgram(info.program);
  twgl.setBuffersAndAttributes(gl, info, res.programs.screen);
  twgl.setUniforms(info, {
    ...uniformValuesFor(def, overlay.params),
    u_resolution: [target.width, target.height],
    u_time: timeSec,
  });
  twgl.drawBufferInfo(gl, res.programs.screen, gl.TRIANGLE_STRIP);
}

/** Compõe o quadro da sobreposição no canvas com a transformação e opacidade da camada e a mistura do clipe. */
function composeOverlay(
  gl: WebGL2RenderingContext,
  res: OverlayResources,
  layer: Layer,
  target: { texture: WebGLTexture },
  options: CompositeOptions,
  blend: OverlayData['blend'],
): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  gl.viewport(0, 0, options.width, options.height);
  gl.enable(gl.BLEND);
  const [src, dst] = blendFactors(gl, blend);
  gl.blendFunc(src, dst);
  gl.useProgram(res.programInfo.program);
  twgl.setBuffersAndAttributes(gl, res.programInfo, res.quad);
  twgl.setUniforms(res.programInfo, {
    u_matrix: layerMatrix(layer, options.frameWidth, options.frameHeight),
    u_uvRect: cropUvRect(layer.transform.crop),
    u_opacity: layer.transform.opacity,
    u_texture: target.texture,
  });
  twgl.drawBufferInfo(gl, res.quad, gl.TRIANGLE_STRIP);
}
