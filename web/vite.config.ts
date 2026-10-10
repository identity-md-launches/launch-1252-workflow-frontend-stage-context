import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
export default defineConfig({
  base: './',
  plugins: [react()],
  publicDir: 'generated',
  build: { outDir: '../dist', emptyOutDir: true, target: 'es2022', sourcemap: false },
});
