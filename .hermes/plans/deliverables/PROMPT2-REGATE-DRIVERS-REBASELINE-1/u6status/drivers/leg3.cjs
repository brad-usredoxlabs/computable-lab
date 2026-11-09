// PROMPT2-REGATE-DRIVERS-REBASELINE-1 Leg 3 — ghost-paint + tooltip proof.
// chrome.cjs helper. NO /api/ai/** interception. Discard path.
// u6status: verdict predicate replaces unconditional PASS at :102.
const { chromium } = require('/home/brad/.hermes/cl/browser-receipts/harness/node_modules/playwright')
const fs = require('node:fs'), path = require('node:path')
const chrome = require(path.join(__dirname, 'chrome.cjs'))

const DIR = process.env.RECEIPT_DIR, SHOTS = path.join(DIR, 'shots')
const URL = 'http://localhost:5193/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline'
const PROMPT = 'Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.'
const OUT = path.join(DIR, 'leg3.json')

// leg3Verdict: pure function returning { status, failedCriteria } based on six criteria.
// Criteria (pre-registered 2026-11-08T03:00 UTC; AMENDED 2026-11-09 per Brad's ruling on
// clarification defaults — see .hermes/plans/decisions/CLARIFY-DEFAULT-ghost-first-ruling.md):
//   (a) card-unanswered     — IF a clarification card appeared, it must have been answered.
//                             A card is no longer REQUIRED: when the noun and verb resolve
//                             with reasonable certainty the app proposes on the plate and
//                             lets the tooltip show the assumptions. Amendment approved by
//                             Brad 2026-11-09: "In this case the correct action is A."
//   (b) preview-not-settled — settled === true && previewBarText non-empty
//   (c) no-preview-wells    — previewWells.length > 0
//   (d) tooltip-missing     — hoverE2.tooltip non-empty && hoverE2.tipVolume non-empty
//   (e) discard-unchanged   — discarded === true && after === before
function leg3Verdict(out) {
  const failed = []
  if (out.cardSeen === true && !(out.answer && out.answer.submitted === true)) failed.push('card-unanswered')
  if (out.settled !== true || !out.previewBarText || !String(out.previewBarText).trim()) failed.push('preview-not-settled')
  if (!out.previewWells || out.previewWells.length === 0) failed.push('no-preview-wells')
  if (!out.hoverE2 || !out.hoverE2.tooltip || !String(out.hoverE2.tooltip).trim() || !out.hoverE2.tipVolume || !String(out.hoverE2.tipVolume).trim()) failed.push('tooltip-missing')
  if (out.discarded !== true || out.after !== out.before) failed.push('discard-unchanged')
  return { status: failed.length ? 'FAIL' : 'PASS', failedCriteria: failed, clarificationPath: out.cardSeen === true ? 'asked-and-answered' : 'not-required' }
}

const T0 = Date.now(), el = () => +((Date.now() - T0) / 1000).toFixed(2)
const trail = []
const step = (a, t, x) => { const e = { t: el(), action: a, target: t, ...(x || {}) }; trail.push(e); console.log(JSON.stringify(e)) }
let seq = 50
const shot = async (page, label) => { seq += 1; const f = path.join(SHOTS, `${String(seq).padStart(2, '0')}-leg3-${label}.png`); await page.screenshot({ path: f, fullPage: true }); step('shot', label, { file: path.basename(f) }); return f }

;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
  const out = { url: URL, prompt: PROMPT, startedAt: new Date().toISOString(), note: 'ghost measurement then DISCARD' }
  page.on('request', (r) => { const u = r.url(); if (u.includes('/api/ai/')) out._aiReqs = (out._aiReqs || []).concat({ t: el(), method: r.method(), path: u.replace('http://localhost:5193', '') }) })
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="harness-chat-pane"] textarea', { timeout: 60000 })
    await page.waitForTimeout(4000); step('goto', URL)
    const picker = page.locator('[data-testid="thread-picker-select"]')
    if (await picker.count()) { const opts = await picker.locator('option').allTextContents(); const nt = opts.find((o) => /new thread/i.test(o))
      if (nt) { await picker.selectOption({ label: nt }); await page.waitForTimeout(1200) } }
    await page.locator('.lawn__tile-anchor .tile, .tile').first().click({ force: true }); await page.waitForTimeout(1500)
    try { await page.waitForSelector('main[aria-label="Labware focus"]', { timeout: 20000 }) } catch {}
    out.before = await page.evaluate(async () => (await (await fetch('/api/records/EVG-corpus2-prompt1-dmem-baseline')).json()).record.payload.events.length)
    step('before-events', String(out.before))
    await shot(page, 'labware-focus')

    await page.locator('main[aria-label="Labware focus"] [data-well-id="E2"]').first().click(); await page.waitForTimeout(400)
    await page.locator('main[aria-label="Labware focus"] [data-well-id="H5"]').first().click({ modifiers: ['Shift'] }); await page.waitForTimeout(600)
    const composer = page.locator('[data-testid="harness-chat-pane"] textarea').first()
    await composer.click(); await composer.fill(PROMPT)
    await page.locator('[data-testid="harness-chat-pane"] button:has-text("Send")').first().click()
    const tSend = el(); step('send', PROMPT, { tSend }); await shot(page, 'sent')

    let cardSeen = false
    for (let i = 0; i < 480; i++) { const a = await page.evaluate(() => { const g = document.querySelector('[data-testid="chat-clarification-card"]'); const s = document.querySelector('.chat-log-clarification'); return g ? 'grouped' : (s ? 'single' : 'none') })
      if (a !== 'none') { cardSeen = true; out.arm = a; break }
      if (el() - tSend > 120) break; await page.waitForTimeout(250) }
    out.cardSeen = cardSeen; await shot(page, cardSeen ? 'card' : 'no-card')
    step('card', cardSeen ? 'rendered' : 'NO card')

    out.answer = {}
    if (cardSeen) {
      out.answer.slotCount = await page.locator('[data-testid="chat-clarification-slot"]').count()
      try { const r = await chrome.answerSlot(page, 'identity', 'clofibrate'); out.answer.identity = r; step('answer-identity', 'picked', { picked: r.picked })
        await page.waitForTimeout(1800); await shot(page, 'identity') }
      catch (e) { out.answer.identityError = String(e).slice(0, 300); step('answer-identity', 'FAILED', { error: out.answer.identityError }) }
      try { const r = await chrome.answerSlot(page, 'quantity', '1'); out.answer.quantity = r; step('answer-quantity', 'approved', { approved: r.approved })
        await page.waitForTimeout(1000); await shot(page, 'quantity') }
      catch (e) { out.answer.quantityError = String(e).slice(0, 300); step('answer-quantity', 'FAILED', { error: out.answer.quantityError }) }
      out.submitDisabled = await page.evaluate(() => { const b = document.querySelector('[data-testid="chat-clarification-submit"]'); return b ? b.disabled : null })
      try { await chrome.submitAnswers(page); out.answer.submitted = true; step('submit', 'submitted', { wasDisabled: out.submitDisabled })
        await page.waitForTimeout(2000); await shot(page, 'submitted') }
      catch (e) { out.answer.submitError = String(e).slice(0, 300); out.answer.submitted = false; step('submit', 'FAILED', { error: out.answer.submitError }) }
    }

    let settled = false
    for (let i = 0; i < 960; i++) { const d = await page.evaluate(() => ({ pb: Boolean(document.querySelector('.preview-bar')), streaming: document.querySelectorAll('[data-testid="interpreting-stop"]').length }))
      if (d.pb && d.streaming === 0) { settled = true; break }
      if (el() - tSend > 260) break; await page.waitForTimeout(250) }
    out.settled = settled; await page.waitForTimeout(1500)
    step('settle', settled ? 'preview bar' : 'NO preview bar')

    // Ghost measurement — grid data-preview + fills
    out.gridFills = await page.evaluate(() => { const o = {}; document.querySelectorAll('main[aria-label="Labware focus"] [data-well-id]').forEach((e) => { o[e.getAttribute('data-well-id')] = { fill: e.getAttribute('fill') || getComputedStyle(e).fill, preview: e.getAttribute('data-preview') } }); return o })
    // Deck data-preview
    out.deckPreview = await page.evaluate(() => { const o = {}; document.querySelectorAll('[data-preview]').forEach((e) => { o[e.getAttribute('data-well-id')] = e.getAttribute('data-preview') }); return o })
    out.previewWells = Object.entries(out.gridFills).filter(([, v]) => v.preview === 'true').map(([k]) => k)
    out.ghostFills = Object.entries(out.gridFills).filter(([, v]) => /51, 154, 240/.test(v.fill)).map(([k]) => k)
    out.previewBarText = await page.evaluate(() => { const pb = document.querySelector('.preview-bar'); return pb ? (pb.innerText || '').replace(/\s+/g, ' ') : null })
    step('ghost', 'measured', { previewWells: out.previewWells.length, ghostFills: out.ghostFills.length, deckPreview: Object.keys(out.deckPreview).length, bar: out.previewBarText })
    await shot(page, 'ghost-measured')

    // Hover E2 — tooltip proof
    const w = page.locator('main[aria-label="Labware focus"] [data-well-id="E2"]').first()
    await w.hover({ force: true }); await page.waitForTimeout(700)
    out.hoverE2 = await page.evaluate(() => {
      const tip = document.querySelector('.well-tooltip'); const well = document.querySelector('main[aria-label="Labware focus"] [data-well-id="E2"]')
      return { tooltip: tip ? (tip.innerText || '').replace(/\s+/g, ' ').slice(0, 600) : null,
        wellFill: well ? (well.getAttribute('fill') || getComputedStyle(well).fill) : null,
        tipVolume: tip && tip.querySelector('.well-tooltip__volume') ? tip.querySelector('.well-tooltip__volume').innerText : null }
    })
    step('hover-E2', out.hoverE2.tooltip || 'no tooltip'); await shot(page, 'tooltip-E2')

    // Discard
    if (out.previewBarText) {
      try { await chrome.discard(page); out.discarded = true; step('discard', 'clicked')
        for (let i = 0; i < 60; i++) { if (!(await page.evaluate(() => Boolean(document.querySelector('.preview-bar'))))) break; await page.waitForTimeout(400) }
        await page.waitForTimeout(1500) }
      catch (e) { out.discardError = String(e).slice(0, 300); step('discard', 'FAILED', { error: out.discardError }) }
    }
    out.after = await page.evaluate(async () => (await (await fetch('/api/records/EVG-corpus2-prompt1-dmem-baseline')).json()).record.payload.events.length)
    step('after', 'events', { before: out.before, after: out.after, unchanged: out.after === out.before }); await shot(page, 'after-discard')
    const v = leg3Verdict(out); out.status = v.status; out.failedCriteria = v.failedCriteria; step('verdict', out.status, { failedCriteria: v.failedCriteria })
  } catch (e) { out.error = String(e).slice(0, 1000); out.status = 'FAIL'; step('error', out.error); try { await shot(page, 'error') } catch {} }
  out.trail = trail; await browser.close()
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log('WROTE', OUT)
})().catch((e) => { console.error('DRIVER FAILED', e); process.exit(1) })
