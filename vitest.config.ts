import { defineConfig } from 'vitest/config'

// Root vitest config that includes the app's project
// This allows running `pnpm vitest run` from the repo root
export default defineConfig({
  test: {
    projects: [
      './app/vitest.config.ts',
    ],
  },
})
