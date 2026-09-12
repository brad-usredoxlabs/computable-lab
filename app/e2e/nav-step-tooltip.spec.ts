import { test, expect } from '@playwright/test'

/**
 * Step tooltips in the three-pane agent harness nav rail.
 *
 * Hovering (or focusing) a step concept in the left nav rail must show a
 * tooltip with the FULL step text (its description), and it must hide on
 * leave. This is the "read the whole step without opening it" affordance.
 */
test.describe('Protocol nav step tooltips', () => {
  const RUN_URL = '/runs/RUN-2026-09-07-run-nzrs'
  test.setTimeout(60_000)

  test('shows the full step text on hover and hides on mouse-out', async ({ page }) => {
    await page.goto(RUN_URL)
    const step = page.locator('[data-testid="protocol-nav-step-step-1"]')
    await expect(step).toBeVisible({ timeout: 15_000 })
    const tip = page.locator('[data-testid="protocol-nav-tooltip"]')

    // Not visible before hover.
    await expect(tip).not.toBeVisible()

    // Hover → tooltip shows the full description text.
    await step.hover()
    await expect(tip).toBeVisible({ timeout: 5_000 })
    await expect(tip).toContainText('Grow cells to sub-confluency')

    // Move away → tooltip hides.
    await page.locator('.cl-workspace__pane--action').hover()
    await expect(tip).not.toBeVisible({ timeout: 5_000 })
  })

  test('shows a tooltip on keyboard focus (accessibility)', async ({ page }) => {
    await page.goto(RUN_URL)
    const step = page.locator('[data-testid="protocol-nav-step-step-3"]')
    await expect(step).toBeVisible({ timeout: 15_000 })
    const tip = page.locator('[data-testid="protocol-nav-tooltip"]')

    await step.focus()
    await expect(tip).toBeVisible({ timeout: 5_000 })
    await expect(tip).toContainText('Induce ROS')
  })
})