// HARNESS-SEQ-1 fix1 probe C: FULL spec sequence (legs a,b,d,e) with timing
// instrumentation, to bisect which leg makes the EcoRI pick not fire.
import { chromium } from 'playwright'

const BASE = process.env.PROBE_BASE || 'http://127.0.0.1:5311'
const SKIP_B = process.env.SKIP_B === '1'
const SKIP_D = process.env.SKIP_D === '1'

const catalog = {
  records: [
    { recordId: 'SEQ-PUC19', payload: { kind: 'sequence', label: 'pUC19', length: 2686, alphabet: 'iupac_dna' } },
    { recordId: 'SEQ-LAMBDA', payload: { kind: 'sequence', label: 'Lambda control', length: 48502, alphabet: 'iupac_dna' } },
  ],
}

const browser = await chromium.launch({ headless: true })
const page = await browser.newPage()
page.on('pageerror', e => console.log('PAGEERROR:', e.message))
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text()) })

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
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    if (!Array.isArray(window.clStreamRequests)) window.clStreamRequests = []
    if (url.includes('/api/ai/assist/stream')) {
      const body = String(init?.body ?? '')
      window.clStreamRequests.push(body)
      window.__marks.push(['fetch#' + window.clStreamRequests.length + (body.includes('Use EcoRI') ? '(answer)' : ''), performance.now()])
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

if (!SKIP_D) {
  const header = page.locator('[data-testid="surface-focus-header"]')
  await header.waitFor()
  await page.getByRole('button', { name: 'Analysis', exact: true }).click()
  await page.locator('.sequence-library button').filter({ hasText: 'pUC19' }).click()
}

if (!SKIP_B) {
  await composer.fill('Draft an analysis of pUC19')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await log.getByText('Draft an analysis of pUC19').waitFor()
  await page.waitForFunction(() => !!(window).emitChatText)
  await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor()
  await page.evaluate(() => window.emitChatText?.('Streaming the pUC19 analysis…'))
  await log.getByText('Streaming the pUC19 analysis').waitFor()
  await page.evaluate(() => window.endChatStream?.())
  await page.getByRole('button', { name: 'Cancel', exact: true }).waitFor({ state: 'detached' })
}

await composer.fill('Cut this sequence')
await page.getByRole('button', { name: 'Send', exact: true }).click()
await log.getByText('Which enzyme should cut this?').waitFor()
await log.getByText('1. EcoRI').waitFor()
await log.getByText('2. BamHI').waitFor()
const before = await page.evaluate(() => window.clStreamRequests?.length ?? 0)
await page.getByRole('button', { name: '1. EcoRI' }).click()
const immediate = await page.evaluate(() => window.clStreamRequests?.length ?? 0)
console.log(`SKIP_B=${SKIP_B} SKIP_D=${SKIP_D} before=${before} immediate-after-click=${immediate}`)
let fired = immediate > before
if (!fired) {
  try { await page.waitForFunction((b) => (window.clStreamRequests?.length ?? 0) > b, before, { timeout: 5000 }); fired = true } catch { /* never fired */ }
}
console.log('answer fired eventually:', fired)
const marks = await page.evaluate(() => window.__marks)
for (const [name, t] of marks) console.log('  ', name, t.toFixed(1))
if (fired) {
  const body = await page.evaluate(() => window.clStreamRequests?.at(-1) ?? '')
  console.log('answer body ok:', body.includes('Use EcoRI for sequence.'))
  await log.getByText('EcoRI it is.').waitFor({ timeout: 5000 }).then(() => console.log('answer turn rendered')).catch(() => console.log('answer turn NOT rendered'))
}
await browser.close()
