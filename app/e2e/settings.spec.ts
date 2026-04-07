import { test, expect } from '@playwright/test'

test.describe('Settings Page', () => {
  test.beforeEach(async ({ page }) => {
    await page.goto('/settings')
  })

  test('page loads with heading and description', async ({ page }) => {
    await expect(page.locator('h1', { hasText: 'Settings' })).toBeVisible()
    await expect(page.getByText('Server configuration and connection status')).toBeVisible()
  })

  test('breadcrumb navigation works', async ({ page }) => {
    await expect(page.locator('.breadcrumb')).toBeVisible()
    await expect(page.locator('.breadcrumb a', { hasText: 'Home' })).toBeVisible()

    // Click Home breadcrumb
    await page.locator('.breadcrumb a', { hasText: 'Home' }).click()
    await expect(page).toHaveURL('/browser')
  })

  test('settings grid shows all sections', async ({ page }) => {
    // Wait for data to load
    await page.waitForTimeout(2000)

    // Should have all 6 section headings
    const sections = ['Server', 'Repository', 'Namespace', 'Schemas', 'Validation', 'JSON-LD']
    for (const section of sections) {
      await expect(page.locator('.settings-section h2', { hasText: section })).toBeVisible()
    }
  })

  test('server section shows version and status', async ({ page }) => {
    await page.waitForTimeout(2000)

    const serverSection = page.locator('.settings-section').filter({ hasText: 'Server' }).first()
    await expect(serverSection).toBeVisible()

    // Should show Version, Uptime, and Status labels
    await expect(serverSection.locator('.info-row__label', { hasText: 'Version' })).toBeVisible()
    await expect(serverSection.locator('.info-row__label', { hasText: 'Uptime' })).toBeVisible()
    await expect(serverSection.locator('.info-row__label', { hasText: 'Status' })).toBeVisible()

    // Status should say "Connected" if backend is running
    await expect(serverSection.getByText('Connected')).toBeVisible({ timeout: 5000 })
  })

  test('repository section shows sync controls', async ({ page }) => {
    await page.waitForTimeout(2000)

    const repoSection = page.locator('.settings-section').filter({ hasText: 'Repository' }).first()
    await expect(repoSection).toBeVisible()

    // Should show URL and Branch
    await expect(repoSection.locator('.info-row__label', { hasText: 'URL' })).toBeVisible()
    await expect(repoSection.locator('.info-row__label', { hasText: 'Branch' })).toBeVisible()

    // Should show status badge
    await expect(repoSection.locator('.status-badge')).toBeVisible()

    // Should have sync controls
    await expect(repoSection.locator('.btn-primary', { hasText: /Sync Now/ })).toBeVisible()
    await expect(repoSection.locator('.btn-secondary', { hasText: 'Refresh Status' })).toBeVisible()
  })

  test('refresh status button works', async ({ page }) => {
    await page.waitForTimeout(2000)

    const refreshBtn = page.locator('.btn-secondary', { hasText: 'Refresh Status' })
    await expect(refreshBtn).toBeVisible()

    // Click refresh - should not crash
    await refreshBtn.click()

    // Server section should still show Connected after refresh
    await page.waitForTimeout(1000)
    const serverSection = page.locator('.settings-section').filter({ hasText: 'Server' }).first()
    await expect(serverSection.getByText('Connected')).toBeVisible({ timeout: 5000 })
  })

  test('schemas section shows schema counts', async ({ page }) => {
    await page.waitForTimeout(2000)

    const schemasSection = page.locator('.settings-section').filter({ hasText: 'Schemas' }).nth(0)
    // The section with h2 "Schemas" (not the nav link)
    const schemaSectionByH2 = page.locator('.settings-section:has(h2:text("Schemas"))')
    await expect(schemaSectionByH2).toBeVisible()

    // Should show source and total counts
    await expect(schemaSectionByH2.locator('.info-row__label', { hasText: 'Source' })).toBeVisible()
    await expect(schemaSectionByH2.locator('.info-row__label', { hasText: 'Total Schemas' })).toBeVisible()
  })
})
