import { test, expect } from '@playwright/test'

// Browser-gate for the compact plate-view change: the plate focus gives the
// whole view to the plate; Rotate/Read plate (formerly header toolbar buttons)
// now live in the right-click well context menu.
test('compact plate focus: no header toolbar, plate fills, actions in context menu', async ({ page }) => {
  await page.goto('/runs/RUN-2026-09-07-run-nzrs')
  const actionPane = page.locator('.cl-workspace__pane--action')
  await expect(actionPane).toBeVisible({ timeout: 20_000 })

  // Open the Add-to-deck dialog from the empty slot and place a 96-well plate.
  await actionPane.locator('text=Click to choose labware').click()
  const dialog = page.locator('.ee-dialog')
  await expect(dialog).toBeVisible()
  await dialog.locator('button').filter({ hasText: /96-Well Plate/ }).first().click()
  await expect(dialog.locator('button').filter({ hasText: 'Add to deck' }).last()).toBeVisible()
  await dialog.locator('button').filter({ hasText: 'Add to deck' }).last().click()
  await expect(dialog).toBeHidden({ timeout: 5000 })

  // The plate is placed and its focus view is open (plate1 · slot PLATE · Close).
  await expect(page.locator('.focus')).toBeVisible({ timeout: 5000 })
  await expect(page.locator('.focus')).toContainText('plate1')
  await expect(page.locator('.focus .focus__header')).toContainText('Close')

  // 1) Header is minimal — the old toolbar buttons are GONE; only name + Close.
  const header = page.locator('.focus__header')
  for (const label of ['Rotate', 'Add material', 'Actions', 'Read plate']) {
    expect(await header.locator('button').filter({ hasText: label }).count(),
      `header button "${label}" should be removed`).toBe(0)
  }

  // 2) Footer + composition legend are gone — the plate owns the height.
  expect(await page.locator('.focus__footer').count()).toBe(0)
  expect(await page.locator('.focus__legend').count()).toBe(0)

  // 3) The well grid renders and fills the stage.
  await expect(page.locator('.focus__stage svg').first()).toBeVisible()
  expect(await page.locator('.focus [data-well-id]').count()).toBe(96)

  // 4) Right-click a well → the context menu leads with Rotate + Read plate.
  await page.locator('.focus [data-well-id]').first().click({ button: 'right' })
  await expect(page.locator('.ctx-menu')).toBeVisible()
  const menuText = await page.locator('.ctx-menu').innerText()
  expect(menuText).toContain('Rotate')
  expect(menuText).toContain('Read plate')
})