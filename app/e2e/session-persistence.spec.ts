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
 *
 * The strip DOM is asserted on /splash, because /splash is the one workspace
 * surface that always mounts the shell. (The run workspace is separately
 * exercised by its own specs.)
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

  await deviceA.close()
  await deviceB.close()
})
