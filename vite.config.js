// vite.config.js
import { defineConfig } from 'vite';

export default defineConfig({
  server: {
    proxy: {
      '/route': {
        target: 'https://router.project-osrm.org',
        changeOrigin: true,
        secure: true,
        rewrite: (p) => p, // keep /route/v1/driving/... as-is
      },
    },
  },
});
