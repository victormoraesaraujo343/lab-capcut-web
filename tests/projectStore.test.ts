import 'fake-indexeddb/auto';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importOneFile } from '@/engine/import/importMedia';
import { MediaImportError } from '@/engine/decode/errors';
import { resetDbForTests } from '@/engine/storage/db';
import { deleteEntry, revokeObjectUrl } from '@/engine/storage/opfs';
import { defaultAudioFx, defaultSpeed, defaultTransform, type Asset, type Clip } from '@/types';
import { useProjectStore } from '@/stores/projectStore';
import { cancelPendingSave, flushSave } from '@/stores/projectPersistence';
import { useTimelineStore } from '@/stores/timelineStore';

vi.mock('@/engine/storage/opfs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/storage/opfs')>()),
  deleteEntry: vi.fn(async () => undefined),
  copyDir: vi.fn(async () => undefined),
  writeFile: vi.fn(async () => undefined),
  revokeObjectUrl: vi.fn(),
}));

vi.mock('@/engine/import/importMedia', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/import/importMedia')>()),
  importOneFile: vi.fn(),
}));

/** Apaga o banco 'capcut-web' e espera a remoção terminar. */
function deleteDatabase(): Promise<void> {
  return new Promise((resolve, reject) => {
    const request = indexedDB.deleteDatabase('capcut-web');
    request.onsuccess = () => resolve();
    request.onerror = () => reject(request.error);
    request.onblocked = () => reject(new Error('Remoção do banco bloqueada'));
  });
}

/** Cria um asset de vídeo com caminhos do projeto informado. */
function makeAsset(projectId: string, id: string, name = `${id}.mp4`): Asset {
  return {
    id,
    kind: 'video',
    name,
    mimeType: 'video/mp4',
    opfsPath: `projects/${projectId}/media/${id}.mp4`,
    sizeBytes: 10,
    durationMs: 1000,
    thumbnails: [`projects/${projectId}/thumbs/${id}/0.jpg`],
    createdAt: 1,
  };
}

/** Cria um clipe de vídeo que usa o asset informado. */
function makeClip(id: string, trackId: string, assetId: string, startMs: number): Clip {
  return {
    id,
    assetId,
    trackId,
    startMs,
    durationMs: 1000,
    trimInMs: 0,
    trimOutMs: 0,
    transform: defaultTransform(),
    speed: defaultSpeed(),
    volume: 1,
    keyframes: {},
    filters: [],
    effects: [],
    audio: defaultAudioFx(),
    reversed: false,
  };
}

/** Devolve o projeto aberto, ou falha o teste se nenhum estiver aberto. */
function openedProject() {
  const project = useProjectStore.getState().project;
  if (project === null) throw new Error('nenhum projeto aberto');
  return project;
}

describe('projectStore', () => {
  beforeEach(async () => {
    vi.clearAllMocks();
    cancelPendingSave();
    resetDbForTests();
    await deleteDatabase();
    useProjectStore.setState(useProjectStore.getInitialState());
    useTimelineStore.setState(useTimelineStore.getInitialState());
  });

  it('createNewProject cria, abre e lista o projeto', async () => {
    await useProjectStore.getState().createNewProject('Meu vídeo');
    const state = useProjectStore.getState();
    expect(state.project?.name).toBe('Meu vídeo');
    expect(state.projects).toHaveLength(1);
    expect(state.projects[0]?.name).toBe('Meu vídeo');
  });

  it('importFiles adiciona o que deu certo e junta o erro do outro arquivo', async () => {
    await useProjectStore.getState().createNewProject('Importação');
    const projectId = openedProject().id;
    const okAsset = makeAsset(projectId, 'a1', 'ok.mp4');
    vi.mocked(importOneFile)
      .mockResolvedValueOnce(okAsset)
      .mockRejectedValueOnce(new MediaImportError('decode'));

    await useProjectStore.getState().importFiles([
      new File(['1'], 'ok.mp4', { type: 'video/mp4' }),
      new File(['2'], 'ruim.mp4', { type: 'video/mp4' }),
    ]);

    const state = useProjectStore.getState();
    expect(openedProject().assets).toEqual([okAsset]);
    expect(state.importErrors).toHaveLength(1);
    expect(state.importErrors[0]).toMatchObject({ fileName: 'ruim.mp4', code: 'decode' });
    expect(state.importProgress).toBeNull();

    const dismissId = state.importErrors[0]?.id ?? '';
    useProjectStore.getState().dismissImportError(dismissId);
    expect(useProjectStore.getState().importErrors).toHaveLength(0);
  });

  it('importFiles com folderId põe cada asset já nessa pasta', async () => {
    await useProjectStore.getState().createNewProject('Pasta na importação');
    const projectId = openedProject().id;
    const folderId = useProjectStore.getState().createFolder('Trilhas');
    vi.mocked(importOneFile)
      .mockResolvedValueOnce(makeAsset(projectId, 'a1', 'um.mp4'))
      .mockResolvedValueOnce(makeAsset(projectId, 'a2', 'dois.mp4'));

    await useProjectStore.getState().importFiles(
      [new File(['1'], 'um.mp4', { type: 'video/mp4' }), new File(['2'], 'dois.mp4', { type: 'video/mp4' })],
      folderId,
    );

    expect(openedProject().assets.map((a) => a.folderId)).toEqual([folderId, folderId]);
  });

  it('removeAsset libera as URLs do arquivo e das miniaturas', async () => {
    await useProjectStore.getState().createNewProject('Liberar URLs');
    const project = openedProject();
    const asset = makeAsset(project.id, 'a1');
    useProjectStore.setState({ project: { ...project, assets: [asset] } });

    await useProjectStore.getState().removeAsset('a1');

    expect(revokeObjectUrl).toHaveBeenCalledWith(asset.opfsPath);
    for (const thumbnail of asset.thumbnails) {
      expect(revokeObjectUrl).toHaveBeenCalledWith(thumbnail);
    }
  });

  it('gerencia pastas e move assets entre elas', async () => {
    await useProjectStore.getState().createNewProject('Pastas');
    const projectId = openedProject().id;
    useProjectStore.setState({
      project: { ...openedProject(), assets: [makeAsset(projectId, 'a1')] },
    });

    const folderId = useProjectStore.getState().createFolder('Trilhas');
    expect(openedProject().folders).toEqual([{ id: folderId, name: 'Trilhas' }]);

    useProjectStore.getState().moveAssetToFolder('a1', folderId);
    expect(openedProject().assets[0]?.folderId).toBe(folderId);

    useProjectStore.getState().renameFolder(folderId, 'Sons');
    expect(openedProject().folders[0]?.name).toBe('Sons');

    useProjectStore.getState().deleteFolder(folderId);
    expect(openedProject().folders).toHaveLength(0);
    expect(openedProject().assets[0]?.folderId).toBeUndefined();
  });

  it('removeAsset tira o asset, seus clipes e apaga os arquivos dele', async () => {
    await useProjectStore.getState().createNewProject('Remoção');
    const project = openedProject();
    const trackId = project.tracks[0]?.id ?? '';
    const tracks = project.tracks.map((track) =>
      track.id === trackId
        ? { ...track, clips: [makeClip('c1', trackId, 'a1', 0), makeClip('c2', trackId, 'a2', 1000)] }
        : track,
    );
    useProjectStore.setState({
      project: { ...project, tracks, assets: [makeAsset(project.id, 'a1'), makeAsset(project.id, 'a2')] },
    });

    await useProjectStore.getState().removeAsset('a1');

    const after = openedProject();
    expect(after.assets.map((a) => a.id)).toEqual(['a2']);
    expect(after.tracks[0]?.clips.map((c) => c.id)).toEqual(['c2']);
    expect(deleteEntry).toHaveBeenCalledWith(`projects/${project.id}/media/a1.mp4`);
    expect(deleteEntry).toHaveBeenCalledWith(`projects/${project.id}/thumbs/a1`);
  });

  it('removeAsset zera o histórico e a seleção: desfazer não traz clipe com asset removido', async () => {
    await useProjectStore.getState().createNewProject('Órfãos');
    const project = openedProject();
    const trackId = project.tracks[0]?.id ?? '';
    useProjectStore.setState({ project: { ...project, assets: [makeAsset(project.id, 'a1')] } });
    useTimelineStore.getState().edit(
      'add',
      (tracks) => tracks.map((t) => (t.id === trackId ? { ...t, clips: [makeClip('c1', trackId, 'a1', 0)] } : t)),
      ['c1'],
    );
    useTimelineStore.getState().edit('mute', (tracks) => tracks.map((t) => ({ ...t, muted: true })));

    useTimelineStore.getState().setClipboard({
      items: [{ clip: makeClip('c1', trackId, 'a1', 0), trackId, trackKind: 'video', offsetMs: 0 }],
    });

    await useProjectStore.getState().removeAsset('a1');
    expect(useTimelineStore.getState().history.past).toHaveLength(0);
    expect(useTimelineStore.getState().selectedClipIds).toEqual([]);
    expect(useTimelineStore.getState().clipboard).toBeNull();

    useTimelineStore.getState().undo();
    const clips = openedProject().tracks.flatMap((t) => t.clips);
    expect(clips.some((c) => c.assetId === 'a1')).toBe(false);
  });

  it('salva ao fechar e traz os assets de volta ao reabrir', async () => {
    await useProjectStore.getState().createNewProject('Salvo');
    const projectId = openedProject().id;
    const asset = makeAsset(projectId, 'a1');
    vi.mocked(importOneFile).mockResolvedValueOnce(asset);

    await useProjectStore.getState().importFiles([new File(['1'], 'a.mp4', { type: 'video/mp4' })]);
    await useProjectStore.getState().closeProject();
    expect(useProjectStore.getState().project).toBeNull();

    await useProjectStore.getState().openProject(projectId);
    expect(openedProject().assets).toEqual([asset]);
  });

  it('renameProjectById atualiza o aberto e a lista; duplicateProjectById cria cópia com sufixo', async () => {
    await useProjectStore.getState().createNewProject('Original');
    const id = openedProject().id;
    await useProjectStore.getState().renameProjectById(id, 'Novo nome');
    expect(openedProject().name).toBe('Novo nome');
    await flushSave();

    await useProjectStore.getState().duplicateProjectById(id);
    const names = useProjectStore.getState().projects.map((p) => p.name).sort();
    expect(names).toEqual(['Novo nome', 'Novo nome (cópia)']);
  });

  it('deleteProjectById de um projeto aberto fecha o editor e remove da lista', async () => {
    await useProjectStore.getState().createNewProject('Apagar');
    const id = openedProject().id;
    await useProjectStore.getState().deleteProjectById(id);
    expect(useProjectStore.getState().project).toBeNull();
    expect(useProjectStore.getState().projects).toHaveLength(0);
  });
});
