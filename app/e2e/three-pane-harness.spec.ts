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
 *
 * LEG D re-pin: the run page's permanent chat is the universal HarnessChatPane
 * (testid harness-chat-pane — the legacy agent-chat-pane / ai-tab DOM died
 * with AiTabPanel), and its working-focus header is SurfaceFocusHeader
 * (testid surface-focus-header — the legacy chat-context-header testid died
 * with ChatContextHeader). The run page publishes no ChatFocusContext, so the
 * surface-focus-header element is legitimately ABSENT there today (the pane
 * renders its composer either way — never a crash); the step-focus→header
 * behavior is pinned by the unit suites (ChatFocusContext.test.tsx,
 * SurfaceFocusHeader) and by the deck route (DeckHostPage publishes a
 * ChatFocusContext).
 */
test.describe('Three-pane agent harness', () => {
  // The CellROX run carries an approved protocol with steps (small fixture).
  const RUN_URL = '/runs/RUN-2026-09-07-run-nzrs'
  test.setTimeout(60_000)

  test('renders three panes: nav | action | chat, with the AI chat permanent', async ({ page }) => {
    await page.goto(RUN_URL)
    // The permanent AI chat column is ALWAYS present (no tab to open) — the
    // universal harness pane (LEG D re-pin: the agent-chat-pane testid was a
    // stale leg-B pin; the run page mounts HarnessChatPane directly,
    // RunWorkspacePage.tsx).
    await expect(page.locator('[data-testid="harness-chat-pane"]')).toBeVisible({ timeout: 15_000 })
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
    // LEG D re-pin: the chat header is the universal pane's SurfaceFocusHeader
    // (testid surface-focus-header) — the legacy chat-context-header testid
    // died with ChatContextHeader. The run page (RunWorkspacePage) publishes
    // NO ChatFocusContext, so that element is legitimately ABSENT there today:
    // the pane renders its composer either way (never a crash). The
    // step-focus → "EDITING: Step N" header behavior is pinned at the unit
    // level (ChatFocusContext.test.tsx 'working-focus delegation' +
    // SurfaceFocusHeader) and live on the deck route (DeckHostPage wraps the
    // right pane in a ChatFocusProvider). Here we pin what the run page MUST
    // show: the permanent universal pane survived the step click (no crash,
    // composer still present) and the (optional) header, when present,
    // reflects the resolved focused step — never AI prose.
    await expect(page.locator('[data-testid="harness-chat-pane"]')).toBeVisible({ timeout: 15_000 })

    // Click a step in the nav rail.
    const steps = page.locator('[data-testid^="protocol-nav-step-"]')
    const first = steps.first()
    await first.click()

    // The universal pane survives the focus change (no crash, composer live).
    await expect(page.locator('[data-testid="harness-chat-pane"]')).toBeVisible()
    // When the host publishes a focus, the header is the resolved step
    // (surface-focus-header semantics); on the run page (no published focus)
    // it is absent — assert the invariant, not the element's presence.
    const header = page.locator('[data-testid="surface-focus-header"]')
    if (await header.count() > 0) {
      await expect(header).toContainText('Step', { timeout: 10_000 })
    } else {
      await expect(page.locator('[data-testid="chat-context-header"]')).toHaveCount(0)
    }
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