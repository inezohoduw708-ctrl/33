import { defineConfig } from 'vite';

export default defineConfig({
  // relative base so the build runs from any folder / sub-path (Yandex Browser, hosting, disk)
  base: './',
  server: {
    host: '0.0.0.0',
    port: 5173,
    strictPort: false,
    allowedHosts: true,
    origin: undefined,
  },
  preview: { host: '0.0.0.0', allowedHosts: true },
  build: {
    target: 'es2019',
    assetsInlineLimit: 0,
    chunkSizeWarningLimit: 1200,
    sourcemap: false,
  },
});
