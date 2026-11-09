import { test, expect, type Page } from '@playwright/test'

const EVG = 'EVG-SPK-VERIFY'
const PROMPT = 'switch the deck to the freeform bench'
const FREE_BENCH_LABEL = 'Manual Bench (freeform)'

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

// LEG E (OQ-E3 test-port repair, measured red at claim): the deck-setup
// variant control moved from the legacy <select> to the DeckSetupChip
// cascade (commits a31c7201/2d25f934/31f5382c — pre-existing trunk change,
// an ancestor of the composer's recon tip d18f1c13, so the composer's static
// "rides the legacy composer" premise was stale — bait 7). The composer
// moved with it: LEG D deleted AiTabPanel, so the deck's AI tab is the
// universal HarnessChatPane whose composer is ChatLog's textarea labelled
// 'Message' + the 'Send' button (the chat-input testid died with AiTabPanel).
// Both re-pins are TEST-PORT to live product controls (no product change).
function deckVariantChip(page: Page) {
  return page.locator('[data-testid="deck-setup-chip"]')
}

/** Drive the DeckSetupChip to the freeform bench through its live controls. */
async function driveChipToFreeform(page: Page) {
  await expect(deckVariantChip(page)).toBeVisible({ timeout: 20_000 })
  if (await deckVariantChip(page).innerText().then((t) => /freeform/i.test(t))) {
    return // already freeform
  }
  await page.locator('[data-testid="deck-setup-trigger"]').click()
  await expect(page.locator('[data-testid="deck-setup-panel"]')).toBeVisible({ timeout: 5_000 })
  const switchBtn = page.locator('[data-testid="deck-setup-switch"]')
  if (await switchBtn.count()) {
    await switchBtn.click()
    await expect(page.locator('[data-testid="deck-setup-panel"]')).toBeVisible({ timeout: 5_000 })
  }
  await page.locator('[data-testid="deck-setup-row-variant"]').first().click()
  await page.locator('[data-testid="deck-setup-option-manual_freeform"]').first().click()
  await expect(deckVariantChip(page)).toContainText('freeform', { timeout: 10_000 })
}

test('agent deck_layout intent switches the live deck to the freeform bench, no draft sidebar', async ({ page }) => {
  await stubAssistStream(page)
  await page.goto(`/deck/${EVG}`)

  // Deck surface + AI panel ready. Starts on the single-plate variant —
  // the LEG E re-pin: the summary now lives in the DeckSetupChip (the
  // legacy <select> died with the cascade refactor).
  const chip = deckVariantChip(page)
  await expect(chip).toBeVisible({ timeout: 20_000 })
  await expect(chip).toContainText('Single SBS Plate')

  // Ask the AI to switch the deck.
  // The AI chat is the right-pane's 'ai' sub-tab on a deck surface.
  await page.locator('[data-testid="right-pane-tab-ai"]').click()
  // LEG E composer re-pin (OQ-E3): the legacy chat-input composer died with
  // AiTabPanel (LEG D) — the deck's AI tab is the universal HarnessChatPane
  // whose composer is ChatLog's 'Message' textarea + 'Send' button.
  const input = page.getByLabel('Message', { exact: true })
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.fill(PROMPT)
  const sendBtn = page.getByRole('button', { name: 'Send', exact: true })
  await expect(sendBtn).toBeEnabled()
  await sendBtn.click()

  // The deck re-renders as the freeform bench (variant + lawn) — the chip's
  // summary carries the new variant (the AI's deck_layout done frame drove
  // setPlatform/setVariant, not the chip UI).
  await expect(chip).toContainText(FREE_BENCH_LABEL, { timeout: 20_000 })
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })

  // A pure layout turn MUST NOT open the event-draft review sidebar.
  await expect(page.locator('[data-testid="changes-apply"]')).not.toBeVisible({ timeout: 5_000 })

  // Regression (the input-box-disappeared bug): a deck-layout turn must reset the
  // sidebar so the CHAT sub-tab is shown again and the next prompt can be typed.
  // LEG E re-pin: the composer's live testids (not the dead chat-input).
  await expect(page.getByLabel('Message', { exact: true })).toBeVisible({ timeout: 5_000 })
  await expect(page.getByRole('button', { name: 'Send', exact: true })).toBeVisible()
})