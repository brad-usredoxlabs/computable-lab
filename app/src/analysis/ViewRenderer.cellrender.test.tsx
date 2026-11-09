import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { ViewRenderer, toRenderableArtifact } from './ViewRenderer'
import {
  decodeCssEscapes,
  isTableCellSelectorPart,
  parseCssRules,
  splitSelectorParts,
} from './cssRuleScan'

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

const ANYWHERE_VIOLATION =
  'a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere'

const FLOOR_VIOLATION =
  'no .view-spec__table th/td rule declares overflow-wrap: break-word'

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
 *
 * L1-PIN-HARDEN-1 (O1): parsing is now brace-depth (./cssRuleScan) with an
 * `atContext` chain per rule. The `anywhere` ban applies REGARDLESS of
 * `atContext` — a responsive override cannot reintroduce it. The positive
 * floor claims (the `th, td` `break-word` floor, the `.view-spec__cell-item`
 * min-width/anywhere pair, the `.analysis-right` door) are satisfied ONLY by
 * UNCONDITIONAL rules (empty `atContext`): a rule declared only inside
 * @media/@supports/@layer/@container must not count.
 */
function sourceViolations(css: string): string[] {
  const rules = parseCssRules(css)
  const unconditional = rules.filter((r) => r.atContext.length === 0)
  const plainCellRules = unconditional.filter(
    (r) => /(^|,)\s*\.view-spec__table\s+th\s*(,|$)/.test(r.selector) &&
           /(^|,)\s*\.view-spec__table\s+td\s*(,|$)/.test(r.selector),
  )
  const violations: string[] = []
  // FIX RUN 2 (advc2 defect 3): the .view-spec__cell-item carve-out is a
  // TOKEN-BOUNDARY test, not a substring test — `td.view-spec__cell-item-x`
  // (or any `cell-item` token extended by word chars/hyphens) is NOT the
  // legal carrier and cannot excuse `anywhere`. The pattern is the exact
  // one the reviewer verified in advc2 §7 / the decision: a non-word,
  // non-hyphen character (or start of part) before the token's `.`, and no
  // word char/hyphen after it. The real bare `.view-spec__cell-item` rule
  // stays exempt; a glued compound (`td.view-spec__cell-item`) is NOT
  // exempt — that is the over-flagging, fail-closed side of the boundary
  // (a td that is itself a .view-spec__cell-item does not exist in the
  // rendered DOM: ViewRenderer puts the class on a wrapper INSIDE the td).
  const CELL_ITEM_TOKEN = /(^|[^\w-])\.view-spec__cell-item(?![\w-])/
  const anywhereOnTableCell = rules.some((r) =>
    splitSelectorParts(decodeCssEscapes(r.selector)).some(
      (part) =>
        isTableCellSelectorPart(part) &&
        !CELL_ITEM_TOKEN.test(part) &&
        /overflow-wrap\s*:\s*anywhere/i.test(r.decls),
    ),
  )
  if (anywhereOnTableCell) {
    violations.push(ANYWHERE_VIOLATION)
  }
  if (!plainCellRules.some((r) => /overflow-wrap\s*:\s*break-word/i.test(r.decls))) {
    violations.push(FLOOR_VIOLATION)
  }
  const cellItem = unconditional.find((r) => /(^|,)\s*\.view-spec__cell-item\s*(,|$)/.test(r.selector))
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
  const door = unconditional.find((r) => /(^|,)\s*\.analysis-right\s*(,|$)/.test(r.selector))
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

/**
 * L1-PIN-HARDEN-1 (adv-cycle-3 O1): the line-anchored parseCssRules could not
 * see a rule nested inside @media/@supports/@layer, so a responsive override
 * reintroducing `overflow-wrap: anywhere` on a table cell passed the pin.
 * These fixtures are RED against the pre-fix line-anchored parser (the
 * nested rule is invisible -> the pin returns []) and GREEN once
 * parseCssRules is the brace-depth scanner with an `atContext` chain.
 */
describe('L1-PIN-HARDEN-1 — source pin is nesting-aware (O1)', () => {
  const O1_MULTI = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@media (max-width: 900px) {
  .view-spec__table td {
    overflow-wrap: anywhere;
  }
}
`
  const O1_ONELINE = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } }
`
  const O1_SUPPORTS = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@supports (overflow-wrap: anywhere) { .view-spec__table td { overflow-wrap: anywhere; } }
`
  // FIX RUN 1 (adversarial review advc1, §3): the two remaining native CSS
  // Nesting evasion shapes, plus the review's case 17 (escape-encoded cell
  // token). All three were reproduced RED first-hand against the pre-fix
  // scanner before this fix run: each returns [] there (probe transcript in
  // deliverables/l1-pin-harden-1-fix1/fix1-red-probe.txt).
  const NEST_ATRULE_INSIDE_RULE = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
.analyses { @media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } } }
`
  const AMPERSAND_TAIL = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
.view-spec__table { & td { overflow-wrap: anywhere; } }
`
  const ESCAPED_CELL_TOKEN = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@media (max-width: 900px) { .view-spec__table \\74 d { overflow-wrap: anywhere; } }
`
  const O1_IS_SHAPE = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@media (max-width: 900px) {
  .view-spec__table :is(th, td) {
    overflow-wrap: anywhere;
  }
}
`

  it('(a) multi-line @media-nested td anywhere is flagged (O1, verbatim from the review)', () => {
    expect(sourceViolations(O1_MULTI)).toEqual([ANYWHERE_VIOLATION])
  })

  it('(b) one-line @media-nested td anywhere is flagged (same evasion, compact form)', () => {
    expect(sourceViolations(O1_ONELINE)).toEqual([ANYWHERE_VIOLATION])
  })

  it('(c) @supports-nested td anywhere is flagged (the scanner is at-rule-generic)', () => {
    expect(sourceViolations(O1_SUPPORTS)).toEqual([ANYWHERE_VIOLATION])
  })

  it('(d) @media-nested :is(th, td) shape is flagged (D4 evasion plus nesting)', () => {
    expect(sourceViolations(O1_IS_SHAPE)).toEqual([ANYWHERE_VIOLATION])
  })

  it('(e) conforming floor plus a benign @media block stays clean (no false positive)', () => {
    const benign = `
@media (max-width: 900px) {
  .view-spec__cell-item { min-width: 8ch; }
  .view-spec__table { font-size: .8rem; }
}
`
    expect(sourceViolations(CONFORMING_FLOOR + benign)).toEqual([])
  })

  it('(f) break-word floor existing ONLY inside @media does not satisfy the unconditional floor', () => {
    const conditionalFloor = `
.analysis-right { overflow: auto; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@media (max-width: 900px) {
  .view-spec__table th, .view-spec__table td { overflow-wrap: break-word; }
}
`
    expect(sourceViolations(conditionalFloor)).toEqual([FLOOR_VIOLATION])
  })

  it('(g) at-rule nested INSIDE a style rule cannot reopen anywhere (CSS Nesting §2.3, review case 13)', () => {
    expect(sourceViolations(NEST_ATRULE_INSIDE_RULE)).toEqual([ANYWHERE_VIOLATION])
  })

  it('(i) &-prefixed nested style rule cannot reopen anywhere (CSS Nesting & desugaring, review case 14)', () => {
    expect(sourceViolations(AMPERSAND_TAIL)).toEqual([ANYWHERE_VIOLATION])
  })

  it('(j) escape-encoded cell token cannot evade the ban (review case 17: \\74 d is td)', () => {
    expect(sourceViolations(ESCAPED_CELL_TOKEN)).toEqual([ANYWHERE_VIOLATION])
  })

  it('the exported brace-depth scanner emits atContext for the O1 rule', () => {
    const rules = parseCssRules(O1_MULTI)
    const nested = rules.find((r) => r.selector === '.view-spec__table td')
    expect(nested).toBeDefined()
    expect(nested?.atContext).toEqual(['@media (max-width: 900px)'])
  })
})

/**
 * L1-PIN-HARDEN-1 FIX RUN 2 (adversarial review advc2, defect 1): RELAXED
 * CSS Nesting — a nested style rule whose head contains no `&` is an
 * implicit descendant of its parent in current engines and Vite ships it
 * as-is: `.view-spec__table { td { … } }` means `.view-spec__table td`.
 * The pre-fix scanner emitted such a head verbatim (`td`), dropping the
 * parent scope, so the ban never saw `.view-spec__table` and returned [].
 * All 11 shapes below were reproduced RED first-hand on tip b2b59fdf
 * (deliverables/l1-pin-harden-1-fix2/fix2-red-probe-prefix.txt).
 */
describe('L1-PIN-HARDEN-1 FIX RUN 2 — relaxed nesting (bare head) composes against the parent (advc2 D1)', () => {
  const relaxedNesting: Array<[string, string]> = [
    ['K bare nested td', '.view-spec__table { td { overflow-wrap: anywhere; } }'],
    ['K2 bare nested th', '.view-spec__table { th { overflow-wrap: anywhere; } }'],
    ['L at-rule inside style rule, bare head', '.view-spec__table { @media (max-width: 900px) { td { overflow-wrap: anywhere; } } }'],
    ['M bare head under table rule inside @media', '@media (max-width: 900px) { .view-spec__table { td { overflow-wrap: anywhere; } } }'],
    ['N bare nested head list th, td', '.view-spec__table { th, td { overflow-wrap: anywhere; } }'],
    ['O bare nested :hover td', '.view-spec__table { :hover td { overflow-wrap: anywhere; } }'],
    ['P &-block then bare td sibling', '.view-spec__table { & { color: red; } td { overflow-wrap: anywhere; } }'],
    ['Q parent selector list distribution', '.view-spec__table, .other { td { overflow-wrap: anywhere; } }'],
    ['R ambiguous & :is(&) td', '.view-spec__table { :is(&) td { overflow-wrap: anywhere; } }'],
    ['S ambiguous & :where(&) > td', '.view-spec__table { :where(&) > td { overflow-wrap: anywhere; } }'],
    ['D2 @supports > rule > @media > bare head', '@supports (overflow-wrap: anywhere) { .view-spec__table { @media (min-width: 1px) { td { overflow-wrap: anywhere; } } } }'],
  ]

  it('every relaxed-nesting bare-head shape is flagged as exactly the anywhere violation', () => {
    expect(sourceViolations(CONFORMING_FLOOR)).toEqual([])
    for (const [label, shape] of relaxedNesting) {
      expect({ label, violations: sourceViolations(CONFORMING_FLOOR + shape) }).toEqual({
        label,
        violations: [ANYWHERE_VIOLATION],
      })
    }
  })

  it('the &-controls keep flagging (fix run 1 closures do not regress)', () => {
    for (const shape of [
      '.view-spec__table { & td { overflow-wrap: anywhere; } }',
      '.view-spec__table { &.x td { overflow-wrap: anywhere; } }',
    ]) {
      expect(sourceViolations(CONFORMING_FLOOR + shape)).toEqual([ANYWHERE_VIOLATION])
    }
  })

  it('benign bare-nested shapes stay clean (composition must not invent false positives)', () => {
    for (const shape of [
      '.view-spec__table { font-size: .8rem; }',
      '.view-spec__table { td { padding: 2px; } }',
      '.view-spec__table { thead { overflow-wrap: anywhere; } }',
      '.view-spec__table { @media (max-width: 900px) { td { font-size: .8rem; } } }',
    ]) {
      expect({ shape, violations: sourceViolations(CONFORMING_FLOOR + shape) }).toEqual({
        shape,
        violations: [],
      })
    }
  })
})

/**
 * L1-PIN-HARDEN-1 FIX RUN 2 (advc2 defect 3, ruled in scope): the
 * `.view-spec__cell-item` carve-out was a SUBSTRING test, so
 * `.view-spec__table td.view-spec__cell-item-x { overflow-wrap: anywhere }`
 * was excused by merely CONTAINING the token. It is now a token-boundary
 * test — pinned in BOTH directions.
 */
describe('L1-PIN-HARDEN-1 FIX RUN 2 — .view-spec__cell-item carve-out is token-exact (advc2 D3)', () => {
  it('extended token .view-spec__cell-item-x does NOT excuse anywhere (violation reported)', () => {
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table td.view-spec__cell-item-x { overflow-wrap: anywhere; }'),
    ).toEqual([ANYWHERE_VIOLATION])
    // Hyphen-free extension is equally rejected (word boundary both sides).
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table td.view-spec__cell-itemx { overflow-wrap: anywhere; }'),
    ).toEqual([ANYWHERE_VIOLATION])
  })

  it('the real .view-spec__cell-item carrier stays exempt (no false positive)', () => {
    // The exempt shape is the token at a true boundary: a descendant part
    // `.view-spec__table td .view-spec__cell-item`, and the shipped file's
    // bare `.view-spec__cell-item` rule.
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table td .view-spec__cell-item { overflow-wrap: anywhere; }'),
    ).toEqual([])
    // Fail-closed side of the boundary (recorded, per the decision's
    // "over-flagging is acceptable"): the reviewer's exact regex does NOT
    // excuse a glued compound `td.view-spec__cell-item`. This shape does
    // not exist in the rendered DOM (ViewRenderer puts the class on a
    // wrapper INSIDE the td), so nothing legitimate depends on it.
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table td.view-spec__cell-item { overflow-wrap: anywhere; }'),
    ).toEqual([ANYWHERE_VIOLATION])
    // The shipped file (whose real rule is a bare .view-spec__cell-item)
    // still satisfies every claim.
    const css = readFileSync(CSS_PATH, 'utf8')
    expect(sourceViolations(css)).toEqual([])
  })
})

/**
 * L1-PIN-HARDEN-1 FIX RUN 3 (adversarial review advc3, BLOCKER): a nested
 * rule whose HEAD is itself a selector list (`.view-spec__table { .wrap, td
 * { overflow-wrap: anywhere; } }`) got the parent prefixed to the WHOLE head
 * string, so every head part after the first was emitted with no parent
 * chain and the pin's per-part check never saw a scope-less `td`. The
 * scanner now composes the cartesian product parentParts x headParts. All
 * six shapes below were reproduced RED first-hand on tip 6ea3ec29 — each
 * returned [] (probe transcript: deliverables/fix3/fix3-red-probe.txt).
 */
describe('L1-PIN-HARDEN-1 FIX RUN 3 — nested head-list composes under the full parent chain (advc3 blocker)', () => {
  const headLists: Array<[string, string]> = [
    ['H1 head list .wrap, td', '.view-spec__table { .wrap, td { overflow-wrap: anywhere; } }'],
    ['H2 head list .wrap, th', '.view-spec__table { .wrap, th { overflow-wrap: anywhere; } }'],
    ['H3 head list .a, .b, td', '.view-spec__table { .a, .b, td { overflow-wrap: anywhere; } }'],
    ['H4 parent list x head list', '.other, .view-spec__table { .wrap, td { overflow-wrap: anywhere; } }'],
    ['H5 triple-nested head list', '.view-spec__table { .wrap { .x, td { overflow-wrap: anywhere; } } }'],
    ['H6 ambiguous-& head list', '.view-spec__table { :is(&) .x, td { overflow-wrap: anywhere; } }'],
  ]

  it('every nested head-list shape is flagged as exactly the anywhere violation', () => {
    expect(sourceViolations(CONFORMING_FLOOR)).toEqual([])
    for (const [label, shape] of headLists) {
      expect({ label, violations: sourceViolations(CONFORMING_FLOOR + shape) }).toEqual({
        label,
        violations: [ANYWHERE_VIOLATION],
      })
    }
  })

  it('the first-head-part-cell control keeps flagging (pre-fix behaviour, pinned against regression)', () => {
    // `td` is the FIRST head part, so even the buggy whole-head prefix
    // composition emitted a scoped `.view-spec__table td` part — this shape
    // flagged before fix3 and must keep flagging after it.
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table { td, .wrap { overflow-wrap: anywhere; } }'),
    ).toEqual([ANYWHERE_VIOLATION])
  })

  it('a non-cell nested head list does NOT start flagging (composition invents no false positives)', () => {
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table { .wrap, .other { color: red; } }'),
    ).toEqual([])
  })

  it('the .view-spec__cell-item carve-out is not an excuse for a composed head-list part (token-boundary check intact)', () => {
    // The composed part `.view-spec__table td .view-spec__cell-item` is the
    // exempt descendant-carrier shape: the cell token AND the true-boundary
    // carve-out token sit in the same part, so the pin excuses it (no
    // violation) — exactly as the flat form is excused today.
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table { .view-spec__cell-item, td .view-spec__cell-item { overflow-wrap: anywhere; } }'),
    ).toEqual([])
    // The glued variant is NOT excused in either head-list part: the
    // token-boundary carve-out rejects `td.view-spec__cell-item` (word char
    // before the token's `.`), so the composed part still violates —
    // over-flagging, the fail-closed side of the boundary.
    expect(
      sourceViolations(CONFORMING_FLOOR + '.view-spec__table { td.view-spec__cell-item, td { overflow-wrap: anywhere; } }'),
    ).toEqual([ANYWHERE_VIOLATION])
  })
})
