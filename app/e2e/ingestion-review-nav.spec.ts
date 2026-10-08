import { test, expect } from '@playwright/test'

/**
 * E2E for the ingestion-tab rewiring (Phase 4): the per-row actions
 * ("Review" / "View") both open the single vendor-PDF review surface at
 * /ingestion/vendor-pdf/:recordId — no dead /lab/vendor-pdfs/:id links.
 * Runs against the live backend + shared store.
 */

test.describe('Ingestion tab → review surface', () => {
  test('Review button routes to the review page', async ({ page }) => {
    await page.goto('/ingestion/vendor-pdf')
    await expect(page.getByTestId('vendor-pdf-recent')).toBeVisible({ timeout: 15000 })

    const firstReview = page.locator('[data-testid^="recent-extract-"]').first()
    await expect(firstReview).toBeVisible({ timeout: 15000 })

    await firstReview.click()
    await expect(page).toHaveURL(/\/ingestion\/vendor-pdf\/VPDF-/)
    await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 15000 })
  })

  test('View button routes to the review page', async ({ page }) => {
    await page.goto('/ingestion/vendor-pdf')
    await expect(page.getByTestId('vendor-pdf-recent')).toBeVisible({ timeout: 15000 })

    const firstView = page.locator('[data-testid^="recent-view-"]').first()
    await expect(firstView).toBeVisible({ timeout: 15000 })

    await firstView.click()
    await expect(page).toHaveURL(/\/ingestion\/vendor-pdf\/VPDF-/)
    await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 15000 })
  })

  test('no dead /lab/vendor-pdfs deep-link remains in the workflow tab', async ({ page }) => {
    await page.goto('/ingestion/vendor-pdf')
    await expect(page.getByTestId('vendor-pdf-recent')).toBeVisible({ timeout: 15000 })
    // Old protocol-builder button is gone.
    await expect(page.locator('[data-testid^="recent-build-"]')).toHaveCount(0)
  })
})