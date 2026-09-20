import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// https://vite.dev/config/
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    // Local dev only — production nginx proxies pos.xentraerp.net/api/* to
    // the same erp-frontend Next.js process directly (see
    // scripts/nginx-pos.xentraerp.net.conf). Point this at wherever that
    // process runs locally.
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8083',
        changeOrigin: true,
      },
    },
  },
})
