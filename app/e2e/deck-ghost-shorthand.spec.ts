import { test, expect, type Page } from '@playwright/test'

/**
 * COMP-1 Task 23.4 (Part IV): the deck ghosts the shorthand proposal's wells.
 *
 * Deterministic: the assist stream is STUBBED with the FIXED server payload
 * (the exact shape shorthandResultFromCompile now emits after Tasks 14-21 —
 * per-well add_material events carrying details.labwareId + details.well +
 * volume, plus the resolve_labware addition that places the labware). No
 * model, no live compile.
 *
 * The assertion is the ghost itself: the proposed plate renders as a ghost
 * tile (data-ghost="true"), and drilling into it shows the A1:H12 wells
 * carrying the preview overlay (data-preview="true") — the wells the scientist
 * declared, with the volume riding the event.
 */

const EVG = 'EVG-SPK-VERIFY' // the seeded deck fixture the deck specs reset idempotently
const PROMPT = 'Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well.'

/** The FIXED payload: what the compiler emits for the prompt after COMP-1. */
function fixedShorthandResult() {
  const wells: string[] = []
  for (const row of ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H']) {
    for (let col = 1; col <= 12; col += 1) wells.push(`${row}${col}`)
  }
  const events = wells.map((well, i) => ({
    eventId: `evt-add_material-ghost-${i}`,
    event_type: 'add_material',
    verb: 'add_material',
    vocabPackId: 'general',
    labwareId: 'ghost-plate',
    details: {
      well,
      wells: [well],
      labwareId: 'ghost-plate',
      material: 'Test Reagent',
      volumeUl: 50,
      volume: { value: 50, unit: 'uL' },
    },
    provenance: { actor: 'ai-agent', timestamp: new Date().toISOString(), method: 'compiler', actionGroupId: 'compiler-draft' },
  }))
  return {
    success: true,
    events,
    labwareAdditions: [{ recordId: 'ghost-plate', reason: 'placed via prompt' }],
    shorthand: 'intentId: comp1-ghost\nactions:\n  - action: add_material\n    labware: ghost plate\n    targetWells: A1:H12\n    volume: { value: 50, unit: uL }\n    material: Test Reagent\n',
    notes: ['Draft compiled deterministically from the scientist-intent shorthand.'],
  }
}

function stubAssistStream(page: Page) {
  const frames = [
    { type: 'status', message: 'compiling the shorthand draft…' },
    { type: 'done', result: fixedShorthandResult() },
  ]
  const sse = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
  return page.addInitScript((body: string) => {
    const orig = window.fetch
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/ai/assist/stream')) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body))
            controller.close()
          },
        })
        return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
      }
      return orig(input, init)
    }
  }, sse)
}

async function resetGhostDeck(request: Parameters<typeof test>[0]['request']) {
  await request.put(`/api/records/${EVG}`, {
    data: {
      payload: {
        id: EVG,
        recordId: EVG,
        kind: 'event-graph',
        name: 'Shaker Search Verify',
        status: 'draft',
        events: [],
        labwares: [],
        methodContext: { runId: 'none', vocabId: 'liquid-handling/v1', platform: 'manual', deckVariant: 'manual_freeform', locked: false },
        editorLayout: { surface: 'event-editor/v1', placements: [] },
      },
    },
  })
}

test('the fixed shorthand proposal ghosts A1:H12 on the deck with volumes (no model)', async ({ page, request }) => {
  await stubAssistStream(page)
  await resetGhostDeck(request)
  await page.goto(`/deck/${EVG}`)

  // Freeform bench so the proposed plate ghosts on the lawn.
  const variantSelect = page.locator('select').filter({ has: page.locator('option[value="manual_freeform"]') })
  await expect(variantSelect).toHaveCount(1, { timeout: 20_000 })
  await variantSelect.selectOption({ label: 'Manual Bench (freeform)' })
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })

  // Ask the question — the stub answers with the FIXED payload.
  await page.locator('[data-testid="right-pane-tab-ai"]').click()
  const input = page.locator('[data-testid="chat-input"] .chat-input__editor')
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.click()
  await page.keyboard.type(PROMPT)
  const sendBtn = page.locator('[data-testid="chat-input-send"]')
  await expect(sendBtn).toBeEnabled()
  await sendBtn.click()

  // The proposed plate ghosts on the lawn (data-ghost="true" — the ghost tile).
  const ghostTile = page.locator('.tile[data-ghost="true"]').filter({ hasText: /ghost plate/i })
  await expect(ghostTile.first()).toBeVisible({ timeout: 20_000 })

  // Drill into the ghost: the declared wells carry the preview overlay.
  await ghostTile.first().click()
  const previewedWells = page.locator('[data-preview="true"]')
  await expect(previewedWells).toHaveCount(96, { timeout: 20_000 })
  await expect(previewedWells.filter({ has: page.locator(':scope') }).first()).toBeVisible()

  // The tooltip for a ghosted well names the pending add with its volume.
  const wellA1 = page.locator('[data-well-id="A1"]')
  await expect(wellA1).toHaveAttribute('data-preview', 'true', { timeout: 10_000 })
  await wellA1.hover()
  const tooltip = page.locator('.well-tooltip').first()
  await expect(tooltip).toBeVisible({ timeout: 10_000 })
  await expect(tooltip).toContainText(/50/, { timeout: 10_000 })
})
