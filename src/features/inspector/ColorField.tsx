// Campo de cor do inspetor: seletor nativo e código hexadecimal editável.
import { useState, type KeyboardEvent } from 'react';
import { t } from '@/i18n/pt-BR';
import styles from './NumberField.module.css';

/** Propriedades de ColorField. */
export interface ColorFieldProps {
  /** Rótulo exibido à esquerda do campo. */
  label: string;
  /** Cor atual em CSS; só o formato #rrggbb é editado pelo seletor. */
  value: string;
  /** Recebe a nova cor; final é false durante a escolha e true ao confirmar. */
  onChange: (value: string, final: boolean) => void;
}

/** Formato aceito pelo seletor nativo e pelo campo hexadecimal. */
const HEX_PATTERN = /^#[0-9a-f]{6}$/i;

/** Campo de cor: seletor nativo, mais o código hexadecimal para digitar. Cores fora de #rrggbb ficam só no código. */
export function ColorField({ label, value, onChange }: ColorFieldProps) {
  const [draft, setDraft] = useState<string | null>(null);
  const pickerValue = HEX_PATTERN.test(value) ? value : '#000000';
  const shown = draft ?? value;

  /** Confirma o código digitado se for um hexadecimal válido. */
  const commitDraft = (): void => {
    if (draft === null) return;
    const candidate = draft.trim();
    setDraft(null);
    if (HEX_PATTERN.test(candidate)) onChange(candidate.toLowerCase(), true);
  };

  /** Enter confirma o código; Escape descarta a digitação. */
  const handleKeyDown = (event: KeyboardEvent<HTMLInputElement>): void => {
    if (event.key === 'Enter') commitDraft();
    if (event.key === 'Escape') setDraft(null);
  };

  return (
    <div className={styles.row}>
      <span className={styles.label}>{label}</span>
      <input
        type="color"
        aria-label={label}
        value={pickerValue}
        className={styles.picker}
        onChange={(event) => onChange(event.target.value, false)}
        onBlur={(event) => {
          // Só confirma se a cor atual já é hexadecimal; cor em rgba não vira #000000 por um blur.
          if (HEX_PATTERN.test(value)) onChange(event.currentTarget.value, true);
        }}
      />
      <span className={styles.field}>
        <input
          className={styles.input}
          type="text"
          aria-label={t.inspector.hexCode}
          value={shown}
          spellCheck={false}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={handleKeyDown}
          onBlur={commitDraft}
        />
      </span>
    </div>
  );
}
