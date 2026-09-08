import { test, expect } from '@playwright/test'

/**
 * Observability trace in the run-workspace AI chat (plan §5.3).
 *
 * The chat must render the model's TOOL TRAIL (tool_call / tool_result /
 * pipeline_diagnostics / draft frames) under the assistant turn, instead of
 * silently dropping them — so a scientist can see WHY the AI acted ("why did a
 * 24-well land for a T25 request"), not a black box.
 *
 * The stream is stubbed via page.route (no real model needed) so the assertion
 * is deterministic: emit tool/diagnostic SSE frames and assert they render.
 */
test.describe('AI chat observability trace', () => {
  const RUN_URL = '/runs/RUN-2026-09-07-run-nzrs'
  test.setTimeout(60_000)

  function seedTraceStream() {
    const frames = [
      { type: 'status', message: 'starting' },
      { type: 'tool_call', toolName: 'search_records', args: { query: 'T25 flask' } },
      { type: 'tool_result', toolName: 'search_records', success: true, durationMs: 12 },
      { type: 'pipeline_diagnostics', outcome: 'complete', diagnostics: [{ pass_id: 'resolve_labware', code: 'V1', severity: 'warning', message: 'resolved T25 from lab records' }] },
      { type: 'tool_call', toolName: 'search_materials', args: { query: 'DMEM' } },
      { type: 'tool_result', toolName: 'search_materials', success: false, durationMs: 7 },
      { type: 'text_delta', delta: ' I found the T25 in your lab records.' },
      { type: 'done' },
    ]
    return frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
  }

  test('renders the tool-call trail and pipeline diagnostics under the AI turn', async ({ page }) => {
    // Intercept the agent stream BEFORE navigation so the fetch handler is set.
    await page.route('**/ai/assist/stream', async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/event-stream',
        body: seedTraceStream(),
      })
    })

    await page.goto(RUN_URL)
    await expect(page.locator('button', { hasText: /^AI$/ }).first()).toBeVisible({ timeout: 15_000 })

    // Open the AI panel, then the Chat sub-tab.
    const aiTab = page.locator('button', { hasText: /^AI$/ }).first()
    await aiTab.click()
    await expect(page.locator('[data-testid="message-log"]')).toBeVisible({ timeout: 10_000 })
    // The AI panel has Chat / Interpretation sub-views; ensure Chat is active.
    const chatTab = page.locator('button', { hasText: /^Chat$/ }).last()
    if (await chatTab.count()) {
      await chatTab.click()
      await expect(page.locator('[data-testid="message-log"]')).toBeVisible()
    }

    // Open the run's deck/event-editor AI chat composer and send a message.
    // The composer is TipTap. Type real keystrokes into the focused editor so
    // its onUpdate fires (which enables the Send button); then click Send.
    const editor = page.locator('.chat-input__editor[contenteditable="true"]')
    await expect(editor).toBeVisible({ timeout: 10_000 })
    await editor.click()
    await page.keyboard.type('Do we have a T25 flask?')
    const sendBtn = page.locator('[data-testid="chat-input-send"]')
    // onUpdate must have registered the text for Send to enable — the real
    // signal that TipTap accepted the input (raw textContent edits are ignored).
    await expect(sendBtn).toBeEnabled({ timeout: 10_000 })
    await sendBtn.click()

    // Sending may auto-switch the AI panel to its "Interpretation" sub-view
    // (which removes the chat/message-log); re-select the Chat sub-tab so the
    // trace is visible.
    await page.waitForTimeout(800)
    const chatTabAgain = page.locator('button', { hasText: /^Chat$/ }).last()
    if (await chatTabAgain.count()) {
      await chatTabAgain.click()
    }

    // The user's message should land in the chat — proves the send fired.
    await expect(page.locator('.message-log__bubble--user')).toContainText('Do we have a T25 flask?', { timeout: 10_000 })

    // The tool trail + diagnostics should render (not be dropped).
    await expect(page.locator('[data-testid="message-log-trace"]')).toBeVisible({ timeout: 10_000 })
    await expect(page.locator('[data-testid="trace-tool_call"]')).toHaveCount(2)
    await expect(page.locator('[data-testid="trace-tool_result"]')).toHaveCount(2)
    await expect(page.locator('[data-testid="trace-diagnostic"]')).toHaveCount(1)

    // The actual decisions are legible: which records were searched and why.
    const trace = page.locator('[data-testid="message-log-trace"]')
    await expect(trace).toContainText('search_records')
    await expect(trace).toContainText('resolved T25 from lab records')
    await expect(trace).toContainText('search_materials')
    // A failed tool result is visible too.
    await expect(trace).toContainText('failed')
  })
})