import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';

const projectRoot = __dirname;

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
      '@main': resolve(projectRoot, 'src/main'),
      '@renderer': resolve(projectRoot, 'src/renderer'),
      '@shared': resolve(projectRoot, 'src/shared'),
      '@web': resolve(projectRoot, 'src/web'),
    },
  },
  root: resolve(projectRoot, 'src/web'),
  build: {
    outDir: resolve(projectRoot, 'dist/web'),
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: resolve(projectRoot, 'src/web/index.html'),
      },
    },
  },
  // Define environment variables
  define: {
    'process.env.NODE_ENV': JSON.stringify(process.env.NODE_ENV || 'production'),
  },
});
