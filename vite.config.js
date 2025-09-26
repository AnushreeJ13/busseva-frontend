
import { defineConfig, loadEnv } from "vite";
import react from '@vitejs/plugin-react'

// vite.config.ts
export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), "");
  const target = env.VITE_API_BASE_URL || "http://localhost:3000";
  return {
     server: {
    proxy: {
      "/api": { target: "http://127.0.0.1:3000", changeOrigin: true, secure: false }
    }
  }
  };
});
