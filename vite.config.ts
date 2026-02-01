import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import electron from 'vite-plugin-electron';
import renderer from 'vite-plugin-electron-renderer';
import { resolve } from 'path';

const projectRoot = __dirname;

export default defineConfig({
  plugins: [
    react(),
    electron([
      {
        entry: resolve(projectRoot, 'src/main/index.ts'),
        onstart(args) {
          // Delay para asegurar que el archivo se escribió completamente (Windows FS delay)
          setTimeout(() => args.startup(), 300);
        },
        vite: {
          build: {
            outDir: resolve(projectRoot, 'dist/main'),
            lib: {
              entry: resolve(projectRoot, 'src/main/index.ts'),
              formats: ['cjs'],
              fileName: () => 'index.js',
            },
            rollupOptions: {
              external: [
                'electron',
                'better-sqlite3',
                'node-pty',
                'bufferutil',
                'utf-8-validate',
                'node-llama-cpp',
                'sqlite-vec',
                // node-llama-cpp platform-specific binaries
                /^@node-llama-cpp\/.*/,
              ],
            },
            watch: {
              // Debounce para evitar rebuilds muy frecuentes en Windows
              buildDelay: 200,
            },
          },
          resolve: {
            alias: {
              '@shared': resolve(projectRoot, 'src/shared'),
            },
          },
        },
      },
      {
        entry: resolve(projectRoot, 'src/main/preload.ts'),
        onstart(args) {
          args.reload();
        },
        vite: {
          build: {
            outDir: resolve(projectRoot, 'dist/preload'),
            lib: {
              entry: resolve(projectRoot, 'src/main/preload.ts'),
              formats: ['cjs'],
              fileName: () => 'preload.js',
            },
            rollupOptions: {
              external: ['electron'],
            },
          },
          resolve: {
            alias: {
              '@shared': resolve(projectRoot, 'src/shared'),
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  resolve: {
    alias: {
      '@': resolve(projectRoot, 'src'),
      '@main': resolve(projectRoot, 'src/main'),
      '@renderer': resolve(projectRoot, 'src/renderer'),
      '@shared': resolve(projectRoot, 'src/shared'),
    },
  },
  root: resolve(projectRoot, 'src/renderer'),
  publicDir: resolve(projectRoot, 'public'),
  build: {
    outDir: resolve(projectRoot, 'dist/renderer'),
    emptyOutDir: true,
  },
});
