// W211-MACH-1 remount-timeline probe (coder diagnostic, not a gate):
// navigate the run's deck Protocol tab, mark the thread textarea with a probe
// attribute, and log every poll where the marker is ABSENT (=> the thread
// remounted) plus the textarea value hash / cards / clarify state.
import { chromium } from '@playwright/test'

const BASE = 'http://localhost:5293'
const RUN = 'RUN-w211-gate'
const EVG = 'EVG-w211-gate'

const browser = await chromium.launch()
const page = await browser.newPage()
await page.goto(`${BASE}/`)
await page.evaluate((u) => window.localStorage.setItem('cl.currentUserId', u), 'USR-BRAD')
await page.goto(`${BASE}/deck/${EVG}/${RUN}`)
await page.waitForLoadState('networkidle')
await page.getByTestId('right-pane-tab-protocol').click()

const compiles = []
page.on('response', (r) => {
  if (r.url().includes('/intent/compile-from-prompt')) compiles.push(`${Math.round(performance.now() - t0)}ms HTTP ${r.status()}`)
})

const t0 = performance.now()
const textArea = page.getByTestId('pl-protocol-text')
let prevHash = null
for (let i = 0; i < 90; i += 1) {
  const t = Math.round(performance.now() - t0)
  const state = await textArea.evaluate((el) => {
    const had = el.getAttribute('data-w211-probe') === '1'
    el.setAttribute('data-w211-probe', '1')
    const cards = document.querySelector('[data-testid="pl-clarification-cards"]') !== null
    const clarify = document.querySelector('[data-testid="pl-clarify"]') !== null
    const submit = document.querySelector('[data-testid="pl-submit-answers"]')
    return { had, cards, clarify, submitDisabled: submit ? submit.getAttribute('disabled') !== null : null, val: el.value }
  }).catch((e) => ({ error: String(e).slice(0, 80) }))
  const hash = state.val ? state.val.slice(0, 40).replace(/\s+/g, ' ') : null
  const changed = hash !== prevHash
  console.log(`t=${t}ms markerSurvived=${state.had} cards=${state.cards} clarify=${state.clarify} submitDisabled=${state.submitDisabled} textChanged=${changed ? 'YES' : 'no'} text="${(hash ?? '').slice(0, 46)}" compiles=[${compiles.join(', ')}]`)
  prevHash = hash
  await page.waitForTimeout(500)
}
await browser.close()
