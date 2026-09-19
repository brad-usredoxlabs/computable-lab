import { test, expect, type APIRequestContext, type Page } from '@playwright/test'

/**
 * Regression gate for the project-workspace update loop.
 *
 * Symptom (user-reported): opening a project then "New Run" hung forever with
 * "Warning: Maximum update depth exceeded ... at WorkspaceShellHost
 * (ProjectWorkspacePage.tsx)".
 *
 * Cause: WorkspaceShellHost re-registered its project tab in an effect that
 * depended on the whole OpenTabs context object (new identity on every state
 * change), against a reducer whose 'navigate-active' action returned a NEW state
 * object even when the payload was identical — a self-feeding loop.
 *
 * This spec is deliberately NON-MUTATING: it asserts the project workspace
 * renders, the Create menu offers New Run, and no update-depth warning is
 * emitted. Run creation itself is not exercised here (it writes lab records).
 */
async function firstStudyId(request: APIRequestContext): Promise<string> {
  const res = await request.get('/api/records?kind=study&limit=1')
  const body = (await res.json()) as { records: Array<{ recordId: string }> }
  const id = body.records[0]?.recordId
  expect(id, 'a study record must exist to open a project workspace').toBeTruthy()
  return id!
}

/**
 * The persisted session is per-user SERVER state and a fresh browser context
 * adopts it on boot (tmux-style attach), which would navigate this spec to
 * whatever the developer left open. Start from a cleared session.
 */
async function resetSession(request: APIRequestContext) {
  const res = await request.put('/api/session', { data: { tabs: [], activeTabId: null } })
  expect(res.ok()).toBe(true)
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
  await resetSession(request)

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
  await resetSession(request)

  await page.goto(`/project/${studyId}`)
  await expect(page.locator('.workspace-tab--active')).toHaveCount(1, { timeout: 15_000 })
  await page.reload()
  await expect(page.locator('.workspace-tab--active')).toHaveCount(1, { timeout: 15_000 })
  await expect(page.locator('.workspace-tab')).toHaveCount(1, { timeout: 15_000 })

  await page.waitForTimeout(1_000)
  expect(errors.filter((e) => /Maximum update depth/.test(e))).toEqual([])
})
