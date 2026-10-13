# W2-11 D3 fix report — said-vendor-rewrite wall verbs govern ordinary MEANT verbs (lane 2, l2t1910)

Branch: `w211-d3fix-l2t1910` off trunk `9940300f`
Worktree: `/mnt/vast/home/brad/git/wt/W2-11-D3FIX-lane2-l2t1910`
Spec: `.hermes/plans/2026-10-12_1930-W2-11-d3fix-wall-verbs-spec.md` (followed exactly)

## 0. What changed (DATA-ONLY, zero interpreter change)

`git -c core.fileMode=false diff --numstat` (ONLY the two owned files):

```
27	9	config/drafting/review-write-wall.yaml
53	0	server/src/ai/reviewWriteWall.test.ts
```

`git -c core.fileMode=false status --porcelain` shows exactly these two files
(plus this report at commit time). `server/src/ai/reviewWriteWall.ts` was NOT
touched; no other wall, no `matching`, no blockerWords, no strip patterns, no
negationTokens, no opsWall, no new wall id, no TS branch.

1. `config/drafting/review-write-wall.yaml` — `askWalls[said-vendor-rewrite].verbs`
   ADDITIVELY joined `change, edit, update, modify, revise, alter` to the seven
   SAID-REWRITE verbs (none removed/reordered/weakened). The wall's comment
   block rewritten to state the governance argument: object governance
   (adjacency `maxGapWords` + leading-verb `blockerWords`) — not the verb list —
   separates a wall-crossing ask from a legit one, citing the boundary string
   "change step 3 to match the vendor text on page 2". The header `askWalls`
   comment (which previously said ordinary MEANT verbs are NOT listed) was
   updated to match the new data — comment text only.
2. `server/src/ai/reviewWriteWall.test.ts` — RED-first: 4 new tests (41 new
   assertions) added BEFORE the yaml change; RED proven first (see §2).

## 1. Lane-sync note (measurement integrity)

The pre-built worktree lacked the cl-lane-sync symlinks: 61 lane-exclude paths
(`/server/src/ai/materialRefFields.ts` etc.) were missing, so the first
collateral runs failed with bogus `Failed to load url ./materialRefFields.js`
collect errors and server tsc showed 397 lines (mostly TS2307 missing modules).
I reproduced the lane-sync state (symlinked all 61 lane-exclude entries from
Brad's computable-lab checkout, never overwriting a tracked file; git status
stayed clean) and re-measured. All numbers below are post-lane-sync.

## 2. RED-first evidence

RED (tests added, yaml untouched — 2 failed arms, exactly the wall-absence gap):

```
 FAIL  src/ai/reviewWriteWall.test.ts > ... > W2-11 D3: ordinary MEANT verbs governing a SAID referent fire SAID_IMMUTABLE
AssertionError: D3 negative not walled: change the vendor text on page 1: expected null not to be null
 FAIL  src/ai/reviewWriteWall.test.ts > ... > W2-11 D3 boundary (honest): "change the step label; the vendor text is wrong" FIRES via leading-verb governance
AssertionError: expected null not to be null
 Test Files  1 failed (1)
      Tests  2 failed | 21 passed (23)
```

GREEN (after the yaml verb amendment):

```
$ cd server && npx vitest run src/ai/reviewWriteWall.test.ts
 ✓ src/ai/reviewWriteWall.test.ts  (24 tests) 444ms
 Test Files  1 passed (1)
      Tests  24 passed (24)
```

24 = 20 pre-existing tests + 4 new (the MUST-REFUSE corpus is one loop test with
5 asks; the two governance-exempt boundary arms are each their own test per the
spec; the tricky third arm is its own test).

## 3. Boundary corpus — ACTUAL outcomes (honest)

MUST REFUSE (all fire SAID_IMMUTABLE):
- "change the vendor text on page 1" — adjacency: change(0) the(1) vendor(2), gap 1 <= 3. FIRES.
- "change the vendor text" (golden §D3 verbatim leg) — gap 1. FIRES.
- "edit the vendor text" — gap 1. FIRES.
- "update the vendor document" — gap 1. FIRES.
- "change the vendor wording" — gap 1. FIRES.
- "can you change the vendor text please" — interrogative strip removes
  "can you ", remainder opens with `change` -> leading-verb governs. FIRES.

MUST STAY EXEMPT (verified null):
- "change step 3 to match the vendor text on page 2" — adjacency gap 5 > 3;
  leading-verb blocked by `to`. EXEMPT (test green).
- "change step 3 so it reflects the vendor document" — blocked by `so`. EXEMPT (test green).

TRICKY ARM — ACTUAL OUTCOME: "change the step label; the vendor text is wrong"
**FIRES SAID_IMMUTABLE** (refused). Mechanism verified against the interpreter:
- Adjacency does NOT fire: change(0) the(1) step(2) label;(3) the(4) vendor(5)
  — noun starts token 5, gap 5-1 = 4 > maxGapWords 3. (The spec's "gap > 3 ->
  exempt by adjacency" holds for the adjacency trigger.)
- Leading-verb FIRES: the stripped remainder opens with the joined verb
  `change`; between it and the `vendor text` match sit `the step label; the` —
  none is a blocker word (`label;` is not in blockerWords; matching is
  exact-token, punctuation included), so the referent is reachable and the
  trigger governs it.
Per the spec this refusal is ACCEPTABLE and honest: an independent clause
naming the SAID referent with nothing blocking it is ambiguous. NO blocker word
was added to exempt it; the wall was NOT weakened. The test pins the FIRES
outcome so a future reviewer sees the deliberate choice.

## 4. Existing suite byte-green + collateral

- All pre-existing tests in reviewWriteWall.test.ts pass unchanged (20/20),
  including every DEFECT-1/DEFECT-2/c2 boundary arm. NO legacy expectation was
  updated: no pre-existing test expected "change/edit/update/modify/revise/alter
  + vendor noun not refused" (grep-verified across server + app test files; the
  only vendor-mentioning legit asks use `rewrite`/`relabel`/`fix`/`reword`/
  `write` verbs or blocker-governed constructions).
- Collateral wall consumers green:
  `npx vitest run src/ai/reviewWriteWall.test.ts src/ai/AgentOrchestrator.reviewWriteWall.test.ts src/ai/AgentOrchestrator.honestRefusal.test.ts`
  -> `Test Files 3 passed (3), Tests 36 passed (36)`.
  `app: npx vitest run src/ingestion/protocol-review/ReviewAiPanel.writeWall.test.tsx`
  -> `Test Files 1 passed (1), Tests 6 passed (6)`.
- Gate-note over-fire check (spec §Gate note): "reword step 3's label for our
  bench" stays exempt — pinned by the pre-existing test at :105, green in the
  24-test run ('reword' is not a wall verb).

## 5. Zero-new proof (stash-parity, post-lane-sync)

- server tsc: base 0 error-TS lines, head 0 error-TS lines; `diff` of sorted
  outputs identical.
- Full server suite (stash-parity):
  - HEAD: `Test Files 104 failed | 593 passed | 9 skipped (706); Tests 156 failed | 5495 passed | 70 skipped (5938); Errors 2`
  - BASE: `Test Files 104 failed | 593 passed | 9 skipped (706); Tests 156 failed | 5492 passed | 70 skipped (5935); Errors 2`
  - `comm -3` of the sorted FAIL-file lists (100 unique files each): EMPTY —
    identical fail-sets, zero new failures. Tests delta is exactly +3 passed
    (the 3 new it() arms; the 5-ask loop counts as 1). The 2 unhandled Errors
    are pre-existing debt (AgentOrchestrator.goldenWithSeeds 'Should not be
    called' mock rejection), identical base/head.
  - Raw logs: /tmp/w211-head-suite.log, /tmp/w211-base-suite.log; fail-file
    lists /tmp/w211-head-failfiles.txt, /tmp/w211-base-failfiles.txt.

## 6. Assumptions / notes for the orchestrator

- The yaml header comment block was amended alongside the wall's own comment
  block because the old header text ("ordinary MEANT verbs are NOT listed")
  would otherwise contradict the data. Comment-only; no semantic key touched.
- Gate run 3 reminder (orchestrator leg, not mine): YAML changed ->
  `cl-lane-stack.sh 2 restart` REQUIRED before the gate; D3 refusal legs must
  show review-ai-refusal; "reword step 3's label for our bench" must still
  yield a proposal (pinned exempt in §4).
- The D3 golden leg "mark the inferred incubate as vendor-stated" and
  "promote the draft" ride the other two walls — untouched, green.

W211-D3FIX DONE ee23229f
