/**
 * Standalone build for the read-only evidence viewer: a self-contained ES
 * module (React bundled in, NO externals) so a host page can import a
 * single versioned file with zero peer-dependency assumptions.
 *
 * Deliberately minimal: no PWA, no Tailwind plugin, no proxy, no aliases.
 * The viewer renders with inline styles only — no CSS pipeline, so the
 * bundle is truly one file.
 */
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  // Don't copy the app's public/ (PWA icons etc.) into the viewer bundle.
  publicDir: false,
  define: {
    'process.env.NODE_ENV': JSON.stringify('production'),
  },
  build: {
    outDir: 'dist-viewer',
    emptyOutDir: true,
    lib: {
      entry: 'src/viewer/index.tsx',
      formats: ['es'],
      fileName: 'viewer',
    },
    rollupOptions: {
      // Self-contained: bundle react/react-dom in. Empty externals is a
      // contract, not an omission — the host must import exactly one file.
      external: [],
    },
  },
})
