// Erros da importação de mídia, identificados por código.

/** Códigos de erro possíveis na importação de mídia. */
export type MediaErrorCode = 'unsupported' | 'decode' | 'timeout';

/** Erro lançado quando uma mídia não pode ser importada, com o motivo em `code`. */
export class MediaImportError extends Error {
  constructor(public readonly code: MediaErrorCode, message?: string) {
    super(message ?? code);
    this.name = 'MediaImportError';
  }
}
