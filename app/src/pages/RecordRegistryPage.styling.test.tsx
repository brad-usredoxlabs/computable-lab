import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'

const dir = resolve(process.cwd(), 'src/pages')
const tsx = readFileSync(resolve(dir, 'RecordRegistryPage.tsx'), 'utf8')
const css = readFileSync(resolve(dir, 'RecordRegistryPage.css'), 'utf8')

const REQUIRED = [
  '.registry-page', '.registry-list', '.registry-list__tabs', '.registry-tab',
  '.registry-tab--active', '.registry-list__actions', '.registry-btn',
  '.registry-btn--primary', '.registry-btn--ghost', '.registry-kind-picker',
  '.registry-kind-chip', '.registry-kind-chip--active', '.registry-error',
  '.registry-list__archived', '.registry-list__archived-label',
  '.registry-list__search', '.registry-list__scroll', '.registry-list__empty',
  '.registry-list__rows', '.registry-row', '.registry-row--selected',
  '.registry-row__title', '.registry-row__meta', '.registry-kind-badge',
  '.registry-editor-body', '.registry-editor-empty', '.registry-placeholder',
  '.registry-placeholder__title', '.registry-placeholder__hint',
  '.registry-note', '.registry-save-error', '.registry-dirty-dot', '.registry-rail',
]

describe('RecordRegistryPage styling (theme tokens)', () => {
  it('imports its per-surface stylesheet', () => {
    expect(tsx).toContain("import './RecordRegistryPage.css'")
  })

  it('uses no fixed Tailwind palette utilities', () => {
    expect(tsx).not.toMatch(/\b(?:bg|text|border|divide)-(?:white|black|gray|slate|blue|red|emerald|amber|orange)-\d{2,3}\b/)
  })

  it('defines every class it renders', () => {
    for (const selector of REQUIRED) expect(css, `missing ${selector}`).toContain(selector)
  })

  it('is token-only: no hex/rgb/hsl colours', () => {
    expect(css).not.toMatch(/#[0-9a-fA-F]{3,8}\b/)
    expect(css).not.toMatch(/\brgba?\(/)
    expect(css).not.toMatch(/\bhsla?\(/)
    expect(css).toContain('var(--cl-bg-elev)')
  })
})
