/**
 * The registry's right-hand rail (Related Records + their kind badges) rendered
 * light grey on near-white: it used fixed Tailwind palette utilities, which
 * never follow `.cl-app[data-theme]` (Tailwind v4 here has no data-theme dark
 * variant). Token-only CSS, following the ChangesPanel precedent.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = resolve(process.cwd(), 'src/components/registry')
const tsx = readFileSync(resolve(dir, 'RelatedRecordsCard.tsx'), 'utf8')
const css = readFileSync(resolve(dir, 'RelatedRecordsCard.css'), 'utf8')

const REQUIRED = [
  '.related-records',
  '.related-records__title',
  '.related-records__empty',
  '.related-records__rows',
  '.related-records__row',
  '.related-records__kind',
  '.related-records__label',
  '.related-records__via',
]

describe('RelatedRecordsCard styling (theme tokens)', () => {
  it('imports its per-surface stylesheet', () => {
    expect(tsx).toContain("import './RelatedRecordsCard.css'")
  })

  it('uses no fixed Tailwind palette utilities', () => {
    expect(tsx).not.toMatch(
      /\b(?:bg|text|border|divide)-(?:white|black|gray|slate|blue|red|emerald|amber|orange)-\d{2,3}\b/,
    )
  })

  it('defines every class it renders', () => {
    for (const selector of REQUIRED) expect(css, `missing ${selector}`).toContain(selector)
  })

  it('is token-only: no hex/rgb/hsl colours', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
    expect(css).not.toMatch(/\bhsla?\(/)
    expect(css).toContain('var(--cl-text)')
  })
})
