import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * COMP-1 Task 23.4 (Part IV) + fix1/D2 + fix2/N1 (adversarial re-review):
 * the deck ghosts the shorthand proposal's wells — and the interim blob bar
 * stays authoritative for the canonical mixture prompt.
 *
 * TWO legs, both stubbed with payloads the FIXED server ACTUALLY emits for
 * the deck state the leg seeds (fix2/N1: every stub byte-matches the real
 * parse→compileShorthandDeterministically→shorthandResultFromCompile output
 * for its document + deck state — pinned by
 * server/src/ai/shorthandChat.e2eStubHonesty.test.ts, which extracts these
 * stub builders and deep-compares them; no model, no live compile):
 *
 *  1. CANONICAL leg — "Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well."
 *     (empty deck). The blob bar fires BEFORE any event exists: the turn
 *     yields THREE clarification requests — unknown-noun(plate),
 *     unknown-noun(blob), unrealized-mixture-blob-material(blob) — and NO
 *     events, so NOTHING ghosts and no blob record is minted. The stub is the
 *     verbatim needs-clarification payload (fix2 minor: the real compile also
 *     bars the unseeded 'plate' noun — the fix1 stub omitted that bar — and
 *     the legacy clarification head is the FIRST request, the labware bar).
 *
 *  2. GHOST leg — "Add 50uL of DMEM to each well." (plain material) against
 *     an EXISTING deck plate named 'ghost plate' (seeded via the honest
 *     record PUT: labwares + lawn placement). The exact deck-name match is
 *     what makes the server emit the Part IV carriers: bindShorthandEventsToDeck
 *     rewrites the hint to the deck id and writes details.labwareId =
 *     'LBW-96-1' + details.wells = [well] on all 96 events, and NO
 *     labwareAdditions (the hint is bound to the deck, not proposed). The leg
 *     then proves the server→deck path through the REAL client code: the
 *     committed tile flips data-affected="true" (collectEventLabwareIds
 *     bucketed the server-emitted details.labwareId onto the deck placement)
 *     and drilling in shows 96 preview wells (data-preview="true") with the
 *     tooltip naming 50 µL.
 *
 * WHY option (b) (existing deck plate) and not option (a) (stub the raw
 * no-deck payload): with an empty deck the server emits details =
 * {well, material, volumeUl, volume} — NO details.labwareId and NO
 * details.wells — and collectEventLabwareIds (previewProjection.ts) reads
 * details.* only, so the 96 events bucket under NO labware and the wells
 * CANNOT ghost. An honest no-deck leg would prove the GAP, not the Part IV
 * fix. The deck-matched state is the only single deck state where the server
 * genuinely emits details.labwareId + details.wells, so it is the state this
 * spec models. Pinned by the honesty test's no-deck characterization.
 */

const EVG = 'EVG-SPK-VERIFY' // the seeded deck fixture the deck specs reset idempotently
const CANONICAL_PROMPT = 'Add 50uL of 50:50 Trypsin-EDTA/DMEM to each well.'
const GHOST_PROMPT = 'Add 50uL of DMEM to each well.'
const GHOST_PLATE_ID = 'LBW-96-1'
const GHOST_PLATE_NAME = 'ghost plate'

// Legs share the one live-stack deck fixture (the stack's PUT does not CREATE
// records), and they seed it DIFFERENTLY (empty vs plate-seeded) — so they
// must not race in parallel workers.
test.describe.configure({ mode: 'serial' })

/** Leg 1 stub: the VERBATIM needs-clarification payload the real seam emits
 *  for the canonical blob document with an empty deck (probe:
 *  shorthandChat.e2eStubHonesty.test.ts — success true, events [], THREE
 *  clarificationRequests [unknown-noun(plate), unknown-noun(blob),
 *  unrealized-mixture-blob-material(blob)], the legacy clarification head is
 *  the FIRST request (the labware bar, menuProvider '/l'), shorthand verbatim,
 *  notes ABSENT). */
function blobClarificationResult() {
  return {
    success: true,
    events: [],
    clarificationRequests: [
      {
        id: 'unresolved-1',
        kind: 'labware',
        prompt: 'The draft names "plate" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.',
        origin: 'harness',
        entityType: 'labware',
        menuProvider: '/l',
        query: 'plate',
        options: [],
        allowCreateLocal: true,
        unresolvedFact: {
          label: 'plate',
          reason: 'unknown-noun',
          candidates: [
            { label: 'Create local term “plate”', confidence: 0.05 },
            { label: 'Create local term “plate”', confidence: 0.05 },
          ],
          actionLocation: { actionIndex: 0, action: 'add_material', argument: 'labware' },
        },
      },
      {
        id: 'unresolved-2',
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
        id: 'unresolved-3',
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
      prompt: 'The draft names "plate" and the lab spine could not bind it (unknown-noun). Choose what it is, or create a local term.',
      entityType: 'labware',
      options: [],
      menuProvider: '/l',
      query: 'plate',
      allowCreateLocal: true,
    },
    shorthand: 'intentId: live-canonical-blob\nactions:\n  - action: add_material\n    labware: plate\n    material: 50:50 Trypsin-EDTA/DMEM\n    volume: { value: 50, unit: uL }\n    targetWells: A1:H12\n',
  }
}

/** Leg 2 stub: the VERBATIM deck-matched ghost payload — the exact
 *  shorthandResultFromCompile output for the plain-material document when the
 *  deck carries a plate named 'ghost plate' (probe: 96 per-well events, each
 *  labwareId = the DECK id 'LBW-96-1' and details = {well, material,
 *  volumeUl, volume, labwareId:'LBW-96-1', wells:[well]}; NO labwareAdditions
 *  — the hint is bound to the deck, not proposed). Self-contained (the honesty
 *  test extracts and runs this builder verbatim). */
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
    // Deck-provable label: bindShorthandEventsToDeck rewrote the scientist's
    // 'ghost plate' hint to the deck id (exact unambiguous name match), and
    // the Part IV carriers ride details (the keys collectEventLabwareIds +
    // getAffectedWells read).
    labwareId: 'LBW-96-1',
    details: {
      well,
      material: 'DMEM',
      volumeUl: 50,
      volume: { value: 50, unit: 'uL' },
      labwareId: 'LBW-96-1',
      wells: [well],
    },
    provenance: { actor: 'ai-agent', timestamp: new Date().toISOString(), method: 'compiler', actionGroupId: 'compiler-draft' },
  }))
  return {
    success: true,
    events,
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

function deckPayload(labwares: unknown[], placements: unknown[]) {
  return {
    data: {
      payload: {
        id: EVG,
        recordId: EVG,
        kind: 'event-graph',
        name: 'Shaker Search Verify',
        status: 'draft',
        events: [],
        labwares,
        methodContext: { runId: 'none', vocabId: 'liquid-handling/v1', platform: 'manual', deckVariant: 'manual_freeform', locked: false },
        editorLayout: { surface: 'event-editor/v1', placements },
      },
    },
  }
}

async function resetEmptyDeck(request: APIRequestContext) {
  const res = await request.put(`/api/records/${EVG}`, deckPayload([], []))
  expect(res.ok(), `deck reset PUT failed: ${res.status()}`).toBe(true)
}

/** Seed the deck with an EXISTING plate the scientist already has — the honest
 *  record-PUT path (labwares + lawn placement, schema-valid per
 *  schema/workflow/event-graph.schema.yaml). Its NAME is what the server's
 *  deck binding matches; its id is what the bound events must carry. */
async function resetDeckWithPlate(request: APIRequestContext) {
  const res = await request.put(
    `/api/records/${EVG}`,
    deckPayload(
      [
        {
          labwareId: GHOST_PLATE_ID,
          labwareType: 'plate_96',
          name: GHOST_PLATE_NAME,
          addressing: {
            type: 'grid',
            rows: 8,
            columns: 12,
            rowLabels: ['A', 'B', 'C', 'D', 'E', 'F', 'G', 'H'],
            columnLabels: ['1', '2', '3', '4', '5', '6', '7', '8', '9', '10', '11', '12'],
          },
          geometry: { maxVolume_uL: 300, minVolume_uL: 10, wellShape: 'round' },
        },
      ],
      [
        {
          placementId: `pl-${GHOST_PLATE_ID}`,
          labwareId: GHOST_PLATE_ID,
          location: { kind: 'lawn', xMm: 16, yMm: 16 },
          orientation: 'landscape',
        },
      ],
    ),
  )
  expect(res.ok(), `deck seed PUT failed: ${res.status()}`).toBe(true)
}

async function openFreeformDeckAndAsk(page: Page, prompt: string) {
  await page.goto(`/deck/${EVG}`)

  // Freeform bench so the lawn renders the seeded placement.
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
  await resetEmptyDeck(request)
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
  await resetDeckWithPlate(request)
  await openFreeformDeckAndAsk(page, GHOST_PROMPT)

  // The scientist's plate is on the lawn BEFORE the ask (a committed tile,
  // not a proposed ghost tile — the deck-matched scenario, not a proposed
  // plate).
  const plateTile = page.locator('.tile[data-ghost="false"]').filter({ hasText: GHOST_PLATE_NAME })
  await expect(plateTile.first()).toBeVisible({ timeout: 20_000 })

  // SERVER→DECK PROOF: the client's collectEventLabwareIds bucketed the
  // server-emitted details.labwareId ('LBW-96-1') onto this placement, so the
  // committed tile flips to the affected/Preview state.
  await expect(plateTile.first()).toHaveAttribute('data-affected', 'true', { timeout: 20_000 })

  // Drill into the plate: the server-emitted details.wells render as the
  // preview overlay on all 96 wells.
  await plateTile.first().click()
  const previewedWells = page.locator('[data-preview="true"]')
  await expect(previewedWells).toHaveCount(96, { timeout: 20_000 })

  // The tooltip for a ghosted well names the pending add with its volume.
  const wellA1 = page.locator('[data-well-id="A1"]')
  await expect(wellA1).toHaveAttribute('data-preview', 'true', { timeout: 10_000 })
  await wellA1.hover()
  const tooltip = page.locator('.well-tooltip').first()
  await expect(tooltip).toBeVisible({ timeout: 10_000 })
  await expect(tooltip).toContainText(/50/, { timeout: 10_000 })
})
