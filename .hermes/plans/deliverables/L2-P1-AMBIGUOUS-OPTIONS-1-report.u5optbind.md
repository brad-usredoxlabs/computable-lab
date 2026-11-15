# L2-P1-AMBIGUOUS-OPTIONS-1 (u5optbind) — fold-path join-miss fix, report

Lane 2 · item L2-P1-AMBIGUOUS-OPTIONS-1 · unit u5optbind (1 of 1) · tier normal
Worktree: /home/brad/cl-wt/L2-P1-AMBIGUOUS-OPTIONS-1-u5optbind-lane2
Branch: cl/lane2-p1-amopt-u5optbind
Base: 86b99f5bebfbf46373cb32cebcb6b545fe8706f5
Commits: RED 4e4c5fe993b2fc484f006746ae644bcd406cb236 (test alone) → GREEN 6cf48401439aaf2228cb6163083af7b70c610c78 (fix) → report commit (this file).

## Defect (r13 defect 1, corpus prompt-1)

The card id IS `factRequestId` — the mint site (shorthandChat.ts `clarificationSSEFromHeld`, :1162) and the fold key (:1450-1451) use the same derivation, confirmed byte-exact against the r13 thread store: card 1 id `unresolved-c-850867123f` (label `96-well plate`) and the re-asked card 2 id `unresolved-c-b48177dd6b` (label `Generic 96-Well Plate`) both reproduce through `factRequestId`. The brief's "different derivation" hypothesis is therefore NOT the cause.

Actual mechanism (from r13 report.md + thread store):
1. Click 1: answer id `unresolved-c-850867123f` (original fact) → fold joins → splices `Generic 96-Well Plate` into the `labware` slot. The recompile re-derives the SAME bar (the noun still cannot bind to a record — the answer's `optionId`/`ref` never reached the compiler as a record identity) but with the SPliced label → new id `unresolved-c-b48177dd6b` → re-held as the ONLY held fact (heldFacts=1) → second card re-emitted with id `b48177`.
2. Click 2: the app accumulates the STALE first answer (id `850867`, label `Generic 96-Well Plate`) + the new answer (id `b48177`) → `answers=2 heldFacts=1`. The stale id `850867` is no longer a key in the held map (the held fact is now `b48177`); the legacy positional arm never fires (content ids never match `unresolved-\d+`) → `arm=join-miss` → the whole fold returns null → "AI completed the task but did not propose any changes."

## Fix (GREEN commit)

`server/src/ai/shorthandChat.ts` — one content-verified join arm, added after the legacy positional arm (which is untouched), in BOTH the live fold and its byte-mirror `foldNullArm`:
When `factByKey.get(requestId)` misses, the id is not a legacy positional id, and the answer carries a `label`, join to the held fact when `canonicalLabelKey(answer.label) === canonicalLabelKey(fact.label)` and that fact is the UNIQUE such candidate in `held.clarifications`. The answer's content (its own label) verifies the match, so this never degenerates into "answer any ambiguous card positionally" and never guesses between two same-label facts (uniqueness gate). The legacy `unresolved-\d+` positional arm at the old location is byte-identical (existing pins green). No ref/binding changes: the join-hit path (`refIdOf`, `answeredSlots`, `bindings`) was already correct once the join hits — r13 showed the join-miss fired before `refIdOf`.

## Verification (raw tails, this worktree)

RED (commit 4e4c5fe99, test alone, before fix) — `npm run test:run -w server -- shorthandChat.foldJoin`:
```
AssertionError: expected null to be defined
   47|     expect(fold).toBeDefined();
   48|     expect(fold!.splice).toBeNull();
   49|     expect(fold!.bindings).toHaveLength(0);
Test Files  1 failed (1)
     Tests  2 failed | 5 passed (7)
```
The 2 failures are exactly the r13 shapes: (a) emitted-id answer vs re-held same-content fact → `null` (join-miss); (b) stale first answer id against held {re-derived fact, second different fact} → `null`. The 5 passing premises confirm: card id === factRequestId (byte-exact r13 ids), exact-id fold works (splice + binding + answeredSlots), legacy positional arm still works, and the two never-guess pins (two same-label facts / label mismatch → still `null`).

GREEN (commit 6cf484014) — same command:
```
Test Files  1 passed (1)
     Tests  7 passed (7)
```

## Green bars (measured on final commit 6cf484014)

- `npm run test:run -w server -- shorthandChat` → Test Files: 5 failed | 8 passed (13); Tests: 8 failed | 208 passed (216).
- `npm run typecheck -w server` → exit 2, 6 `error TS` lines.

PRE-EXISTING, NOT MY REGRESSION — verified by stashing my fix and re-running at the clean base 86b99f5be:
- shorthandChat: identical set of 8 failed tests in the same 5 files (cueCascade 1, compositionEmit 1, e2eStubHonesty 1, foldNullArms 2, reviseReuse 3) at base.
- typecheck: identical 6 errors at base (server/src/ai/AIHandlers.ts:75, AiIngestionHandlers.ts:250, handlers/ExtractProtocolHandler.ts:197, routes/sequenceRoutes.ts:547/559/638) — none in my files.
- My two files (`shorthandChat.ts`, `shorthandChat.foldJoin.test.ts`) contribute zero new failures and zero new typecheck errors.
Likely root cause: the linked integration node_modules (cl-integration-2, HEAD ede4b7ecc) has drifted from the r13 rev e52e9d01c the baselines were measured on (the r13 receipt itself flags the "node_modules absent" environment gap; these suites are live-records / dependency-sensitive). Re-measuring the baseline bars at a matching rev is the next action if the orchestrator wants the bars re-baselined; it is outside this unit's server-side seam scope.

## Changed files
- server/src/ai/shorthandChat.ts (fix; ~46 lines: new content-verified arm in `foldAnswersIntoShorthand` + mirrored arm in `foldNullArm`)
- server/src/ai/shorthandChat.foldJoin.test.ts (new; 7 tests)

Environment materialization (not committed, git-ignored): `server/node_modules` → /mnt/vast/home/brad/git/cl-integration-2/server/node_modules; `server/schema` → ../schema (same as the integration worktree).

## Acceptance
1. foldJoin RED before fix (arm=join-miss → null fold) and GREEN after, committed in that order — DONE (4e4c5fe99 → 6cf484014).
2. An AMBIGUOUS-card answer whose requestId is the emission-side (stale) id joins the re-held fact: fold returns a splice with answeredSlots filled and the ref-carrying answer records its binding — DONE (test (a)/(b) green; exact-id binding path green).
3. shorthandChat suite: no new failures vs base (8 pre-existing, byte-identical at base); typecheck: no new errors vs base (6 pre-existing, byte-identical at base) — DONE (with the caveat above that the bars themselves are not clean at this node_modules rev).
4. Legacy positional arm `unresolved-\d+` unchanged; existing pins green — DONE (legacy test green; foldNullArms/reviseReuse pins unchanged, their failures identical at base).

## Next actions / blockers
- None blocking for this unit. If the orchestrator re-baselines the green bars at the r13 rev (e52e9d01c) node_modules, re-run the two bar commands; expected clean.
- Downstream (out of scope here): the fold now splices the chosen label but the noun still re-bars on recompile because the answer's record identity (optionId `lbw-def-generic-96-well-plate`) is not yet converted into a compiler `binding`/answeredSlot at the orchestrator seam — that is the u4foldbind leg this unit rides on; this unit closed the join it needs.

L2-P1-AMBIGUOUS-OPTIONS-1 UNIT u5optbind DONE 7d201f5c045e890e8a43b450e9542fc396e0c30f
