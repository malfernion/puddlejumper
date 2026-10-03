import { defineConfig } from 'vite';

// Relative base so the build works under the GitHub Pages /puddlejumper/ sub-path.
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 1200 },
});
