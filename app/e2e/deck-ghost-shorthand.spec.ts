import { test, expect, type Page } from '@playwright/test'

/**
 * COMP-1 Task 23.4 (Part IV) + fix1/D2 (adversarial review defect 2,
 * orchestrator ruling): the deck ghosts the shorthand proposal's wells — and
 * the interim blob bar stays authoritative for the canonical mixture prompt.
 *
 * TWO legs, both stubbed with the payloads the FIXED server actually emits
 * (probed through the real parse→compile→shorthandResultFromCompile seam on
 * this branch — see the fix report §D2; no model, no live compile):
 *
 *  1. CANONICAL leg — "Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well."
 *     The blob bar fires BEFORE any event exists: the turn yields the
 *     unrealized-mixture-blob-material clarification (naming the material and
 *     the cues) and NO events — so NOTHING ghosts and no blob record is
 *     minted. The stub here is the honest clarification turn (events: [] +
 *     clarificationRequests), NOT a ghost payload.
 *
 *  2. GHOST leg — "Add 50uL of DMEM to each well." (plain material). The
 *     fixed payload is the exact shorthandResultFromCompile shape after
 *     Tasks 14-22: 96 per-well add_material events carrying
 *     details.labwareId + details.well + details.wells + volume/volumeUl,
 *     plus the resolve_labware addition that places the labware. The ghost
 *     assertion lives here: ghost tile (data-ghost="true"), A1:H12 wells with
 *     the preview overlay (data-preview="true"), tooltip shows 50.
 */

const EVG = 'EVG-SPK-VERIFY' // the seeded deck fixture the deck specs reset idempotently
const CANONICAL_PROMPT = 'Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well.'
const GHOST_PROMPT = 'Add 50uL of DMEM to each well.'

/** Leg 1 stub: the REAL clarification turn the fixed server emits for the
 *  canonical blob document (probe: shorthandChat.labwareResult-style seam,
 *  needs-clarification arm — success true, events [], the bar's facts verbatim
 *  on clarificationRequests; the unknown-noun companion arm rides along when
 *  the blob label is store-unbound, exactly as probed). */
function blobClarificationResult() {
  return {
    success: true,
    events: [],
    clarificationRequests: [
      {
        id: 'unresolved-1',
        kind: 'material',
        prompt: 'The draft names "50:50 Trypsin-EDTA/DMEM" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.',
        origin: 'harness',
        entityType: 'material',
        menuProvider: '/m',
        query: '50:50 Trypsin-EDTA/DMEM',
        options: [],
        allowCreateLocal: true,
        unresolvedFact: {
          label: '50:50 Trypsin-EDTA/DMEM',
          reason: 'unknown-noun',
          candidates: [
            { label: 'Create local term “50:50 Trypsin-EDTA/DMEM”', confidence: 0.05 },
            { label: 'Create local term “50:50 Trypsin-EDTA/DMEM”', confidence: 0.05 },
          ],
          actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
        },
      },
      {
        id: 'unresolved-2',
        kind: 'material',
        prompt: 'The draft names "50:50 Trypsin-EDTA/DMEM" and the lab spine could not bind it (unrealized-mixture-blob-material). Choose what it is, or create a local term.',
        origin: 'harness',
        entityType: 'material',
        menuProvider: '/m',
        query: '50:50 Trypsin-EDTA/DMEM',
        options: [],
        allowCreateLocal: true,
        unresolvedFact: {
          label: '50:50 Trypsin-EDTA/DMEM',
          reason: 'unrealized-mixture-blob-material',
          actionLocation: { actionIndex: 0, action: 'add_material', argument: 'material' },
          message: 'The material "50:50 Trypsin-EDTA/DMEM" names a recipe, not a component (mixture cues found: "/"). A bare concept in a well is never right — materialize it: declare the components (params.composition) or name a single material; a composition becomes a formulation (material-spec).',
        },
      },
    ],
    clarification: {
      id: 'unresolved-1',
      prompt: 'The draft names "50:50 Trypsin-EDTA/DMEM" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.',
      entityType: 'material',
      options: [],
      menuProvider: '/m',
      query: '50:50 Trypsin-EDTA/DMEM',
      allowCreateLocal: true,
    },
    shorthand: 'intentId: live-canonical-blob\nactions:\n  - action: add_material\n    labware: plate\n    material: 50:50 Trypsin-EDTA/DMEM\n    volume: { value: 50, unit: uL }\n    targetWells: A1:H12\n',
  }
}

/** Leg 2 stub: the FIXED ghost payload — the exact server output probed for
 *  the plain-material document (96 per-well events with details.labwareId +
 *  details.well + details.wells + volume/volumeUl, labwareAdditions placing
 *  'ghost plate'). */
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
    // The hint label rides BOTH the event and the addition (the live flow:
    // bindShorthandEventsToDeck only rewrites to a deck id when the deck
    // already carries a matching name; a proposed plate has none, so the
    // symbolic label is the bucket key on both sides — the probe confirmed
    // event labwareId === addition recordId in that case).
    labwareId: 'ghost plate',
    details: {
      well,
      wells: [well],
      labwareId: 'ghost plate',
      material: 'DMEM',
      volumeUl: 50,
      volume: { value: 50, unit: 'uL' },
    },
    provenance: { actor: 'ai-agent', timestamp: new Date().toISOString(), method: 'compiler', actionGroupId: 'compiler-draft' },
  }))
  return {
    success: true,
    events,
    labwareAdditions: [{ recordId: 'ghost plate', reason: 'ProtocolIntent labware resource ghost plate' }],
    shorthand: 'intentId: live-plain-dmem\nactions:\n  - action: add_material\n    labwareHint: ghost plate\n    targetWells: A1:H12\n    volume: { value: 50, unit: uL }\n    material: DMEM\n',
    notes: ['Draft compiled deterministically from the scientist-intent shorthand.'],
  }
}

function stubAssistStream(page: Page, result: unknown) {
  const frames = [
    { type: 'status', message: 'compiling the shorthand draft…' },
    { type: 'done', result },
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

async function openFreeformDeckAndAsk(page: Page, prompt: string) {
  await page.goto(`/deck/${EVG}`)

  // Freeform bench so a proposed plate would ghost on the lawn.
  const variantSelect = page.locator('select').filter({ has: page.locator('option[value="manual_freeform"]') })
  await expect(variantSelect).toHaveCount(1, { timeout: 20_000 })
  await variantSelect.selectOption({ label: 'Manual Bench (freeform)' })
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })

  // Ask the question — the stub answers.
  await page.locator('[data-testid="right-pane-tab-ai"]').click()
  const input = page.locator('[data-testid="chat-input"] .chat-input__editor')
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.click()
  await page.keyboard.type(prompt)
  const sendBtn = page.locator('[data-testid="chat-input-send"]')
  await expect(sendBtn).toBeEnabled()
  await sendBtn.click()
}

test('CANONICAL leg: the blob prompt yields the mixture clarification and ghosts NOTHING (interim bar, no blob record)', async ({ page, request }) => {
  await stubAssistStream(page, blobClarificationResult())
  await resetGhostDeck(request)
  await openFreeformDeckAndAsk(page, CANONICAL_PROMPT)

  // The clarification turn renders: the questions panel names the blob label.
  const questions = page.locator('[data-testid="questions-panel"]')
  await expect(questions).toBeVisible({ timeout: 20_000 })
  await expect(questions).toContainText('50:50 Trypsin-EDTA/DMEM', { timeout: 10_000 })

  // The bar holds the WHOLE draft: no event shipped ⇒ no ghost tile, no
  // preview wells — nothing can ghost and the grounding door never sees the
  // blob (no blob-named material record).
  await expect(page.locator('.tile[data-ghost="true"]')).toHaveCount(0)
  await expect(page.locator('[data-preview="true"]')).toHaveCount(0)
})

test('GHOST leg: the plain-material proposal ghosts A1:H12 on the deck with volumes (no model)', async ({ page, request }) => {
  await stubAssistStream(page, fixedShorthandResult())
  await resetGhostDeck(request)
  await openFreeformDeckAndAsk(page, GHOST_PROMPT)

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
