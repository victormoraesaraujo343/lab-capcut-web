// Compositor WebGL2: desenha as camadas com suas texturas num canvas HTML ou offscreen.
import * as twgl from 'twgl.js';
import type { Compositor, CompositeOptions, FrameImage, Layer } from '../../types/render';
import { layerMatrix, cropUvRect } from './matrix';
import { FRAGMENT_SHADER, VERTEX_SHADER } from './shaders';
import { disposeAll, prune, upload } from './textureCache';

/** Recursos WebGL que dependem do contexto e precisam ser recriados após perda de contexto. */
interface GpuResources {
  /** Programa compilado com os uniforms do compositor. */
  programInfo: twgl.ProgramInfo;
  /** Buffer do quad unitário usado por todas as camadas. */
  quad: twgl.BufferInfo;
}

const QUAD_POSITIONS = [-0.5, -0.5, 0.5, -0.5, -0.5, 0.5, 0.5, 0.5];

/** Converte uma cor '#rrggbb' (ou '#rgb') em componentes de 0 a 1. */
export function parseHexColor(hex: string): [number, number, number] {
  const match = /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.exec(hex.trim());
  if (!match || !match[1]) throw new Error(`background-invalid:${hex}`);
  let digits = match[1];
  if (digits.length === 3) {
    digits = digits
      .split('')
      .map((c) => c + c)
      .join('');
  }
  const r = parseInt(digits.slice(0, 2), 16) / 255;
  const g = parseInt(digits.slice(2, 4), 16) / 255;
  const b = parseInt(digits.slice(4, 6), 16) / 255;
  return [r, g, b];
}

/** Cria o compositor WebGL2 sobre o canvas dado; lança 'webgl2-unavailable' se o contexto não existir. */
export function createCompositor(canvas: HTMLCanvasElement | OffscreenCanvas): Compositor {
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
      if (resources) gl.deleteProgram(resources.programInfo.program);
      resources = null;
      gl.getExtension('WEBGL_lose_context')?.loseContext();
    },
  };
}

/** Compila o programa e cria o buffer do quad no contexto. */
function buildResources(gl: WebGL2RenderingContext): GpuResources {
  const programInfo = twgl.createProgramInfo(gl, [VERTEX_SHADER, FRAGMENT_SHADER], (msg: string) => {
    throw new Error(`shader-error:${msg}`);
  });
  const quad = twgl.createBufferInfoFromArrays(gl, {
    a_position: { numComponents: 2, data: QUAD_POSITIONS },
  });
  return { programInfo, quad };
}

/** Desenha um quadro: limpa o fundo, envia cada textura e desenha as camadas em ordem. */
function drawFrame(
  gl: WebGL2RenderingContext,
  resources: GpuResources,
  layers: Layer[],
  images: Map<string, FrameImage>,
  options: CompositeOptions,
  canvas: HTMLCanvasElement | OffscreenCanvas,
): void {
  if (canvas.width !== options.width) canvas.width = options.width;
  if (canvas.height !== options.height) canvas.height = options.height;
  gl.viewport(0, 0, options.width, options.height);

  const [r, g, b] = parseHexColor(options.background);
  gl.clearColor(r, g, b, 1);
  gl.clear(gl.COLOR_BUFFER_BIT);

  gl.enable(gl.BLEND);
  gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA);

  gl.useProgram(resources.programInfo.program);
  twgl.setBuffersAndAttributes(gl, resources.programInfo, resources.quad);

  const usedKeys = new Set<string>();
  for (const layer of layers) {
    const image = images.get(layer.clipId);
    if (!image) continue;
    const texture = upload(gl, layer.clipId, image);
    usedKeys.add(layer.clipId);
    twgl.setUniforms(resources.programInfo, {
      u_matrix: layerMatrix(layer, options.frameWidth, options.frameHeight),
      u_uvRect: cropUvRect(layer.transform.crop),
      u_opacity: layer.transform.opacity,
      u_texture: texture,
    });
    twgl.drawBufferInfo(gl, resources.quad, gl.TRIANGLE_STRIP);
  }
  prune(gl, usedKeys);
}
