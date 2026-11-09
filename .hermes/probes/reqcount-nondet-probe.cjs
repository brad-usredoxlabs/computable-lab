// REPEAT-N PROBE: reqcount-nondet-probe (unit 1 + unit 2 continuation arm)
// Measures clarification-request-count distribution across N runs.
// Measurement only — zero product edits. Client-side observation.
const { chromium } = require('/home/brad/.hermes/cl/browser-receipts/harness/node_modules/playwright')
const crypto = require('node:crypto'), fs = require('node:fs'), path = require('node:path')
const DIR = process.env.RECEIPT_DIR || '/tmp/reqcount-u1'
const N = Math.max(parseInt(process.argv[2]) || 8, 1)
const URL = 'http://localhost:5193/project/STU-scratch/event-graph/EVG-cellrox-flow-cytometry-assay-kits-method-bda3685b'
const PROMPT = 'Add 1uL of 1mM clofibrate in DMSO to wells E2-H5.'
const ARM = process.argv.includes('--arm=continuation') ? 'continuation' : 'fresh'
async function precheck() {
  const { execSync } = require('child_process')
  const s = execSync('curl -s -o /dev/null -w "%{http_code}" localhost:5193/').toString().trim()
  if (s !== '200') throw new Error('FRONTEND_DOWN: ' + s)
  const s2 = execSync('curl -s -o /dev/null -w "%{http_code}" localhost:3093/api/health').toString().trim()
  if (s2 !== '200') throw new Error('BACKEND_DOWN: ' + s2)
}
function parseFrames(text) {
  const frames = []
  for (const line of text.split('\n'))
    if (line.startsWith('data: ')) try { frames.push(JSON.parse(line.slice(6))) } catch {}
  return frames
}
function captureTurn(page, streamText, requestBody) {
  const r = {
    threadId: null, requestBodySha256: null, promptVerbatim: PROMPT,
    selectionWells: [], clarCount: null, clarRequests: [], hadRefusal: false, hadError: false,
    surfaceMounted: false, streamFramesLength: 0, streamRawLength: 0, confounded: false, _domInferred: false
  }
  if (requestBody) {
    r.requestBodySha256 = crypto.createHash('sha256').update(requestBody).digest('hex')
    r.requestBodyCaptured = requestBody
  }
  if (streamText.length > 0) {
    r.streamRawLength = streamText.length
    const frames = parseFrames(streamText)
    r.streamFramesLength = frames.length
    for (const frame of frames) {
      if (frame.type === 'done' && frame.result && Array.isArray(frame.result.clarificationRequests)) {
        r.clarCount = frame.result.clarificationRequests.length
        for (const cr of frame.result.clarificationRequests)
          r.clarRequests.push({ id: cr.id || null, slot: cr.slot || null, kind: cr.kind || null,
            clarifyControlKind: cr.clarifyControl ? cr.clarifyControl.kind : null, prompt: cr.prompt || '' })
      }
      if (frame.type === 'error') { r.hadError = true; r.errorText = (frame.message || '').slice(0, 500) }
      if (frame.type === 'done' && frame.result?.refusal) r.hadRefusal = true
    }
  }
  return r
}
async function captureDOM(page, r) {
  if (r.surfaceMounted) {
    const hasCard = await page.locator('[data-testid="chat-clarification-card"]').count() > 0
    const slotCount = await page.locator('[data-testid="chat-clarification-slot"]').count()
    if (hasCard) {
      r.domArm = { type: 'card', slotCount }
      if (r.clarCount === null) { r.clarCount = slotCount; r._domInferred = true }
    } else {
      r.domArm = { type: 'single' }
      r.domArm.singleArmTestids = await page.evaluate(() =>
        Array.from(document.querySelectorAll('[data-testid]'))
          .map(e => e.getAttribute('data-testid'))
          .filter(t => t.startsWith('clarification-') || t.startsWith('chat-log-request-')))
      if (r.clarCount === null) { r.clarCount = 1; r._domInferred = true }
    }
  } else {
    r.domArm = { type: 'none' }
    if (r.clarCount === null) r.clarCount = 0
  }
}
async function waitSurface(page) {
  const deadline = Date.now() + 240000
  while (Date.now() < deadline) {
    const slots = await page.locator('[data-testid="chat-clarification-slot"]').count()
    const single = await page.locator('[data-testid="clarification-identity-search"]').count()
    if (slots > 0 || single > 0) return true
    await page.waitForTimeout(500)
  }
  return false
}
// Fresh-thread arm (identical to u1 runOne — behaviour must not change)
async function runOne(idx) {
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
  const r = {
    run: idx, threadId: null, requestBodySha256: null, promptVerbatim: PROMPT,
    selectionWells: [], clarCount: null, clarRequests: [], hadRefusal: false, hadError: false,
    surfaceMounted: false, streamFramesLength: 0, streamRawLength: 0, confounded: false, _domInferred: false
  }
  await page.addInitScript(() => {
    window.__capture = { body: null, streamText: '' }
    const orig = window.fetch
    window.fetch = async function (...a) {
      const url = typeof a[0] === 'string' ? a[0] : a[0].url
      if (url.includes('/ai/') && url.includes('/stream')) {
        if (a[1]?.body) window.__capture.body = a[1].body
        const resp = await orig.apply(this, a)
        try { window.__capture.streamText = await resp.clone().text() } catch {}
        return resp
      }
      return orig.apply(this, a)
    }
  })
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="harness-chat-pane"] textarea', { timeout: 60000 })
    await page.waitForTimeout(4000)
    const picker = page.locator('[data-testid="thread-picker-select"]')
    if (await picker.count() > 0) {
      const opts = await picker.locator('option').allTextContents()
      const nt = opts.find(o => /new thread/i.test(o))
      if (nt) { await picker.selectOption({ label: nt }); await page.waitForTimeout(1200) }
    }
    r.threadId = await page.evaluate(() => {
      const e = document.querySelector('[data-testid="thread-picker-select"]')
      return e ? e.value || null : null
    })
    // u2proberun3: waitFor tile visible before click — cold-remount or in-flight
    // HMR/suspense on the 3rd fresh page.goto can leave .tile unmounted.
    // L2-CLARIFY-REQUEST-COUNT-NONDETERMINISTIC-1 u2proberun3.
    const tile = page.locator('.lawn__tile-anchor .tile, .tile').first()
    try { await tile.waitFor({ state: 'visible', timeout: 60000 }); await tile.click({ force: true }) }
    catch (clickErr) {
      const ad = path.join(DIR, 'artifacts', 'run' + idx)
      fs.mkdirSync(ad, { recursive: true })
      await page.screenshot({ path: path.join(ad, 'click-failure.png') })
      fs.writeFileSync(path.join(ad, 'dom-head.txt'), (await page.content()).slice(0, 8000))
      throw new Error('Tile click/wait failed (artifacts in ' + ad + '): ' + clickErr.message)
    }
    await page.waitForTimeout(1500)
    await page.locator('main[aria-label="Labware focus"] [data-well-id="E2"]').first().click()
    await page.waitForTimeout(400)
    await page.locator('main[aria-label="Labware focus"] [data-well-id="H5"]').first().click({ modifiers: ['Shift'] })
    await page.waitForTimeout(600)
    r.selectionWells = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-selected="true"][data-well-id]'))
        .map(e => e.getAttribute('data-well-id')).filter(Boolean))
    const composer = page.locator('[data-testid="harness-chat-pane"] textarea').first()
    await composer.click()
    await composer.fill(PROMPT)
    await page.locator('[data-testid="harness-chat-pane"] button:has-text("Send")').first().click()
    r.surfaceMounted = await waitSurface(page)
    const captured = await page.evaluate(() => window.__capture)
    const requestBody = captured?.body || null
    if (requestBody) {
      r.requestBodySha256 = crypto.createHash('sha256').update(requestBody).digest('hex')
      r.requestBodyCaptured = requestBody
    }
    const streamText = captured?.streamText || ''
    if (streamText.length > 0) {
      r.streamRawLength = streamText.length
      const frames = parseFrames(streamText)
      r.streamFramesLength = frames.length
      for (const frame of frames) {
        if (frame.type === 'done' && frame.result && Array.isArray(frame.result.clarificationRequests)) {
          r.clarCount = frame.result.clarificationRequests.length
          for (const cr of frame.result.clarificationRequests)
            r.clarRequests.push({ id: cr.id || null, slot: cr.slot || null, kind: cr.kind || null,
              clarifyControlKind: cr.clarifyControl ? cr.clarifyControl.kind : null, prompt: cr.prompt || '' })
        }
        if (frame.type === 'error') { r.hadError = true; r.errorText = (frame.message || '').slice(0, 500) }
        if (frame.type === 'done' && frame.result?.refusal) r.hadRefusal = true
      }
    }
    await captureDOM(page, r)
    return r
  } finally { await browser.close() }
}
// Continuation arm: turn 1 opens thread, turn 2 re-sends same prompt in same thread
async function runContinuation(idx) {
  const browser = await chromium.launch({ headless: true })
  const page = await (await browser.newContext({ viewport: { width: 1600, height: 1000 } })).newPage()
  const result = {
    run: idx, threadId: null, arm: 'continuation', turns: []
  }
  await page.addInitScript(() => {
    window.__capture = { body: null, streamText: '' }
    const orig = window.fetch
    window.fetch = async function (...a) {
      const url = typeof a[0] === 'string' ? a[0] : a[0].url
      if (url.includes('/ai/') && url.includes('/stream')) {
        if (a[1]?.body) window.__capture.body = a[1].body
        const resp = await orig.apply(this, a)
        try { window.__capture.streamText = await resp.clone().text() } catch {}
        return resp
      }
      return orig.apply(this, a)
    }
  })
  try {
    await page.goto(URL, { waitUntil: 'domcontentloaded' })
    await page.waitForSelector('[data-testid="harness-chat-pane"] textarea', { timeout: 60000 })
    await page.waitForTimeout(4000)
    // Turn 1: open thread with canonical prompt (same setup as fresh arm)
    const picker = page.locator('[data-testid="thread-picker-select"]')
    if (await picker.count() > 0) {
      const opts = await picker.locator('option').allTextContents()
      const nt = opts.find(o => /new thread/i.test(o))
      if (nt) { await picker.selectOption({ label: nt }); await page.waitForTimeout(1200) }
    }
    result.threadId = await page.evaluate(() => {
      const e = document.querySelector('[data-testid="thread-picker-select"]')
      return e ? e.value || null : null
    })
    // u2proberun3: waitFor tile visible before click (continuation arm)
    const tile2 = page.locator('.lawn__tile-anchor .tile, .tile').first()
    try { await tile2.waitFor({ state: 'visible', timeout: 60000 }); await tile2.click({ force: true }) }
    catch (clickErr) {
      const ad = path.join(DIR, 'artifacts', 'cont-run' + idx)
      fs.mkdirSync(ad, { recursive: true })
      await page.screenshot({ path: path.join(ad, 'click-failure.png') })
      fs.writeFileSync(path.join(ad, 'dom-head.txt'), (await page.content()).slice(0, 8000))
      throw new Error('Tile click/wait failed (artifacts in ' + ad + '): ' + clickErr.message)
    }
    await page.waitForTimeout(1500)
    await page.locator('main[aria-label="Labware focus"] [data-well-id="E2"]').first().click()
    await page.waitForTimeout(400)
    await page.locator('main[aria-label="Labware focus"] [data-well-id="H5"]').first().click({ modifiers: ['Shift'] })
    await page.waitForTimeout(600)
    const selectionWells = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-selected="true"][data-well-id]'))
        .map(e => e.getAttribute('data-well-id')).filter(Boolean))
    // Send turn 1
    const composer = page.locator('[data-testid="harness-chat-pane"] textarea').first()
    await composer.click()
    await composer.fill(PROMPT)
    await page.locator('[data-testid="harness-chat-pane"] button:has-text("Send")').first().click()
    // Wait for turn 1 clarification surface
    let t1Surface = await waitSurface(page)
    const t1Captured = await page.evaluate(() => window.__capture)
    const t1Body = t1Captured?.body || null
    const t1Stream = t1Captured?.streamText || ''
    const t1 = captureTurn(page, t1Stream, t1Body)
    t1.threadId = result.threadId
    t1.selectionWells = selectionWells
    t1.surfaceMounted = t1Surface
    t1.turn = 1
    await captureDOM(page, t1)
    result.turns.push(t1)
    console.error('  T1 clarCount=' + t1.clarCount + ', arm=' + (t1.domArm?.type || '?') +
      ', slots=' + (t1.domArm?.slotCount ?? '-') + ', sha=' + (t1.requestBodySha256 || 'null'))
    // Reset capture for turn 2
    await page.evaluate(() => { window.__capture = { body: null, streamText: '' } })
    // Turn 2: re-send byte-identical prompt in the SAME thread
    // Thread carries the context — no need to re-select wells
    // Capture current selection state for t2 record
    const t2SelectionWells = await page.evaluate(() =>
      Array.from(document.querySelectorAll('[data-selected="true"][data-well-id]'))
        .map(e => e.getAttribute('data-well-id')).filter(Boolean))
    // Send turn 2 in same thread
    await composer.click()
    await composer.fill(PROMPT)
    await page.locator('[data-testid="harness-chat-pane"] button:has-text("Send")').first().click()
    // Wait for turn 2 clarification surface
    let t2Surface = await waitSurface(page)
    const t2Captured = await page.evaluate(() => window.__capture)
    const t2Body = t2Captured?.body || null
    const t2Stream = t2Captured?.streamText || ''
    const t2 = captureTurn(page, t2Stream, t2Body)
    t2.threadId = result.threadId
    t2.selectionWells = t2SelectionWells
    t2.surfaceMounted = t2Surface
    t2.turn = 2
    await captureDOM(page, t2)
    result.turns.push(t2)
    console.error('  T2 clarCount=' + t2.clarCount + ', arm=' + (t2.domArm?.type || '?') +
      ', slots=' + (t2.domArm?.slotCount ?? '-') + ', sha=' + (t2.requestBodySha256 || 'null'))
    return result
  } catch (e) {
    result.error = e.message || String(e)
    console.error('  Continuation run ' + idx + ' FAILED: ' + result.error)
    return result
  } finally { await browser.close() }
}
;(async () => {
  fs.mkdirSync(DIR, { recursive: true })
  await precheck()
  console.error('ARM=' + ARM)
  const data = { arm: ARM, runs: [], timestamp: new Date().toISOString() }
  if (ARM === 'fresh') {
    for (let i = 0; i < N; i++) {
      console.error('Run ' + (i + 1) + '/' + N + '...')
      const r = await runOne(i + 1); data.runs.push(r)
      console.error('  clarCount=' + r.clarCount + ', arm=' + (r.domArm?.type || '?') +
        ', slots=' + (r.domArm?.slotCount ?? '-') + ', streamFrames=' + r.streamFramesLength +
        ', streamBytes=' + r.streamRawLength + ', wells=' + r.selectionWells.length +
        ', sha=' + (r.requestBodySha256 || 'null'))
    }
    const counts = data.runs.map(r => r.clarCount)
    const distribution = {}
    for (const c of counts) distribution[String(c)] = (distribution[String(c)] || 0) + 1
    const arms = {
      card: data.runs.filter(r => r.domArm?.type === 'card').length,
      single: data.runs.filter(r => r.domArm?.type === 'single').length,
      none: data.runs.filter(r => r.domArm?.type === 'none').length
    }
    const shas = data.runs.map(r => r.requestBodySha256).filter(Boolean)
    data.summary = { n: N, counts, distribution, arms,
      identicalRequestBodyExcept: [...new Set(shas)].length <= 1 ? [] : [...new Set(shas)] }
  } else {
    // Continuation arm
    for (let i = 0; i < N; i++) {
      console.error('Run ' + (i + 1) + '/' + N + '...')
      const r = await runContinuation(i + 1); data.runs.push(r)
    }
    // Summary: distribution of turn-2 clarCounts
    const t2Counts = data.runs.filter(r => r.turns && r.turns.length >= 2).map(r => r.turns[1].clarCount)
    const t2Distribution = {}
    for (const c of t2Counts) t2Distribution[String(c)] = (t2Distribution[String(c)] || 0) + 1
    const t1Counts = data.runs.filter(r => r.turns && r.turns.length >= 2).map(r => r.turns[0].clarCount)
    const t1Distribution = {}
    for (const c of t1Counts) t1Distribution[String(c)] = (t1Distribution[String(c)] || 0) + 1
    // SHA comparison between turns
    const shaPairs = data.runs.filter(r => r.turns && r.turns.length >= 2).map(r => ({
      run: r.run, threadId: r.threadId, t1Sha: r.turns[0].requestBodySha256, t2Sha: r.turns[1].requestBodySha256
    }))
    data.summary = {
      n: N, arm: 'continuation',
      turn1: { counts: t1Counts, distribution: t1Distribution },
      turn2: { counts: t2Counts, distribution: t2Distribution },
      shaPairs,
      // Diff fields between turns for each run
      diffs: data.runs.filter(r => r.turns && r.turns.length >= 2).map(r => {
        const t1 = r.turns[0], t2 = r.turns[1]
        const diff = {}
        if (t1.clarCount !== t2.clarCount) diff.clarCount = [t1.clarCount, t2.clarCount]
        if (t1.streamFramesLength !== t2.streamFramesLength) diff.streamFramesLength = [t1.streamFramesLength, t2.streamFramesLength]
        if (t1.streamRawLength !== t2.streamRawLength) diff.streamRawLength = [t1.streamRawLength, t2.streamRawLength]
        if (t1.requestBodySha256 !== t2.requestBodySha256) diff.requestBodySha256 = [t1.requestBodySha256, t2.requestBodySha256]
        if (t1.selectionWells.length !== t2.selectionWells.length) diff.selectionWells = [t1.selectionWells, t2.selectionWells]
        if (t1.domArm?.type !== t2.domArm?.type) diff.domArm = [t1.domArm?.type, t2.domArm?.type]
        if (t1.domArm?.slotCount !== t2.domArm?.slotCount) diff.domSlotCount = [t1.domArm?.slotCount, t2.domArm?.slotCount]
        return { run: r.run, threadId: r.threadId, diff }
      })
    }
  }
  const jsonPath = path.join(DIR, 'reqcount.json')
  fs.writeFileSync(jsonPath, JSON.stringify(data, null, 2))
  console.log(JSON.stringify(data.summary, null, 2))
  console.error('Full report: ' + jsonPath)
})().catch(e => { console.error('PROBE FAILED', e); process.exit(1) })
