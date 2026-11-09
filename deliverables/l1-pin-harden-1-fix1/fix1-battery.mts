// L1-PIN-HARDEN-1 FIX RUN 1 — the adversarial reviewer's §3 battery (20 cases)
// + atContext-stack probes + floor/door direction checks, run against the
// CURRENT (imported) scanner with the pin's sourceViolations extracted
// verbatim from the test file (esbuild strips TS annotations only).
// Run once pre-fix (expect 13/14/17 RED) and once post-fix (expect all GREEN).
// Run with: node fix1-battery.mts <scanner-file> <test-file>
//   post-fix: (from app/) node ../deliverables/l1-pin-harden-1-fix1/fix1-battery.mts ./src/analysis/cssRuleScan.ts src/analysis/ViewRenderer.cellrender.test.tsx
//   pre-fix : node ../deliverables/l1-pin-harden-1-fix1/fix1-battery.mts /tmp/fix1-old-cssRuleScan.ts /tmp/fix1-old-test.tsx
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { transformSync } from 'esbuild'

const scannerPath = process.argv[2] ?? './src/analysis/cssRuleScan.ts'
const testPath = process.argv[3] ?? resolve(process.cwd(), 'src/analysis/ViewRenderer.cellrender.test.tsx')
const mod: {
  parseCssRules: (s: string) => { selector: string; decls: string; atContext: string[] }[]
  splitSelectorParts: (s: string) => string[]
  isTableCellSelectorPart: (s: string) => boolean
  decodeCssEscapes?: (s: string) => string
} = await import(resolve(process.cwd(), scannerPath))
const parseCssRules = mod.parseCssRules
const splitSelectorParts = mod.splitSelectorParts
const isTableCellSelectorPart = mod.isTableCellSelectorPart
const decodeCssEscapes = mod.decodeCssEscapes ?? (() => (s: string) => s)

const ANYWHERE_VIOLATION =
  'a .view-spec__table th/td-cell selector still declares overflow-wrap: anywhere'
const FLOOR_VIOLATION =
  'no .view-spec__table th/td rule declares overflow-wrap: break-word'

const src = readFileSync(resolve(process.cwd(), testPath), 'utf8')
const m = src.match(/function sourceViolations[\s\S]*?\n}\n/)
if (!m) throw new Error('sourceViolations body not found verbatim')
const stripped = transformSync(m[0], { loader: 'ts' }).code
const fn = new Function(
  'parseCssRules', 'splitSelectorParts', 'isTableCellSelectorPart', 'decodeCssEscapes',
  'ANYWHERE_VIOLATION', 'FLOOR_VIOLATION', 'css',
  stripped + '\nreturn sourceViolations(css);',
)
const sourceViolations = (css: string): string[] =>
  fn(parseCssRules, splitSelectorParts, isTableCellSelectorPart, decodeCssEscapes, ANYWHERE_VIOLATION, FLOOR_VIOLATION, css)

const FLOOR = `
.analysis-right { overflow: auto; }
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
`
const ANY = [ANYWHERE_VIOLATION]
const FLOORV = [FLOOR_VIOLATION]

const battery: [number, string, string, string[]][] = [
  [1, 'multi-line @media',
    FLOOR + `@media (max-width: 900px) {\n  .view-spec__table td {\n    overflow-wrap: anywhere;\n  }\n}\n`, ANY],
  [2, 'one-line @media',
    FLOOR + `@media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } }\n`, ANY],
  [3, '@supports',
    FLOOR + `@supports (overflow-wrap: anywhere) { .view-spec__table td { overflow-wrap: anywhere; } }\n`, ANY],
  [4, '@layer',
    FLOOR + `@layer responsive { .view-spec__table td { overflow-wrap: anywhere; } }\n`, ANY],
  [5, '@container',
    FLOOR + `@container (min-width: 40rem) { .view-spec__table td { overflow-wrap: anywhere; } }\n`, ANY],
  [6, 'two-deep @media > @supports',
    FLOOR + `@media (max-width: 900px) { @supports (overflow-wrap: anywhere) { .view-spec__table td { overflow-wrap: anywhere; } } }\n`, ANY],
  [7, ':is(th, td) inside @supports',
    FLOOR + `@supports (overflow-wrap: anywhere) { .view-spec__table :is(th, td) { overflow-wrap: anywhere; } }\n`, ANY],
  [8, 'selector split across lines',
    FLOOR + `@media (max-width: 900px) {\n  .view-spec__table\n    td { overflow-wrap: anywhere; }\n}\n`, ANY],
  [9, '@media no space after name',
    FLOOR + `@media(max-width:900px) { .view-spec__table td { overflow-wrap: anywhere; } }\n`, ANY],
  [10, '@media screen and (...)',
    FLOOR + `@media screen and (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } }\n`, ANY],
  [11, 'rule brace and at-rule brace on same line',
    FLOOR + `.analysis-right { overflow: auto; } @media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } }\n`, ANY],
  [12, 'commented-out rule (benign)',
    FLOOR + `/* .view-spec__table td { overflow-wrap: anywhere; } */\n`, []],
  [13, 'NESTED: at-rule inside style rule (review case 13)',
    FLOOR + `.analyses { @media (max-width: 900px) { .view-spec__table td { overflow-wrap: anywhere; } } }\n`, ANY],
  [14, 'NESTED: & td inside .view-spec__table (review case 14)',
    FLOOR + `.view-spec__table { & td { overflow-wrap: anywhere; } }\n`, ANY],
  [15, 'comment between prelude and brace',
    FLOOR + `@media (max-width: 900px) /* c */ { .view-spec__table td { overflow-wrap: anywhere; } }\n`, ANY],
  [16, 'UPPERCASE decl',
    FLOOR + `@media (max-width: 900px) { .view-spec__table td { OVERFLOW-WRAP: ANYWHERE; } }\n`, ANY],
  [17, 'CSS escape-encoded td: \\74 d (review case 17)',
    FLOOR + `@media (max-width: 900px) { .view-spec__table \\74 d { overflow-wrap: anywhere; } }\n`, ANY],
  [18, 'benign: floor only, no at-rules',
    FLOOR, []],
  [19, 'benign @media block over conforming floor (fixture e shape)',
    FLOOR + `@media (max-width: 900px) {\n  .view-spec__cell-item { min-width: 8ch; }\n  .view-spec__table { font-size: .8rem; }\n}\n`, []],
  [20, '3 declarations including anywhere',
    FLOOR + `@media (max-width: 900px) { .view-spec__table td { color: red; margin: 0; overflow-wrap: anywhere; } }\n`, ANY],
]

// FIX RUN 2 (advc2 defect 2): print the RESOLVED path of the module
// actually imported (argv[2]), not a hardcoded sibling path — the old
// banner named deliverables/l1-pin-harden-1-fix1/cssRuleScan.ts, a file
// that is not committed and was never the module under test.
console.log('== BATTERY (review §3) against', resolve(process.cwd(), scannerPath), '==')
let pass = 0
for (const [n, label, css, expected] of battery) {
  const got = sourceViolations(css)
  const ok = JSON.stringify(got) === JSON.stringify(expected)
  if (ok) pass += 1
  console.log(`case ${String(n).padStart(2)} [${ok ? 'OK ' : 'MISS'}] ${label} -> ${JSON.stringify(got)}${ok ? '' : '  EXPECTED ' + JSON.stringify(expected)}`)
}
console.log(`battery: ${pass}/${battery.length} match expectation`)

// ---- atContext stack probes (review §3: no false attribution) ----
const stackCss = `
@media A {
  .a { color: 1; }
  @supports B { .b { color: 2; } }
  .c { color: 3; }
}
.d { color: 4; }
`
const stack = parseCssRules(stackCss)
const sA = stack.find((r) => r.selector === '.a')?.atContext
const sB = stack.find((r) => r.selector === '.b')?.atContext
const sC = stack.find((r) => r.selector === '.c')?.atContext
const sD = stack.find((r) => r.selector === '.d')?.atContext
console.log('STACK a:', JSON.stringify(sA), sA?.length === 1 && sA[0] === '@media A' ? 'OK' : 'MISS')
console.log('STACK b:', JSON.stringify(sB), JSON.stringify(sB) === JSON.stringify(['@media A', '@supports B']) ? 'OK' : 'MISS')
console.log('STACK c:', JSON.stringify(sC), sC?.length === 1 && sC[0] === '@media A' ? 'OK' : 'MISS')
console.log('STACK d:', JSON.stringify(sD), JSON.stringify(sD) === '[]' ? 'OK' : 'MISS')

const sideBySide = '@media A { .a { color: 1; } } @media C { .a2 { color: 2; } }'
const sbA = parseCssRules(sideBySide).find((r) => r.selector === '.a')?.atContext
const sbC = parseCssRules(sideBySide).find((r) => r.selector === '.a2')?.atContext
console.log('STACK side-by-side a:', JSON.stringify(sbA), JSON.stringify(sbA) === JSON.stringify(['@media A']) ? 'OK' : 'MISS')
console.log('STACK side-by-side a2:', JSON.stringify(sbC), JSON.stringify(sbC) === JSON.stringify(['@media C']) ? 'OK' : 'MISS')

// Floor rule placed INSIDE an UNTERMINATED @media: it must inherit the open
// context (so it cannot satisfy the unconditional floor) — identical to the
// pre-fix scanner's behaviour, verified side by side (transcript
// fix1-unbalanced-compare.txt).
const unbalancedV = sourceViolations(`
.analysis-right { overflow: auto; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@media (max-width: 900px) {
  .view-spec__table th, .view-spec__table td { overflow-wrap: break-word; }
`)
console.log('FAIL-CLOSED unbalanced open @media (floor rule inherits open context) ->', JSON.stringify(unbalancedV), unbalancedV.length > 0 ? 'OK (flagged)' : 'MISS (accepted)')
const unbalanced = '@media A { .x { color: 1'
console.log('rules(unbalanced @media):', JSON.stringify(parseCssRules(unbalanced).map((r: any) => r.selector)))

// ---- floor/door direction (must stay UNCONDITIONAL) ----
const floorOnlyInMedia = `
.analysis-right { overflow: auto; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@media (max-width: 900px) {
  .view-spec__table th, .view-spec__table td { overflow-wrap: break-word; }
}
`
console.log('FLOOR break-word only in @media ->', JSON.stringify(sourceViolations(floorOnlyInMedia)), JSON.stringify(sourceViolations(floorOnlyInMedia)) === JSON.stringify(FLOORV) ? 'OK' : 'MISS')

const doorOnlyInMedia = `
.view-spec__table th, .view-spec__table td { overflow-wrap: break-word; white-space: normal; }
.view-spec__cell-item { overflow-wrap: anywhere; min-width: 12ch; }
@media (max-width: 900px) { .analysis-right { overflow: auto; } }
`
const doorV = sourceViolations(doorOnlyInMedia)
console.log('DOOR door only in @media ->', JSON.stringify(doorV), doorV.some((v) => v.includes('.analysis-right')) ? 'OK (flagged)' : 'MISS (accepted)')

const benignOverFloor = FLOOR + `@media (max-width: 900px) { .view-spec__cell-item { min-width: 8ch; } .view-spec__table { font-size: .8rem; } }`
console.log('BENIGN @media over conforming floor ->', JSON.stringify(sourceViolations(benignOverFloor)), sourceViolations(benignOverFloor).length === 0 ? 'OK' : 'MISS')

const bwInMediaAndUnconditional = FLOOR + `@media (max-width: 900px) { .view-spec__table th, .view-spec__table td { overflow-wrap: break-word; } }`
console.log('BOTH unconditional+conditional break-word ->', JSON.stringify(sourceViolations(bwInMediaAndUnconditional)), sourceViolations(bwInMediaAndUnconditional).length === 0 ? 'OK' : 'MISS')

// ---- shipped file ----
const shipped = readFileSync(resolve(process.cwd(), 'src/analysis/AnalysisPage.css'), 'utf8')
console.log('SHIPPED AnalysisPage.css ->', JSON.stringify(sourceViolations(shipped)), sourceViolations(shipped).length === 0 ? 'OK' : 'MISS')
