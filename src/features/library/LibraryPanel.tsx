// Painel esquerdo com abas (Mídia, Áudio, Texto, Efeitos, Transições, Filtros, Legendas): o cabeçalho tem as abas e o corpo mostra a aba ativa.

import { useEffect, useRef, useState, type KeyboardEvent } from 'react';
import { ArrowLeftRight, Captions, Film, Music, Palette, Sparkles, Type, type LucideIcon } from 'lucide-react';
import { PanelShell } from '@/features/layout/PanelShell';
import { MediaPanel } from '@/features/media/MediaPanel';
import { t } from '@/i18n/pt-BR';
import { AudioTab } from './AudioTab';
import { CaptionsTab } from './CaptionsTab';
import { EffectsTab } from './EffectsTab';
import { FiltersTab } from './FiltersTab';
import { TextTab } from './TextTab';
import { TransitionsTab } from './TransitionsTab';
import styles from './LibraryPanel.module.css';

/** Identificador de cada aba da biblioteca. */
export type LibraryTab = 'media' | 'audio' | 'text' | 'effects' | 'transitions' | 'filters' | 'captions';

/** Aba mostrada quando não há preferência guardada. */
const DEFAULT_TAB: LibraryTab = 'media';

/** Chave do localStorage onde a aba ativa fica guardada. */
const STORAGE_KEY = 'capcut-web:library-tab';

/** Largura do painel abaixo da qual as abas mostram só o ícone. */
const ICON_ONLY_BELOW_PX = 320;

/** Abas na ordem em que aparecem, com ícone e rótulo. */
const TABS: readonly { id: LibraryTab; icon: LucideIcon; label: string }[] = [
  { id: 'media', icon: Film, label: t.library.tabs.media },
  { id: 'audio', icon: Music, label: t.library.tabs.audio },
  { id: 'text', icon: Type, label: t.library.tabs.text },
  { id: 'effects', icon: Sparkles, label: t.library.tabs.effects },
  { id: 'transitions', icon: ArrowLeftRight, label: t.library.tabs.transitions },
  { id: 'filters', icon: Palette, label: t.library.tabs.filters },
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

/** Painel da biblioteca: abas de mídia, texto, efeitos, transições, filtros e legendas, com a aba ativa lembrada entre sessões. */
export function LibraryPanel() {
  const [activeTab, setActiveTab] = useState<LibraryTab>(readStoredTab);
  const [iconsOnly, setIconsOnly] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);
  const tabRefs = useRef<Partial<Record<LibraryTab, HTMLButtonElement | null>>>({});

  // Mede a largura do painel: abaixo do limite, as abas ficam só com ícone (com dica no hover).
  useEffect(() => {
    const element = rootRef.current;
    if (element === null || typeof ResizeObserver === 'undefined') return;
    const observer = new ResizeObserver((entries) => {
      const width = entries[0]?.contentRect.width ?? ICON_ONLY_BELOW_PX;
      setIconsOnly(width < ICON_ONLY_BELOW_PX);
    });
    observer.observe(element);
    return () => observer.disconnect();
  }, []);

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
            aria-label={tab.label}
            tabIndex={selected ? 0 : -1}
            title={tab.label}
            className={selected ? `${styles.tab} ${styles.tabActive}` : styles.tab}
            onClick={() => selectTab(tab.id)}
            onKeyDown={(event) => handleTabKeyDown(event, index)}
          >
            <Icon size={14} strokeWidth={1.75} aria-hidden="true" />
            {iconsOnly ? null : <span className={styles.tabLabel}>{tab.label}</span>}
          </button>
        );
      })}
    </div>
  );

  return (
    <div ref={rootRef} className={styles.root}>
      <PanelShell title="" actions={tablist}>
        <div
          className={styles.tabpanel}
          role="tabpanel"
          id="library-tabpanel"
          aria-labelledby={`library-tab-${activeTab}`}
        >
          {activeTab === 'media' ? <MediaPanel embedded /> : null}
          {activeTab === 'audio' ? <AudioTab /> : null}
          {activeTab === 'text' ? <TextTab /> : null}
          {activeTab === 'effects' ? <EffectsTab /> : null}
          {activeTab === 'transitions' ? <TransitionsTab /> : null}
          {activeTab === 'filters' ? <FiltersTab /> : null}
          {activeTab === 'captions' ? <CaptionsTab /> : null}
        </div>
      </PanelShell>
    </div>
  );
}
