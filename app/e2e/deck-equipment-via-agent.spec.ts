import { test, expect, type Page } from '@playwright/test'

const EVG = 'EVG-SPK-VERIFY'
const PROMPT = 'place two water baths onto the deck'
const FREE_BENCH_LABEL = 'Manual Bench (freeform)'

// The agent emits `agent_intent` → intent `event_graph` with two equipment
// requirements. The deck machinery must place them as INSTRUMENT tiles on the
// freeform lawn (water-bath kind), NOT tube racks. Deterministic: the assist
// stream is intercepted, no LLM needed.
function stubAssistStream(page: Page) {
  const frames = [
    { type: 'status', message: 'placing water baths…' },
    {
      type: 'tool_call',
      toolName: 'agent_intent',
      args: {
        intent: 'event_graph',
        labwareRequirements: [
          { classCurie: 'equipment:water_bath', handle: 'water bath 1', settings: { temperature_c: 55 } },
          { classCurie: 'equipment:water_bath', handle: 'water bath 2', settings: { temperature_c: 70 } },
        ],
      },
    },
    { type: 'tool_result', toolName: 'agent_intent', success: true, durationMs: 3 },
    {
      type: 'done',
      result: {
        success: true,
        events: [],
        labwareRequirements: [
          { classCurie: 'equipment:water_bath', handle: 'water bath 1', settings: { temperature_c: 55 } },
          { classCurie: 'equipment:water_bath', handle: 'water bath 2', settings: { temperature_c: 70 } },
        ],
      },
    },
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

test('agent equipment intent places two water-bath instruments on the freeform bench (not tube racks)', async ({ page, request }) => {
  await stubAssistStream(page)
  // Reset the shared deck fixture so the Accept assertion is idempotent across
  // runs (a prior accepted run would otherwise pre-populate labwares).
  await request.put(`/api/records/${EVG}`, {
    data: {
      payload: {
        id: EVG,
        recordId: EVG,
        kind: 'event-graph',
        name: 'Shaker Search Verify',
        status: 'draft',
        events: [],
        labwares: [],
        methodContext: { runId: 'none', vocabId: 'liquid-handling/v1', platform: 'manual', deckVariant: 'manual_freeform', locked: false },
        editorLayout: { surface: 'event-editor/v1', placements: [] },
      },
    },
  })
  await page.goto(`/deck/${EVG}`)

  // Switch the deck to the freeform bench so a lawn surface is available.
  const variantSelect = await deckVariantSelect(page)
  await expect(variantSelect).toHaveCount(1, { timeout: 20_000 })
  await variantSelect.selectOption({ label: FREE_BENCH_LABEL })
  await expect(page.locator('.lawn__surface').first()).toBeVisible({ timeout: 10_000 })

  // Open the AI tab and ask for water baths.
  await page.locator('[data-testid="right-pane-tab-ai"]').click()
  const input = page.locator('[data-testid="chat-input"] .chat-input__editor')
  await expect(input).toBeVisible({ timeout: 20_000 })
  await input.click()
  await page.keyboard.type(PROMPT)
  const sendBtn = page.locator('[data-testid="chat-input-send"]')
  await expect(sendBtn).toBeEnabled()
  await sendBtn.click()

  // Two water-bath instrument tiles ghost on the lawn — the names the user
  // gave, and never a 24-tube rack.
  await expect(page.locator('.lawn__tile-anchor', { hasText: /water bath/i })).toHaveCount(2, { timeout: 20_000 })
  const tileTexts = await page.locator('.lawn__tile-anchor').allInnerTexts()
  expect(tileTexts.some((t) => t.toLowerCase().includes('water bath 1'))).toBe(true)
  expect(tileTexts.some((t) => t.toLowerCase().includes('water bath 2'))).toBe(true)
  // The deck did not fall back to racks/plates.
  expect(tileTexts.some((t) => /rack|24\s*well|tube/i.test(t))).toBe(false)

  // The AI-emitted equipment settings ride through onto the tile's read-only
  // settings chip (55 °C and 70 °C), proving the settings are carried — not
  // dropped by the resolver or the renderer. (Phase 3/4)
  await expect(page.locator('.tile__chip--settings', { hasText: /55 °C/i })).toHaveCount(1, { timeout: 10_000 })
  await expect(page.locator('.tile__chip--settings', { hasText: /70 °C/i })).toHaveCount(1)

  // "View changes" reviews the equipment as EQUIPMENT, never as labware, and
  // the header counts them separately (the "2 labwares" mislabel regression).
  const viewChanges = page.locator('button', { hasText: /View changes/i })
  await expect(viewChanges).toBeVisible({ timeout: 10_000 })
  await viewChanges.click()
  await expect(page.locator('.ee-dialog__context').first()).toContainText('equipment')
  await expect(page.locator('.proposed-graph__heading', { hasText: /New equipment/i })).toBeVisible()
  // No "New labware" section — these are equipment, not labware.
  await expect(page.locator('.proposed-graph__heading', { hasText: /New labware/i })).toHaveCount(0)
  await page.locator('.ee-dialog__close').click()

  // Accept commits the graph with the equipment placements (the
  // "Unknown property: entityKind/equipmentId" validation regression).
  const acceptBtn = page.locator('button', { hasText: /^Accept$/ })
  await expect(acceptBtn).toBeVisible()
  await acceptBtn.click()
  // The preview bar clears after a durable accept (commitPreview).
  await expect(page.locator('.preview-bar')).toBeHidden({ timeout: 15_000 })

  // After accept the two equipment tiles are COMMITTED on the lawn. They must
  // not render on top of each other (the overlap regression), and each must be
  // draggable to a new spot (drag-to-move).
  const committed = page.locator('.lawn__tile-anchor', { hasText: /water bath/i })
  await expect(committed).toHaveCount(2, { timeout: 10_000 })

  // Non-overlap: the two committed tiles' screen boxes must not intersect.
  const boxes = await committed.evaluateAll((els) =>
    els.map((el) => { const r = (el as HTMLElement).getBoundingClientRect(); return { x0: r.left, x1: r.right, y0: r.top, y1: r.bottom } }),
  )
  const [q, w] = boxes as Array<{ x0: number; x1: number; y0: number; y1: number }>
  const horizontalGap = q.x1 <= w.x0 || w.x1 <= q.x0
  const verticalGap = q.y1 <= w.y0 || w.y1 <= q.y0
  expect(horizontalGap || verticalGap).toBe(true)

  // Clicking a placed instrument opens its CAPABILITY pane (settings chip,
  // accepts-labware), NOT a blank focus — and Close returns to the deck.
  const first = committed.first()
  await first.click()
  await expect(page.locator('[data-testid="focus-equipment"]')).toBeVisible({ timeout: 10_000 })
  await expect(page.locator('[data-testid="focus-equipment-settings"]')).toBeVisible()
  // The deck is hidden while focused; Close escapes back to the bench.
  const focusClose = page.locator('[data-testid="focus-equipment"]').locator('button', { hasText: /close/i })
  await focusClose.click()
  await expect(page.locator('[data-testid="focus-equipment"]')).toBeHidden({ timeout: 10_000 })
  await expect(committed).toHaveCount(2, { timeout: 10_000 })

  // The focus pane lets the scientist EDIT equipment settings: re-open the
  // first water bath, change its temperature to 65 °C, save, and confirm the
  // tile chip updates (the edit persists from just the reducer — no LLM).
  await first.click()
  await expect(page.locator('[data-testid="focus-equipment"]')).toBeVisible({ timeout: 10_000 })
  const tempInput = page.locator('[data-testid="equipment-setting-input-temperature_c"]').first()
  await expect(tempInput).toBeVisible({ timeout: 10_000 })
  await tempInput.fill('65')
  const saveBtn = page.locator('[data-testid="equipment-settings-save"]')
  await saveBtn.click()
  await expect(saveBtn).toHaveText(/Saved/, { timeout: 5_000 })
  await focusClose.click()
  await expect(page.locator('[data-testid="focus-equipment"]')).toBeHidden({ timeout: 10_000 })
  // At least one committed water-bath tile now shows the edited 65 °C chip.
  await expect(page.locator('.tile__chip--settings', { hasText: /65 °C/ })).toHaveCount(1, { timeout: 10_000 })

  const origin = await first.boundingBox()
  if (!origin) throw new Error('no water bath box')
  const lawn = page.locator('.lawn__surface').first()
  const lawnBox = await lawn.boundingBox()
  if (!lawnBox) throw new Error('no lawn box')
  const targetX = lawnBox.x + lawnBox.width * 0.7
  const targetY = lawnBox.y + lawnBox.height * 0.6
  await page.mouse.move(origin.x + origin.width / 2, origin.y + origin.height / 2)
  await page.mouse.down()
  await page.mouse.move(targetX, targetY, { steps: 8 })
  await page.mouse.up()

  // The dragged tile moved to the new location (bounding box shifted) — the
  // drop handler resolved the equipment placement and stamped the new lawn loc.
  await expect.poll(async () => {
    const b = await committed.first().boundingBox()
    return b ? Math.round(b.x) : 0
  }, { timeout: 5_000 }).not.toBe(Math.round(origin.x))
})