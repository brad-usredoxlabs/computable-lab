// @vitest-environment node
// g3 D6: a tall dialog must be viewport-capped with the body as the scroll region.
// jsdom has no layout engine, so the contract is asserted on the parsed stylesheet text.
import { readFileSync } from 'node:fs'
import { dirname, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'
import { labModalStyles } from './labModalStyles'

type Decls = Record<string, string>

function parseRules(css: string): Record<string, Decls> {
  const rules: Record<string, Decls> = {}
  const uncommented = css.replace(/\/\*[\s\S]*?\*\//g, '')
  for (const match of uncommented.matchAll(/([^{}]+)\{([^{}]*)\}/g)) {
    for (const selector of match[1].split(',').map((s) => s.trim()).filter(Boolean)) {
      const decls = (rules[selector] ??= {})
      for (const part of match[2].split(';')) {
        const colon = part.indexOf(':')
        if (colon > 0) decls[part.slice(0, colon).trim()] = part.slice(colon + 1).trim()
      }
    }
  }
  return rules
}

const rules = parseRules(labModalStyles)

// FIX-1 (DEFECT 1): the old pin read the `overflow-y` longhand key only, so a shorthand
// `overflow: auto;` on the panel or backdrop slipped through GREEN. A selector scrolls iff
// any of the three overflow keys holds a value matching /auto|scroll/ (hidden/visible do not).
const SCROLL_KEYS = ['overflow', 'overflow-x', 'overflow-y'] as const
const SCROLL_RE = /auto|scroll/
function scrollDeclared(decls: Decls): boolean {
  return SCROLL_KEYS.some((key) => decls[key] !== undefined && SCROLL_RE.test(decls[key]))
}

describe('labModalStyles g3 D6 tall modal', () => {
  it('caps .lab-modal against the viewport, not a fixed pixel height', () => {
    const cap = rules['.lab-modal']?.['max-height']
    expect(cap).toBeDefined()
    expect(cap).toMatch(/calc\(.*100(?:d|s)?vh/)
    expect(cap).not.toMatch(/^\d+(?:\.\d+)?(?:px|rem|em)$/)
  })

  it('scrolls inside .lab-modal__body only, with the flex shrink allowance', () => {
    const body = rules['.lab-modal__body']
    expect(body?.['overflow-y']).toBe('auto')
    expect(body?.['min-height']).toBe('0')
    const scrollers = Object.entries(rules)
      .filter(([, decls]) => scrollDeclared(decls))
      .map(([selector]) => selector)
    expect(scrollers).toEqual(['.lab-modal__body'])
  })

  it('keeps the g1 D1 backdrop behaviour and the pinned panel flex shell', () => {
    const backdrop = rules['.lab-modal__backdrop']
    expect(backdrop?.['position']).toBe('fixed')
    expect(backdrop?.['inset']).toBe('0')
    expect(backdrop?.['padding']).toBe('24px')
    // FIX-1 (DEFECT 1): backdrop and panel must not scroll; an explicit hidden/visible
    // declaration stays legal (Mutation C `overflow: hidden` must remain GREEN).
    expect(scrollDeclared(backdrop ?? {})).toBe(false)
    const panel = rules['.lab-modal']
    expect(panel?.['display']).toBe('flex')
    expect(panel?.['flex-direction']).toBe('column')
    expect(panel?.['width']).toBe('min(480px, 96vw)')
    expect(scrollDeclared(panel ?? {})).toBe(false)
  })

  it('declares no fixed pixel height on the panel', () => {
    // REVIEWER BAIT: `height: 900px` / `max-height: 1056px` — `max-height` is pinned to
    // calc/vh in test 1; the `height` key itself must be absent from the panel.
    expect('height' in (rules['.lab-modal'] ?? {})).toBe(false)
  })
})

// g4 (L2-LABINV-savecontrast-l2t0624): measured on the served bundle, the primary CTA's
// label computed to #1f2328 on #0969da (3.04:1) because AppShell.css's
// `.cl-app button { color: inherit }` (0,1,1) outranks the plain `.lab-modal__save`
// block (0,1,0), so its `color: var(--cl-on-accent)` never applied. This pin compares REAL
// selector specificity against the shell rule read from disk — a `toContain('color:
// var(--cl-on-accent)')` assertion passes even with the defect present and would be vacuous.
const shellCssPath = resolve(dirname(fileURLToPath(import.meta.url)), '../shared/shell/AppShell.css')

/** [ids, classes+attributes+pseudo-classes, elements+pseudo-elements] */
function specificity(selector: string): [number, number, number] {
  let ids = 0
  let classes = 0
  let elements = 0
  let rest = selector.trim()
  rest = rest.replace(/::[\w-]+(?:\([^)]*\))?/g, () => { elements += 1; return ' ' })
  rest = rest.replace(/\[[^\]]*\]/g, () => { classes += 1; return ' ' })
  rest = rest.replace(/(?<!:):[\w-]+(?:\([^)]*\))?/g, () => { classes += 1; return ' ' })
  rest = rest.replace(/#[\w-]+/g, () => { ids += 1; return ' ' })
  rest = rest.replace(/\.[\w-]+/g, () => { classes += 1; return ' ' })
  for (const token of rest.split(/[\s>+~]+/)) if (/^[A-Za-z][\w-]*$/.test(token)) elements += 1
  return [ids, classes, elements]
}

function outranks(left: readonly number[], right: readonly number[]): boolean {
  for (let i = 0; i < 3; i += 1) if (left[i] !== right[i]) return left[i] > right[i]
  return false
}

describe('labModalStyles primary CTA on-accent pin (savecontrast)', () => {
  it('wins the cascade for .lab-modal__save against the shell button reset', () => {
    const shellRules = parseRules(readFileSync(shellCssPath, 'utf8'))
    const shellButton = shellRules['.cl-app button']
    expect(shellButton?.['color']).toBe('inherit')
    const shellWeight = specificity('.cl-app button')

    const colourRules = Object.entries(rules)
      .filter(([selector, decls]) => selector.includes('.lab-modal__save') && decls['color'] !== undefined)
      .map(([selector, decls]) => ({ selector, decls, weight: specificity(selector) }))
    expect(colourRules.length).toBeGreaterThan(0)

    const winner = colourRules.reduce((best, rule) => (outranks(rule.weight, best.weight) ? rule : best))
    expect(
      outranks(winner.weight, shellWeight),
      `${winner.selector} ${winner.weight.join(',')} must strictly out-specify .cl-app button ${shellWeight.join(',')}`,
    ).toBe(true)
    expect(winner.decls['color']).toBe('var(--cl-on-accent)')
  })
})
