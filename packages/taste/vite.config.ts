import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';

// PWA config mirrors packages/web/vite.config.js (insights has no PWA).
// Taste is local-first: the SW precaches the full app shell so it boots offline.
export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: ['favicon.ico', 'apple-touch-icon.png'],
      manifest: {
        name: 'Auxein Taste',
        short_name: 'Taste',
        description: 'Local-first wine tasting notes — template-driven grid capture, fully offline.',
        theme_color: '#7B2E3C',
        background_color: '#F6F1E7',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        icons: [
          { src: 'icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'any maskable' },
        ],
      },
      workbox: {
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif|webp)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: { maxEntries: 100, maxAgeSeconds: 60 * 60 * 24 * 30 },
            },
          },
        ],
      },
    }),
  ],
  resolve: {
    alias: {
      '@vineyard/shared': path.resolve(__dirname, '../shared/src'),
      '@shared': path.resolve(__dirname, '../shared/src'),
      '@': path.resolve(__dirname, 'src'),
    },
    dedupe: ['@vineyard/shared'],
  },
  server: {
    port: 5175, // 5173=pro, 5174=insights
    proxy: {
      // F1 (2026-09-21): Taste no longer calls the main API for anything —
      // auth moved to taste-api's own /taste/v1/auth/*, covered by the /taste
      // proxy below. This entry is kept only so an old build served from this
      // dev server does not 404 mid-session; nothing in src/ targets it.
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
      },
      // Auth AND data → the isolated taste-api. In prod, VITE_TASTE_API_URL
      // points at taste-api.auxein.co.nz.
      // 127.0.0.1, not localhost: Node resolves localhost to ::1 while uvicorn
      // binds IPv4, and the result is an ECONNREFUSED that looks like the API
      // being down (see the note in .env.local, and project_vite_proxy_ipv6).
      '/taste': {
        target: 'http://127.0.0.1:8001',
        changeOrigin: true,
        secure: false,
      },
    },
    watch: { followSymlinks: true },
  },
  optimizeDeps: {
    exclude: ['@vineyard/shared'],
  },
});
