// Aba Stickers: grade de figurinhas (busca e categorias), formas, sobreposições e figurinhas enviadas; clique adiciona no cursor e a miniatura arrasta para a linha do tempo.

import { useMemo, useRef, useState, type ChangeEvent } from 'react';
import { ArrowRight, Circle, Minus, Plus, Square, type LucideIcon } from 'lucide-react';
import { OVERLAY_TYPES } from '@/engine/render/overlays';
import { ensureEffectsRegistered } from '@/engine/render/registerAll';
import { STICKERS, STICKER_CATEGORIES, findSticker, type StickerCategory, type StickerDef } from '@/engine/stickers/stickerCatalog';
import { useObjectUrl } from '@/features/media/useObjectUrl';
import { t } from '@/i18n/pt-BR';
import { addOverlay } from '@/stores/overlayCommands';
import { useProjectStore } from '@/stores/projectStore';
import { addShape } from '@/stores/shapeCommands';
import { addSticker, importCustomSticker, placeStickerAsset } from '@/stores/stickerCommands';
import { runWithToast, useToastStore } from '@/stores/toastStore';
import type { Asset, ShapeData } from '@/types';
import { ItemGrid, ItemThumb, type GridItem } from './ItemGrid';
import { beginStickerDrag } from './stickerDrag';
import styles from './StickersTab.module.css';

/** Tipos de arquivo aceitos no envio de figurinha própria. */
const UPLOAD_ACCEPT = 'image/png,image/svg+xml,image/gif,image/webp';

/** Filtro de categoria: todas ou uma categoria do catálogo. */
type CategoryFilter = StickerCategory | 'all';

/** Botões de forma da seção Formas, com ícone e rótulo. */
const SHAPE_BUTTONS: readonly { kind: ShapeData['shape']; icon: LucideIcon; label: string }[] = [
  { kind: 'rectangle', icon: Square, label: t.shapes.rectangle },
  { kind: 'circle', icon: Circle, label: t.shapes.circle },
  { kind: 'arrow', icon: ArrowRight, label: t.shapes.arrow },
  { kind: 'line', icon: Minus, label: t.shapes.line },
];

/** Nomes de exibição das figurinhas, por id. */
const STICKER_NAMES: Readonly<Record<string, unknown>> = t.stickers.names;
/** Nomes de exibição das sobreposições, por tipo. */
const OVERLAY_NAMES: Readonly<Record<string, unknown>> = t.overlays.names;

/** Cache das URLs de miniatura, para gerar cada SVG só uma vez. */
const thumbCache = new Map<string, string>();

/** Nome exibido de uma figurinha do catálogo. */
function stickerName(def: StickerDef): string {
  const name = STICKER_NAMES[def.labelKey];
  return typeof name === 'string' ? name : def.id;
}

/** URL data: do SVG da figurinha, memorizada por id. */
function stickerThumbUrl(def: StickerDef): string {
  const cached = thumbCache.get(def.id);
  if (cached !== undefined) return cached;
  const url = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(def.svg())}`;
  thumbCache.set(def.id, url);
  return url;
}

/** Nome exibido de uma sobreposição pelo tipo. */
function overlayName(type: string): string {
  const name = OVERLAY_NAMES[type];
  return typeof name === 'string' ? name : type;
}

/** Botões de filtro por categoria, com 'Todos' primeiro; o ativo fica marcado com aria-pressed. */
function CategoryChips({ value, onChange }: { value: CategoryFilter; onChange: (next: CategoryFilter) => void }) {
  const options: readonly { id: CategoryFilter; label: string }[] = [
    { id: 'all', label: t.stickers.all },
    ...STICKER_CATEGORIES,
  ];
  return (
    <div className={styles.chips} role="group" aria-label={t.stickers.categoriesLabel}>
      {options.map((option) => (
        <button
          key={option.id}
          type="button"
          className={option.id === value ? `${styles.chip} ${styles.chipActive}` : styles.chip}
          aria-pressed={option.id === value}
          onClick={() => onChange(option.id)}
        >
          {option.label}
        </button>
      ))}
    </div>
  );
}

/** Cartão de uma figurinha enviada pelo usuário: clique adiciona no cursor e arrasta para a linha do tempo. */
function CustomStickerCard({ asset }: { asset: Asset }) {
  const thumb = useObjectUrl(asset.thumbnails[0]);
  return (
    <button
      type="button"
      className={styles.customCard}
      title={asset.name}
      aria-label={asset.name}
      draggable
      onClick={() => {
        placeStickerAsset(asset.id);
      }}
      onDragStart={(event) => beginStickerDrag(event.nativeEvent, asset.id)}
    >
      {thumb !== undefined ? <img className={styles.thumbImage} src={thumb} alt="" draggable={false} /> : null}
      <span className={styles.cardName}>{asset.name}</span>
    </button>
  );
}

/** Aba Stickers: busca e categorias de figurinhas, formas, sobreposições e envio de figurinha própria. */
export function StickersTab() {
  const [category, setCategory] = useState<CategoryFilter>('all');
  const assets = useProjectStore((s) => s.project?.assets);
  const inputRef = useRef<HTMLInputElement>(null);
  ensureEffectsRegistered();

  const items = useMemo<GridItem[]>(
    () =>
      STICKERS.filter((def) => category === 'all' || def.category === category).map((def) => ({
        id: def.id,
        name: stickerName(def),
        thumbnail: (
          <ItemThumb background="var(--bg-elevated)">
            <img className={styles.thumbImage} src={stickerThumbUrl(def)} alt={stickerName(def)} draggable={false} />
          </ItemThumb>
        ),
        onActivate: () => {
          void runWithToast(addSticker(def.id), t.stickers.addError);
        },
        onDragStart: (event) => beginStickerDrag(event, def.id),
      })),
    [category],
  );

  const customAssets = useMemo(
    () => (assets ?? []).filter((a) => a.kind === 'sticker' && findSticker(a.name) === undefined),
    [assets],
  );

  /** Envia o arquivo escolhido como figurinha própria; falha de formato mostra aviso. */
  async function handleUpload(event: ChangeEvent<HTMLInputElement>): Promise<void> {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (file === undefined) return;
    const id = await runWithToast(importCustomSticker(file), t.stickers.uploadError);
    if (id === null) useToastStore.getState().pushToast(t.stickers.uploadError);
  }

  return (
    <div className={styles.root}>

      <section className={styles.section} aria-label={t.shapes.title}>
        <h3 className={styles.sectionTitle}>{t.shapes.title}</h3>
        <div className={styles.buttonGrid}>
          {SHAPE_BUTTONS.map(({ kind, icon: Icon, label }) => (
            <button
              key={kind}
              type="button"
              className={styles.actionButton}
              aria-label={label}
              title={label}
              onClick={() => {
                addShape(kind);
              }}
            >
              <Icon size={16} strokeWidth={1.75} aria-hidden="true" />
              <span>{label}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-label={t.overlays.title}>
        <h3 className={styles.sectionTitle}>{t.overlays.title}</h3>
        <div className={styles.buttonGrid}>
          {OVERLAY_TYPES.map((type) => (
            <button
              key={type}
              type="button"
              className={styles.actionButton}
              aria-label={overlayName(type)}
              title={overlayName(type)}
              onClick={() => {
                addOverlay(type);
              }}
            >
              <Plus size={14} strokeWidth={1.75} aria-hidden="true" />
              <span>{overlayName(type)}</span>
            </button>
          ))}
        </div>
      </section>

      <section className={styles.section} aria-label={t.stickers.mine}>
        <h3 className={styles.sectionTitle}>{t.stickers.mine}</h3>
        <button type="button" className={styles.uploadButton} onClick={() => inputRef.current?.click()}>
          <Plus size={16} strokeWidth={1.75} aria-hidden="true" />
          <span>{t.stickers.upload}</span>
        </button>
        <input
          ref={inputRef}
          type="file"
          accept={UPLOAD_ACCEPT}
          aria-label={t.stickers.upload}
          className={styles.hiddenInput}
          tabIndex={-1}
          onChange={(event) => {
            void handleUpload(event);
          }}
        />
        <p className={styles.hint}>{t.stickers.uploadHint}</p>
        {customAssets.length === 0 ? (
          <p className={styles.hint}>{t.stickers.noCustom}</p>
        ) : (
          <div className={styles.customGrid}>
            {customAssets.map((asset) => (
              <CustomStickerCard key={asset.id} asset={asset} />
            ))}
          </div>
        )}
      </section>

      <p className={styles.hint}>{t.stickers.hint}</p>
      <ItemGrid
        items={items}
        label={t.library.tabs.stickers}
        toolbar={<CategoryChips value={category} onChange={setCategory} />}
      />
    </div>
  );
}
