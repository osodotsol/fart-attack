import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Renderer bundle only. Loaded from file:// by Electron, so asset paths must be relative.
export default defineConfig({
  root: 'src/renderer',
  base: './',
  plugins: [react()],
  build: { outDir: '../../dist/renderer', emptyOutDir: true, sourcemap: false },
});
