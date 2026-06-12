import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';
import legacy from '@vitejs/plugin-legacy';

export default defineConfig({
  plugins: [vue(), legacy()],
  server: {
    port: 3002,
    proxy: {
      '/portal-direct-api/ws/terminal': {
        target: 'ws://localhost:3001',
        changeOrigin: true,
        ws: true
      },
      '/portal-direct-api/ws/vnc': {
        target: 'ws://localhost:3001',
        changeOrigin: true,
        ws: true
      },
      '/portal-direct-api/ws/tcp': {
        target: 'ws://localhost:3001',
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
    assetsDir: 'portal-direct-assets',
    sourcemap: false
  }
});
