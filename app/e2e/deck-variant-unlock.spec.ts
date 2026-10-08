import { test, expect } from '@playwright/test'

const FREE_BENCH_LABEL = 'Manual Bench (freeform)'
const EVG = 'EVG-SPK-VERIFY'

// The deck lock is gone (SOUL.md rule + this work): a run's deck platform/variant
// selects are no longer pinned/disabled after a first edit. This spec drives the
// real deck surface and proves the (previously lock-gated) switch to the freeform
// bench is enabled and actually applies.
test('deck variant switch is unlocked — dropdown enabled and freeform bench reachable', async ({ page }) => {
  await page.goto(`/deck/${EVG}`)

  // The freeform bench is a variant option; locate the variant select by it so we
  // don't depend on a brittle total <select> count on the page.
  const variantSelect = page
    .locator('select')
    .filter({ has: page.locator('option[value="manual_freeform"]') })
  await expect(variantSelect).toHaveCount(1, { timeout: 20_000 })

  // Lock removal observable: the variant select must be ENABLED (a locked run's
  // deck previously rendered this disabled). If it were disabled, selectOption
  // below would never change the value.
  await expect(variantSelect).toBeEnabled()

  await variantSelect.selectOption({ label: FREE_BENCH_LABEL })
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })

  // The switch really took: the select now holds the freeform variant id.
  await expect(variantSelect).toHaveValue('manual_freeform')
})