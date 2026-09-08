import { test, expect } from '@playwright/test'

/**
 * E2E for the run Editor's Protocol tab search + Ingested PDFs group
 * (Phase 3). Runs against the live backend; fixture relies on a run in the
 * shared store that has NO attached method, so the Protocol selector (with
 * the search box) renders.
 */

const RUN_NO_METHOD = 'RUN-2026-09-06-run-43wx'

test.describe('Run Protocol tab search + Ingested PDFs', () => {
  test('search box + Ingested PDFs group render in the Protocol selector', async ({ page }) => {
    await page.goto(`/runs/${RUN_NO_METHOD}`)

    // Protocol selector shows the search input.
    await expect(page.getByTestId('protocol-search-input')).toBeVisible({ timeout: 15000 })

    // Ingested PDFs group is present (server returns all vendor-pdfs with no q).
    await expect(
      page.locator('div[style]', { hasText: /^Ingested PDFs$/ }).first(),
    ).toBeVisible({ timeout: 15000 })
  })

  test('searching cellrox filters to the CellROX PDF and protocols', async ({ page }) => {
    await page.goto(`/runs/${RUN_NO_METHOD}`)
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

  test('approved universal protocols are attachable even before their steps are localized', async ({ page }) => {
    // Regression: gating the attach list on step-localization hid the approved
    // CellROX universal, leaving only its vendor PDF's "Open" row. Localization
    // happens in the event editor AFTER attach, so approved protocols must
    // still show "Attach to run".
    await page.goto(`/runs/${RUN_NO_METHOD}`)
    await expect(page.getByTestId('protocol-search-input')).toBeVisible({ timeout: 15000 })

    // The approved CellROX assay (PRT-g5zy9e) shows an Attach button, not Open.
    await expect(page.getByTestId('attach-PRT-g5zy9e')).toBeVisible({ timeout: 15000 })
    await expect(page.getByTestId('open-pdf-PRT-g5zy9e')).toHaveCount(0)
  })

  test('Open on an ingested PDF routes to the review surface', async ({ page }) => {
    await page.goto(`/runs/${RUN_NO_METHOD}`)
    await expect(page.getByTestId('protocol-search-input')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('protocol-search-input').fill('cellrox')
    await expect(page.getByTestId('open-pdf-VPDF-651F03789D80')).toBeVisible({ timeout: 15000 })

    await page.getByTestId('open-pdf-VPDF-651F03789D80').click()
    await expect(page).toHaveURL(/\/ingestion\/vendor-pdf\/VPDF-651F03789D80/)
    await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 15000 })
  })
})