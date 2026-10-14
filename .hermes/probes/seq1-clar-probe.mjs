// HARNESS-SEQ-1 fix1 probe: does the clarification-option click fire the
// follow-up stream request LATE (timing race) or NEVER (handler bug)?
// Mirrors e2e/sequences-harness-chat.spec.ts stubs exactly; adds timed polls.
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
page.on('console', m => { if (m.type() === 'error') console.log('CONSOLE-ERR:', m.text()) })
page.on('request', r => { if (r.url().includes('/api/ai/assist/stream')) console.log('CDP-REQUEST t=' + Date.now()) })

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
  window.fetch = (input, init) => {
    const url = input instanceof Request ? input.url : String(input)
    const state = window
    if (!Array.isArray(state.clStreamRequests)) state.clStreamRequests = []
    if (url.includes('/api/ai/assist/stream')) {
      const body = String(init?.body ?? '')
      state.clStreamRequests.push(body)
      console.log('STREAM-FIRE t=' + performance.now().toFixed(0) + ' body=' + body.slice(0, 120))
      const stream = new ReadableStream({ start(controller) {
        const emit = (event) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
        if (body.includes('Use EcoRI')) {
          emit({ type: 'done', result: { success: true, events: [], notes: [], clarificationNeeded: 'EcoRI it is.' } })
          controller.close()
          return
        }
        if (body.includes('Cut this sequence')) {
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

await page.goto(`${BASE}/sequences`)
await page.locator('[data-testid="harness-chat-pane"]').waitFor({ timeout: 15000 })
const log = page.getByRole('log', { name: 'Conversation' })
const composer = page.getByLabel('Message', { exact: true })

// leg (d)
await page.getByRole('button', { name: 'Analysis', exact: true }).click()
await page.locator('.sequence-library button').filter({ hasText: 'pUC19' }).click()
console.log('after clicks count:', await page.evaluate(() => window.clStreamRequests?.length ?? 0))

// leg (b)
await composer.fill('Draft an analysis of pUC19')
await page.getByRole('button', { name: 'Send', exact: true }).click()
await page.waitForFunction(() => !!(window).emitChatText)
await page.evaluate(() => window.emitChatText?.('Streaming the pUC19 analysis…'))
await page.evaluate(() => window.endChatStream?.())
await page.waitForFunction(() => (window.clStreamRequests?.length ?? 0) === 1)

// leg (e)
await composer.fill('Cut this sequence')
await page.getByRole('button', { name: 'Send', exact: true }).click()
await log.getByText('Which enzyme should cut this?').waitFor({ timeout: 5000 })
await log.getByText('1. EcoRI').waitFor({ timeout: 5000 })
const before = await page.evaluate(() => window.clStreamRequests?.length ?? 0)
console.log('requestsBeforePick:', before)
await page.getByRole('button', { name: '1. EcoRI' }).click()
const t0 = Date.now()
for (const delay of [0, 50, 100, 250, 500, 1000, 2000]) {
  if (delay > 0) await page.waitForTimeout(delay - (delay === 50 ? 0 : 0))
  const n = await page.evaluate(() => window.clStreamRequests?.length ?? 0)
  console.log(`t+${delay}ms count=${n}`)
  if (n >= before + 1) break
}
console.log('last body:', await page.evaluate(() => window.clStreamRequests?.at(-1) ?? '').then(b => b.slice(0, 200)))
const logText = await log.innerText()
console.log('log contains EcoRI it is.:', logText.includes('EcoRI it is.'))
await browser.close()
