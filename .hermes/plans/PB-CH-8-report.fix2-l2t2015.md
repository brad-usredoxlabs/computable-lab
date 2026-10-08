# PB-CH-8 — FIX RUN report (cycle 2 of max 2), lane 2

Item: PB-CH-8 "Workstate journal + ledger query + reattachment"
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-8-lane2-l2t1405 (branch pb-ch-8-lane2-l2t1405, continued from HEAD 1d2529b3 — NO new branch/worktree)
Gate reviewed: /home/brad/.hermes/cl/lanes/2/reviews/review-PB-CH-8-adversarial-l2t20261007T1940.md (VERDICT: fix, 2 residual LOW defects F1/F2; all four cycle-1 defects confirmed FIXED — untouched here)
Spec: .hermes/plans/2026-10-07_1405-PB-CH-8-ledger-implementation-spec.md
This report is NEW (cycle-1 report PB-CH-8-report.fix-l2t1755.md untouched).

## Method

RED-first: the F1/F2 tests were written FIRST against HEAD 1d2529b3 and captured
failing (output pasted below), then the fixes landed, then the full targeted matrix +
both tsc pins re-ran. Base-vs-head parity for the full src/ai suite proven via the
stash dance (`git -c core.fileMode=false stash push -u -m pbch8-fix2-parity -- <the 7
changed paths>`, suite on pristine HEAD, pop, re-run, `comm -3` of the FAIL-file sets).

STOP BOUNDARIES honored: `git -c core.fileMode=false diff 43cddb26...HEAD -- <the six
frozen files>` remains EMPTY (WorkspaceSessionStore.ts, lab-session.schema.yaml,
useSessionSync.ts, useWorkstateProposalFlow.ts, workstate-intent.schema.yaml,
agent-action.schema.yaml). No lane-stack restart. Policy file stays
schema/workflow/workstate-journal.policy.yaml, re-read per call.

---

## DEFECT F1 (low) — labEventsNear off-by-sign on a zero/negative policy cap — FIXED

Root cause: `anchorEvents.filter(...).slice(-max)` — `slice(-0)` IS `slice(0)`, the
FULL array — so a policy `query.labEventsMax: 0` (legal finite data) leaked ALL N
audit rows into the honest no-history answer; a negative cap silently mis-sliced.

Fix (both halves of the reviewer's direction, defense in depth):

1. Interpret-time rejection (server/src/workspace-session/WorkstateJournal.ts): new
   `countCap()` validator — a "how many" cap must be a finite number that is NEVER
   negative; 0 is meaningful data ("show none" / "keep none"). A negative cap throws,
   so `interpretPolicy` treats the whole file the way it treats a malformed file:
   honest OFF (capture disabled, query answers policy-disabled), never a silent clamp.
   Applied to `query.labEventsMax` AND `linkage.maxLinks` (the same class of count cap;
   `matched.length >= policy.linkage.maxLinks` with a negative cap would have linked
   zero while pretending a cap existed). Time/age numbers (windowMs, minIntervalMs,
   maxAgeDays, maxEntries) keep `requiredNumber` — maxEntries 0 already prunes
   correctly and negative retention is out of the reviewer's named scope.
2. Consumer guard (server/src/workspace-session/ledgerQuery.ts, labEventsNear):
   `if (!(max > 0)) return [];` — belt-and-braces so no caller can re-introduce the
   leak even if a future caller passes an unvalidated number.
3. Policy YAML documents the boundary semantics (comment only; value stays 8):
   "0 is legal and means SHOW NONE; a negative value is malformed data — interpretPolicy
   rejects it and the whole policy is treated as invalid, never silently clamped."

RED captured (against HEAD 1d2529b3, before the fix):

```
FAIL src/workspace-session/ledgerQuery.test.ts > ledgerQuery — lab-events cap boundary (adversarial r2 F1) > query.labEventsMax: 0 means SHOW NONE — the no-history answer lists ZERO lab-event lines, never all N audit rows
AssertionError: expected [ { recordId: 'EVT-1', …(3) }, …(9) ] to have a length of +0 but got 10
FAIL src/workspace-session/ledgerQuery.test.ts > ... a NEGATIVE query.labEventsMax is rejected at interpret time — the policy is invalid (honest off), never a silent mis-slice
AssertionError: expected false to be true // Object.is equality   (journal.policyDisabled() was false with labEventsMax: -2)
Test Files  1 failed (1); Tests  3 failed | 17 passed (20)
```

GREEN tests added (server/src/workspace-session/ledgerQuery.test.ts, new describe
"lab-events cap boundary (adversarial r2 F1)"):
- `labEventsMax: 0` + 10 audit rows ⇒ no-history `journal-empty` with ZERO lab-event
  lines; answerText contains no lab-events header and no EVT id.
- `labEventsMax: -2` ⇒ `policyDisabled() === true`, `queryLabEventsMax() === 0`,
  capture refuses, query answers `policy-disabled` with zero lab events.

## DEFECT F2 (low) — fabricated `asOf` (epoch) on the no-history refusal paths — FIXED

Fix direction chosen: OMIT the key (make it optional), never a self-describing
placeholder — a placeholder is still a value a renderer could format as a time.

1. `LedgerAnswerEnvelope.asOf` (server/src/workspace-session/ledgerQuery.ts:63-80) is
   now `asOf?: string` with the contract restated: present EXACTLY when a server-known
   audit time EXISTS (the audit anchor the query resolved to); on policy-disabled /
   actor-unresolved / no-anchor NO such time exists and the key is OMITTED.
2. The four `asOf: new Date(0).toISOString()` constructions (was :408/:414/:420/:426)
   are gone — the refusal envelopes simply do not carry the key (exactOptionalPropertyTypes:
   absent, never `undefined`; the `{ ...answer, answerText }` spread preserves absence).
3. Where asOf IS server-known it is KEPT verbatim: the journal no-history answer
   (`journal-empty` / `predates-first-capture` / `pruned` — anchored on a real audit
   occurredAt) and the `found` answer still carry `result.asOf`. A pin test asserts
   this so the fix cannot over-omit.
4. App transport mirror (app/src/event-editor/right-pane/ai/assistStream.ts) mirrors
   the optionality (`asOf?: string`) with the same contract comment; the client relays
   the absence verbatim and never synthesizes a time.
5. server/src/ai/AgentOrchestrator.ledger.test.ts: the actor-unresolved fixture no
   longer carries the epoch (it now models the real refusal shape) and the test
   asserts the forwarded frame has NO `asOf` key.

RED captured (same run as F1's, against HEAD 1d2529b3):

```
FAIL src/workspace-session/ledgerQuery.test.ts > ledgerQuery — no fabricated asOf on the no-history refusals (adversarial r2 F2) > policy-disabled / actor-unresolved / no-anchor answers OMIT asOf — the epoch is never emitted as a server-known time
AssertionError: expected true to be false // Object.is equality   ('asOf' in off.answer was true)
```

GREEN tests added:
- server ledgerQuery.test.ts (new describe "no fabricated asOf ... (adversarial r2 F2)"):
  all five refusal paths (policy-disabled; actor null; actor 'default'; unresolvable
  term; record with no audit rows) assert `'asOf' in answer === false` AND
  `JSON.stringify(answer)` contains no `1970-01-01` anywhere; plus the keep-pin
  (journal-empty answer keeps the real anchor `2026-10-07T09:50:00.000Z`).
- app assistStream.ledger.test.ts: "a no-history refusal frame WITHOUT asOf relays
  verbatim — the client never fabricates a time" (frame without asOf parses, asOf
  stays ABSENT, no 1970 in the relayed envelope).
- server AgentOrchestrator.ledger.test.ts (updated existing test): forwarded
  actor-unresolved frame asserts `'asOf' in answer === false`. (Fixture-shape pin,
  not a standalone red-first test — the red-first evidence for F2 is the ledgerQuery
  test above; the orchestrator fixture previously CARRIED the epoch, which is now
  gone from the shape it models.)

## Verification 5 — consumers of LedgerAnswerEnvelope.asOf (grep + how it kept compiling)

`grep -rn "\.asOf\|asOf:" server/src app/src --include='*.ts' --include='*.tsx'`
(filtered to envelope consumers; full output retained in the run log):
- Production code NEVER reads `answer.asOf`: AgentOrchestrator relays
  `outcome.answer` verbatim (:2412) and only reads `answer.status`; useChatThread.ts
  renders `answerText` + `links` + `labEvents` only (:294-317); assistStream.ts
  relays the parsed frame verbatim. The only `.asOf` READS on the envelope are in
  tests (ledgerQuery.test.ts found/anchor pins, assistStream.ledger.test.ts found-frame
  pin) — all on paths where asOf IS present.
- Other `asOf` hits (analysisCorpus, surfaceContext, GraphSearchPage, selectionToSurfaceContext,
  analysisRunner) are unrelated SurfaceContext/corpus fields — not the ledger envelope.
- Compilation kept by mirroring the optionality in the app's transport mirror
  (assistStream.ts `asOf?: string`); server side exactOptionalPropertyTypes satisfied
  because the refusal constructors OMIT the key (no `asOf: undefined` anywhere).

---

## VERIFICATION OUTPUTS (all after the fixes, HEAD 1d2529b3 + working tree)

1. RED-then-green: captured above (3 failing tests pre-fix → 0 post-fix).

2. Targeted matrix (spec verification 2 + the gate's named set):
   `cd server && npx vitest run src/workspace-session src/drafts src/api/routes src/ai/AgentOrchestrator.ledger.test.ts src/ai/submitSuggestionTool.test.ts`
   -> Test Files 16 passed (16); Tests 176 passed (176)
   With the surfaceVocab pin file added: 17 files / 183 tests passed (gate baseline
   17/179 + 4 new tests = 183 exactly; no failing file).
   ledgerQuery.test.ts alone: 20 tests passed (16 baseline + 4 new).

3. `npm run typecheck -w server` -> 26 error lines, exactly the pinned 6-file set
   (AgentOrchestrator.ts, ProtocolIntakeHandlers.ts, RecordHandlers.ts,
   AuthoringGuard.ts, bootstrapAdmin.ts, RecordStoreImpl.ts). Zero errors in any
   PB-CH-8 file (grep of the output for ledger/WorkstateJournal: none).

4. `cd app && npx tsc --noEmit` -> 34 error lines / 24 files — pin unchanged; zero
   errors in assistStream.ts or any ledger file.

5. App targeted: `cd app && npx vitest run src/shared/session src/event-editor/right-pane/ai`
   -> Test Files 3 failed | 39 passed (42); Tests 291 passed (291). The 3 failing
   FILES are the pre-existing UNTRACKED lane-sync copies (ParameterAnswerInput.test.tsx,
   draftChanges.test.ts, useChatThread.deckLayout.test.tsx) — identical to the
   reviewer's own baseline (290 passed there; 291 here = +1 new assistStream test).
   Ledger subset: assistStream.ledger (5) + useChatThread.ledger (4) +
   chatReducer.ledgerTrace (3) + aiStreamTypes.pin (5) + src/shared/session (7 files)
   -> 11 files / 87 tests passed.

6. Full src/ai suite parity (stash dance): pristine HEAD 1d2529b3 ->
   10 failed files / 21 failed tests / 605 passed (626). With the fix applied ->
   10 failed files / 21 failed tests / 605 passed (626). `comm -3` of the sorted
   FAIL-file sets: EMPTY (identical sets: AgentOrchestrator.bypass, .golden,
   .goldenWithSeeds, .tubeGate, AgentOrchestratorForwarding, ChatbotCompileDeckSlot,
   chatbotCompile.e2e, InferenceClient.config, materialFollowUp,
   submitSuggestionTool.tubeSchema — all pre-existing trunk/lane-sync baseline
   failures, none ledger-related). AgentOrchestrator.ledger.test.ts stays green in both.

7. Stop-boundary diff (43cddb26...HEAD over the six frozen files): EMPTY (exit 0).

## Files changed this cycle (staged by path only; lane scaffolding untouched)

- server/src/workspace-session/WorkstateJournal.ts        (countCap validator; labEventsMax + maxLinks)
- server/src/workspace-session/ledgerQuery.ts             (asOf optional + contract; refusal constructors; labEventsNear guard)
- server/src/workspace-session/ledgerQuery.test.ts        (+4 tests: F1 x2, F2 x2)
- server/src/ai/AgentOrchestrator.ledger.test.ts          (epoch removed from fixture; asOf-absent assertion)
- app/src/event-editor/right-pane/ai/assistStream.ts      (mirror asOf optional)
- app/src/event-editor/right-pane/ai/assistStream.ledger.test.ts (+1 test: refusal frame relays asOf absence)
- schema/workflow/workstate-journal.policy.yaml           (comment only: boundary semantics; value stays 8)

## Not touched (per gate NOTE)

The four cycle-1 fixes, the baits, the frozen seams, approval/routing invariants:
zero edits. No new branch, no new worktree, no restart, no /mnt/vast/home/brad/git/computable-lab,
no :3001/:5174.

## Residual / for the orchestrator

- Behavior disclosure: a policy with a NEGATIVE labEventsMax or maxLinks now flips the
  whole journal OFF (capture + query answer policy-disabled) instead of silently
  mis-slicing/mis-capping. That is the reviewer's chosen "reject at interpret time"
  direction and matches the malformed-file precedent; the shipped policy value (8) is
  unaffected.
- Browser gate legs remain orchestrator-owned post-merge (unchanged from cycle 1).
