import { test, expect, type Page, type APIRequestContext } from '@playwright/test'

/**
 * L2-CHAT-UI-1 LEG F — live thread-clobber probe (ruling Q2.2, receipts
 * OBS-1 c4-diag.json + c4-diag-deck.json rendered as a spec).
 *
 * The receipt's defect, on every scope-flipping surface: mount begins with
 * thread scope "" (the lazy mint keys id A under ""), the send POSTs the
 * user message into that thread, the record load lands and the scope flips
 * to the loaded deck id, and the (scope, threadId) re-key reset wiped the
 * LIVE turn — user/assistant bubbles 1/1 -> 0/0 at t≈2-3s, picker "No
 * threads yet", the settled pane showing only hydrated system rows while the
 * user's own question is gone (c4-diag.json: user 1 at t=1.0s, 0 by t=3.0s).
 *
 * This spec asserts the FIX's acceptance shape (spec A1/A2): from the
 * moment of send through settle, the USER BUBBLE COUNT IS >= 1 CONTINUOUSLY
 * (polled ~every 500ms, no gap — not a before/after spot check), and the
 * settled pane still shows the user turn. The stream is STUB-HELD (the
 * deck-ghost/LEG E fetch-swap pattern with a DELAYED done frame) so the
 * scope flip is guaranteed to land mid-turn — the exact receipt window —
 * with zero model dependency. Thread GETs are isolated to empty threads
 * (the LEG E isolateThreads pattern: the wiped thread B hydrates NOTHING,
 * so a clobber shows as user 1 -> 0 exactly as the receipts recorded).
 *
 * RED at trunk :5193 (pre-fix); GREEN against the candidate (self-owned
 * coder port per the LEG D/E precedent). Run: PLAYWRIGHT_BASE_URL=... npx
 * playwright test e2e/chatui1-legF-threadclobber.spec.ts --project=chromium
 * --workers=1 (item-wide gate form, LEG E advc c2).
 */
test.describe.configure({ mode: 'serial' })

const RUN_URL = '/runs/RUN-2026-09-07-run-nzrs'
/** LEG F's OWN deck fixture (distinct from EVG-LEGE-MATRIX / EVG-SPK-VERIFY —
 *  no cross-file fixture races). */
const LEGF_EVG = 'EVG-LEGF-CLOBBER'
const PROMPT = 'LEG F clobber probe: what does step 1 do?'

/** Ensure LEGF_EVG exists (POST self-seed if missing; PUT is update-only),
 *  then reset to the unlocked empty single-plate state (LEG E resetMatrixDeck
 *  pattern, own fixture id). */
async function resetLegfDeck(request: APIRequestContext) {
  const existing = await request.get(`/api/records/${LEGF_EVG}`)
  if (existing.status() === 404) {
    const created = await request.post('/api/records', {
      data: {
        schemaId: 'https://computable-lab.com/schema/computable-lab/event-graph.schema.yaml',
        payload: {
          id: LEGF_EVG, recordId: LEGF_EVG, kind: 'event-graph', name: 'LEG F clobber deck fixture', status: 'draft',
          events: [], labwares: [],
          methodContext: { runId: 'none', vocabId: 'liquid-handling/v1', platform: 'manual', deckVariant: 'manual_single_plate', locked: false },
          editorLayout: { surface: 'event-editor/v1', placements: [] },
        },
      },
    })
    expect(created.status(), `LEG F deck fixture self-seed POST failed: ${created.status()}`).toBe(201)
  }
  const res = await request.put(`/api/records/${LEGF_EVG}`, {
    data: {
      payload: {
        id: LEGF_EVG, recordId: LEGF_EVG, kind: 'event-graph', name: 'LEG F clobber deck fixture', status: 'draft',
        events: [], labwares: [],
        methodContext: { runId: 'none', vocabId: 'liquid-handling/v1', platform: 'manual', deckVariant: 'manual_single_plate', locked: false },
        editorLayout: { surface: 'event-editor/v1', placements: [] },
      },
    },
  })
  expect(res.ok(), `LEG F deck fixture reset PUT failed: ${res.status()}`).toBe(true)
}

/** HELD-STREAM stub (LEG E stubAssistStream pattern + delay): the n-th
 *  stream call serves a status frame IMMEDIATELY and the done frame only
 *  after `holdMs` — the turn is verifiably mid-flight across the async
 *  scope flip (the receipts' t≈1s send / t≈2s flip window). Intercepts
 *  BOTH stream endpoints (assist + deck draft-events). */
function stubHeldStream(page: Page, holdMs: number) {
  return page.addInitScript((hold: number) => {
    const orig = window.fetch
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      const url = String(input)
      if (url.includes('/ai/assist/stream') || url.includes('/ai/draft-events/stream')) {
        const enc = new TextEncoder()
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'status', message: 'legF held working…' })}\n\n`))
            setTimeout(() => {
              controller.enqueue(enc.encode(`data: ${JSON.stringify({ type: 'done', result: { success: true, events: [], notes: ['Leg F stub settled.'] } })}\n\n`))
              controller.close()
            }, hold)
          },
        })
        return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
      }
      return orig(input, init)
    }
  }, holdMs)
}

/** Isolate thread reads (LEG E isolateThreads pattern): GET thread -> empty
 *  thread (the wiped NEW key hydrates NOTHING — a clobber then shows as the
 *  receipt's user 1 -> 0); non-GET /api/ai/* -> {}. */
async function isolateThreads(page: Page) {
  await page.route('**/api/ai/**', async (route) => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (request.method() === 'GET' && path.startsWith('/api/ai/threads/')) {
      await route.fulfill({ json: { endpoint: 'browser', userId: 'USR-TEST', mentions: [], updatedAt: '2026-10-31T00:00:00Z', messages: [] } })
      return
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ json: {} })
      return
    }
    await route.continue()
  })
}

function composer(page: Page) {
  return page.getByLabel('Message', { exact: true })
}
function sendButton(page: Page) {
  return page.getByRole('button', { name: 'Send', exact: true })
}

/** Open the right pane's AI tab and wait for the universal pane (LEG E
 *  openAiPane, host-agnostic race). */
async function openAiPane(page: Page) {
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

/** Freeform chip drive (LEG E driveChipToFreeform, own copy). */
async function driveChipToFreeform(page: Page) {
  await expect(page.locator('[data-testid="deck-setup-chip"]')).toBeVisible({ timeout: 20_000 })
  if (await page.locator('[data-testid="deck-setup-chip"]').innerText().then((t) => /freeform/i.test(t))) {
    return
  }
  await page.locator('[data-testid="deck-setup-trigger"]').click()
  await expect(page.locator('[data-testid="deck-setup-panel"]')).toBeVisible({ timeout: 5_000 })
  const switchBtn = page.locator('[data-testid="deck-setup-switch"]')
  if (await switchBtn.count()) {
    await switchBtn.click()
    await expect(page.locator('[data-testid="deck-setup-panel"]')).toBeVisible({ timeout: 5_000 })
  }
  await page.locator('[data-testid="deck-setup-row-variant"]').first().click()
  await page.locator('[data-testid="deck-setup-option-manual_freeform"]').first().click()
  await expect(page.locator('[data-testid="deck-setup-chip"]')).toContainText('freeform', { timeout: 10_000 })
}

/** Send one turn, then SAMPLE THE USER-BUBBLE COUNT EVERY ~500ms from send
 *  through settle (well past the held-stream done). Returns the samples.
 *  CONTINUITY IS THE ASSERTION — any 0-sample between send and settle is
 *  the receipt's clobber (bubbles 1/1 -> 0/0 at the re-key wipe). */
async function sendAndSample(page: Page): Promise<number[]> {
  await composer(page).fill(PROMPT)
  await sendButton(page).click()
  const userBubble = page.locator('[data-testid="harness-chat-pane"] .chat-log-msg--user')
  const interpreting = page.locator('[data-testid="interpreting-stop"]')
  const samples: number[] = []
  const deadline = Date.now() + 25_000
  for (;;) {
    samples.push(await userBubble.count())
    const streamOpen = (await interpreting.count()) > 0
    if (!streamOpen && samples.length > 6) break // settled + sampled past the settle
    if (Date.now() > deadline) break
    await page.waitForTimeout(500)
  }
  return samples
}

/** The standard's console/pageerror discipline (verification reference). */
function watchErrors(page: Page) {
  const consoleErrors: string[] = []
  const pageErrors: string[] = []
  page.on('console', (m) => {
    if (m.type() === 'error') consoleErrors.push(m.text().slice(0, 300))
  })
  page.on('pageerror', (e) => pageErrors.push(String(e).slice(0, 300)))
  return { consoleErrors, pageErrors }
}

async function assertContinuous(samples: number[]) {
  // Every sample from the first bubble onward must be >= 1: no vanish at
  // any poll between send and settle. (The first sample can race ahead of
  // the bubble render — allow at most the FIRST sample to be 0.)
  const tail = samples.slice(1).length > 0 ? samples.slice(1) : samples
  const gaps = tail.map((c, i) => ({ i: i + 1, c })).filter((s) => s.c < 1)
  expect(gaps, `user bubble vanished mid-turn — samples: ${JSON.stringify(samples)}`).toEqual([])
  expect(samples[samples.length - 1]!, 'settled pane still shows the user turn').toBeGreaterThanOrEqual(1)
}

test('LEG F A1: run surface — user bubble >= 1 CONTINUOUSLY from send through settle (held stream spans the mount-time scope flip)', async ({ page }) => {
  const errs = watchErrors(page)
  await isolateThreads(page)
  await stubHeldStream(page, 4000)
  await page.goto(RUN_URL)
  await openAiPane(page)

  const samples = await sendAndSample(page)
  await assertContinuous(samples)

  // The settled pane still shows the user turn's content, not just a count.
  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText(PROMPT)
  expect(errs.pageErrors, `pageErrors: ${errs.pageErrors.join(' | ')}`).toEqual([])
})

/** Force the receipt's timing on the deck surface: DELAY the deck record
 *  load so the mount-time scope flip ("" -> EVG id) lands AFTER the send —
 *  the exact c4-diag-deck.json window (send t≈1.1s, flip/rehydration
 *  t≈1.2-2.1s). Without the delay a fast local load resolves the scope
 *  before send and the turn never spans the flip (the wipe cannot be
 *  reproduced, only waited for). */
async function delayDeckRecordLoad(page: Page, holdMs: number) {
  await page.route(`**/api/records/${LEGF_EVG}`, async (route) => {
    await new Promise((r) => setTimeout(r, holdMs))
    await route.continue()
  })
}

test('LEG F A2: deck surface — user bubble >= 1 CONTINUOUSLY from send through settle (second receipt reproduction, c4-diag-deck.json)', async ({ page, request }) => {
  const errs = watchErrors(page)
  await isolateThreads(page)
  await stubHeldStream(page, 4000)
  await resetLegfDeck(request)
  await delayDeckRecordLoad(page, 2500)
  await page.goto(`/deck/${LEGF_EVG}`)
  await driveChipToFreeform(page)
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })
  await openAiPane(page)

  const samples = await sendAndSample(page)
  await assertContinuous(samples)

  await expect(page.getByRole('log', { name: 'Conversation' })).toContainText(PROMPT)
  expect(errs.pageErrors, `pageErrors: ${errs.pageErrors.join(' | ')}`).toEqual([])
})
