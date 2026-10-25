# ADVERSARIAL REVIEW — MIXFRAC-1 (LANE 2), cycle 3, fix-run 2 delta, tag l2t0310

Item: MIXFRAC-1 — composition-fraction convention as DATA + sum bar with three candidate readings.
Worktree: /mnt/vast/home/brad/git/wt/MIXFRAC-1-lane2-l2t0310  (branch cl/lane2-mixfrac1-l2t0310)
Delta reviewed: the SINGLE fix commit 6aec9eb5 on parent f813d4d8 (fix run 2). Everything up to f813d4d8
was ACCEPTED in cycle 2 (report review-MIXFRAC1-cycle2-l2t2110.md; D1/D2/D4 closed there, N1/N2/N3 raised).
All git via `-c core.fileMode=false`. No candidate file edited/created; no stack restarted; read-only /tmp
probes (probe3/probe4) created and deleted. `git -c core.fileMode=false status --short` → empty (0 non-mode lines).

Reviewer model: deepseek/deepseek-v4.1-flash (decorrelated from the coder's 3-bit-quantized model).

---

## 1. Delta inventory (every file in the diff read)

`git -c core.fileMode=false diff --name-status f813d4d8..6aec9eb5` → 14 files:
- M server/src/compiler/scientistIntent/compositionFractions.ts   (+35/-6)  [N1 fix, N2 deletion, O3 comment]
- M server/src/compiler/scientistIntent/compositionFractions.test.ts (+220) [N1 RED-first full-pipeline legs, N3]
- A .hermes/evidence/MIXFRAC1-l2t0310/fix2-l2t2110-*.txt (12 raws) — all 12 read.

NO file outside the item's scope. In particular the channel-wiring files are ABSENT from the file list
(see §O1 HONOR below). No schema YAML touched (so the §6-bait-2 stack-restart trap does not apply this delta).

## 2. Mandate adjudication

### N1 (MAJOR, correctness) — FIXED, causally proven
Path: server/src/compiler/scientistIntent/compositionFractions.ts:686-708 (`settleCompositionFromReading`,
the `else` branch of the share loop).

- Read the settle code in full (:650-718). The `if` arm (:675-685) is the DECLARED-nested / attach-to-preceding
  expansion; the `else` arm (:686-708) is now the fresh emit: `material: entry.label, role: entry.role` +
  conditional-spread `concentration`/`count`/`counterDensity` + `fraction` — the declared `composition` key
  is NOT copied. The old `...entry.source` spread (the leak) is gone.
- BOTH non-nested strategies strip it. `applyStrategy` (:376-435): only `attach-to-preceding` sets
  `nestedChild` (:419). `keep-declared` (:382-384) and `rebase-to-total` (:385-395) return shares with
  `nestedChild === undefined`, so `shares.some(s => s.nestedChild !== undefined)` is false → both land in the
  `else` arm. The strategies in play for the two readings are `whole-mixture-supplement → rebase-to-total`
  and `explicit-on-top → keep-declared` (per the convention YAML `readingArithmetic`).
- Preceding-noun golden path UNCHANGED (regression guard): attach-to-preceding WITH declared children goes
  through the `if` arm and is untouched; the golden suite is green on my own run (§3).

Independent read-only probes (mine, not the coder's):
```
$ npx tsx /tmp/mixfrac_probe3.mts     # loadFractionConvention + evaluateCompositionFractions + settleCompositionFromReading, REAL modules
reading ids: preceding-noun-recipe, whole-mixture-supplement, explicit-on-top
--- preceding-noun-recipe
  settled   : Trypsin-EDTA=50% | DMEM=45% | FBS=5%
  expected  : Trypsin-EDTA=50%,DMEM=45%,FBS=5%
  nestedKeyOnSettled: 0  duplicateLine: false
--- whole-mixture-supplement
  settled   : Trypsin-EDTA=45% | DMEM=45% | FBS=10%
  expected  : Trypsin-EDTA=45%,DMEM=45%,FBS=10%
  nestedKeyOnSettled: 0  duplicateLine: false
--- explicit-on-top
  settled   : Trypsin-EDTA=50% | DMEM=50% | FBS=10%
  expected  : Trypsin-EDTA=50%,DMEM=50%,FBS=10%
  nestedKeyOnSettled: 0  duplicateLine: false
```
Causal control (read-only replication of the expander arm at
simpleVerbs.ts:432-467 over a settled line WITH vs WITHOUT the nested key):
```
$ npx tsx /tmp/mixfrac_probe4.mts
NEW (fix2, key stripped):   Trypsin-EDTA=45%  DMEM=45%  FBS=10%
OLD (key retained, pre-fix):Trypsin-EDTA=45%  DMEM=40.5% FBS=4.5% FBS=10%   <-- the cycle-2 §3.5 probe numbers exactly
```
This reproduces the cycle-2 defect numbers from first principles: retaining the settled nested key makes
`compositionSnapshotFromParams` re-flatten (`parent×child/total`) and emit a duplicate line; stripping it
yields the reading's own arithmetic. N1 is genuinely closed at BOTH the settle layer and the compiled snapshot.

### N2 (minor) — FIXED
`settledComposition?: unknown[]` deleted from `FractionCheckOutcome` (compositionFractions.ts:555-558 now
carries only `clarification?` / `resolvedFractions?`; doc comment :548-554 rewritten to the truth).
```
$ git -c core.fileMode=false grep -n settledComposition -- server/src
EXIT=1  (zero matches)
```

### N3 (minor, coverage) — CLOSED
One full-pipeline leg per reading, each asserting snapshot == that reading's own `finalFractions`:
- compositionFractions.test.ts:699-720 whole-mixture-supplement (45/45/10) — no dup line, cells as count.
- :721-737 explicit-on-top (50/50/10) — no dup line.
- :738-751 preceding-noun-recipe (50/45/5) — regression guard.
Legs drive the REAL handler route (`createIntentCompileFromPromptHandlers(...).compileFromPrompt`, only the
model client + store stubbed) and take the expected numbers from `clarificationsFor(doc)` — the bar's own
computed readings, not a hardcoded expectation (no tautology).
Unit-leg no-nested-key loop now runs on both non-nested legs: :411 and :442, plus the new unit leg at
:752-766 (assertion at :765). My run: compositionFractions.test.ts 24/24 pass.

### O1 HONOR CHECK — PASS
Fix-run 2 touches NO handler file. `git -c core.fileMode=false diff --name-only f813d4d8..6aec9eb5` contains
only the two compositionFractions files + 12 evidence raws. The same query filtered for
`Handlers.ts|compileScientistIntent.ts|NormalizeOptions` returns 0. The answer channel stays exactly as
cycle-1 shipped it.

### NO RE-BLESS — PASS (verified myself, not from the report)
On-disk sha256 == MANIFEST pins for all 4 fixtures + 4 records (all 8 hash-identical):
```
509da519...84f103a fixtures/mixfrac-canonical-flat.yaml         == MANIFEST:73
fe449f2f...e463916d fixtures/mixfrac-canonical-ambiguous.yaml   == MANIFEST:72
c7dae608...58882e5c fixtures/mixfrac-final-volume.yaml          == MANIFEST:74
c8f279c4...4f1c7d912 fixtures/mixfrac-on-top.yaml               == MANIFEST:75
a2d1ef36...52d4831d __records__/mixfrac-canonical-flat.golden.json        == MANIFEST:146
598a4e23...c5c8e1c1 __records__/mixfrac-canonical-ambiguous.golden.json   == MANIFEST record
370e3f57...e53fa9a  __records__/mixfrac-final-volume.golden.json          == MANIFEST record
30b8ae98...d892ae   __records__/mixfrac-on-top.golden.json                == MANIFEST record
```
No MANIFEST.yaml is in the delta at all. The committed raw
fix2-l2t2110-manifest-hashes-unchanged.txt lists the identical hashes.

### bait-4 (hardcode boundary) — PASS
```
$ git -c core.fileMode=false diff f813d4d8..6aec9eb5 -- .../compositionFractions.ts | grep '^+' | grep -inE "dmem|fbs|trypsin|hepg|serum|'50'|\"50\"|\b45\b|\b10\b|\b100\b|on top|bring to|final|of the mixture"
bait4-EXIT=1  (zero matches)
```
No fraction literal, reagent noun, connector phrase, or "of the mixture" site added to production TS. The
convention stays DATA. (Reagent nouns in compositionFractions.test.ts are test fixtures — permitted, outside
the production hard boundary.)

## 3. My own suite runs (exact output)

```
$ cd server && npx vitest run src/compiler/scientistIntent/compositionFractions.test.ts
 ✓ src/compiler/scientistIntent/compositionFractions.test.ts  (24 tests) 358ms
 Test Files  1 passed (1)   Tests  24 passed (24)

$ cd server && npx vitest run src/compiler/resolution/compositionArgResolution.test.ts
 ✓ src/compiler/resolution/compositionArgResolution.test.ts  (15 tests) 1036ms
 Test Files  1 passed (1)   Tests  15 passed (15)

$ cd server && npx vitest run src/compiler/scientistIntent/goldens/goldenIntentToGraph.test.ts   # own line, per O4 quirk
 ✓ src/compiler/scientistIntent/goldens/goldenIntentToGraph.test.ts  (5 tests) 258ms
 Test Files  1 passed (1)   Tests  5 passed (5)

$ cd <wt> && npm run typecheck -w server
> tsc --noEmit
TYPECHECK_EXIT=0
```
Full suite NOT run (as instructed).

## 4. Observations (checked; not defects)

- OBS-1 (doc nit, not a code defect): fix2 report §N1 line 47 states RED raw 2 as "3 failed | 20 passed (24)",
  but the committed raw fix2-l2t2110-red2-n1-tests-red-defect-numbers.txt records "3 failed | 21 passed (24)".
  Off-by-one in the prose only; the raw is the authoritative artifact and shows the correct defect numbers
  (DMEM 40.5 expected 45; DMEM 45 expected 50; stale nested key).
- OBS-2 (evidence nit): fix2-l2t2110-typecheck.txt captures only the `tsc --noEmit` header line, no
  `TYPECHECK_EXIT` line. My own run gives EXIT 0, so the finding is unaffected — but the raw is a weak
  artifact on its own.
- OBS-3: red1 raw mixes 3 harness artifacts (`status` undefined vs fastify-default 200) with the 1 real
  defect result (unit-leg nested key). The coder disclosed this discrepancy explicitly (report §N1, AS-H-1)
  and re-captured; I confirmed red2 is the honest defect-carrying capture.
- OBS-4 (carried over from cycle 2, unchanged by this delta): the D4 ratified-limitation text still lives in
  a code comment + MANIFEST note, not the canonical spec file; and the O3 answer-key contract comment is a
  new code comment, not spec text. Neither is a code defect.

## 5. Verdict

Fix-run 2 (6aec9eb5) does exactly what it claims and nothing more. N1 is fixed at the settle layer and at the
compiled snapshot, causally proven by my own probes reproducing the cycle-2 defect numbers under the retained
key and the correct 45/45/10 under the stripped key; both non-nested strategies strip the declared nested key;
the preceding-noun golden path is asserted unchanged and green. N2 is gone (grep zero). N3 coverage exists per
reading with real full-pipeline snapshot-equality assertions. O1 honored (handler files byte-unchanged). No
re-bless (all 8 hashes verified identical). bait-4 clean. My targeted suites are green (24 / 15 / 5) and
typecheck is EXIT 0. No spec violation found; only documentation nits (OBS-1/OBS-2), no style defect that blocks.

VERDICT: accept
