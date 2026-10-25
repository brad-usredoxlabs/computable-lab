import { expect, test } from '@playwright/test'

/**
 * UCX-1 e2e — Sequences Library multi-select toolbar (spec 2026-10-18,
 * browser-gate criteria 1-6). Run against the merged stack
 * (PLAYWRIGHT_BASE_URL=http://localhost:5193, project chromium).
 *
 * Stub pattern copied from e2e/sequences-harness-chat.spec.ts (page.route for
 * catalog/contract/thread + explicit POST /sequences/actions capture so the
 * wire body is assertable and NO real record is written to the stack).
 */

const catalog = {
  records: [
    { recordId: 'SEQ-ALPHA', payload: { kind: 'sequence', label: 'Alpha probe target', length: 21, alphabet: 'iupac_dna' } },
    { recordId: 'SEQ-BETA', payload: { kind: 'sequence', label: 'Beta control', length: 34, alphabet: 'iupac_dna' } },
    { recordId: 'OLIG-GAMMA', payload: { kind: 'oligo-spec', label: 'Gamma oligo' } },
  ],
}

type ActionBody = { operation?: string; requestId?: string; label?: string; members?: { kind: string; id: string; type: string }[] }

test('sequences Library multi-select toolbar drives the shared collection model', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  const actionBodies: ActionBody[] = []
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/sequences/catalog') { await route.fulfill({ json: catalog }); return }
    if (path === '/api/sequences/contract') {
      await route.fulfill({ json: { schema: { oneOf: [] }, capabilities: { engines: [] }, alphabets: { dna: { symbols: { A: 'A', C: 'C', G: 'G', T: 'T' } } } } }); return
    }
    if (path === '/api/ai/threads/sequences') {
      await route.fulfill({ json: { endpoint: 'sequences', userId: 'USR-TEST', mentions: [], updatedAt: '2026-10-18T00:00:00Z', messages: [] } }); return
    }
    if (path === '/api/sequences/actions' && request.method() === 'POST') {
      actionBodies.push(JSON.parse(request.postData() ?? '{}') as ActionBody)
      await route.fulfill({ json: { recordId: 'SEQSET-gate' } }); return
    }
    if (request.method() !== 'GET') { await route.fulfill({ json: {} }); return }
    await route.continue()
  })

  await page.goto('/sequences')

  // (1) Toolbar always rendered with `0 selected`; sequence rows have
  // checkboxes, the oligo row does NOT (OQ1/OQ4).
  const toolbar = page.locator('[data-testid="sequence-selection-toolbar"]')
  await expect(toolbar).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('[data-testid="sequence-selection-count"]')).toHaveText('0 selected')
  await expect(page.locator('[data-testid="sequence-check-SEQ-ALPHA"]')).toBeVisible()
  await expect(page.locator('[data-testid="sequence-check-SEQ-BETA"]')).toBeVisible()
  await expect(page.locator('[data-testid="sequence-check-OLIG-GAMMA"]')).toHaveCount(0)
  await page.screenshot({ path: 'test-results/ucx1-1-toolbar-0-selected.png', fullPage: true })

  // (2) Tick >=2 sequence rows -> count updates.
  await page.locator('[data-testid="sequence-check-SEQ-ALPHA"]').check()
  await page.locator('[data-testid="sequence-check-SEQ-BETA"]').check()
  await expect(page.locator('[data-testid="sequence-selection-count"]')).toHaveText('2 selected')
  await page.screenshot({ path: 'test-results/ucx1-2-two-selected.png', fullPage: true })

  // (3) Analysis tab shows the SAME rows checked in the collection fieldset
  // (single shared model — OQ3).
  await page.getByRole('button', { name: 'Analysis' }).click()
  await expect(page.getByLabel('Alpha probe target', { exact: true })).toBeChecked()
  await expect(page.getByLabel('Beta control', { exact: true })).toBeChecked()
  await page.getByLabel('Collection name', { exact: true }).fill('gate-collection')

  // (4) Toolbar Save -> success status, count resets, wire body shape-equal
  // to the fieldset flow (operation/label/members of {kind:'record',type:'sequence'}).
  await page.locator('[data-testid="sequence-toolbar-save-collection"]').click()
  await expect(page.locator('p[role="status"]').filter({ hasText: 'Saved SEQSET' })).toBeVisible()
  await expect(page.locator('[data-testid="sequence-selection-count"]')).toHaveText('0 selected')
  expect(actionBodies.length).toBe(1)
  const body = actionBodies[0]
  expect(body.operation).toBe('save_collection')
  expect(body.label).toBe('gate-collection')
  expect(body.members).toEqual([
    { kind: 'record', id: 'SEQ-ALPHA', type: 'sequence' },
    { kind: 'record', id: 'SEQ-BETA', type: 'sequence' },
  ])
  expect(typeof body.requestId).toBe('string')
  await page.screenshot({ path: 'test-results/ucx1-4-saved-reset.png', fullPage: true })

  // (5) Select rows -> Clear -> count 0 AND Analysis fieldset unchecked.
  await page.locator('[data-testid="sequence-check-SEQ-ALPHA"]').check()
  await expect(page.locator('[data-testid="sequence-selection-count"]')).toHaveText('1 selected')
  await page.locator('[data-testid="sequence-clear-selection"]').click()
  await expect(page.locator('[data-testid="sequence-selection-count"]')).toHaveText('0 selected')
  await expect(page.getByLabel('Alpha probe target', { exact: true })).not.toBeChecked()
  await page.screenshot({ path: 'test-results/ucx1-5-cleared.png', fullPage: true })

  // (6) Select-all with a query active selects only VISIBLE sequence rows;
  // oligo-spec rows are never selectable.
  await page.getByLabel('Search sequences').fill('Beta')
  await expect(page.locator('[data-testid="sequence-check-SEQ-ALPHA"]')).toHaveCount(0)
  await page.locator('[data-testid="sequence-select-all"]').click()
  await expect(page.locator('[data-testid="sequence-selection-count"]')).toHaveText('1 selected')
  await expect(page.locator('[data-testid="sequence-check-SEQ-BETA"]')).toBeChecked()
  await page.screenshot({ path: 'test-results/ucx1-6-query-select-all.png', fullPage: true })

  expect(errors).toEqual([])
})
