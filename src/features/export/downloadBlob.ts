// Salva um arquivo no computador da pessoa disparando um download pelo navegador.

/** Tempo, em ms, que a URL de objeto fica válida antes de ser revogada. */
const REVOKE_DELAY_MS = 60_000;

/** Dispara o download do blob com o nome dado; a URL temporária é revogada depois de um minuto. */
export function downloadBlob(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.rel = 'noopener';
  document.body.appendChild(link);
  link.click();
  link.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), REVOKE_DELAY_MS);
}
