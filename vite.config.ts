import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/pixel/index.ts'),
      name: 'OutboundIntentTracker',
      fileName: 'pixel',
      formats: ['iife']
    },
    rollupOptions: {
      output: {
        extend: true,
        globals: {}
      }
    },
    minify: 'terser',
    terserOptions: {
      compress: {
        drop_console: false,  // Keep console.log for debugging
        drop_debugger: true
      }
    },
    target: 'es2015',
    outDir: 'dist'
  }
});

