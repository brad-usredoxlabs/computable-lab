import { test, expect } from '@playwright/test'

/**
 * HARNESS-SEQ-1 rule-12 e2e: the /sequences right pane is the shared
 * HarnessChatPane (data-testid="harness-chat-pane") hosting the chat registered
 * through the seam, with a derived working-focus header.
 *
 * Stub pattern copied from e2e/sequence-chat-scroll.spec.ts:21-53
 * (page.route for thread/catalog/contract + addInitScript fetch-swap for
 * /api/ai/assist/stream). The fetch-swap also SPYS on stream requests so the
 * focus-follows-clicks leg can assert ZERO model calls.
 */

type StreamWindow = Window & {
  emitChatText?: (text: string) => void
  endChatStream?: () => void
  clStreamRequests?: string[]
}

const catalog = {
  records: [
    { recordId: 'SEQ-PUC19', payload: { kind: 'sequence', label: 'pUC19', length: 2686, alphabet: 'iupac_dna' } },
    { recordId: 'SEQ-LAMBDA', payload: { kind: 'sequence', label: 'Lambda control', length: 48502, alphabet: 'iupac_dna' } },
    // DEFECT-1 (gate 2026-10-15_1255 leg5): a catalog record the Library never
    // shows and the surface does not declare selectable (surfaces.yaml
    // selectableKinds). The agent path must refuse it with zero state change.
    { recordId: 'ANR-000001', payload: { kind: 'analysis-run', label: 'PB-CH-5 review revision', title: 'PB-CH-5 review revision', status: 'queued' } },
  ],
}

test('sequences right pane is the harness chat pane with a derived focus header', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/ai/threads/sequences') {
      await route.fulfill({ json: { endpoint: 'sequences', userId: 'USR-TEST', mentions: [], updatedAt: '2026-10-14T00:00:00Z', messages: [] } }); return
    }
    if (path === '/api/sequences/catalog') {
      await route.fulfill({ json: catalog }); return
    }
    if (path === '/api/sequences/contract') {
      await route.fulfill({ json: { schema: { oneOf: [] }, capabilities: { engines: [] }, alphabets: { dna: { symbols: { A: 'A', C: 'C', G: 'G', T: 'T' } } } } }); return
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ json: {} }); return
    }
    await route.continue()
  })
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      const state = window as StreamWindow
      if (!Array.isArray(state.clStreamRequests)) state.clStreamRequests = []
      if (url.includes('/api/ai/assist/stream')) {
        const body = String(init?.body ?? '')
        state.clStreamRequests.push(body)
        const stream = new ReadableStream<Uint8Array>({ start(controller) {
          const emit = (event: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
          if (body.includes('Use EcoRI')) {
            // The round-trip answer turn: the chosen term rode the prompt body.
            // Checked FIRST — the history array in later requests also contains
            // the earlier 'Cut this sequence' prompt.
            emit({ type: 'done', result: { success: true, events: [], notes: [], clarificationNeeded: 'EcoRI it is.' } })
            controller.close()
            return
          }
          if (body.includes('Cut this sequence')) {
            // Stub the sequences backend's clarification turn (real emission is
            // HARNESS-SEQ-2's duty; forceDraftTool is hard-true today).
            emit({ type: 'done', result: { success: true, events: [], notes: [], clarification: { id: 'clar-1', prompt: 'Which enzyme should cut this?', entityType: 'sequence', options: [{ id: 'opt-1', label: 'EcoRI' }, { id: 'opt-2', label: 'BamHI' }] } } })
            controller.close()
            return
          }
          state.emitChatText = delta => emit({ type: 'text_delta', delta })
          state.endChatStream = () => { controller.close(); delete state.emitChatText }
        } })
        return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
      }
      return originalFetch(input, init)
    }
  })

  await page.goto('/sequences')

  // (a) The pane is the shared harness chat pane, alongside the Library nav
  // (three-pane geometry: nav | main | chat).
  const pane = page.locator('[data-testid="harness-chat-pane"]')
  await expect(pane).toBeVisible({ timeout: 15_000 })
  await expect(page.locator('.cl-workspace__pane--chat')).toBeVisible()
  await expect(page.locator('.sequence-library')).toBeVisible()
  await expect(page.getByRole('log', { name: 'Conversation' })).toBeVisible()

  // (d) Focus follows resolved surface state — tab click, then a Library record
  // click — with ZERO /api/ai/assist/stream requests fired on those clicks.
  const header = page.locator('[data-testid="surface-focus-header"]')
  await expect(header).toContainText('Working focus')
  await expect(header).toContainText('Sequences — Editor')
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  await expect(header).toContainText('Sequences — Analysis')
  await page.locator('.sequence-library button').filter({ hasText: 'pUC19' }).click()
  await expect(header).toContainText('Sequences — Editor · pUC19')
  const streamRequestsAfterClicks = await page.evaluate(() => (window as StreamWindow).clStreamRequests?.length ?? 0)
  expect(streamRequestsAfterClicks).toBe(0)

  // (b) Type + Send -> user bubble in the Conversation log, streaming state
  // toggles, streamed reply lands via the stub window hook.
  const log = page.getByRole('log', { name: 'Conversation' })
  const composer = page.getByLabel('Message', { exact: true })
  await composer.fill('Draft an analysis of pUC19')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(log).toContainText('Draft an analysis of pUC19')
  await page.waitForFunction(() => !!(window as StreamWindow).emitChatText)
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toBeVisible()
  await page.evaluate(() => (window as StreamWindow).emitChatText?.('Streaming the pUC19 analysis…'))
  await expect(log).toContainText('Streaming the pUC19 analysis')
  await page.evaluate(() => (window as StreamWindow).endChatStream?.())
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)

  // (e) Clarification round-trip: the stub `done` result carrying
  // clarification:{prompt,options} renders numbered options; clicking one fires
  // a SECOND stream request whose body carries the chosen term.
  await composer.fill('Cut this sequence')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(log).toContainText('Which enzyme should cut this?')
  await expect(log).toContainText('1. EcoRI')
  await expect(log).toContainText('2. BamHI')
  const requestsBeforePick = await page.evaluate(() => (window as StreamWindow).clStreamRequests?.length ?? 0)
  await page.getByRole('button', { name: '1. EcoRI' }).click()
  // The pick goes through chat.sendPrompt, which flushSyncs the user bubble and
  // then awaits waitForNextPaint() (requestAnimationFrame + setTimeout 0) before
  // the stream fetch fires — measured: fetch lands ~6ms after the React onClick
  // and ~37ms after the pre-pick read, i.e. AFTER a single eager page.evaluate
  // round-trip (~2-5ms) following click(). Poll the SAME count instead of
  // reading it once: the assertion is unchanged (exactly one additional request,
  // proven fired, with the term in its body), only the read is timed.
  await expect
    .poll(() => page.evaluate(() => (window as StreamWindow).clStreamRequests?.length ?? 0), { timeout: 10_000 })
    .toBe(requestsBeforePick + 1)
  const requestsAfterPick = await page.evaluate(() => (window as StreamWindow).clStreamRequests?.length ?? 0)
  expect(requestsAfterPick).toBe(requestsBeforePick + 1)
  const lastBody = await page.evaluate(() => (window as StreamWindow).clStreamRequests?.at(-1) ?? '')
  expect(lastBody).toContain('Use EcoRI for sequence.')
  await expect(log).toContainText('EcoRI it is.')

  expect(errors).toEqual([])
})

/**
 * HARNESS-SEQ-2 legs: a compiled agent_action frame drives the sequences
 * surfaces through the same paths a human click uses.
 *
 * The stub stream emits the EXACT frame shapes the server emits (agent_action
 * after compile ok; pipeline_diagnostics + notes for a refused compile) —
 * the REAL-MODEL leg is the browser gate's; this spec proves the CLIENT
 * execution contract: tab switch, record select, invalid-action no-op with an
 * explainable line, and the canLeave() block with the honest message.
 */
test('agent_action frames drive the tab, the selection, and refuse honestly', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  // Spy on the authoring fetch the editor fires when a record is selected —
  // the gate's DEFECT-1 symptom was GET /api/sequences/authoring/ANR-000001
  // -> 422. A refused focus must fire ZERO of these.
  const authoringRequests: string[] = []

  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/ai/threads/sequences') {
      await route.fulfill({ json: { endpoint: 'sequences', userId: 'USR-TEST', mentions: [], updatedAt: '2026-10-14T00:00:00Z', messages: [] } }); return
    }
    if (path === '/api/sequences/catalog') {
      await route.fulfill({ json: catalog }); return
    }
    if (path === '/api/sequences/contract') {
      await route.fulfill({ json: { schema: { oneOf: [] }, capabilities: { engines: [] }, alphabets: { dna: { symbols: { A: 'A', C: 'C', G: 'G', T: 'T' } } } } }); return
    }
    const authoring = path.match(/^\/api\/sequences\/authoring\/(.+)$/)
    if (authoring) {
      const recordId = decodeURIComponent(authoring[1]!)
      authoringRequests.push(recordId)
      const record = catalog.records.find(r => r.recordId === recordId)
      await route.fulfill({ json: { sourceId: `REV-${recordId}`, sourceHash: 'hash', form: { sequence: { label: record?.payload.label ?? recordId, residues: 'GATC'.repeat(16), alphabet: 'dna', topology: 'linear' }, modifications: [], vendor: '', oligo: false }, author: 'USR-test' } }); return
    }
    if (path === '/api/drafts/compile') {
      await route.fulfill({ json: { draftId: 'DRAFT-e2e', revision: 1, reviewHash: 'review-e2e', canAccept: true, projection: { sequence: { label: 'e2e draft', residues: 'GATC'.repeat(16), alphabet: 'dna', topology: 'linear' }, modifications: [] }, writes: [], diagnostics: [] } }); return
    }
    if (path === '/api/drafts/accept') {
      // A 5xx accept marks the draft incomplete -> canLeave() === false.
      await route.fulfill({ status: 500, json: { message: 'e2e accept failure' } }); return
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ json: {} }); return
    }
    await route.continue()
  })
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      const state = window as StreamWindow
      if (!Array.isArray(state.clStreamRequests)) state.clStreamRequests = []
      if (url.includes('/api/ai/assist/stream')) {
        const body = String(init?.body ?? '')
        state.clStreamRequests.push(body)
        const stream = new ReadableStream<Uint8Array>({ start(controller) {
          const emit = (event: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
          const close = () => controller.close()
          // Branch on the request's OWN prompt field — the history array in
          // later bodies carries earlier prompts, so body.includes() misroutes.
          let prompt = ''
          try { prompt = String(JSON.parse(body)?.prompt ?? '') } catch { /* fall through */ }
          if (prompt === 'switch to the Settings tab') {
            // The refused-compile shape: diagnostics frame + notes, NO action.
            emit({ type: 'pipeline_diagnostics', outcome: 'gap', diagnostics: [{ pass_id: 'workspace-action-compile', code: 'UNSUPPORTED_TARGET', severity: 'error', message: 'Tab "Settings" is not a tab the sequences surface declares (Editor, Assay, Analysis, Setup, Import, Knowledge). Switch to a tab the surface actually declares.' }] })
            emit({ type: 'done', result: { success: true, notes: ['Tab "Settings" is not a tab the sequences surface declares (Editor, Assay, Analysis, Setup, Import, Knowledge). Switch to a tab the surface actually declares.'] } })
            close(); return
          }
          if (prompt === 'show me pUC19') {
            emit({ type: 'agent_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'SEQ-PUC19', label: 'pUC19' } } })
            emit({ type: 'done', result: { success: true, notes: ['Focused on pUC19 — nothing was written.'] } })
            close(); return
          }
          if (prompt === 'show me Lambda control') {
            emit({ type: 'agent_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'SEQ-LAMBDA', label: 'Lambda control' } } })
            emit({ type: 'done', result: { success: true, notes: ['Focused on Lambda control — nothing was written.'] } })
            close(); return
          }
          if (prompt === 'switch to the Analysis tab') {
            emit({ type: 'agent_action', action: { action: 'open-surface', surface: 'sequences', target: { kind: 'sequence-tab', tab: 'Analysis' } } })
            emit({ type: 'done', result: { success: true, notes: ['Opened Analysis — nothing was written.'] } })
            close(); return
          }
          if (prompt === 'focus on record ANR-000001') {
            // The gate leg5 frame verbatim: the SERVER compiles it fine (the
            // record exists and is readable) — the DEFECT was the CLIENT
            // selecting an analysis-run the surface does not declare selectable.
            emit({ type: 'agent_action', action: { action: 'focus', surface: 'sequences', target: { kind: 'sequence-record', recordId: 'ANR-000001', label: 'PB-CH-5 review revision' } } })
            emit({ type: 'done', result: { success: true, notes: [] } })
            close(); return
          }
          emit({ type: 'done', result: { success: true, notes: [] } })
          close()
        } })
        return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
      }
      return originalFetch(input, init)
    }
  })

  await page.goto('/sequences')
  const log = page.getByRole('log', { name: 'Conversation' })
  const composer = page.getByLabel('Message', { exact: true })
  const header = page.locator('[data-testid="surface-focus-header"]')
  const tabButton = (name: string) => page.getByRole('button', { name, exact: true })

  // Leg 1: a sequence-tab frame switches the tab and the derived focus header.
  await composer.fill('switch to the Analysis tab')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(tabButton('Analysis')).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })
  await expect(header).toContainText('Sequences — Analysis')
  await expect(log).toContainText('Opened Analysis — nothing was written.')

  // Leg 2: a sequence-record frame selects the record through selectRecord
  // (Editor tab active, record shown, focus header follows).
  await composer.fill('show me Lambda control')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(tabButton('Editor')).toHaveAttribute('aria-pressed', 'true', { timeout: 10_000 })
  await expect(header).toContainText('Sequences — Editor · Lambda control')

  // Leg 2b (DEFECT-1, gate 2026-10-15_1255 leg5): a focus frame for a catalog
  // record whose KIND the surface does not declare selectable (analysis-run,
  // absent from surfaces.yaml sequences.selectableKinds) changes NOTHING and
  // names why — no selection, no tab move, no editor fetch (the gate's 422),
  // and the Library never shows it.
  const authoringBefore = authoringRequests.length
  await composer.fill('focus on record ANR-000001')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(log).toContainText('ANR-000001', { timeout: 10_000 })
  await expect(log).toContainText('analysis-run')
  await expect(header).toContainText('Sequences — Editor · Lambda control')
  await expect(tabButton('Editor')).toHaveAttribute('aria-pressed', 'true')
  expect(authoringRequests.slice(authoringBefore)).toEqual([])
  await expect(page.getByRole('alert')).toHaveCount(0)

  // Leg 3 (negative): an undeclared tab changes NOTHING and says why.
  const pressedBefore = await tabButton('Editor').getAttribute('aria-pressed')
  await composer.fill('switch to the Settings tab')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(log).toContainText('Tab "Settings" is not a tab the sequences surface declares')
  expect(await tabButton('Editor').getAttribute('aria-pressed')).toBe(pressedBefore)
  await expect(tabButton('Settings')).toHaveCount(0)
  await expect(header).toContainText('Lambda control')

  // Leg 4 (canLeave): with an unsaved draft in the Editor, a record switch is
  // BLOCKED with an honest line and the draft/selection stay intact.
  await page.getByRole('button', { name: 'Review and save sequence' }).click()
  await expect(page.getByRole('button', { name: 'Accept and save' })).toBeEnabled({ timeout: 10_000 })
  await page.getByRole('button', { name: 'Accept and save' }).click()
  await expect(page.getByText('Save incomplete — retry to finish')).toBeVisible({ timeout: 10_000 })
  await composer.fill('show me pUC19')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await expect(log).toContainText('unsaved sequence draft')
  await expect(header).toContainText('Lambda control')

  expect(errors).toEqual([])
})
