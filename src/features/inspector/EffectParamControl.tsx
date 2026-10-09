// Controle de um parâmetro de efeito ou filtro, gerado a partir do spec do registro (número, liga/desliga, cor ou lista).
import { t } from '@/i18n/pt-BR';
import type { EffectParamSpec } from '@/engine/render/registry';
import { updateEffectParam } from '@/stores/effectCommands';
import type { ParamValue } from '@/types';
import { ColorField } from './ColorField';
import { NumberField } from './NumberField';
import fieldStyles from './NumberField.module.css';
import sectionStyles from './Section.module.css';

/** Textos de tradução agrupados (ex.: t.effects.params), indexáveis por chave vinda de dados. */
export type TextGroup = Readonly<Record<string, unknown>>;

/** Texto de um grupo de traduções pela chave; undefined se a chave não existir ou não for texto. */
export function lookupText(group: TextGroup, key: string): string | undefined {
  const value = group[key];
  return typeof value === 'string' ? value : undefined;
}

/** Rótulos dos parâmetros de efeito, pela chave do parâmetro. */
const EFFECT_PARAM_TEXTS: TextGroup = t.effects.params;
/** Rótulos das opções de lista (ex.: horizontal, vertical), pelo valor da opção. */
const OPTION_TEXTS: TextGroup = t.effects.mirrorOptions;

/** Propriedades de EffectParamControl. */
export interface EffectParamControlProps {
  /** Clipe dono do efeito ou filtro. */
  clipId: string;
  /** Id da instância de efeito ou filtro. */
  instanceId: string;
  /** Especificação do parâmetro no registro (tipo, limites, padrão). */
  spec: EffectParamSpec;
  /** Valor atual salvo na instância; ausente usa o padrão do spec. */
  value: ParamValue | undefined;
  /** Rótulo opcional; sem ele usa o texto de t.effects.params. */
  label?: string;
}

/** Controle de um parâmetro: número com slider, liga/desliga, cor ou lista; cada mudança vai para updateEffectParam. */
export function EffectParamControl({ clipId, instanceId, spec, value, label }: EffectParamControlProps) {
  const text = label ?? lookupText(EFFECT_PARAM_TEXTS, spec.key) ?? spec.key;
  const current = value ?? spec.default;
  const write = (next: ParamValue): void => updateEffectParam(clipId, instanceId, spec.key, next);

  if (spec.type === 'number') {
    return (
      <NumberField
        label={text}
        value={typeof current === 'number' ? current : Number(spec.default)}
        min={spec.min ?? 0}
        max={spec.max ?? 1}
        step={spec.step ?? 0.01}
        onChange={(next) => write(next)}
      />
    );
  }

  if (spec.type === 'boolean') {
    return (
      <div className={fieldStyles.row}>
        <span className={fieldStyles.label}>{text}</span>
        <input
          type="checkbox"
          aria-label={text}
          checked={current === true}
          onChange={(event) => write(event.target.checked)}
        />
      </div>
    );
  }

  if (spec.type === 'color') {
    return (
      <ColorField
        label={text}
        value={typeof current === 'string' ? current : String(spec.default)}
        onChange={(next) => write(next)}
      />
    );
  }

  const selected = String(current);
  return (
    <div className={fieldStyles.row}>
      <span className={fieldStyles.label}>{text}</span>
      <select
        className={sectionStyles.select}
        aria-label={text}
        value={selected}
        onChange={(event) => write(event.target.value)}
        style={{ gridColumn: 'span 2' }}
      >
        {(spec.options ?? []).map((option) => (
          <option key={option} value={option}>
            {lookupText(OPTION_TEXTS, option) ?? option}
          </option>
        ))}
      </select>
    </div>
  );
}
