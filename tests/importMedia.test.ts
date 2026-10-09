import { beforeEach, describe, expect, it, vi } from 'vitest';
import { importOneFile, toImportErrorCode } from '@/engine/import/importMedia';
import { MediaImportError } from '@/engine/decode/errors';
import { readMediaMetadata } from '@/engine/decode/metadata';
import { generateThumbnails, generateWaveform } from '@/engine/decode/mediaWorkerClient';
import { StorageError, deleteEntry, writeFile } from '@/engine/storage/opfs';

vi.mock('@/engine/storage/opfs', async (importOriginal) => ({
  ...(await importOriginal<typeof import('@/engine/storage/opfs')>()),
  writeFile: vi.fn(async () => undefined),
  deleteEntry: vi.fn(async () => undefined),
}));

vi.mock('@/engine/decode/metadata', () => ({
  readMediaMetadata: vi.fn(),
}));

vi.mock('@/engine/decode/mediaWorkerClient', () => ({
  generateThumbnails: vi.fn(),
  generateWaveform: vi.fn(),
}));

const PROJECT_ID = 'proj-1';

describe('importOneFile', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.mocked(readMediaMetadata).mockResolvedValue({ durationMs: 5000, width: 1920, height: 1080, fps: 30 });
    vi.mocked(generateThumbnails).mockResolvedValue(['thumb-0.jpg', 'thumb-1.jpg']);
    vi.mocked(generateWaveform).mockResolvedValue([0.1, 0.5, 1]);
  });

  it('importa vídeo com miniaturas e forma de onda', async () => {
    const file = new File(['bytes'], 'clip.mp4', { type: 'video/mp4' });
    const asset = await importOneFile(PROJECT_ID, file);

    expect(asset.kind).toBe('video');
    expect(asset.name).toBe('clip.mp4');
    expect(asset.mimeType).toBe('video/mp4');
    expect(asset.sizeBytes).toBe(file.size);
    expect(asset.durationMs).toBe(5000);
    expect(asset.width).toBe(1920);
    expect(asset.height).toBe(1080);
    expect(asset.fps).toBe(30);
    expect(asset.thumbnails).toEqual(['thumb-0.jpg', 'thumb-1.jpg']);
    expect(asset.waveform).toEqual([0.1, 0.5, 1]);
    expect(asset.opfsPath).toMatch(new RegExp(`^projects/${PROJECT_ID}/media/${asset.id}\\.mp4$`));
    expect(writeFile).toHaveBeenCalledWith(asset.opfsPath, file);
    expect(generateThumbnails).toHaveBeenCalledWith(file, 5000, `projects/${PROJECT_ID}/thumbs/${asset.id}`);
  });

  it('usa o próprio arquivo como miniatura de imagem, sem gerar forma de onda', async () => {
    vi.mocked(readMediaMetadata).mockResolvedValue({ width: 800, height: 600 });
    const file = new File(['png'], 'foto.png', { type: 'image/png' });
    const asset = await importOneFile(PROJECT_ID, file);

    expect(asset.kind).toBe('image');
    expect(asset.thumbnails).toEqual([asset.opfsPath]);
    expect(asset.durationMs).toBeUndefined();
    expect(generateThumbnails).not.toHaveBeenCalled();
    expect(generateWaveform).not.toHaveBeenCalled();
  });

  it('rejeita arquivo não suportado com o código unsupported, sem gravar nada', async () => {
    const file = new File(['texto'], 'notas.txt', { type: 'text/plain' });
    await expect(importOneFile(PROJECT_ID, file)).rejects.toMatchObject({ code: 'unsupported' });
    expect(writeFile).not.toHaveBeenCalled();
  });

  it('apaga a mídia gravada quando a leitura de metadados falha', async () => {
    vi.mocked(readMediaMetadata).mockRejectedValue(new MediaImportError('decode'));
    const file = new File(['bytes'], 'ruim.mp4', { type: 'video/mp4' });

    await expect(importOneFile(PROJECT_ID, file)).rejects.toMatchObject({ code: 'decode' });
    const writtenPath = vi.mocked(writeFile).mock.calls[0]?.[0];
    expect(writtenPath).toBeDefined();
    expect(deleteEntry).toHaveBeenCalledWith(writtenPath);
    expect(deleteEntry).toHaveBeenCalledWith(expect.stringMatching(/^projects\/proj-1\/thumbs\//));
  });

  it('conclui a importação de áudio mesmo quando a forma de onda falha', async () => {
    vi.mocked(readMediaMetadata).mockResolvedValue({ durationMs: 3000 });
    vi.mocked(generateWaveform).mockRejectedValue(new Error('sem áudio decodificável'));
    const file = new File(['mp3'], 'musica.mp3', { type: 'audio/mpeg' });
    const asset = await importOneFile(PROJECT_ID, file);

    expect(asset.kind).toBe('audio');
    expect(asset.thumbnails).toEqual([]);
    expect(asset.waveform).toBeUndefined();
  });
});

describe('toImportErrorCode', () => {
  it('mapeia erros de importação e de armazenamento pelo próprio código', () => {
    expect(toImportErrorCode(new MediaImportError('timeout'))).toBe('timeout');
    expect(toImportErrorCode(new MediaImportError('unsupported'))).toBe('unsupported');
    expect(toImportErrorCode(new StorageError('unavailable'))).toBe('unavailable');
    expect(toImportErrorCode(new StorageError('notFound'))).toBe('notFound');
  });

  it('mapeia QuotaExceededError para quota e o resto para generic', () => {
    expect(toImportErrorCode(new DOMException('cheio', 'QuotaExceededError'))).toBe('quota');
    expect(toImportErrorCode(new Error('outro'))).toBe('generic');
    expect(toImportErrorCode('texto solto')).toBe('generic');
  });
});
