// Painel esquerdo com abas (Mídia, Texto, Legendas): o cabeçalho tem as abas e o corpo mostra a aba ativa.

import { useRef, useState, type KeyboardEvent } from 'react';
import { Captions, Film, Type, type LucideIcon } from 'lucide-react';
import { PanelShell } from '@/features/layout/PanelShell';
import { MediaPanel } from '@/features/media/MediaPanel';
import { t } from '@/i18n/pt-BR';
import { CaptionsTab } from './CaptionsTab';
import { TextTab } from './TextTab';
import styles from './LibraryPanel.module.css';

/** Identificador de cada aba da biblioteca. */
export type LibraryTab = 'media' | 'text' | 'captions';

/** Aba mostrada quando não há preferência guardada. */
const DEFAULT_TAB: LibraryTab = 'media';

/** Chave do localStorage onde a aba ativa fica guardada. */
const STORAGE_KEY = 'capcut-web:library-tab';

/** Abas na ordem em que aparecem, com ícone e rótulo. */
const TABS: readonly { id: LibraryTab; icon: LucideIcon; label: string }[] = [
  { id: 'media', icon: Film, label: t.library.tabs.media },
  { id: 'text', icon: Type, label: t.library.tabs.text },
  { id: 'captions', icon: Captions, label: t.library.tabs.captions },
];

/** Diz se o valor guardado é uma aba conhecida. */
function isLibraryTab(value: string | null): value is LibraryTab {
  return TABS.some((tab) => tab.id === value);
}

/** Lê a aba guardada no localStorage; sem acesso ou sem valor válido, volta à aba padrão. */
function readStoredTab(): LibraryTab {
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return isLibraryTab(stored) ? stored : DEFAULT_TAB;
  } catch {
    return DEFAULT_TAB;
  }
}

/** Guarda a aba ativa no localStorage; se não der, a escolha vale só nesta sessão. */
function storeTab(tab: LibraryTab): void {
  try {
    window.localStorage.setItem(STORAGE_KEY, tab);
  } catch {
    // Sem armazenamento disponível: a aba simplesmente não é lembrada.
  }
}

/** Painel da biblioteca: abas de mídia, texto e legendas, com a aba ativa lembrada entre sessões. */
export function LibraryPanel() {
  const [activeTab, setActiveTab] = useState<LibraryTab>(readStoredTab);
  const tabRefs = useRef<Partial<Record<LibraryTab, HTMLButtonElement | null>>>({});

  /** Troca a aba ativa e guarda a escolha. */
  function selectTab(tab: LibraryTab) {
    setActiveTab(tab);
    storeTab(tab);
  }

  /** Setas esquerda e direita trocam de aba e movem o foco junto. */
  function handleTabKeyDown(event: KeyboardEvent<HTMLButtonElement>, index: number) {
    const step = event.key === 'ArrowRight' ? 1 : event.key === 'ArrowLeft' ? -1 : 0;
    if (step === 0) return;
    event.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length];
    if (next === undefined) return;
    selectTab(next.id);
    tabRefs.current[next.id]?.focus();
  }

  const tablist = (
    <div className={styles.tablist} role="tablist" aria-label={t.library.tabsLabel}>
      {TABS.map((tab, index) => {
        const selected = tab.id === activeTab;
        const Icon = tab.icon;
        return (
          <button
            key={tab.id}
            ref={(element) => {
              tabRefs.current[tab.id] = element;
            }}
            type="button"
            role="tab"
            id={`library-tab-${tab.id}`}
            aria-selected={selected}
            aria-controls="library-tabpanel"
            tabIndex={selected ? 0 : -1}
            title={tab.label}
            className={selected ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            <span className={styles.tabLabel}>{tab.label}</span>
          </button>
        );
      })}
    </div>
  );

  return (
    <PanelShell title="" actions={tablist}>
      <div
        className={styles.tabpanel}
        role="tabpanel"
        id="library-tabpanel"
        aria-labelledby={`library-tab-${activeTab}`}
      >
        {activeTab === 'media' ? <MediaPanel embedded /> : null}
        {activeTab === 'text' ? <TextTab /> : null}
        {activeTab === 'captions' ? <CaptionsTab /> : null}
      </div>
    </PanelShell>
  );
}
