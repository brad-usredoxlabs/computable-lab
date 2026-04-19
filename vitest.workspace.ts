import { defineWorkspace } from 'vitest/config'

// Vitest workspace that includes the app's vitest config
// This allows `pnpm vitest run` to work from the monorepo root
export default defineWorkspace([
  'app/vitest.config.ts',
])
