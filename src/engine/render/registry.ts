// Registro de efeitos, filtros e transições: adicionar um novo efeito = criar um arquivo que chama registerEffect.
import type { ParamValue } from '../../types/effects';

/** Categoria de um efeito registrado. */
export type EffectCategory = 'filter' | 'effect' | 'transition';

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
  /** GLSL ES 3.00 que lê u_texture e os uniforms u_<param>. */
  fragmentSource: string;
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
