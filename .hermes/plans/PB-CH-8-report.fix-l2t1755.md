# PB-CH-8 — FIX RUN report (cycle 1 of max 2), lane 2

Item: PB-CH-8 "Workstate journal + ledger query + reattachment"
Worktree: /mnt/vast/home/brad/git/wt/PB-CH-8-lane2-l2t1405 (branch pb-ch-8-lane2-l2t1405, continued from HEAD aadfae11 — NO new branch/worktree)
Gate reviewed: /mnt/vast/home/brad/.hermes/cl/lanes/2/reviews/review-PB-CH-8-adversarial-l2t20261007T1742.md (VERDICT: fix, 4 defects)
Spec: .hermes/plans/2026-10-07_1405-PB-CH-8-ledger-implementation-spec.md
This report is NEW (the wip report PB-CH-8-report.wip-l2t1530.md is untouched).

## Method

RED-first per the fix instruction: the defect 1/2/3 tests were written FIRST against HEAD
aadfae11 and captured failing, then the fixes landed, then the full matrix re-ran. A defect-4
pin test was added alongside the code fix. Base-vs-head parity proven via the stash dance
(`git -c core.fileMode=false stash push -u -m pbch8-fix-parity -- <the 9 changed paths>`,
suites + both tsc pins on pristine HEAD, pop, re-run, `comm -3`).

---

## DEFECT 1 (high) — ledger diagnostics never emitted end-to-end — FIXED

Fix (server/src/ai/AgentOrchestrator.ts, query_workstate_history emit block, after the
workstate_proposal emit): when `outcome.diagnostics` is present and non-empty, forward it
through the EXISTING `pipeline_diagnostics` event — `outcome:'gap'`, `severity:'error'`,
`pass_id:'ledger-query'` — the same channel/severity choice the workspace_action compile
refusal uses (:2156). The diagnostic is never absorbed:

```ts
if (outcome.diagnostics !== undefined && outcome.diagnostics.length > 0) {
  onEvent?.({
    type: 'pipeline_diagnostics',
    outcome: 'gap',
    diagnostics: outcome.diagnostics.map((d) => ({
      pass_id: 'ledger-query', code: d.code, severity: 'error' as const, message: d.message,
    })),
  });
}
```

Client visibility (zero new app machinery): `assistStream.ts` already parses
`pipeline_diagnostics` and `useChatThread.ts` already turns each item into a
`kind:'diagnostic'` trace line (:247-251). So the refused-reattachment diagnostic is now
visible in the chat trace next to the honest `ledger_answer` line.

RED captured (against HEAD aadfae11):
```
FAIL src/ai/AgentOrchestrator.ledger.test.ts > ... FORWARDS the diagnostics as ONE pipeline_diagnostics frame
AssertionError: expected 1 to be ... length  (diagFrames)  → -1 +0 at :195
```
GREEN tests added:
- server/src/ai/AgentOrchestrator.ledger.test.ts: "a found outcome whose reattachment was
  refused FORWARDS the diagnostics as ONE pipeline_diagnostics frame" (asserts exactly ONE
  frame, outcome 'gap', code UNMAPPABLE_SNAPSHOT_TAB, severity 'error', answer still found,
  still NO workstate_proposal, result.success true) + "a clean found outcome (no diagnostics)
  emits NO pipeline_diagnostics frame".
- app/src/event-editor/right-pane/ai/useChatThread.ledger.test.tsx: "a pipeline_diagnostics
  frame from the ledger refusal becomes VISIBLE kind:'diagnostic' trace lines" (asserts the
  diagnostic trace entry coexists with the ledger trace entry, no card).

Screenshot note for the browser gate: ledger-incompatible-surface.png is now producible two
ways — (a) the ledger-side refusal renders the honest answer + a visible diagnostic trace
line (no card, no movement); (b) the compile-gate blocked-card path (envelope built, record
deleted ⇒ UNKNOWN_RECORD ⇒ canAccept:false ⇒ blocked phase, no accept control) is unchanged.

## DEFECT 2 (low) — record-edit tabs mis-derived as protocol-review — FIXED

Fix (server/src/workspace-session/ledgerQuery.ts, serverWorkstateEnvelopeFromSnapshot): the
inverse lookup no longer matches the idField TOKEN NAME. A registered surface qualifies only
when its DECLARED data names the tab kind it would restore:

```ts
const surface = specs.find((spec) =>
  spec.params !== undefined && (
    spec.params[matched.idField] === matched.tabKind ||
    (spec.id === matched.tabKind && Object.keys(spec.params).includes(matched.idField))
  ),
);
```

Data joins on the shipped registry: run-plan `params.runId: run` restores a `run` tab;
project `params.studyId: project` restores a `project` tab; protocol-review qualifies via
its surface id equaling the mapping tabKind `protocol-review` AND binding the `recordId`
route token its envelope target fills. `record-edit` (protocol + the whole analysis chain)
has NO registered inverse surface — it now produces the NAMED `UNMAPPABLE_SNAPSHOT_TAB`
diagnostic (message names surfaces.yaml as the authority) and NO proposal, instead of
borrowing the vendor-PDF review surface. Registry order still decides ties; no TS allow-list,
no token-name heuristic.

BEHAVIOR CHANGE (deliberate, per the reviewer's own fix direction): a stored `record-edit`
snapshot tab is no longer reattachable until a record-editor surface is registered in
surfaces.yaml. The old envelope was latently wrong (the compile gate re-derived the tab from
the record kind, hiding it); the honest state is a named refusal. The browser gate's
protocol/analysis reattachment fixtures should expect the diagnostic path until a
record-editor surface registration lands (that registration is a surfaces.yaml data edit,
out of PB-CH-8 scope).

RED captured (against HEAD aadfae11):
```
FAIL ... record-edit tabs (adversarial defect 2) > does NOT claim the vendor-PDF protocol-review surface
AssertionError: expected true to be false   ('envelope' in built) at :402
```
GREEN tests added (ledgerQuery.test.ts, "adversarial defect 2" describe): record-edit tab ⇒
diagnostics + no envelope + message names surfaces.yaml; plus a regression row proving the
run/project/protocol-review inverses still hold via data equality. SURFACES_DOC fixture now
mirrors the shipped registry more fully (knowledge/analysis context surfaces added).

## DEFECT 3 (low) — hardcoded `max = 8` lab-events cap — FIXED (moved to policy data)

Chose the reviewer's PREFERRED direction (things that can be data should be data):
- schema/workflow/workstate-journal.policy.yaml gains `query.labEventsMax: 8` with a comment
  recording that it is a PRESENTATION cap on the honest no-history lab-event lines (it does
  not gate capture/linkage/retention/anchor) and is re-read PER query like every other value.
- WorkstateJournal.ts: `JournalPolicy.query.labEventsMax` required; `interpretPolicy` reads
  it via `requiredNumber` (a malformed/missing value ⇒ policy invalid ⇒ honest off, same
  discipline as every other field); new accessor `queryLabEventsMax()` re-reads per call.
- ledgerQuery.ts: `labEventsNear(..., max: number)` — no default, no literal; the caller
  passes `journal.queryLabEventsMax()`. `LedgerJournalLike` gains the accessor.
- Test fixtures POLICY_ON (both files) carry `labEventsMax: 8`; the route test copies the
  real shipped policy file, so it tracks automatically.

RED captured (against HEAD aadfae11):
```
FAIL ... lab-events cap is policy data (adversarial defect 3) > cap at query.labEventsMax ... re-read PER call
AssertionError: expected 8 to be 3   (flip labEventsMax 8→3 in place; TS constant ignored it) at :461
```
GREEN test added: 10 seeded audit events ⇒ no-history answer lists the last 8 (policy cap);
flip the YAML value to 3 IN PLACE ⇒ the SAME journal instance answers 3 lines on the next
query (per-call re-read; a TS constant cannot move).

## DEFECT 4 (low/observation) — resolveSpine boot-captured, not per-query — FIXED (code, stronger option)

Took the reviewer's second option: the production host now RE-CREATES the spine per query
(server/src/server.ts ledgerQuery partsSource): `canonicalReadStore(ctx)` fresh per call
(already true) feeds `createResolveSpine({ termProvider: createTermProvider(readStore),
recordProvider: createRecordProvider(readStore, Object.keys(loadWorkstateTabKindMapping())) })`
— composed exactly like the documented `workstateDepsFromContext` precedent
(workstateCompile.ts:207-231: tier-1 searches the kinds the DECLARATIVE mapping can project,
not the material-family DEFAULT_KINDS). The boot-captured `resolveSpine` closure remains for
its other consumers (resolve handlers, workspace-action deps) — untouched. The report claim
(OQ1b) is now TRUE of the code: store view, spine, and surfaces registry are all re-evaluated
per query, so a post-boot record resolves for term queries too, not just `store.get`.

GREEN pin test added (ledgerQuery.test.ts, "adversarial defect 4" describe): `partsCalls`
counter proves `createLedgerQueryHost` invokes the parts accessor exactly once per `run()`
(2 queries ⇒ 2 calls) — a boot-captured part can never be memoized across queries.

---

## VERIFICATION OUTPUTS (all run in this fix cycle)

### 1. RED-then-green (captured against HEAD aadfae11 BEFORE the fixes)

`cd server && npx vitest run src/workspace-session/ledgerQuery.test.ts src/ai/AgentOrchestrator.ledger.test.ts`
```
 Test Files  2 failed (2)
      Tests  3 failed | 18 passed (21)
```
The 3 failures were exactly the defect-1 frame assertion (-1 +0), the defect-2 envelope
assertion (expected true to be false), and the defect-3 cap flip (expected 8 to be 3).
Excerpts pasted per defect above. After the fixes: all green (below).

### 2. Targeted server matrix (final, with fixes)

`cd server && npx vitest run src/workspace-session src/drafts src/api/routes src/ai/AgentOrchestrator.ledger.test.ts src/ai/submitSuggestionTool.test.ts`
```
 Test Files  16 passed (16)
      Tests  172 passed (172)
```
(166 at pristine HEAD via the stash dance → 172 with the 6 new tests: 2 defect-1 orchestrator,
2 defect-2 derivation, 1 defect-3 cap, 1 defect-4 host pin.)

App targeted: `cd app && npx vitest run src/event-editor/right-pane/ai/useChatThread.ledger.test.tsx
src/event-editor/right-pane/ai/assistStream.ledger.test.ts
src/event-editor/right-pane/ai/chatReducer.ledgerTrace.test.tsx src/shared/session`
```
 Test Files  10 passed (10)
      Tests  81 passed (81)     (80 at HEAD + 1 new defect-1 visibility test)
```

### 3. Server typecheck pin (26 lines / 6 files, set-identity)

Pristine HEAD (stashed): 26 lines. With fixes: 26 lines.
File set: AgentOrchestrator.ts, ProtocolIntakeHandlers.ts, RecordHandlers.ts, AuthoringGuard.ts,
bootstrapAdmin.ts, RecordStoreImpl.ts.
```
comm -3 <(grep -oE '^[^(]+' base | sort -u) <(grep -oE '^[^(]+' head | sort -u)   → EMPTY
comm -3 <(sed 's/([0-9]*,[0-9]*)//' base | sort) <(sed 's/([0-9]*,[0-9]*)//' head | sort) → EMPTY
```
Zero errors attributed to any PB-CH-8 file (the AgentOrchestrator.ts lines are the pre-existing
pinned ones; position-normalized line comm proves the SET is identical).

### 4. App tsc pin (34 lines, set-identity)

Pristine HEAD: 34 lines. With fixes: 34 lines.
```
comm -3 (file sets)            → EMPTY
comm -3 (position-normalized)  → EMPTY
```
No PB-CH-8-touched file carries an error (all error files are untracked cl-lane-sync copies).

### 5. Suite FAIL-set parity (stash dance)

Pristine HEAD targeted run: `Test Files 16 passed (16) / Tests 166 passed (166)`, FAIL files: 0.
With fixes: 16/172, FAIL files: 0. `comm -3` of FAIL-file lists: EMPTY.
`cd server && npx vitest run src/ai` (AgentOrchestrator.ts + server.ts were touched): 10 failed
files — the SAME claim-time 10-file set recorded in the wip report verification 3
(bypass, Forwarding, golden, goldenWithSeeds, tubeGate, ChatbotCompileDeckSlot,
chatbotCompile.e2e, InferenceClient.config, materialFollowUp, submitSuggestionTool.tubeSchema).
`cd app && npx vitest run src/event-editor/right-pane/ai`: 3 failed files (draftChanges,
ParameterAnswerInput, useChatThread.deckLayout — the same pre-existing untracked lane-sync set),
220 tests passed (219 at HEAD + the new green test). NO new failing file.

### 6. Frozen seams — ZERO hunks

`git -c core.fileMode=false diff --stat 43cddb26...HEAD -- server/src/workspace-session/WorkspaceSessionStore.ts schema/workflow/lab-session.schema.yaml app/src/shared/session/useSessionSync.ts app/src/shared/ai/useWorkstateProposalFlow.ts schema/workflow/workstate-intent.schema.yaml schema/workflow/agent-action.schema.yaml` → empty; working-tree diff of the same list → 0 lines.

### 7. Scope

Fix-cycle changed files (9, all already on the item's allowed list — no new paths):
- server/src/ai/AgentOrchestrator.ts (defect 1)
- server/src/ai/AgentOrchestrator.ledger.test.ts (defect 1 tests)
- server/src/workspace-session/ledgerQuery.ts (defects 2, 3)
- server/src/workspace-session/ledgerQuery.test.ts (defects 2, 3, 4 tests + fixture)
- server/src/workspace-session/WorkstateJournal.ts (defect 3 policy field + accessor)
- server/src/workspace-session/WorkstateJournal.test.ts (fixture)
- schema/workflow/workstate-journal.policy.yaml (defect 3 data)
- server/src/server.ts (defect 4 host spine)
- app/src/event-editor/right-pane/ai/useChatThread.ledger.test.tsx (defect 1 visibility test)

`git -c core.fileMode=false diff --stat 43cddb26...HEAD` after the fix commit: the same
code/test/policy scope as before plus this report (29 prior paths + 1 report = 30; the prior
29 = 25 code/test/policy + 4 docs), updated line counts; no new path outside the spec's
allowed list. Staged by path only; lane scaffolding (lane-sync copies, node_modules,
server/model.pkl) never staged. No :3001/:5174 touch, no lane-stack restart, no worktree/branch
created.

## Assumptions recorded

- Defect 1 severity/outcome choice ('gap' + 'error' + pass_id 'ledger-query') mirrors the
  workspace_action compile-refusal precedent, as the fix direction prescribed.
- Defect 2 chose the reviewer's named-diagnostic direction (no record-editor surface exists
  in the shipped registry; deriving via record objectType would either fail the same way or
  guess the non-deep-linkable `knowledge` surface). The honest consequence — record-edit
  snapshots refuse until a record-editor surface is registered — is stated above for the
  browser gate's fixture planning.
- Defect 3 chose policy data over documentation, per "things that can be data should be data".
- Defect 4 chose the code fix over the report correction; the OQ1b claim in the wip report is
  now accurate against the fixed code (this report supersedes it).

PB-CH-8 FIX RUN DONE
