// Registro de efeitos, filtros e transições: adicionar um novo efeito = criar um arquivo que chama registerEffect.
import type { ParamValue } from '../../types/effects';

/** Categoria de um efeito registrado. */
export type EffectCategory = 'filter' | 'effect' | 'transition' | 'overlay';

/** Especificação de um parâmetro editável de um efeito. */
export interface EffectParamSpec {
  /** Nome do parâmetro; vira o uniform u_<key> no shader. */
  key: string;
  /** Tipo do controle de edição. */
  type: 'number' | 'boolean' | 'color' | 'select';
  /** Valor padrão. */
  default: ParamValue;
  /** Valor mínimo (para number). */
  min?: number;
  /** Valor máximo (para number). */
  max?: number;
  /** Passo do controle (para number). */
  step?: number;
  /** Opções disponíveis (para select). */
  options?: string[];
}

/**
 * CONVENÇÃO DOS SHADERS (GLSL ES 3.00, `#version 300 es`, `precision highp float;`):
 * - Filtros e efeitos ('filter' | 'effect'): `in vec2 v_uv;` (0..1, origem no canto SUPERIOR esquerdo),
 *   `uniform sampler2D u_texture;` (imagem da camada, pré-multiplicada), `uniform vec2 u_resolution;` (px da textura),
 *   `uniform float u_time;` (segundos desde o início do clipe), `uniform int u_pass;` (0..passes-1),
 *   `uniform sampler2D u_matte;` + `uniform float u_hasMatte;` (máscara de recorte, efeito de remover fundo),
 *   `out vec4 outColor;` (pré-multiplicada). Cada parâmetro vira `uniform float u_<key>` (number/boolean 0|1),
 *   `uniform vec3 u_<key>` (color, rgb 0..1) ou `uniform int u_<key>` (select = índice da opção).
 * - Transições ('transition'): `in vec2 v_uv;`, `uniform sampler2D u_from;` (clipe que sai), `uniform sampler2D u_to;`
 *   (clipe que entra), `uniform float u_progress;` (0..1), `uniform vec2 u_resolution;`, parâmetros como acima, `out vec4 outColor;`.
 * - Sobreposições ('overlay'): sem textura de entrada; `in vec2 v_uv;`, `uniform vec2 u_resolution;` (px do quadro),
 *   `uniform float u_time;` (segundos desde o início do clipe), parâmetros como acima, `out vec4 outColor;` (pré-multiplicada)
 *   — o compositor mistura o resultado no quadro com a mistura do clipe (screen/add/normal).
 * Os efeitos rodam em sequência sobre a textura da camada (ping-pong em framebuffers do tamanho da fonte),
 * antes da transformação; transições rodam sobre o quadro inteiro das duas camadas já transformadas.
 */
/** Definição completa de um efeito: metadados para a UI e GLSL para o compositor. */
export interface EffectDefinition {
  /** Identificador único do efeito (ex.: 'blur', 'brightness'). */
  type: string;
  /** Categoria do efeito. */
  category: EffectCategory;
  /** Chave de tradução do nome exibido. */
  labelKey: string;
  /** Parâmetros editáveis. */
  params: EffectParamSpec[];
  /** GLSL ES 3.00 que lê u_texture e os uniforms u_<param> (veja a convenção acima). */
  fragmentSource: string;
  /** Quantas passadas do mesmo shader (ex.: desfoque separável = 2, com u_pass 0 horizontal e 1 vertical). Padrão 1. */
  passes?: number;
  /** Margem extra (fração do tamanho) que o efeito precisa em volta da imagem (ex.: tremor, espelho); padrão 0. */
  overscan?: number;
}

const effects = new Map<string, EffectDefinition>();

/** Registra um efeito; lança erro se o tipo já existir. */
export function registerEffect(def: EffectDefinition): void {
  if (effects.has(def.type)) {
    throw new Error(`effect-already-registered:${def.type}`);
  }
  effects.set(def.type, def);
}

/** Devolve a definição do efeito pelo tipo, ou undefined se não existir. */
export function getEffect(type: string): EffectDefinition | undefined {
  return effects.get(type);
}

/** Lista os efeitos registrados, na ordem de registro, opcionalmente filtrando por categoria. */
export function listEffects(category?: EffectCategory): EffectDefinition[] {
  const all = [...effects.values()];
  return category === undefined ? all : all.filter((def) => def.category === category);
}

/** Devolve os valores padrão dos parâmetros do efeito (objeto vazio se o tipo não existir). */
export function defaultParams(type: string): Record<string, ParamValue> {
  const def = effects.get(type);
  const result: Record<string, ParamValue> = {};
  if (!def) return result;
  for (const spec of def.params) {
    result[spec.key] = spec.default;
  }
  return result;
}
