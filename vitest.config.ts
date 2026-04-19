/// <reference types="vitest" />
import { defineConfig } from 'vitest/config'

// Root vitest config for monorepo
// This allows `pnpm vitest run app/src/extraction/ExtractionReviewPage.test.tsx` to work from the repo root
export default defineConfig({
  test: {
    environment: 'jsdom',
    root: './app',
    setupFiles: ['./src/test/setup.ts'],
    include: ['src/**/*.test.ts', 'src/**/*.test.tsx'],
  },
})
