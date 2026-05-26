import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'
import tailwindcss from '@tailwindcss/vite'

export default defineConfig({
  base: '/tickle/',
  plugins: [vue(), tailwindcss()],
  server: {
    proxy: {
      // PartyKit dev server runs on :1999. Proxy both HTTP and WebSocket
      // requests under /parties/* so the Vite-served client can talk to
      // the local party server without CORS / mixed-origin headaches.
      '/parties': {
        target: 'http://localhost:1999',
        changeOrigin: true,
        ws: true,
      },
    },
  },
})
