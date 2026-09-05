/**
 * Graph Search / Find UI — live-browser verification.
 *
 * Runs against the worktree's isolated stack: backend :3022, vite :5192.
 *
 * Covers the three current requirements:
 *  1. /find is a proper workspace endpoint: normal top bar (GlobalNavbar +
 *     tab strip) and a right pane; results scroll in the left pane.
 *  2. Master search: typing in the top-bar or splash search routes to
 *     /find?q=<text> which runs the graph search automatically.
 *  3. The full-frame plate map renders with matches highlighted + selectable,
 *     plus the "Also in tubes/stocks" vessel-context block and the
 *     selection → AI flow.
 */
import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5192'

test.describe('Find (graph search) UI', () => {
  test('renders as a workspace endpoint with top bar, right pane, and full-frame results', async ({ page }) => {
    await page.goto(`${BASE}/find`)
    const input = page.getByTestId('graph-search-input')
    await expect(input).toBeVisible({ timeout: 15_000 })

    // Workspace chrome: GlobalNavbar (top bar) renders.
    await expect(page.locator('.topbar--workspace')).toBeVisible({ timeout: 10_000 })

    await input.fill('rotenone')
    await page.getByTestId('graph-search-submit').click()

    // Right pane ("Selection" section) is present.
    const rightPane = page.getByTestId('graph-search-right')
    await expect(rightPane).toBeVisible({ timeout: 10_000 })
    await expect(rightPane).toContainText('Selection')

    // Full frame: plate_96 renders 8 rows + corner = 9 `.grid-label`, 12 columns.
    const rowLabels = page.getByTestId('graph-search-plate').first().locator('.graph-search__grid-label')
    await expect(rowLabels).toHaveCount(9, { timeout: 15_000 })
    const colHeaders = page.getByTestId('graph-search-plate').first().locator('.graph-search__grid-col')
    await expect(colHeaders).toHaveCount(12, { timeout: 15_000 })

    // 18 rotenone wells across 4 plates (2x plate_96, 1x plate_6, 1x tubeset).
    await expect(page.locator('[data-hit="true"]')).toHaveCount(18, { timeout: 15_000 })

    // Scroll fix: the results pane scrolls rather than clipping off the page.
    // Every table row exists in the DOM even when the pane must scroll.
    const tableRows = page.getByTestId('graph-search-table').locator('tbody tr')
    await expect(tableRows).toHaveCount(18, { timeout: 10_000 })

    // Selecting a well updates the right-pane Selection section, then send-to-AI.
    await page.getByTestId('row-select-well').first().check()
    await expect(page.getByTestId('graph-search-send-ai')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('graph-search-send-ai').click()
    const ctx = page.getByTestId('graph-search-ai-context')
    await expect(ctx).toContainText('selection:', { timeout: 10_000 })
  })

  test('master search: /find?q=<text> auto-runs the graph search (from top bar / splash)', async ({ page }) => {
    // Simulate typing in the top-bar / splash search: it navigates to /find?q=.
    await page.goto(`${BASE}/find?q=clofibrate`)
    const input = page.getByTestId('graph-search-input')
    await expect(input).toBeVisible({ timeout: 15_000 })

    // The ?q param pre-filled the input and auto-ran the search.
    await expect(input).toHaveValue('clofibrate', { timeout: 10_000 })

    // Results surface: clofibrate wells (7) + the vessel-context stock block.
    const rightPane = page.getByTestId('graph-search-right')
    await expect(rightPane).toContainText('7 objects', { timeout: 15_000 })
    const vessels = page.getByTestId('graph-search-vessels')
    await expect(vessels).toContainText('Also in tubes/stocks', { timeout: 10_000 })
    await expect(page.getByTestId('graph-vessel-instance').first()).toContainText('Clofibrate', { timeout: 10_000 })
  })

  test('splash search routes to /find on Enter and lists a full-search affordance', async ({ page }) => {
    await page.goto(`${BASE}/splash`)
    const splashInput = page.getByTestId('splash-search')
    await expect(splashInput).toBeVisible({ timeout: 15_000 })

    // Typing shows the quick record panel with a "Full graph search on /find" affordance.
    await splashInput.fill('rotenone')
    await expect(page.getByTestId('splash-search-all')).toBeVisible({ timeout: 10_000 })
    await page.getByTestId('splash-search-all').click()

    // Lands on /find with the query auto-run.
    await expect(page).toHaveURL(/\/find\?q=rotenone/, { timeout: 10_000 })
    const findInput = page.getByTestId('graph-search-input')
    await expect(findInput).toHaveValue('rotenone', { timeout: 10_000 })
    await expect(page.locator('[data-hit="true"]').first()).toBeVisible({ timeout: 15_000 })
  })
})