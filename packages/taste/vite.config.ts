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
      // Auth (public login) → the main API. In prod, VITE_API_URL points at it.
      '/api': {
        target: 'http://localhost:8000',
        changeOrigin: true,
        secure: false,
      },
      // Data (sync/bootstrap) → the isolated taste-api. In prod, VITE_TASTE_API_URL
      // points at taste-api.auxein.co.nz.
      '/taste': {
        target: 'http://localhost:8001',
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
