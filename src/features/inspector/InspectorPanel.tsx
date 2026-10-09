// Painel de Propriedades: mostra as seções do clipe selecionado (texto, transformação ou áudio).
import { useState, type ReactNode } from 'react';
import { SlidersHorizontal } from 'lucide-react';
import { PanelShell } from '@/features/layout/PanelShell';
import { t } from '@/i18n/pt-BR';
import { findClip } from '@/engine/timeline/clipOps';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Clip, Project, TextData } from '@/types';
import { AudioSection } from './AudioSection';
import { TextAnimationSection } from './TextAnimationSection';
import { TextContentSection } from './TextContentSection';
import { TextPresetGrid } from './TextPresetGrid';
import { TextStyleSection } from './TextStyleSection';
import { TransformSection } from './TransformSection';
import styles from './InspectorPanel.module.css';

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

/** Painel de Propriedades: com um clipe selecionado mostra as seções adequadas ao tipo dele. */
export function InspectorPanel() {
  const project = useProjectStore((s) => s.project);
  const selectedIds = useTimelineStore((s) => s.selectedClipIds);
  const [tab, setTab] = useState<TextTab>('text');

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
    const canvas = { width: project.width, height: project.height };
    body =
      clip.text !== undefined ? (
        <TextClipBody project={project} clip={clip} text={clip.text} tab={tab} onTab={setTab} />
      ) : (
        <div className={styles.content}>
          {!audioOnly && <TransformSection clip={clip} canvas={canvas} />}
          {hasSound && <AudioSection clip={clip} />}
        </div>
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
