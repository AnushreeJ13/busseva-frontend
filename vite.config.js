// vite.config.js
import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react'

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  return {
    server: {
      proxy: {
        '/osrm': {
          target: 'https://router.project-osrm.org',
          changeOrigin: true,
          secure: true,
          rewrite: (p) => p.replace(/^\/osrm/, ''),
        },
      },
    },
  };
});
