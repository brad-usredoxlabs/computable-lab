// PROMPT2-REGATE-DRIVERS-REBASELINE-1 Leg 4 — concept-answer + volume-slot proof.
// chrome.cjs helper. KEY: both identity AND quantity slots committed -> preview bar appears.
// Stale leg4 failed: answered only identity, submit disabled, previewWells=0.
const { chromium } = require('/home/brad/.hermes/cl/browser-receipts/harness/node_modules/playwright')
const fs = require('node:fs'), path = require('node:path')
const chrome = require(path.join(__dirname, 'chrome.cjs'))

const DIR = process.env.RECEIPT_DIR, SHOTS = path.join(DIR, 'shots')
const URL = 'http://localhost:5193/project/STU-scratch/event-graph/EVG-corpus2-prompt1-dmem-baseline'
const PROMPT = 'Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.'
const OUT = path.join(DIR, 'leg4.json')

const T0 = Date.now(), el = () => +((Date.now() - T0) / 1000).toFixed(2)
const trail = []
const step = (a, t, x) => { const e = { t: el(), action: a, target: t, ...(x || {}) }; trail.push(e); console.log(JSON.stringify(e)) }
let seq = 100
const shot = async (page, label) => { seq += 1; const f = path.join(SHOTS, `${String(seq).padStart(2, '0')}-leg4-${label}.png`); await page.screenshot({ path: f, fullPage: true }); step('shot', label, { file: path.basename(f) }); return f }

;(async () => {
  const browser = await chromium.launch()
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
  const out = { url: URL, prompt: PROMPT, startedAt: new Date().toISOString(), note: 'concept + volume proof' }
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
      step('slots', 'count', { slotCount: out.answer.slotCount })

      // Single-arm variant: one request renders as numbered options in the chat log
      // (`.chat-log-clarification-options li button`) with NO slot testids. Until 2026-11-09 the
      // driver iterated zero slots here, answered nothing, and then reported
      // `no-preview-after-submit` — a FAIL that was the instrument's, not the product's.
      if (out.answer.slotCount === 0) {
        try {
          const picked = await chrome.pickNumberedOption(page, 'clofibrate')
            || await chrome.pickNumberedOption(page, '.')
          out.answer.numberedOption = picked
          step('answer-numbered', picked ? 'picked' : 'NO matching numbered option', picked || {})
        } catch (e) {
          out.answer.numberedOptionError = String(e).slice(0, 300)
          step('answer-numbered', 'FAILED', { error: out.answer.numberedOptionError })
        }

        // Zero-option single arm: the product renders a free-text typed answer
        // (ParameterAnswerInput) instead of slots or numbered <li> options. With
        // neither surface driven the old driver committed nothing and submitted EMPTY.
        if (!out.answer.numberedOption) {
          try {
            const input = page.locator('[data-testid="parameter-answer-input"]')
            const present = (await input.count()) > 0
            out.answer.typed = { present, via: 'parameter-answer-input' }
            if (present) {
              await input.first().fill('Clofibrate')
              out.answer.typed.typed = 'Clofibrate'
              await page.waitForTimeout(300)
              const submit = page.locator('[data-testid="parameter-answer-submit"]')
              out.answer.typed.submitted = (await submit.count()) > 0
              if (out.answer.typed.submitted) await submit.first().click()
              else out.answer.typed.note = 'parameter-answer-submit absent'
              step('answer-typed', 'typed', out.answer.typed)
              await page.waitForTimeout(1500)
            } else step('answer-typed', 'NO typed input', out.answer.typed)
          } catch (e) {
            out.answer.typedError = String(e).slice(0, 300)
            step('answer-typed', 'FAILED', { error: out.answer.typedError })
          }
        }
      }

      // Use answerAllSlots to drive every slot and record per-slot results.
      // u3fix2 FIX-2: per-slot values derived from each slot's rendered
      // identity (concept -> Clofibrate, quantity/volume -> 1), never a scalar
      // '1' typed into every slot.
      try {
        const results = await chrome.answerAllSlots(page, { concept: 'Clofibrate', quantity: '1' })
        out.answer.slots = results
        out.answer.unanswered = results.filter((r) => r.unanswered)
        // Preserve identity/quantity keys for prior receipts. u3fix2 FIX-3/4a:
        // locate each slot BY its rendered identity text (never by array
        // index) and report the PICKED LABEL, with `via` as the surface.
        const kindOf = (r) => chrome.identityKind(r.identity)
        const identitySlot = results.find((r) => r.present && kindOf(r) === 'concept') || results.find((r) => r.present)
        if (identitySlot) out.answer.identity = { present: true, picked: identitySlot.picked, via: identitySlot.via, identity: identitySlot.identity }
        const quantitySlot = results.find((r) => r.present && kindOf(r) === 'quantity')
        out.answer.quantity = quantitySlot
          ? { present: true, picked: quantitySlot.picked, via: quantitySlot.via, identity: quantitySlot.identity }
          : { present: false, unanswered: true, note: 'no quantity/volume-identified slot rendered on this card' }
        step('answer-all', 'answerAllSlots committed', { slots: results.length, answered: results.filter((r) => r.present).length, values: results.map((r) => ({ identity: r.identity, answerValue: r.answerValue, picked: r.picked, via: r.via })) })
        await page.waitForTimeout(1800); await shot(page, 'all-slots-answered')
      } catch (e) {
        out.answer.answerAllError = String(e).slice(0, 300)
        step('answer-all', 'FAILED', { error: out.answer.answerAllError })
      }
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

    out.gridFills = await page.evaluate(() => { const o = {}; document.querySelectorAll('main[aria-label="Labware focus"] [data-well-id]').forEach((e) => { o[e.getAttribute('data-well-id')] = { fill: e.getAttribute('fill') || getComputedStyle(e).fill, preview: e.getAttribute('data-preview') } }); return o })
    out.previewWells = Object.entries(out.gridFills).filter(([, v]) => v.preview === 'true').map(([k]) => k)
    out.previewBarText = await page.evaluate(() => { const pb = document.querySelector('.preview-bar'); return pb ? (pb.innerText || '').replace(/\s+/g, ' ') : null })
    if (out.answer.submitted && out.previewWells.length === 0) { out.defect = 'NAMED_PRODUCT_DEFECT: both slots committed but previewWells=0'; step('defect', out.defect) }
    step('preview', 'measured', { previewWells: out.previewWells.length, bar: out.previewBarText, defect: out.defect || null })
    await shot(page, 'preview-measured')

    const w = page.locator('main[aria-label="Labware focus"] [data-well-id="E2"]').first()
    await w.hover({ force: true }); await page.waitForTimeout(700)
    out.hoverE2 = await page.evaluate(() => { const tip = document.querySelector('.well-tooltip'); const well = document.querySelector('main[aria-label="Labware focus"] [data-well-id="E2"]')
      return { tooltip: tip ? (tip.innerText || '').replace(/\s+/g, ' ').slice(0, 600) : null, wellFill: well ? (well.getAttribute('fill') || getComputedStyle(well).fill) : null } })
    step('hover-E2', out.hoverE2.tooltip || 'no tooltip'); await shot(page, 'tooltip-E2')

    if (out.previewBarText) {
      try { await chrome.discard(page); out.discarded = true; step('discard', 'clicked')
        for (let i = 0; i < 60; i++) { if (!(await page.evaluate(() => Boolean(document.querySelector('.preview-bar'))))) break; await page.waitForTimeout(400) }
        await page.waitForTimeout(1500) }
      catch (e) { out.discardError = String(e).slice(0, 300); step('discard', 'FAILED', { error: out.discardError }) }
    }
    out.after = await page.evaluate(async () => (await (await fetch('/api/records/EVG-corpus2-prompt1-dmem-baseline')).json()).record.payload.events.length)
    step('after', 'events', { before: out.before, after: out.after, unchanged: out.after === out.before }); await shot(page, 'after-discard')
    // Status (AMENDED 2026-11-09 per Brad's clarification-defaults ruling, same decision doc as
    // leg3): when the app resolves the request without asking, there is no grouped-answer submit
    // to exercise and this leg is NOT APPLICABLE, not failed. `failedCriteria` is always populated
    // so a receipt never again says FAIL with an empty reason.
    if (!cardSeen) {
      out.status = 'NA'
      out.failedCriteria = []
      out.naReason = 'no clarification card: the request resolved without asking, so the grouped two-slot submit had nothing to exercise'
    } else {
      const failed = []
      // Picking a numbered option IS submitting the answer for the single-arm variant, which
      // renders no slot testids and therefore no Submit button — and so is the typed fallback.
      const typedAnswered = Boolean(out.answer && out.answer.typed && out.answer.typed.submitted)
      const answered = out.answer && (out.answer.submitted === true || Boolean(out.answer.numberedOption) || typedAnswered)
      if (!answered) failed.push('answer-not-submitted')
      if (!out.previewWells || out.previewWells.length === 0) failed.push('no-preview-after-submit')
      out.answerMode = out.answer && out.answer.numberedOption ? 'numbered-option' : (typedAnswered ? 'typed-answer' : 'slot-card')
      out.failedCriteria = failed
      out.status = failed.length ? 'FAIL' : 'PASS'
    }
  } catch (e) { out.error = String(e).slice(0, 1000); out.status = 'FAIL'; step('error', out.error); try { await shot(page, 'error') } catch {} }
  out.trail = trail; await browser.close()
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1)); console.log('WROTE', OUT)
})().catch((e) => { console.error('DRIVER FAILED', e); process.exit(1) })
