import { defineConfig } from 'vite'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [
    tailwindcss(),
    react(),
    // PWA shell. `autoUpdate` rolls new versions silently; the user
    // doesn't see an install prompt mid-session. We cache the app
    // shell (HTML / JS / CSS / SVG) so the editor launches even on a
    // flaky connection — data fetches still need the server.
    VitePWA({
      registerType: 'autoUpdate',
      // PWA only activates in production builds. In dev, Vite serves
      // every TS file as a separate ES module request — adding Workbox
      // precaching on top stalls the page for minutes on iPhone Safari
      // (HTTP/1 connection limits). Use `npm run preview` after a build
      // to test "Add to Home Screen" on a phone.
      includeAssets: ['pwa-icon.svg', 'vite.svg'],
      manifest: {
        name: 'Event Editor',
        short_name: 'Editor',
        description: 'Plan experiments and run the Fix-it compiler loop from any device.',
        theme_color: '#0e1116',
        background_color: '#0e1116',
        display: 'standalone',
        orientation: 'portrait-primary',
        scope: '/',
        start_url: '/event-editor',
        icons: [
          {
            src: '/pwa-icon.svg',
            sizes: '192x192 512x512 any',
            type: 'image/svg+xml',
            purpose: 'any maskable',
          },
        ],
      },
      workbox: {
        // Cache the app shell so the editor opens even when offline.
        // Anything served from /api/ is left untouched — we don't want
        // stale records, jobs, or LLM streams. SSE in particular MUST
        // bypass Workbox.
        navigateFallback: '/event-editor',
        navigateFallbackDenylist: [/^\/api\//],
        runtimeCaching: [
          {
            urlPattern: ({ url }) => url.pathname.startsWith('/api/'),
            handler: 'NetworkOnly',
          },
        ],
      },
    }),
  ],
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
