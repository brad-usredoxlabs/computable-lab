// HARNESS-SEQ-1 fix1 probe B: measure the exact click -> fetch gap for the
// clarification-option answer turn, and the Playwright evaluate round-trip cost.
import { chromium } from 'playwright'

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:5311'

const catalog = {
  records: [
    { recordId: 'SEQ-PUC19', payload: { kind: 'sequence', label: 'pUC19', length: 2686, alphabet: 'iupac_dna' } },
    { recordId: 'SEQ-LAMBDA', payload: { kind: 'sequence', label: 'Lambda control', length: 48502, alphabet: 'iupac_dna' } },
  ],
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('pageerror', e => console.log('PAGEERROR:', e.message))

await page.route('**/api/**', async route => {
  const request = route.request()
  const path = new URL(request.url()).pathname
  if (path === '/api/ai/threads/sequences') { await route.fulfill({ json: { endpoint: 'sequences', userId: 'USR-TEST', mentions: [], updatedAt: '2026-10-14T00:00:00Z', messages: [] } }); return }
  if (path === '/api/sequences/catalog') { await route.fulfill({ json: catalog }); return }
  if (path === '/api/sequences/contract') { await route.fulfill({ json: { schema: { oneOf: [] }, capabilities: { engines: [] }, alphabets: { dna: { symbols: { A: 'A', C: 'C', G: 'G', T: 'T' } } } } }); return }
  if (request.method() !== 'GET') { await route.fulfill({ json: {} }); return }
  await route.continue()
})
await page.addInitScript(() => {
  const originalFetch = window.fetch.bind(window)
  window.__marks = []
  const mark = (name) => window.__marks.push([name, performance.now()])
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!Array.isArray(window.clStreamRequests)) window.clStreamRequests = []
    if (url.includes('/api/ai/assist/stream')) {
      const body = String(init?.body ?? '')
      window.clStreamRequests.push(body)
      mark('fetch#' + window.clStreamRequests.length + (body.includes('Use EcoRI') ? '(answer)' : ''))
      const stream = new ReadableStream({ start(controller) {
        const emit = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
        if (body.includes('Use EcoRI')) { emit({ type: 'done', result: { success: true, events: [], notes: [], clarificationNeeded: 'EcoRI it is.' } }); controller.close(); return }
        if (body.includes('Cut this sequence')) { emit({ type: 'done', result: { success: true, events: [], notes: [], clarification: { id: 'clar-1', prompt: 'Which enzyme should cut this?', entityType: 'sequence', options: [{ id: 'opt-1', label: 'EcoRI' }, { id: 'opt-2', label: 'BamHI' }] } } }); controller.close(); return }
        window.emitChatText = delta => emit({ type: 'text_delta', delta })
        window.endChatStream = () => { controller.close(); delete window.emitChatText }
      } })
      return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
    }
    return originalFetch(input, init)
  }
})

await page.goto(`${BASE}/sequences`)
await page.locator('[data-testid="harness-chat-pane"]').waitFor({ timeout: 15000 })
const log = page.getByRole('log', { name: 'Conversation' })
const composer = page.getByLabel('Message', { exact: true })

await composer.fill('Cut this sequence')
await page.getByRole('button', { name: 'Send', exact: true }).click()
await log.getByText('1. EcoRI').waitFor({ timeout: 5000 })
const before = await page.evaluate(() => window.clStreamRequests?.length ?? 0)

// Instrument the option button click IN-PAGE so we see the React handler time.
await page.evaluate(() => {
  const btn = [...document.querySelectorAll('button')].find(b => b.textContent === '1. EcoRI')
  btn.addEventListener('mousedown', () => window.__marks.push(['option-mousedown', performance.now()]))
  btn.addEventListener('mouseup', () => window.__marks.push(['option-mouseup(react onClick runs here)', performance.now()]))
})
const t0 = await page.evaluate(() => performance.now())
await page.getByRole('button', { name: '1. EcoRI' }).click()
const t1 = await page.evaluate(() => performance.now())
const immediate = await page.evaluate(() => window.clStreamRequests?.length ?? 0)
await page.waitForFunction((b) => (window.clStreamRequests?.length ?? 0) > b, before, { timeout: 10_000 })
const t2 = await page.evaluate(() => performance.now())
const marks = await page.evaluate(() => window.__marks)
console.log('requestsBeforePick:', before)
console.log('evaluate round-trip baseline t0:', t0.toFixed(1))
console.log('evaluate right after click t1:', t1.toFixed(1), '(gap from t1 to click return ~1-3ms)')
console.log('count read IMMEDIATELY after click():', immediate, '(spec line 129 reads here)')
console.log('count crossed before+1 at t2:', t2.toFixed(1), '=> click->fetch gap ~', (t2 - t1).toFixed(1), 'ms (upper bound)')
console.log('page-side marks:')
for (const [name, t] of marks) console.log('  ', name, t.toFixed(1))
console.log('answer body:', (await page.evaluate(() => window.clStreamRequests?.at(-1) ?? '')).slice(0, 60))
await browser.close()
