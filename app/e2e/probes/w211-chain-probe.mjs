// W211-MACH-1 chain-timeline probe (coder diagnostic): replicate the G1 chain
// (fill -> localize -> answer axes -> submit) while logging a 400ms timeline of
// thread state (remount marker, cards, clarify, textarea hash) + every compile
// response. Reveals WHEN the thread remounts relative to the draws.
import { chromium } from '@playwright/test'
import { readFileSync } from 'node:fs'

const BASE = 'http://localhost:5293'
const RUN = 'RUN-w211-gate'
const EVG = 'EVG-w211-gate'
const NONCE = 'v211g1'

const fxText = readFileSync('/mnt/vast/home/brad/git/wt/W211-MACH-1-lane2-l2t1210/app/e2e/fixtures/w211-golden/zymo-intent.frozen.yaml', 'utf8')
  .split('protocolText: |\n')[1].split('\n#')[0]

const browser = await chromium.launch()
const page = await browser.newPage()
const t0 = Date.now()
const el = () => Date.now() - t0
page.on('response', async (r) => {
  if (r.url().includes('/intent/compile-from-prompt')) {
    let post = ''
    try { post = (await r.request().postData()) ?? '' } catch { /* noop */ }
    console.log(`t=${el()}ms COMPILE http=${r.status()} nonce=${post.includes(NONCE) ? 'YES' : 'no'} answers=${post.includes('"answers"') ? 'YES' : 'no'}`)
  }
})
await page.goto(`${BASE}/`)
await page.evaluate((u) => window.localStorage.setItem('cl.currentUserId', u), 'USR-BRAD')
await page.goto(`${BASE}/deck/${EVG}/${RUN}`)
await page.waitForLoadState('networkidle')
await page.getByTestId('right-pane-tab-protocol').click()

const textArea = page.getByTestId('pl-protocol-text')
async function snap(tag) {
  const s = await textArea.evaluate((n) => {
    const had = n.getAttribute('data-w211-probe') === '1'
    n.setAttribute('data-w211-probe', '1')
    return {
      had,
      cards: document.querySelector('[data-testid="pl-clarification-cards"]') !== null,
      clarify: document.querySelector('[data-testid="pl-clarify"]') !== null,
      submitDisabled: (() => { const b = document.querySelector('[data-testid="pl-submit-answers"]'); return b ? b.getAttribute('disabled') !== null : null })(),
      val: n.value.slice(0, 30).replace(/\s+/g, ' '),
    }
  }).catch(() => null)
  console.log(`t=${el()}ms ${tag} markerSurvived=${s?.had} cards=${s?.cards} clarify=${s?.clarify} submitDisabled=${s?.submitDisabled} text="${s?.val}"`)
  return s
}

await snap('after-tab-click')
await page.waitForTimeout(3000)
await snap('t+3s')
await textArea.fill(fxText)
await snap('after-fill')
await page.getByTestId('pl-localize-btn').click()
for (let i = 0; i < 12; i += 1) { await snap(`post-localize-${i}`); await page.waitForTimeout(500) }
const rack = page.getByTestId('pl-clarify').locator('.pl-axis__choice', { hasText: /BashingBead Lysis Rack/i }).first().locator('input[type="radio"]')
await rack.check()
await snap('after-rack-check')
await page.getByTestId('pl-submit-answers').click()
for (let i = 0; i < 40; i += 1) { await snap(`post-submit-${i}`); await page.waitForTimeout(500) }
await browser.close()
