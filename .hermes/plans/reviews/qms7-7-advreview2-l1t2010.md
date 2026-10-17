VERDICT: accept

# ADVERSARIAL REVIEW — QMS7-7 (lane 1), CYCLE 2 (DELTA + mandatory-pin re-check) — advreview2-l1t2010

Item: QMS7-7 "AI-proposed draft training document for human review (universal panel)".
Candidate: /mnt/vast/home/brad/git/wt/QMS7-7-lane1-l1t1500 · branch wt/QMS7-7-lane1-l1t1500
Base (cycle-1 base): c5d76fed · cycle-1 tip b0876041 · FINAL CODE SHA a68e661594faba7bedde55a97354e7b8fb89fa65 · fix-report commit 9a2d0c5e on top (verified by git log).
Spec (rulings binding): /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-16_QMS7-7-ai-training-draft-spec.md.
Cycle-1 review: /mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/reviews/qms7-7-advreview-l1t1930.md (fix, 4 P2 D1-D4).
Fix report: .hermes/plans/qms7-7-fix1-report-l1t1945.md (committed at 9a2d0c5e; the code tip a68e6615 matches the report's end-line).
Diff read in full: `git -c core.fileMode=false diff b0876041..a68e6615` (7 paths, +789/-17) — every hunk read.

No P0/P1 defect. All four cycle-1 defects (D1-D4) are CLOSED. Every mandatory pin (P1-P6) re-verified PASS. Both named suites pass in my own runs, server typecheck exit 0, app typecheck 23 -> 23 (zero new, none in a delta-touched file). No new defect. Two non-blocking observations are recorded at the end.

---

## 0. Report/tip provenance (verified)

```
$ git -c core.fileMode=false log --oneline -8
9a2d0c5e docs(qms7-7): fix1 report l1t1945 — four P2 defects fixed ...
a68e6615 test(qms7-7): D3 — the silent-retarget component pin ...
6fd3bc33 fix(qms7-7): D4 — envelope lockstep ...
237418ea fix(qms7-7): D2 — landing tab kind is DATA ...
c7bf068e fix(qms7-7): D1 — delete the orphan recordDraftEnvelopeShape export ...
41e828ae docs(qms7-7): resume report l1t1830 ...
b0876041 feat(qms7-7): GREEN the app relay chain ...
ec8ec3f8 feat(qms7-7): GREEN the server relay chain ...

$ git log --oneline -- .hermes/plans/qms7-7-fix1-report-l1t1945.md
9a2d0c5e docs(qms7-7): fix1 report l1t1945 ...
```
The fix report is committed; the final code commit is a68e6615; 9a2d0c5e (report) sits on top. `git status --porcelain` shows only untracked node_modules — no dangling changes. PASS.

---

## A. D1-D4 CLOSURE (each opened in the real code, not taken from the report)

### D1 — dead export `recordDraftEnvelopeShape` — CLOSED (deleted)
```
$ grep -rn "recordDraftEnvelopeShape" server/src app/src
(no output)   rc=1
$ grep -n "RecordEnvelope" server/src/drafts/recordDraftCompile.ts
(no output)
```
The function is gone and the now-unused `RecordEnvelope` type import is removed (import narrowed to `RecordStore`). No orphan export, no false docstring. Diff hunk read at recordDraftCompile.ts:388-390 removal. PASS.

### D2 — 'registry' landing literal → DECLARATIVE data — CLOSED (implemented, not deferred)
Ruling: a `landing:` sub-key inside the sanctioned record-drafting block, read by recordDraftCompile the same way the adapter config is loaded; absent key = honest compile diagnostic, NO TS default fallback.

Verified first-hand that the loader constraint is NOT blocking (so the deferral branch was correctly not taken):
- `FormDraftService.ts:32` parses `config/drafting/adapters.yaml` per call into `{adapters:Record<string,AdapterSpec>}`; AdapterSpec is `{domain, operations, projection}` — extra keys are ignored by the cast, and no schema validates this file (`grep -rln adapters.yaml schema config` finds no adapters schema). A `landing:` sub-key rides the same file with zero loader redesign.
- Per-call raw-YAML loader precedent exists at `workstateCompile.ts:105-117` and `analysisCompile.ts:119-133` (identical `new URL('../../../config/...', import.meta.url)` + `readFileSync` + `parse`). The new loader matches that house pattern exactly.

Implementation read:
```
server/src/drafts/recordDraftCompile.ts:117  const adaptersPath = new URL('../../../config/drafting/adapters.yaml', import.meta.url);
server/src/drafts/recordDraftCompile.ts:125  export function loadRecordDraftLandingTabKind(): string | null { ... trimmedString(landing?.tabKind) ?? null }
server/src/drafts/recordDraftCompile.ts:142  export const RECORD_DRAFT_ENVELOPE_SCHEMA: object
server/src/drafts/recordDraftCompile.ts:332-346  landing read per call; if (!landingTabKind) -> LANDING_TAB_KIND_UNDECLARED @ /landing BEFORE the staged create
server/src/drafts/recordDraftCompile.ts:370-371  tabs: [{ kind: landingTabKind, title }], activeTabId: landingTabKind
```
- No TS default fallback: the compiled document uses the YAML value verbatim; an absent key returns a named diagnostic `LANDING_TAB_KIND_UNDECLARED` at path `/landing` and returns BEFORE any staging write.
- `'registry'` is a valid lab-session tab kind: `schema/workflow/lab-session.schema.yaml:39` kind enum includes `registry` (:53) — so the value round-trips the real projection validation (RecordDraftAdapter.test.ts builds a REAL validator at :65/:77 and validates against LAB_SESSION_SCHEMA_ID at :334).
- Source-pin in `recordDraftCompile.landing.test.ts:125-130` asserts the file no longer matches `kind:\s*'registry'` / `activeTabId:\s*'registry'` and DOES contain `loadRecordDraftLandingTabKind()`.
- Honest-fail test (:132-152) doctors only the adapters.yaml read (path-scoped `vi.mock('node:fs')`) and asserts `compiled.ok === false`, diagnostics `['LANDING_TAB_KIND_UNDECLARED']`, path `/landing`, and `writes.length === 0` — proving nothing is staged.
PASS. (The YAML change is config/drafting, not schema/lint/ui; the coder correctly restricted verification to worktree vitest and flagged that the lane restart to make `landing:` live is the orchestrator's — bait-6 respected.)

### D3 — silent-retarget COMPONENT pin — CLOSED (behavioural)
Spec-named component test exists: `app/src/event-editor/right-pane/ai/AiTabPanel.recordDraft.retarget.test.tsx` (3 tests). Read in full:
- :232-273 — render panel, raise a record-draft proposal, capture `workstate-card`; then dispatch the provider's OWN `activateTab('details:STU-000001')` (WorkspaceContext reducer 'activate-tab', the registry-strip machinery); asserts the active tab really changed (`state.activeTabId`), then `cardAfter.toBe(cardBefore)` (SAME DOM node), identical textContent, identity chrome `DRAFT-77`, summary, `workstate-card-record-fields` value, and ZERO new compiles / ZERO accepts / ZERO executor calls.
- :275-299 — after the switch, clicking Accept still posts the ORIGINAL triple `{draftId:'DRAFT-77', revision:1, reviewHash:'e'×64}` — the card never re-targets.
- :301-323 — the compiled landing tab text stays 'Registry'; the card never adopts the newly active tab.
This is render + change tab + assert card state — BEHAVIOURAL, not a grep pin. It mirrors the RecordRegistryPage :165-176 activeTab-keyed discipline. PASS.
Coder honestly states the pin PASSES at the fix base (the behaviour was already safe; the defect was the ABSENT pin) and proves teeth by mutation (injected tab-keyed re-propose effect failed 2/3, reverted uncommitted). I re-ran the test standalone:
```
$ npx vitest run src/event-editor/right-pane/ai/AiTabPanel.recordDraft.retarget.test.tsx
 ✓ ... (3 tests) 170ms
 Test Files  1 passed (1)      Tests  3 passed (3)
```
(The mutation-teeth proof itself is coder-asserted and re-running it would require editing AiTabPanel.tsx — out of read-only scope; noted as a limitation, not a defect.)

### D4 — envelope drift lockstep — CLOSED
`RECORD_DRAFT_ENVELOPE_SCHEMA` is now exported as the single authority (`recordDraftCompile.ts:142`, unchanged internals: `additionalProperties:false`, `required:['operation','kind','fields']`) and the tool-def `recordDraft` property gained `additionalProperties:false` + `required:['operation','kind','fields']` (`submitSuggestionTool.ts:637-644`) — the model-facing side was hardened to the authority, NOT the reverse. `recordDraftEnvelopeLockstep.test.ts` (7 tests) pins: identical `required`; `additionalProperties:false` on both; every tool-declared property present in the envelope with the same structural type; envelope extras exactly `['requestId']`; verb vocabulary `const:'compose-record'` vs `enum:['compose-record']`; kind/fields shape match. Compile-side authority NOT weakened. Verified:
```
$ npx vitest run src/drafts/recordDraftEnvelopeLockstep.test.ts src/drafts/recordDraftCompile.landing.test.ts
 ✓ recordDraftEnvelopeLockstep.test.ts  (7 tests) 3ms
 ✓ recordDraftCompile.landing.test.ts  (4 tests) 14ms
 Test Files  2 passed (2)   Tests  11 passed (11)
```
RED evidence verbatim in the fix report (§D4, 6 failed | 1 passed + TS2459 export error) — captured before the fix. PASS.

---

## B. MANDATORY PINS RE-CHECK (regressions)

P1 — adapters.yaml top level EXACTLY {sequence-authoring, workstate, analysis, record-drafting}; D2 lives INSIDE record-drafting:
```
$ grep -nE "^  [a-z][a-z-]*:" config/drafting/adapters.yaml
3:  sequence-authoring:   13:  workstate:   23:  analysis:   37:  record-drafting:
```
`landing:` is a 4-space nested sub-key of record-drafting (adapters.yaml:48) — no new top-level block, no new YAML file. PASS.

P2 — no-hardcode: zero training-material/TRM literals in production TS; no kind→schema map; id from schema `properties.id.pattern`:
```
$ grep -rn "TRM-\|training-material" server/src/drafts app/src/shared/ai --include='*.ts' --include='*.tsx' | grep -v "\.test\."
(no output)   PIN2_rc=1
```
Kind resolution reads `properties.kind.const` over the corpus (`schemaForKind`); id prefix parsed from the schema's declared pattern (`declaredIdPrefix`); card labels/options from the ui-v1 projection. The only `training-material`/`materialType` strings are inside the sanctioned model-guidance description of the `recordDraft` tool property (doc string, not logic). PASS.

P3 — trust boundary: the orchestrator relay arm (`AgentOrchestrator.ts:2687-2748`) on `compose_record_draft` emits ONE `record_draft_proposal` with the envelope BY REFERENCE or (no-envelope) a `success:false` + corrective `error` and NO event — no compile, no store write, no FormDraftService call. `grep -n "FormDraftService" AgentOrchestrator.ts` matches comment lines only. The `AgentOrchestrator.recordDraftProposal.test.ts` (7 tests, mutation-tripwire store) passed in my run. Accept request carries ONLY `{draftId,revision,reviewHash}` (flow :84/:132-133/:147 working); payload carries NO `state`/`status`; `lifecycleId` is the schema-declared const (data-derived, `recordDraftCompile.ts:289-296`); the delta did not touch these. PASS.

P4 — flow-file pin: the fix delta did NOT touch `useWorkstateProposalFlow.ts` (only union + recordFields optional/spread + the D3 test remain, as in cycle-1). No second proposal flow. PASS.

P5 — fork detector still exactly two files:
```
$ grep -rln compileWorkstateDraft app/src | grep -v test
app/src/shared/api/client.ts
app/src/shared/ai/useWorkstateProposalFlow.ts
```
The delta added no new hook/pending-ref/card (only a test file). PASS.

P6 — golden-pin/menu test edits remain enum-width-only: the fix delta touched NO existing golden/menu test (delta test-set = 3 brand-new files, zero modifications). PASS.

---

## C. FIX-ADDED TESTS ARE REAL

- D3/D4 RED evidence is in the fix report verbatim. D4 RED is a genuine pre-fix failure (the lockstep test imported the not-yet-exported schema and asserted a looser tool-def). D3 is honestly reported as pass-at-base-with-mutation-teeth (documented above) — acceptable, since the defect was the absent pin.
- The added tests assert BEHAVIOUR: D3 renders and drives a real tab switch; the landing/lockstep tests assert loaded-YAML equality, compiled output, and structural lockstep — not implementation shadows.
- No test weakened or deleted elsewhere:
```
$ git -c core.fileMode=false diff b0876041..a68e6615 -- '*test*' | grep -E "^-" | grep -v "^---"
(no output)
```
Delta test-set is A A A only (retarget, landing, lockstep). PASS.

---

## D. EVIDENCE RE-RUN (my own runs, verbatim)

Server (exit 0):
```
$ cd server && npx vitest run src/drafts src/ai/AgentOrchestrator.recordDraftProposal.test.ts src/ai/submitSuggestionTool.test.ts
 ...
 ✓ src/ai/AgentOrchestrator.recordDraftProposal.test.ts  (7 tests) 23ms
 ✓ src/drafts/RecordDraftAdapter.test.ts  (9 tests) 1421ms
 ✓ src/drafts/WorkstateDraftAdapter.test.ts  (13 tests) 1906ms
 ✓ src/drafts/FormDraftService.test.ts  (10 tests) 2067ms
 ✓ src/drafts/AnalysisDraftAdapter.test.ts  (11 tests) 2149ms
 Test Files  10 passed (10)
      Tests  111 passed (111)
```
(includes the two new suites: landing 4 + lockstep 7; the earlier 8 files / 100 tests + 2 suites = 10 / 111, zero prior test lost.)

App (named command):
```
$ cd app && npx vitest run src/shared/ai/useWorkstateProposalFlow.test.tsx src/event-editor/right-pane/ai
 ...
 Test Files  3 failed | 39 passed (42)
      Tests  274 passed (274)
     Errors  1 error
```
The 3 FAIL suites are pre-existing suite-LOAD failures that resolve OUTSIDE the worktree (identical to cycle-1 and the coder's report):
```
FAIL ParameterAnswerInput.test.tsx -> resolved id /mnt/vast/home/brad/git/computable-lab/app/... Does the file exist?
FAIL draftChanges.test.ts          -> same resolution
FAIL useChatThread.deckLayout.test.tsx -> same resolution
Uncaught Exception: ClarificationPicker.tsx:215:8 (pre-existing timer debt)
```
None is a delta-touched file; none is a QMS7-7 file. 274 tests pass.

Typecheck:
```
$ npm run typecheck -w server   -> tsc --noEmit   -> SERVER_EXIT=0
$ cd app && npx tsc --noEmit    -> APP_EXIT=2, 23 errors
```
All 23 app errors are in files NOT touched by the delta (LawnSurface.moveAcross.test.tsx, PreviewActionBar.test.tsx, editorHistory.test.ts, EventEditorContext.tsx, LabwareFocus.instrument.test.tsx, systemPromptForViewer.ts, useChatThread.deckLayout.test.tsx, ProtocolLocalizationThread.tsx, DeckModeSwitcher.tsx, DeckToolbar.tsx, ViewerToolbar.tsx, Viewer.tsx, IngestionUploadModal.tsx, ExtractionProgressPanel.test.tsx, useSurfaceContext.ts, useAiChat.surfaceContext.test.ts). The delta's sole app file is `AiTabPanel.recordDraft.retarget.test.tsx`, which is absent from the error list. 23 == cycle-1's faithful-base baseline (c5d76fed) -> ZERO new. (Cycle-1 ran the faithful base-vs-HEAD `comm`; I re-confirm the count and the file-set disjointness here.) PASS.

---

## Observations (non-blocking; not defects)

O1 (verification limitation, not a defect) — I could not independently reproduce D3's mutation-teeth proof: it requires editing AiTabPanel.tsx. The coder's account is consistent and the three behavioural assertions are present and passing, so the pin's substance is verified; only the mutation itself is coder-asserted.

O2 (residue already adjudicated) — `app/src/types/ai.ts` (+18) is not in the spec ownership table; it is the stream-event union mirror required by `aiStreamTypes.pin.test.ts`. It is unchanged by this delta and was reviewed at cycle-1 (no defect raised). Recorded for the orchestrator only.

O3 — the new loader does not itself validate `tabKind` against the lab-session enum; a bad YAML value surfaces as COMPILE_INTERNAL via the later projection validation (single Ajv authority per repo rule #3), as the coder's assumption 2 states. Consistent with house style; no action.

---

## Scope / limitations of this review

- I did NOT contact or restart the lane stack (:3092/:5192, :3001/:5174 untouched). Consequences: AC-7 (browser gate) and the post-restart adapters.yaml reload remain the orchestrator's.
- Cycle-2 is a delta + pin re-check; the cycle-1 branch-level adjudications (ownership deltas, AC coverage) stand unless a delta change contradicts them — none does.
- Suite runs: the two families the task named, same as cycle-1.

## Commands run (index)
- `git -c core.fileMode=false log/diff/name-status` at b0876041, a68e6615, c5d76fed; `git log -- <fix report>`
- `grep -rn "recordDraftEnvelopeShape" server/src app/src`; `grep -n RecordEnvelope recordDraftCompile.ts`
- `grep -nE "^  [a-z][a-z-]*:" config/drafting/adapters.yaml`; `sed -n '36,50p' adapters.yaml`
- `grep -rn "TRM-\|training-material" server/src/drafts app/src/shared/ai ...`; `grep -rln compileWorkstateDraft app/src | grep -v test`
- `grep -n FormDraftService|record_draft_proposal AgentOrchestrator.ts`
- `git diff b0876041..a68e6615 -- '*test*' | grep '^-'`
- `cd server && npx vitest run src/drafts src/ai/AgentOrchestrator.recordDraftProposal.test.ts src/ai/submitSuggestionTool.test.ts`
- `cd server && npx vitest run src/drafts/recordDraftCompile.landing.test.ts src/drafts/recordDraftEnvelopeLockstep.test.ts`
- `cd app && npx vitest run src/shared/ai/useWorkstateProposalFlow.test.tsx src/event-editor/right-pane/ai`
- `cd app && npx vitest run src/event-editor/right-pane/ai/AiTabPanel.recordDraft.retarget.test.tsx`
- `npm run typecheck -w server` (exit 0); `cd app && npx tsc --noEmit` (23 errors, none in a delta-touched file)

ADVREVIEW2 QMS7-7 VERDICT: accept
