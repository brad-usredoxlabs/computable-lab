/**
 * Graph Search / Find UI — live-browser verification (full-frame plate map).
 *
 * Runs against the worktree's isolated stack:
 *   backend :3022, vite :5192 (proxies /api → :3022).
 */
import { test, expect } from '@playwright/test'

const BASE = process.env.PLAYWRIGHT_BASE_URL || 'http://localhost:5192'

test.describe('Find (graph search) UI', () => {
  test('searches rotenone wells, renders the FULL format frames with matches highlighted, and selects', async ({ page }) => {
    await page.goto(`${BASE}/find`)
    const input = page.getByTestId('graph-search-input')
    await expect(input).toBeVisible({ timeout: 15_000 })

    await input.fill('rotenone')
    await page.getByTestId('graph-search-submit').click()

    const summary = page.getByTestId('graph-search-summary')
    await expect(summary).toBeVisible({ timeout: 15_000 })
    // 4 rotenone graphs: 2x plate_96 (6 each) + plate_6 (3) + tubeset_6x15ml (3) = 18.
    await expect(summary).toContainText('18 objects', { timeout: 15_000 })

    // Full-frame: a plate_96 renders 8 row rows (A..H). `.grid-label` count =
    // the corner cell + 8 row labels = 9. No longer truncated to touched rows.
    const rowLabels = page.getByTestId('graph-search-plate').first().locator('.graph-search__grid-label')
    await expect(rowLabels).toHaveCount(9, { timeout: 15_000 })

    // Column headers run 1..12 (full 96-well width).
    const colHeaders = page.getByTestId('graph-search-plate').first().locator('.graph-search__grid-col')
    await expect(colHeaders).toHaveCount(12, { timeout: 15_000 })

    // All 18 hit cells across the four plates.
    const hitCells = page.locator('[data-hit="true"]')
    await expect(hitCells).toHaveCount(18, { timeout: 15_000 })

    // Multiple plates render (96, 6, tubeset).
    const plateCount = await page.getByTestId('graph-search-plate').count()
    expect(plateCount).toBeGreaterThanOrEqual(3)

    // Non-match cells exist (full frame has cells that are NOT hits) and are labeled.
    const emptyCells = page.locator('[data-hit="false"]')
    expect(await emptyCells.count()).toBeGreaterThan(0)

    // Table renders all 18 well rows.
    const tableRows = page.getByTestId('graph-search-table').locator('tbody tr')
    await expect(tableRows).toHaveCount(18, { timeout: 10_000 })

    // Selecting via checkbox updates the count.
    await page.getByTestId('row-select-well').first().check()
    await expect(summary).toContainText('1 selected', { timeout: 10_000 })

    // Clicking a hit cell toggles selection.
    const b2 = page.locator('[data-well="B2"]').first()
    await b2.click()
    await expect(b2).toHaveAttribute('data-selected', 'true', { timeout: 10_000 })
  })

  test('plans natural language, then sends a selection to AI (§7 end-to-end)', async ({ page }) => {
    await page.goto(`${BASE}/find`)
    const input = page.getByTestId('graph-search-input')
    await expect(input).toBeVisible({ timeout: 15_000 })

    await input.fill('wells treated with rotenone')
    await page.getByTestId('graph-search-submit').click()

    const summary = page.getByTestId('graph-search-summary')
    await expect(summary).toContainText('18 objects', { timeout: 15_000 })
    await expect(summary).toContainText('rotenone', { timeout: 10_000 })

    // Vessel context block: rotenone also exists as a tube/stock, so the
    // search surfaces BOTH the plate wells AND the stock (all-possibilities).
    const vessels = page.getByTestId('graph-search-vessels')
    await expect(vessels).toBeVisible({ timeout: 10_000 })
    await expect(vessels).toContainText('Also in tubes/stocks', { timeout: 10_000 })
    await expect(page.getByTestId('graph-vessel-instance').first()).toContainText('Rotenone master stock', { timeout: 10_000 })

    const checkboxes = page.getByTestId('row-select-well')
    await checkboxes.nth(0).check()
    await checkboxes.nth(1).check()
    await expect(page.getByTestId('graph-search-send-ai')).toBeVisible()

    await page.getByTestId('graph-search-send-ai').click()
    const ctx = page.getByTestId('graph-search-ai-context')
    await expect(ctx).toBeVisible({ timeout: 10_000 })
    await expect(ctx).toContainText('selection:', { timeout: 10_000 })
    await expect(ctx).toContainText('wells ready for AI', { timeout: 10_000 })
  })
})