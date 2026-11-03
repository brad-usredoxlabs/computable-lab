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
