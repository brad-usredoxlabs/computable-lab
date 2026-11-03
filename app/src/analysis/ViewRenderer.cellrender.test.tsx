import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewRenderer, toRenderableArtifact } from './ViewRenderer'

/**
 * FAME-8 GATEFIX5 — cell-render floor pins (architect decision 2026-11-02).
 *
 * jsdom cannot measure line boxes, so the MECHANISM is pinned here and the
 * GEOMETRY is gate-pinned (browser gate 4). GATEFIX4's one-line
 * `overflow-wrap: anywhere` on every `.view-spec__table th, td` collapsed all
 * min-content to ~1 char (gate 3: `rt_min "4.946334540681159"` split into 6
 * line boxes, `peak` -> `p`/`e`/`a`/`k`). The fix:
 *   - plain cells: `overflow-wrap: break-word` (honest min-content, never
 *     mid-token in layout; break-word only fires if a cell is artificially
 *     narrowed);
 *   - array cells (.view-spec__cell-item): keep `anywhere` WITH a `min-width`
 *     floor so auto layout cannot starve the column to one character.
 * Both pins below are non-vacuous by construction: each check is a function
 * called twice — once on the real artifact (expect pass / empty violations)
 * and once on the pre-fix / defect text (expect the exact failures).
 */

const CSS_PATH = resolve(process.cwd(), 'src/analysis/AnalysisPage.css')

/**
 * The pre-fix rule (GATEFIX4 at :123) plus a stand-in for the surrounding
 * file context (the untouched `.analysis-right` door — the pin must keep
 * asserting the door, so the fixture needs it). This is the text the pin is
 * proven to FAIL against.
 */
const PREFIX_CSS = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: anywhere; white-space: normal; }
`

function parseCssRules(css: string): Array<{ selector: string; decls: string }> {
  // Comments stripped FIRST: the GATEFIX5 history/architect prose legitimately
  // contains the words `overflow-wrap: anywhere`, so matching the raw text
  // would be wrong. Block comments only — no string literals carry `/*` in
  // this file.
  const stripped = css.replace(/\/\*[\s\S]*?\*\//g, '')
  return Array.from(stripped.matchAll(/^([^{\/][^{]*)\{([^}]*)\}\s*$/gm), (m) => ({
    selector: m[1].trim(),
    decls: m[2].trim(),
  }))
}

const ANYWHERE_VIOLATION =
  'a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere'

/**
 * Minimal CONFORMING floor: every positive claim of §2.1 satisfied. Appending
 * ONE defect rule to this fixture must yield exactly the one `anywhere`
 * violation — nothing else.
 */
const CONFORMING_FLOOR = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
`

/**
 * Split a selector list on its TOP-LEVEL commas only: commas inside `()`
 * (functional pseudo-classes such as `:is(th, td)`) or `[]` (attribute
 * selectors) are part of one selector part. A naive `split(',')` tears
 * `.view-spec__table :is(th, td)` into `.view-spec__table :is(th` + ` td)`,
 * neither of which names a cell selector (review D4).
 */
function splitSelectorParts(selector: string): string[] {
  const parts: string[] = []
  let depth = 0
  let current = ''
  for (const ch of selector) {
    if (ch === '(' || ch === '[') depth++
    else if (ch === ')' || ch === ']') depth = Math.max(0, depth - 1)
    if (ch === ',' && depth === 0) {
      parts.push(current)
      current = ''
    } else {
      current += ch
    }
  }
  parts.push(current)
  return parts.map((p) => p.trim())
}

/**
 * True when ONE selector part targets a `.view-spec__table` cell: it is scoped
 * under `.view-spec__table` (with or without a `table` tag prefix) and carries
 * a standalone `th` or `td` tag token. Descendant/child/sibling combinators,
 * pseudo-classes and pseudo-elements are tolerated, INCLUDING functional
 * pseudo-classes (`:is(th, td)`) — the token may be preceded by any
 * non-identifier character, so `(` and `:` do not hide it (review D4).
 * `thead`/`tbody`/`.view-spec__table-cell` are not `th`/`td`: the trailing
 * `(?![\w-])` guard rejects them. Both regexes are case-insensitive because
 * CSS type selectors are case-insensitive in an HTML document (review D5).
 */
function isTableCellSelectorPart(part: string): boolean {
  const scopedToTable = /\.view-spec__table(?![\w-])/.test(part)
  const cellToken = /(?:^|[^\w-])(?:th|td)(?![\w-])/i.test(part)
  return scopedToTable && cellToken
}

/**
 * The source pin (spec §2.1). Returns the list of violated claims — empty
 * means the file satisfies the GATEFIX5 floor.
 *
 * Scope (documented deviation, review D2): the `anywhere` ban is enforced on
 * every selector in the `.view-spec__table` CELL family, not literally on every
 * selector in the file. The file legitimately keeps `overflow-wrap: anywhere`
 * on three `.compare-surface__*` rules (a different component, out of this
 * item's scope), so a file-wide textual ban is unsatisfiable. Within the
 * table-cell family the ban is evaluated PER SELECTOR PART: `th` and `td` are
 * separate tokens, so split, `table.`-prefixed and descendant-combinator
 * selectors cannot evade it (review D1). `.view-spec__cell-item` is the one
 * legal carrier of `anywhere` inside that family.
 */
function sourceViolations(css: string): string[] {
  const rules = parseCssRules(css)
  const plainCellRules = rules.filter(
    (r) => /(^|,)\s*\.view-spec__table\s+th\s*(,|$)/.test(r.selector) &&
           /(^|,)\s*\.view-spec__table\s+td\s*(,|$)/.test(r.selector),
  )
  const violations: string[] = []
  const anywhereOnTableCell = rules.some((r) =>
    splitSelectorParts(r.selector).some(
      (part) =>
        isTableCellSelectorPart(part) &&
        !part.includes('.view-spec__cell-item') &&
        /overflow-wrap\s*:\s*anywhere/i.test(r.decls),
    ),
  )
  if (anywhereOnTableCell) {
    violations.push(ANYWHERE_VIOLATION)
  }
  if (!plainCellRules.some((r) => /overflow-wrap\s*:\s*break-word/i.test(r.decls))) {
    violations.push('no .view-spec__table th/td rule declares overflow-wrap: break-word')
  }
  const cellItem = rules.find((r) => /(^|,)\s*\.view-spec__cell-item\s*(,|$)/.test(r.selector))
  if (!cellItem) {
    violations.push('no .view-spec__cell-item rule exists')
  } else {
    if (!/min-width\s*:/.test(cellItem.decls)) {
      violations.push('.view-spec__cell-item declares no min-width floor')
    }
    if (!/overflow-wrap\s*:\s*anywhere/i.test(cellItem.decls)) {
      violations.push('.view-spec__cell-item no longer declares overflow-wrap: anywhere')
    }
  }
  const door = rules.find((r) => /(^|,)\s*\.analysis-right\s*(,|$)/.test(r.selector))
  if (!door || !/overflow\s*:\s*auto/.test(door.decls)) {
    violations.push('.analysis-right no longer declares overflow: auto (FAME-LAYOUT-1 door regressed)')
  }
  return violations
}

/**
 * The DOM pin, scalar arm (spec §2.2): a scalar numeric cell renders its
 * digits as DIRECT text of a single td — one Text child, no wrapper node.
 * That is what lets the browser lay it out on one line box under the
 * break-word floor (a wrapper div would force a block reflow). Returns the
 * list of violated claims — empty means the cell satisfies the contract.
 */
function scalarViolations(cell: HTMLElement, expected: string): string[] {
  const v: string[] = []
  if (cell.textContent !== expected) {
    v.push(`td text ${JSON.stringify(cell.textContent)} !== payload value ${JSON.stringify(expected)}`)
  }
  if (cell.childNodes.length !== 1) {
    v.push(`td has ${cell.childNodes.length} child nodes, expected exactly 1 (direct text)`)
  } else if (!(cell.childNodes[0] instanceof Text) || (cell.childNodes[0] as Text).textContent !== expected) {
    v.push('td child is not the payload value as a single direct Text node (a wrapper node is present)')
  }
  if (cell.querySelectorAll('.view-spec__cell-item').length > 0) {
    v.push('scalar td carries .view-spec__cell-item wrappers')
  }
  return v
}

/**
 * The DOM pin, array arm: an array cell renders exactly ONE
 * .view-spec__cell-item per payload element, each string equal to the
 * payload element — no comma-joined run (the pre-GATEFIX4 shape), no
 * reformatting. Returns the list of violated claims — empty means the cell
 * satisfies the contract.
 */
function arrayViolations(cell: HTMLElement, expected: string[]): string[] {
  const v: string[] = []
  const items = Array.from(cell.querySelectorAll('.view-spec__cell-item'))
  if (items.length !== expected.length) {
    v.push(`expected ${expected.length} .view-spec__cell-item nodes, found ${items.length}`)
  }
  items.forEach((el, i) => {
    if (el.textContent !== expected[i]) {
      v.push(`cell-item ${i} text ${JSON.stringify(el.textContent)} !== payload element ${JSON.stringify(expected[i])}`)
    }
  })
  if (cell.textContent === expected.join(',')) {
    v.push('cell renders the comma-joined run (pre-GATEFIX4 shape)')
  }
  return v
}

describe('FAME-8 GATEFIX5 — AnalysisPage.css cell-render floor (source pin)', () => {
  it('the GATEFIX5 floor holds in AnalysisPage.css and the pin provably fails against the pre-fix text', () => {
    const css = readFileSync(CSS_PATH, 'utf8')
    // GREEN: the real file satisfies every claim.
    expect(sourceViolations(css)).toEqual([])
    // Non-vacuity: the SAME function, called on the pre-fix text, must fail.
    // Full pre-fix rule + the door context the pin also asserts:
    expect(sourceViolations(PREFIX_CSS)).toEqual([
      ANYWHERE_VIOLATION,
      'no .view-spec__table th/td rule declares overflow-wrap: break-word',
      'no .view-spec__cell-item rule exists',
    ])
    // And on the spec's abbreviated pre-fix string alone (no door context),
    // the same matcher must still fail — non-vacuous either way:
    expect(sourceViolations('th, td { overflow-wrap: anywhere; white-space: normal; }')).toEqual([
      'no .view-spec__table th/td rule declares overflow-wrap: break-word',
      'no .view-spec__cell-item rule exists',
      '.analysis-right no longer declares overflow: auto (FAME-LAYOUT-1 door regressed)',
    ])
    // Positive array-cell claim (review O2): deleting the `anywhere`
    // declaration from .view-spec__cell-item must be caught, not stay green.
    const cellItemWithoutAnywhere = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { min-width: 12ch; }
`
    expect(sourceViolations(cellItemWithoutAnywhere)).toEqual([
      '.view-spec__cell-item no longer declares overflow-wrap: anywhere',
    ])
  })
})

/**
 * Review D1: the AC §2.1 bullet 1 ban must survive the selector shapes the
 * original matcher missed (split `th`/`td`, `table.` prefix, descendant
 * combinator). Fixture is a minimal CONFORMING floor; appending one defect rule
 * must yield exactly the one `anywhere` violation — nothing else.
 */
describe('FAME-8 GATEFIX5 — source pin catches split/qualified plain-cell selectors (review D1)', () => {
  it('flags `anywhere` in every evade-then-flag selector shape', () => {
    expect(sourceViolations(CONFORMING_FLOOR)).toEqual([])
    const shapes = [
      // D1 cycle 1: split th/td, table. prefix, descendant/child combinator.
      '.view-spec__table td { overflow-wrap: anywhere; }',
      '.view-spec__table th { overflow-wrap: anywhere; }',
      'table.view-spec__table td { overflow-wrap: anywhere; }',
      '.view-spec__table tr > td { overflow-wrap: anywhere; }',
      // D4 cycle 2: functional pseudo-class (token hidden behind `(` and a
      // comma that a naive split(',') tears in half).
      '.view-spec__table :is(td) { overflow-wrap: anywhere; }',
      '.view-spec__table :is(th, td) { overflow-wrap: anywhere; }',
      '.view-spec__table :is(th,td) { overflow-wrap: anywhere; }',
      // D5 cycle 2: CSS type selectors and keyword values are case-insensitive.
      '.view-spec__table TD { overflow-wrap: anywhere; }',
      '.view-spec__table TH, .view-spec__table TD { overflow-wrap: anywhere; }',
      '.view-spec__table td { overflow-wrap: ANYWHERE; }',
    ]
    for (const shape of shapes) {
      expect(sourceViolations(CONFORMING_FLOOR + shape)).toEqual([ANYWHERE_VIOLATION])
    }
  })
})

/**
 * Review D4/D5 (cycle 2): the pin must see through functional pseudo-classes
 * and CSS case-insensitivity, and must still NOT invent cell selectors where
 * there are none (`thead`, `.view-spec__table-cell`). Each shape is asserted
 * with its own labelled failure message so a hole names itself.
 */
describe('FAME-8 GATEFIX5 — source pin handles functional pseudo-classes and case variants (review D4/D5)', () => {
  const evasions: Array<[string, string]> = [
    ['functional pseudo-class, single arg', '.view-spec__table :is(td) { overflow-wrap: anywhere; }'],
    ['functional pseudo-class, comma+space', '.view-spec__table :is(th, td) { overflow-wrap: anywhere; }'],
    ['functional pseudo-class, comma no space', '.view-spec__table :is(th,td) { overflow-wrap: anywhere; }'],
    ['upper-case type selector', '.view-spec__table TD { overflow-wrap: anywhere; }'],
    ['upper-case split type selectors', '.view-spec__table TH, .view-spec__table TD { overflow-wrap: anywhere; }'],
    ['upper-case keyword value', '.view-spec__table td { overflow-wrap: ANYWHERE; }'],
  ]

  it('flags every evasion class as exactly the `anywhere` violation', () => {
    expect(sourceViolations(CONFORMING_FLOOR)).toEqual([])
    for (const [label, shape] of evasions) {
      expect({ label, violations: sourceViolations(CONFORMING_FLOOR + shape) }).toEqual({
        label,
        violations: [ANYWHERE_VIOLATION],
      })
    }
  })

  it('splits selectors on top-level commas only', () => {
    // The naive split(',') produced ['.view-spec__table :is(th', ' td)'].
    expect(splitSelectorParts('.view-spec__table :is(th, td)')).toEqual(['.view-spec__table :is(th, td)'])
    expect(splitSelectorParts('.view-spec__table th, .view-spec__table td')).toEqual([
      '.view-spec__table th',
      '.view-spec__table td',
    ])
    expect(splitSelectorParts('[data-join="a,b"] td')).toEqual(['[data-join="a,b"] td'])
  })

  it('still rejects non-cell tokens (trailing-identifier guard intact)', () => {
    // `thead`/`tbody` are not `th`/`td`, and `.view-spec__table-cell` is not
    // the table scope — neither may be reported, so no false positive.
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table thead { overflow-wrap: anywhere; }'),
    ).toEqual([])
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table-cell { overflow-wrap: anywhere; }'),
    ).toEqual([])
  })
})

describe('FAME-8 GATEFIX5 — ViewRenderer cell DOM shape (DOM pin)', () => {
  // The browser lays a scalar cell out on one line box only when its digits
  // are DIRECT text of the td (no wrapper div forcing a block-level reflow);
  // an array cell renders exactly one .view-spec__cell-item per element so
  // the array's `anywhere` wrap stays INSIDE that element.
  it('renders a scalar numeric cell as direct td text (no wrapper div)', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', {
          columns: ['rt_min', 'area_percent'],
          rows: [{ rt_min: 4.946334540681159, area_percent: 100 }],
        })}
      />,
    )
    const cells = screen.getAllByRole('cell')
    expect(cells).toHaveLength(2)
    expect(scalarViolations(cells[0], '4.946334540681159')).toEqual([])
    expect(scalarViolations(cells[1], '100')).toEqual([])
  })

  it('renders an array cell as exactly one .view-spec__cell-item per element, text verbatim', () => {
    render(
      <ViewRenderer
        view={{ id: 'v', title: 'T', artifact: 'a', renderer: 'table' }}
        artifact={toRenderableArtifact('a', 'table', {
          columns: ['k', 'flags'],
          rows: [{ k: 1, flags: ['ALPHA_FLAG', 'BETA_FLAG'] }],
        })}
      />,
    )
    const cell = screen.getAllByRole('cell')[1]
    expect(arrayViolations(cell, ['ALPHA_FLAG', 'BETA_FLAG'])).toEqual([])
  })

  it('both DOM checks provably fail against the defect shape (non-vacuous)', () => {
    // The defect shape the GATEFIX5 contract guards against: a scalar wrapped
    // in a div (breaks the one-line-box layout the CSS floor depends on) and
    // the pre-GATEFIX4 comma-joined array run (no per-element wrapper). The
    // GATEFIX5 fix itself is CSS-only, so the renderer's DOM is identical
    // pre- and post-fix — the failure mode is demonstrated against this
    // defect shape rather than the pre-fix CSS file.
    render(
      <table className="view-spec__table">
        <tbody>
          <tr>
            <td><div>4.946334540681159</div></td>
            <td>ALPHA_FLAG,BETA_FLAG</td>
          </tr>
        </tbody>
      </table>,
    )
    const [defectScalar, defectArray] = screen.getAllByRole('cell')
    expect(scalarViolations(defectScalar, '4.946334540681159')).toEqual([
      'td child is not the payload value as a single direct Text node (a wrapper node is present)',
    ])
    expect(arrayViolations(defectArray, ['ALPHA_FLAG', 'BETA_FLAG'])).toEqual([
      'expected 2 .view-spec__cell-item nodes, found 0',
      'cell renders the comma-joined run (pre-GATEFIX4 shape)',
    ])
  })
})
