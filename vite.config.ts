import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';

const srcDir = decodeURIComponent(new URL('./src', import.meta.url).pathname);
const outputDir = decodeURIComponent(new URL('./tests/output/', import.meta.url).pathname);
const refsDir = decodeURIComponent(new URL('./tests/render-refs/', import.meta.url).pathname);

/** Só no servidor de desenvolvimento: recebe um arquivo exportado (POST /__dev/save?name=x) e grava em tests/output, para conferir com ffprobe. */
function devSaveExports(): Plugin {
  return {
    name: 'dev-save-exports',
    apply: 'serve',
    configureServer(server) {
      server.middlewares.use('/__dev/save', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'export.bin';
        // Só letras, números, _ - e um ponto de extensão; nunca '..' nem barras.
        const safe = name.replace(/[^\w.-]/g, '_').replace(/\.{2,}/g, '_').replace(/^\.+/, '') || 'export.bin';
        const parts: Buffer[] = [];
        req.on('data', (chunk: Buffer) => parts.push(chunk));
        req.on('end', () => {
          try {
            mkdirSync(outputDir, { recursive: true });
            writeFileSync(outputDir + safe, Buffer.concat(parts));
            res.end(`saved ${safe}`);
          } catch (error) {
            res.statusCode = 500;
            res.end(`erro ao salvar: ${error instanceof Error ? error.message : String(error)}`);
          }
        });
      });
      // Só dev: grava a referência de um caso de teste de render (POST /__dev/save-ref?name=<caso>.png) em tests/render-refs.
      server.middlewares.use('/__dev/save-ref', (req, res) => {
        const name = new URL(req.url ?? '', 'http://x').searchParams.get('name') ?? 'ref.png';
        // Só letras, números, _ - e um ponto de extensão; nunca '..' nem barras.
        const safe = name.replace(/[^\w.-]/g, '_').replace(/\.{2,}/g, '_').replace(/^\.+/, '') || 'ref.png';
        const parts: Buffer[] = [];
        req.on('data', (chunk: Buffer) => parts.push(chunk));
        req.on('end', () => {
          try {
            mkdirSync(refsDir, { recursive: true });
            writeFileSync(refsDir + safe, Buffer.concat(parts));
            res.end(`saved ${safe}`);
          } catch (error) {
            res.statusCode = 500;
            res.end(`erro ao salvar: ${error instanceof Error ? error.message : String(error)}`);
          }
        });
      });
    },
  };
}

export default defineConfig({
  plugins: [react(), devSaveExports()],
  base: './',
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  server: {
    headers: {
      'Cross-Origin-Opener-Policy': 'same-origin',
      'Cross-Origin-Embedder-Policy': 'require-corp',
    },
  },
});
