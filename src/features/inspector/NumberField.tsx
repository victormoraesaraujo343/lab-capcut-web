// Campo numérico do inspetor: rótulo arrastável (scrub), slider, campo digitável e setas.
import { useRef, useState, type KeyboardEvent, type PointerEvent } from 'react';
import styles from './NumberField.module.css';

/** Propriedades de NumberField. */
export interface NumberFieldProps {
  /** Rótulo exibido à esquerda; arrastar horizontalmente sobre ele muda o valor. */
  label: string;
  /** Valor atual, já na unidade de exibição. */
  value: number;
  /** Menor valor aceito. */
  min: number;
  /** Maior valor aceito. */
  max: number;
  /** Passo de ajuste (setas, arraste e slider). */
  step: number;
  /** Unidade mostrada depois do campo, ex.: 'px'. */
  unit?: string;
  /** Recebe o novo valor; durante o arraste final é false, ao soltar, digitar ou usar setas é true. */
  onChange: (value: number, final: boolean) => void;
}

/** Quantidade de casas decimais do passo (0.05 -> 2, 1 -> 0). */
function decimalsOf(step: number): number {
  const fraction = String(step).split('.')[1];
  return fraction === undefined ? 0 : fraction.length;
}

/** Limita o valor ao intervalo e alinha ao passo, sem ruído de ponto flutuante. */
function normalize(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const aligned = Math.round((clamped - min) / step) * step + min;
  const bounded = Math.min(max, Math.max(min, aligned));
  return Number(bounded.toFixed(decimalsOf(step)));
}

/** Converte o texto digitado em número; null se não for um número válido. */
function parseDraft(draft: string): number | null {
  const parsed = Number(draft.trim().replace(',', '.'));
  return draft.trim() === '' || !Number.isFinite(parsed) ? null : parsed;
}

/** Campo com rótulo, slider, valor digitável e unidade; é o controle numérico padrão do inspetor. */
export function NumberField({ label, value, min, max, step, unit, onChange }: NumberFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const [scrubStart, setScrubStart] = useState<{ x: number; value: number } | null>(null);
  /** Último valor mandado pelo slider, para gravar o final ao soltar. */
  const sliderValue = useRef(value);
  const decimals = decimalsOf(step);
  const shown = draft ?? String(Number(value.toFixed(decimals)));
  /** Sensibilidade do arraste: a faixa inteira cabe em 200 px. */
  const pxPerUnit = (max - min) / 200;

  /** Confirma o texto digitado, se for válido; texto inválido apenas descarta a digitação. */
  const commitDraft = (): void => {
    if (draft === null) return;
    const parsed = parseDraft(draft);
    setDraft(null);
    if (parsed === null) return;
    onChange(normalize(parsed, min, max, step), true);
  };

  /** Setas ↑/↓ mudam um passo; com Shift, dez passos. */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') {
      event.preventDefault();
      commitDraft();
      return;
    }
    if (event.key === 'Escape') {
      setDraft(null);
      return;
    }
    if (event.key !== 'ArrowUp' && event.key !== 'ArrowDown') return;
    event.preventDefault();
    const direction = event.key === 'ArrowUp' ? 1 : -1;
    const amount = (event.shiftKey ? 10 : 1) * step * direction;
    setDraft(null);
    onChange(normalize(value + amount, min, max, step), true);
  };

  /** Inicia o arraste sobre o rótulo, capturando o ponteiro. */
  const handleScrubStart = (event: PointerEvent<HTMLSpanElement>): void => {
    event.currentTarget.setPointerCapture(event.pointerId);
    setScrubStart({ x: event.clientX, value });
  };

  /** Durante o arraste, muda o valor pelo deslocamento horizontal (sem fechar o passo do histórico). */
  const handleScrubMove = (event: PointerEvent<HTMLSpanElement>): void => {
    if (scrubStart === null) return;
    const delta = (event.clientX - scrubStart.x) * pxPerUnit;
    onChange(normalize(scrubStart.value + delta, min, max, step), false);
  };

  /** Termina o arraste e grava o valor final. */
  const handleScrubEnd = (event: PointerEvent<HTMLSpanElement>): void => {
    if (scrubStart === null) return;
    const delta = (event.clientX - scrubStart.x) * pxPerUnit;
    setScrubStart(null);
    onChange(normalize(scrubStart.value + delta, min, max, step), true);
  };

  return (
    <div className={styles.row}>
      <span
        className={styles.label}
        onPointerDown={handleScrubStart}
        onPointerMove={handleScrubMove}
        onPointerUp={handleScrubEnd}
        onPointerCancel={() => setScrubStart(null)}
      >
        {label}
      </span>
      <input
        className={styles.slider}
        type="range"
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => {
          sliderValue.current = normalize(Number(event.target.value), min, max, step);
          onChange(sliderValue.current, false);
        }}
        onPointerDown={() => {
          sliderValue.current = value;
        }}
        onPointerUp={() => onChange(sliderValue.current, true)}
      />
      <span className={styles.field}>
        <input
          className={styles.input}
          type="number"
          aria-label={label}
          min={min}
          max={max}
          step={step}
          value={shown}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
        />
        {unit !== undefined && unit !== '' && <span className={styles.unit}>{unit}</span>}
      </span>
    </div>
  );
}
