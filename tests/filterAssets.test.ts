import { describe, expect, it } from 'vitest';
import { filterAssets } from '@/features/media/filterAssets';
import type { Asset } from '@/types/project';

function makeAsset(id: string, name: string, createdAt: number, folderId?: string): Asset {
  return {
    id,
    kind: 'video',
    name,
    mimeType: 'video/mp4',
    opfsPath: `media/${id}.mp4`,
    sizeBytes: 1024,
    thumbnails: [],
    folderId,
    createdAt,
  };
}

const assets: Asset[] = [
  makeAsset('a1', 'Praia de Verão.mp4', 100, 'f1'),
  makeAsset('a2', 'entrevista.mov', 300),
  makeAsset('a3', 'Música final.mp3', 200, 'f1'),
  makeAsset('a4', 'Logo.png', 50, 'f2'),
];

describe('filterAssets', () => {
  it('retorna todos os assets em ordem de criação decrescente quando não há filtro', () => {
    const ids = filterAssets(assets, '', null).map((asset) => asset.id);
    expect(ids).toEqual(['a2', 'a3', 'a1', 'a4']);
  });

  it('busca sem diferenciar maiúsculas', () => {
    const ids = filterAssets(assets, 'PRAIA', null).map((asset) => asset.id);
    expect(ids).toEqual(['a1']);
  });

  it('busca sem diferenciar acentos nos dois sentidos', () => {
    expect(filterAssets(assets, 'musica', null).map((asset) => asset.id)).toEqual(['a3']);
    expect(filterAssets(assets, 'verão', null).map((asset) => asset.id)).toEqual(['a1']);
    expect(filterAssets(assets, 'verao', null).map((asset) => asset.id)).toEqual(['a1']);
  });

  it('ignora espaços em volta da busca', () => {
    expect(filterAssets(assets, '  logo  ', null).map((asset) => asset.id)).toEqual(['a4']);
  });

  it('restringe aos assets da pasta selecionada', () => {
    expect(filterAssets(assets, '', 'f1').map((asset) => asset.id)).toEqual(['a3', 'a1']);
  });

  it('combina pasta e busca', () => {
    expect(filterAssets(assets, 'final', 'f1').map((asset) => asset.id)).toEqual(['a3']);
    expect(filterAssets(assets, 'final', 'f2')).toEqual([]);
  });

  it('não altera o array original', () => {
    const before = assets.map((asset) => asset.id);
    filterAssets(assets, '', null);
    expect(assets.map((asset) => asset.id)).toEqual(before);
  });

  it('esconde assets gerados (com role), mesmo sem filtro e na pasta deles', () => {
    const withRoles: Asset[] = [
      ...assets,
      { ...makeAsset('m1', 'Praia recorte.png', 500, 'f1'), role: 'matte' },
      { ...makeAsset('r1', 'Entrevista invertida.mov', 400), role: 'reversed' },
      { ...makeAsset('p1', 'Entrevista proxy.mov', 350), role: 'proxy' },
    ];
    expect(filterAssets(withRoles, '', null).map((asset) => asset.id)).toEqual(['a2', 'a3', 'a1', 'a4']);
    expect(filterAssets(withRoles, 'praia', 'f1').map((asset) => asset.id)).toEqual(['a1']);
    expect(filterAssets(withRoles, 'entrevista', null).map((asset) => asset.id)).toEqual(['a2']);
  });
});
