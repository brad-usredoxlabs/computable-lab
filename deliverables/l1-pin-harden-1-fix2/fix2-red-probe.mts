// L1-PIN-HARDEN-1 FIX RUN 2 — RED probe (D1): run the adversarial cycle-2
// relaxed-nesting fixture set through the PRE-FIX scanner + pin EXTRACTED
// VERBATIM FROM COMMIT b2b59fdf (git show), so it re-runs identically from
// any checkout of this branch, before AND after the fix:
//
//   node deliverables/l1-pin-harden-1-fix2/fix2-red-probe.mts .. [commit]
//
// (run from app/; esbuild resolved from app/node_modules via createRequire).
// Pre-fix expectation: EVERY case below -> [] (RED: the pin accepts each
// evasion). Post-fix expectation: EVERY case -> [ANYWHERE_VIOLATION].
// Controls (must stay flagged both pre- and post-fix) and no-false-positive
// guards (must stay [] both) are printed with their own verdicts.
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const wt = resolve(process.cwd(), process.argv[2] ?? '..')
const oldCommit = process.argv[3] ?? 'b2b59fdf' // fix-run-2 start tip; 'WORKTREE' = live files
const appRequire = createRequire(resolve(wt, 'app/index.js'))
const { transformSync } = appRequire('esbuild')

const oldScanner = oldCommit === 'WORKTREE'
  ? readFileSync(resolve(wt, 'app/src/analysis/cssRuleScan.ts'), 'utf8')
  : execFileSync('git', ['-C', wt, 'show', `${oldCommit}:app/src/analysis/cssRuleScan.ts`], { encoding: 'utf8' })
const oldTest = oldCommit === 'WORKTREE'
  ? readFileSync(resolve(wt, 'app/src/analysis/ViewRenderer.cellrender.test.tsx'), 'utf8')
  : execFileSync('git', ['-C', wt, 'show', `${oldCommit}:app/src/analysis/ViewRenderer.cellrender.test.tsx`], { encoding: 'utf8' })

const dir = mkdtempSync(resolve(tmpdir(), 'fix2-red-probe-'))
const oldScannerPath = resolve(dir, 'old-cssRuleScan.ts')
writeFileSync(oldScannerPath, oldScanner)

const m = oldTest.match(/function sourceViolations[\s\S]*?\n}\n/)
if (!m) throw new Error('sourceViolations body not found verbatim in the pin file')
const stripped = transformSync(m[0], { loader: 'ts' }).code // annotations off, logic verbatim
const fn = new Function(
  'parseCssRules', 'splitSelectorParts', 'isTableCellSelectorPart', 'decodeCssEscapes',
  'ANYWHERE_VIOLATION', 'FLOOR_VIOLATION', 'css',
  stripped + '\nreturn sourceViolations(css);',
)
const mod: any = await import(oldScannerPath + '?old=1') // node strips TS types natively
const sourceViolations = (css: string) =>
  fn(mod.parseCssRules, mod.splitSelectorParts, mod.isTableCellSelectorPart, mod.decodeCssEscapes,
     'a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere',
     'no .view-spec__table th/td rule declares overflow-wrap: break-word', css)

const FLOOR = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
`
const ANY = ['a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere']

// The D1 fixture set (advc2 §1 K/L/M/N/O/D2 + orchestrator probe shapes),
// each appended to the CONFORMING floor: every one MUST flag post-fix.
const evasions: Array<[string, string]> = [
  ['K  bare nested td', '.view-spec__table { td { overflow-wrap: anywhere; } }'],
  ['K2 bare nested th', '.view-spec__table { th { overflow-wrap: anywhere; } }'],
  ['L  @media inside style rule, bare td head', '.view-spec__table { @media (max-width: 900px) { td { overflow-wrap: anywhere; } } }'],
  ['M  bare td nested under .view-spec__table inside @media', '@media (max-width: 900px) { .view-spec__table { td { overflow-wrap: anywhere; } } }'],
  ['N  bare nested head list th, td', '.view-spec__table { th, td { overflow-wrap: anywhere; } }'],
  ['O  bare nested :hover td', '.view-spec__table { :hover td { overflow-wrap: anywhere; } }'],
  ['P  &-block then bare td sibling', '.view-spec__table { & { color: red; } td { overflow-wrap: anywhere; } }'],
  ['Q  parent selector list distribution', '.view-spec__table, .other { td { overflow-wrap: anywhere; } }'],
  ['R  :is(&) td (ambiguous & placement)', '.view-spec__table { :is(&) td { overflow-wrap: anywhere; } }'],
  ['S  :where(&) > td (ambiguous & placement)', '.view-spec__table { :where(&) > td { overflow-wrap: anywhere; } }'],
  ['D2 @supports > style > @media > bare td', '@supports (overflow-wrap: anywhere) { .view-spec__table { @media (min-width: 1px) { td { overflow-wrap: anywhere; } } } }'],
]

// Controls: &-shapes fix run 1 already closed — must keep flagging.
// NOTE: the bare-`&`-block shape resolves to the PARENT ELEMENT selector
// (`.view-spec__table` with no th/td token) — it has always returned []
// here and does so legitimately per the pin's documented cell-family scope
// (a decl on the table element is not a decl on a cell selector; the
// overflow-wrap inheritance question is recorded as an OBSERVATION, not
// this fix's mandate).
const controls: Array<[string, string, boolean]> = [
  ['&-control & td', '.view-spec__table { & td { overflow-wrap: anywhere; } }', true],
  ['&-control bare & block (table element, not a cell selector)', '.view-spec__table { & { overflow-wrap: anywhere; } }', false],
  ['&-control &.x glued', '.view-spec__table { &.x td { overflow-wrap: anywhere; } }', true],
]

// No-false-positive guards: benign shapes must stay [] in BOTH directions.
const guards: Array<[string, string]> = [
  ['benign nested font-size', '.view-spec__table { font-size: .8rem; }'],
  ['benign nested td padding', '.view-spec__table { td { padding: 2px; } }'],
  ['benign nested thead', '.view-spec__table { thead { overflow-wrap: anywhere; } }'],
  ['benign nested @media font-size', '.view-spec__table { @media (max-width: 900px) { td { font-size: .8rem; } } }'],
]

console.log('node', process.version)
console.log('scanner+pin extracted from commit', oldCommit)
const verdict = (got: string[], wantFlag: boolean) => {
  if (wantFlag) return JSON.stringify(got) === JSON.stringify(ANY) ? 'FLAG' : got.length === 0 ? 'RED (evasion accepted)' : 'MISS ' + JSON.stringify(got)
  return got.length === 0 ? 'CLEAN' : 'FALSE-POSITIVE ' + JSON.stringify(got)
}
let red = 0
for (const [label, shape] of evasions) {
  const got = sourceViolations(FLOOR + shape)
  if (got.length === 0) red += 1
  console.log(`CASE ${label.padEnd(46)} -> ${JSON.stringify(got)}  ${verdict(got, true)}`)
}
for (const [label, shape, wantFlag] of controls) {
  const got = sourceViolations(FLOOR + shape)
  console.log(`CTRL ${label.padEnd(46)} -> ${JSON.stringify(got)}  ${verdict(got, wantFlag)}`)
}
for (const [label, shape] of guards) {
  const got = sourceViolations(FLOOR + shape)
  console.log(`GUARD ${label.padEnd(45)} -> ${JSON.stringify(got)}  ${verdict(got, false)}`)
}
const shipped = readFileSync(resolve(wt, 'app/src/analysis/AnalysisPage.css'), 'utf8')
console.log('SHIPPED AnalysisPage.css ->', JSON.stringify(sourceViolations(shipped)))
console.log(`RED (evasion accepted): ${red}/${evasions.length}`)
console.log('PARSER DUMP K:', JSON.stringify(mod.parseCssRules(FLOOR + '.view-spec__table { td { overflow-wrap: anywhere; } }').map((r: any) => [r.selector, r.atContext])))
