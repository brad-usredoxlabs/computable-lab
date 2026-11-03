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
 * True when ONE selector part targets a `.view-spec__table` cell: it is scoped
 * under `.view-spec__table` (with or without a `table` tag prefix) and carries
 * a standalone `th` or `td` tag token. Descendant/child/sibling combinators and
 * pseudo-classes/pseudo-elements are tolerated; `thead`/`tbody` are not `th`/`td`.
 */
function isTableCellSelectorPart(part: string): boolean {
  const scopedToTable = /\.view-spec__table(?![\w-])/.test(part)
  const cellToken = /(?:^|[\s,>+~])(?:th|td)(?![\w-])/.test(part)
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
    r.selector.split(',').some(
      (part) =>
        isTableCellSelectorPart(part.trim()) &&
        !part.includes('.view-spec__cell-item') &&
        /overflow-wrap\s*:\s*anywhere/.test(r.decls),
    ),
  )
  if (anywhereOnTableCell) {
    violations.push(ANYWHERE_VIOLATION)
  }
  if (!plainCellRules.some((r) => /overflow-wrap\s*:\s*break-word/.test(r.decls))) {
    violations.push('no .view-spec__table th/td rule declares overflow-wrap: break-word')
  }
  const cellItem = rules.find((r) => /(^|,)\s*\.view-spec__cell-item\s*(,|$)/.test(r.selector))
  if (!cellItem) {
    violations.push('no .view-spec__cell-item rule exists')
  } else if (!/min-width\s*:/.test(cellItem.decls)) {
    violations.push('.view-spec__cell-item declares no min-width floor')
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
  })
})

/**
 * Review D1: the AC §2.1 bullet 1 ban must survive the selector shapes the
 * original matcher missed (split `th`/`td`, `table.` prefix, descendant
 * combinator). Fixture is a minimal CONFORMING floor; appending one defect rule
 * must yield exactly the one `anywhere` violation — nothing else.
 */
describe('FAME-8 GATEFIX5 — source pin catches split/qualified plain-cell selectors (review D1)', () => {
  const CONFORMING_FLOOR = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
`

  it('flags `anywhere` in all four previously-evading selector shapes', () => {
    expect(sourceViolations(CONFORMING_FLOOR)).toEqual([])
    const shapes = [
      '.view-spec__table td { overflow-wrap: anywhere; }',
      '.view-spec__table th { overflow-wrap: anywhere; }',
      'table.view-spec__table td { overflow-wrap: anywhere; }',
      '.view-spec__table tr > td { overflow-wrap: anywhere; }',
    ]
    for (const shape of shapes) {
      expect(sourceViolations(CONFORMING_FLOOR + shape)).toEqual([ANYWHERE_VIOLATION])
    }
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
