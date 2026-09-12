import { test, expect } from '@playwright/test'

/**
 * Three-pane agent harness (plan §9): nav | action | chat.
 *
 * On a run workspace that has a protocol with steps, the left navigation
 * column hosts the step-CONCEPT rail plus a tab strip (Protocol | Search |
 * Details), the center is the deck (action), and the right is a PERMANENT AI
 * chat with a live "EDITING: Step N — <concept>" header (no tab strip).
 * Clicking a step in the nav rail must focus that step on the deck AND
 * update the chat header to the resolved step (never AI prose).
 */
test.describe('Three-pane agent harness', () => {
  // The CellROX run carries an approved protocol with steps (small fixture).
  const RUN_URL = '/runs/RUN-2026-09-07-run-nzrs'
  test.setTimeout(60_000)

  test('renders three panes: nav | action | chat, with the AI chat permanent', async ({ page }) => {
    await page.goto(RUN_URL)
    // The permanent AI chat column is ALWAYS present (no tab to open).
    await expect(page.locator('[data-testid="agent-chat-pane"]')).toBeVisible({ timeout: 15_000 })
    // Left nav rail present + the new tab strip.
    await expect(page.locator('[data-testid="protocol-nav"]')).toBeVisible()
    await expect(page.locator('[data-testid="run-nav-tab-protocol"]')).toBeVisible()
    await expect(page.locator('[data-testid="run-nav-tab-search"]')).toBeVisible()
    await expect(page.locator('[data-testid="run-nav-tab-details"]')).toBeVisible()
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

  test('left nav tabs switch between Protocol, Search, and Details', async ({ page }) => {
    await page.goto(RUN_URL)
    // Protocol is the default tab.
    await expect(page.locator('[data-testid="run-nav-tab-protocol"]')).toHaveAttribute('aria-selected', 'true', { timeout: 15_000 })
    // Switch to Search.
    await page.locator('[data-testid="run-nav-tab-search"]').click()
    await expect(page.locator('[data-testid="run-nav-tab-search"]')).toHaveAttribute('aria-selected', 'true')
    // Switch to Details.
    await page.locator('[data-testid="run-nav-tab-details"]').click()
    await expect(page.locator('[data-testid="run-nav-tab-details"]')).toHaveAttribute('aria-selected', 'true')
  })

  test('clicking a step updates the live chat header (EDITING: Step N — concept)', async ({ page }) => {
    await page.goto(RUN_URL)
    // The chat header is mounted permanently (not behind an AI tab).
    await expect(page.locator('[data-testid="chat-context-header"]')).toBeVisible({ timeout: 15_000 })

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

  test('deck still renders in the action pane', async ({ page }) => {
    await page.goto(RUN_URL)
    await expect(page.locator('.cl-workspace__pane--action')).toBeVisible({ timeout: 15_000 })
    // The deck/bench renders in the action (center) pane. Accepts both the
    // single-plate slot view ("Manual PLATE") and the freeform bench view
    // ("Manual Bench (freeform)") — the point is the deck is present, not a
    // specific variant label.
    const deckText = /PLATE|Manual Bench|MANUAL BENCH|Click to choose labware/i
    await expect(page.locator('.cl-workspace__pane--action')).toContainText(deckText, { timeout: 10_000 })
  })
})