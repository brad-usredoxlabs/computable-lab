import { test, expect } from '@playwright/test'

// REGRESSION: the draft term manifest (which materials/labwares/equipments a
// step adds) must render inside the ProposedGraphModal (the Discard / View
// changes / Accept dialog), NOT inside the right-pane AI chat's changes list.
//
// Reproduces the observed scenario end-to-end against the LIVE stack: prompt
// the AI to add a material + labware, let it ghost, open View changes, and
// assert the term panel lives inside the modal.
test('term manifest renders in the review modal, not the AI chat pane', async ({ page }) => {
  await page.goto('/runs/RUN-2026-09-19-run-vwr8')
  await page.waitForSelector('[data-testid="ai-tab"]', { timeout: 20000 })

  // Type + send a prompt that will draft a material and a labware.
  const editor = page.locator('[contenteditable].chat-input__editor')
  await editor.waitFor({ state: 'visible', timeout: 15000 })
  await editor.click()
  await page.keyboard.type('Add 100uL of DMEM to A2 and place a 96 well plate in slot B2')
  await page.getByTestId('chat-input-send').click()

  // Wait for the AI to finish drafting and the deck preview bar to appear.
  await page.waitForSelector('text=View changes', { timeout: 120000 })
  await page.waitForTimeout(2000)

  // While the modal is CLOSED there is no term panel anywhere (it no longer
  // lives in the chat pane's changes list).
  await expect(page.locator('[data-testid="term-panel"]')).toHaveCount(0)

  // Open the review modal.
  await page.getByRole('button', { name: 'View changes' }).click()
  await page.waitForSelector('text=Proposed changes', { timeout: 10000 })

  // The term panel must be INSIDE the modal, grouped by kind.
  const termToggle = page.locator('[data-testid="term-panel-toggle"]').first()
  await expect(termToggle).toBeVisible()
  await expect(termToggle).toContainText('Terms')
  await termToggle.click()
  // Use the kind-section testid (not loose text: "Materials" also appears inside
  // the raw-JSON pre, so a text locator is ambiguous).
  await expect(page.getByTestId('term-section-material')).toBeVisible()
  await expect(page.getByTestId('term-section-labware')).toBeVisible()
})