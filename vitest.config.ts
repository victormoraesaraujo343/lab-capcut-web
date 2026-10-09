import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import { workletDataUrl } from './scripts/workletDataUrl.ts';

const srcDir = decodeURIComponent(new URL('./src', import.meta.url).pathname);

export default defineConfig({
  plugins: [workletDataUrl(), react()],
  resolve: {
    alias: {
      '@': srcDir,
    },
  },
  test: {
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
    globals: false,
    include: ['tests/**/*.test.ts', 'tests/**/*.test.tsx', 'src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
});
