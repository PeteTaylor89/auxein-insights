import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';
import path from 'path';
import http from 'node:http';

// Keep-alive agent for the API proxy.
//
// Without this the proxy opens a NEW TCP connection for every single API call
// and drops it immediately. Each one then sits in TIME_WAIT — which Windows
// holds for 4 minutes, against an ephemeral port range of only ~16k
// (49152-65535). A busy page pushed that past 2,000 sockets, and connects
// started colliding with ports still held: most requests returned in 5ms while
// the occasional one stalled for 15s+ or failed outright with
// `connect EADDRINUSE 127.0.0.1:8000`. That reads like a flaky API but is
// purely socket churn.
//
// Reusing connections keeps the socket count flat regardless of request volume.
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 64,
});

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      devOptions: { enabled: false },
      includeAssets: [
        'favicon.ico',
        'favicon-96x96.png',
        'apple-touch-icon.png',
        'og-image.jpg',
      ],
      manifest: {
        name: 'Auxein Grow',
        short_name: 'Auxein Grow',
        description: 'Vineyard operations platform for New Zealand growers — calibrations, observations, and field tasks.',
        theme_color: '#5B6830',
        background_color: '#ffffff',
        display: 'standalone',
        start_url: '/',
        icons: [
          {
            src: 'web-app-manifest-192x192.png',
            sizes: '192x192',
            type: 'image/png',
          },
          {
            src: 'web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
          },
          {
            src: 'web-app-manifest-512x512.png',
            sizes: '512x512',
            type: 'image/png',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Main bundle is ~3 MB; default precache cap is 2 MiB.
        // Bumped to 5 MiB so the SW precaches the full app shell.
        // Code-splitting via manualChunks would let us drop this back.
        maximumFileSizeToCacheInBytes: 5 * 1024 * 1024,
        runtimeCaching: [
          {
            urlPattern: /^https:\/\/api\.yourdomain\.com\/.*$/i,
            handler: 'NetworkFirst',
            options: {
              cacheName: 'api-cache',
              expiration: {
                maxEntries: 50,
                maxAgeSeconds: 60 * 60 * 24 // 1 day
              },
              networkTimeoutSeconds: 10
            }
          },
          {
            urlPattern: /\.(?:png|jpg|jpeg|svg|gif)$/,
            handler: 'CacheFirst',
            options: {
              cacheName: 'images',
              expiration: {
                maxEntries: 60,
                maxAgeSeconds: 60 * 60 * 24 * 30 // 30 days
              }
            }
          }
        ]
      }
    })
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
    proxy: {
      '/api': {
        // 127.0.0.1, NOT localhost. uvicorn binds 0.0.0.0 (IPv4 only), while
        // Node 17+ stopped reordering DNS results — so `localhost` can resolve
        // to ::1 first and the proxy dies with ECONNREFUSED / AggregateError
        // even though the API is up and answering on IPv4.
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        agent: keepAliveAgent,
      },
    },
    watch: {
      followSymlinks: true,
    },
  },
  optimizeDeps: {

    exclude: ['@vineyard/shared'],

  },
});