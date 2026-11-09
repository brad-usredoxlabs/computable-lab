// PROMPT2-REGATE chrome contract helper — ONE place for selectors.
// Drivers import from here; no selectors outside this file.

function card(page) { return page.locator('[data-testid="chat-clarification-card"]') }
function slots(page) { return page.locator('[data-testid="chat-clarification-slot"]') }

async function answerSlot(page, kind, searchValue) {
  if (kind === 'identity') {
    const search = page.locator('[data-testid="clarification-identity-search"]')
    if (!(await search.count())) throw new Error('answerSlot identity: no search input')
    await search.click(); await search.fill(searchValue); await page.waitForTimeout(2500)
    const rows = page.locator('[data-testid="clarification-popover"] [role="option"], [data-testid="clarification-popover"] li, [data-testid="clarification-popover"] button')
    const n = await rows.count()
    for (let i = 0; i < n; i++) {
      const txt = ((await rows.nth(i).innerText().catch(() => '')) || '').replace(/\s+/g, ' ')
      if (new RegExp(searchValue, 'i').test(txt)) { await rows.nth(i).click(); return { picked: txt.trim() } }
    }
    throw new Error(`answerSlot identity: searched "${searchValue}", ${n} rows, no match`)
  }
  if (kind === 'quantity') {
    const input = page.locator('[data-testid="clarify-assumed-value"]')
    if (!(await input.count())) throw new Error('answerSlot quantity: no assumed-value input')
    await input.click(); await input.fill(String(searchValue)); await page.waitForTimeout(300)
    const approve = page.locator('[data-testid="clarify-assumed-approve"]')
    if (!(await approve.isEnabled())) throw new Error('answerSlot quantity: approve disabled')
    await approve.click(); return { approved: String(searchValue) }
  }
  throw new Error(`answerSlot unknown kind: ${kind}`)
}

async function submitAnswers(page) {
  const btn = page.locator('[data-testid="chat-clarification-submit"]')
  if (!(await btn.isEnabled())) {
    const slotCount = await page.locator('[data-testid="chat-clarification-slot"]').count()
    throw new Error(`submitAnswers disabled: ${slotCount} slot(s)`)
  }
  await btn.click()
}

function previewBar(page) { return page.locator('.preview-bar') }

async function apply(page) {
  const btn = page.locator('[data-testid="chat-preview-apply"]')
  if (!(await btn.isEnabled())) throw new Error('apply: chat-preview-apply disabled')
  await btn.click()
}

async function discard(page) { await page.locator('[data-testid="chat-preview-discard"]').click() }

module.exports = { card, slots, answerSlot, submitAnswers, previewBar, apply, discard }
