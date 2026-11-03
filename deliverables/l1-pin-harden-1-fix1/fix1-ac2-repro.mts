// L1-PIN-HARDEN-1 — spec AC2: the O1 fixture through the EXPORTED scanner,
// printing the nested rule's atContext and the pin's violation list.
// Also records the IMMEDIATELY-PRECEDING state (commit e2d18589 — the
// first-run brace-depth scanner, whose own RED record against the original
// line-anchored parser is in the report §2/§4.4 with capture
// /tmp/red-run-l1pin.txt, supplementary).
//
// Run (the literal command cited in the report; .mts is ESM by extension,
// so no --input-type flag is needed; run from <worktree>/app):
//   node ../deliverables/l1-pin-harden-1-fix1/fix1-ac2-repro.mts
// (esbuild resolves from ./node_modules via createRequire; git via -C.)
import { createRequire } from 'node:module'
import { execFileSync } from 'node:child_process'
import { readFileSync, writeFileSync, mkdtempSync } from 'node:fs'
import { tmpdir } from 'node:os'

const require = createRequire(process.cwd() + '/')
const { transformSync } = require('esbuild')
const { dirname } = require('node:path')
const prevCommit = process.argv[2] ?? 'e2d18589'
// Worktree root, derived from this script's own location
// (<wt>/deliverables/l1-pin-harden-1-fix1/fix1-ac2-repro.mts).
const wt = dirname(dirname(dirname(new URL(import.meta.url).pathname)))
const cwd = process.cwd() + '/'

/**
 * Extract `function sourceViolations … }` verbatim from a test file, strip
 * TS annotations (esbuild, loader ts — logic untouched), and re-bind it
 * against the given scanner module + violation-string constants. Returns
 * `(css) => string[]`.
 */
function makePin(testSource: string, mod: Record<string, unknown>, withEscapes: boolean): (css: string) => string[] {
  const m = testSource.match(/function sourceViolations[\s\S]*?\n}\n/)
  if (!m) throw new Error('sourceViolations not found verbatim')
  let body = m[0]
  if (!withEscapes) {
    body = body.replace('splitSelectorParts(decodeCssEscapes(r.selector))', 'splitSelectorParts(r.selector)')
  }
  const params = [
    'parseCssRules', 'splitSelectorParts', 'isTableCellSelectorPart',
    ...(withEscapes ? ['decodeCssEscapes'] : []),
    'ANYWHERE_VIOLATION', 'FLOOR_VIOLATION', 'css',
  ]
  const fn = new Function(
    ...params,
    transformSync(body, { loader: 'ts' }).code + '\nreturn sourceViolations(css);',
  )
  const args = [
    mod.parseCssRules, mod.splitSelectorParts, mod.isTableCellSelectorPart,
    ...(withEscapes ? [mod.decodeCssEscapes] : []),
    'a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere',
    'no .view-spec__table th/td rule declares overflow-wrap: break-word',
  ]
  return (css: string) => fn(...args, css)
}

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

console.log('node', process.version)

// --- CURRENT (this run's tip) — the AC2 reproduction ----------------------
const cur: Record<string, unknown> = await import(new URL('./src/analysis/cssRuleScan.ts', 'file://' + cwd).pathname)
const curPin = makePin(
  readFileSync(new URL('./src/analysis/ViewRenderer.cellrender.test.tsx', 'file://' + cwd).pathname, 'utf8'),
  cur, true,
)
const curRules = (cur.parseCssRules as (s: string) => { selector: string; decls: string; atContext: string[] }[])(O1_MULTI)
const nested = curRules.find((r) => r.selector === '.view-spec__table td')
console.log('CURRENT  nested rule:', JSON.stringify(nested))
console.log('CURRENT  violations: ', JSON.stringify(curPin(O1_MULTI)))

// --- IMMEDIATELY-PRECEDING (e2d18589): first-run scanner + its pin --------
const dir = mkdtempSync(`${tmpdir()}/fix1-ac2-`)
const oldScanner = execFileSync('git', ['-C', wt, 'show', `${prevCommit}:app/src/analysis/cssRuleScan.ts`], { encoding: 'utf8' })
const oldTest = execFileSync('git', ['-C', wt, 'show', `${prevCommit}:app/src/analysis/ViewRenderer.cellrender.test.tsx`], { encoding: 'utf8' })
const oldPath = dir + '/old-cssRuleScan.ts'
writeFileSync(oldPath, oldScanner)
const old: Record<string, unknown> = await import(oldPath)
const oldPin = makePin(oldTest, old, false)
const oldRules = (old.parseCssRules as (s: string) => { selector: string; decls: string; atContext: string[] }[])(O1_MULTI)
console.log(`PREVIOUS (${prevCommit}) rules:   `, JSON.stringify(oldRules.map((r) => ({ selector: r.selector, atContext: r.atContext }))))
console.log(`PREVIOUS (${prevCommit}) violations:`, JSON.stringify(oldPin(O1_MULTI)))
console.log('NOTE: the ORIGINAL line-anchored parser (base 1a443259) returned [] for this fixture — the first run\'s RED evidence; report §2/§4.4, supplementary capture /tmp/red-run-l1pin.txt.')
