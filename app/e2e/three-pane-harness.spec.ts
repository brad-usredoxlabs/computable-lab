import { test, expect } from '@playwright/test'

/**
 * Three-pane agent harness (plan §9): nav | action | chat.
 *
 * On a run workspace that has a protocol with steps, the left navigation
 * rail lists the step CONCEPTS, the center is the deck (action), and the
 * right is the AI chat with a live "EDITING: Step N — <concept>" header.
 * Clicking a step in the nav rail must focus that step on the deck AND
 * update the chat header to the resolved step (never AI prose).
 */
test.describe('Three-pane agent harness', () => {
  // The CellROX run carries an approved protocol with steps (small fixture).
  const RUN_URL = '/runs/RUN-2026-09-07-run-nzrs'
  test.setTimeout(60_000)

  test('renders three panes: nav | action | chat', async ({ page }) => {
    await page.goto(RUN_URL)
    // Left nav rail present.
    await expect(page.locator('[data-testid="protocol-nav"]')).toBeVisible({ timeout: 15_000 })
    // Three-pane geometry.
    await expect(page.locator('.cl-workspace__pane--nav')).toBeVisible()
    await expect(page.locator('.cl-workspace__pane--action')).toBeVisible()
    await expect(page.locator('.cl-workspace__pane--chat')).toBeVisible()
  })

  test('nav rail lists the protocol step concepts', async ({ page }) => {
    await page.goto(RUN_URL)
    await expect(page.locator('[data-testid="protocol-nav-list"]')).toBeVisible({ timeout: 15_000 })
    // The CellROX protocol has grow/control/induce steps.
    await expect(page.locator('[data-testid="protocol-nav"]')).toContainText('Grow cells')
    const stepList = page.locator('[data-testid^="protocol-nav-step-"]')
    const count = await stepList.count()
    expect(count).toBeGreaterThanOrEqual(4)
  })

  test('clicking a step updates the live chat header (EDITING: Step N — concept)', async ({ page }) => {
    await page.goto(RUN_URL)
    // Open the AI tab so the chat header is mounted.
    const aiTab = page.locator('button', { hasText: /^AI$/ }).first()
    await expect(aiTab).toBeVisible({ timeout: 15_000 })
    await aiTab.click()
    await expect(page.locator('[data-testid="chat-context-header"]')).toBeVisible({ timeout: 10_000 })

    // Before focusing: the header says no step focused.
    await expect(page.locator('[data-testid="chat-context-header"]')).toContainText('No step focused')

    // Click a step in the nav rail.
    const steps = page.locator('[data-testid^="protocol-nav-step-"]')
    const first = steps.first()
    await first.click()

    // The header reflects the RESOLVED focused step — authoritative, not AI prose.
    await expect(page.locator('[data-testid="chat-context-header"]')).toContainText('EDITING', { timeout: 10_000 })
    await expect(page.locator('[data-testid="chat-context-header"]')).toContainText('Step 1')
  })

  test('two-pane surfaces are unaffected (deck still renders in the action pane)', async ({ page }) => {
    await page.goto(RUN_URL)
    await expect(page.locator('.cl-workspace__pane--action')).toBeVisible({ timeout: 15_000 })
    // The deck/bench renders in the action (center) pane.
    await expect(page.locator('.cl-workspace__pane--action')).toContainText(/Manual Bench|MANUAL BENCH|bench/i, { timeout: 10_000 })
  })
})