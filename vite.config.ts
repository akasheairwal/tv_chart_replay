/// <reference types="vitest" />
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'frontend',
  base: './',
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
  },
  test: {
    include: ['src/**/*.test.ts', '../tests/frontend/**/*.test.ts'],
    environment: 'node',
  },
});