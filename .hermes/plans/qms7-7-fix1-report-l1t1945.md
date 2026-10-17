# QMS7-7 CODER FIX RUN — fix1 (lane 1) — adversarial cycle 1

Item: QMS7-7 "AI-proposed draft training document for human review (universal panel)".
Worktree: /mnt/vast/home/brad/git/wt/QMS7-7-lane1-l1t1500 · branch wt/QMS7-7-lane1-l1t1500 · base c5d76fed.
Review fixed against: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/reviews/qms7-7-advreview-l1t1930.md (VERDICT: fix, four P2, no P0/P1, all ten pins PASS).
Spec (binding, un-relitigated): /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-16_QMS7-7-ai-training-draft-spec.md.

## Commits (this fix run, in order)

| sha40 | defect | files |
|---|---|---|
| c7bf068e3caea5e477e1b9be1dc0114f86961e65 | D1 | server/src/drafts/recordDraftCompile.ts |
| 237418ea602e51c0352687d0929589c17004f9c1 | D2 | config/drafting/adapters.yaml · server/src/drafts/recordDraftCompile.ts · server/src/drafts/recordDraftCompile.landing.test.ts (new) |
| 6fd3bc33a12bd06e17fb9f0be33f765627e7d9b1 | D4 | server/src/drafts/recordDraftCompile.ts · server/src/ai/submitSuggestionTool.ts · server/src/drafts/recordDraftEnvelopeLockstep.test.ts (new) |
| a68e661594faba7bedde55a97354e7b8fb89fa65 | D3 | app/src/event-editor/right-pane/ai/AiTabPanel.recordDraft.retarget.test.tsx (new) |

Production-code tip: 6fd3bc33a12bd06e17fb9f0be33f765627e7d9b1. Tree tip (incl. the D3 test pin): a68e661594faba7bedde55a97354e7b8fb89fa65.

## D1 — dead code + misleading comment (P2) — FIXED by deletion

`recordDraftEnvelopeShape` had no production caller and no test consumer (the review's
`grep -rn "recordDraftEnvelopeShape" server app` returned only the definition; re-verified
here — post-fix grep count over server/src + app/src is 0). Remedy chosen: DELETE the
function and the now-unused `RecordEnvelope` type import (the import line narrowed to
`import type { RecordStore } from '../store/types.js';`). No orphan export, no false comment.

## D2 — hardcoded landing tab-kind literal (P2) — FIXED declaratively (orchestrator ruling followed)

First-hand inspection of the loader machinery (FormDraftService.ts:32 `adapters()` parses
`config/drafting/adapters.yaml` per call into `{adapters:Record<string,AdapterSpec>}`;
workstateCompile.ts:105-138 `loadWorkstateTabKindMapping()` and analysisCompile.ts:128-137
`loadAnalysisCompositionPolicy()` are the per-call-file precedent) showed extending the
record-drafting block is NOT impossible: the YAML is parsed generically, so a `landing:`
sub-key rides the same file with zero loader redesign. Implemented exactly as ruled:

- config/drafting/adapters.yaml — the record-drafting block gains
  `landing: {tabKind: registry}` (with the DATA comment naming the lab-session enum as the
  tab-kind authority). Zero new YAML files, zero new top-level blocks. PIN re-verified:
  `grep -E "^  [a-z-]+:" config/drafting/adapters.yaml` →
  `sequence-authoring: / workstate: / analysis: / record-drafting:` — exactly four (AS-ORCH-L1-132).
- server/src/drafts/recordDraftCompile.ts — new exported
  `loadRecordDraftLandingTabKind(): string | null` reads the block's `landing.tabKind` from
  the SAME adapters.yaml path per call (no process cache, per the file's own YAML-reload
  discipline). The compile now derives the landing document from it:
  `tabs: [{ kind: landingTabKind, title }], activeTabId: landingTabKind`. The TS literals
  `'registry'` are GONE (source-pin test asserts `not.toMatch(/kind:\s*'registry'/)` and
  `not.toMatch(/activeTabId:\s*'registry'/)`).
- Honest failure: an absent `landing:` key (or absent block) returns null and the compile
  fails with a NEW named diagnostic `LANDING_TAB_KIND_UNDECLARED` at path `/landing`,
  BEFORE any staging write — the compiler never defaults a surface. The check sits ahead of
  the staged create so the failure writes nothing.
- New test server/src/drafts/recordDraftCompile.landing.test.ts (4 tests): loader equals the
  YAML value; the compiled sessionDocument's tab kind + activeTabId equal the YAML value;
  the source-pin; and the honest-fail path (a doctored adapters.yaml served through a
  path-scoped `vi.mock('node:fs')` — every other fs read rides the real module) asserting
  `LANDING_TAB_KIND_UNDECLARED`, `/landing`, and `writes.length === 0`.

Teeth proof (mutation, reverted): with the real YAML key deleted, `RecordDraftAdapter.test.ts`
fails 7 tests with `LANDING_TAB_KIND_UNDECLARED /landing: ... expected false to be true` —
the data path is load-bearing, not decorative. YAML restored; `git status` clean.

Residue unchanged and still recorded: the record-EDITOR landing for record kinds remains a
workstate-tab-kinds.yaml DATA entry — a YAML demand outside this item's sanctioned one-block
un-freeze. Consequence unchanged: accepting re-focuses the declared landing surface; the
"opened readback" is performed by the human.

## D3 — missing silent-retarget component pin (P2) — FIXED (test added)

New app/src/event-editor/right-pane/ai/AiTabPanel.recordDraft.retarget.test.tsx (3 tests),
the component test the spec's Design item 5(a) / reviewer-bait 3 names, copying the
RecordRegistryPage :165-176 activeTab-keyed discipline onto the pending proposal:
1. a workspace `activateTab` switch (the provider's own machinery, reducer 'activate-tab')
   PRESERVES the pending record-draft card VERBATIM — same DOM node (`toBe(cardBefore)`),
   same text, identity chrome `DRAFT-77`, summary, `workstate-card-record-fields` values,
   landing tabs — with ZERO new compiles, ZERO accepts, ZERO executor calls;
2. the preserved card's Accept stays bound to the ORIGINAL compiled identity triple
   ({draftId DRAFT-77, revision 1, reviewHash e×64}) after the switch;
3. the card's landing tab stays the compiled registry landing — it never adopts the newly
   active tab as its target.

Harness: the AiTabPanel.recordDraft.test.tsx precedent (option-capturing useChatThread mock,
mocked apiClient store, OpenTabsProvider + SyncMount mount order) plus a WorkspaceProbe that
captures the provider's `activateTab`.

RED-first note (honest): this pin PASSES at the fix base — the behaviour it guards was
already safe (the flow is keyed to the compiled draft; the server 409s a target change). The
defect was the ABSENT pin, so the deliverable is the pin itself. Its teeth were proven by
mutation: an injected tab-keyed re-propose effect in AiTabPanel.tsx (the exact defect shape)
made 2 of the 3 tests fail with `expected "spy" to be called 1 times, but got 2 times`; the
mutation was reverted (AiTabPanel.tsx diff empty, never committed).

## D4 — envelope shape declared twice / drift risk (P2) — FIXED with a lockstep pin

- server/src/drafts/recordDraftCompile.ts — `RECORD_DRAFT_ENVELOPE_SCHEMA` is now EXPORTED
  as the single authority (comment records why). The schema itself is UNCHANGED —
  `additionalProperties:false`, `required:['operation','kind','fields']` — never weakened.
- server/src/ai/submitSuggestionTool.ts — the model-facing `recordDraft` tool-def property
  gains `additionalProperties: false` and `required: ['operation','kind','fields']`, so the
  model-facing contract can no longer be looser than the compile-side Ajv authority.
- New test server/src/drafts/recordDraftEnvelopeLockstep.test.ts (7 tests) pins: identical
  `required` on both sides; `additionalProperties:false` on both sides; every tool-declared
  property exists in the envelope with the same structural type; the envelope carries NO
  extra property beyond the compiler-injected `requestId` (the workstate-intent precedent);
  the verb is the same closed vocabulary (envelope `const:'compose-record'` vs tool
  `enum:['compose-record']`); kind/fields shapes match.

RED captured verbatim before the fix (the test written first):
```
 FAIL  src/drafts/recordDraftEnvelopeLockstep.test.ts > ... > required keys are IDENTICAL on both sides (no looser model-facing contract)
 FAIL  src/drafts/recordDraftEnvelopeLockstep.test.ts > ... > additionalProperties:false on BOTH sides — neither side accepts smuggled keys
AssertionError: expected undefined to be false // Object.is equality
 FAIL  src/drafts/recordDraftEnvelopeLockstep.test.ts > ... > every tool-declared property exists in the compile-side envelope with the same structural type
 FAIL  src/drafts/recordDraftEnvelopeLockstep.test.ts > ... > the envelope carries NO extra properties beyond the compiler-injected requestId
 FAIL  src/drafts/recordDraftEnvelopeLockstep.test.ts > ... > the verb is the same closed vocabulary on both sides (const vs single-value enum)
 FAIL  src/drafts/recordDraftEnvelopeLockstep.test.ts > ... > kind and fields shapes match on both sides
 Test Files  1 failed (1)
      Tests  6 failed | 1 passed (7)
```
(The import of the not-yet-exported schema also surfaced `TS2459 ... declares
'RECORD_DRAFT_ENVELOPE_SCHEMA' locally, but it is not exported` — the RED signal that the
authority was unreachable for pinning.)

## Re-run verification (verbatim tails)

Server — `cd server && npx vitest run src/drafts src/ai/AgentOrchestrator.recordDraftProposal.test.ts src/ai/submitSuggestionTool.test.ts`:
```
 ✓ src/ai/submitSuggestionTool.test.ts  (17 tests) 14ms
 ✓ src/drafts/recordDraftEnvelopeLockstep.test.ts  (7 tests) 4ms
 ✓ src/drafts/recordDraftCompile.landing.test.ts  (4 tests) 19ms
 ✓ src/drafts/workstateCompile.test.ts  (17 tests) 613ms
 ✓ src/drafts/analysisCompile.test.ts  (16 tests) 965ms
 ✓ src/drafts/RecordDraftAdapter.test.ts  (9 tests) 1194ms
 ✓ src/drafts/WorkstateDraftAdapter.test.ts  (13 tests) 1968ms
 ✓ src/ai/AgentOrchestrator.recordDraftProposal.test.ts  (7 tests) 33ms
 ✓ src/drafts/FormDraftService.test.ts  (10 tests) 2129ms
 ✓ src/drafts/AnalysisDraftAdapter.test.ts  (11 tests) 2150ms
 Test Files  10 passed (10)
      Tests  111 passed (111)
```
(the review's 8 files / 100 tests + the 2 new suites = 10 files / 111 tests; zero prior test lost)

App — `cd app && npx vitest run src/shared/ai/useWorkstateProposalFlow.test.tsx src/event-editor/right-pane/ai`:
```
 ✓ src/event-editor/right-pane/ai/AiTabPanel.recordDraft.retarget.test.tsx  (3 tests) 653ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.recordDraft.test.tsx  (7 tests) 643ms
 ✓ src/event-editor/right-pane/ai/WorkstateProposalCard.recordFields.test.tsx  (4 tests) 72ms
 ✓ src/event-editor/right-pane/ai/assistStream.recordDraft.test.ts  (3 tests) 19ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.analysis.test.tsx  (6 tests) 711ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.workstate.test.tsx  (14 tests) 1249ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.test.tsx  (15 tests) 896ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.protocolEdit.test.tsx  (9 tests) 1113ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.ledgerTurn.test.tsx  (5 tests) 260ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.chatCorpus.test.tsx  (3 tests) 601ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.runPageSurface.test.tsx  (7 tests) 800ms
 ✓ src/event-editor/right-pane/ai/AiTabPanel.shorthandClarification.test.tsx  (2 tests) 702ms
 ✓ src/event-editor/right-pane/ai/ChangesPanel.test.tsx  (19 tests) 341ms
 ✓ src/event-editor/right-pane/ai/ChangesPanel.styling.test.tsx  (5 tests) 307ms
 ✓ src/event-editor/right-pane/ai/ClarificationPicker.test.tsx  (12 tests) 1794ms
 ✓ src/event-editor/right-pane/ai/WorkstateProposalCard.test.tsx  (5 tests) 121ms
 ✓ src/event-editor/right-pane/ai/WorkstateProposalCard.recordFields.test.tsx  (4 tests) 72ms
 ✓ src/event-editor/right-pane/ai/QuestionsPanel.test.tsx  (8 tests) 333ms
 ✓ src/event-editor/right-pane/ai/TermPanel.test.tsx  (9 tests) 377ms
 ✓ src/event-editor/right-pane/ai/MessageLog.batching.test.tsx  (7 tests) 166ms
 ✓ src/event-editor/right-pane/ai/MessageLog.intent.test.tsx  (5 tests) 47ms
 ✓ src/event-editor/right-pane/ai/RunInEventEditorButton.test.tsx  (5 tests) 87ms
 ✓ src/event-editor/right-pane/ai/InterpretationPanel.test.tsx  (3 tests) 98ms
 ✓ src/event-editor/right-pane/ai/SourcesStrip.test.tsx  (5 tests) 151ms
 ✓ src/event-editor/right-pane/ai/ChatContextHeader.test.tsx  (3 tests) 42ms
 ✓ src/event-editor/right-pane/ai/chatReducer.test.ts  (11 tests) 10ms
 ✓ src/event-editor/right-pane/ai/chatReducer.ledgerTrace.test.tsx  (3 tests) 96ms
 ✓ src/event-editor/right-pane/ai/chatReducer.actionTrace.test.tsx  (2 tests) 84ms
 ✓ src/event-editor/right-pane/ai/sidebarState.test.ts  (20 tests) 11ms
 ✓ src/event-editor/right-pane/ai/assistStream.test.ts  (11 tests) 19ms
 ✓ src/event-editor/right-pane/ai/assistStream.ledger.test.ts  (5 tests) 20ms
 ✓ src/event-editor/right-pane/ai/assistStream.agentAction.test.ts  (4 tests) 21ms
 ✓ src/event-editor/right-pane/ai/assistStream.analysis.test.ts  (3 tests) 17ms
 ✓ src/event-editor/right-pane/ai/assistStream.recordDraft.test.ts  (3 tests) 19ms
 ✓ src/event-editor/right-pane/ai/draftPreview.test.ts  (15 tests) 52ms
 ✓ src/event-editor/right-pane/ai/useChatThread.agentAction.test.tsx  (7 tests) 31ms
 ✓ src/event-editor/right-pane/ai/useChatThread.ledger.test.tsx  (4 tests) 30ms
 ✓ src/event-editor/right-pane/ai/useChatThread.analysis.test.tsx  (3 tests) 24ms
 ✓ src/event-editor/right-pane/ai/termFollowUpPrompt.test.ts  (4 tests) 4ms
 ✓ src/event-editor/right-pane/ai/toSurfaceContext.test.ts  (2 tests) 21ms
 ✓ src/shared/ai/useWorkstateProposalFlow.test.tsx  (16 tests) 824ms
 ❯ src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx  (0 test)
 ❯ src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx  (0 test)
 ❯ src/event-editor/right-pane/ai/draftChanges.test.ts  (0 test)
 Test Files  3 failed | 39 passed (42)
      Tests  274 passed (274)
     Errors  1 error
```
The 3 FAIL files are the known pre-existing suite-LOAD failures that resolve OUTSIDE the
worktree — reproduced verbatim in isolation:
`Error: Failed to load url .../wt/QMS7-7-lane1-l1t1500/app/src/.../ParameterAnswerInput.test.tsx
(resolved id: /mnt/vast/home/brad/git/computable-lab/app/src/.../ParameterAnswerInput.test.tsx).
Does the file exist?` (same for draftChanges.test.ts and useChatThread.deckLayout.test.tsx).
None is in my diff (`git diff --name-only` = adapters.yaml, submitSuggestionTool.ts,
recordDraftCompile.ts + 3 new test files). The 1 unhandled error is the known
ClarificationPicker timer debt (`Timeout._onTimeout src/.../ClarificationPicker.tsx:215:8`),
identical to the review's run and pre-existing.

Typecheck:
- `npm run typecheck -w server` → `tsc --noEmit` → SERVER_EXIT=0 (must stay 0: it does).
- app `npx tsc --noEmit`: 23 errors before this fix run, 23 after;
  `comm -13 base after` (NEW) = empty; `comm -23 base after` (REMOVED) = empty → zero NEW
  errors vs the 23-error baseline, matching the reviewer's 23→23 count.
- New test files are type-clean under the project's own flags run standalone
  (`tsc --noEmit --strict --exactOptionalPropertyTypes --noUncheckedIndexedAccess
  --noUnusedLocals --noUnusedParameters --moduleResolution bundler ...` on the two new
  server test files): the only reported error was the pre-existing
  `src/ingestion/extractorLibrary.ts(3,18) TS7016 js-yaml` in an untouched file (server
  tsconfig excludes `**/*.test.ts`, so test files are never typechecked at trunk — the
  standalone run is the check).

## Pins re-verified after the fixes

- adapters.yaml top level: exactly `sequence-authoring / workstate / analysis / record-drafting` (4).
- `grep -rn "recordDraftEnvelopeShape" server/src app/src` → 0 hits (orphan gone).
- PIN-4 hardcode grep (`TRM-|training-material` in server/src/drafts + app/src/shared/ai,
  non-test) → no production hits (comments only); the landing kind is now YAML data.
- Fork detector unchanged: no new flow hook / pending-ref / card component (D3 added a TEST
  file only; AiTabPanel.tsx has zero hunks in this fix run).
- Trust boundary untouched: no FormDraftService call in the orchestrator arm; the compile-side
  envelope schema is unchanged (D4 strengthened the tool-def side only).
- exactOptionalPropertyTypes: no new bare `undefined` spreads introduced.

## Assumptions recorded

1. D2 was implementable without a loader redesign (verified first-hand: `adapters()` and the
   per-call YAML loaders parse generically), so the STOP branch of the ruling was not needed.
2. `landing.tabKind` is validated by the EXISTING lab-session re-validation of the compiled
   document (the tab-kind enum lives in schema/workflow/lab-session.schema.yaml); a bad YAML
   value surfaces as COMPILE_INTERNAL with the Ajv error rather than a second validator.
3. D3's pin passes at base because the behaviour was already safe; its teeth were proven by
   mutation rather than by a RED-at-base failure (documented above, mutation reverted).
4. Lane stack (:3092/:5192) was NOT contacted or restarted; all verification is
   worktree-local vitest/tsc. The YAML-reload consequence (bait-6) means the orchestrator's
   browser gate needs the lane restart to see `landing:` — that restart is the orchestrator's.

## Unresolved / for the orchestrator

- AC-7 (cl-browser-reviewer VERDICT at :5192) remains the orchestrator's gate; the adapters.yaml
  `landing:` key requires the lane restart to take effect in the running stack.
- The record-EDITOR landing (workstate-tab-kinds.yaml entry for record kinds) is still an
  out-of-scope YAML demand for a future item.

QMS7-7-FIX1 DONE a68e661594faba7bedde55a97354e7b8fb89fa65
