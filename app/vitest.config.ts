import { defineConfig } from 'vitest/config'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'jsdom',
    // jsdom only implements window.localStorage for a real (non-opaque) origin;
    // without a url it is undefined, which silently breaks every storage-backed
    // unit test (the tab store, the recent store, the right-pane mode).
    environmentOptions: { jsdom: { url: 'http://localhost:5174/' } },
    setupFiles: ['./src/test/setup.ts'],
  },
})
