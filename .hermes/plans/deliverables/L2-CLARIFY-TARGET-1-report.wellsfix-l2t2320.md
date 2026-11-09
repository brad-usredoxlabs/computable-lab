# L2-CLARIFY-TARGET-1 — WELLS-DOOR FIX RUN (l2t2320)

Coder: cl-coder (appliance-2). Lane 2 only. Worktree
`/mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810`, branch
`cl/lane2-target1-1-l2t1810`. Pre-fix tip (for base parity): `c7b196ba`
(e2eStubHonesty doc re-pin) / full branch tip `985dbf28`.

Ruling under implementation:
`/mnt/vast/home/brad/git/wt/L2-CLARIFY-TARGET-1-lane2-l2t1810/.hermes/plans/decisions/TARGET1-WELLS-DOOR-l2t2310-ruling.md`
(commit `974e2f94` on trunk `cl/integration-2`) — READ IN FULL after STEP 0 merge;
it SUPERSEDES the previous run's convert-pins decision.

## l2t2320 open (00:xx)

- Worktree dirty with the dead run's app-side WIP (3 modified + 3 untracked; the
  3 untracked — `app/src/agent/ClarifyAssumedChip.tsx` (Change 2),
  `app/src/agent/ClarifyWellTargetSlot.tsx` (Change 4),
  `app/src/agent/proposalRowFacts.ts` (Change 5) — are TARGET-1 WIP from the same
  dead run; the addendum named three paths but the tree holds five; all five are
  the dead run's app side and are committed together as WIP, not deleted).
- Pre-fix tip confirmed: `985dbf28b579157fce8c04b545c6ce42beffc378`; trunk tip at
  read time `428a47ed`; merge-base with `cl/integration-2` is `0579e8a1`.
- Plan per ruling: (0) commit WIP -> (0b) merge `cl/integration-2` -> (1) read
  ruling in full -> (2) revert the four shipped-test edits (two reachability pins
  back to string form; e2eStubHonesty doc-echo re-pin to real array-of-events
  output; realizationGolden T1/T2 fixture edit out) -> (3) two-file shape gate:
  `resolutionEngine.ts` doc-door scalar arm + `normalizeScientistIntent.ts`
  mappings loop -> (4) lowerer leg: make `realizeScientistIntent.ts` emit
  declared volumeUl + targetWells if honestly doable, else GOLDEN-BLOCKED ->
  (5) pattern-verb measurement (unrealizedPatternWellLabels) -> (6) app side
  (Change 2 chip, finish per addendum C) -> (7) verification (a)/(b)/(c).
- Commit per step. No dev servers touched; no browser gate (orchestrator owns).

## l2t2320 STEP — trunk merge + ruling read (59726953)

- `git -c core.fileMode=false merge --no-ff cl/integration-2` -> merge commit
  `59726953`; trunk brought only `.hermes/plans/**` docs (8 files, +983) — no
  source drift. Branch tip now `59726953`.
- Ruling read IN FULL (88 lines): `/.hermes/plans/decisions/TARGET1-WELLS-DOOR-l2t2310-ruling.md`
  (commit `974e2f94`). Supersedes the previous run's convert-pins decision.
  Key measured facts adopted (not re-derived): bare (i) REJECTED (silent drop +
  breaks 3 SPINE-7 legs, 19 vs 16 fails); SHAPE-GATED (i) GREEN (two
  reachability pins unedited, nounResolution unknown-address green, rolesSeam
  green, 14 = 16 - the two pins).
- Engine sites confirmed: door scalar arm `resolutionEngine.ts:516` (the
  `typeof raw !== 'string'` guard before `resolveNoun`); wells outcome arm
  `:408-409` (`unknown-address`); doc-door loop `:489-490`. Lowerer mappings
  loop `normalizeScientistIntent.ts:714-754` (`event.wellRole = found.value`
  at `:729`); (b) arm shape test `:831-832` (`expandWellTokens` +
  `WELL_ADDRESS_SHAPE_RE`); `WELL_ADDRESS_SHAPE_RE` exported at `:73`;
  `expandWellTokens` imported at `:64`. add_material expander
  `simpleVerbs.ts:550-557` reads `params.wells` and runs `expandWellTokens` on a
  string -> 96 wells.
- Import-cycle check: `resolutionEngine -> normalizeScientistIntent ->
  declaredOptionalHedgeFold -> {vocabulary, types}`; none reach back to
  resolutionEngine; helper used at call-time only. SAFE.

## l2t2320 STEP — reverts landed (ed1f1072)

Restored the four shipped-test files to pre-edit state via
`git checkout <lane-commit>^ -- <file>` (each had exactly ONE lane commit in
range `0579e8a1..985dbf28`, so `^` is the exact pre-edit state). Removed hunks
named by source commit:
- `19dd3ee3^` -> `server/src/compiler/scientistIntent/declaredArgumentReachability.test.ts`
  (CHARACTERIZATION :166 + GHOST :376 back to STRING `targetWells: A1:H12`,
  original assertions).
- `c7b196ba^` -> `server/src/ai/shorthandChat.e2eStubHonesty.test.ts` (GHOST_DOC
  :49 / CANONICAL_DOC :59 back to STRING) AND `app/e2e/deck-ghost-shorthand.spec.ts`
  (stub doc-echo :138 / :177 back to STRING).
- `dde063d2^` -> `server/src/compiler/scientistIntent/realizationGolden.test.ts`
  (T1 outcome back to `complete` :263 + `eventCount>0` :319; the flip-new-truth
  re-bless removed).
- Verified post-revert: reachability pins STRING (`A1:H12` at :166/:376, the
  `[A1]` array forms at :128/:184 etc. are PRE-EXISTING pre-flip legs, not the
  two pins), e2eStubHonesty docs STRING, golden T1 `complete`+`>0`.
- These MUST now pass via the ENGINE change (shape gate), not the test.

## l2t2320 STEP — two-file shape gate landed (engine change, no test edits)

Files (ruling's own two-file shape — nothing more):
- `server/src/compiler/resolution/resolutionEngine.ts` — doc-door SCALAR arm
  (resolveScientistIntentNouns, the `typeof raw !== 'string'` guard region):
  added `if (contract.kind === 'wells' && isWellAddressLiteral(raw.trim())) continue;`
  so a kind:'wells' scalar that IS an address literal is skipped (not spine-
  routed). Symbolic labels + bogus addresses still ride the door and bar.
- `server/src/compiler/scientistIntent/normalizeScientistIntent.ts`:
  (a) new exported predicate `isWellAddressLiteral(value)` — the ONE
  address-literal test: expandWellTokens (the ONE parser) + WELL_ADDRESS_
      SHAPE_RE (the parity-pinned regex), identical to the (b) arm's inline test.
  (b) mappings loop: an address-literal scalar on a declared kind:wells 'wells'
      family arg is carried as the LITERAL event value (event.wells = scalar),
      so the expander's ONE parser expands "A1:H12" -> 96 wells. Symbolic labels
      keep the wellRole/clarity behaviour (untouched).
  (c) (b) arm refactored to call isWellAddressLiteral (verbatim behaviour, DRY).
- Zero field names, zero verb names, zero new policy literals. Import edge
  resolutionEngine -> normalizeScientistIntent verified acyclic.

### Per-leg measurement (CODER-CAPTURED, vitest 1.6.1, worktree harness)

- typecheck (exactOptionalPropertyTypes ON): `tsc --noEmit` -> 0 errors (exit 0).
- declaredArgumentReachability: 41/41 GREEN (the two UNEDITED string pins
  CHARACTERIZATION:166 + GHOST:376 pass via the engine change, not the test).
- nounResolution (bogus_role -> unknown-address): 16/16 GREEN.
- rolesSeam: 20/20 GREEN. goldenRolesSeam: 7/7 GREEN (SPINE-7 legs preserved).
- realizationGolden: T1/T2 FAIL (needs-clarification vs complete; eventCount 0
  vs >0) — the LOWERER gap (separate named leg, 4 below). NOT caused by the door.
- dir sweep `src/compiler/resolution src/compiler/scientistIntent`: 49 files,
  547 passed / 2 failed (549). The 2 fails == the 2 golden legs only.
- e2eStubHonesty (server/src/ai): 7/7 GREEN — the reverted STRING doc-echo
  (GHOST_DOC/CANONICAL_DOC targetWells: A1:H12) is now the honest real output
  (stub===real; the shape gate makes the string form carry, so the doc is
  unchanged and the events are the array-of-events).
- pattern fixtures (ruling item 3 — measure, don't assume):
  ProtocolIntent 5/5 + ProtocolIntentPatternExpanders 8/8 GREEN (13/13).
  The pattern-verb `unrealizedPatternWellLabels` still bars scalar well-labels
  unconditionally (it is a separate bar from the door). Shipped pattern
  fixtures are green UNAMENDED, so the shape gate needs NO parity there —
  the pattern path's scalar wells are symbolic (the pattern expander reads
  them as literal addresses only via the array form), and no shipped pattern
  fixture carries an address-literal SCALAR that the shape gate would
  mis-handle. (See lowerer/next step for the one nuance.)

## l2t2320 STEP — golden (lowerer) leg MEASURED -> BLOCKED (ruling §4c, addendum E)

The realizationGolden T1/T2 bar is `missing-required-argument` x2 (volumeUl +
targetWells), NOT unknown-address — confirmed by dumping W27_CLARIFICATIONS:
  {label:'volumeUl', reason:'missing-required-argument', action:add_material}
  {label:'targetWells', reason:'missing-required-argument', action:add_material}
=> the lowerer (`realizeScientistIntent.ts`) emits `add_material` with NO
volumeUl and NO targetWells. No door change touches that (proven orthogonal
below).

I MEASURED (not assumed) whether the lowerer can emit these HONESTLY. The
ruling says "fixture/policy feed the values" — but the shipped data does NOT:
- The `add-lysis` step (familyFixture, the one lowering to add_material)
  carries `materialNeeds:[{need:'lysis_solution'}]` and NO constraints (no
  volume bound). The ONLY volume constraint is on the `transfer` step
  (200 uL).
- The realization fixture's only wells-unit datum is
  `sample_count:{value:96, unit:'wells', dimension:'count'}` — a COUNT, not a
  target ADDRESS.
- The bound scale profile `robot-assist-plus-96` (ExecutionScaleProfileRecord)
  carries `reagentSource.defaultSourceWells` (SOURCE side) and
  `pipetting.maxVolumeUl` (a capability CAP) — neither is the add_material
  target-wells address or a per-event add volume.
- `assumedValues` DATA (config/drafting/shorthand-drafting.yaml) declares
  add_material.volumeUl=100 uL (value+source+question) BUT
  add_material.targetWells = QUESTION ONLY, NO VALUE ("Which wells? Name a
  range (A2:B3) or pick wells on the deck.").
- The realization lowerer does NOT read assumedValues (it is a chatbot/
  shorthand surface, not a realization-surface source). Its only numeric-
  emission path is `parameterBindings` (volume->volumeUl), which fires only
  from a STEP CONSTRAINT — the add-lysis step has none.

VERDICT: making the lowerer "emit" volumeUl + targetWells would require
INVENTING a target-wells address (and a per-event add volume) that exist
NOWHERE in the data — the W12 / never-fabricate class this campaign forbids,
and the golden's own comment: "the required args are the scientist's to answer
(chip + slot), not the pipeline's to silently invent." Per ruling §4c and
addendum E: the golden is a SEPARATE leg; I STOP on it alone and do NOT
re-bless it (blessing a lowerer gap into the golden would hide it). The door
work STANDS AND SHIPS. The honest fix is the lowerer reading the assumedValues
DATA for volumeUl AND a declared target-wells value — but the DATA has no
target-wells value to read, so an honest fix needs a DATA/fixture decision that
is Brad's to make (add a target-wells assumed value / a step constraint), not a
code change I can make without fabricating a number.

### BASE-PARITY PROOF (verification a)

The 2 golden failures are NOT caused by my engine change. Proof:
- Swapped the engine files to the pre-shape-gate state
  (`git show 9374a681^:<file>`; verified `git diff c7b196ba 9374a681^` on both
  engine files is EMPTY, i.e. the pre-fix tip's engine).
- Ran the REVERTED (original) realizationGolden.test.ts against that BASE
  engine: 2 failed | 4 passed (6); the 2 fails are the SAME
  `missing-required-argument` x2 (NOT unknown-address).
- Restored the shape-gate engine (verified `git diff HEAD` on both engine files
  EMPTY). 
=> The 2 golden legs fail IDENTICALLY with and without my engine change:
   base-parity holds; the lowerer gap is independent of the door.

## l2t2320 STEP — app side (Change 2) — VERIFIED COMPLETE (addendum C)

The dead run had actually FINISHED the app side before it died on the cap
(only the commit was missing). I committed it as-is (856d5210), then verified:
- Single-request arm (renderTypedClarification, ChatLog.tsx:302-339): the chip
  renders the DATA value from server-stamped `clarifyControl` (quantity arm
  :328-333), the target-well slot for the wells arm (:334-338), both editable,
  neither a silent default (slot starts UNANSWERED/empty; approve required).
- Card arm (ChatClarificationCard.tsx:181-201): the same two surfaces mount as
  the FIRST arms of the per-slot ternary, riding the existing `record` sink.
- requestRendersPrompt predicate UNCHANGED (ChatLog.tsx:132-134:
  `options.length>0 || requestHasPicker`); the bubble-suppression arm
  (:448-454) keys on the SAME shared predicate. The declared-slot guard
  (:318/:322 `hasDeclaredSlot = clarifyControl != null`) EXTENDS the render
  guard additively so the single-fact (n===1) turn is answerable WITHOUT
  touching the predicate — addendum C requirement satisfied.
- CARD-1 pins run after the edit: ChatLog.test.tsx 27 + grouped.card1 6 =
  33/33 GREEN (predicate + bubble-suppression arm keep working).
- App typecheck (exactOptionalPropertyTypes ON): 10 errors at HEAD. TRUE-BASE
  (a3863306, WIP files removed, tracked app at a3863306) = 10 errors. Error-set
  diff base-vs-head = EMPTY (byte-identical) — ZERO NEW, none in any of the 6
  touched files. All 10 are pre-existing trunk debt (event-editor/ingestion).
- Server-side RED pins (the chip/slot DATA + fold + dedupe, already in the
  tree): shorthandChat.assumedValue 6 + wellTarget 4 + sameNounDedupe 1 =
  11/11 GREEN.
- NOTE: `proposalRowFacts.ts` (Change 5) is present in the WIP but not yet
  consumed by a component (no import) — it is a standalone declarative
  formatter for the proposed-changes rows; the Change 5 row wiring is not
  part of Change 2 (the chip) and is outside this run's finish scope. Left as
  the dead run left it (committed, not deleted, not finished here per addendum
  A). Flagged for the orchestrator.

## l2t2320 STEP — final verification summary (per-leg evidence)

### (a) dir sweep + base parity
- `npm run test:run -w server -- src/compiler/resolution src/compiler/scientistIntent`
  (run via npx vitest in server/): **49 files, 547 passed / 2 failed (549)**.
  The 2 fails = realizationGolden T1/T2 ONLY (the lowerer gap, separate leg).
- Base-parity: the 2 golden fails reproduce IDENTICALLY at the pre-shape-gate
  engine (9374a681^ == pre-fix tip c7b196ba engine, verified empty diff),
  `missing-required-argument` x2, NOT unknown-address. Zero new failures from
  the door change.

### (b) wells-dimension legs (named)
- two reachability pins UNEDITED: declaredArgumentReachability 41/41 GREEN
  (CHARACTERIZATION :166 + GHOST :376, string `targetWells: A1:H12`, pass via
  the ENGINE change).
- rolesSeam SPINE-7 legs: rolesSeam 20/20 + goldenRolesSeam 7/7 GREEN.
- nounResolution unknown-address: 16/16 GREEN (bogus_role -> unknown-address).
- golden MANIFEST unmoved by the door change: the 2 golden legs fail IDENTICALLY
  base vs head on `missing-required-argument` (lowerer), NOT unknown-address —
  the door is orthogonal to the golden's bar. (Note: T1 aborts at the outcome
  assertion before the manifest print, so I proved the bar/outcome is unchanged,
  not a byte-diff of the manifest payload.)
- e2eStubHonesty 7/7 GREEN (string doc-echo is the honest real output).
- pattern verbs: ProtocolIntent 5 + ProtocolIntentPatternExpanders 8 = 13/13
  GREEN unamended (no shape-gate parity needed).

### (c) typecheck
- server `npm run typecheck`: **0 errors** (exactOptionalPropertyTypes ON).
- app `tsc --noEmit`: 10 errors, ZERO NEW vs true-base (error-set diff empty,
  none in the 6 touched files).

### Files changed this run
- server/src/compiler/resolution/resolutionEngine.ts (doc-door scalar arm).
- server/src/compiler/scientistIntent/normalizeScientistIntent.ts
  (isWellAddressLiteral + mappings loop + (b) arm DRY).
- Reverts (4 shipped-test files to pre-edit state):
  declaredArgumentReachability.test.ts, shorthandChat.e2eStubHonesty.test.ts,
  app/e2e/deck-ghost-shorthand.spec.ts, realizationGolden.test.ts.
- App WIP committed as-is (6 files, the dead run's Change 2/4/5 app side).
- This report.

### What a reviewer should attack hardest
1. The (b)-arm DRY refactor — confirm isWellAddressLiteral is byte-behaviour-
   identical to the old inline expandWellTokens+WELL_ADDRESS_SHAPE_RE test.
2. The mappings-loop gate — confirm ONLY address-literal scalars on a
   kind:'wells' 'wells'-family arg flip from wellRole to literal; symbolic
   labels + bogus addresses still bar.
3. The import edge resolutionEngine->normalizeScientistIntent (acyclic? used
   only at call-time?).
4. The golden BLOCKED verdict — confirm no honest data source for a target-
   wells value exists (so the lowerer CANNOT emit it without fabricating).
5. App single-request arm guard — confirm requestRendersPrompt predicate is
   byte-unchanged and only the render guard is extended.

TARGET1-WELLSFIX DONE 9374a6814cb81beeeaab7f9cc931af14b09191f9
