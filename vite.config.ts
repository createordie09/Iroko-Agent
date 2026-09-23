import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import path from 'path';
import {defineConfig} from 'vite';

export default defineConfig(() => {
  return {
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, '.'),
      },
    },
    server: {
      strictPort: true,
      port: 5173,
      host: '127.0.0.1',
      proxy: {
        '/api': {
          target: 'http://127.0.0.1:3001',
          changeOrigin: false,
        },
        '/ws': {
          target: 'ws://127.0.0.1:3001',
          ws: true,
          changeOrigin: false,
        },
      },
      headers: {
        'X-Content-Type-Options': 'nosniff',
        'Referrer-Policy': 'no-referrer',
        'X-Frame-Options': 'DENY'
      },
      hmr: process.env.DISABLE_HMR !== 'true',
      watch: process.env.DISABLE_HMR === 'true' ? null : {},
    },
  };
});
