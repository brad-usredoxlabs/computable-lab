/**
 * REG-1 D1 — the lifecycle chrome (state pill + transition buttons) rendered
 * near-white on the dark page: fixed Tailwind palette utilities never follow
 * `.cl-app[data-theme]`, and the button text inherited --cl-text (near-white)
 * on the bg-gray-50 card. Token-only CSS, like RelatedRecordsCard.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = resolve(process.cwd(), 'src/components/registry')
const tsx = readFileSync(resolve(dir, 'DocumentControlBar.tsx'), 'utf8')
let css = ''
try {
  css = readFileSync(resolve(dir, 'DocumentControlBar.css'), 'utf8')
} catch {
  css = '' // absent pre-fix; the import/selector assertions below fail RED
}

const REQUIRED = [
  '.dcb',
  '.dcb__card',
  '.dcb__state-pill',
  '.dcb__state-pill--draft',
  '.dcb__state-pill--in_review',
  '.dcb__state-pill--approved',
  '.dcb__state-pill--effective',
  '.dcb__state-pill--superseded',
  '.dcb__state-pill--archived',
  '.dcb__note',
  '.dcb__btn',
  '.dcb__terminal',
  '.dcb__save-hint',
  '.dcb__error',
  '.dcb__receipt',
]

describe('DocumentControlBar styling (theme tokens)', () => {
  it('imports its per-surface stylesheet', () => {
    expect(tsx).toContain("import './DocumentControlBar.css'")
  })

  it('uses no fixed Tailwind palette utilities', () => {
    expect(tsx).not.toMatch(/\b(?:bg|text|border|divide)-(?:white|black|gray|slate|blue|red|emerald|amber|orange|green)-\d{2,3}\b/)
  })

  it('defines every class it renders', () => {
    for (const selector of REQUIRED) expect(css, `missing ${selector}`).toContain(selector)
  })

  it('is token-only: no hex/rgb/hsl/oklch colours', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
    expect(css).not.toMatch(/\bhsla?\(/)
    expect(css).not.toMatch(/\boklch\(/)
    expect(css).toContain('var(--cl-bg-elev)')
    expect(css).toContain('var(--cl-text)')
  })

  it('state pills keep semantic differentiation via existing status tokens', () => {
    // draft/in_review/approved/effective/superseded/archived must be visually
    // distinct in BOTH themes using only tokens defined in tokens.css.
    for (const token of ['--cl-text-dim', '--cl-info-soft', '--cl-success-soft', '--cl-text-faint']) {
      expect(css, `missing token ${token}`).toContain(`var(${token})`)
    }
  })
})
