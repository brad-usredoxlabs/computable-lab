import { test, expect } from '@playwright/test'

test.describe('AI Panel Always Visible', () => {
  test.beforeEach(async ({ page }) => {
    // Clear localStorage to start with collapsed state
    await page.goto('/browser')
    await page.evaluate(() => localStorage.removeItem('ai-panel-open'))
    await page.reload()
  })

  test('collapsed bar visible on load', async ({ page }) => {
    const bar = page.locator('.ai-panel-collapsed-bar')
    await expect(bar).toBeVisible()
    await expect(bar).toContainText('AI Assistant')
    // Chevron icon present
    await expect(bar.locator('.ai-panel-collapsed-bar__chevron')).toBeVisible()

    // Should be at the bottom of the viewport
    const box = await bar.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).toBeTruthy()
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
  })

  test('expand by clicking collapsed bar', async ({ page }) => {
    const bar = page.locator('.ai-panel-collapsed-bar')
    await bar.click()

    // Collapsed bar should be gone, expanded panel visible
    await expect(bar).not.toBeVisible()
    const panel = page.locator('.ai-chat-panel')
    await expect(panel).toBeVisible()

    // Check approximate height (35vh default)
    const box = await panel.boundingBox()
    const viewport = page.viewportSize()!
    const expectedHeight = viewport.height * 0.35
    expect(box!.height).toBeGreaterThan(expectedHeight * 0.7)
    expect(box!.height).toBeLessThan(expectedHeight * 1.3)
  })

  test('collapse by clicking chevron', async ({ page }) => {
    // Expand first
    await page.locator('.ai-panel-collapsed-bar').click()
    await expect(page.locator('.ai-chat-panel')).toBeVisible()

    // Click collapse button
    await page.locator('.ai-chat-panel__collapse-btn').click()

    // Should show collapsed bar again
    await expect(page.locator('.ai-panel-collapsed-bar')).toBeVisible()
    await expect(page.locator('.ai-chat-panel')).not.toBeVisible()
  })

  test('panel visible on all pages', async ({ page }) => {
    const pages = ['/labware-editor?new=1', '/settings', '/browser']

    for (const url of pages) {
      await page.goto(url, { waitUntil: 'networkidle' })
      // Either collapsed bar or expanded panel should be visible
      const aiElement = page.locator('.ai-panel-collapsed-bar, .ai-chat-panel')
      await expect(aiElement.first()).toBeVisible({ timeout: 5000 })
    }
  })

  test('panel persists across navigation', async ({ page }) => {
    // Expand panel
    await page.locator('.ai-panel-collapsed-bar').click()
    await expect(page.locator('.ai-chat-panel')).toBeVisible()

    // Navigate to settings
    await page.locator('.nav-link', { hasText: 'Settings' }).click()
    await expect(page).toHaveURL('/settings')

    // Panel should still be expanded
    await expect(page.locator('.ai-chat-panel')).toBeVisible()
  })

  test('panel within viewport', async ({ page }) => {
    // Expand panel
    await page.locator('.ai-panel-collapsed-bar').click()
    const panel = page.locator('.ai-chat-panel')
    await expect(panel).toBeVisible()

    const box = await panel.boundingBox()
    const viewport = page.viewportSize()!
    expect(box).toBeTruthy()
    // Bottom of panel should be within viewport
    expect(box!.y + box!.height).toBeLessThanOrEqual(viewport.height + 1)
  })

  test('main content scrolls independently', async ({ page }) => {
    // Expand panel
    await page.locator('.ai-panel-collapsed-bar').click()
    const panel = page.locator('.ai-chat-panel')
    await expect(panel).toBeVisible()

    const panelBoxBefore = await panel.boundingBox()

    // Scroll main content area
    await page.locator('.main-content-area').evaluate((el) => {
      el.scrollTop = 200
    })

    const panelBoxAfter = await panel.boundingBox()
    // Panel position should not change
    expect(panelBoxAfter!.y).toBe(panelBoxBefore!.y)
  })

  test('open state persists after refresh', async ({ page }) => {
    // Expand panel
    await page.locator('.ai-panel-collapsed-bar').click()
    await expect(page.locator('.ai-chat-panel')).toBeVisible()

    // Reload
    await page.reload()
    await expect(page.locator('.ai-chat-panel')).toBeVisible()

    // Collapse
    await page.locator('.ai-chat-panel__collapse-btn').click()
    await expect(page.locator('.ai-panel-collapsed-bar')).toBeVisible()

    // Reload
    await page.reload()
    await expect(page.locator('.ai-panel-collapsed-bar')).toBeVisible()
    await expect(page.locator('.ai-chat-panel')).not.toBeVisible()
  })
})
