/// <reference types="vitest/config" />
import { defineConfig } from 'vite';

export default defineConfig({
  // 상대 경로로 빌드해 어떤 하위 경로(GitHub Pages 등)에 올려도 동작하게 한다.
  base: './',
  build: {
    outDir: 'dist',
    // Phaser 번들은 1MB가 넘으므로 경고 한도만 올린다.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
    testTimeout: 60_000,
  },
});
