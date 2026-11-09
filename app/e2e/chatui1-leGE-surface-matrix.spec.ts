import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * L2-CHAT-UI-1 LEG E — per-surface chat-standard matrix (spec §4 legs 1-5).
 *
 * Every surface family that renders the universal HarnessChatPane gets the
 * STANDARD grammar proven in-browser, STUB-DRIVEN (no model, no live
 * compile): the deck-ghost fetch-swap pattern (byte-honest done payloads) and
 * the sequences-harness-chat page.route/fetch-swap pattern for thread
 * isolation. New builders are DISTINCTLY NAMED (matrixShorthandResult /
 * matrixChainCard) — the deck-ghost file's two pinned builders
 * (blobClarificationResult / fixedShorthandResult, byte-extracted by
 * server/src/ai/shorthandChat.e2eStubHonesty.test.ts) are NEVER re-declared
 * or edited here.
 *
 * Deck legs (4/5/6) mutate a DISTINCT record id (EVG-LEGE-MATRIX), NOT the
 * shared EVG-SPK-VERIFY fixture that deck-ghost-shorthand.spec.ts also PUTs
 * (R7 fix1 — cross-file parallel-safety for the mandated gate). Each deck
 * leg resets MATRIX_EVG serially within this file.
 *
 * Leg 6 (protocol-edit/chain status) + REPORTED-GAP G1-G4 are REPORT-GRADE
 * status lines in the report, never silent passes (spec §4).
 */
test.describe.configure({ mode: 'serial' })

// R7 (fix1, c1 review D7): the matrix deck legs (4/5/6) mutate a DISTINCT
// record id (EVG-LEGE-MATRIX), NOT the shared EVG-SPK-VERIFY fixture that
// deck-ghost-shorthand.spec.ts also PUTs. The mandated gate command (no
// --workers flag) runs the two files in parallel workers; two files PUTting
// the SAME record raced (c1 reproduction: deck-ghost GHOST leg + three-pane
// 'nav rail' red in parallel, green under --workers=1). Distinct ids make
// the fixture ownership cross-file safe so the mandated gate is stable.
// The reset self-seeds the record via POST if it does not exist (PUT is
// update-only — 404 on a missing record), so the matrix deck legs do not
// depend on anyone else having created EVG-LEGE-MATRIX.
const MATRIX_EVG = 'EVG-LEGE-MATRIX'
const RUN_URL = '/runs/RUN-2026-09-07-run-nzrs'

/** Ensure MATRIX_EVG exists (POST self-seed if missing), then reset it to
 *  the unlocked empty single-plate state. Distinct from the deck-ghost
 *  shared fixture EVG-SPK-VERIFY (R7 — cross-file parallel-safety). */
async function resetMatrixDeck(request: APIRequestContext) {
  const existing = await request.get(`/api/records/${MATRIX_EVG}`)
  if (existing.status() === 404) {
    const created = await request.post('/api/records', {
      data: {
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: {
          id: MATRIX_EVG, recordId: MATRIX_EVG, kind: 'event-graph', name: 'LEG E matrix deck fixture', status: 'draft',
          events: [], labwares: [],
          methodContext: { runId: 'none', vocabId: 'liquid-handling/v1', platform: 'manual', deckVariant: 'manual_single_plate', locked: false },
          editorLayout: { surface: 'event-editor/v1', placements: [] },
        },
      },
    })
    expect(created.status(), `matrix deck fixture self-seed POST failed: ${created.status()}`).toBe(201)
  }
  const res = await request.put(`/api/records/${MATRIX_EVG}`, {
    data: {
      payload: {
        id: MATRIX_EVG, recordId: MATRIX_EVG, kind: 'event-graph', name: 'LEG E matrix deck fixture', status: 'draft',
        events: [], labwares: [],
        methodContext: { runId: 'none', vocabId: 'liquid-handling/v1', platform: 'manual', deckVariant: 'manual_single_plate', locked: false },
        editorLayout: { surface: 'event-editor/v1', placements: [] },
      },
    },
  })
  expect(res.ok(), `matrix deck fixture reset PUT failed: ${res.status()}`).toBe(true)
}

// ---- LEG E NEW builders (distinct names; NOT the pinned deck-ghost builders) ----

/** Matrix builder: a done result carrying a scientist-intent shorthand + an
 *  assistant note (the intent-card leg's payload — the universal pane's
 *  ChatLog intent card renders message.shorthand verbatim, ChatLog.tsx:272-274). */
function matrixShorthandResult(): unknown {
  return {
    success: true,
    events: [],
    notes: ['Draft compiled deterministically from the scientist-intent shorthand.'],
    shorthand:
      'intentId: matrix-leg1-dmem\nactions:\n  - action: add_material\n    labware: plate\n    material: DMEM\n    volume: { value: 50, unit: uL }\n    targetWells: A1:C3\n',
  }
}

/** Matrix builder: the same grammar on a DIFFERENT document — proves the
 *  run surface's card is the message's shorthand verbatim (not a copy of
 *  leg 1's text). */
function matrixRunShorthandResult(): unknown {
  return {
    success: true,
    events: [],
    notes: ['Draft compiled deterministically from the scientist-intent shorthand.'],
    shorthand:
      'intentId: matrix-leg2-growthmedia\nactions:\n  - action: add_material\n    labware: plate\n    material: Growth media\n    volume: { value: 100, unit: uL }\n    targetWells: A1:H12\n',
  }
}

/** Matrix builder: the SERVER-BUILT chain card document (the D0 shape —
 *  useSurfaceChat.chain.test.tsx CHAIN_CARD is the shape authority; this is
 *  the same document, re-declared distinctly for the browser leg; the client
 *  must pass it through VERBATIM). */
function matrixChainCard(): unknown {
  return {
    artifactKind: 'attestation-chain',
    claims: [
      {
        label: 'completed — the stock was prepared and split',
        verb: 'produced',
        aboutId: 'MATERIALINSTANCE-matrix',
        aboutType: 'material-instance',
        occurredAtStatus: 'unknown',
        identity: { performer: 'unknown', accountSupplier: 'unknown', attestor: 'unknown' },
      },
    ],
    reconciliation: {
      title: 'Arithmetic check',
      sumScaled: 1000,
      preparedScaled: 1000,
      counts: [{ label: 'used', count: 1 }, { label: 'stored', count: 9 }],
    },
    ceilingNote: 'The arithmetic proves this draft is internally consistent. It does not prove the pipetting happened.',
  }
}

/** The fetch-swap stub (deck-ghost stubAssistStream pattern): intercept
 *  /ai/assist/stream and replay a CANNED SSE PER CALL. `modes` is a queue —
 *  the n-th /ai/assist/stream call serves modes[min(n-1, len-1)] — so one
 *  leg can drive a multi-turn exchange (question turn, answer turn).
 *
 *  The addInitScript closure is SELF-CONTAINED (the builder bodies are pure
 *  data, mirrored inside the closure — addInitScript serializes the closure,
 *  so it must not reference module-level helpers). The payloads are the
 *  matrix's own byte-honest documents — NEVER the deck-ghost pinned builders
 *  (blobClarificationResult / fixedShorthandResult). */
type StubMode = 'shorthand' | 'run' | 'clarify' | 'clarified' | 'chain' | 'clarify-mint'

function stubAssistStream(page: Page, modes: StubMode | StubMode[]) {
  const queue: StubMode[] = Array.isArray(modes) ? modes : [modes]
  return page.addInitScript((list: StubMode[]) => {
    const SHORTHAND_LEG1 =
      'intentId: matrix-leg1-dmem\nactions:\n  - action: add_material\n    labware: plate\n    material: DMEM\n    volume: { value: 50, unit: uL }\n    targetWells: A1:C3\n'
    const SHORTHAND_RUN =
      'intentId: matrix-leg2-growthmedia\nactions:\n  - action: add_material\n    labware: plate\n    material: Growth media\n    volume: { value: 100, unit: uL }\n    targetWells: A1:H12\n'
    const SHORTHAND_CUT =
      'intentId: matrix-leg1-cut\nactions:\n  - action: sequence_cut\n    enzyme: EcoRI\n    target: SEQ-PUC19\n'
    const resultFor = (mode: StubMode): unknown => {
      switch (mode) {
        case 'run':
          return { success: true, events: [], notes: ['Draft compiled deterministically from the scientist-intent shorthand.'], shorthand: SHORTHAND_RUN }
        case 'clarify':
          return {
            success: true,
            events: [],
            notes: [],
            shorthand: SHORTHAND_CUT,
            clarification: {
              id: 'matrix-clar-1',
              prompt: 'Which enzyme should cut this?',
              entityType: 'sequence',
              options: [
                { id: 'opt-1', label: 'EcoRI' },
                { id: 'opt-2', label: 'BamHI' },
              ],
            },
          }
        case 'clarify-mint':
          // L2-CLARIFY-TARGET-1 (uifix1 D4): the MODERN wire (the existing
          // 'clarify' mode is the LEGACY option shape) — a done carrying ONLY
          // clarificationRequests (no legacy `clarification` field). The
          // single '/m' request, zero options, mint allowed, seeded query is
          // the measured CHATHOST D4 defect shape (singleCards: 1,
          // groupedCards: 0): the typed arm renders the picker whose mint row
          // overflowed the pane. useAiChat's done arm derives the legacy shape
          // from the requests (one payload, no second source of truth) but the
          // legacy block arm is suppressed when clarificationRequests is
          // present — the picker-only card is the ONE answer surface.
          return {
            success: true,
            events: [],
            notes: [],
            // NO shorthand: the measured CHATHOST D4 turn is a clarification
            // turn (the pane carries the picker card, not an intent card).
            // The done arm's conditional spread leaves the key ABSENT — the
            // typed arm is the only mounted surface (clarification is a
            // mountable channel, so no empty-pane wall).
            clarificationRequests: [
              {
                id: 'matrix-clar-d4',
                kind: 'material',
                prompt: 'Which medium is the growth plate?',
                entityType: 'material',
                menuProvider: '/m',
                query: 'DMEM',
                options: [],
                allowCreateLocal: true,
              },
            ],
          }
        case 'clarified':
          return { success: true, events: [], notes: [], clarificationNeeded: 'EcoRI it is.' }
        case 'chain':
          return undefined // chain: NO done — the chain_proposal frame defers
        case 'shorthand':
        default:
          return { success: true, events: [], notes: ['Draft compiled deterministically from the scientist-intent shorthand.'], shorthand: SHORTHAND_LEG1 }
      }
    }
    const orig = window.fetch
    let callIndex = 0
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      // The universal pane streams via /ai/assist/stream for most surfaces,
      // but the DECK surface registers as 'event-editor' (DeckSurfaceChat)
      // and aiClient.ts routes that surface to /ai/draft-events/stream —
      // intercept BOTH endpoints so the deck legs are stub-driven too.
      const url = String(input)
      if (url.includes('/ai/assist/stream') || url.includes('/ai/draft-events/stream')) {
        const mode = list[Math.min(callIndex, list.length - 1)]
        callIndex += 1
        const frames: unknown[] = [{ type: 'status', message: 'matrix leg working…' }]
        if (mode === 'chain') {
          frames.push({
            type: 'chain_proposal',
            chain: { operation: 'compose-execute-chain', intent: { purpose: 'matrix-leg5' } },
          })
        } else {
          frames.push({ type: 'done', result: resultFor(mode) })
        }
        const body = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
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
  }, queue)
}

/** Leg 5: stub POST /api/drafts/compile (the chain trust boundary) so the
 *  proposal flow renders the server-built chain card verbatim. */
function stubChainCompile(page: Page) {
  return page.route('**/api/drafts/compile', async (route) => {
    await route.fulfill({
      json: {
        draftId: 'DRAFT-MATRIX-CHAIN',
        revision: 1,
        reviewHash: 'm'.repeat(64),
        canAccept: true,
        diagnostics: [],
        result: {
          summary: 'Execute chain: 1 mL prepared, 10 aliquots of 100 uL',
          card: matrixChainCard(),
        },
      },
    })
  })
}

/** Isolate the app's thread reads from the live thread store (the sequences
 *  pattern): GET /api/ai/threads/* -> empty thread; non-GET /api/ai/* -> {}.
 *  Keeps the matrix from polluting real user threads. */
async function isolateThreads(page: Page) {
  await page.route('**/api/ai/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path.startsWith('/api/ai/threads/')) {
      await route.fulfill({ json: { endpoint: 'browser', userId: 'USR-TEST', mentions: [], updatedAt: '2026-10-30T00:00:00Z', messages: [] } })
      return
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ json: {} })
      return
    }
    await route.continue()
  })
}

/** The universal pane's composer (LEG D: the legacy chat-input composer
 *  died with AiTabPanel; the ChatLog composer is the textarea labelled
 *  'Message' + the 'Send' button, ChatLog.tsx:307-308). */
function composer(page: Page) {
  return page.getByLabel('Message', { exact: true })
}
function sendButton(page: Page) {
  return page.getByRole('button', { name: 'Send', exact: true })
}

/** Open the right pane's AI tab and wait for the universal pane. The
 *  workspace default is 'ai' (WorkspaceContext.tsx:302), but a host can
 *  override it (the artifact host opens on 'Details'), so the explicit
 *  tab click MUST precede the pane wait — the same drive the legacy deck
 *  specs did with right-pane-tab-ai. The artifact host loads async, so wait
 *  for the tab (not the pane) first — clicking before the RightPane mounts
 *  is a race. */
async function openAiPane(page: Page) {
  // HOST-AGNOSTIC pane open (test-port, no product change). The DECK /
  // project / LEG-C hosts render the universal pane behind a RightPane tab
  // strip — the live AI tab is `right-pane-tab-ai` (RightPane.tsx:82) — but
  // the sequences and run hosts mount HarnessChatPane directly with NO
  // right-pane tab strip. So: race for EITHER the pane (already open /
  // tab-less host) OR the tab strip (deck / C-host), and only click the AI
  // tab when the host actually exposes one (an already-active tab click is a
  // no-op). The pane is the target on every host; the tab is a drive, not an
  // assertion. (Test-port fix: the original wait-for-tab drive false-reds on
  // tab-less hosts.)
  const pane = page.locator('[data-testid="harness-chat-pane"]')
  const tab = page.locator('[data-testid="right-pane-tab-ai"]')
  await Promise.race([
    pane.waitFor({ state: 'visible', timeout: 20_000 }),
    tab.waitFor({ state: 'visible', timeout: 20_000 }),
  ]).catch(() => {
    /* neither surfaced -> the pane assertion below fails with the real error */
  })
  if ((await tab.count()) > 0) {
    await tab.click()
  }
  await expect(pane).toBeVisible({ timeout: 20_000 })
  return pane
}

/** Re-pin helper: the deck's DeckSetupChip (the legacy variant <select> was
 *  replaced by the cascading chip, commits a31c7201/2d25f934/31f5382c).
 *  Drives the chip to the freeform bench through its LIVE controls. */
async function driveChipToFreeform(page: Page) {
  await expect(page.locator('[data-testid="deck-setup-chip"]')).toBeVisible({ timeout: 20_000 })
  if (await page.locator('[data-testid="deck-setup-chip"]').innerText().then((t) => /freeform/i.test(t))) {
    return // already freeform
  }
  await page.locator('[data-testid="deck-setup-trigger"]').click()
  await expect(page.locator('[data-testid="deck-setup-panel"]')).toBeVisible({ timeout: 5_000 })
  // Locked deck (a committed tile/placement): arm the explicit switch first.
  const switchBtn = page.locator('[data-testid="deck-setup-switch"]')
  if (await switchBtn.count()) {
    await switchBtn.click()
    await expect(page.locator('[data-testid="deck-setup-panel"]')).toBeVisible({ timeout: 5_000 })
  }
  await page.locator('[data-testid="deck-setup-row-variant"]').first().click()
  await page.locator('[data-testid="deck-setup-option-manual_freeform"]').first().click()
  await expect(page.locator('[data-testid="deck-setup-chip"]')).toContainText('freeform', { timeout: 10_000 })
}

// ============================================================================
// Leg 1 — sequences: bubble / card / compaction (spec §4.1)
// ============================================================================
test('LEG-E leg 1: sequences — directional bubbles, the verbatim intent card before any accept', async ({ page }) => {
  await isolateThreads(page)
  await stubAssistStream(page, 'shorthand')
  await page.goto('/sequences')

  const log = page.getByRole('log', { name: 'Conversation' })
  // (a) Directional bubbles: user bubble + a DISTINCT assistant bubble.
  await openAiPane(page)
  await composer(page).fill('Draft: add 50uL DMEM to A1:C3')
  await sendButton(page).click()
  await expect(log).toContainText('Draft: add 50uL DMEM to A1:C3')
  const userBubble = page.locator('[data-testid="harness-chat-pane"] .chat-log-msg--user')
  const assistantBubble = page.locator('[data-testid="harness-chat-pane"] .chat-log-msg--assistant')
  await expect(userBubble).toHaveCount(1, { timeout: 15_000 })
  await expect(assistantBubble).toHaveCount(1)
  // The bubbles are DISTINCT rows (not the same element).
  const userBox = await userBubble.first().boundingBox()
  const assistantBox = await assistantBubble.first().boundingBox()
  expect(userBox && assistantBox && userBox.y !== assistantBox.y).toBe(true)

  // (b) The intent card: the verbatim shorthand BEFORE any accept click.
  const card = page.locator('[data-testid="chat-log-intent-card"]')
  await expect(card).toBeVisible({ timeout: 15_000 })
  const cardBody = page.locator('[data-testid="chat-log-intent-card-body"]')
  await expect(cardBody).toHaveText(matrixShorthandResultShorthand())
  // No accept interaction has happened: the deck preview card is absent
  // (a no-events note turn mounts nothing) — the card BEFORE accept is the
  // intent card, and nothing has been accepted.
  await expect(page.locator('[data-testid="chat-preview"]')).toHaveCount(0)
  expect(await userBubble.count()).toBe(1) // exactly one user turn so far
})

/** Leg 1c — sequences clarification COMPACTION (spec §4.1 tail): a
 *  clarifying turn renders the bulky numbered options; answering it
 *  (the option click fires chat.sendPrompt — HarnessChatPane.tsx:369)
 *  lands the answer as a USER bubble, so the question's bulky arms come
 *  OFF the DOM and ONE `chat-log-clarification-answered` row stands in
 *  (ChatLog.tsx:293, LEG A A4 — the bulky picker GONE from the DOM). */
test('LEG-E leg 1c: sequences — the clarification turn compacts to the answered row after the answer (bulky picker gone)', async ({ page }) => {
  await isolateThreads(page)
  // Two canned turns: question (clarify) -> answer (clarified).
  await stubAssistStream(page, ['clarify', 'clarified'])
  await page.goto('/sequences')
  const log = page.getByRole('log', { name: 'Conversation' })
  // Turn 1: the bulky clarification renders (numbered options, no answer yet).
  await openAiPane(page)
  await composer(page).fill('Cut this sequence')
  await sendButton(page).click()
  await expect(log).toContainText('Which enzyme should cut this?', { timeout: 15_000 })
  await expect(log).toContainText('1. EcoRI')
  await expect(log).toContainText('2. BamHI')
  const answeredBefore = await page.locator('[data-testid="chat-log-clarification-answered"]').count()
  expect(answeredBefore).toBe(0)

  // Turn 2: the numbered option click fires the answer turn (sendPrompt).
  await log.getByRole('button', { name: '1. EcoRI' }).click()
  // The question now has a following user bubble -> it COMPACTS: the bulky
  // arms come off the DOM and ONE answered row stands in for them.
  await expect(page.locator('[data-testid="chat-log-clarification-answered"]')).toBeVisible({ timeout: 15_000 })
  const answeredRows = page.locator('[data-testid="chat-log-clarification-answered"]')
  await expect(answeredRows).toHaveCount(1)
  await expect(answeredRows.first()).toContainText('Which enzyme should cut this?')
  // The bulky numbered options of the ANSWERED question are gone from the
  // DOM (the compact row replaced them). The canned 'clarified' reply
  // (EcoRI it is.) lands as the assistant's final line.
  await expect(log).toContainText('EcoRI it is.', { timeout: 15_000 })
  // The option buttons belonged to the (now answered) bulky arm — the
  // '1. EcoRI' option button count is 0 (the compact row has no buttons).
  await expect(log.locator('button', { hasText: '1. EcoRI' })).toHaveCount(0)
})

/** matrixShorthandResult's shorthand string (re-derived from the builder —
 *  the assertion is the EXACT bytes the builder emits). */
function matrixShorthandResultShorthand(): string {
  return (matrixShorthandResult() as { shorthand: string }).shorthand
}

// ============================================================================
// Leg 2 — run surface: same grammar at /runs/RUN-2026-09-07-run-nzrs (spec §4.2)
// ============================================================================
test('LEG-E leg 2: run surface — directional bubbles + the verbatim intent card (stubbed stream)', async ({ page }) => {
  await isolateThreads(page)
  await stubAssistStream(page, 'run')
  await page.goto(RUN_URL)

  const log = page.getByRole('log', { name: 'Conversation' })
  await openAiPane(page)
  await composer(page).fill('Draft: add 100uL growth media to A1:H12')
  await sendButton(page).click()
  await expect(log).toContainText('Draft: add 100uL growth media to A1:H12')
  const userBubble = page.locator('[data-testid="harness-chat-pane"] .chat-log-msg--user')
  const assistantBubble = page.locator('[data-testid="harness-chat-pane"] .chat-log-msg--assistant')
  await expect(userBubble).toHaveCount(1, { timeout: 15_000 })
  await expect(assistantBubble).toHaveCount(1)

  // The run surface's intent card carries the RUN leg's shorthand verbatim
  // (distinct from leg 1's text — proves the card is the message's own
  // shorthand, not a global copy).
  const cardBody = page.locator('[data-testid="chat-log-intent-card-body"]')
  await expect(cardBody).toBeVisible({ timeout: 15_000 })
  await expect(cardBody).toHaveText(matrixRunShorthandResultShorthand())
  await expect(page.locator('[data-testid="chat-preview"]')).toHaveCount(0)

  // E-α: the run surface's published working-focus header is present on this
  // host (label = the run id) — the leg doubles as the E-α live receipt.
  await expect(page.locator('[data-testid="surface-focus-header"]')).toHaveCount(1)
  await expect(page.locator('[data-testid="surface-focus-header"]')).toContainText('RUN-2026-09-07-run-nzrs')
})

function matrixRunShorthandResultShorthand(): string {
  return (matrixRunShorthandResult() as { shorthand: string }).shorthand
}

// ============================================================================
// Leg 3 — LEG C surfaces: composer ENABLED + directional bubble (spec §4.3)
// ============================================================================
// The C-hosts' MOUNT receipts exist from leg C (20261030T0915-legC); this leg
// adds only the STANDARD GRAMMAR: the composer is enabled (NOT the
// "No surface has registered" empty state) and a directional user bubble
// lands after one stubbed exchange.
for (const [label, url] of [
  ['registry', '/registry'],
  ['record', '/record/ACL-ALQ-2A5483322E30DC3DE614907ACD52BD93'],
  ['artifact', '/artifact/writeup/ART-L2C-GATE-1'],
  // R3 (fix1, c1 review D3): the project surface (route per spec §4.3 —
  // App.tsx:178 /project/:studyId; leg C's C4 host STU-saturday-morning-
  // tburg-p-cm9u, the only live study). Spec §4.3 names FOUR surfaces; the
  // original leg 3 covered only three and the report's "project host covered
  // by C receipts" proved only the MOUNT, not the grammar this leg pins.
  ['project', '/project/STU-saturday-morning-tburg-p-cm9u'],
] as const) {
  test(`LEG-E leg 3 (${label}): the universal composer is ENABLED and a directional bubble lands (stubbed exchange)`, async ({ page }) => {
    await isolateThreads(page)
    await stubAssistStream(page, 'shorthand')
    await page.goto(url)

    const pane = await openAiPane(page)
    // The composer is ENABLED: the 'Message' textarea is present (NOT the
    // "No surface has registered" empty state).
    const emptyState = pane.getByText(/No surface has registered/i)
    await expect(emptyState).toHaveCount(0)
    const composerEl = composer(page)
    await expect(composerEl).toBeVisible({ timeout: 15_000 })
    await expect(composerEl).toBeEnabled()

    // One stubbed exchange: the directional USER bubble lands in the log.
    await composerEl.fill(`Leg 3 ${label} ping`)
    await sendButton(page).click()
    const log = page.getByRole('log', { name: 'Conversation' })
    await expect(log).toContainText(`Leg 3 ${label} ping`, { timeout: 15_000 })
    const userBubble = page.locator('[data-testid="harness-chat-pane"] .chat-log-msg--user')
    await expect(userBubble).toHaveCount(1)
    // R3 (fix1, c1 review D3): spec §4.3 says "directional bubble CLASSES
    // after one stubbed exchange" — i.e. BOTH directions, not just the user
    // bubble. The stubbed done frame (mode 'shorthand') renders an assistant
    // note line, so the assistant-direction bubble class is also present.
    const assistantBubble = page.locator('[data-testid="harness-chat-pane"] .chat-log-msg--assistant')
    await expect(assistantBubble).toHaveCount(1, { timeout: 15_000 })
  })
}

// ============================================================================
// Leg 4 — deck: intent-card-before-accept (spec §4.4, NEW leg appended to the
// matrix; the deck-ghost file's pinned builders are byte-untouched)
// ============================================================================
test('LEG-E leg 4: deck — the verbatim shorthand card renders BEFORE any accept (byte-honest stub payload)', async ({ page, request }) => {
  await stubAssistStream(page, 'shorthand')
  // Reset the DISTINCT matrix deck fixture (R7: not the shared EVG-SPK-VERIFY
  // that deck-ghost also PUTs) to the unlocked empty state.
  await resetMatrixDeck(request)
  await page.goto(`/deck/${MATRIX_EVG}`)
  await driveChipToFreeform(page)
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })

  await openAiPane(page)

  await composer(page).fill('Draft: add 50uL DMEM to A1:C3 (matrix leg 4)')
  await sendButton(page).click()

  // The intent card is visible with the VERBATIM shorthand document BEFORE
  // the ghost tile / ChatPreviewCard Apply (card-before-accept).
  const card = page.locator('[data-testid="chat-log-intent-card"]')
  await expect(card).toBeVisible({ timeout: 20_000 })
  await expect(page.locator('[data-testid="chat-log-intent-card-body"]')).toHaveText(matrixShorthandResultShorthand())
  // No accept click happened: no ghost tile, no preview, no deck preview
  // card (the no-events note turn mounts nothing) — the card is the proof.
  await expect(page.locator('.tile[data-ghost="true"]')).toHaveCount(0)
  await expect(page.locator('[data-preview="true"]')).toHaveCount(0)
  await expect(page.locator('[data-testid="chat-preview"]')).toHaveCount(0)
})

// ============================================================================
// Leg 5 — deck: chain-card UNIVERSAL-HOME VISIBILITY (spec §4.5, report-grade
// per ruling §5: the chain card HAS a universal home (LEG D0); the PROTOCOL-
// EDIT card does not — leg 6 reports that, it does not pin it)
// ============================================================================
test('LEG-E leg 5: deck — the chain proposal renders the ChainProposalCard on the universal pane; Reject leaves no wall leak', async ({ page, request }) => {
  await stubAssistStream(page, 'chain')
  await stubChainCompile(page)
  // R7: distinct matrix deck fixture (not the shared EVG-SPK-VERIFY).
  await resetMatrixDeck(request)
  await page.goto(`/deck/${MATRIX_EVG}`)
  await driveChipToFreeform(page)

  await openAiPane(page)

  await composer(page).fill('Compose the execute chain (matrix leg 5)')
  await sendButton(page).click()

  // The universal pane's proposal slot mounts the ChainProposalCard (the
  // D0 universal home — HarnessChatPane.tsx:329-344; card passthrough is
  // the server-built document verbatim).
  const proposal = page.locator('[data-testid="harness-chat-proposal"]')
  await expect(proposal).toBeVisible({ timeout: 20_000 })
  const chainCard = page.locator('[data-testid="chain-card"]')
  await expect(chainCard).toBeVisible()
  await expect(page.locator('[data-testid="chain-card-artifact-kind"]')).toHaveText('attestation-chain')
  await expect(page.locator('[data-testid="chain-card-claims"]')).toContainText('completed — the stock was prepared and split')
  await expect(page.locator('[data-testid="chain-card-reconciliation"]')).toContainText('aliquots 1000 / prepared 1000')

  // Reject spends the card; the pane is clean — NO honest-wall leak (a
  // rejected chain proposal is not a failed turn).
  await page.locator('[data-testid="chain-card-reject"]').click()
  await expect(chainCard).toHaveCount(0, { timeout: 10_000 })
  await expect(page.locator('[data-testid="honest-wall"]')).toHaveCount(0)
})

// ============================================================================
// Leg 6 — protocol-edit/chain STATUS (spec §4.6, REPORT-GRADE, not a pin):
// the universal pane renders NO protocol-edit review card (ruling §2: its
// home is the routed ReviewAiPanel at /ingestion/vendor-pdf/:recordId). The
// assertion is the ABSENCE of the ACTUAL protocol-edit card chrome on the
// universal pane at a stubbed deck turn — a by-ruling status, never a silent
// pass. R4 (fix1, c1 review D4): the leg previously asserted only that two
// UNRELATED cards (workstate-card / chain-card) were absent, which is NOT
// evidence about protocol-edit. The protocol-edit review card IS the
// ChangesPanel (ChangesPanel.tsx:74 `changes-panel`, :284 `protocol-diff`,
// :298 `protocol-edit-row`) and its ONLY live mount is ReviewAiPanel.tsx:316
// (grep: zero universal-pane mount) — so pin those ACTUAL testids at count 0.
// ============================================================================
test('LEG-E leg 6: deck — the universal pane renders NO protocol-edit card (by-ruling status, ruling §2)', async ({ page, request }) => {
  await stubAssistStream(page, 'shorthand')
  // R7: distinct matrix deck fixture (not the shared EVG-SPK-VERIFY).
  await resetMatrixDeck(request)
  await page.goto(`/deck/${MATRIX_EVG}`)
  await driveChipToFreeform(page)
  const pane = await openAiPane(page)

  await composer(page).fill('Review the protocol (matrix leg 6)')
  await sendButton(page).click()
  // Give the stubbed turn a beat to settle, then assert the ACTUAL
  // protocol-edit card chrome is ABSENT from the universal pane (ruling §2
  // status — the card's home is the routed ReviewAiPanel, not this pane).
  await expect(page.locator('[data-testid="harness-chat-pane"] .chat-log-msg--assistant')).toHaveCount(1, { timeout: 15_000 })
  // R4: the protocol-edit review card = ChangesPanel. Its live testids
  // (changes-panel / protocol-diff / protocol-edit-row, ChangesPanel.tsx)
  // must be ABSENT on the universal pane — that is the real protocol-edit
  // absence, not the mere absence of two unrelated proposal cards.
  await expect(pane.locator('[data-testid="changes-panel"]')).toHaveCount(0)
  await expect(pane.locator('[data-testid="protocol-diff"]')).toHaveCount(0)
  await expect(pane.locator('[data-testid="protocol-edit-row"]')).toHaveCount(0)
  // The other universal proposal cards are also absent on a no-event
  // shorthand turn (workstate-card / chain-card) — kept as the card-mount
  // boundary.
  await expect(pane.locator('[data-testid="workstate-card"]')).toHaveCount(0)
  await expect(pane.locator('[data-testid="chain-card"]')).toHaveCount(0)
})

// ============================================================================
// Leg 7 — D4 geometry: the picker option rows stay inside the AI pane at
// 1440×900 (L2-CLARIFY-TARGET-1 uifix1, the CHATHOST-CONSOLIDATE-1 §D2 defect:
// "picker option rows run past the pane's right edge and are clipped, on all
// 6 hosts", measured 1440×900 turn B on the event-editor/deck host — the
// mint row 150 px WIDER than the card, its Create button 42 px past the
// 1440 px viewport).
//
// EVIDENCE STATUS: RED BY CONSTRUCTION PRE-MERGE — the gate that measured
// the defect (CHATHOST-CONSOLIDATE-1, rev c9687463, 20261103T180254Z)
// PRE-DATES fix4's track clamp (merge-base with fix4 6b0d9786 = 31353115 =
// fix4's parent), and the uifix1 item clamps (this commit) are not in trunk
// yet. This leg is graded by the ORCHESTRATOR'S post-merge browser gate —
// this run does NOT run the browser gate (FORBIDDEN). The jsdom sibling pin
// (app/src/agent/ChatClarification.d4overflow.uifix1.test.tsx) locks the
// structural contract (markup + declared CSS discipline); this leg is the
// ACTUAL 1440×900 geometry it rests on.
// ============================================================================
test('LEG-E leg 7: deck D4 geometry — the created picker option row + Create button lie fully inside the pane bounding box at 1440×900 (stubbed modern clarificationRequests wire)', async ({ page, request }) => {
  // The measured host: the event-editor/deck surface (CHATHOST turn B), 1440×900.
  await page.setViewportSize({ width: 1440, height: 900 })
  // R7: the DISTINCT matrix deck fixture (not the shared EVG-SPK-VERIFY).
  await resetMatrixDeck(request)
  await page.goto(`/deck/${MATRIX_EVG}`)
  await isolateThreads(page)
  // The MODERN wire — a done carrying ONLY clarificationRequests (the legacy
  // 'clarify' mode's option shape drives the legacy block arm, not the
  // picker). The single '/m' request with zero options + mint allowed is the
  // measured defect shape: the typed arm renders the picker whose mint row
  // overflowed the pane (singleCards: 1, groupedCards: 0).
  await stubAssistStream(page, 'clarify-mint')
  const pane = await openAiPane(page)
  await composer(page).fill('Plate the DMEM growth medium (matrix leg 7)')
  await sendButton(page).click()
  // The typed single-request card renders (the ONE answer surface — the
  // measured shape: no grouped card alongside it).
  const wrapper = page.locator('[data-testid="chat-log-request-matrix-clar-d4"]')
  await expect(wrapper).toBeVisible({ timeout: 15_000 })
  expect(await page.locator('.chat-clarification-card').count()).toBe(0)
  // The picker's mint row (the measured defect row) + its Create button are
  // on screen (the row renders in the picker's closed state — no interaction).
  const mintRow = page.locator('[data-testid="clarification-mint-row"]')
  await expect(mintRow).toBeVisible({ timeout: 15_000 })
  const createBtn = page.locator('[data-testid="clarification-mint-create"]')
  await expect(createBtn).toBeVisible()

  // THE GEOMETRY (the mandated assertion): the created option row + the
  // button lie FULLY inside the pane's bounding box — no part of the row or
  // the button past the pane's right edge. Sub-pixel epsilon (0.5px) only.
  const paneBox = await pane.boundingBox()
  const rowBox = await mintRow.boundingBox()
  const btnBox = await createBtn.boundingBox()
  expect(paneBox).not.toBeNull()
  expect(rowBox).not.toBeNull()
  expect(btnBox).not.toBeNull()
  const paneRight = paneBox!.x + paneBox!.width
  expect(rowBox!.x, 'mint row left edge inside the pane').toBeGreaterThanOrEqual(paneBox!.x - 0.5)
  expect(rowBox!.x + rowBox!.width, 'mint row right edge inside the pane').toBeLessThanOrEqual(paneRight + 0.5)
  expect(btnBox!.x, 'Create button left edge inside the pane').toBeGreaterThanOrEqual(paneBox!.x - 0.5)
  expect(btnBox!.x + btnBox!.width, 'Create button right edge inside the pane').toBeLessThanOrEqual(paneRight + 0.5)
  // The measured failure mode was also a VIEWPORT escape (the button 42 px
  // past the 1440 px viewport) — the pane sits in the viewport, so contain
  // the button in the 1440 px viewport as well (the row is inside the pane,
  // hence the viewport, by the assertion above).
  expect(btnBox!.x + btnBox!.width, 'Create button right edge inside the 1440 px viewport').toBeLessThanOrEqual(1440)
})
