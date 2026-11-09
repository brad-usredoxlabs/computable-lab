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
  // FIX RUN 2 (advc2 defect 1): the inner head has no `&`, so it composes
  // against the style-rule parent as an implicit descendant — the emitted
  // selector retains its FULL parent chain (relaxed nesting: the rule is
  // `.analyses .view-spec__table td` under the media condition).
  it('recurses into an at-rule nested INSIDE a style rule (CSS Nesting §2.3, review case 13)', () => {
    const css = '.analyses { @media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } } }'
    const rules = parseCssRules(css)
    const inner = rules.find((r) => r.selector === '.analyses .view-spec__table td')
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

  // FIX RUN 2 (adversarial review advc2, defect 1): relaxed nesting.
  it('composes a bare nested head against the parent as an implicit descendant', () => {
    const rules = parseCssRules('.view-spec__table { td { overflow-wrap: anywhere; } }')
    // The emitted selector ALWAYS retains the full parent chain — the
    // bare head is `.view-spec__table td`, never a scope-less `td`.
    expect(rules[rules.length - 1]).toEqual({
      selector: '.view-spec__table td',
      decls: 'overflow-wrap: anywhere;',
      atContext: [],
    })
  })

  it('distributes a bare nested head over a parent selector list', () => {
    const rules = parseCssRules('.view-spec__table, .other { td { color: red; } }')
    const nested = rules.filter((r) => r.decls === 'color: red;')
    // TWO composed selectors — the head distributed over the parent list.
    expect(nested.map((r) => r.selector)).toEqual([
      '.view-spec__table td',
      '.other td',
    ])
    expect(nested.every((r) => r.atContext.length === 0)).toBe(true)
    // Deeper nesting under a distributed parent keeps distributing: the
    // recursion carries the resolved selector LIST as its parent, so the
    // grandchild distributes over it too (parent text always retained).
    const deeper = parseCssRules('.view-spec__table, .other { td { b { color: blue; } } }')
    const innermost = deeper.filter((r) => r.decls === 'color: blue;')
    expect(innermost.map((r) => r.selector)).toEqual([
      '.view-spec__table td b',
      '.other td b',
    ])
  })

  // FIX RUN 3 (adversarial review advc3, BLOCKER): a nested rule whose HEAD
  // is itself a selector list got the parent prefixed to the WHOLE head
  // string, so every head part after the first was emitted with no parent
  // chain (`.view-spec__table { .wrap, td { … } }` emitted the single
  // selector `.view-spec__table .wrap, td`; the pin's top-level comma split
  // re-splits it into `.view-spec__table .wrap` + a scope-less `td`, which
  // the ban never sees). The fix composes the CARTESIAN PRODUCT
  // parentParts x headParts so every emitted selector keeps the full parent
  // chain. All shapes below were RED on tip 6ea3ec29 — the pin returned []
  // for each (probe transcript: deliverables/fix3/fix3-red-probe.txt).
  it('composes a nested head that is itself a selector list part-by-part (cartesian product over the parent)', () => {
    const rules = parseCssRules('.view-spec__table { .wrap, td { overflow-wrap: anywhere; } }')
    const nested = rules.filter((r) => r.decls === 'overflow-wrap: anywhere;')
    expect(nested.map((r) => r.selector)).toEqual([
      '.view-spec__table .wrap',
      '.view-spec__table td',
    ])
    expect(nested.every((r) => r.atContext.length === 0)).toBe(true)
  })

  it('distributes a parent selector list x a nested head selector list (cartesian product, both axes)', () => {
    const rules = parseCssRules('.other, .view-spec__table { .wrap, td { color: red; } }')
    const nested = rules.filter((r) => r.decls === 'color: red;')
    expect(nested.map((r) => r.selector)).toEqual([
      '.other .wrap',
      '.other td',
      '.view-spec__table .wrap',
      '.view-spec__table td',
    ])
  })

  it('composes an ambiguous-& nested head list part-by-part (substitution never collapses the head into one string)', () => {
    // The `&`-free part of the head (`td`) must get the SAME per-part
    // descendant composition as the `&`-bearing part — never a bare
    // scope-less emission.
    const rules = parseCssRules('.view-spec__table { :is(&) .x, td { color: red; } }')
    const nested = rules.filter((r) => r.decls === 'color: red;')
    expect(nested.map((r) => r.selector)).toEqual([
      ':is(.view-spec__table) .x',
      '.view-spec__table :is(&) .x',
      '.view-spec__table td',
    ])
  })

  it('keeps distributing a head list across the full chain at every nesting depth (triple nesting)', () => {
    // The recursion receives the resolved selector LIST joined, so the
    // grandchild head-list distributes over the already-composed middle.
    const rules = parseCssRules('.view-spec__table { .wrap { .x, td { color: red; } } }')
    const innermost = rules.filter((r) => r.decls === 'color: red;')
    expect(innermost.map((r) => r.selector)).toEqual([
      '.view-spec__table .wrap .x',
      '.view-spec__table .wrap td',
    ])
  })

  it('filters empty head-list parts (trailing comma) — never emits a bare parent or a blank tail', () => {
    const rules = parseCssRules('.view-spec__table { td, { color: red; } }')
    const nested = rules.filter((r) => r.decls === 'color: red;')
    expect(nested.map((r) => r.selector)).toEqual(['.view-spec__table td'])
  })

  it('never emits a nested rule part that escaped its parent chain (fail-closed invariant, per emitted part)', () => {
    // Ambiguous & placement composes BOTH ways; every emitted selector
    // carries the parent text. Over-flagging is acceptable, escaping the
    // parent chain is not.
    // FIX RUN 3: the check is PER EMITTED SELECTOR PART (splitSelectorParts),
    // not `.toContain` over the joined string — the joined check passed a
    // selector like `.view-spec__table .wrap, td` because the scope
    // survived in the FIRST part while the re-split `td` part escaped. The
    // head lists (`.wrap, td`, `:is(&) .x, td`) are in the loop on purpose:
    // they are the shapes the fix3 blocker produced.
    for (const head of [':is(&) td', ':where(&) > td', ':hover td', 'td', '.wrap, td', ':is(&) .x, td']) {
      const rules = parseCssRules(`.view-spec__table { ${head} { color: red; } }`)
      const emitted = rules.filter((r) => r.decls === 'color: red;')
      expect(emitted.length).toBeGreaterThan(0)
      for (const r of emitted) {
        const parts = splitSelectorParts(r.selector)
        expect(parts.length).toBeGreaterThan(0)
        for (const p of parts) {
          expect(p).toContain('.view-spec__table')
        }
      }
    }
    // Bare-nested inside at-rules on both sides: composition applies only
    // under a STYLE parent; the at-rule prelude stays in atContext.
    const deep = parseCssRules('@supports (x: y) { .view-spec__table { @media (min-width: 1px) { td { color: red; } } } }')
    const inner = deep.find((r) => r.decls === 'color: red;')
    expect(inner?.selector).toBe('.view-spec__table td')
    expect(inner?.atContext).toEqual(['@supports (x: y)', '@media (min-width: 1px)'])
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
