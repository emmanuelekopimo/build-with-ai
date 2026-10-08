import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  root: 'src/client',
  publicDir: '../../public',
  plugins: [react()],
  build: { outDir: '../../dist/client', emptyOutDir: true, sourcemap: false, chunkSizeWarningLimit: 900 },
  server: {
    host: true, // reachable from other machines on the LAN
    port: 5173,
    proxy: { '/api': { target: process.env.API_PROXY_TARGET ?? 'http://localhost:4000', changeOrigin: false } },
  },
  preview: { host: true, port: 5173 },
});
