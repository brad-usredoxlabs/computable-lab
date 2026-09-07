import { test, expect } from '@playwright/test'

/**
 * E2E for the vendor-PDF review surface (Phase 2) and the ingestion tab
 * rewiring (Phase 4). These run against the live backend on the /api proxy —
 * the fixture record VPDF-257F57196F6C is a real ingested vendor PDF with a
 * stored file + per-page extractedText (assumed present in the shared store).
 */

const VPDF = 'VPDF-257F57196F6C'

test.describe('Vendor PDF review surface', () => {
  test('review page loads the record title and shows the extract action', async ({ page }) => {
    await page.goto(`/ingestion/vendor-pdf/${VPDF}`)

    // The review surface mounts (title header present).
    await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 15000 })

    // The record's title is shown.
    await expect(page.getByTestId('vpdf-review-title')).not.toBeEmpty()

    // The left pane renders SOMETHING (PDF canvas pages or the extracted-text
    // fallback) — both are "content" proving the record loaded.
    const pdfPages = page.locator('.vpdf-review__pages')
    const textPane = page.locator('.vpdf-review__text')
    // Either the PDF rendered render or the plain-text fallback appeared.
    await expect(pdfPages.or(textPane).first()).toBeVisible({ timeout: 15000 })

    // Extract Protocol button is present and enabled (extractedText exists).
    const extractBtn = page.getByTestId('vpdf-extract')
    await expect(extractBtn).toBeVisible()
    await expect(extractBtn).toBeEnabled()
  })

  test('extract button proceeds to loading state', async ({ page }) => {
    await page.goto(`/ingestion/vendor-pdf/${VPDF}`)
    await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 15000 })
    const extractBtn = page.getByTestId('vpdf-extract')
    await expect(extractBtn).toBeVisible()
    // Clicking triggers extraction → a loading hint appears (may complete fast,
    // so tolerate either the loading hint or a resulting candidate preview).
    await extractBtn.click()
    await expect(
      page.getByTestId('vpdf-extracting').or(page.getByTestId('protocol-candidate-preview')).first(),
    ).toBeVisible({ timeout: 30000 })
  })

  test('back button returns to ingestion', async ({ page }) => {
    await page.goto(`/ingestion/vendor-pdf/${VPDF}`)
    await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 15000 })
    await page.getByTestId('vpdf-review-back').click()
    await expect(page).toHaveURL(/\/ingestion/)
  })

  test('Save As opens a modal pre-loaded with the protocol title, and saving promotes an approved protocol', async ({ page }) => {
    test.setTimeout(180_000)
    // Use the smaller CellROX PDF so extraction finishes reliably.
    await page.goto('/ingestion/vendor-pdf/VPDF-651F03789D80')
    await expect(page.getByTestId('vpdf-review')).toBeVisible({ timeout: 15000 })

    // Extract (LLM — can take a while).
    await page.getByTestId('vpdf-extract').click()

    // Wait for the Save As button to appear (candidate mapped).
    await expect(page.getByTestId('vpdf-save-as')).toBeVisible({ timeout: 120_000 })

    // Click Save As → modal appears pre-loaded with the protocol title.
    await page.getByTestId('vpdf-save-as').click()
    await expect(page.getByTestId('vpdf-saveas-modal')).toBeVisible()
    await expect(page.getByTestId('vpdf-saveas-title')).toHaveValue(/./)

    const preloaded = await page.getByTestId('vpdf-saveas-title').inputValue()
    expect(preloaded.trim().length).toBeGreaterThan(0)

    // Overwrite the title and confirm.
    await page.getByTestId('vpdf-saveas-title').fill('My Saved Protocol')
    await page.getByTestId('vpdf-saveas-confirm').click()

    // The modal closes and a saved note appears (no validation error).
    await expect(page.getByTestId('vpdf-saveas-modal')).not.toBeVisible()
    await expect(page.locator('.vpdf-review__save-note')).toBeVisible({ timeout: 30000 })
  })
})