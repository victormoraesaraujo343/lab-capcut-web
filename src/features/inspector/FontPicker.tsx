// Seletor de fonte do texto: lista das fontes embutidas desenhadas na própria fonte e busca de qualquer família do Google Fonts.
import { useRef, useState, type FormEvent } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { t } from '@/i18n/pt-BR';
import { BUNDLED_FAMILIES, ensureFont } from '@/engine/text/fontLoader';
import { updateText } from '@/stores/textCommands';
import sectionStyles from './Section.module.css';
import styles from './FontPicker.module.css';

/** Propriedades de FontPicker. */
export interface FontPickerProps {
  /** Id do clipe de texto que recebe a fonte. */
  clipId: string;
  /** Fonte atual do texto. */
  fontFamily: string;
  /** Negrito do texto; a fonte é carregada no mesmo peso. */
  bold: boolean;
}

/** Estado da troca de fonte: nada, carregando ou falhou. */
type FontStatus = 'idle' | 'loading' | 'failed';

/** Seletor de fonte: botão que abre a lista, lista embutida e campo de busca. */
export function FontPicker({ clipId, fontFamily, bold }: FontPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<FontStatus>('idle');
  /** Última família pedida; uma resposta antiga não sobrescreve a escolha mais recente. */
  const latestRequest = useRef('');
  const baseUrl = document.baseURI;

  /** Abre ou fecha a lista; ao abrir, carrega as fontes embutidas para a prévia mostrar seus nomes. */
  const toggleOpen = (): void => {
    const next = !open;
    setOpen(next);
    if (next) {
      for (const family of BUNDLED_FAMILIES) void ensureFont(family, false, baseUrl);
    }
  };

  /** Carrega a família e, se der certo, aplica ao texto; se não der, mostra a falha. */
  const choose = (family: string): void => {
    const name = family.trim();
    if (name === '') return;
    latestRequest.current = name;
    setStatus('loading');
    void ensureFont(name, bold, baseUrl).then((ok) => {
      if (latestRequest.current !== name) return;
      if (ok) {
        updateText(clipId, { style: { fontFamily: name } });
        setStatus('idle');
        setOpen(false);
      } else {
        setStatus('failed');
      }
    });
  };

  /** Enviar a busca tenta a família digitada. */
  const handleSearch = (event: FormEvent<HTMLFormElement>): void => {
    event.preventDefault();
    choose(query);
  };

  return (
    <div className={styles.picker}>
      <button
        type="button"
        className={styles.trigger}
        aria-expanded={open}
        aria-controls={`${clipId}-fonts`}
        onClick={toggleOpen}
      >
        {open ? <ChevronDown size={14} aria-hidden="true" /> : <ChevronRight size={14} aria-hidden="true" />}
        <span className={styles.current} style={{ fontFamily: `"${fontFamily}", sans-serif` }}>
          {fontFamily}
        </span>
      </button>

      {open && (
        <div id={`${clipId}-fonts`} className={styles.panel}>
          <ul className={styles.list} aria-label={t.inspector.fontList}>
            {BUNDLED_FAMILIES.map((family) => (
              <li key={family}>
                <button
                  type="button"
                  className={styles.option}
                  aria-pressed={family === fontFamily}
                  style={{ fontFamily: `"${family}", sans-serif` }}
                  onClick={() => choose(family)}
                >
                  {family}
                </button>
              </li>
            ))}
          </ul>
          <form className={styles.search} onSubmit={handleSearch}>
            <input
              className={sectionStyles.search}
              type="text"
              aria-label={t.text.fontSearch}
              placeholder={t.text.fontSearch}
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />
          </form>
          {status === 'loading' && <p className={styles.note}>{t.text.fontLoading}</p>}
          {status === 'failed' && <p className={styles.error}>{t.text.fontFailed}</p>}
        </div>
      )}
    </div>
  );
}
