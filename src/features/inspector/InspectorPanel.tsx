// Painel de Propriedades: mostra as seções do clipe selecionado (texto, ou abas de mídia: básico, filtros, efeitos, velocidade e ferramentas).
import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { PanelShell } from '@/features/layout/PanelShell';
import { t } from '@/i18n/pt-BR';
import { findClip } from '@/engine/timeline/clipOps';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Asset, Clip, Project, TextData } from '@/types';
import { AudioSection } from './AudioSection';
import { ClipToolsSection } from './ClipToolsSection';
import { EffectsSection } from './EffectsSection';
import { FiltersSection } from './FiltersSection';
import { SpeechSection } from './SpeechSection';
import { SpeedSection } from './SpeedSection';
import { TextAnimationSection } from './TextAnimationSection';
import { TextContentSection } from './TextContentSection';
import { TextPresetGrid } from './TextPresetGrid';
import { TextStyleSection } from './TextStyleSection';
import { TransformSection } from './TransformSection';
import { TransitionSection } from './TransitionSection';
import styles from './InspectorPanel.module.css';

/** Abas do inspetor de clipes de mídia (vídeo, imagem e áudio). */
type MediaTab = 'basic' | 'filters' | 'effects' | 'speed' | 'tools';

/** Abas de mídia na ordem da tela; cada uma aparece só para os tipos de clipe que a usam. */
const MEDIA_TABS: ReadonlyArray<{ id: MediaTab; label: string }> = [
  { id: 'basic', label: t.inspector.tabBasic },
  { id: 'filters', label: t.inspector.tabFilters },
  { id: 'effects', label: t.inspector.tabEffects },
  { id: 'speed', label: t.inspector.tabSpeed },
  { id: 'tools', label: t.inspector.tabTools },
];

/** Abas do inspetor de texto. */
type TextTab = 'text' | 'animation' | 'transform';

/** Abas do inspetor de texto, na ordem da tela, com o rótulo de cada uma. */
const TEXT_TABS: ReadonlyArray<{ id: TextTab; label: string }> = [
  { id: 'text', label: t.inspector.tabText },
  { id: 'animation', label: t.inspector.tabAnimation },
  { id: 'transform', label: t.inspector.tabTransform },
];

/** Estado vazio do inspetor, com ícone e texto. */
function Empty({ text }: { text: string }) {
  return (
    <div className={styles.empty}>
      <SlidersHorizontal size={48} strokeWidth={1.25} aria-hidden="true" className={styles.emptyIcon} />
      <p className={styles.emptyText}>{text}</p>
    </div>
  );
}

/** Abas de um clipe de texto (Texto, Animação, Posição) e o conteúdo da aba escolhida. */
function TextClipBody({
  project,
  clip,
  text,
  tab,
  onTab,
}: {
  project: Project;
  clip: Clip;
  text: TextData;
  tab: TextTab;
  onTab: (tab: TextTab) => void;
}) {
  return (
    <>
      <div className={styles.tabs} role="tablist">
        {TEXT_TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={tab === item.id}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className={styles.content}>
        {tab === 'text' && (
          <>
            <TextContentSection clipId={clip.id} text={text} />
            <TextPresetGrid clipId={clip.id} />
            <TextStyleSection clipId={clip.id} style={text.style} />
          </>
        )}
        {tab === 'animation' && <TextAnimationSection clipId={clip.id} text={text} />}
        {tab === 'transform' && (
          <TransformSection clip={clip} canvas={{ width: project.width, height: project.height }} />
        )}
      </div>
    </>
  );
}

/** Propriedades de MediaClipBody. */
interface MediaClipBodyProps {
  project: Project;
  clip: Clip;
  /** Clipe com imagem ou vídeo na tela (não é só áudio). */
  visual: boolean;
  /** Clipe com som (vídeo ou áudio). */
  hasSound: boolean;
  /** Asset do clipe; ausente em clipes de fala sintética. */
  asset: Asset | undefined;
  tab: MediaTab;
  onTab: (tab: MediaTab) => void;
}

/** Abas de um clipe de mídia e o conteúdo da aba escolhida; abas sem sentido para o tipo somem. */
function MediaClipBody({ project, clip, visual, hasSound, asset, tab, onTab }: MediaClipBodyProps) {
  const tabs = MEDIA_TABS.filter((item) => {
    if (item.id === 'speed') return hasSound && clip.tts === undefined;
    if (item.id === 'basic') return true;
    return visual;
  });
  const current = tabs.some((item) => item.id === tab) ? tab : 'basic';

  return (
    <>
      <div
        className={styles.tabs}
        role="tablist"
        style={{ gridTemplateColumns: `repeat(${tabs.length}, minmax(0, 1fr))` }}
      >
        {tabs.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            className={styles.tab}
            aria-selected={current === item.id}
            onClick={() => onTab(item.id)}
          >
            {item.label}
          </button>
        ))}
      </div>
      <div role="tabpanel" className={styles.content}>
        {current === 'basic' && (
          <>
            {visual && <TransformSection clip={clip} canvas={{ width: project.width, height: project.height }} />}
            {clip.tts !== undefined && <SpeechSection clip={clip} />}
            {hasSound && <AudioSection clip={clip} asset={asset} />}
            {clip.transitionOut !== undefined && <TransitionSection clip={clip} />}
          </>
        )}
        {current === 'filters' && <FiltersSection clip={clip} />}
        {current === 'effects' && <EffectsSection clip={clip} />}
        {current === 'speed' && <SpeedSection clip={clip} />}
        {current === 'tools' && <ClipToolsSection clip={clip} />}
      </div>
    </>
  );
}

/** Painel de Propriedades: com um clipe selecionado mostra as seções adequadas ao tipo dele. */
export function InspectorPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const [tab, setTab] = useState<TextTab>('text');
  const [mediaTab, setMediaTab] = useState<MediaTab>('basic');

  const [onlyId] = selectedIds;
  const found =
    project !== null && selectedIds.length === 1 && onlyId !== undefined ? findClip(project.tracks, onlyId) : null;

  let body: ReactNode = <Empty text={t.inspector.empty} />;
  if (project !== null && selectedIds.length > 1) {
    body = <Empty text={t.inspector.multiple} />;
  } else if (project !== null && found !== null) {
    const { clip, track } = found;
    const asset = project.assets.find((item) => item.id === clip.assetId);
    const audioOnly = track.kind === 'audio' || asset?.kind === 'audio';
    const hasSound = audioOnly || asset?.kind === 'video';
    body =
      clip.text !== undefined ? (
        <TextClipBody project={project} clip={clip} text={clip.text} tab={tab} onTab={setTab} />
      ) : (
        <MediaClipBody
          project={project}
          clip={clip}
          visual={!audioOnly}
          hasSound={hasSound}
          asset={asset}
          tab={mediaTab}
          onTab={setMediaTab}
        />
      );
  }

  // A chave por clipe faz as seções reiniciarem o estado local (ex.: cadeado de escala) ao trocar de clipe.
  return (
    <PanelShell title={t.panels.inspector}>
      <div key={found?.clip.id ?? 'none'} className={styles.clip}>
        {body}
      </div>
    </PanelShell>
  );
}
