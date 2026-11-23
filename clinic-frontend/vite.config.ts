import { fileURLToPath, URL } from 'node:url'
import vue from '@vitejs/plugin-vue'
import { defineConfig } from 'vite'

// Same backend path as the POS: production nginx proxies clinza.xentraerp.net/api/* to the
// erp-frontend Next.js process (:8083), which picks the tenant site from the xentra_tenant
// cookie. See scripts/nginx-clinza.xentraerp.net.conf.
export default defineConfig({
  plugins: [vue()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
    },
  },
  server: {
    port: 5175,
    proxy: {
      '/api': {
        target: process.env.VITE_API_PROXY_TARGET || 'http://127.0.0.1:8083',
        changeOrigin: true,
      },
    },
  },
})
