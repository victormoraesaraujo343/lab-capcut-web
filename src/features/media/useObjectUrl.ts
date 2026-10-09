// Hook que entrega a URL de objeto de um arquivo do OPFS para uso em miniaturas.

import { useEffect, useState } from 'react';
import { getObjectUrl } from '@/engine/storage/opfs';

interface ResolvedUrl {
  /** Caminho OPFS que originou a URL. */
  path: string;
  /** URL de objeto, ou undefined se o arquivo não pôde ser lido. */
  url: string | undefined;
}

/** Retorna a URL de objeto do caminho OPFS dado, ou undefined enquanto carrega. A URL não é revogada no unmount porque o cache é compartilhado. */
export function useObjectUrl(path: string | undefined): string | undefined {
  const [resolved, setResolved] = useState<ResolvedUrl | undefined>(undefined);

  useEffect(() => {
    if (path === undefined) {
      return;
    }
    let active = true;
    getObjectUrl(path).then(
      (url) => {
        if (active) setResolved({ path, url });
      },
      () => {
        if (active) setResolved({ path, url: undefined });
      },
    );
    return () => {
      active = false;
    };
  }, [path]);

  if (path === undefined || resolved?.path !== path) {
    return undefined;
  }
  return resolved.url;
}
