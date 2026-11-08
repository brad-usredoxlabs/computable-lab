// PROMPT2-REGATE chrome contract helper — ONE place for selectors.
// Drivers import from here; no selectors outside this file.
//
// RE-BASELINE 2026-11-06 (REGATE re-drive): the current chrome has TWO
// clarification arms (see ClarityLog/ChatLog.tsx `renderClarificationBlock`
// and `renderTypedClarification`):
//   grouped  : requests.length > 1  -> [data-testid="chat-clarification-card"]
//              with slots / Submit answers door.
//   single   : requests.length === 1 -> `.chat-log-clarification` (or
//              [data-testid="chat-log-request-<id>"]) with the inline
//              ClarificationPicker: top-3 rows / numbered options / the
//              assumed-value chip. A pick fires the answer turn itself, so no
//              Submit door exists.
// The 20261105 drivers only knew the grouped arm and therefore timed out on a
// one-request prompt. This file now resolves EITHER arm. SELECTORS ONLY — the
// legs' assertions (surface appears, answer committed, preview bar, ghost,
// apply/discard, event-count delta) are unchanged.

const CARD = '[data-testid="chat-clarification-card"]'
const SINGLE = '.chat-log-clarification'
const ANY = `${CARD}, ${SINGLE}`

function card(page) { return page.locator(CARD) }
function slots(page) { return page.locator('[data-testid="chat-clarification-slot"]') }
function anySurface(page) { return page.locator(ANY) }

async function arm(page) {
  if (await page.locator(CARD).count()) return 'grouped'
  if (await page.locator(SINGLE).count()) return 'single'
  return 'none'
}

function top3Rows(page) { return page.locator('[data-testid="clarification-top3-row"]') }

async function pickTop3(page, searchValue) {
  const rows = top3Rows(page)
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    const txt = ((await rows.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
    if (new RegExp(searchValue, 'i').test(txt)) {
      await rows.nth(i).click()
      return { picked: txt.trim(), via: 'top3-row', rows: n }
    }
  }
  return null
}

async function pickNumberedOption(page, searchValue) {
  const rows = page.locator('.chat-log-clarification-options li button')
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    const txt = ((await rows.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
    if (new RegExp(searchValue, 'i').test(txt)) { await rows.nth(i).click(); return { picked: txt.trim(), via: 'option' } }
  }
  return null
}

async function answerSlot(page, kind, searchValue) {
  if (kind === 'identity') {
    // grouped arm: per-slot picker, search + popover
    const search = page.locator('[data-testid="clarification-identity-search"]')
    if (await search.count()) {
      await search.first().click(); await search.first().fill(searchValue)
      const pop = page.locator('[data-testid="clarification-popover"] [role="option"], [data-testid="clarification-popover"] li, [data-testid="clarification-popover"] button')
      for (let wait = 0; wait < 10; wait++) { if (await pop.count() > 0) break; await page.waitForTimeout(1000) }
      const n = await pop.count()
      for (let i = 0; i < n; i++) {
        const txt = ((await pop.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
        if (new RegExp(searchValue, 'i').test(txt)) { await pop.nth(i).click(); return { picked: txt.trim(), via: 'popover' } }
      }
      // popover gave nothing: fall through to the bounded top-3 rows
    }
    const t = await pickTop3(page, searchValue)
    if (t) return t
    const o = await pickNumberedOption(page, searchValue)
    if (o) return o
    throw new Error(`answerSlot identity: no picker/popover/top3/option match for "${searchValue}"`)
  }
  if (kind === 'quantity') {
    const input = page.locator('[data-testid="clarify-assumed-value"]')
    if (!(await input.count())) {
      // single arm for a prompt that STATES the volume: no quantity request is
      // raised, so there is no chip to approve. Recorded, not silently passed.
      return { present: false, note: 'no quantity slot in this arm (volume stated in the prompt)' }
    }
    await input.first().click(); await input.first().fill(String(searchValue)); await page.waitForTimeout(300)
    const approve = page.locator('[data-testid="clarify-assumed-approve"]').first()
    if (!(await approve.isEnabled())) throw new Error('answerSlot quantity: approve disabled')
    await approve.click(); return { present: true, approved: String(searchValue) }
  }
  throw new Error(`answerSlot unknown kind: ${kind}`)
}

async function submitAnswers(page) {
  const btn = page.locator('[data-testid="chat-clarification-submit"]')
  if (!(await btn.count())) {
    // single arm: the pick already fired the answer turn — there is no door.
    return { door: 'none', note: 'single arm: pick answers immediately' }
  }
  if (!(await btn.first().isEnabled())) {
    const slotCount = await page.locator('[data-testid="chat-clarification-slot"]').count()
    throw new Error(`submitAnswers disabled: ${slotCount} slot(s)`)
  }
  await btn.first().click()
  return { door: 'chat-clarification-submit' }
}

function previewBar(page) { return page.locator('.preview-bar') }

async function apply(page) {
  const btn = page.locator('[data-testid="chat-preview-apply"]')
  if (!(await btn.isEnabled())) throw new Error('apply: chat-preview-apply disabled')
  await btn.click()
}

async function discard(page) { await page.locator('[data-testid="chat-preview-discard"]').click() }

module.exports = { card, slots, anySurface, arm, answerSlot, submitAnswers, previewBar, apply, discard, ANY, CARD, SINGLE }
