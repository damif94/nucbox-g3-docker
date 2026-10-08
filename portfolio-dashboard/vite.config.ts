import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// Served under damianferencz.org/portfolio/ (NPM strips the prefix before the container).
// In `npm run dev` the OpenFIGI proxy is emulated here; in production nginx handles it.
export default defineConfig({
  base: '/portfolio/',
  plugins: [react()],
  server: {
    proxy: {
      '/portfolio/api/figi': {
        target: 'https://api.openfigi.com',
        changeOrigin: true,
        rewrite: () => '/v3/mapping',
        headers: process.env.OPENFIGI_API_KEY ? { 'X-OPENFIGI-APIKEY': process.env.OPENFIGI_API_KEY } : {},
      },
    },
  },
});
