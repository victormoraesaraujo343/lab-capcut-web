// Plugin do Vite: `import url from './x?worklet-data'` empacota o arquivo como script único (iife) e devolve uma URL data:.
// `import code from './x?bundled-source'` devolve o mesmo script empacotado, como texto.
// addModule() aceita data: mesmo na página aberta direto do disco (file://), onde blob: e arquivos separados falham.
import { build } from 'rolldown';
import type { Plugin } from 'vite';

const SUFFIX = '?worklet-data';
const SOURCE_SUFFIX = '?bundled-source';

/** Empacota um arquivo de entrada como script único (iife) e devolve o código. */
async function bundleToIife(entry: string): Promise<string> {
  const result = await build({
    input: entry,
    write: false,
    logLevel: 'silent',
    output: { format: 'iife', minify: true },
  });
  return result.output[0]?.code ?? '';
}

/** Cria o plugin que transforma módulos `?worklet-data` em uma URL data:text/javascript;base64. */
export function workletDataUrl(): Plugin {
  return {
    name: 'worklet-data-url',
    enforce: 'pre',
    async resolveId(source, importer) {
      const suffix = [SUFFIX, SOURCE_SUFFIX].find((candidate) => source.endsWith(candidate));
      if (suffix === undefined) return null;
      const resolved = await this.resolve(source.slice(0, -suffix.length), importer, { skipSelf: true });
      return resolved ? resolved.id + suffix : null;
    },
    async load(id) {
      if (id.endsWith(SOURCE_SUFFIX)) {
        const code = await bundleToIife(id.slice(0, -SOURCE_SUFFIX.length));
        return `export default ${JSON.stringify(code)};`;
      }
      if (!id.endsWith(SUFFIX)) return null;
      const code = await bundleToIife(id.slice(0, -SUFFIX.length));
      const url = `data:text/javascript;base64,${Buffer.from(code, 'utf8').toString('base64')}`;
      return `export default ${JSON.stringify(url)};`;
    },
  };
}
