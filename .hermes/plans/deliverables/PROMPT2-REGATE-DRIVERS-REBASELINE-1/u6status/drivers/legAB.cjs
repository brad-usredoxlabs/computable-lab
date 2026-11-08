// PROMPT2-REGATE-DRIVERS-REBASELINE-1 Leg A+B — rebaselined for new chrome.
// ZERO /api/ai/** interception: observation-only page.on('request') capture.
const { chromium } = require('/home/brad/.hermes/cl/browser-receipts/harness/node_modules/playwright')
const fs = require('node:fs')
const path = require('node:path')
const chrome = require(path.join(__dirname, 'chrome.cjs'))

const DIR = process.env.RECEIPT_DIR
const ART = path.join(DIR, 'artifacts')
const SHOTS = path.join(DIR, 'shots')
const URL = 'http://localhost:5193/project/STU-scratch/event-graph/EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b'
const PROMPT = 'Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.'
const OUT = path.join(DIR, 'legAB.json')

const T0 = Date.now()
const el = () => +((Date.now() - T0) / 1000).toFixed(2)
const trail = []
const step = (a, t, x) => { const e = { t: el(), action: a, target: t, ...(x || {}) }; trail.push(e); console.log(JSON.stringify(e)) }
let seq = 0
const shot = async (page, label) => { seq += 1; const f = path.join(SHOTS, `${String(seq).padStart(2, '0')}-${label}.png`); await page.screenshot({ path: f, fullPage: true }); step('shot', label, { file: path.basename(f) }); return f }
const aiReqs = []; let bodySeq = 0
const deckSnap = (page) => page.evaluate(() => {
  const pb = document.querySelector('.preview-bar')
  return {
    mains: Array.from(document.querySelectorAll('main')).map((m) => m.getAttribute('aria-label')),
    previewBar: Boolean(pb),
    previewBarText: pb ? (pb.innerText || '').replace(/\s+/g, ' ').slice(0, 300) : null,
    previewButtons: pb ? Array.from(pb.querySelectorAll('button')).map((b) => ({ text: (b.innerText || '').trim(), disabled: b.disabled })) : null,
    previewWells: Array.from(document.querySelectorAll('svg [data-preview="true"]')).map((e) => e.getAttribute('data-well-id')).filter(Boolean),
    selected: Array.from(document.querySelectorAll('main[aria-label="Labware focus"] [data-selected="true"]')).map((e) => e.getAttribute('data-well-id')),
  }
})
const chatSnap = (page) => page.evaluate(() => {
  const msgs = Array.from(document.querySelectorAll('.chat-log-msg')).map((e) => ({ cls: (e.className || '').replace('chat-log-msg ', ''), text: (e.innerText || '').replace(/\s+/g, ' ').slice(0, 3000) }))
  const C = (s) => document.querySelectorAll(s).length
  const card = document.querySelector('[data-testid="chat-clarification-card"]')
  const single = document.querySelector('.chat-log-clarification')
  const surface = card || single
  return {
    user: C('.chat-log-msg--user'), assistant: C('.chat-log-msg--assistant'), streaming: C('[data-testid="interpreting-stop"]'),
    wall: C('[data-testid="honest-wall"]'),
    card: Boolean(surface),
    arm: card ? 'grouped' : (single ? 'single' : 'none'),
    cardText: surface ? (surface.innerText || '').replace(/\s+/g, ' ').slice(0, 1200) : null,
    slotCount: document.querySelectorAll('[data-testid="chat-clarification-slot"]').length,
    submitDisabled: (() => { const b = document.querySelector('[data-testid="chat-clarification-submit"]'); return b ? b.disabled : null })(),
    msgs,
  }
})
const hoverProbe = async (page, wellId) => {
  const w = page.locator(`main[aria-label="Labware focus"] [data-well-id="${wellId}"]`).first()
  if (!(await w.count())) return { wellId, missing: true }
  await w.hover({ force: true }); await page.waitForTimeout(700)
  return page.evaluate((wid) => {
    const tip = document.querySelector('.well-tooltip')
    const rows = Array.from(document.querySelectorAll('.well-tooltip__material')).map((r) => ({
      name: (r.querySelector('.well-tooltip__material-name') || {}).innerText || '',
      conc: (r.querySelector('.well-tooltip__material-conc') || {}).innerText || '',
      vol: (r.querySelector('.well-tooltip__material-vol') || {}).innerText || '',
    }))
    const well = document.querySelector(`main[aria-label="Labware focus"] [data-well-id="${wid}"]`)
    return { wellId: wid, tooltip: tip ? (tip.innerText || '').replace(/\s+/g, ' ').slice(0, 600) : null,
      tipVolume: tip && tip.querySelector('.well-tooltip__volume') ? tip.querySelector('.well-tooltip__volume').innerText : null,
      tipRows: rows, tipMeta: tip && tip.querySelector('.well-tooltip__meta') ? tip.querySelector('.well-tooltip__meta').innerText : null,
      wellFill: well ? (well.getAttribute('fill') || getComputedStyle(well).fill) : null }
  }, wellId)
}
const fillsOf = (page) => page.evaluate(() => {
  const out = {}
  document.querySelectorAll('main[aria-label="Labware focus"] [data-well-id]').forEach((e) => {
    out[e.getAttribute('data-well-id')] = e.getAttribute('fill') || getComputedStyle(e).fill
  })
  return out
})

;(async () => {
  const browser = await chromium.launch()
  const ctx = await browser.newContext({ viewport: { width: 1600, height: 1000 } })
  const page = await ctx.newPage()
  const errs = []
  page.on('console', (m) => { if (m.type() === 'error') errs.push('console:' + m.text().slice(0, 220)) })
  page.on('pageerror', (e) => errs.push('pageerror:' + String(e).slice(0, 220)))
  page.on('request', (r) => {
    const u = r.url(); if (!u.includes('/api/ai/')) return
    const entry = { t: el(), method: r.method(), path: u.replace('http://localhost:5193', ''), bodyFile: null }
    if (r.method() === 'POST') {
      try { const pd = r.postData(); if (pd) { bodySeq += 1; let parsed = null; try { parsed = JSON.parse(pd) } catch {}
        const name = `req-${String(bodySeq).padStart(2, '0')}.json`
        fs.writeFileSync(path.join(ART, name), JSON.stringify({ capturedAt: new Date().toISOString(), url: u, body: parsed ?? pd }, null, 2))
        entry.bodyFile = `artifacts/${name}`; entry.bodyBytes = Buffer.byteLength(pd)
      } } catch (e) { entry.bodyError = String(e).slice(0, 160) }
    }
    aiReqs.push(entry)
  })
  const out = { url: URL, prompt: PROMPT, startedAt: new Date().toISOString() }
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="harness-chat-pane"] textarea', { timeout: 60000 })
    await page.waitForTimeout(4000)
    step('goto', URL)
    const picker = page.locator('[data-testid="thread-picker-select"]')
    if (await picker.count()) { const opts = await picker.locator('option').allTextContents(); const nt = opts.find((o) => /new thread/i.test(o))
      if (nt) { await picker.selectOption({ label: nt }); await page.waitForTimeout(1200); step('thread', 'selected ' + nt) } }
    await page.locator('.lawn__tile-anchor .tile, .tile').first().click({ force: true })
    await page.waitForTimeout(1500)
    try { await page.waitForSelector('main[aria-label="Labware focus"]', { timeout: 20000 }) } catch {}
    out.focusMains = (await deckSnap(page)).mains
    step('focus-plate', 'clicked deck plate tile', { mains: out.focusMains })
    await shot(page, 'legAB-labware-focus')
    out.baseline = { A1: await hoverProbe(page, 'A1'), A2: await hoverProbe(page, 'A2'), E2: await hoverProbe(page, 'E2'), H5: await hoverProbe(page, 'H5') }
    out.baselineFills = await fillsOf(page)
    step('baseline', 'hover A1/A2/E2/H5')
    await shot(page, 'legAB-baseline-hover-A2')
    await page.locator('main[aria-label="Labware focus"] [data-well-id="E2"]').first().click(); await page.waitForTimeout(400)
    await page.locator('main[aria-label="Labware focus"] [data-well-id="H5"]').first().click({ modifiers: ['Shift'] }); await page.waitForTimeout(700)
    out.selection = (await deckSnap(page)).selected
    step('select', 'E2..H5', { count: out.selection.length, wells: out.selection.join(',') })
    await shot(page, 'legAB-selection-E2-H5')
    const composer = page.locator('[data-testid="harness-chat-pane"] textarea').first()
    await composer.click(); await composer.fill(PROMPT)
    await page.locator('[data-testid="harness-chat-pane"] button:has-text("Send")').first().click()
    const tSend = el(); step('send', PROMPT, { tSend })
    await shot(page, 'legAB-sent')

    // wait for clarification surface (either arm of the current chrome)
    let cardSeen = false
    for (let i = 0; i < 480; i++) { const c = await chatSnap(page)
      if (c.card) { cardSeen = true; out.cardFirst = c; break }
      if (el() - tSend > 120) break; await page.waitForTimeout(250) }
    out.cardSeen = cardSeen
    await shot(page, cardSeen ? 'legAB-clarification-card' : 'legAB-no-card')
    step('card', cardSeen ? `clarification surface rendered (${(out.cardFirst || {}).arm} arm)` : 'NO card', { arm: (out.cardFirst || {}).arm, text: (out.cardFirst || {}).cardText, slotCount: (out.cardFirst || {}).slotCount })

    // answer both slots
    out.answer = {}
    if (cardSeen) {
      out.answer.slotCount = (await chatSnap(page)).slotCount
      try { const r = await chrome.answerSlot(page, 'identity', 'clofibrate')
        out.answer.identity = r; step('answer-identity', 'picked', { picked: r.picked })
        await page.waitForTimeout(1800); await shot(page, 'legAB-identity') }
      catch (e) { out.answer.identityError = String(e).slice(0, 300); step('answer-identity', 'FAILED', { error: out.answer.identityError }) }
      try { const r = await chrome.answerSlot(page, 'quantity', '1')
        out.answer.quantity = r; step('answer-quantity', 'approved', { approved: r.approved })
        await page.waitForTimeout(1000); await shot(page, 'legAB-quantity') }
      catch (e) { out.answer.quantityError = String(e).slice(0, 300); step('answer-quantity', 'FAILED', { error: out.answer.quantityError }) }
      try { const r = await chrome.submitAnswers(page); out.answer.submitDoor = r.door; out.answer.submitted = true; step('submit', `submit door: ${r.door}`, { note: r.note })
        await page.waitForTimeout(2000); await shot(page, 'legAB-submitted') }
      catch (e) { out.answer.submitError = String(e).slice(0, 300); out.answer.submitted = false
        step('submit', 'FAILED', { error: out.answer.submitError }) }
    }

    // settle
    let settled = false
    for (let i = 0; i < 960; i++) { const c = await chatSnap(page); const d = await deckSnap(page)
      if (d.previewBar && c.streaming === 0) { settled = true; break }
      if (el() - tSend > 260) { out.timeout = true; break }; await page.waitForTimeout(250) }
    out.settled = settled; await page.waitForTimeout(1500)
    out.deckAtSettle = await deckSnap(page); out.chatAtSettle = await chatSnap(page); out.fillsAtSettle = await fillsOf(page)
    step('settle', settled ? 'preview bar present' : 'NO preview bar', { previewBarText: out.deckAtSettle.previewBarText, previewWells: out.deckAtSettle.previewWells.length })
    await shot(page, 'legAB-settled-ghost')
    out.hoverGhost = []
    for (const w of ['E2', 'E3', 'G4', 'H5', 'A2']) { out.hoverGhost.push(await hoverProbe(page, w)); await shot(page, `legAB-hover-ghost-${w}`) }

    // Apply (not Accept)
    out.applied = false
    if (out.deckAtSettle.previewBar) {
      try { await chrome.apply(page); out.applied = true; step('apply', 'clicked Apply')
        for (let i = 0; i < 120; i++) { const d = await deckSnap(page); if (!d.previewBar) break; await page.waitForTimeout(500) }
        await page.waitForTimeout(4000)
        out.afterApply = { deck: await deckSnap(page), chat: await chatSnap(page) }; await shot(page, 'legAB-after-apply') }
      catch (e) { out.applyError = String(e).slice(0, 300); step('apply', 'FAILED', { error: out.applyError }) }
    } else { out.applyNote = 'no preview bar at settle'; step('apply', 'skipped — no preview bar') }

    // post-apply hover
    out.hoverAfter = []
    for (const w of ['E2', 'E3', 'E4', 'F2', 'G4', 'H5']) { out.hoverAfter.push(await hoverProbe(page, w)); await shot(page, `legAB-hover-after-${w}`) }
    await page.locator('main[aria-label="Labware focus"] [data-well-id="A1"]').first().click()
    await page.waitForTimeout(900)
    out.afterClickA1 = await deckSnap(page)
    step('select-A1', 'clicked well A1', { selected: out.afterClickA1.selected })
    await shot(page, 'legAB-click-A1')
    out.hoverA2D5 = []
    for (const w of ['A2', 'B3', 'C4', 'D5', 'A5']) { out.hoverA2D5.push(await hoverProbe(page, w)); await shot(page, `legAB-hover-A2D5-${w}`) }
    out.hoverE2H5 = []
    for (const w of ['E2', 'F3', 'G4', 'H5']) { out.hoverE2H5.push(await hoverProbe(page, w)); await shot(page, `legAB-hover-E2H5-${w}`) }
    out.fillsFinal = await fillsOf(page)

    // record read-back
    out.record = await page.evaluate(async () => {
      const r = await fetch('/api/records/EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b')
      const j = await r.json(); const p = j.record.payload
      return { status: r.status, sha: j.record.meta && j.record.meta.contentSha,
        events: p.events.map((e) => ({ id: e.eventId, type: e.event_type, details: e.details, labwareId: e.labwareId, provenance: e.provenance })) }
    })
    step('readback', 'GET /api/records/EVG-...', { events: out.record.events.length, sha: out.record.sha })

    // COLD RELOAD
    const eventsBefore = out.record.events.length
    await page.reload({ waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="harness-chat-pane"] textarea', { timeout: 30000 })
    await page.waitForTimeout(4000)
    await page.locator('.lawn__tile-anchor .tile, .tile').first().click({ force: true })
    await page.waitForTimeout(2000)
    out.afterReload = { deck: await deckSnap(page), chat: await chatSnap(page), fills: await fillsOf(page),
      E2: await hoverProbe(page, 'E2'), H5: await hoverProbe(page, 'H5') }
    step('reload', 'cold reload persistence', { previewWells: out.afterReload.deck.previewWells.length, E2Fill: out.afterReload.fills['E2'], H5Fill: out.afterReload.fills['H5'] })
    await shot(page, 'legAB-after-reload')
    out.recordAfterReload = await page.evaluate(async () => {
      const r = await fetch('/api/records/EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b')
      const j = await r.json(); const p = j.record.payload
      return { status: r.status, sha: j.record.meta && j.record.meta.contentSha,
        events: p.events.map((e) => ({ id: e.eventId, type: e.event_type, details: e.details, labwareId: e.labwareId, provenance: e.provenance })) }
    })
    step('reload-readback', 'record after reload', { events: out.recordAfterReload.events.length, eventsGrew: out.recordAfterReload.events.length >= eventsBefore })

  } catch (e) { out.error = String(e).slice(0, 1200); step('error', out.error); try { await shot(page, 'legAB-error') } catch {} }
  out.requests = aiReqs; out.errors = errs.slice(0, 30); out.trail = trail
  await browser.close()
  fs.writeFileSync(OUT, JSON.stringify(out, null, 1))
  console.log('WROTE', OUT)
})().catch((e) => { console.error('DRIVER FAILED', e); process.exit(1) })
