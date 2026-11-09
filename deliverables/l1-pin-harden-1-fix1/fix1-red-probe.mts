// L1-PIN-HARDEN-1 FIX RUN 1 — RED probe: run the reviewer's three evasion
// shapes (cases 13/14/17) through the PRE-FIX (committed, HEAD before this
// run) scanner + pin. Expectation: all three -> [] (the pin still accepts
// them). Self-contained: extracts the pre-fix scanner + test file from
// git history, so it re-runs verbatim from any checkout of this branch:
//
//   node --input-type=module \
//     deliverables/l1-pin-harden-1-fix1/fix1-red-probe.mts <worktree-root> <pre-fix-commit>
//
// (esbuild is resolved from <worktree>/app/node_modules via createRequire.)
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { resolve, dirname } from 'node:path'
import { tmpdir } from 'node:os'

const wt = resolve(process.cwd(), process.argv[2] ?? '..')
const oldCommit = process.argv[3] ?? 'e2d18589' // pre-fix tip (report commit)
const appRequire = createRequire(resolve(wt, 'app/index.js'))
const { transformSync } = appRequire('esbuild')

const oldScanner = execFileSync('git', ['-C', wt, 'show', `${oldCommit}:app/src/analysis/cssRuleScan.ts`], { encoding: 'utf8' })
const oldTest = execFileSync('git', ['-C', wt, 'show', `${oldCommit}:app/src/analysis/ViewRenderer.cellrender.test.tsx`], { encoding: 'utf8' })

const dir = mkdtempSync(resolve(tmpdir(), 'fix1-red-probe-'))
const oldScannerPath = resolve(dir, 'old-cssRuleScan.ts')
writeFileSync(oldScannerPath, oldScanner)

const m = oldTest.match(/function sourceViolations[\s\S]*?\n}\n/)
if (!m) throw new Error('sourceViolations body not found verbatim in pre-fix test file')
const stripped = transformSync(m[0], { loader: 'ts' }).code // annotations off, logic verbatim
const fn = new Function(
  'parseCssRules', 'splitSelectorParts', 'isTableCellSelectorPart',
  'ANYWHERE_VIOLATION', 'FLOOR_VIOLATION', 'css',
  stripped + '\nreturn sourceViolations(css);',
)
const mod: any = await import(oldScannerPath) // node 26: native TS type-stripping
const sourceViolations = (css: string) =>
  fn(mod.parseCssRules, mod.splitSelectorParts, mod.isTableCellSelectorPart,
     'a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere',
     'no .view-spec__table th/td rule declares overflow-wrap: break-word', css)

const FLOOR = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
`
const NEST_ATRULE = FLOOR + `.analyses { @media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } } }\n`
const AMPERSAND_TAIL = FLOOR + `.view-spec__table { & td { overflow-wrap: anywhere; } }\n`
const CASE17 = FLOOR + `@media (max-width: 900px) { .view-spec__table \\74 d { overflow-wrap: anywhere; } }\n`
console.log('CASE17 raw css tail:', CASE17.trim().split('\n').pop())

console.log('node', process.version)
console.log('pre-fix scanner+pin from', oldCommit)
const r13 = sourceViolations(NEST_ATRULE)
const r14 = sourceViolations(AMPERSAND_TAIL)
const r17 = sourceViolations(CASE17)
console.log('CASE13 nested-at-rule-in-style-rule ->', JSON.stringify(r13), r13.length === 0 ? 'RED (evasion accepted)' : 'flagged')
console.log('CASE14 &-tail-nesting             ->', JSON.stringify(r14), r14.length === 0 ? 'RED (evasion accepted)' : 'flagged')
console.log('CASE17 css-escape td (review §3)  ->', JSON.stringify(r17), r17.length === 0 ? 'RED (evasion accepted)' : 'flagged')
console.log('RULES13', JSON.stringify(mod.parseCssRules(NEST_ATRULE)))
console.log('RULES14', JSON.stringify(mod.parseCssRules(AMPERSAND_TAIL)))
console.log('RULES17', JSON.stringify(mod.parseCssRules(CASE17)))
