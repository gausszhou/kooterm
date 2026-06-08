import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [vue(), legacy()],
  server: {
    port: 3001,
    proxy: {
      '/api/ws/terminal': {
        target: 'ws://localhost:3000',
        changeOrigin: true,
        ws: true
      },
      '/api/ws/vnc': {
        target: 'ws://localhost:3000',
        changeOrigin: true,
        ws: true
      }
    }
  },
  resolve: {
    alias: {
      '@': '/src'
    }
  },
  build: {
    outDir: 'dist',
    sourcemap: false
  }
});
