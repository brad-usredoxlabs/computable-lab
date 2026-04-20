import { defineConfig } from 'vitest/config'

// Root vitest config that includes both app and server projects
// This allows running `pnpm vitest run` from the repo root
export default defineConfig({
  test: {
    projects: [
      './app/vitest.config.ts',
      './server/vitest.config.ts',
    ],
  },
})
