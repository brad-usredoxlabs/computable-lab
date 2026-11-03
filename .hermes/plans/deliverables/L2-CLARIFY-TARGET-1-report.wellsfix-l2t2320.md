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
