import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import http from 'node:http';

// See packages/web/vite.config.js for the full reasoning: without keep-alive the
// proxy burns one TCP connection per API call, and TIME_WAIT (4 minutes on
// Windows) exhausts the ~16k ephemeral port range, producing intermittent
// stalls and `connect EADDRINUSE`.
const keepAliveAgent = new http.Agent({
  keepAlive: true,
  keepAliveMsecs: 10000,
  maxSockets: 64,
});

export default defineConfig({
  plugins: [
    react()
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
    port: 5174, // Different port from web (5173)
    // Targets use 127.0.0.1, NOT localhost. uvicorn binds 0.0.0.0 (IPv4 only)
    // and Node 17+ no longer reorders DNS results, so `localhost` can resolve to
    // ::1 first and the proxy fails with ECONNREFUSED / AggregateError while the
    // API is perfectly healthy on IPv4.
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        agent: keepAliveAgent,
      },
      '/static': {
        target: 'http://127.0.0.1:8000',
        changeOrigin: true,
        secure: false,
        agent: keepAliveAgent,
      },
      '/uploads': {
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
