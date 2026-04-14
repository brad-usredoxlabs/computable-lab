import { defineConfig } from '@playwright/test'

export default defineConfig({
  testDir: './e2e',
  timeout: 30_000,
  expect: { timeout: 5_000 },
  fullyParallel: true,
  retries: 0,
  reporter: 'list',
  use: {
    baseURL: process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5174',
    headless: true,
    screenshot: 'only-on-failure',
    trace: 'on-first-retry',
  },
  projects: [
    {
      name: 'chromium',
      use: { browserName: 'chromium' },
    },
    {
      name: 'firefox',
      use: {
        browserName: 'firefox',
        launchOptions: {
          env: {
            MOZ_DISABLE_CONTENT_SANDBOX: '1',
            MOZ_DISABLE_GMP_SANDBOX: '1',
            MOZ_WEBRENDER: '0',
          },
          firefoxUserPrefs: {
            'fission.autostart': false,
            'fission.webContentIsolationStrategy': 0,
            'gfx.webrender.force-disabled': true,
          },
        },
      },
    },
  ],
})
