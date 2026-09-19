import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * tmux-style session persistence (plan 2026-09-19_092150).
 *
 * Drives the REAL app against the REAL backend: no API mocking. Tab state is
 * seeded straight into localStorage (hermetic about WHICH tabs are open) using
 * real run ids, so nothing depends on fixture records.
 *
 * Behaviors this file locks down:
 *  1. a full page load must keep every open tab (the provider's pre-hydration
 *     persist effect used to wipe the stored session on EVERY load)
 *  2. a full page load at "/" must resume the ACTIVE tab's route
 *     (HomeRedirect used to read the not-yet-hydrated store → /splash)
 *  3. a third device attaches to the same session (tmux-style)
 *  4. the project workspace mounts without an update-depth loop (below)
 *  5. a protocol-less run offers ATTACH in the left nav Protocol tab (below)
 *  6. that rail's search + Ingested-PDF rows behave (folded in from
 *     protocol-selector-search.spec.ts: another spec that reads/writes the same
 *     per-user session cannot run in parallel with this one, and the session is
 *     SERVER state — one file is the only honest way to keep them ordered)
 *
 * The strip DOM is asserted on /splash, because /splash is the one workspace
 * surface that always mounts the shell. (The run workspace is separately
 * exercised by its own specs.)
 *
 * These tests are SERIAL and share one file: the persisted session is per-user
 * SERVER state, so specs running in parallel adopt each other's sessions.
 */
const KEY = 'cl-open-tabs'

// The session lives on the SERVER, per user — so these tests must not run in
// parallel with each other (they would adopt each other's pushed session).
// Each test resets the server session before seeding its own.
test.describe.configure({ mode: 'serial' })

interface RunSummary {
  recordId: string
  title: string
}

const runTab = (runId: string, title: string) => ({
  tab: { id: `run:${runId}`, kind: 'run', runId, title },
  activeRightPaneMode: 'protocol',
  breadcrumb: [],
  contentHistory: [{ id: `run:${runId}`, kind: 'run', runId, title }],
  contentCursor: 0,
})

/** Three real run ids, newest first, from the running appliance. */
async function realRunIds(request: APIRequestContext): Promise<RunSummary[]> {
  const res = await request.get('/api/runs?limit=3')
  const body = (await res.json()) as { runs: RunSummary[] }
  return body.runs.slice(0, 3)
}

const seed = (runs: RunSummary[], activeIndex = 0) => ({
  tabs: runs.map((r) => runTab(r.recordId, r.title)),
  activeTabId: `run:${runs[activeIndex]!.recordId}`,
  history: runs.map((r) => `run:${r.recordId}`),
  historyCursor: activeIndex,
})

async function seedTabs(page: Page, state: unknown) {
  await page.addInitScript(
    ([key, value]) => window.localStorage.setItem(key!, JSON.stringify(value)),
    [KEY, state] as const,
  )
}

/**
 * Deterministic baseline: clear the persisted server session so a previous run
 * (or the developer's own attached session) cannot be adopted over the state
 * this spec seeds. The PUT resolves the same user the browser resolves.
 */
async function resetServerSession(request: APIRequestContext) {
  const res = await request.put('/api/session', { data: { tabs: [], activeTabId: null } })
  expect(res.ok()).toBe(true)
}

const storedTabCount = (page: Page) =>
  page.evaluate((key) => {
    const raw = window.localStorage.getItem(key)
    return raw ? (JSON.parse(raw).tabs as unknown[]).length : 0
  }, KEY)

test('a full page load at "/" resumes the active tab route and keeps every tab', async ({ page, request }) => {
  const runs = await realRunIds(request)
  expect(runs.length).toBe(3)
  await resetServerSession(request)

  await seedTabs(page, seed(runs, 1)) // the second run is active
  await page.goto('/')

  // (1) the active tab's route is restored instead of /splash
  await expect(page).toHaveURL(new RegExp(`/runs/${runs[1]!.recordId}$`), { timeout: 15_000 })
  // (2) storage was not clobbered by the pre-hydration empty state
  expect(await storedTabCount(page)).toBe(3)
})

test('a reload keeps all tabs in the strip and the active one', async ({ page, request }) => {
  const runs = await realRunIds(request)
  await resetServerSession(request)
  await seedTabs(page, seed(runs, 2))

  await page.goto('/splash')
  await expect(page.locator('.workspace-tab')).toHaveCount(3, { timeout: 15_000 })

  await page.reload()
  await expect(page.locator('.workspace-tab')).toHaveCount(3, { timeout: 15_000 })
  expect(await storedTabCount(page)).toBe(3)
  // the active tab is still the third one
  const stored = await page.evaluate((key) => JSON.parse(window.localStorage.getItem(key)!), KEY)
  expect(stored.activeTabId).toBe(`run:${runs[2]!.recordId}`)
})

test('a second device (fresh context, no localStorage) attaches to the same session', async ({ browser, request }) => {
  const runs = await realRunIds(request)
  await resetServerSession(request)

  // Device A: seed three open run tabs and let the debounced PUT land.
  const deviceA = await browser.newContext()
  const pageA = await deviceA.newPage()
  await pageA.goto(`/splash`)
  await pageA.evaluate(
    ([key, value]) => window.localStorage.setItem(key!, JSON.stringify(value)),
    [KEY, seed(runs, 1)] as const,
  )
  await pageA.goto(`/splash`)
  await expect(pageA.locator('.workspace-tab')).toHaveCount(3, { timeout: 15_000 })
  await pageA.waitForTimeout(1_500)

  // Device B: same server, empty localStorage.
  const deviceB = await browser.newContext()
  const pageB = await deviceB.newPage()
  await pageB.goto('/')
  await expect(pageB.locator('.workspace-tab')).toHaveCount(3, { timeout: 15_000 })
  await expect(pageB).toHaveURL(new RegExp(`/runs/${runs[1]!.recordId}$`), { timeout: 15_000 })

  // Devices must be closed BEFORE the reset: an attached device re-pushes the
  // session it adopted, which would immediately overwrite the empty baseline.
  // Do not leave synthetic tabs attached to the real user.
  await deviceA.close()
  await deviceB.close()
  await resetServerSession(request)
})

/**
 * --- project-workspace update-depth loop (same file, same reason) ---
 *
 * Symptom (user-reported): opening a project then "New Run" hung forever with
 * "Warning: Maximum update depth exceeded ... at WorkspaceShellHost
 * (ProjectWorkspacePage.tsx)". These tests live HERE because they need the same
 * per-user server session cleared, and the session is shared process-wide: two
 * files running in parallel adopt each other's sessions.
 */
async function firstStudyId(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/records?kind=study&limit=1')
  const body = (await res.json()) as { records: Array<{ recordId: string }> }
  const id = body.records[0]?.recordId
  expect(id, 'a study record must exist to open a project workspace').toBeTruthy()
  return id!
}

function collectErrors(page: Page): string[] {
  const errors: string[] = []
  page.on('console', (msg) => {
    if (msg.type() === 'error') errors.push(msg.text())
  })
  page.on('pageerror', (err) => errors.push(String(err)))
  return errors
}

test('opening a project renders its workspace with no update-depth loop', async ({ page, request }) => {
  const errors = collectErrors(page)
  const studyId = await firstStudyId(request)
  await resetServerSession(request)

  await page.goto(`/project/${studyId}`)

  // The workspace mounted: the shell, its tab strip, and one active project tab.
  // (The tab label is the study TITLE once it resolves, so assert the shape, not
  // the id text.)
  await expect(page.getByTestId('workspace-tab-strip')).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.workspace-tab--active')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('.workspace-tab--active')).toHaveClass(/workspace-tab--project/, {
    timeout: 15_000,
  })

  // The Create affordance offers New Run (the flow the user was trying).
  await page.getByRole('button', { name: '+ Create' }).click()
  await expect(page.getByTestId('create-menu-new-run')).toBeVisible({ timeout: 5_000 })

  // Let any runaway effect reveal itself before asserting.
  await page.waitForTimeout(1_000)
  expect(errors.filter((e) => /Maximum update depth/.test(e))).toEqual([])
})

test('re-opening the same project does not loop either (idempotent re-registration)', async ({ page, request }) => {
  const errors = collectErrors(page)
  const studyId = await firstStudyId(request)
  await resetServerSession(request)

  await page.goto(`/project/${studyId}`)
  await expect(page.locator('.workspace-tab--active')).toHaveCount(1, { timeout: 15_000 })
  await page.reload()
  await expect(page.locator('.workspace-tab--active')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('.workspace-tab')).toHaveCount(1, { timeout: 15_000 })

  await page.waitForTimeout(1_000)
  expect(errors.filter((e) => /Maximum update depth/.test(e))).toEqual([])
})

/**
 * --- left nav Protocol tab: attach affordance ---
 *
 * User report: "in the left hand pane, there is a protocol tab, but no way to
 * attach a protocol." The rail's empty state was a dead end because the only
 * mount of the protocol picker lived in the right-pane ProtocolTabPanel, which
 * the three-pane harness no longer renders. NON-MUTATING: it asserts the
 * affordance and never clicks Attach (that writes a planned run + method graph).
 */
async function firstRunWithoutProtocol(request: APIRequestContext): Promise<string> {
  const list = await request.get('/api/runs?limit=8')
  const runs = ((await list.json()) as { runs: Array<{ recordId: string }> }).runs
  for (const run of runs) {
    const res = await request.get(`/api/records/${run.recordId}`)
    if (!res.ok()) continue
    const body = (await res.json()) as { record?: { payload?: Record<string, unknown> } }
    const payload = body.record?.payload ?? {}
    if (!payload.plannedRunRef && !payload.methodEventGraphId) return run.recordId
  }
  throw new Error('no protocol-less run found to assert the attach affordance')
}

test('a protocol-less run offers attach in the left nav Protocol tab', async ({ page, request }) => {
  const runId = await firstRunWithoutProtocol(request)
  await resetServerSession(request)

  await page.goto(`/runs/${runId}`)

  const nav = page.getByTestId('run-nav-pane')
  await expect(nav).toBeVisible({ timeout: 20_000 })
  await expect(nav.getByTestId('run-nav-tab-protocol')).toHaveAttribute('aria-selected', 'true')

  // the find-&-attach surface, not a dead end
  await expect(nav.getByTestId('attach-protocol')).toBeVisible({ timeout: 15_000 })
  await expect(nav.getByTestId('protocol-search-input')).toBeVisible()
  await expect(nav.getByText(/Attach a protocol to see its steps/i)).toHaveCount(0)
  // at least one attachable protocol (this lab has several) — the commit control
  await expect(nav.locator('[data-testid^="attach-"]').first()).toBeVisible({ timeout: 15_000 })
})

/**
 * --- protocol review is a TAB (plan 2026-09-19_121028, phase 1) ---
 *
 * User report: the vendor-PDF review surface "totally replaces the current run
 * surface and disappears the tab system". It now renders inside the workspace
 * shell with the tab strip, and is reachable as a `protocol-review` tab.
 * NON-MUTATING: it never clicks Save.
 */
async function firstVendorPdfId(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/records?kind=vendor-pdf&limit=1')
  const body = (await res.json()) as { records: Array<{ recordId: string }> }
  const id = body.records?.[0]?.recordId
  expect(id, 'a vendor-pdf record must exist to open the review surface').toBeTruthy()
  return id!
}

test('a vendor-PDF deep link renders the review surface inside the shell with a tab', async ({ page, request }) => {
  const recordId = await firstVendorPdfId(request)
  await resetServerSession(request)

  await page.goto(`/ingestion/vendor-pdf/${recordId}`)

  await expect(page.getByTestId('workspace-tab-strip')).toBeVisible({ timeout: 20_000 })
  await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.workspace-tab')).toHaveCount(1)
  // the tab carries the protocol-review kind in its testid
  await expect(page.locator(`[data-testid="workspace-tab-protocol-review:${recordId}"]`)).toBeVisible()

  // a refresh keeps it (the tab store restored the session, not a page reload)
  await page.reload()
  await expect(page.getByTestId('workspace-tab-strip')).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('.workspace-tab')).toHaveCount(1)
})

/** First run in the store with no attached method (no PLR / method graph). */
async function firstRunWithoutMethod(request: APIRequestContext): Promise<string> {
  const list = await request.get('/api/runs?limit=10')
  const runs = ((await list.json()) as { runs: Array<{ recordId: string }> }).runs
  for (const run of runs) {
    const res = await request.get(`/api/records/${run.recordId}`)
    if (!res.ok()) continue
    const body = (await res.json()) as { record?: { payload?: Record<string, unknown> } }
    const payload = body.record?.payload ?? {}
    if (!payload.plannedRunRef && !payload.methodEventGraphId) return run.recordId
  }
  throw new Error('no protocol-less run found for the attach surface spec')
}

test.describe('Run Protocol tab search + Ingested PDFs', () => {

  test('search box + Ingested PDFs group render in the Protocol selector', async ({ page, request }) => {
    await page.goto(`/runs/${await firstRunWithoutMethod(request)}`)

    // Protocol selector shows the search input.
    await expect(page.getByTestId('protocol-search-input')).toBeVisible({ timeout: 15000 })

    // Ingested PDFs group is present (server returns all vendor-pdfs with no q).
    await expect(
      page.locator('div[style]', { hasText: /^Ingested PDFs$/ }).first(),
    ).toBeVisible({ timeout: 15000 })
  })

  test('searching cellrox filters to the CellROX PDF and protocols', async ({ page, request }) => {
    await page.goto(`/runs/${await firstRunWithoutMethod(request)}`)
    await expect(page.getByTestId('protocol-search-input')).toBeVisible({ timeout: 15000 })

    // Type a query; the server re-fetches with ?q=cellrox (debounced).
    await page.getByTestId('protocol-search-input').fill('cellrox')

    // The CellROX ingested PDF appears with an Open action, NOT attach.
    await expect(page.getByTestId('open-pdf-VPDF-651F03789D80')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('attach-VPDF-651F03789D80')).toHaveCount(0)

    // CellROX-titled APPROVED protocols appear and ARE attachable. (Draft
    // extraction candidates like CAN-protocol-* are hidden — run tab is
    // approved-only.)
    await expect(page.getByTestId('attach-PRT-g5zy9e')).toBeVisible({ timeout: 15000 })
  })

  test('approved universal protocols are attachable even before their steps are localized', async ({ page, request }) => {
    // Regression: gating the attach list on step-localization hid the approved
    // CellROX universal, leaving only its vendor PDF's "Open" row. Localization
    // happens in the event editor AFTER attach, so approved protocols must
    // still show "Attach to run".
    await page.goto(`/runs/${await firstRunWithoutMethod(request)}`)
    await expect(page.getByTestId('protocol-search-input')).toBeVisible({ timeout: 15000 })

    // The approved CellROX assay (PRT-g5zy9e) shows an Attach button, not Open.
    await expect(page.getByTestId('attach-PRT-g5zy9e')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('open-pdf-PRT-g5zy9e')).toHaveCount(0)
  })

  test('Open on an ingested PDF routes to the review surface', async ({ page, request }) => {
    await page.goto(`/runs/${await firstRunWithoutMethod(request)}`)
    await expect(page.getByTestId('protocol-search-input')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('protocol-search-input').fill('cellrox')
    await expect(page.getByTestId('open-pdf-VPDF-651F03789D80')).toBeVisible({ timeout: 15000 })

    await page.getByTestId('open-pdf-VPDF-651F03789D80').click()
    await expect(page).toHaveURL(/\/ingestion\/vendor-pdf\/VPDF-651F03789D80/)
    await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 15000 })
  })
})
