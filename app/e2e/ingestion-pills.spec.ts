import { test, expect } from '@playwright/test'

/**
 * ISEQ-1 contrast receipt (spec §7): the source pills on /ingestion/literature
 * must be legible on the DEFAULT DARK shell.
 *
 * The defect was hardcoded `background: white` + mid-blue text on a dark app
 * shell (grey-on-grey / white-blob pills). The fix routes every pill colour
 * through the cl design tokens (--cl-bg / --cl-border / --cl-text /
 * --cl-on-accent) via color-mix, so fill and text stay separated in BOTH
 * palettes.
 *
 * Determinism note: ThemeProvider follows the system `prefers-color-scheme`
 * when the user has no stored choice, and headless Chromium reports LIGHT.
 * So the dark case is asserted under explicit `colorScheme: 'dark'` emulation
 * (AppShell then paints data-theme="dark" on .cl-app — the app's dark default
 * palette) and the light case under `colorScheme: 'light'` — proving token
 * routing, not a dark-only hack.
 *
 * Screenshots go to tmp/ingestion-pills.png (dark) and tmp/ingestion-pills-light.png.
 */

function channelDistance(a: string, b: string): number {
  const parse = (value: string): number[] =>
    (value.match(/\d+/g) ?? []).slice(0, 3).map((n) => Number(n))
  const ca = parse(a)
  const cb = parse(b)
  if (ca.length < 3 || cb.length < 3) return 0
  return Math.max(...ca.map((c, i) => Math.abs(c - cb[i])))
}

async function pillColors(page: import('@playwright/test').Page, label: string) {
  const pill = page.locator('.source-pill', { hasText: label }).first()
  await expect(pill).toBeVisible()
  const colors = await pill.evaluate((el) => {
    const cs = getComputedStyle(el)
    return { color: cs.color, background: cs.backgroundColor }
  })
  return { pill, ...colors }
}

async function shellTheme(page: import('@playwright/test').Page) {
  return page.evaluate(() => {
    const app = document.querySelector('.cl-app')
    return {
      hasApp: !!app,
      dataTheme: app ? app.getAttribute('data-theme') : null,
      shellBg: app ? getComputedStyle(app).backgroundColor : null,
    }
  })
}

test.describe('Ingestion source pill contrast (dark default)', () => {
  test.setTimeout(60_000)

  test('unselected and active pills separate text from fill on the dark shell', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'dark' })
    await page.goto('/ingestion/literature')
    await page.waitForSelector('.cl-app')
    await page.waitForSelector('.source-pill')

    // Dark is the app default: with no stored choice, ThemeProvider resolves
    // the system scheme and AppShell paints data-theme="dark" on .cl-app.
    const shell = await shellTheme(page)
    expect(shell.hasApp).toBe(true)
    expect(shell.dataTheme).toBe('dark')

    const unselected = await pillColors(page, 'NCBI Gene')
    const active = await pillColors(page, 'PubMed')

    await page.screenshot({ path: 'tmp/ingestion-pills.png', fullPage: true })

    expect(channelDistance(unselected.color, unselected.background)).toBeGreaterThan(60)
    expect(channelDistance(active.color, active.background)).toBeGreaterThan(60)

    // The old defect signature must be gone: no pure-white pill fill on dark,
    // and the shell really is the dark palette.
    expect(unselected.background).not.toBe('rgb(255, 255, 255)')
    expect(shell.shellBg).toBe('rgb(14, 17, 22)') // --cl-bg dark (#0e1116)
  })

  test('the same pills stay separated on the light palette (tokens invert)', async ({ page }) => {
    await page.emulateMedia({ colorScheme: 'light' })
    await page.goto('/ingestion/literature')
    await page.waitForSelector('.cl-app')
    await page.waitForSelector('.source-pill')

    const shell = await shellTheme(page)
    expect(shell.dataTheme).toBe('light')

    const unselected = await pillColors(page, 'NCBI Gene')
    const active = await pillColors(page, 'PubMed')
    await page.screenshot({ path: 'tmp/ingestion-pills-light.png', fullPage: true })

    expect(channelDistance(unselected.color, unselected.background)).toBeGreaterThan(60)
    expect(channelDistance(active.color, active.background)).toBeGreaterThan(60)
  })
})
