import { describe, expect, it } from 'vitest';
import { findProxy, needsProxy, proxyFps, proxySize } from '../src/engine/proxy/proxyPolicy';
import type { Asset, Project } from '../src/types';

/** Cria um asset de vídeo de teste com as dimensões e a taxa informadas. */
function video(id: string, width?: number, height?: number, fps?: number, extra: Partial<Asset> = {}): Asset {
  return {
    id,
    kind: 'video',
    name: id,
    mimeType: 'video/mp4',
    opfsPath: `media/${id}`,
    sizeBytes: 10,
    thumbnails: [],
    createdAt: 0,
    width,
    height,
    fps,
    durationMs: 5000,
    ...extra,
  };
}

/** Cria um projeto de teste com os assets dados. */
function projectWith(assets: Asset[]): Project {
  return {
    id: 'p1',
    name: 'Projeto',
    width: 1920,
    height: 1080,
    fps: 30,
    aspectRatio: '16:9',
    durationMs: 0,
    tracks: [],
    assets,
    folders: [],
    markers: [],
    createdAt: 0,
    updatedAt: 0,
  };
}

describe('needsProxy', () => {
  it('pede cópia para vídeo acima de 720p de altura, de largura ou com mais de 30 fps', () => {
    expect(needsProxy(video('a', 1920, 1080, 30))).toBe(true);
    expect(needsProxy(video('b', 1280, 720, 60))).toBe(true);
    expect(needsProxy(video('c', 1440, 720, 30))).toBe(true);
    expect(needsProxy(video('d', 1080, 1920, 24))).toBe(true);
  });

  it('não pede cópia para vídeo até 1280x720 com até 30 fps', () => {
    expect(needsProxy(video('a', 1280, 720, 30))).toBe(false);
    expect(needsProxy(video('b', 640, 480, 24))).toBe(false);
  });

  it('não pede cópia para imagem, áudio, asset gerado ou vídeo sem dimensões', () => {
    expect(needsProxy({ ...video('i', 1920, 1080, 30), kind: 'image' })).toBe(false);
    expect(needsProxy({ ...video('s', 1920, 1080, 30), kind: 'audio' })).toBe(false);
    expect(needsProxy(video('r', 1920, 1080, 30, { role: 'reversed' }))).toBe(false);
    expect(needsProxy(video('p', 1920, 1080, 30, { role: 'proxy' }))).toBe(false);
    expect(needsProxy(video('n'))).toBe(false);
  });
});

describe('proxySize', () => {
  it('paisagem: altura 540 mantendo a proporção, com largura par', () => {
    expect(proxySize(1920, 1080)).toEqual({ width: 960, height: 540 });
    expect(proxySize(1921, 1081)).toEqual({ width: 960, height: 540 });
  });

  it('retrato: largura 540 mantendo a proporção', () => {
    expect(proxySize(1080, 1920)).toEqual({ width: 540, height: 960 });
    expect(proxySize(1080, 1350)).toEqual({ width: 540, height: 676 });
  });

  it('quadrado vira 540x540 e valores inválidos caem no padrão', () => {
    expect(proxySize(1080, 1080)).toEqual({ width: 540, height: 540 });
    expect(proxySize(0, 0)).toEqual({ width: 540, height: 540 });
  });
});

describe('proxyFps', () => {
  it('limita a 30 fps e mantém taxas menores', () => {
    expect(proxyFps(60)).toBe(30);
    expect(proxyFps(24)).toBe(24);
    expect(proxyFps(undefined)).toBe(30);
  });
});

describe('findProxy', () => {
  it('acha a cópia com role proxy e sourceAssetId igual ao asset', () => {
    const proxy = video('origem-proxy', 960, 540, 30, { role: 'proxy', sourceAssetId: 'origem' });
    const project = projectWith([video('origem', 1920, 1080, 30), proxy]);
    expect(findProxy(project, 'origem')).toBe(proxy);
  });

  it('devolve undefined quando não há cópia', () => {
    expect(findProxy(projectWith([video('origem', 1920, 1080, 30)]), 'origem')).toBeUndefined();
  });
});
