import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { mkdirSync, writeFileSync } from 'node:fs';
import { workletDataUrl } from './scripts/workletDataUrl.ts';

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

/** Só no build: troca o script de módulo por um script clássico com defer, sem crossorigin, para abrir o index.html direto do disco (file://). */
function classicScriptHtml(): Plugin {
  return {
    name: 'classic-script-html',
    apply: 'build',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        return html
          .replace(/<script\s+type="module"\s+crossorigin\s+/g, '<script defer ')
          .replace(/<script\s+type="module"\s+/g, '<script defer ')
          .replace(/<script\s+crossorigin\s+/g, '<script ')
          .replace(/<link([^>]*?)\scrossorigin(?:="[^"]*")?/g, '<link$1');
      },
    },
  };
}

/** Só no build: remove do dist o .wasm do ONNX que o transformers.js emite sozinho (27 MB); o app usa a cópia de public/ort. */
function dropDuplicateOrtWasm(): Plugin {
  return {
    name: 'drop-duplicate-ort-wasm',
    apply: 'build',
    generateBundle(_options, bundle) {
      for (const name of Object.keys(bundle)) {
        if (/^assets\/ort-wasm.*\.wasm$/.test(name)) delete bundle[name];
      }
    },
  };
}

/** Em iife não existe import.meta.url: o banner guarda o endereço do script (ou do worker) e o define aponta para ele. */
const IMPORT_META_BANNER =
  "var __IMPORT_META_URL__ = (typeof document !== 'undefined' && document.currentScript && document.currentScript.src) || self.location.href;";

export default defineConfig(({ command }) => ({
  plugins: [workletDataUrl(), react(), devSaveExports(), classicScriptHtml(), dropDuplicateOrtWasm()],
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
  ...(command === 'build'
    ? {
        define: { 'import.meta.url': '__IMPORT_META_URL__' },
        build: {
          rolldownOptions: {
            output: { format: 'iife' as const, codeSplitting: false, banner: IMPORT_META_BANNER },
          },
        },
      }
    : {}),
  worker: {
    format: 'iife' as const,
    rolldownOptions: { output: { banner: command === 'build' ? IMPORT_META_BANNER : '' } },
  },
}));
