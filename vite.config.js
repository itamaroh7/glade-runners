import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the build works from any GitHub Pages sub-path.
  base: './',
  server: { host: true, port: 5173 },
  build: { target: 'es2020', chunkSizeWarningLimit: 1200 },
});
