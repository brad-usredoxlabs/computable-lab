# W28-FOLDSENT-1 — Hedge-sentinel slot value counts as declared absence (fold guard 4)

Lane 2 · trunk `cl/integration-2` · server-only. Architect ruling W28-A5l
(`decisions/W28-A5l-ui-residual-set-fold-divergence-decision.md`, "W28-A5l DECIDED"
2026-10-19T07:53) — the fix surface is guard (4) of `declaredOptionalHedgeFold.ts`.
Downstream: unblocks W28-A5D-R3 (A5 accept-leg gate; probe r5 then A5 re-shoot r4).

## The defect (verified by orchestrator first-hand at trunk 9dc2f679)

The model sometimes writes its own hedge sentinel INTO a declared-optional scalar
slot, e.g. `{"action":"bead_beat", ..., "duration":"not-stated"}` (verbatim held
localMacro in the A5l decision, probe 3). Guard (4) of the A5j PARAM-FOLD only folds
when the argument is ABSENT: `argumentPresent()` (declaredOptionalHedgeFold.ts:40-45)
returns true for ANY non-empty string, so `"not-stated"` reads as "present" and the
fact is KEPT. The kept fact is by-construction unanswerable (ANSWER-BIND-1 skips
`kind !== 'resolvable'` slots; the `/m` card offers only a mint floor), so the UI
answer loop never empties — the A5d-r3 BLOCKED residual-set class.

## The fix (exact scope — do not widen)

File: `server/src/compiler/resolution/declaredOptionalHedgeFold.ts` — guard (4) site
(:89-93) / the private `argumentPresent` (:40-45) ONLY.

A parsed slot value that IS the module's own stable hedge sentinel — the
`NOT_STATED_REASON` code already declared at :30 — counts as ABSENT for guard (4).
Smallest expression: in the guard-(4) presence test, treat a trimmed string value
strictly equal to `NOT_STATED_REASON` as not present. Zero verb/noun/domain literals
(the module law at :29-32 still holds — `NOT_STATED_REASON` is a stable code, not a
name). No change to guards (1)(2)(3)(5), no UI change, no endpoint change, no prompt
change, no ANSWER-BIND scalar arm (the A5l ruling forbids institutionalizing the mint
floor as a duration answer).

Idempotence + contract: the change only ADDS sentinel values to the "absent"
equivalence; already-folded sets re-fold identically. Existing golden/fixture pins on
absent-slot folds must stay green.

## RED-first regression test (required, pins the observed shape)

Alongside the existing declaredOptionalHedgeFold/param-fold tests (find them via the
PARAM-FOLD-1 test files from 55d6d6bb — `git -c core.fileMode=false show 55d6d6bb
--stat`):
1. Fixture action `{action: bead_beat-like verb with declared `duration`
   kind:scalar required:false contract (use the REAL vocabulary — the fold reads
   argContracts; pick a verb the shipped vocabulary declares optional, per
   schema/scientist-intent/scientist-intent-vocabulary.yaml:826-828)} with
   `duration: "not-stated"` + a `not-stated` fact at that slot -> folded from BOTH
   channels: the resolve_nouns clarifications AND the raw
   `unresolvedRefs`/`protocolIntent.unresolved` (A5l sequence step 1, verbatim).
2. A slot holding a real value ("20 min") stays KEPT (no over-fold).
3. A slot holding a DIFFERENT non-empty string that merely contains
   "not-stated" as a substring (e.g. "not-statedly 20 min") is NOT folded (exact
   trimmed equality, not substring/regex).
4. Numeric slot 0 stays present-and-kept (argumentPresent number arm unchanged).
5. Required-slot sentinel still keeps (guard (3) before guard (4) — a required slot's
   sentinel is a different class, out of scope).

## Verification (orchestrator runs these on the merged trunk; worker runs same in worktree)

- `npm run test:run -w server` for the fold/lint-adjacent targeted files: zero failures,
  zero NEW failing files vs trunk baseline.
- `npm run typecheck -w server`: error-line count == trunk baseline (33-line baseline
  pinned in prior handoffs; sorted-diff identical).
- NO product YAML changes -> no stack restart needed (tsx --watch reloads TS).

## Ownership / workspace

Worker branch off `cl/integration-2` in `/mnt/vast/home/brad/git/wt/W28-FOLDSENT-1-lane2`.
Report at the UNIQUE path given in the dispatch. All git via `git -c core.fileMode=false`
(NFS mode-bit noise). Never touch :3001/:5174 or Brad's live tree.

## Explicitly NOT in scope

- The A5l secondary findings F1 (duplicate card), F2 (sample on /m — own
  emitter-variance class), F3 (`&amp;` over-escape) — recorded, non-blocking, do not
  widen.
- Probe r5 and the A5 tier-2 re-shoot: orchestrator's job after merge, per the A5l
  sequence. The loop arm (axis-only -> answer-every-card) must be included in r5.
- No gate weakening, no duration/cycles answers via mint floor, no fixture-route
  substitute for the accept leg (A5l Q "fixture-route alternative? — No").
