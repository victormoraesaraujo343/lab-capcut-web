import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createProject } from '@/engine/project/createProject';
import { readMediaMetadata } from '@/engine/decode/metadata';
import { findMissingAssets } from '@/engine/storage/missingMedia';
import { fileExists, revokeObjectUrl, writeFile } from '@/engine/storage/opfs';
import { t } from '@/i18n/pt-BR';
import { useProjectStore } from '@/stores/projectStore';
import { checkMissingMedia, relinkAsset, useMissingMediaStore } from '@/stores/relinkCommands';
import { useToastStore } from '@/stores/toastStore';
import type { Asset, Project } from '@/types';

vi.mock('@/engine/storage/opfs', () => ({
  fileExists: vi.fn(async (path: string) => !path.includes('gone')),
  writeFile: vi.fn(async () => undefined),
  revokeObjectUrl: vi.fn(),
}));

vi.mock('@/engine/decode/metadata', () => ({
  readMediaMetadata: vi.fn(async () => ({ durationMs: 5000 })),
}));

/** Cria um asset de vídeo de teste com o caminho dado. */
function videoAsset(id: string, opfsPath: string, overrides: Partial<Asset> = {}): Asset {
  return {
    id,
    kind: 'video',
    name: `${id}.mp4`,
    mimeType: 'video/mp4',
    opfsPath,
    sizeBytes: 1024,
    durationMs: 5000,
    thumbnails: [],
    createdAt: 1,
    ...overrides,
  };
}

/** Projeto de teste com os assets dados. */
function projectWith(assets: Asset[]): Project {
  return { ...createProject('Teste'), id: 'p1', assets };
}

describe('missingMedia', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useProjectStore.setState({ project: null });
    useMissingMediaStore.setState({ missingIds: [] });
    useToastStore.setState({ toasts: [] });
  });

  it('findMissingAssets devolve só as mídias do usuário cujo arquivo sumiu', async () => {
    const project = projectWith([
      videoAsset('ok', 'projects/p1/media/ok.mp4'),
      videoAsset('gone', 'projects/p1/media/gone.mp4'),
      videoAsset('sticker', 'projects/p1/media/gone-sticker.svg', { kind: 'sticker' }),
      videoAsset('matte', 'projects/p1/media/gone-matte.png', { role: 'matte' }),
      videoAsset('semArquivo', ''),
    ]);

    expect(await findMissingAssets(project)).toEqual(['gone']);
  });

  it('relinkAsset grava o arquivo no mesmo caminho, limpa a URL em cache e tira da lista', async () => {
    const asset = videoAsset('gone', 'projects/p1/media/gone.mp4');
    useProjectStore.setState({ project: projectWith([asset]) });
    useMissingMediaStore.setState({ missingIds: ['gone'] });
    const file = new File(['bytes'], 'novo.mp4', { type: 'video/mp4' });

    await relinkAsset('gone', file);

    expect(writeFile).toHaveBeenCalledWith('projects/p1/media/gone.mp4', file);
    expect(revokeObjectUrl).toHaveBeenCalledWith('projects/p1/media/gone.mp4');
    expect(useMissingMediaStore.getState().missingIds).toEqual([]);
    expect(useToastStore.getState().toasts).toEqual([]);
  });

  it('relinkAsset avisa, mas mantém, quando a duração muda mais de 1 s', async () => {
    const asset = videoAsset('gone', 'projects/p1/media/gone.mp4', { durationMs: 5000 });
    useProjectStore.setState({ project: projectWith([asset]) });
    useMissingMediaStore.setState({ missingIds: ['gone'] });
    vi.mocked(readMediaMetadata).mockResolvedValueOnce({ durationMs: 9000 });

    await relinkAsset('gone', new File(['x'], 'novo.mp4'));

    expect(writeFile).toHaveBeenCalledTimes(1);
    const messages = useToastStore.getState().toasts.map((toast) => toast.message);
    expect(messages).toContain(t.missingMedia.durationWarning);
  });

  it('checkMissingMedia guarda os ids ausentes do projeto aberto', async () => {
    const project = projectWith([videoAsset('gone', 'projects/p1/media/gone.mp4')]);
    useProjectStore.setState({ project });

    await checkMissingMedia(project);

    expect(fileExists).toHaveBeenCalledWith('projects/p1/media/gone.mp4');
    expect(useMissingMediaStore.getState().missingIds).toEqual(['gone']);
  });
});
