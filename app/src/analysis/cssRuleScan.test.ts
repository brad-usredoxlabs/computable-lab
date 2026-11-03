/**
 * L1-PIN-HARDEN-1 — unit tests for the brace-depth CSS rule scanner
 * (cssRuleScan.ts). The pin itself (ViewRenderer.cellrender.test.tsx) is the
 * consumer; these tests pin the PARSER's contract so a future edit cannot
 * silently change what the pin sees.
 */
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import {
  decodeCssEscapes,
  isTableCellSelectorPart,
  parseCssRules,
  splitSelectorParts,
} from './cssRuleScan'

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

  // FIX RUN 1 (adversarial review advc1, defect 1): CSS Nesting shapes.
  it('recurses into an at-rule nested INSIDE a style rule (CSS Nesting §2.3, review case 13)', () => {
    const css = '.analyses { @media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } } }'
    const rules = parseCssRules(css)
    const inner = rules.find((r) => r.selector === '.view-spec__table td')
    expect(inner).toBeDefined()
    expect(inner?.decls).toBe('overflow-wrap: anywhere;')
    // The conditional group's prelude is context for the inner rule.
    expect(inner?.atContext).toEqual(['@media (max-width: 900px)'])
    // The outer rule's OWN decls stay empty — the nested block was not
    // swallowed into its decl text.
    const outer = rules.find((r) => r.selector === '.analyses')
    expect(outer?.decls).toBe('')
  })

  it('desugars a &-prefixed nested style rule against its parent (& td -> parent td, review case 14)', () => {
    const css = '.view-spec__table { & td { overflow-wrap: anywhere; } }'
    const rules = parseCssRules(css)
    const nested = rules.find((r) => r.selector === '.view-spec__table td')
    expect(nested).toBeDefined()
    expect(nested?.decls).toBe('overflow-wrap: anywhere;')
    expect(nested?.atContext).toEqual([])
    const outer = rules.find((r) => r.selector === '.view-spec__table')
    expect(outer?.decls).toBe('')
  })

  it('resolves a bare & to the parent selector and compounds glued &.suffix', () => {
    const bare = parseCssRules('.x { & { color: red; } }')
    // The bare-& nested rule desugars to the parent selector itself: it is
    // the LAST emitted rule and carries the declarations.
    expect(bare[bare.length - 1]).toEqual({ selector: '.x', decls: 'color: red;', atContext: [] })
    const glued = parseCssRules('.x { &.y { color: blue; } }')
    expect(glued[glued.length - 1]).toEqual({ selector: '.x.y', decls: 'color: blue;', atContext: [] })
  })

  it('emits a separate conditional rule (extended atContext) for declarations directly under a nested at-rule', () => {
    const css = '.view-spec__table td { color: red; }\n.view-spec__table { @media (min-width: 600px) { overflow-wrap: break-word; } }'
    const rules = parseCssRules(css)
    // Declarations with no selector of their own apply to the PARENT
    // selector while the condition holds — a distinct rule carrying the
    // chain, NOT merged into the parent's unconditional decls.
    const cond = rules.find((r) => r.atContext.length === 1 && /overflow-wrap/.test(r.decls))
    expect(cond).toBeDefined()
    expect(cond?.selector).toBe('.view-spec__table')
    expect(cond?.atContext).toEqual(['@media (min-width: 600px)'])
    // The parent's own (unconditional) decls stay empty.
    const parent = rules.find((r) => r.selector === '.view-spec__table' && r.atContext.length === 0)
    expect(parent?.decls).toBe('')
  })

  it('handles nested at-rules two levels deep inside a style rule', () => {
    const css = '.x { @media (min-width: 40rem) { @supports (overflow-wrap: anywhere) { & td { overflow-wrap: anywhere; } } } }'
    const rules = parseCssRules(css)
    const inner = rules.find((r) => r.selector === '.x td')
    expect(inner).toBeDefined()
    expect(inner?.atContext).toEqual(['@media (min-width: 40rem)', '@supports (overflow-wrap: anywhere)'])
  })

  it('decodes CSS hex escapes in selectors before token checks (review case 17: \\74 d is td)', () => {
    expect(decodeCssEscapes('.view-spec__table \\74 d')).toBe('.view-spec__table td')
    // A trailing whitespace char is the escape terminator (consumed).
    expect(decodeCssEscapes('.a \\74 d .b')).toBe('.a td .b')
    // Non-hex escapes: backslash escapes the next character.
    expect(decodeCssEscapes('.a\\_b td')).toBe('.a_b td')
    // The decoded form is recognized as a cell part; the raw form is not.
    const raw = '.view-spec__table \\74 d'
    expect(splitSelectorParts(raw).some((p) => isTableCellSelectorPart(p))).toBe(false)
    expect(splitSelectorParts(decodeCssEscapes(raw)).some((p) => isTableCellSelectorPart(p))).toBe(true)
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
