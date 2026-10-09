// Cadeia de filtros e efeitos de uma camada: passes em ping-pong sobre framebuffers, com margem (overscan) e máscara.
import * as twgl from 'twgl.js';
import type { ParamValue } from '../../types/effects';
import type { Layer } from '../../types/render';
import type { FboEntry, FboPool } from './fboPool';
import { getEffect, type EffectDefinition } from './registry';
import { setEffectUniforms, type ProgramCache } from './programCache';
import { COPY_FRAGMENT_SHADER } from './shaders';

/** Um passo da cadeia: definição registrada e parâmetros já avaliados no instante. */
interface Step {
  /** Definição do efeito no registro. */
  def: EffectDefinition;
  /** Parâmetros do filtro/efeito neste instante. */
  params: Record<string, ParamValue>;
}

/** Filtros e efeitos da camada que têm definição no registro, na ordem (filtros antes dos efeitos). */
function collectSteps(layer: Layer): Step[] {
  const steps: Step[] = [];
  for (const instance of [...layer.filters, ...layer.effects]) {
    const def = getEffect(instance.type);
    if (def) steps.push({ def, params: instance.params });
  }
  return steps;
}

/** Margem em px por lado (horizontal e vertical) que a cadeia da camada pede: soma do overscan de cada efeito. */
export function layerMargin(layer: Layer, width: number, height: number): { mx: number; my: number } {
  const overscan = collectSteps(layer).reduce((sum, step) => sum + (step.def.overscan ?? 0), 0);
  return { mx: Math.round(width * overscan), my: Math.round(height * overscan) };
}

/** Liga o framebuffer do alvo e ajusta o viewport ao seu tamanho. */
export function bindTarget(gl: WebGL2RenderingContext, target: FboEntry): void {
  gl.bindFramebuffer(gl.FRAMEBUFFER, target.framebuffer);
  gl.viewport(0, 0, target.width, target.height);
}

/**
 * Copia uma textura para o alvo com UV = v * scale + offset; fora de [0, 1] vira transparente.
 * Usado para colocar a imagem no centro de um quadro maior (margem) e para copiar a máscara junto.
 */
export function copyToTarget(
  gl: WebGL2RenderingContext,
  programs: ProgramCache,
  source: WebGLTexture,
  target: FboEntry,
  scale: [number, number],
  offset: [number, number],
): void {
  const info = programs.internal('copy', COPY_FRAGMENT_SHADER);
  bindTarget(gl, target);
  gl.disable(gl.BLEND);
  gl.useProgram(info.program);
  twgl.setBuffersAndAttributes(gl, info, programs.screen);
  twgl.setUniforms(info, { u_texture: source, u_scale: scale, u_offset: offset });
  twgl.drawBufferInfo(gl, programs.screen, gl.TRIANGLE_STRIP);
}

/** Roda um passe de um efeito: lê `input` e escreve em `target`. */
function runPass(
  gl: WebGL2RenderingContext,
  programs: ProgramCache,
  step: Step,
  input: WebGLTexture,
  target: FboEntry,
  timeSec: number,
  pass: number,
  matte: WebGLTexture | null,
): void {
  const info = programs.forDefinition(step.def);
  bindTarget(gl, target);
  gl.disable(gl.BLEND);
  gl.useProgram(info.program);
  twgl.setBuffersAndAttributes(gl, info, programs.screen);
  setEffectUniforms(gl, info, step.def, step.params, {
    resolution: [target.width, target.height],
    timeSec,
    pass,
    texture: input,
    matte,
  });
  twgl.drawBufferInfo(gl, programs.screen, gl.TRIANGLE_STRIP);
}

/**
 * Aplica filtros e efeitos da camada, na ordem da lista, sobre a textura da fonte.
 * Devolve a textura final (do pool: quem chama deve soltá-la com pool.releaseTexture) ou a própria fonte se não houver efeitos.
 * A máscara só é usada quando a camada tem o efeito 'removeBackground'; sem ele, a máscara é ignorada.
 */
export function applyLayerEffects(
  gl: WebGL2RenderingContext,
  pool: FboPool,
  programs: ProgramCache,
  sourceTexture: WebGLTexture,
  width: number,
  height: number,
  layer: Layer,
  timeSec: number,
  matteTexture: WebGLTexture | null,
): WebGLTexture {
  const steps = collectSteps(layer);
  if (steps.length === 0 || !(width > 0) || !(height > 0)) return sourceTexture;

  const { mx, my } = layerMargin(layer, width, height);
  const pw = width + 2 * mx;
  const ph = height + 2 * my;
  const useMatte = matteTexture !== null && layer.effects.some((effect) => effect.type === 'removeBackground');

  let owned = pool.acquire(pw, ph);
  let matteOwned: FboEntry | null = null;
  try {
    copyToTarget(gl, programs, sourceTexture, owned, [pw / width, ph / height], [-mx / width, -my / height]);
    let matte: WebGLTexture | null = null;
    if (useMatte && matteTexture) {
      if (mx === 0 && my === 0) {
        matte = matteTexture;
      } else {
        matteOwned = pool.acquire(pw, ph);
        copyToTarget(gl, programs, matteTexture, matteOwned, [pw / width, ph / height], [-mx / width, -my / height]);
        matte = matteOwned.texture;
      }
    }
    for (const step of steps) {
      const passes = Math.max(1, step.def.passes ?? 1);
      for (let pass = 0; pass < passes; pass += 1) {
        const target = pool.acquire(pw, ph);
        runPass(gl, programs, step, owned.texture, target, timeSec, pass, matte);
        pool.release(owned);
        owned = target;
      }
    }
  } catch (error) {
    pool.release(owned);
    throw error;
  } finally {
    if (matteOwned) pool.release(matteOwned);
  }
  return owned.texture;
}
