import { test, expect } from '@playwright/test'

const FREE_BENCH_LABEL = 'Manual Bench (freeform)'
const EVG = 'EVG-SPK-VERIFY'

async function openEquipmentDialog(page: import('@playwright/test').Page) {
  await page.goto(`/deck/${EVG}`)
  // The deck defaults to a single-plate variant; switch to the freeform bench
  // so a lawn surface is available to click.
  await expect(page.locator('select')).toHaveCount(4, { timeout: 20_000 })
  const variantSelect = page.locator('select').nth(1)
  await variantSelect.selectOption({ label: FREE_BENCH_LABEL })
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })

  // Click an empty point on the bench → unified Add-to-deck dialog.
  const lawn = page.locator('.lawn__surface').first()
  const box = await lawn.boundingBox()
  if (!box) throw new Error('no lawn box')
  await page.mouse.click(box.x + box.width * 0.3, box.y + box.height * 0.3)
  await expect(page.locator('.ee-dialog')).toBeVisible()
  await page.locator('.ee-dialog__tab', { hasText: /^Equipment$/ }).click()
  await expect(page.locator('.ee-dialog__kinds')).toBeVisible()
}

test('searching "shaker" surfaces the locally-saved equipment record first', async ({ page }) => {
  await openEquipmentDialog(page)
  const search = page.locator('.ee-dialog__search').first()
  await search.fill('shaker')

  // The minted Kuhner record must appear as a LOCAL hit (LAB / "Your lab"),
  // and it must be the FIRST result. A web/Exa variant of the same product may
  // also appear below it — that is expected.
  const localKuhner = page
    .locator('.ee-dialog__vendor-row', { hasText: /Kuhner – LS-Z benchtop shaker/ })
    .filter({ hasText: /Your lab/i })
  await expect(localKuhner).toBeVisible({ timeout: 15_000 })

  const firstRowText = (await page.locator('.ee-dialog__vendor-row').nth(0).innerText()).toLowerCase()
  expect(firstRowText).toContain('kuhner – ls-z benchtop shaker')
  expect(firstRowText).toContain('your lab')
})

test('a generic instrument kind chip is addable directly (no online match)', async ({ page }) => {
  await openEquipmentDialog(page)

  // Click the qPCR chip → "Add to deck" must enable without any search.
  const qpcrChip = page.locator('.ee-dialog__kind', { hasText: /qPCR machine/ })
  const chipTitle = await qpcrChip.getAttribute('title')
  expect(chipTitle).toBe('qPCR machine')
  await qpcrChip.click()

  const addBtn = page.locator('.ee-dialog__btn--primary')
  await expect(addBtn).toBeEnabled({ timeout: 5_000 })

  // Name it, then add.
  await page.locator('.ee-dialog__search').nth(1).fill('QS5')
  await addBtn.click()
  await expect(page.locator('.ee-dialog')).not.toBeVisible()
  await expect(page.locator('.lawn__tile-anchor', { hasText: 'QS5' })).toBeVisible({ timeout: 10_000 })
})