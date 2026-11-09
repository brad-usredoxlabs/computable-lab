// L1-PIN-HARDEN-1 FIX RUN 3 — probe (B4): the six nested head-list shapes,
// both controls, and the shipped AnalysisPage.css, run through the LIVE
// scanner (imported by relative path, no transpile step) and the pin's
// sourceViolations (extracted VERBATIM from
// ViewRenderer.cellrender.test.tsx; only the two TS annotations on the
// signature are stripped, the logic is untouched — the extraction's sha256
// is printed so the transcript proves verbatimness).
//
// Run:  cd app && node --experimental-strip-types ../deliverables/probe-fix3-l1t0700.mts
//
// Expected (post-fix GREEN):
//   - the six head-list shapes        -> [ANYWHERE_VIOLATION]
//   - control `td, .wrap` (cell first)-> [ANYWHERE_VIOLATION]
//   - non-cell head-list control      -> []
//   - shipped AnalysisPage.css        -> []
// Pre-fix (RED): all six shapes -> [] (the pin accepts each evasion) and the
// emitted selectors show the head parts after the first with no parent chain.

import { createHash } from 'node:crypto'
import { createRequire } from 'node:module'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
// The worktree's app/node_modules is empty by assignment (no installs). The
// pinned trunk checkout's esbuild resolves the TS in the verbatim pin
// extract — the same mechanism the fix2 probe used (trunk's hoisted
// esbuild). The scanner itself is imported natively via --experimental-
// strip-types; only the extracted pin function needs transpiling.
const appRequire = createRequire('/mnt/vast/home/brad/git/cl-integration-1/app/index.js')
const { transformSync } = appRequire('esbuild')
import {
  decodeCssEscapes,
  isTableCellSelectorPart,
  parseCssRules,
  splitSelectorParts,
} from '../app/src/analysis/cssRuleScan.ts'

const ANYWHERE_VIOLATION =
  'a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere'
const FLOOR_VIOLATION =
  'no .view-spec__table th/td rule declares overflow-wrap: break-word'

// Minimal conforming floor — copied VERBATIM from the pin test file.
const CONFORMING_FLOOR = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
`

// --- Verbatim extraction of sourceViolations from the pin test file --------
const pinSrc = readFileSync(
  resolve(process.cwd(), 'src/analysis/ViewRenderer.cellrender.test.tsx'),
  'utf8',
)
const m = pinSrc.match(/function sourceViolations\(css: string\): string\[\] \{[\s\S]*?\n\}\n/)
if (!m) throw new Error('sourceViolations not found verbatim in ViewRenderer.cellrender.test.tsx')
// Logic untouched — only TS stripped by the esbuild transform (fix2-probe
// pattern); the sha256 is over the VERBATIM extract, so the transcript
// proves what the pin ran.
const extracted = m[0]
const js = transformSync(extracted, { loader: 'ts' }).code
const sourceViolations = new Function(
  'parseCssRules', 'splitSelectorParts', 'isTableCellSelectorPart', 'decodeCssEscapes',
  'ANYWHERE_VIOLATION', 'FLOOR_VIOLATION',
  `${js}\n; return sourceViolations`,
)(
  parseCssRules,
  splitSelectorParts,
  isTableCellSelectorPart,
  decodeCssEscapes,
  ANYWHERE_VIOLATION,
  FLOOR_VIOLATION,
)

const sha256 = (s: string) => createHash('sha256').update(s).digest('hex')
const scannerSrc = readFileSync(resolve(process.cwd(), 'src/analysis/cssRuleScan.ts'), 'utf8')

console.log('=== L1-PIN-HARDEN-1 FIX RUN 3 probe (B4) ===')
console.log(`node ${process.version}`)
console.log(`scanner  src/analysis/cssRuleScan.ts            sha256 ${sha256(scannerSrc)}`)
console.log(`pin fn   sourceViolations (verbatim extract)    sha256 ${sha256(extracted)}`)
console.log('')

const six: Array<[string, string]> = [
  ['H1 head list .wrap, td', '.view-spec__table { .wrap, td { overflow-wrap: anywhere; } }'],
  ['H2 head list .wrap, th', '.view-spec__table { .wrap, th { overflow-wrap: anywhere; } }'],
  ['H3 head list .a, .b, td', '.view-spec__table { .a, .b, td { overflow-wrap: anywhere; } }'],
  ['H4 parent list x head list', '.other, .view-spec__table { .wrap, td { overflow-wrap: anywhere; } }'],
  ['H5 triple-nested head list', '.view-spec__table { .wrap { .x, td { overflow-wrap: anywhere; } } }'],
  ['H6 ambiguous-& head list', '.view-spec__table { :is(&) .x, td { overflow-wrap: anywhere; } }'],
]

function printCase(label: string, css: string, expectFlag: boolean): void {
  const rules = parseCssRules(css)
  console.log(`--- ${label}`)
  console.log(`    css: ${css}`)
  console.log(`    emitted rules (parseCssRules):`)
  for (const r of rules) {
    const d = r.decls.length > 60 ? `${r.decls.slice(0, 60)}…` : r.decls
    console.log(`      selector=${JSON.stringify(r.selector)} atContext=${JSON.stringify(r.atContext)} decls=${JSON.stringify(d)}`)
  }
  const v = sourceViolations(css)
  console.log(`    sourceViolations: ${JSON.stringify(v)}`)
  const flagged = v.includes(ANYWHERE_VIOLATION)
  console.log(`    verdict: expect ${expectFlag ? 'FLAG' : 'CLEAN'} -> ${flagged === expectFlag ? 'OK' : 'MISMATCH (actual ' + (flagged ? 'FLAG' : 'CLEAN') + ')'}\n`)
}

console.log('== the six nested head-list shapes (all must FLAG) ==')
for (const [label, shape] of six) {
  printCase(label, CONFORMING_FLOOR + shape, true)
}

console.log('== controls ==')
printCase('C1 control: first head part is the cell token (td, .wrap) — must keep flagging',
  CONFORMING_FLOOR + '.view-spec__table { td, .wrap { overflow-wrap: anywhere; } }', true)
printCase('C2 control: non-cell head list must NOT start flagging',
  CONFORMING_FLOOR + '.view-spec__table { .wrap, .other { color: red; } }', false)

console.log('== shipped AnalysisPage.css (must be CLEAN) ==')
const shipped = readFileSync(resolve(process.cwd(), 'src/analysis/AnalysisPage.css'), 'utf8')
const shippedRules = parseCssRules(shipped)
console.log(`--- shipped CSS: ${shippedRules.length} emitted rules`)
for (const r of shippedRules) {
  const d = r.decls.length > 60 ? `${r.decls.slice(0, 60)}…` : r.decls
  console.log(`      selector=${JSON.stringify(r.selector)} atContext=${JSON.stringify(r.atContext)} decls=${JSON.stringify(d)}`)
}
const vShipped = sourceViolations(shipped)
console.log(`    sourceViolations: ${JSON.stringify(vShipped)}`)
console.log(`    verdict: expect CLEAN -> ${vShipped.length === 0 ? 'OK' : 'MISMATCH (actual ' + JSON.stringify(vShipped) + ')'}`)
