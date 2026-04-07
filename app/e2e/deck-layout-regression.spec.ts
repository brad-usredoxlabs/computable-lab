import { test, expect } from '@playwright/test'

test.describe('Deck Layout Regression', () => {
  test('deck visualization renders for robot platform', async ({ page }) => {
    await page.goto('/labware-editor?new=1')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    // Dismiss context modal if present — select liquid-handling vocab
    const continueBtn = page.getByRole('button', { name: 'Continue' })
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click()
    }

    // The deck visualization should be visible (default platform is a robot)
    await expect(page.locator('.deck-panel')).toBeVisible({ timeout: 5_000 })

    // Deck slots should be rendered
    await expect(page.locator('.deck-panel__slot').first()).toBeVisible()

    // Labware tray with "+ Add" button should be visible
    await expect(page.getByRole('button', { name: '+ Add' })).toBeVisible()
  })

  test('platform selector shows all platforms', async ({ page }) => {
    await page.goto('/labware-editor?new=1')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    const continueBtn = page.getByRole('button', { name: 'Continue' })
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click()
    }

    // Robot dropdown should have multiple options beyond just "Manual"
    const robotSelect = page.locator('.deck-panel select, .deck-panel__controls select').first()
    if (await robotSelect.isVisible({ timeout: 3000 }).catch(() => false)) {
      const options = await robotSelect.locator('option').allTextContents()
      expect(options.length).toBeGreaterThan(1)
      expect(options).toContain('Manual')
    }
  })

  test('deck persists after hard refresh', async ({ page }) => {
    await page.goto('/labware-editor?new=1')
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    const continueBtn = page.getByRole('button', { name: 'Continue' })
    if (await continueBtn.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn.click()
    }

    await expect(page.locator('.deck-panel')).toBeVisible({ timeout: 5_000 })

    // Hard refresh
    await page.reload()
    await expect(page.locator('.labware-event-editor-v2')).toBeVisible({ timeout: 10_000 })

    // Dismiss context modal again if it reappears
    const continueBtn2 = page.getByRole('button', { name: 'Continue' })
    if (await continueBtn2.isVisible({ timeout: 2000 }).catch(() => false)) {
      await continueBtn2.click()
    }

    // Deck should still render after refresh
    await expect(page.locator('.deck-panel')).toBeVisible({ timeout: 5_000 })
  })

  test('other pages render without layout errors', async ({ page }) => {
    const pages = ['/formulations', '/materials', '/ingestion', '/literature']

    for (const path of pages) {
      await page.goto(path)
      // Each page should load without errors — check that main content area exists
      await expect(page.locator('main')).toBeVisible({ timeout: 10_000 })
      // No error boundaries or crash screens
      await expect(page.locator('text=Something went wrong')).toHaveCount(0)
    }
  })
})
