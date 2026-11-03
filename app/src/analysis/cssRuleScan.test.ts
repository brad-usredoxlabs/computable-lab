/**
 * L1-PIN-HARDEN-1 — unit tests for the brace-depth CSS rule scanner
 * (cssRuleScan.ts). The pin itself (ViewRenderer.cellrender.test.tsx) is the
 * consumer; these tests pin the PARSER's contract so a future edit cannot
 * silently change what the pin sees.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isTableCellSelectorPart, parseCssRules, splitSelectorParts } from './cssRuleScan'

describe('cssRuleScan.parseCssRules', () => {
  it('parses a flat stylesheet with multi-line preludes and rule bodies', () => {
    const css = `
.a { color: red; }
.b,
.c {
  margin: 0;
  padding: 1px;
}
`
    const rules = parseCssRules(css)
    // decls are captured RAW (verbatim, inner content only) — the pin's
    // regexes test raw text and never trim; the pre-fix parser's .trim()
    // was on the OUTER decls value only.
    expect(rules).toEqual([
      { selector: '.a', decls: 'color: red;', atContext: [] },
      { selector: '.b,\n.c', decls: 'margin: 0;\n  padding: 1px;', atContext: [] },
    ])
  })

  it('tracks nesting depth: a nested closing brace does not end the outer rule', () => {
    const css = '@media (max-width: 900px) {\n  .td-x {\n    overflow-wrap: anywhere;\n  }\n}\n'
    const rules = parseCssRules(css)
    expect(rules).toEqual([
      { selector: '.td-x', decls: 'overflow-wrap: anywhere;', atContext: ['@media (max-width: 900px)'] },
    ])
  })

  it('emits atContext chains for nested at-rules, outermost first', () => {
    const css = `
@layer x {
  @media (min-width: 40rem) {
    .a { color: blue; }
  }
}
`
    const rules = parseCssRules(css)
    expect(rules).toEqual([
      {
        selector: '.a',
        decls: 'color: blue;',
        atContext: ['@layer x', '@media (min-width: 40rem)'],
      },
    ])
  })

  it('handles one-line at-rule bodies and @container generically', () => {
    const css = '@container (min-width: 40rem) { .a { grid-template-columns: 1fr; } }'
    const rules = parseCssRules(css)
    expect(rules).toEqual([
      {
        selector: '.a',
        decls: 'grid-template-columns: 1fr;',
        atContext: ['@container (min-width: 40rem)'],
      },
    ])
  })

  it('ignores braces inside string literals', () => {
    const css = ".a { content: '{not a rule}'; color: red; }"
    const rules = parseCssRules(css)
    expect(rules).toEqual([
      { selector: '.a', decls: "content: '{not a rule}'; color: red;", atContext: [] },
    ])
  })

  it('strips comments before scanning (GATEFIX5 rationale)', () => {
    const css = '/* .a { color: red; } */\n.b { color: blue; }'
    const rules = parseCssRules(css)
    expect(rules).toEqual([{ selector: '.b', decls: 'color: blue;', atContext: [] }])
  })

  it('discards statement-level preludes terminated by semicolons (@import)', () => {
    const css = "@import url('x.css');\n.a { color: red; }"
    const rules = parseCssRules(css)
    expect(rules).toEqual([{ selector: '.a', decls: 'color: red;', atContext: [] }])
  })

  it('parses the shipped AnalysisPage.css: the pin-relevant rules are unconditional', () => {
    const css = readFileSync(resolve(process.cwd(), 'src/analysis/AnalysisPage.css'), 'utf8')
    const rules = parseCssRules(css)
    const floor = rules.find(
      (r) => r.selector === '.view-spec__table th, .view-spec__table td' &&
             /overflow-wrap\s*:\s*break-word/.test(r.decls),
    )
    expect(floor).toBeDefined()
    expect(floor?.atContext).toEqual([])
    const door = rules.find((r) => r.selector === '.analysis-right' && /overflow\s*:\s*auto/.test(r.decls))
    expect(door).toBeDefined()
    expect(door?.atContext).toEqual([])
    // The shipped file's @container blocks parse as context, not as rules:
    const container = rules.filter((r) => r.selector.startsWith('@'))
    expect(container).toEqual([])
  })
})

describe('cssRuleScan selector-part logic (moved from the pin, unchanged)', () => {
  it('splits selectors on top-level commas only', () => {
    expect(splitSelectorParts('.view-spec__table :is(th, td)')).toEqual(['.view-spec__table :is(th, td)'])
    expect(splitSelectorParts('.view-spec__table th, .view-spec__table td')).toEqual([
      '.view-spec__table th',
      '.view-spec__table td',
    ])
    expect(splitSelectorParts('[data-join="a,b"] td')).toEqual(['[data-join="a,b"] td'])
  })

  it('rejects non-cell tokens (thead, .view-spec__table-cell)', () => {
    expect(isTableCellSelectorPart('.view-spec__table thead')).toBe(false)
    expect(isTableCellSelectorPart('.view-spec__table-cell')).toBe(false)
    expect(isTableCellSelectorPart('.view-spec__table td')).toBe(true)
    expect(isTableCellSelectorPart('.view-spec__table TD')).toBe(true)
  })
})
