// Detecção do tipo de mídia (vídeo, áudio ou imagem) a partir do MIME e da extensão do arquivo.

/** Tipo de mídia que pode ser importado. */
export type ImportableKind = 'video' | 'audio' | 'image';

const GENERIC_MIME = 'application/octet-stream';

const MIME_KINDS: ReadonlyMap<string, ImportableKind> = new Map<string, ImportableKind>([
  ['video/mp4', 'video'],
  ['video/quicktime', 'video'],
  ['video/webm', 'video'],
  ['video/x-m4v', 'video'],
  ['audio/mpeg', 'audio'],
  ['audio/mp3', 'audio'],
  ['audio/wav', 'audio'],
  ['audio/x-wav', 'audio'],
  ['audio/wave', 'audio'],
  ['audio/aac', 'audio'],
  ['audio/mp4', 'audio'],
  ['audio/x-m4a', 'audio'],
  ['audio/ogg', 'audio'],
  ['audio/opus', 'audio'],
  ['audio/webm', 'audio'],
  ['image/jpeg', 'image'],
  ['image/jpg', 'image'],
  ['image/png', 'image'],
  ['image/gif', 'image'],
  ['image/webp', 'image'],
]);

const EXTENSION_KINDS: ReadonlyMap<string, ImportableKind> = new Map<string, ImportableKind>([
  ['.mp4', 'video'],
  ['.mov', 'video'],
  ['.webm', 'video'],
  ['.m4v', 'video'],
  ['.mp3', 'audio'],
  ['.wav', 'audio'],
  ['.aac', 'audio'],
  ['.m4a', 'audio'],
  ['.ogg', 'audio'],
  ['.opus', 'audio'],
  ['.jpg', 'image'],
  ['.jpeg', 'image'],
  ['.png', 'image'],
  ['.gif', 'image'],
  ['.webp', 'image'],
]);

/** Extensões de arquivo aceitas na importação, em minúsculas com ponto. */
export const ACCEPTED_EXTENSIONS: readonly string[] = Array.from(EXTENSION_KINDS.keys());

/** Valor para o atributo `accept` de um `<input type="file">`, com MIMEs e extensões aceitos. */
export const ACCEPT_ATTRIBUTE: string = [...MIME_KINDS.keys(), ...ACCEPTED_EXTENSIONS].join(',');

/** Remove parâmetros e espaços do MIME e o converte para minúsculas. */
function normalizeMime(mime: string): string {
  const base = mime.split(';')[0] ?? '';
  return base.trim().toLowerCase();
}

/** Retorna o tipo de mídia pela extensão do nome do arquivo, ou null se não for aceita. */
function kindFromExtension(name: string): ImportableKind | null {
  const dot = name.lastIndexOf('.');
  if (dot < 0) return null;
  return EXTENSION_KINDS.get(name.slice(dot).toLowerCase()) ?? null;
}

/** Detecta se o arquivo é vídeo, áudio ou imagem; usa o MIME e cai na extensão quando ele estiver vazio ou genérico. */
export function detectAssetKind(file: { name: string; type: string }): ImportableKind | null {
  const mime = normalizeMime(file.type);
  if (mime !== '' && mime !== GENERIC_MIME) {
    return MIME_KINDS.get(mime) ?? null;
  }
  return kindFromExtension(file.name);
}
