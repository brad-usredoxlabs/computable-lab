import { defineConfig, type Plugin } from 'vite'
import { resolve } from 'node:path'
import tailwindcss from '@tailwindcss/vite'
import react from '@vitejs/plugin-react'
import { VitePWA } from 'vite-plugin-pwa'

/**
 * AI overlay loader. When VITE_AI_OVERLAY is set (the appliance build sets
 * it to `@cla-lab/ai-overlay-appliance`), `virtual:cla-ai-overlay`
 * re-exports the overlay package's manifest — vite resolves the overlay's
 * source at build time and emits it as a separate async chunk (loaded
 * lazily by loadOverlay, sharing this build's React/TipTap singletons).
 * Bare CL leaves it unset, so the virtual module yields an empty manifest
 * and every <Slot> falls back to <NullSlot>.
 *
 * The overlay's source imports host modules via the `@cla-lab-host/*`
 * alias, which resolves to this app's own `src/` here.
 */
function aiOverlayPlugin(): Plugin {
  const VIRTUAL_ID = 'virtual:cla-ai-overlay'
  const RESOLVED_ID = '\0' + VIRTUAL_ID
  const target = process.env.VITE_AI_OVERLAY?.trim()
  return {
    name: 'cla-ai-overlay',
    resolveId(id) {
      if (id === VIRTUAL_ID) return RESOLVED_ID
    },
    load(id) {
      if (id !== RESOLVED_ID) return
      return target
        ? `export { manifest } from '${target}'`
        : `export const manifest = { slots: {}, aiClient: null }`
    },
  }
}

// https://vitejs.dev/config/
export default defineConfig({
  resolve: {
    alias: {
      '@cla-lab-host': resolve(__dirname, 'src'),
    },
    // When the appliance build pulls the overlay's *source* into this
    // build (VITE_AI_OVERLAY = absolute path to its src/index.ts), the
    // overlay's bare imports must resolve to THIS build's copies so React,
    // the TipTap editor, and the router stay singletons across the
    // host/overlay boundary.
    dedupe: [
      'react',
      'react-dom',
      'react-router-dom',
      '@tiptap/core',
      '@tiptap/react',
      '@tiptap/pm',
      // @tiptap/pm is a meta-package that re-exports prosemirror-*;
      // deduping it does NOT dedupe the underlying packages. With pnpm's
      // nested layout, two physical copies of prosemirror-view / -state
      // are common — and ProseMirror decorations from one copy iterated
      // by another throw "Cannot read properties of undefined (reading
      // 'localsInner')". Pin each explicitly.
      'prosemirror-view',
      'prosemirror-state',
      'prosemirror-model',
      'prosemirror-transform',
      '@tiptap/suggestion',
    ],
  },
  // The AI overlay imports `@cla-lab-host/*` (CL source) through the alias
  // above. If vite pre-bundles the overlay into node_modules/.vite/deps/, it
  // inlines those imports as separate copies — so the overlay's React
  // contexts (EventEditorContext, AiPanelContext, …) end up as DIFFERENT
  // instances from CL's, and `useEventEditor() / useAiPanel()` throw "must
  // be used inside Provider" even though the provider IS in the tree.
  // Excluding from pre-bundling makes vite serve the overlay through the
  // normal resolver, sharing context instances with CL.
  // Vite ignores node_modules from its file watcher by default. The AI
  // overlay lives there (installed from a tarball), so dist updates aren't
  // detected until vite is restarted with the .vite cache wiped. Opt the
  // overlay back into the watcher so rebuild+pack+install reloads cleanly.
  server: {
    watch: {
      ignored: ['!**/node_modules/@cla-lab/ai-overlay-appliance/**'],
    },
  },
  optimizeDeps: {
    // The AI overlay imports `@cla-lab-host/*` (CL source) through the alias
    // above. If vite pre-bundles the overlay into node_modules/.vite/deps/, it
    // inlines those imports as separate copies — so the overlay's React
    // contexts (EventEditorContext, AiPanelContext, …) end up as DIFFERENT
    // instances from CL's, and `useEventEditor() / useAiPanel()` throw "must
    // be used inside Provider" even though the provider IS in the tree.
    //
    // The @tiptap/pm subpaths (state/view/model/transform) and @tiptap/
    // suggestion all inline parts of prosemirror-* into self-contained
    // pre-bundled chunks. Even with dedupe set for prosemirror packages, two
    // chunks → two physical copies of PluginKey/Decoration classes → the
    // "Cannot read properties of undefined (reading 'localsInner')" crash when
    // a decoration from one PM-view instance is iterated by another. Excluding
    // from pre-bundling makes vite resolve them via the standard alias+dedupe
    // resolver, giving a single instance shared by the host and the overlay.
    exclude: [
      '@cla-lab/ai-overlay-appliance',
      '@tiptap/pm',
      '@tiptap/pm/state',
      '@tiptap/pm/view',
      '@tiptap/pm/model',
      '@tiptap/pm/transform',
      '@tiptap/suggestion',
      'prosemirror-view',
      'prosemirror-state',
      'prosemirror-model',
      'prosemirror-transform',
    ],
  },
  plugins: [
    aiOverlayPlugin(),
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
        theme_color: '#000000',
        background_color: '#000000',
        display: 'standalone',
        orientation: 'landscape',
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
    // Same allowlist as `preview` below so dev mode is reachable over the
    // LAN / tailnet (bare hostnames and *.ts.net MagicDNS FQDNs).
    allowedHosts: ['computable', 'appliance-01', 'appliance-2', '.ts.net'],
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
  // `vite preview` is what the appliance's cla-lab-frontend systemd unit
  // runs. Vite 5 blocks unknown Host headers unless explicitly allowed —
  // listing the appliance hostname here lets browsers reach the kiosk over
  // the LAN AND over tailnet (where the Host header may be the bare
  // hostname, `appliance-01.<tailnet>.ts.net`, or an IP).
  preview: {
    host: true,
    port: 5174,
    allowedHosts: [
      'computable',
      'appliance-01',
      'appliance-01.local',
      'appliance-2',
      'appliance-2.local',
      'thunderbeast',
      'bobbert',
      // Tailnet MagicDNS resolves bare hostnames AND fully-qualified
      // ones; leading-dot suffix matches anything in the tailnet.
      '.ts.net',
    ],
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true,
        timeout: 15 * 60 * 1000,
        proxyTimeout: 15 * 60 * 1000,
      },
    },
  },
})
