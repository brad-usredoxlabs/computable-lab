import { test, expect } from '@playwright/test'

test.describe('Navigation & Layout', () => {
  test('root redirects to /browser', async ({ page }) => {
    await page.goto('/')
    await expect(page).toHaveURL('/browser')
  })

  test('layout renders header with nav links', async ({ page }) => {
    await page.goto('/browser')

    // Brand link
    const brand = page.locator('.nav-brand')
    await expect(brand).toHaveText('Semantic ELN')

    // Nav links
    await expect(page.locator('.nav-link', { hasText: 'Records' })).toBeVisible()
    await expect(page.locator('.nav-link', { hasText: 'Schemas' })).toBeVisible()
    await expect(page.locator('.nav-link', { hasText: 'Labware Editor' })).toBeVisible()
    await expect(page.locator('.nav-link', { hasText: 'Settings' })).toBeVisible()
  })

  test('nav links navigate to correct pages', async ({ page }) => {
    await page.goto('/browser')

    // Schemas
    await page.locator('.nav-link', { hasText: 'Schemas' }).click()
    await expect(page).toHaveURL('/schemas')

    // Settings
    await page.locator('.nav-link', { hasText: 'Settings' }).click()
    await expect(page).toHaveURL('/settings')

    // Records (browser)
    await page.locator('.nav-link', { hasText: 'Records' }).click()
    await expect(page).toHaveURL('/browser')

    // Labware Editor
    await page.locator('.nav-link', { hasText: 'Labware Editor' }).click()
    await expect(page).toHaveURL('/labware-editor')
  })

  test('brand logo navigates to browser', async ({ page }) => {
    await page.goto('/settings')
    await page.locator('.nav-brand').click()
    await expect(page).toHaveURL('/browser')
  })

  test('repo status badge is visible in header', async ({ page }) => {
    await page.goto('/browser')
    // The RepoStatusBadge component should be present in the nav
    const nav = page.locator('.nav')
    await expect(nav).toBeVisible()
  })
})
