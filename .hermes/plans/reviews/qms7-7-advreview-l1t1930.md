# ADVERSARIAL REVIEW — QMS7-7 (lane 1, resume) — advreview-l1t1930

Item: QMS7-7 "AI-proposed draft training document for human review (universal panel)".
Candidate: /mnt/vast/home/brad/git/wt/QMS7-7-lane1-l1t1500 · branch wt/QMS7-7-lane1-l1t1500 · base c5d76fed · final code sha b08760411e5d3566fffd2306b72216dc596872f0.
Spec: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-16_QMS7-7-ai-training-draft-spec.md (rulings OQ-1 A / OQ-2 / OQ-3; treated as binding).
Diff read in full: `git -c core.fileMode=false diff c5d76fed..b0876041` (27 files, +2049/-13). Every hunks-bearing file read.

## VERDICT: fix

No P0/P1 defect. All ten mandatory suspicion pins PASS, both touched suites pass, server typecheck is clean, app typecheck has zero new errors. Four P2 (minor) defects are reported below; none blocks the feature or the browser gate. This is a "fix the minors" verdict, not a "reject the approach" verdict.

---

## 1. Mandatory pins — commands and raw output

### PIN 1 — adapters.yaml: exactly four blocks, one new
```
$ grep -E "^  [a-z-]+:" config/drafting/adapters.yaml
  sequence-authoring:
  workstate:
  analysis:
  record-drafting:
```
PASS. Exactly one new block (`record-drafting: {domain: registry-records, operations: [compose-record], projection: {}}`), matching the sanctioned OQ-1 shape. No other YAML touched (diff confirms config/drafting/adapters.yaml is the only YAML file in the diff).

### PIN 2 — useWorkstateProposalFlow.ts: only union + recordFields
```
$ git -c core.fileMode=false diff -U0 c5d76fed..HEAD -- app/src/shared/ai/useWorkstateProposalFlow.ts | grep -E "^[+-]" | grep -vE "^(\+\+\+|---)"
+  WorkstateCardRecordField,
- *  at the call site, never a second flow. */
-export type WorkstateAdapter = 'workstate' | 'analysis'
+ *  at the call site, never a second flow.
+ *  QMS7-7 (OQ-1 ruling A): 'record-drafting' joins the union — the ONLY
+ *  acceptable diff in this file; the flow body is untouched (shared machinery,
+ *  not a fork). */
+export type WorkstateAdapter = 'workstate' | 'analysis' | 'record-drafting'
+  /** QMS7-7: the compiled record proposal's field list (presentational mirror
+   *  of the card prop; absent unless the compile result carries recordFields). */
+  recordFields?: WorkstateCardRecordField[]
+          recordFields?: unknown
+        // QMS7-7: the compiled record field list (server-built from the ui-v1
+        // projection) rides into the card state verbatim — absent unless the
+        // compile result actually carries it (exactOptionalPropertyTypes).
+        const recordFields = Array.isArray(result.recordFields) ? (result.recordFields as WorkstateCardRecordField[]) : undefined
+          ...(recordFields ? { recordFields } : {}),
```
PASS. The only added lines are: the `WorkstateCardRecordField` type import, the union widening, the `recordFields?` optional on `WorkstateProposalCardState`, the `recordFields?: unknown` on the local result cast, and the conditional spread in the compile `setCard`. `proposeWorkstate` control flow, `acceptWorkstate`, `rejectWorkstate`, `pendingDraftRef`, `compileSeqRef` and identity handling are byte-untouched (no hunks at their lines). This is exactly the union widening + recordFields optional/spread that PIN 2 permits.

### PIN 3 — fork detector: exactly two files, no second flow/pending-ref/card
```
$ grep -rln compileWorkstateDraft app/src | grep -v test
app/src/shared/api/client.ts
app/src/shared/ai/useWorkstateProposalFlow.ts
$ grep -rn "pendingDraftRef" app/src --include='*.ts' --include='*.tsx' | grep -v '\.test\.'
app/src/shared/ai/useWorkstateProposalFlow.ts:84  (definition — the ONE ref)
app/src/shared/ai/useWorkstateProposalFlow.ts:97,105,152,165,187
$ git -c core.fileMode=false diff --name-only --diff-filter=A c5d76fed..b0876041 | grep -iE "card|proposal"
app/src/event-editor/right-pane/ai/WorkstateProposalCard.recordFields.test.tsx
app/src/shared/hooks/useAiChat.recordDraftProposal.test.tsx
server/src/ai/AgentOrchestrator.recordDraftProposal.test.ts
```
PASS. Exactly the two allowed files (flow + transport). One `pendingDraftRef`; one `useWorkstateProposalFlow` definition. The only added files matching card/proposal are TEST files — no new card component, no second pending-ref.

### PIN 4 — no hardcode in scope
```
$ grep -rn "TRM-\|training-material" server/src/drafts app/src/shared/ai --include='*.ts' --include='*.tsx' | grep -v "\.test\."
PIN4_rc=1        # zero hits
```
PASS. Kind→schema resolution reads `properties.kind.const` over the loaded corpus (`schemaForKind`, recordDraftCompile.ts:136-142). The id prefix is parsed from the schema's declared `properties.id.pattern` (`declaredIdPrefix`, :148-153 — regex `^\^([A-Z]+)-`), not a prefix table. Card labels/options come from the loaded ui-v1 projection (:272-300); the select value is rendered with the ui option label. No `kind→schema` map, no prefix table, no `materialType` list in these dirs.
(Observation, not a defect: server/src/ai/submitSuggestionTool.ts contains the words `training-material` / `materialType` inside the model-guidance description string of the `recordDraft` tool property. That is a doc string outside the PIN-4 dirs and is the spec-sanctioned place for the envelope + description. Recorded for completeness.)

### PIN 5 — trust boundary
The orchestrator arm (AgentOrchestrator.ts, new block at ~:2671-2741) is a pure relay: on `agentIntent.intent === 'compose_record_draft'` it (a) with no `recordDraft` envelope emits `tool_result success:false` + a corrective `error` string and NO `record_draft_proposal` event, or (b) with an envelope emits ONE `{type:'record_draft_proposal', recordDraft}` with the object BY REFERENCE (no clone, no filter, no compile) and returns. It imports/calls no `FormDraftService`, no draftRoutes, no store.
```
$ grep -n "FormDraftService\|draftRoutes\|/drafts/compile" server/src/ai/AgentOrchestrator.ts
  ... only COMMENT lines mentioning "POST /api/drafts/compile" (2521, 2597, 2675, 2676, 2695)
```
The test `AgentOrchestrator.recordDraftProposal.test.ts` proves zero writes with a store whose `create/update/delete` THROW (`mutationTripwire`), asserting `store.create/update/delete` never called, and asserts the emitted `recordDraft` deep-equals the model envelope and has no `sessionDocument`/`canAccept`. PASS.
State-literal leak: `RecordDraftAdapter.test.ts` AC-4 (:226-235) asserts `payload.state` is `undefined`, `payload.status` undefined, `lifecycleId` equals the schema's declared const, and the lifecycle read fallback (`state ?? status ?? 'draft'`) yields `'draft'`. AC-5 (:269-283) compiles a smuggling intent (`state:'approved', lifecycleId:'registry-ops'`), asserts `canAccept:false`, `writes.length===0`, accept rejects with `DraftError /blocked/`, and zero training-material records persist. These are real behavioural assertions, not snapshots. PASS.

### PIN 6 — ownership deltas / client.ts type-only
`client.ts` diff hunks read in full: the ONLY changes are `adapter: 'workstate' | 'analysis'` → `| 'record-drafting'` and the compile-result type `result?: { ...; recordFields?: unknown }`. Zero executable statements changed. PASS.
Deltas judged (coder A1/A2): see §4 below — each is forced by a preserved RED test or the typecheck; none is a fork or a semantic change.

### PIN 7 — golden-menu pins
All five pin files diffed. Each change is ONLY the enum-width widening (+`'compose_record_draft'`) / the golden array extended by one element. No assertion weakened, no other line changed:
- submitSuggestionTool.test.ts: the `toEqual([...])` intent enum list gained one trailing `'compose_record_draft'`.
- submitSuggestionTool.analysis.test.ts / .protocolEdit.test.ts / .workstate.test.ts: each expected menu array gained the item.
- AgentOrchestrator.shorthandChat.test.ts: expected menu array gained the item.
PASS.

### PIN 8 — exactOptionalPropertyTypes conditional spreads
- Flow (useWorkstateProposalFlow.ts): `...(recordFields ? { recordFields } : {})` in the compile `setCard`.
- AiTabPanel.tsx: `{...(flow.card.recordFields ? { recordFields: flow.card.recordFields } : {})}` on the card JSX.
No bare `recordFields: undefined`. Server typecheck exit 0 and app typecheck zero-new corroborate. PASS.

### PIN 9 — tests are real
- `AgentOrchestrator.recordDraftProposal.test.ts`: asserts one verbatim event `toEqual(RECORD_DRAFT)`, absence of `sessionDocument`/`canAccept`, tool_result success, result notes; a mutation-tripwire store proving zero writes; an invalid envelope still emitted verbatim; the no-envelope path emits NO proposal event and `success:false`. Behavioural. PASS.
- `RecordDraftAdapter.test.ts`: compile→accept lifecycle, zero pre-accept persistence, exact-one accepted envelope, no `state`/`status`, schema-const `lifecycleId`, OQ-2 provenance, Ajv rejection of smuggled state/lifecycleId, malformed-intent matrix, deterministic max+1 id, repeat-accept idempotence. Behavioural. PASS.
No production code is stubbed; tests inject dependencies (validator/store/uiSpecLoader) or mock the transport, per the spec's worker-contract AI-model caveat.

### PIN 10 — suites (run by me, verbatim tails)

Server:
```
$ cd /mnt/vast/home/brad/git/wt/QMS7-7-lane1-l1t1500/server && npx vitest run src/drafts src/ai/AgentOrchestrator.recordDraftProposal.test.ts src/ai/submitSuggestionTool.test.ts
 ✓ src/ai/submitSuggestionTool.test.ts  (17 tests) 12ms
 ✓ src/drafts/workstateCompile.test.ts  (17 tests) 1249ms
 ✓ src/ai/AgentOrchestrator.recordDraftProposal.test.ts  (7 tests) 45ms
 ✓ src/drafts/analysisCompile.test.ts  (16 tests) 1596ms
 ✓ src/drafts/RecordDraftAdapter.test.ts  (9 tests) 2052ms
 ✓ src/drafts/WorkstateDraftAdapter.test.ts  (13 tests) 2629ms
 ✓ src/drafts/FormDraftService.test.ts  (10 tests) 2790ms
 ✓ src/drafts/AnalysisDraftAdapter.test.ts  (11 tests) 2897ms
 Test Files  8 passed (8)
      Tests  100 passed (100)
```
App:
```
$ cd /mnt/vast/home/brad/git/wt/QMS7-7-lane1-l1t1500/app && npx vitest run src/event-editor/right-pane/ai/assistStream.recordDraft.test.ts src/shared/hooks/useAiChat.recordDraftProposal.test.tsx src/event-editor/right-pane/ai/WorkstateProposalCard.recordFields.test.tsx src/event-editor/right-pane/ai/AiTabPanel.recordDraft.test.tsx src/shared/ai/useWorkstateProposalFlow.test.tsx
 ✓ src/event-editor/right-pane/ai/assistStream.recordDraft.test.ts  (3 tests) 19ms
 ✓ src/event-editor/right-pane/ai/WorkstateProposalCard.recordFields.test.tsx  (4 tests) 52ms
 ✓ src/shared/hooks/useAiChat.recordDraftProposal.test.tsx  (3 tests) 175ms
 ✓ src/shared/ai/useWorkstateProposalFlow.test.tsx  (16 tests) 844ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.recordDraft.test.tsx  (7 tests) 291ms
 Test Files  5 passed (5)
      Tests  33 passed (33)
```
Extra pin test I ran (union-drift guard): `src/types/aiStreamTypes.pin.test.ts` (6) + card block (4) → 2 files / 10 tests passed.
PASS. I did NOT contact or restart the lane stack (:3092/:5192).

### typecheck (my own runs)
```
$ cd .../server && npm run typecheck        → tsc --noEmit   → exit 0   (SERVER_TYPECHECK_EXIT=0)
$ cd .../app    && npm run typecheck        → 23 errors (see below)
```
App has 23 pre-existing errors on this working tree. To rule out "new errors" I built a faithful base tree (git worktree at c5d76fed + the 58 ignored on-disk files that exist only in the candidate worktree — the app's tsc resolves ignored files such as `draftChanges.ts`, `useChatThread.deckLayout.test.tsx`; a plain `git worktree add` base is NOT a faithful baseline and mis-reports "Cannot find module"):
```
base (c5d76fed, faithful): 23 errors
HEAD (b0876041):           23 errors
comm -13 base HEAD (NEW):  <empty>
comm -23 base HEAD (REMOVED): <empty>
```
Zero new type errors; none of the 23 is in a file the diff touches. (The coder's report claims 34→23; my count 23→23 differs in absolute baseline but reaches the same conclusion — zero new, all in untouched files.) The spec's "app baseline: 0 type errors" note is stale; the trunk carries ~23, none introduced here.

---

## 2. Acceptance-criteria coverage (spec matrix) — how I checked each

- AC-1 (prompt yields a card with valid training-material fields; ui-v1 labels, not literals): `RecordDraftAdapter.test.ts` AC-1 asserts `canAccept:true`, id matches `^TRM-…`, and label/value pairs match `training-material.ui.yaml` labels including the select option label ("Slide Deck" for `slide_deck`). Flow/AiTabPanel tests assert the card shows the fields and `DRAFT-…` chrome. Verified by run.
- AC-2 (no record before accept; compile fires no extra POSTs): `RecordDraftAdapter.test.ts` AC-2 asserts `writes.length===1`, and the backing store `get(seedId) → null` with zero training-material records. Flow test asserts one compile call. Verified.
- AC-3 (reject → nothing persisted): AC-3 fingerprint-identical canonical set; flow test asserts reject = `card===null`, zero accept fetches. Verified.
- AC-4 (accept → exactly one draft record with attribution; no `state` field; lifecycle reads 'draft'): `RecordDraftAdapter.test.ts` AC-4 asserts exactly one training-material envelope, `payload.state`/`status` undefined, `lifecycleId` == schema const, lifecycle read 'draft', handler-identical provenance, form-draft retained `status:'accepted'` + actor + verbatim intent, repeat-accept idempotent. Verified.
- AC-5 (approval/signature/locked edits fail honestly): AC-5 smuggling test (above). Verified.
- AC-6 (invalid output → no partial record): AC-6 five malformed intents → `canAccept:false`, `writes.length===0`, canonical fingerprint unchanged. Verified.
- AC-7 (cl-browser-reviewer VERDICT): NOT my layer — orchestrator's :5192 gate. I did not run it (no stack access per instructions). Flagged as unverified by me.

---

## 3. Defects (numbered)

All P2 (minor). No P0/P1.

D1 — P2 — `server/src/drafts/recordDraftCompile.ts:345-348` — dead code + misleading comment.
```
/** Source-pin helper for tests: the envelope's staged envelope shape. */
export function recordDraftEnvelopeShape(envelope: RecordEnvelope): { recordId: string; schemaId: string } {
  return { recordId: envelope.recordId, schemaId: envelope.schemaId };
}
```
`grep -rn "recordDraftEnvelopeShape" server app` (excluding node_modules) returns ONLY this definition — no production caller and, despite the comment, no test imports it. It is an unused export whose docstring wrongly asserts a test consumer exists. Rule: no dead/misleading code paths in a reviewed diff. Remedy direction: delete the function (and its now-unused `RecordEnvelope` type import if it becomes unused), OR add the source-pin test the comment claims — but do not leave an orphan export with a false comment.

D2 — P2 — `server/src/drafts/recordDraftCompile.ts:324-328` — hardcoded tab-kind literal `'registry'` in TS.
The compiled landing document is `{ version:1, tabs:[{kind:'registry', title}], activeTabId:'registry' }`. The sibling `workstate` adapter derives its tab kinds from DECLARATIVE data (`config/drafting/workstate-tab-kinds.yaml`), and the spec's bait-1/AS-ORCH-L1-122 discipline is "derive, never a literal table". `'registry'` is a surface/tab-kind string embedded in product code where the house pattern is DATA. It is documented by the coder as a residue (the record-edit landing would require a workstate-tab-kinds.yaml entry, a YAML demand outside the sanctioned one-block un-freeze), so it is not a schema-name/kind table and the feature cannot be "faked" by it — hence P2, not the hard reject boundary. Remedy direction: move the landing tab kind to declarative data (a config/data entry) in a follow-up item, or have the orchestrator explicitly sign off the residue in the handoff. Consequence to state plainly: accepting the proposal does NOT open the created record; it re-focuses the `registry` surface, so the spec's browser-step "opened readback" is performed by the human, not the card.

D3 — P2 — missing component pin for silent-retarget (spec Design item 5(a) / reviewer-bait 3).
The spec asks to "pin with a component test copying the RecordRegistryPage :165-176 activeTab-keyed-reset pattern" that a pending proposal does not silently re-target on a registry tab/selection switch. The diff provides only the SERVER-side path pin (`useWorkstateProposalFlow.test.tsx:320-334` — the 409 "Draft target changed" surfaces as a blocked card with no accept). No tab-switch/re-target component test exists (grep for retarget/activeTab in the QMS7-7 test files finds only fixtures). The behaviour is plausibly safe (the flow is keyed to the compiled draft; the server 409s a target change), but the spec asked for the pin and it is absent, so the criterion is unexercised. Remedy direction: add the activeTab-keyed reset/preserve component test the spec names (assert the pending card is preserved verbatim or cleared, never re-targeted).

D4 — P2 — envelope shape declared twice (drift risk), `server/src/drafts/recordDraftCompile.ts:112-124` vs `server/src/ai/submitSuggestionTool.ts` `recordDraft` property.
The compile side validates the intent against an inlined `RECORD_DRAFT_ENVELOPE_SCHEMA` (`additionalProperties:false`, `required:[operation,kind,fields]`), while the model-facing tool-def `recordDraft` property is a looser JSON shape (`operation`/`kind`/`fields`, no `required`, no `additionalProperties:false`). Two authorities for the same contract can drift; the tool def is decorative for validation. This is NOT an Ajv bypass (the compile side uses real Ajv via `validateWithSchema` — `AjvValidator.validateWithSchema` calls `this.ajv.validate(schema, data)`; I read it), and an over-required model payload is rejected honestly at compile (MALFORMED_ENVELOPE). Remedy direction: derive one from the other, or add a lockstep test asserting the tool-def properties equal the compile-side envelope's, so they cannot drift.

---

## 4. Ownership deltas (coder Assumptions A1/A2) — adjudication

- `app/src/event-editor/right-pane/ai/assistStream.ts` (+20/-…): the SSE wire-shape authority — union member + `case 'record_draft_proposal'` with an object-guard that DROPS a malformed frame. The `analysis_proposal` precedent lives in this same file. Forced by the preserved `assistStream.recordDraft.test.ts`. Minimal. ACCEPT.
- `app/src/event-editor/right-pane/ai/useChatThread.ts` (+24): the /registry mount's chat hook (`onAnalysisProposal` lives here). One optional callback + one `case` mirroring the analysis case, with the never-break-the-turn wrapper and the dep-array entry. Forced by `AiTabPanel.recordDraft.test.tsx`. Minimal. ACCEPT.
- `app/src/shared/api/client.ts` (+13): TYPE widening only (adapter union + `recordFields?: unknown`). Zero behaviour. ACCEPT.
- `app/src/event-editor/right-pane/ai/WorkstateProposalCard.css` (+19): styles for the new presentational block, theme tokens, light+dark. Presentational. ACCEPT.
- `useWorkstateProposalFlow.ts` beyond-union (A2): the `recordFields?` card-state mirror + one conditional spread, explicitly permitted by PIN 2 and forced by the preserved flow test "the compiled recordFields ride into the card state". ACCEPT.
All five are inside the AI/drafts/proposal surface the spec's BRANCH ANCHOR RULING assigns to QMS7-7, and none is a `schema/**`, `RecordRegistryPage.tsx`, or other-surface file. `FormDraftService.ts` has ZERO hunks (the generic adapter gate rode it), confirming no adapter-name branch was added.

---

## 5. Limitations of this review

- AC-7 (browser gate at :5192) is the orchestrator's; I did not run it and did not touch the lane stack. Consequently the live end-to-end lap, the SSE relay from a real model turn, and the adapters.yaml-after-restart behaviour are unverified by me.
- My app-tsc baseline used a reconstructed faithful base worktree (base commit + the candidate's 58 git-ignored on-disk files). Absolute counts depend on those ignored files; the zero-new result is robust because none of the 23 errors is in a diff-touched file.
- Suite runs were the two families the task named, plus the union-drift pin test; I did not run the full monorepo suite.

## 6. Commands run (index)
- `git -c core.fileMode=false diff --stat c5d76fed..b0876041`
- `git -c core.fileMode=false diff c5d76fed..b0876041 -- <each file>`
- `git -c core.fileMode=false diff -U0 c5d76fed..HEAD -- app/src/shared/ai/useWorkstateProposalFlow.ts`
- `grep -E "^  [a-z-]+:" config/drafting/adapters.yaml`
- `grep -rln compileWorkstateDraft app/src | grep -v test`
- `grep -rn "TRM-\|training-material" server/src/drafts app/src/shared/ai --include='*.ts' --include='*.tsx' | grep -v "\.test\."`
- `grep -rn pendingDraftRef|recordDraftEnvelopeShape|compose-record …`
- `cd server && npx vitest run src/drafts src/ai/AgentOrchestrator.recordDraftProposal.test.ts src/ai/submitSuggestionTool.test.ts`
- `cd app && npx vitest run <5 named files>` ; `cd app && npx vitest run src/types/aiStreamTypes.pin.test.ts ...`
- `cd server && npm run typecheck` ; `cd app && npm run typecheck`
- base-vs-HEAD tsc: `git worktree add --detach /tmp/qms77-base c5d76fed` (+ sync ignored files), `npx tsc --noEmit` both trees, `comm`.

Adversarial gate complete — no P0/P1; four P2s; all ten pins pass. Report: this file.
