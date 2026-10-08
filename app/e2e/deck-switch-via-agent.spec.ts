import { test, expect, type Page } from '@playwright/test'

const EVG = 'EVG-SPK-VERIFY'
const PROMPT = 'switch the deck to the freeform bench'

// The model emits a constrained `agent_intent` emission with intent
// `deck_layout` to change the deck. This spec drives the REAL chat → editor
// chain deterministically by intercepting /api/ai/assist/stream and replaying a
// crafted SSE (no LLM needed). It proves: the deck actually switches to the
// freeform bench, and — unlike an event-draft turn — the "Apply to run /
// Discard" review sidebar does NOT open for a pure layout change.
function stubAssistStream(page: Page) {
  const frames = [
    { type: 'status', message: 'applying deck layout…' },
    { type: 'tool_call', toolName: 'agent_intent', args: { intent: 'deck_layout', platformId: 'manual', variantId: 'manual_freeform' } },
    { type: 'tool_result', toolName: 'agent_intent', success: true, durationMs: 3 },
    { type: 'done', result: { success: true, deckLayout: { platformId: 'manual', variantId: 'manual_freeform' } } },
  ]
  const sse = frames.map((f) => `data: ${JSON.stringify(f)}\n\n`).join('')
  return page.addInitScript((body: string) => {
    const orig = window.fetch
    window.fetch = (input: RequestInfo | URL, init?: RequestInit) => {
      if (String(input).includes('/ai/assist/stream')) {
        const stream = new ReadableStream({
          start(controller) {
            controller.enqueue(new TextEncoder().encode(body))
            controller.close()
          },
        })
        return Promise.resolve(new Response(stream, { headers: { 'Content-Type': 'text/event-stream' } }))
      }
      return orig(input, init)
    }
  }, sse)
}

async function deckVariantSelect(page: Page) {
  return page.locator('select').filter({ has: page.locator('option[value="manual_freeform"]') })
}

test('agent deck_layout intent switches the live deck to the freeform bench, no draft sidebar', async ({ page }) => {
  await stubAssistStream(page)
  await page.goto(`/deck/${EVG}`)

  // Deck surface + AI panel ready. Starts on the single-plate variant.
  const variantSelect = await deckVariantSelect(page)
  await expect(variantSelect).toHaveCount(1, { timeout: 20_000 })

  // Ask the AI to switch the deck.
  // The AI chat is the right-pane's 'ai' sub-tab on a deck surface.
  await page.locator('[data-testid="right-pane-tab-ai"]').click()
  const input = page.locator('[data-testid="chat-input"] .chat-input__editor')
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.click()
  await page.keyboard.type(PROMPT)
  const sendBtn = page.locator('[data-testid="chat-input-send"]')
  await expect(sendBtn).toBeEnabled()
  await sendBtn.click()

  // The deck re-renders as the freeform bench (variant + lawn).
  await expect(variantSelect).toHaveValue('manual_freeform', { timeout: 20_000 })
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })

  // A pure layout turn MUST NOT open the event-draft review sidebar.
  await expect(page.locator('[data-testid="changes-apply"]')).not.toBeVisible({ timeout: 5_000 })

  // Regression (the input-box-disappeared bug): a deck-layout turn must reset the
  // sidebar so the CHAT sub-tab is shown again and the next prompt can be typed.
  await expect(page.locator('[data-testid="chat-input"]')).toBeVisible({ timeout: 5_000 })
  await expect(page.locator('[data-testid="chat-input-send"]')).toBeVisible()
})