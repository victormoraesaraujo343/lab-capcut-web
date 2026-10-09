// Cache de programas WebGL2: um programa por efeito/transição do registro (vertex de tela cheia) e passes internos.
import * as twgl from 'twgl.js';
import type { ParamValue } from '../../types/effects';
import type { EffectDefinition, EffectParamSpec } from './registry';
import { PASS_VERTEX_SHADER } from './shaders';

/** Vértices do quad de tela cheia em clip space (triangle strip). */
const SCREEN_POSITIONS = [-1, -1, 1, -1, -1, 1, 1, 1];

/** Cache de programas de um contexto WebGL2. */
export interface ProgramCache {
  /** Quad de tela cheia usado por todos os passes. */
  readonly screen: twgl.BufferInfo;
  /** Programa do efeito ou transição, compilado na primeira vez. */
  forDefinition(def: EffectDefinition): twgl.ProgramInfo;
  /** Programa interno (ex.: cópia) identificado por chave, compilado na primeira vez. */
  internal(key: string, fragmentSource: string): twgl.ProgramInfo;
  /** Apaga os programas e o quad de tela cheia. */
  dispose(): void;
}

/** Converte '#rrggbb' (ou '#rgb') em componentes 0..1; lança 'background-invalid' se o formato não bater. */
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

/** Cria o cache de programas sobre o contexto dado; os programas são compilados sob demanda. */
export function createProgramCache(gl: WebGL2RenderingContext): ProgramCache {
  const programs = new Map<string, twgl.ProgramInfo>();
  const screen = twgl.createBufferInfoFromArrays(gl, {
    a_position: { numComponents: 2, data: SCREEN_POSITIONS },
  });

  const compile = (key: string, fragmentSource: string): twgl.ProgramInfo => {
    const cached = programs.get(key);
    if (cached) return cached;
    const info = twgl.createProgramInfo(gl, [PASS_VERTEX_SHADER, fragmentSource], (msg: string) => {
      throw new Error(`shader-error:${key}:${msg}`);
    });
    programs.set(key, info);
    return info;
  };

  return {
    screen,
    forDefinition(def: EffectDefinition): twgl.ProgramInfo {
      return compile(`fx:${def.type}`, def.fragmentSource);
    },
    internal(key: string, fragmentSource: string): twgl.ProgramInfo {
      return compile(`internal:${key}`, fragmentSource);
    },
    dispose(): void {
      for (const info of programs.values()) {
        gl.deleteProgram(info.program);
      }
      programs.clear();
      for (const attrib of Object.values(screen.attribs ?? {})) {
        gl.deleteBuffer(attrib.buffer);
      }
    },
  };
}

/** Converte um valor de parâmetro no valor do uniform correspondente ao tipo do controle. */
function paramToUniform(spec: EffectParamSpec, value: ParamValue): number | number[] {
  switch (spec.type) {
    case 'number':
      return typeof value === 'number' ? value : typeof spec.default === 'number' ? spec.default : 0;
    case 'boolean':
      if (typeof value === 'boolean') return value ? 1 : 0;
      return typeof value === 'number' && value !== 0 ? 1 : 0;
    case 'color':
      return colorUniform(typeof value === 'string' ? value : String(spec.default));
    case 'select':
      return selectIndex(spec, value);
  }
}

/** Cor '#rrggbb' em vec3 0..1; cor inválida vira preto. */
function colorUniform(hex: string): number[] {
  if (!/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(hex.trim())) return [0, 0, 0];
  return [...parseHexColor(hex)];
}

/** Índice da opção selecionada (0 quando o valor não existe nas opções). */
function selectIndex(spec: EffectParamSpec, value: ParamValue): number {
  if (typeof value === 'number') return Math.max(0, Math.trunc(value));
  const index = spec.options?.indexOf(String(value)) ?? -1;
  return index < 0 ? 0 : index;
}

/** Valores dos uniforms u_<key> de um efeito para os parâmetros dados (ausentes usam o padrão). */
export function uniformValuesFor(def: EffectDefinition, params: Record<string, ParamValue>): Record<string, number | number[]> {
  const values: Record<string, number | number[]> = {};
  for (const spec of def.params) {
    values[`u_${spec.key}`] = paramToUniform(spec, params[spec.key] ?? spec.default);
  }
  return values;
}

/** Dados por passe além dos parâmetros: resolução, tempo, índice do passe e texturas de entrada. */
export interface EffectExtras {
  /** Resolução do alvo em px. */
  resolution: [number, number];
  /** Segundos desde o início do clipe. */
  timeSec: number;
  /** Índice do passe atual (0..passes-1). */
  pass: number;
  /** Textura de entrada (u_texture). */
  texture: WebGLTexture;
  /** Máscara de recorte, se houver (u_matte + u_hasMatte). */
  matte?: WebGLTexture | null;
  /** Clipe que sai (transições: u_from). */
  from?: WebGLTexture;
  /** Clipe que entra (transições: u_to). */
  to?: WebGLTexture;
  /** Progresso da transição 0..1 (u_progress). */
  progress?: number;
}

/** Envia os uniforms de um efeito/transição: parâmetros, resolução, tempo, passe e texturas. */
export function setEffectUniforms(
  gl: WebGL2RenderingContext,
  programInfo: twgl.ProgramInfo,
  def: EffectDefinition,
  params: Record<string, ParamValue>,
  extras: EffectExtras,
): void {
  const values: Record<string, number | number[] | WebGLTexture | null> = {
    ...uniformValuesFor(def, params),
    u_resolution: extras.resolution,
    u_time: extras.timeSec,
    u_pass: extras.pass,
    u_texture: extras.texture,
    u_hasMatte: extras.matte ? 1 : 0,
    u_matte: extras.matte ?? extras.texture,
  };
  if (extras.from) values.u_from = extras.from;
  if (extras.to) values.u_to = extras.to;
  if (extras.progress !== undefined) values.u_progress = extras.progress;
  twgl.setUniforms(programInfo, values);
}
