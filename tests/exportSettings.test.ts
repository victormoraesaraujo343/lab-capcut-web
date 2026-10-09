import { describe, expect, it } from 'vitest';
import {
  DEFAULT_EXPORT_SETTINGS,
  GIF_MAX_MS,
  avcCodec,
  estimateSizeBytes,
  outputSize,
  resolveExport,
  sanitizeFileName,
  videoBitrate,
  vp9Codec,
} from '../src/engine/export/exportSettings';
import type { ExportSettings } from '../src/types/export';
import type { Project } from '../src/types/project';

function makeProject(over: Partial<Pick<Project, 'name' | 'width' | 'height' | 'durationMs'>> = {}): Project {
  return {
    id: 'p1',
    name: over.name ?? 'Projeto',
    width: over.width ?? 1920,
    height: over.height ?? 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: over.durationMs ?? 20000,
    tracks: [],
    assets: [],
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

function makeSettings(over: Partial<ExportSettings> = {}): ExportSettings {
  return { ...DEFAULT_EXPORT_SETTINGS, ...over };
}

describe('DEFAULT_EXPORT_SETTINGS', () => {
  it('usa MP4 em 1080p, 30 fps, qualidade recomendada e 12 Mbps personalizados', () => {
    expect(DEFAULT_EXPORT_SETTINGS).toEqual({
      format: 'mp4',
      resolution: '1080p',
      fps: 30,
      bitrate: 'medium',
      customBitrateMbps: 12,
      fileName: '',
    });
  });
});

describe('outputSize', () => {
  it('paisagem 1920x1080 em 720p vira 1280x720', () => {
    expect(outputSize(1920, 1080, '720p')).toEqual({ width: 1280, height: 720 });
  });

  it('retrato 1080x1920 em 4k vira 2160x3840', () => {
    expect(outputSize(1080, 1920, '4k')).toEqual({ width: 2160, height: 3840 });
  });

  it('retrato 1080x1350 em 1080p vira 1080x1350', () => {
    expect(outputSize(1080, 1350, '1080p')).toEqual({ width: 1080, height: 1350 });
  });

  it('quadrado usa o lado escolhido nos dois eixos', () => {
    expect(outputSize(1000, 1000, '1440p')).toEqual({ width: 1440, height: 1440 });
  });

  it('sempre devolve dimensões pares', () => {
    const projects: Array<[number, number]> = [
      [1234, 777],
      [1080, 1351],
      [641, 479],
      [1919, 1081],
    ];
    const presets = ['720p', '1080p', '1440p', '4k'] as const;
    for (const [w, h] of projects) {
      for (const preset of presets) {
        const size = outputSize(w, h, preset);
        expect(size.width % 2).toBe(0);
        expect(size.height % 2).toBe(0);
      }
    }
  });
});

describe('videoBitrate', () => {
  it('1080p30 na qualidade recomendada fica perto de 5.6 Mbps', () => {
    expect(videoBitrate(1920, 1080, 30, 'medium', 12)).toBeCloseTo(5_600_000, -4);
  });

  it('usa o valor personalizado em Mbps', () => {
    expect(videoBitrate(1920, 1080, 30, 'custom', 12)).toBe(12_000_000);
  });

  it('limita a taxa personalizada entre 1 e 200 Mbps', () => {
    expect(videoBitrate(1920, 1080, 30, 'custom', 500)).toBe(200_000_000);
    expect(videoBitrate(1920, 1080, 30, 'custom', 0)).toBe(1_000_000);
  });
});

describe('avcCodec', () => {
  it('escolhe o nível pela resolução e pelo fps', () => {
    expect(avcCodec(1280, 720, 30)).toBe('avc1.64001F');
    expect(avcCodec(1920, 1080, 30)).toBe('avc1.640028');
    expect(avcCodec(1920, 1080, 60)).toBe('avc1.64002A');
    expect(avcCodec(2560, 1440, 30)).toBe('avc1.640032');
    expect(avcCodec(2560, 1440, 60)).toBe('avc1.640033');
    expect(avcCodec(3840, 2160, 30)).toBe('avc1.640033');
    expect(avcCodec(3840, 2160, 60)).toBe('avc1.640034');
  });
});

describe('vp9Codec', () => {
  it('escolhe o nível pelo tamanho e pelo fps', () => {
    expect(vp9Codec(1280, 720, 30)).toBe('vp09.00.31.08');
    expect(vp9Codec(1920, 1080, 30)).toBe('vp09.00.40.08');
    expect(vp9Codec(3840, 2160, 30)).toBe('vp09.00.50.08');
    expect(vp9Codec(3840, 2160, 60)).toBe('vp09.00.51.08');
  });
});

describe('resolveExport', () => {
  it('MP4 usa H.264 e AAC 192 kbps, com quadro-chave a cada 2 s', () => {
    const r = resolveExport(makeProject({ name: 'Meu Projeto' }), makeSettings({ format: 'mp4' }));
    expect(r.format).toBe('mp4');
    expect(r.width).toBe(1920);
    expect(r.height).toBe(1080);
    expect(r.videoCodec).toBe('avc1.640028');
    expect(r.audioCodec).toBe('mp4a.40.2');
    expect(r.audioBitrate).toBe(192_000);
    expect(r.mimeType).toBe('video/mp4');
    expect(r.fileName).toBe('Meu Projeto.mp4');
    expect(r.keyFrameInterval).toBe(60);
    expect(r.startMs).toBe(0);
    expect(r.endMs).toBe(20000);
  });

  it('WebM usa VP9 e Opus 160 kbps', () => {
    const r = resolveExport(makeProject(), makeSettings({ format: 'webm' }));
    expect(r.videoCodec).toBe('vp09.00.40.08');
    expect(r.audioCodec).toBe('opus');
    expect(r.audioBitrate).toBe(160_000);
    expect(r.mimeType).toBe('video/webm');
    expect(r.fileName.endsWith('.webm')).toBe(true);
  });

  it('GIF limita largura a 480, fps a 15, duração a 15 s e não tem áudio', () => {
    const r = resolveExport(makeProject({ durationMs: 60000 }), makeSettings({ format: 'gif', fps: 30 }));
    expect(r.width).toBe(480);
    expect(r.height).toBe(270);
    expect(r.fps).toBe(15);
    expect(r.startMs).toBe(0);
    expect(r.endMs).toBe(GIF_MAX_MS);
    expect(r.endMs).toBe(15000);
    expect(r.audioCodec).toBe('');
    expect(r.audioBitrate).toBe(0);
    expect(r.mimeType).toBe('image/gif');
    expect(r.fileName.endsWith('.gif')).toBe(true);
  });

  it('GIF de projeto curto mantém a duração original', () => {
    const r = resolveExport(makeProject({ durationMs: 4000 }), makeSettings({ format: 'gif' }));
    expect(r.endMs).toBe(4000);
  });

  it('WAV é só áudio, sem vídeo', () => {
    const r = resolveExport(makeProject({ durationMs: 5000 }), makeSettings({ format: 'wav' }));
    expect(r.mimeType).toBe('audio/wav');
    expect(r.fileName.endsWith('.wav')).toBe(true);
    expect(r.videoCodec).toBe('');
    expect(r.width).toBe(0);
    expect(r.height).toBe(0);
    expect(r.endMs).toBe(5000);
  });

  it('MP3 é só áudio a 192 kbps', () => {
    const r = resolveExport(makeProject(), makeSettings({ format: 'mp3' }));
    expect(r.mimeType).toBe('audio/mpeg');
    expect(r.fileName.endsWith('.mp3')).toBe(true);
    expect(r.audioBitrate).toBe(192_000);
    expect(r.videoCodec).toBe('');
  });
});

describe('nome do arquivo', () => {
  it('remove caracteres inválidos e apara espaços', () => {
    expect(sanitizeFileName('a/b\\c:d*e?f"g<h>i|j  ')).toBe('abcdefghij');
    expect(sanitizeFileName('  Meu: Clipe  ')).toBe('Meu Clipe');
  });

  it('usa o nome do projeto quando o nome escolhido está vazio', () => {
    const r = resolveExport(makeProject({ name: 'Meu: Projeto' }), makeSettings({ fileName: '   ' }));
    expect(r.fileName).toBe('Meu Projeto.mp4');
  });

  it('usa "video" quando nem o nome escolhido nem o do projeto servem', () => {
    const r = resolveExport(makeProject({ name: '' }), makeSettings({ fileName: '' }));
    expect(r.fileName).toBe('video.mp4');
  });

  it('usa o nome escolhido sanitizado', () => {
    const r = resolveExport(makeProject(), makeSettings({ fileName: 'Férias: parte 1/2' }));
    expect(r.fileName).toBe('Férias parte 12.mp4');
  });
});

describe('estimateSizeBytes', () => {
  it('é positivo para vídeo, GIF e áudio com duração', () => {
    const project = makeProject({ durationMs: 10000 });
    expect(estimateSizeBytes(resolveExport(project, makeSettings({ format: 'mp4' })))).toBeGreaterThan(0);
    expect(estimateSizeBytes(resolveExport(project, makeSettings({ format: 'gif' })))).toBeGreaterThan(0);
    expect(estimateSizeBytes(resolveExport(project, makeSettings({ format: 'wav' })))).toBeGreaterThan(0);
  });

  it('WAV usa 48 kHz estéreo de 16 bits', () => {
    const r = resolveExport(makeProject({ durationMs: 1000 }), makeSettings({ format: 'wav' }));
    expect(estimateSizeBytes(r)).toBe(48000 * 2 * 2);
  });

  it('é zero para projeto sem duração', () => {
    const r = resolveExport(makeProject({ durationMs: 0 }), makeSettings({ format: 'mp4' }));
    expect(estimateSizeBytes(r)).toBe(0);
  });
});
