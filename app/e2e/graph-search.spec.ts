/**
 * Graph Search / Find UI — live-browser verification.
 *
 * Drives the real user workflow in the running app: search "rotenone" in the
 * Find panel → a plate view renders with the 6 treated wells (A1,A2,A3,B1,B2,
 * C3) highlighted → rows render in the table → selecting rows toggles.
 *
 * Run against the worktree's isolated stack (see README in dev notes):
 *   backend on :3009, vite on :5188 (proxies /api → :3009).
 */
import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5188'

test.describe('Find (graph search) UI', () => {
  test('searches rotenone wells, renders plate highlight + table, and selects', async ({ page }) => {
    await page.goto(`${BASE}/find`)
    // The Find page mounts with a search box.
    const input = page.getByTestId('graph-search-input')
    await expect(input).toBeVisible({ timeout: 15_000 })

    // Type a material and submit via the form.
    await input.fill('rotenone')
    await page.getByTestId('graph-search-submit').click()

    // Summary shows the result count (6 wells).
    const summary = page.getByTestId('graph-search-summary')
    await expect(summary).toBeVisible({ timeout: 15_000 })
    await expect(summary).toContainText('6 objects')

    // Plate grid renders; the 6 hit cells are marked data-hit="true".
    const hitCells = page.locator('[data-hit="true"]')
    await expect(hitCells).toHaveCount(6, { timeout: 15_000 })

    // Table renders the 6 well rows.
    const tableRows = page.getByTestId('graph-search-table').locator('tbody tr')
    await expect(tableRows).toHaveCount(6, { timeout: 15_000 })

    // Selecting a well via its checkbox updates the selection count in summary.
    const firstCheckbox = page.getByTestId('row-select-well').first()
    await firstCheckbox.check()
    await expect(summary).toContainText('1 selected', { timeout: 10_000 })

    // Toggling the plate cell also works (click B2 cell → selected attr).
    const b2 = page.locator('[data-well="B2"]').first()
    await b2.click()
    await expect(b2).toHaveAttribute('data-selected', 'true', { timeout: 10_000 })
  })
})