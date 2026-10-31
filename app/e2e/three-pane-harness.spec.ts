import { test, expect } from '@playwright/test'

// Escape a step label before embedding it in a RegExp (the rail's labels are
// data — e.g. "Grow cells" — and must not be interpreted as regex syntax).
function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

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
    // LEG E / E-α (advc-ratified §10 OQ-E1): the run page PUBLISHES its
    // working focus (RunSurfaceChatBridge, deck precedent DeckSurfaceChat
    // .tsx:207-216) into the ChatFocusProvider that wraps the pane subtree,
    // so the universal pane's SurfaceFocusHeader (testid surface-focus-
    // header) now RENDERS on the run chat — restoring the "what are we
    // looking at" header LEG D's ChatContextHeader deletion removed. Before
    // the step click the header carries the run label (no focused step);
    // clicking a nav-rail step focuses it (ProtocolSelectionContext.
    // focusedStep — the same truth the deleted ChatContextHeader read) and
    // the header's detail becomes "Step <ordinal>: <label>". The dead legacy
    // chat-context-header testid stays absent (it died with ChatContextHeader).
    await expect(page.locator('[data-testid="harness-chat-pane"]')).toBeVisible({ timeout: 15_000 })

    // The nav rail resolves the protocol steps asynchronously (RunProtocolStepsLoader
    // fetch) — wait for the list before driving a step (the sibling 'nav rail
    // lists the protocol step concepts' test uses the same wait).
    await expect(page.locator('[data-testid="protocol-nav-list"]')).toBeVisible({ timeout: 15_000 })

    // LEG E / E-α (the run page PUBLISHES the working focus now — deck
    // precedent; RED receipt at :5196 before this re-pin: the header
    // resolved to 1 element and this absence pin went red). The run's
    // published label is the run id (the pane's header, not a crash).
    const focusHeader = page.locator('[data-testid="surface-focus-header"]')
    await expect(focusHeader).toHaveCount(1)
    await expect(focusHeader).toContainText('Working focus')
    await expect(focusHeader).toContainText('RUN-2026-09-07-run-nzrs')

    // Click a step in the nav rail. The rail starts with NO focused step
    // (ProtocolSelectionContext initial focusedStep = null), so the first
    // click is unambiguously a FOCUS, not a toggle-off.
    const steps = page.locator('[data-testid^="protocol-nav-step-"]')
    const first = steps.first()
    await expect(first).toBeVisible()
    await expect(first).toHaveAttribute('aria-pressed', 'false')
    await first.click()

    // The clicked step is now the focused step — the header's detail
    // (SurfaceFocusHeader's `title` attribute; the visible value stays the
    // run label) carries it via the E-α publish, derived from the same
    // focused-step truth the rail wrote: "Step <ordinal>: <label>".
    await expect(first).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })
    const headerValue = page.locator('[data-testid="surface-focus-header"] .surface-focus-header__value')
    await expect(headerValue).toHaveAttribute('title', /Step \d+: /, { timeout: 10_000 })
    const stepLabel = (await first.textContent())?.replace(/^\d+\s*/, '').trim() ?? ''
    // D8 (fix1, c1 review): the conditional assertion is killed — an empty
    // label is itself a defect (the header title is derived from it), so
    // assert non-empty FIRST; the title check below then ALWAYS runs (the
    // `if (stepLabel)` guard could previously skip it silently).
    expect(stepLabel, 'nav-rail step label must be non-empty (the header title derives from it)').not.toHaveLength(0)
    await expect(headerValue).toHaveAttribute('title', new RegExp(escapeRegExp(stepLabel)))

    // The universal pane survives the focus change: no crash, composer live
    // (ChatLog's Message textarea + Send button).
    await expect(page.locator('[data-testid="harness-chat-pane"]')).toBeVisible()
    await expect(
      page.locator('[data-testid="harness-chat-pane"]').getByLabel('Message', { exact: true }),
    ).toBeVisible()
    await expect(
      page.locator('[data-testid="harness-chat-pane"]').getByRole('button', { name: 'Send', exact: true }),
    ).toBeVisible()

    // R2 (fix1, c1 review): the chat-context-header ABSENCE guard that
    // 19be927f deleted is restored — same intent, no reintroduced product
    // behavior. It has teeth: it fails if the legacy ChatContextHeader is
    // ever resurrected (which E-α must never do — the run header is the
    // universal SurfaceFocusHeader). An absence assertion is not a "site"
    // of the dead testid; keeping it is consistent with the post-E-α
    // zero-assertion-sites invariant (this IS the absence pin).
    await expect(page.getByTestId('chat-context-header')).toHaveCount(0)
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