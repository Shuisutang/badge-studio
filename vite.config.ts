import { defineConfig } from 'vitest/config';

export default defineConfig({
  // GitHub Pages serves the project at /badge-studio/. Override with BASE=/ for local previews.
  base: process.env.BASE ?? '/badge-studio/',
  build: { target: 'es2022', sourcemap: true, chunkSizeWarningLimit: 700 },
  test: {
    include: ['tests/unit/**/*.test.ts'],
    environment: 'node',
  },
});
