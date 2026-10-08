import { test, expect } from '@playwright/test'

test.use({
  viewport: { width: 1440, height: 900 },
  ...(process.env.CL_CHROMIUM_PATH ? { launchOptions: { executablePath: process.env.CL_CHROMIUM_PATH } } : {}),
})

type StreamWindow = Window & {
  emitChatText?: (text: string) => void
  endChatStream?: () => void
}

test('sequence chat follows the latest reply while keeping history and the composer usable', async ({ page }) => {
  const errors: string[] = []
  page.on('pageerror', error => errors.push(error.message))
  const thread = {
    endpoint: 'sequences', userId: 'USR-TEST', mentions: [], updatedAt: '2026-10-04T00:00:00Z',
    messages: Array.from({ length: 24 }, (_, index) => ({
      role: index % 2 ? 'assistant' : 'user', createdAt: `2026-10-04T00:00:${String(index).padStart(2, '0')}Z`,
      content: `History ${index}\n${'Earlier conversation about the requested sequence.\n'.repeat(5)}`,
    })),
  }
  // Hydration and streaming fixtures exercise the real UI without AI or live-lab writes.
  await page.route('**/api/**', async route => {
    const request = route.request()
    const path = new URL(request.url()).pathname
    if (path === '/api/ai/threads/sequences') {
      await route.fulfill({ json: thread }); return
    }
    if (path === '/api/sequences/catalog') {
      await route.fulfill({ json: { records: [] } }); return
    }
    if (path === '/api/sequences/contract') {
      await route.fulfill({ json: { schema: { oneOf: [] }, capabilities: { engines: [] }, alphabets: { dna: { symbols: { A: 'A', C: 'C', G: 'G', T: 'T' } } } } }); return
    }
    if (request.method() !== 'GET') {
      await route.fulfill({ json: {} }); return
    }
    await route.continue()
  })
  await page.addInitScript(() => {
    const originalFetch = window.fetch.bind(window)
    window.fetch = (input, init) => {
      const url = input instanceof Request ? input.url : String(input)
      if (!url.includes('/api/ai/assist/stream')) return originalFetch(input, init)
      const state = window as StreamWindow
      const body = new ReadableStream<Uint8Array>({ start(controller) {
        const emit = (event: unknown) => controller.enqueue(new TextEncoder().encode(`data: ${JSON.stringify(event)}\n\n`))
        state.emitChatText = delta => emit({ type: 'text_delta', delta })
        state.endChatStream = () => { controller.close(); delete state.emitChatText }
      } })
      return Promise.resolve(new Response(body, { headers: { 'Content-Type': 'text/event-stream' } }))
    }
  })

  await page.goto('/sequences')
  const log = page.getByRole('log', { name: 'Conversation' })
  const composer = page.getByLabel('Message', { exact: true })
  await expect(log).toContainText('History 23')
  const bottomGap = () => log.evaluate(element => element.scrollHeight - element.clientHeight - element.scrollTop)
  await expect.poll(bottomGap).toBeLessThan(2)
  const assertComposerVisible = async () => {
    const box = await composer.boundingBox()
    expect(box).not.toBeNull()
    expect(box!.y).toBeGreaterThan(0)
    expect(box!.y + box!.height).toBeLessThan(page.viewportSize()!.height)
    expect(await page.locator('.sequence-chat').evaluate(element => element.scrollTop)).toBe(0)
  }
  await assertComposerVisible()

  await composer.fill('Continue the conversation')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.waitForFunction(() => !!(window as StreamWindow).emitChatText)
  await page.evaluate(() => (window as StreamWindow).emitChatText?.('Streamed reply\n'.repeat(35)))
  await expect(log).toContainText('Streamed reply')
  await expect.poll(bottomGap).toBeLessThan(2)
  await assertComposerVisible()

  await log.evaluate(element => { element.scrollTop = 120; element.dispatchEvent(new Event('scroll')) })
  await expect(page.getByRole('button', { name: 'Latest messages' })).toBeVisible()
  const historyPosition = await log.evaluate(element => element.scrollTop)
  await page.evaluate(() => (window as StreamWindow).emitChatText?.('New text while reading history\n'.repeat(20)))
  await expect(log).toContainText('New text while reading history')
  expect(await log.evaluate(element => element.scrollTop)).toBe(historyPosition)
  await page.getByRole('button', { name: 'Latest messages' }).click()
  await expect.poll(bottomGap).toBeLessThan(2)

  await page.setViewportSize({ width: 1150, height: 750 })
  await expect.poll(bottomGap).toBeLessThan(2)
  await assertComposerVisible()
  await page.evaluate(() => (window as StreamWindow).endChatStream?.())
  await expect(page.getByRole('button', { name: 'Cancel', exact: true })).toHaveCount(0)

  await log.evaluate(element => { element.scrollTop = 0; element.dispatchEvent(new Event('scroll')) })
  await expect(page.getByRole('button', { name: 'Latest messages' })).toBeVisible()
  await composer.fill('A new prompt from the history view')
  await page.getByRole('button', { name: 'Send', exact: true }).click()
  await page.waitForFunction(() => !!(window as StreamWindow).emitChatText)
  await expect.poll(bottomGap).toBeLessThan(2)
  await expect(page.getByRole('button', { name: 'Latest messages' })).toHaveCount(0)
  await page.evaluate(() => (window as StreamWindow).endChatStream?.())
  expect(errors).toEqual([])
})
