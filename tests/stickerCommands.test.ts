// Testes dos comandos de figurinha: trilha 'sticker', reaproveitamento do asset e importação própria.
import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { rasterizeSvg } from '@/engine/stickers/rasterizeSvg';
import { createProject } from '@/engine/project/createProject';
import { cancelPendingSave } from '@/stores/projectPersistence';
import { addSticker, importCustomSticker } from '@/stores/stickerCommands';
import { useProjectStore } from '@/stores/projectStore';
import { useTimelineStore } from '@/stores/timelineStore';
import type { Asset, Project } from '@/types';

vi.mock('@/engine/stickers/rasterizeSvg', () => ({
  rasterizeSvg: vi.fn(async () => new Blob(['png'], { type: 'image/png' })),
}));

/** Importação falsa: adiciona o arquivo como asset de imagem, sem passar pelo OPFS. */
async function fakeImport(files: File[]): Promise<void> {
  const current = useProjectStore.getState().project;
  const file = files[0];
  if (current === null || file === undefined) return;
  const asset: Asset = {
    id: `m-${current.assets.length}`,
    kind: 'image',
    name: file.name,
    mimeType: file.type,
    opfsPath: 'media/m.png',
    sizeBytes: file.size,
    thumbnails: [],
    createdAt: 0,
  };
  useProjectStore.setState({ project: { ...current, assets: [...current.assets, asset] } });
}

/** Lê o projeto aberto, que o teste garante existir. */
function openNow(): Project {
  const project = useProjectStore.getState().project;
  if (project === null) throw new Error('projeto esperado');
  return project;
}

describe('figurinhas', () => {
  beforeEach(() => {
    cancelPendingSave();
    vi.mocked(rasterizeSvg).mockClear();
    useTimelineStore.setState(useTimelineStore.getInitialState());
    useProjectStore.setState({ importFiles: fakeImport, project: createProject('Figurinhas') });
  });

  it('põe a figurinha numa trilha sticker com duração e escala padrão', async () => {
    const clipId = await addSticker('heart', 500);
    expect(clipId).not.toBeNull();
    const track = openNow().tracks.find((t) => t.kind === 'sticker');
    expect(track).toBeDefined();
    const clip = track?.clips.find((c) => c.id === clipId);
    expect(clip?.startMs).toBe(500);
    expect(clip?.durationMs).toBe(3000);
    expect(clip?.transform.scaleX).toBe(0.35);
    expect(clip?.transform.scaleY).toBe(0.35);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([clipId]);
  });

  it('marca o asset como sticker com o id da figurinha e reaproveita o asset na segunda vez', async () => {
    await addSticker('heart', 0);
    const second = await addSticker('heart', 5000);
    expect(second).not.toBeNull();
    expect(rasterizeSvg).toHaveBeenCalledTimes(1);
    const stickerAssets = openNow().assets.filter((a) => a.kind === 'sticker');
    expect(stickerAssets).toHaveLength(1);
    expect(stickerAssets[0]?.name).toBe('heart');
    expect(openNow().tracks.filter((t) => t.kind === 'sticker')).toHaveLength(1);
  });

  it('abre outra trilha sticker quando a atual está ocupada no cursor', async () => {
    await addSticker('heart', 0);
    await addSticker('star-filled', 1000);
    expect(openNow().tracks.filter((t) => t.kind === 'sticker')).toHaveLength(2);
  });

  it('devolve null para figurinha desconhecida', async () => {
    expect(await addSticker('nao-existe', 0)).toBeNull();
    expect(rasterizeSvg).not.toHaveBeenCalled();
  });

  it('importa PNG próprio como sticker e rasteriza SVG antes de importar', async () => {
    const png = new File(['x'], 'minha.png', { type: 'image/png' });
    const assetId = await importCustomSticker(png);
    expect(assetId).not.toBeNull();
    expect(openNow().assets.find((a) => a.id === assetId)?.kind).toBe('sticker');

    const svg = new File(['<svg xmlns="http://www.w3.org/2000/svg"/>'], 'logo.svg', { type: 'image/svg+xml' });
    const svgId = await importCustomSticker(svg);
    expect(rasterizeSvg).toHaveBeenCalledTimes(1);
    expect(openNow().assets.find((a) => a.id === svgId)?.name).toBe('logo.svg');
  });

  it('recusa tipo de arquivo que não é imagem', async () => {
    expect(await importCustomSticker(new File(['x'], 'a.txt', { type: 'text/plain' }))).toBeNull();
  });
});
