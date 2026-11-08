# L2-PROMPT2-COMPOSITION-BIND-1 unit 14 — D4-1 + D4-2 compiler emission seam

Worktree: /home/brad/cl-wt/L2-COMPBIND-u14d4conc-lane2 (branch cl/lane2-compbind-u14d4conc)
Base: ea2aabd96a8d45f4323c8cea23df03dcd732eb73

## Change
- server/src/compiler/pipeline/passes/ChatbotCompilePasses.ts — inside `buildMaterialEmission`
  only. The composition arm now passes each declared entry's own `concentration`,
  `participation` and `source` through (key omitted when absent; no transformation, raw
  formulation.composition values). D4-2: when the composition arm is taken the bound ref is
  typed `'material-spec'` (the lookup is keyed by material-spec recordId), matching the sibling
  expander at materialRefLabels.ts:695; the legacy single-entry fallback keeps `'material'`
  because record kind is not knowable at that call site (no ref-typing refactor).
- server/src/ai/runChatbotCompileCompositionPrefetch.test.ts — one new test (RED first) with a
  material-spec store fixture declaring solute 1 mM ({value:1, unit:'mM', basis:'molar'}) plus a
  concentration-free solvent entry; asserts concentration is carried and absent optional keys
  stay absent, and that the snapshot-arm `material_ref.type` is 'material-spec'.

No app/**, schema/**, config/**, records/**, runChatbotCompile.ts, shorthandChat.ts or
eventGraph.ts changes. Frontend already reads entry.concentration; no frontend change needed.

## RED (before fix)
$ cd server && node_modules/.bin/vitest run src/ai/runChatbotCompileCompositionPrefetch.test.ts
  ❯ src/ai/runChatbotCompileCompositionPrefetch.test.ts  (11 tests | 1 failed)
  FAIL ... > u14 D4-1/D4-2: composition_snapshot entries carry declared concentration and material-spec ref type
  AssertionError: expected undefined to deeply equal { value: 1, unit: 'mM', basis: 'molar' }
  Test Files  1 failed (1); Tests  1 failed | 10 passed (11); exit=1
Full log: /home/brad/.hermes/cl/lanes/2/receipts/u14d4conc/RED.log

## GREEN (after fix)
$ cd server && node_modules/.bin/vitest run src/ai/runChatbotCompileCompositionPrefetch.test.ts
  ✓ src/ai/runChatbotCompileCompositionPrefetch.test.ts  (11 tests) 42ms
  Test Files  1 passed (1); Tests  11 passed (11); exit=0
Full log: /home/brad/.hermes/cl/lanes/2/receipts/u14d4conc/GREEN.log

## TSC
$ cd server && node_modules/.bin/tsc --noEmit -p tsconfig.json
exit=2, 1 diagnostic line total — pre-existing unrelated
`src/storage/S3StorageProvider.ts(87,33): error TS2307: Cannot find module '@aws-sdk/client-s3'`.
0 errors in ChatbotCompilePasses.ts (grep count 0). Log:
/home/brad/.hermes/cl/lanes/2/receipts/u14d4conc/TSC.log

## Diff stat (base..HEAD at report time)
 .../runChatbotCompileCompositionPrefetch.test.ts   | 31 ++++++++++++++++++++++
 .../pipeline/passes/ChatbotCompilePasses.ts        | 29 +++++++++++++-------
 2 files changed, 50 insertions(+), 10 deletions(-)

Commits: 28579fcf (RED test), ab51ca0d (fix).

L2-PROMPT2-COMPOSITION-BIND-1 UNIT 14 DONE ab51ca0d95a26f9fb6dbf708efdcd99f725e5dce

## Cycle 2 — advc c1 fix (stale sibling pin)
- advc c1 MAJOR: the u14 'material-spec' flip (correct per D4-2) broke a committed sibling pin.
- Change: ResolveRoles.compositionExpand.test.ts:91 pin type 'material' -> 'material-spec'
  (comment cites D4-2). Production untouched; ChatbotCompilePasses.ts:2686 remains the authority.
- RED before edit: 1 failed | 3 passed (4) — expected 'material', received 'material-spec'. Confirmed first.
- GREEN after: 4 passed (4), exit 0.
- Receipt: runChatbotCompileCompositionPrefetch + ResolveRoles.compositionExpand = 15 passed (2 files), exit 0.
- TSC: exit 2, 1 diagnostic (@aws-sdk/client-s3) — stash-verified identical at HEAD; no new errors.
- Files: 1 (test pin). Commit: 48ea3c82f6a7a1d0acb0d226949cf849b86b3a4f.
- Logs: /home/brad/.hermes/cl/lanes/2/receipts/u14b/{GREEN-pin,RECEIPT,TSC}.log

L2-PROMPT2-COMPOSITION-BIND-1 UNIT 14b DONE 48ea3c82f6a7a1d0acb0d226949cf849b86b3a4f
