import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [tailwindcss(), react()],
  server: {
    host: true,
    port: 5174,
    allowedHosts: ['computable'],
    proxy: {
      // Proxy all API routes to the backend server
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 15 * 60 * 1000,
        proxyTimeout: 15 * 60 * 1000,
      },
    },
  },
})
