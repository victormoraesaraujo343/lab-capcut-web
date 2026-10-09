import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

const srcDir = decodeURIComponent(new URL('./src', import.meta.url).pathname);

export default defineConfig({
  plugins: [react()],
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
