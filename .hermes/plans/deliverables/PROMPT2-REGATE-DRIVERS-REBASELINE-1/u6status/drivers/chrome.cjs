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
//
// SURFACE-DRIVEN (u2slotdrive): answerSlot for non-identity kinds enumerates
// each slot's actual control by testid in the card's precedence order:
//   1. clarify-assumed-chip (quantity declared slot)
//   2. clarify-well-target-slot (wells declared slot)
//   3. clarification-top3-row (picker top-3 buttons)
//   4. chat-clarification-option-* (numbered options)
//   5. parameter-answer-input (typed fallback)
// Returns { present, via } naming the surface driven.

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

async function pickTop3(page, searchValue, scope) {
  // u5merge: optional slot root. Callers that own an explicit slot pass it so a
  // row rendered by slot1 can never satisfy slot0's pick (G/F probe pins).
  const rows = top3Rows(scope || page)
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

// u3fix2 FIX-2/FIX-3: the card renders each slot's identity (request.slot) in
// [data-testid="chat-clarification-slot-identity"], so the answer value is a
// function of the RENDERED identity — never of the slot's array position.
const DEFAULT_ANSWERS = { concept: 'Clofibrate', quantity: '1' }

/** Classify a slot's rendered identity text as 'concept' | 'quantity' | ''. */
function identityKind(identityText) {
  const t = String(identityText || '').toLowerCase()
  if (/(quant|volume|amount|concentration|dose|mass|count)/.test(t)) return 'quantity'
  if (/(ident|concept|material|compound|reagent|solvent|analyte)/.test(t)) return 'concept'
  return ''
}

/** Read one slot's rendered identity text ('' when the card renders none). */
async function slotIdentity(slot) {
  const el = slot.locator('[data-testid="chat-clarification-slot-identity"]')
  if (!(await el.count())) return ''
  return ((await el.innerText().catch(() => '')) || '').trim()
}

/**
 * Value to drive into one slot. A scalar `answers` keeps the legacy "same
 * value for every slot" contract; an object maps identity kind -> value.
 */
async function slotAnswerValue(slot, identity, answers) {
  if (typeof answers === 'string') return answers
  const a = answers || DEFAULT_ANSWERS
  const kind = identityKind(identity)
  if (kind) return a[kind] ?? DEFAULT_ANSWERS[kind]
  if (a.default) return a.default
  // No identity text: read the control the slot actually rendered.
  const chip = await slot.locator('[data-testid="clarify-assumed-chip"]').count()
  return chip ? (a.quantity ?? DEFAULT_ANSWERS.quantity) : (a.concept ?? DEFAULT_ANSWERS.concept)
}

async function pickNumberedOption(page, searchValue, scope) {
  const rows = (scope || page).locator('.chat-log-clarification-options li button')
  const n = await rows.count()
  for (let i = 0; i < n; i++) {
    const txt = ((await rows.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
    if (new RegExp(searchValue, 'i').test(txt)) { await rows.nth(i).click(); return { picked: txt.trim(), via: 'option' } }
  }
  return null
}

/**
 * SURFACE-DRIVEN slot answerer. Instead of knowing slot "kinds" (identity,
 * quantity), we enumerate the controls the card actually rendered for this
 * slot, in the card's own precedence order. Returns the surface it drove.
 *
 * Precedence (matches ChatClarificationCard.tsx ternary):
 *   1. clarify-assumed-chip (declared quantity slot)
 *   2. clarify-well-target-slot (declared wells slot)
 *   3. clarification-identity-search + popover/top3 (picker)
 *   4. chat-clarification-option-* (numbered options)
 *   5. parameter-answer-input (typed fallback)
 *
 * @param {import('playwright').Page} page
 * @param {number} slotIndex  0-based index into [data-testid="chat-clarification-slot"]
 * @param {string} answerValue  the value to type/pick
 * @returns {Promise<{present: true, via: string} | {present: false, unanswered: true, slotId: string, dom: string}>}
 */
async function answerSlotBySurface(page, slotIndex, answerValue) {
  const slotEls = page.locator('[data-testid="chat-clarification-slot"]')
  const n = await slotEls.count()
  if (slotIndex < 0 || slotIndex >= n) throw new Error(`answerSlotBySurface: slotIndex ${slotIndex} out of range [0,${n})`)
  const slot = slotEls.nth(slotIndex)

  // 1. Declared quantity chip (clarify-assumed-chip)
  {
    const chip = slot.locator('[data-testid="clarify-assumed-chip"]')
    if (await chip.count()) {
      const input = chip.locator('[data-testid="clarify-assumed-value"]')
      await input.fill(String(answerValue))
      await page.waitForTimeout(300)
      const approve = chip.locator('[data-testid="clarify-assumed-approve"]')
      if (!(await approve.isEnabled())) throw new Error('answerSlotBySurface: assumed-chip approve disabled')
      await approve.click()
      return { present: true, via: 'assumed-chip', picked: String(answerValue) }
    }
  }

  // 2. Declared wells slot (clarify-well-target-slot)
  {
    const wellSlot = slot.locator('[data-testid="clarify-well-target-slot"]')
    if (await wellSlot.count()) {
      const input = wellSlot.locator('[data-testid="clarify-well-target"]')
      await input.fill(String(answerValue))
      const approve = wellSlot.locator('[data-testid="clarify-well-target-approve"]')
      if (await approve.count() && (await approve.isEnabled())) {
        await approve.click()
      }
      return { present: true, via: 'wells-slot', picked: String(answerValue) }
    }
  }

  // 3. Picker: search + popover, or top-3 buttons
  {
    const search = slot.locator('[data-testid="clarification-identity-search"]')
    if (await search.count()) {
      await search.click()
      await search.fill(answerValue)
      // Wait for popover options
      const pop = page.locator('[data-testid="clarification-popover"] [role="option"], [data-testid="clarification-popover"] li, [data-testid="clarification-popover"] button')
      for (let wait = 0; wait < 10; wait++) { if (await pop.count() > 0) break; await page.waitForTimeout(1000) }
      const popN = await pop.count()
      for (let i = 0; i < popN; i++) {
        const txt = ((await pop.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
        if (new RegExp(answerValue, 'i').test(txt)) { await pop.nth(i).click(); return { present: true, via: 'picker-popover', picked: txt.trim() } }
      }
      // Popover gave nothing: fall through to top-3 rows
    }
    const top3 = slot.locator('[data-testid="clarification-top3-row"]')
    if (await top3.count()) {
      const t = await pickTop3(page, answerValue, slot)
      if (t) return { present: true, via: 'picker-top3', picked: t.picked }
    }
  }

  // 4. Numbered options — grouped arm: slot-scoped testid prefix; fallback: ol button;
  //    then the log-options list, which renders outside the slot subtree but is
  //    still slot-scoped when a slot root is available (F/G probe pins).
  {
    let opts = slot.locator('[data-testid^="chat-clarification-option-"]')
    if (!(await opts.count())) { opts = slot.locator('ol button') }
    const n = await opts.count()
    if (n) {
      for (let i = 0; i < n; i++) {
        const txt = ((await opts.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
        if (new RegExp(answerValue, 'i').test(txt)) { await opts.nth(i).click(); return { present: true, via: 'option', picked: txt.trim() } }
      }
    } else {
      const o = await pickNumberedOption(page, answerValue, slot)
      if (o) return { present: true, via: 'option', picked: o.picked }
    }
  }

  // 5. Typed parameter input
  {
    const typed = slot.locator('[data-testid="parameter-answer-input"]')
    if (await typed.count()) {
      await typed.fill(String(answerValue))
      const submit = slot.locator('[data-testid="parameter-answer-submit"]')
      if (await submit.count() && (await submit.isEnabled())) {
        await submit.click()
      }
      return { present: true, via: 'typed', picked: String(answerValue) }
    }
  }

  // No drivable control — return the slot's DOM for diagnosis
  const slotId = await slot.getAttribute('data-request-id') || `slot[${slotIndex}]`
  const dom = (await slot.innerHTML()).slice(0, 2000)
  return { present: false, unanswered: true, slotId, dom }
}

/**
 * Legacy answerSlot — kept for backward compat with legs that still call it
 * with 'identity' or 'quantity' kinds. Identity path unchanged; quantity
 * delegates to surface-driven enumeration (slot 0 for legacy calls).
 */
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
    // Derive slot index from the rendered card: find the slot whose
    // chat-clarification-slot-identity span matches "quantity". Fall back
    // to the first slot if no identity label matches.
    const slotEls = page.locator('[data-testid="chat-clarification-slot"]')
    const slotCount = await slotEls.count()
    let idx = 0
    for (let i = 0; i < slotCount; i++) {
      const identity = slotEls.nth(i).locator('[data-testid="chat-clarification-slot-identity"]')
      if (await identity.count()) {
        const txt = (await identity.innerText()).toLowerCase()
        if (txt.includes(kind)) { idx = i; break }
      }
    }
    // Legacy callers expect a {present, approved} or {present:false} shape.
    const r = await answerSlotBySurface(page, idx, searchValue)
    if (r.present) {
      return { present: true, approved: String(searchValue), via: r.via }
    }
    return r
  }
  throw new Error(`answerSlot unknown kind: ${kind}`)
}

/**
 * answerAllSlots — walks every [data-testid="chat-clarification-slot"] and
 * answers each one. A slot with no drivable control returns
 * {unanswered: true, slotId, dom} instead of throwing.
 *
 * u3fix2: each result also carries `slotIndex`, the slot's rendered `identity`
 * text and the `answerValue` actually driven into it, so callers project
 * receipts by IDENTITY rather than by array position.
 *
 * @param {import('playwright').Page} page
 * @param {string|{concept?: string, quantity?: string, default?: string}} answerValue
 *        a scalar keeps the legacy "same value for every slot" contract; an
 *        object maps rendered identity kind -> value (default: Clofibrate / 1)
 * @returns {Promise<Array>}  array of per-slot results
 */
async function answerAllSlots(page, answerValue) {
  const slotEls = page.locator('[data-testid="chat-clarification-slot"]')
  const n = await slotEls.count()
  const results = []
  for (let i = 0; i < n; i++) {
    const slot = slotEls.nth(i)
    const identity = await slotIdentity(slot)
    const value = await slotAnswerValue(slot, identity, answerValue)
    const r = await answerSlotBySurface(page, i, value)
    if (r.present) await page.waitForTimeout(500)
    results.push({ ...r, slotIndex: i, identity, answerValue: value })
  }
  return results
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

module.exports = { card, slots, anySurface, arm, answerSlot, answerSlotBySurface, answerAllSlots, identityKind, slotIdentity, submitAnswers, previewBar, apply, discard, ANY, CARD, SINGLE }
