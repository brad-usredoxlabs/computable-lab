# PB-CH-10 — FIX RUN report (cycle 1 of max 2) — l2t2315

Item: PB-CH-10 "Analysis draft-args grounding"
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-10-lane2-l2t2120 (branch pb-ch-10-lane2-l2t2120, prior HEAD acc2c8a4 / code tip 775a69cf — same branch, same worktree, NO new branch/worktree)
Adversarial report fixed against: /home/brad/.hermes/cl/lanes/2/reviews/review-PB-CH-10-adversarial-l2t20261007T2155.md (VERDICT: fix, 1 medium defect)

## DEFECT 1 [medium] — FIXED: degrade-on-scan-failure

Reviewer's finding: `await store.list({ kind })` (analysisReferenceGrounding.ts:159)
was unguarded; a store error rejected `buildAnalysisGroundingBlockForSurface` ->
`buildPrefixRequest` -> `run()` (AgentOrchestrator.ts:1425, before run()'s first
try at :1458) -> AIHandlers catch -> `type:'error'` event. A transient store
failure killed the whole analysis / run-page-chat turn.

Fix (cause-level, in the module — not a blanket try/catch at the call site):
- `server/src/ai/analysisReferenceGrounding.ts` — each per-kind `store.list`
  read is now wrapped; on failure the function `console.warn`s loudly and
  diagnosably (`[analysis-grounding] store.list failed for kind <kind>;
  grounding block omitted for this turn: <store error message>`) and RESOLVES
  null. The Promise never rejects on a store failure.
- Degradation semantics chosen: WHOLE block -> null on ANY kind failure, not a
  partial render. Rationale (recorded in the code comment): the block's title
  claims these are the ONLY records compose_analysis may target, so a partial
  candidate list is worse than none; and a partial render could silently diverge
  warm vs real prefixes. Mirrors the established tier-1 pattern the reviewer
  cited (src/resolve/providers/records.ts:63-67, "a missing kind index must not
  sink the rest").
- The surface-membership gate stays OUTSIDE the guard: a non-listed surface with
  a broken store still costs ZERO store scans (pinned by a new test — the
  degradation is not a blanket catch that hides the gate).
- Malformed-YAML policy errors still throw honestly (unchanged contract; the
  reviewer's fix direction explicitly allowed this: "the store read must not
  sink the turn", policy misdeclaration is a config bug).

RED-first evidence: the 5 new tests were written BEFORE the fix and run against
the unfixed module first — 4 failed exactly as the reviewer predicted
(`promise rejected "Error: REVIEW-STORE-BOOM..." instead of resolving`, and the
capture arm died at `buildPrefixRequest src/ai/AgentOrchestrator.ts:1048 ->
Object.run src/ai/AgentOrchestrator.ts:1425`). After the guard: all green.

New tests (`server/src/ai/analysisReferenceGrounding.test.ts`, new describe
block "scan-failure degradation", +88 lines):
1. list() throwing on the first kind => `buildAnalysisReferenceBlock` RESOLVES
   null (not a rejection); console.warn carries the failing kind + store error text.
2. Partial failure (one kind throws, others fine) => still null.
3. `buildAnalysisGroundingBlockForSurface` (the orchestrator entry point)
   degrades to null, never rejects.
4. CAPTURE arm (the reviewer's concrete scenario): store whose list() throws =>
   `orchestrator.run` still completes, the outbound request is still captured,
   its system message carries NO block, and the warn fired.
5. Non-listed surface + throwing store => zero store scans (gate intact).

## OBS-2 — DONE (trivial, honest, data-only)

`server/prompts/analysis-reference-grounding.md` shape example now shows the
tool's outer `analysis` wrapper, byte-consistent with the tool envelope
(`{intent:"compose_analysis", analysis:{...}}`, submitSuggestionTool.ts:439
required:['intent'] + the `analysis` property): the two example lines are now
`{"analysis":{"operation":"compose-analysis",...}}` and the rule line names the
wrapper. No test asserts the old example text verbatim (grep-verified: no test
or source outside the md contains "Exactly ONE target branch" or the example
JSON); all tests green after the edit. This closes the MALFORMED_ENVELOPE bait
more tightly. No other data-file change; OBS-1 (title wording vs target/input
kinds) left untouched per reviewer instruction — architect/spec territory.

## Verification (verbatim pins, run in the worktree)

1. `cd server && npx vitest run src/ai/analysisReferenceGrounding src/ai/AgentOrchestrator.surfaceVocab.test.ts`
   -> Test Files 2 passed (2); Tests 23 passed (23)  (was 18; +5 new degradation tests)
2. `cd server && npx vitest run src/ai/analysisReferenceGrounding src/ai/attachedProtocol`
   -> Test Files 2 passed (2); Tests 26 passed (26)  (attachedProtocol baseline green)
3. `cd server && npx vitest run src/drafts src/analysis`
   -> Test Files 11 passed (11); Tests 99 passed (99)  (no compile-path change)
4. `cd server && npx vitest run src/ai`
   -> Test Files 10 failed | 71 passed (81); Tests 21 failed | 619 passed (640)
   FAIL-file set (10) comm -3 vs the adversarial review's reported set: EMPTY.
   Failing tests identical (21); passed count rose 614 -> 619 = exactly the 5 new tests.
5. `cd server && npx tsc --noEmit` -> grep -cE '^src/' = **26**; file set:
   src/ai/AgentOrchestrator.ts, src/api/handlers/ProtocolIntakeHandlers.ts,
   src/api/handlers/RecordHandlers.ts, src/lint/AuthoringGuard.ts,
   src/scripts/bootstrapAdmin.ts, src/store/RecordStoreImpl.ts
   comm -3 vs pinned 6-file set: EMPTY. (Reviewer's note honored: `npx tsc
   --noEmit` in server/ is the reliable equivalent of the pinned typecheck.)
6. app/** untouched (diff --name-only shows only the 3 server/data files below).

## Files changed this fix cycle

 server/prompts/analysis-reference-grounding.md   |  6 +-
 server/src/ai/analysisReferenceGrounding.test.ts | 88 ++++++++++++++++++++++++
 server/src/ai/analysisReferenceGrounding.ts      | 20 +++++-
 3 files changed, 110 insertions(+), 4 deletions(-)

## Hygiene

- All git invocations `git -c core.fileMode=false`; staged owned files by path
  only (no `git add -A`); no lane-stack restart; :3001/:5174 and
  /mnt/vast/home/brad/git/computable-lab untouched; no writes to schema/,
  specification/, tmp-orch/, receipts.
- No new branch, no new worktree; commit on pb-ch-10-lane2-l2t2120.

## Final commit

986b7be62c82b2c1ebb68f44605dc94913b0d601 (fix commit, on pb-ch-10-lane2-l2t2120;
this report committed immediately after — `git log -1` at orchestrator
verification time may show the docs commit; the code tip is 986b7be6).
`git -c core.fileMode=false diff --stat 775a69cf..986b7be6`:
 server/prompts/analysis-reference-grounding.md   |  6 +-
 server/src/ai/analysisReferenceGrounding.test.ts | 88 ++++++++++++++++++++++++
 server/src/ai/analysisReferenceGrounding.ts      | 20 +++++-
 3 files changed, 110 insertions(+), 4 deletions(-)
