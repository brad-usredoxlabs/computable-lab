# L2-PROMPT2-COMPOSITION-BIND-1 UNIT u10 Report

## Task
Lane 2, unit u10 — D2 producer leg: render the declared domain slot through ONE shared
formatter in both prompt emitters so a widened `string | string[]` domain prints as
`resolvable(labware|material)` instead of a raw comma-join, and update the tracked prompt
mirror to the regenerated ARGUMENTS lines.

## Base
Commit: 63cda9053aeb593820f2445bc75ee2b240cf424c (u9 tip, contenderOrder removed)

## Changed Files (3)
1. server/src/compiler/scientistIntent/vocabulary.ts
   - Added `formatArgDomain()` exported formatter next to `declaredDomains()` (line ~200)
   - Updated `contractBlock()` map template at line ~424 to use `formatArgDomain(a.domain)`
2. server/src/compiler/scientistIntent/intentCompile.ts
   - Extended import to include `formatArgDomain` from './vocabulary.js'
   - Updated `promptArgContractBlock()` map template at line ~65 to use `formatArgDomain(a.domain)`
3. schema/registry/prompt-templates/intent.compile.system.yaml
   - Updated 5 ARGUMENTS lines (seed, mix, resuspend, dilute, transfer) with pipe-separated domains

## Generated ARGUMENTS Lines — Before / After

seed:
  BEFORE: source?:resolvable(labware)
  AFTER:  source?:resolvable(labware|material)

mix:
  BEFORE: source?:resolvable(labware)
  AFTER:  source?:resolvable(labware|material)

resuspend:
  BEFORE: source?:resolvable(labware)
  AFTER:  source?:resolvable(labware|material)

dilute:
  BEFORE: source?:resolvable(labware)
  AFTER:  source?:resolvable(labware|material)

transfer:
  BEFORE: source?:resolvable(labware)
  AFTER:  source?:resolvable(labware|material)

All other lines remain byte-identical (single-value domains render unchanged).

## Verification Results

### vocabularyMirrorDrift.test.ts (post-change)
1 failed | 7 passed (8)
The (f) leg failure is at line 146 — the re-derivation loop using the old raw template
`${a.domain}` instead of `formatArgDomain(a.domain)`. This is u11's test to fix.
The byte-compare passes: the mirror now matches generated output exactly.

### Golden tests (post-change)
3 passed (3), 10 passed (10) — u9's re-bless holds.

### Typecheck
No output (clean).

### Diff stat
3 files changed, 19 insertions(+), 8 deletions(-)

## Four Remaining Red Files (u11's scope)
1. server/src/compiler/scientistIntent/vocabularyMirrorDrift.test.ts (line 146 re-derivation)
2. server/src/compiler/scientistIntent/vocabularyContractBlock.test.ts
3. server/src/compiler/scientistIntent/hedgeOptionality.test.ts
4. server/src/compiler/scientistIntent/compositionArgResolution.test.ts

These four are unit u11's to fix. They stay RED by construction in this unit.

L2-PROMPT2-COMPOSITION-BIND-1-u10 UNIT unit DONE 63cda9053aeb593820f2445bc75ee2b240cf424c
