# SPEC — PB-CH-5: Analysis as the first compiled cross-page composition target (Brad-named)

Status: DRAFT for orchestrator review (composer l2t0150, 2026-10-07 ~04:10 EDT). NOT dispatchable until promoted.
Baseline trunk at spec time: `cl/integration-2` @ **ed397216** — **PB-CH-4 MERGED DURING COMPOSITION** (merge commit
`ed397216fedf11dd082c015dc5bc34bdb29d0209`, 03:51 EDT, on top of the PB-CH-3 merge `1f466b8b`). Every PB-CH-4 cite
below was RE-VERIFIED by the composer against merged reality at ed397216 — the pre-merge "by contract" caveat is
discharged, but the coder still re-verifies at claim time: PB-CH-4's independent browser gate (and any gate-fix
chain) may add commits on top; branch off claim-time HEAD that INCLUDES `ed397216`.
Gate check (must pass before first write): `git merge-base --is-ancestor ed397216 HEAD`.

## Goal
Register an `analysis` adapter on the PB-CH-2 generic draft seam (adapters.yaml + adapters.ts registration + a
pure compile module) so a composed analysis proposal — spine-grounded onto the EXISTING analysis-revision →
analysis-run → analysis-output-artifact → view-spec chain, staging at most one `analysis-run` create (status
`queued`) — compiles through the same `/api/drafts/compile|accept` lifecycle, arrives as PB-CH-4's thin event +
proposal card, and on Accept projects a version:1 workstate that OPENS the analysis (record tabs) — while opening
it NEVER implicitly executes a run or promotes an artifact, and zero analysis-specific code enters the generic
seam.

## Binding decisions (campaign rulings — do not re-litigate)
- AR-1/AR-2/AR-3 as pinned on the campaign header (task-list.md:1030-1038). The card becomes actionable ONLY from
  a server `canAccept:true` compile; Accept re-sends ONLY `{draftId, revision, reviewHash}`; NO second AI call at
  accept; NEVER auto-push an unaccepted workstate. PB-CH-4 shipped this shape — CONSUME it, do not re-fork it.
- PB-CH-2 rulings bind: projection discipline via stagingStore (the ONLY sanctioned write path is a staged
  `create` — StagingStore.ts:22-30 — never update/delete), actor-bound drafts, reviewHash content-pinned,
  agent-action + lab-session + workstate-intent schemas byte-frozen, kind→tab policy is DATA
  (config/drafting/workstate-tab-kinds.yaml), no adapter-name or schema-name `if`s inside FormDraftService /
  draftRoutes / workstateCompile.
- Task's stop-boundary VERBATIM (task-list.md:1502-1503): "missing ViewSpec capabilities, unsupported staged
  mutations, identity/application ordering doubts, or execute/promotion policy questions return to architect."
  Concretely for THIS item the coder must STOP and report (not improvise) on: (a) any staged mutation that needs
  UPDATE semantics on an existing analysis record (staged creates only — see Design §3); (b) any temptation to
  transition a run's `status` past `queued` or to synthesize an output manifest (that is execution); (c) adding
  renderers or widening `view-spec.schema.yaml`'s renderer enum; (d) making the analysis surface deep-linkable
  (surfaces.schema.yaml:33 id enum + surfaceRoute params + tabForSurface mapping = architect YAML + PB-CH-3
  frozen-file territory — see Open question 1); (e) composing NEW analysis-revisions (model-authored entryScript =
  execute-adjacent policy question — see Open question 2).
- Ledger §7 (superseded-ideas ledger, cited via intake synthesis-prompt.md:47; the ledger doc itself is NOT in
  this repo or the lane dir — verified absent): NO per-component-tree page builder, NO AiDraftBar revival. This
  spec adds ZERO app-side page-composition machinery — the composition target is the existing native record
  editor + the existing analysis page.
- Read `specifications/computable-lab-principles.md` (principle 12) before coding. The draft-lifecycle contract
  (`ai-drafting-and-ui-projection.md`) is NOT on lane-2 trunk (verified: `ls specifications/` lacks it; it exists
  only at live-tree commit `b30b36dc` — composer read it READ-ONLY there; lifecycle items 1-6 apply and the
  coder may cite that read; do NOT vendor the doc).
- Lane discipline: lane-2 data dir `/home/brad/.computable-lab-lane2` (CL_DATA_DIR), runtime evidence ONLY on
  :3093/:5193 (both answered 200 to the composer's curl at ~02:30 — RE-MEASURE at claim), NEVER :3001/:5174 or
  Brad's live tree `/mnt/vast/home/brad/git/computable-lab`; `git -c core.fileMode=false`; NEVER `git add -A`;
  do NOT restart the lane stack (YAML receipts → PENDING-RESTART, PB-CH-2 DEFECT-1 route); YAML-reload trap is
  REAL for this item (new schemas + adapter YAML go through boot-time SchemaRegistry load; `tsx --watch` does NOT
  reload YAML — while `config/drafting/adapters.yaml` (FormDraftService.ts:30) and `workstate-tab-kinds.yaml`
  (workstateCompile.ts:114-138, called per compile at :352) ARE re-read per call. Do not confuse the two.

## What PB-CH-4 shipped on trunk (merged reality, all cites re-verified by the composer at ed397216)
The mount the task depends on, BY CONTRACT and by verified path:
- Event: server AgentEvent member `{ type: 'workstate_proposal'; workstate: Record<string, unknown> }`
  (`server/src/ai/types.ts:887`), emitted verbatim-intent from `server/src/ai/AgentOrchestrator.ts:2153-2199`
  (dispatch branch `onEvent?.({ type:'workstate_proposal', workstate })` at :2199), fed by the 6-intent menu
  (`server/src/ai/submitSuggestionTool.ts:443` enum `['event_graph','deck_layout','create_record','protocol_edit','workspace_action','compose_workstate']`,
  workstate envelope retained verbatim at :533-538).
- App channel: `assistStream.ts:204/210` union members `agent_action` / `workstate_proposal`, `dispatchFrame`
  cases :378-392 (never-default arm kept); `useChatThread` forwards via callbacks.
- Mount: `AiTabPanel.tsx:514` `useWorkstateExecutor()`; compile POST with `adapter: 'workstate'` at :586 via
  `apiClient.compileWorkstateDraft` (`app/src/shared/api/client.ts:2261`); card `WorkstateProposalCard` (rendered
  :1122, phases review/blocked/compiling/applied); Accept = `apiClient.acceptWorkstateDraft({draftId,revision,reviewHash})`
  (:2286) → `executor.applyAcceptedWorkstate(body, {accepted:true}, identity)` (AiTabPanel.tsx:641). Reject =
  abandon, zero writes. The flat accept body `{sessionDocument, summary, resolvedTerms}` is validated by
  `validateAcceptedWorkstate` (`app/src/shared/session/workstateExecutor.ts`, PB-CH-3) — **the analysis adapter's
  compile result MUST carry exactly this shape** (pinned by tests, Design §2).
- Tier-1/executor internals, sessionYaml/tabId/useSessionSync, surfaces registry: CONSUMED, zero changes here.

## VERIFIED baseline (composer measured `[m]` at trunk dcf2de3f→ed397216; `[i]` inherited/corroborated)
- `npm run typecheck -w server` → **26 `error TS` lines [m at ed397216]** (confirms AS-LANE2-SERVER-TSC-PIN-26).
  Bar after PB-CH-5 server hunks: **26, file-set IDENTICAL** (`exactOptionalPropertyTypes` is REAL,
  `server/tsconfig.json:13` — verified).
- `npm run typecheck -w app` → **34 `error TS` lines [m at ed397216]**, FILE-SET identity bar (app `strict:true`
  without exactOptionalPropertyTypes, app/tsconfig.json:18 — still conditional-spread). PITFALL (0158 handoff):
  comm-ing tsc file lists across trees FALSE-DIFFS on path roots — normalize before comparing.
- Targeted server drafts: `cd server && npx vitest run src/drafts` → **3 files / 39 PASS [m at ed397216]**.
  Bar: untouched-green + your new files, ZERO failures.
- Targeted server analysis routes/services: `cd server && npx vitest run src/analysis` → **6 files / 32 PASS
  [m at dcf2de3f]**; PB-CH-4's merge diff touches ZERO files under `server/src/analysis` or `app/src/analysis`
  (verified via `git show --stat ed397216`) → carried. Must stay byte-green untouched.
- Targeted app session: `cd app && npx vitest run src/shared/session` → **7 files / 70 PASS [m at dcf2de3f]**
  (matches handoff pin; PB-CH-4 touched no shared/session file) → carried. Bar: untouched-green.
- Targeted app analysis surface: `cd app && npx vitest run src/analysis` → **2 files / 9 PASS [m at dcf2de3f]**
  (ViewRenderer.test.tsx + AnalysisPage.test.tsx; PB-CH-4 touched none) → carried. Bar: 9 PASS preserved + new
  tests added.
- Full app suite: `cd app && npx vitest run` → **[m at ed397216] 53 failed files / 63 failed / 1945 passed
  (287 files, 6 errors)** — the 53-failing-file baseline set still holds post-PB-CH-4 (handoff 0158 pinned 53;
  composer's run-1 saw 54F/64F, run-2 53F/63F — the delta is a KNOWN FLAKE in
  `ClarificationPicker.test.tsx` uncaught-exception class; tolerate by SET comparison, not totals). Set-identity
  bar: `comm -3` of sorted FAIL-file lists (extract: `grep -oE 'FAIL[ ]+src/[^ ]+' | awk '{print $2}' | sort -u`)
  ⊆ baseline ∪ {ClarificationPicker}. The FAIL set contains the gitignored-symlink environmental red
  `src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx` (composer-verified in the set) — report,
  never "fix". ZERO NEW failing files from PB-CH-5.
- `cd server && npx vitest run src/ai` → **10 failed files / 21 failed / 578 passed (76 files, 2 errors)
  [m at ed397216]** — updated from the pre-PB-CH-4 10/21/565 pin (PB-CH-4's +3 test files are the delta). Bar:
  failing-file SET identical PLUS the deliberate six→seven enum-pin golden diff (Design §4).
- `cd server && npx vitest run src/schema src/surfaces` → **4 failed files / 11 failed / 371 passed / 53 skipped
  (44 files) [m at dcf2de3f]**. The 4 failing files: `ControlledDocumentSchemas.test.ts` (regular file,
  pre-existing) + `EventGraphEquipmentSchema.test.ts`, `LabwarePhysicalGeometryData.test.ts`,
  `surfacesAjv.test.ts` (ALL gitignored symlinks into the live tree — verified `ls -la`, same landmine class;
  surfacesAjv's failures are fixture/schema-enum drift, NOT yours). Bar: set-identical, zero new.
- Inherited **[i]**: PB-CH-4 targeted 59/59 app + 35/35 server (merge-commit message); :3093/:5193 200 OK
  (handoff 0158 @01:52 + composer curl ~02:30 — re-measure at claim).

## The design (exact, minimal)

### 1. Declarative contracts (policy lives HERE, not in TS) — verified as the declared surface
- `config/drafting/workstate-tab-kinds.yaml` (loaded per compile at workstateCompile.ts:114-138, kind set feeds
  the spine's tier-1 record provider at :215): ADD two DATA entries — `analysis-revision` and `analysis-run`,
  both `{tabKind: record-edit, idField: recordId, idPrefix: record}` (record-edit tab + `/record/:recordId`
  host = RecordHostPage → RecordEditPanel, App.tsx:196 + WorkspaceTabStrip.tsx:205 `tabPath` case 'record-edit';
  idPrefix matches `recordEditTabId` — app/src/event-editor/workspace/types.ts:139 — so server-derived activeTabId
  equals what `tabId.ts` re-derives). This YAML-only edit ALONE makes analysis terms resolvable and projectable
  through the EXISTING generic workstate adapter — the genericity proof, see First targeted check.
- NEW `config/drafting/analysis-composition.yaml` (loaded per call, presence-checked, same pattern): the
  analysis adapter's own policy DATA: `revisionKinds: [analysis-revision]`, `runKinds: [analysis-run]`,
  `inputKinds: [data-reference, analysis-output-artifact]` (the runner accepts exactly these two input shapes —
  verified analysisRunner.ts:102,147), `referenceKinds:` (spine tier-1 kind set for term resolution:
  revisionKinds ∪ runKinds ∪ inputKinds), `idPolicy: {analysis-run: ANR-}` (staged-create id minting prefix,
  mirroring AnalysisService.nextId — analysisService.ts:31-46), `landing: {revisionTab: true, runTab: true}`.
  Code interprets; zero kind nouns in TS.

### 2. Proposal envelope — one NEW registered schema; existing envelopes byte-frozen
`schema/workflow/analysis-intent.schema.yaml`, `$id: https://computable-lab.com/schema/computable-lab/workflow/analysis-intent.schema.yaml`,
`additionalProperties:false`, `required:[operation]`, declares `requestId` (compiler-injected at
FormDraftService.ts:106 — a schema without it fails every real compile but passes naive unit tests):
- `operation: const compose-analysis`
- `target`: exactly one of — `{revision: {term}|{recordId}, newRun?: {title?, parameters?, inputs?: {<name>: {term}|{recordId}}}}`
  (open/create against a METHOD) or `{run: {term}|{recordId}}` (open an EXISTING run). XOR enforced in schema
  (oneOf) AND re-checked by the compile (diagnostics, not throws).
- `focus: enum [run, revision]` optional, default `run` — which landing tab is active (server derives the id via
  the mapping's idPrefix; never model-named).
- `open.tabs` (optional, same tab shape as workstate-intent: `{surface, target:{term|recordId}, title?}`):
  extra cross-page tabs appended to the landing tabs.
Boot-registered by the existing recursive glob (workstate-intent precedent). **ZERO bytes** change to
`workstate-intent.schema.yaml`, `agent-action.schema.yaml`, `lab-session.schema.yaml`, `surfaces*.{yaml, schema.yaml}`,
and ALL FOUR `schema/knowledge/{analysis-revision,analysis-run,analysis-output-artifact,view-spec}.schema.yaml`
(the chain is consumed as-is; `git diff --stat` on each must be EMPTY). **view-spec renderer enum
(`schema/knowledge/view-spec.schema.yaml:30`: `[table, signal, metric, static-figure]`) is CLOSED** — the closed
renderer set (ViewRenderer.tsx:123-144, default arm :137-142 `view-spec__error` + `renderViews` missing-artifact
arm :163-166) is preserved untouched.

### 3. The adapter — registered mechanics + one new pure module (zero generic-seam branches)
- `config/drafting/adapters.yaml`: add `analysis: {domain: analysis, operations: [compose-analysis], projection: {}}`.
- `server/src/drafts/adapters.ts`: add an `'analysis'` key to `draftAdapters` (the sanctioned registration point,
  PB-CH-2's own precedent; `FormDraftService.compile` gates on BOTH YAML and TS registration at :65 and on
  `operations` membership at :67 — NO service changes). `stage` delegates to the new module; `project` returns
  the echo (staged writes fold through the existing accept loop, FormDraftService.ts:170-184, which validates
  each prior + `ensureOwnerPolicy(write, actor)` at :183 — actor binding is structural, PB-CH-2 verdict).
- NEW `server/src/drafts/analysisCompile.ts` (+ `.test.ts`), shape-compatible with the workstate module:
  `analysisDepsFromContext(ctx)` reuses `canonicalReadStore` + spine composition EXACTLY as
  workstateCompile.ts:159-226 (createResolveSpine — server/src/resolve/ResolveSpine.ts:155; tier-0
  createTermProvider + tier-1 createRecordProvider scoped to `referenceKinds` from the YAML; LOCAL_TIERS [0,1] +
  isMintAffordance imported, never re-implemented — workstateCompile.ts:36-42,289-292). ResolveSpine is the real
  cited API: `resolve(term, {localOnly:true})`, tiers [0,1], mint-affordance excluded, AMBIGUOUS on tie.
  `compileAnalysisIntent(intent, deps)` steps — every failure a `path`-named diagnostic → the adapter throws
  DraftError → generic `needs-missing-fact` + `canAccept:false` gate (FormDraftService.ts:109-122,145):
  1. Ajv envelope against the new registered `$id` (MALFORMED_ENVELOPE).
  2. Resolve `target`: revision/run term/recordId via spine+store (reuse codes UNRESOLVED_TERM,
     AMBIGUOUS_TERM, UNKNOWN_RECORD; NEW WRONG_REFERENCE_KIND when a target resolves to a record whose kind is
     outside the declared kind set — e.g. "open the DNeasy batch" resolving to a planned-run for `revision` →
     diagnostic, never a guessed tab). NO analysis-revision CREATE in wave 1 (stop-boundary (e)).
  3. Staged create (only when `newRun`): build the analysis-run envelope — `{kind:'analysis-run', id:<mint via
     idPolicy + nextId-scan of referenceKinds.runKinds>, title, revisionRef:{kind:'record', id:<RESOLVED
     revision recordId>, type:'analysis-revision'}, status:'queued', inputs (each resolved through referenceKinds
     ∩ inputKinds — data-reference / analysis-output-artifact, refs per schema/knowledge/analysis-run.schema.yaml
     `inputs`), parameters, initiator:<actor>}` — and `create` it through the CONTEXT store, which during compile
     IS the staging proxy (`create` only — StagingStore.ts:22-30; `update`/`delete`/`list` THROW :15,:21 — never
     call them; reads go through canonicalReadStore). Failed create (Ajv/lint reject) ⇒ the pipeline's DRAFT_INVALID
     diagnostic; NOTHING partial can land (staging Map is discarded). Revision chaining: the run's `revisionRef.id`
     MUST equal the spine/store-resolved revision recordId; a term resolving to a `analysis-run` where a revision
     was named ⇒ WRONG_REFERENCE_KIND; `parentRevisionRef` chain integrity is inherited immutable-ref behavior
     (schema/knowledge/analysis-revision.schema.yaml:26-33). **`status:'queued'` is the ONLY status any code in
     this item ever writes** (matches AnalysisService.createRun — analysisService.ts:107; execution owns every
     other transition — analysisRunner.ts:429-452).
  4. Project: `sessionDocument` = landing tabs from `loadWorkstateTabKindMapping()` for the resolved records
     (`record-edit`/`recordId`/`record:`) + `open.tabs` resolved with the SAME mapping + registry membership
     (`surfaces.get`, UNSUPPORTED_SURFACE) + the same spine discipline; `activeTabId` server-derived per `focus`
     (ACTIVE_TAB_UNRESOLVED otherwise — mirror workstateCompile.ts:409-449). Re-validate against the REGISTERED
     lab-session `$id` (COMPILE_INTERNAL on internal breakage, never emitted).
  5. Result: `{ sessionDocument, summary, resolvedTerms }` — SAME flat accept-body shape PB-CH-3/4 validate
     (`workstateExecutor.ts` AcceptedWorkstateBody — verified); summary names the resolved method + queued-not-
     executed state ("… a new run is QUEUED — nothing executed").
- **Hard no-import boundary (structural, test-pinned):** `analysisCompile.ts` and `adapters.ts` import NOTHING
  from `server/src/analysis/**` (AnalysisRunner / artifactPromotion / analysisService / AnalysisHandlers) and
  nothing imports `routes.ts`' execute (`POST /analysis-runs/:id/execute`, routes.ts:1227) or promote
  (`POST /analysis-artifacts/:id/promote`, :1228 — the task's routes.ts:1216-1229 cite VERIFIED, block :1216-1230).
  A source-pin test greps the drafts module for those module specifiers (composer-measured: ZERO such imports
  exist on trunk today; scout-corroborated, self-verified).

### 4. Server emission — extends PB-CH-4's shape exactly (7th intent, 1 event, 1 orchestrator branch)
- `submitSuggestionTool.ts`: add 7th intent `'compose_analysis'` (enum :443 six→seven — the golden pins in
  `submitSuggestionTool.test.ts` + `…protocolEdit.test.ts` update SEVEN→deliberately, diff shown in the report,
  nothing else re-goldened), `AgentIntentArgs` union member, description, parser gate retaining the `analysis`
  envelope VERBATIM (mirror :533-538's compose_workstate field; description states: the server COMPILES this into
  a review card; it creates at most a QUEUED run record on Accept; it NEVER executes and NEVER promotes).
- `server/src/ai/types.ts`: `| { type: 'analysis_proposal'; analysis: Record<string, unknown> }` (additive after
  :887) — the model's INTENT, never a compiled draft; `/api/drafts/compile` remains the Ajv trust boundary (PB-CH-4
  OQ1 ruling, thin-event design).
- `AgentOrchestrator.ts`: ONE dispatch branch beside the workstate branch (:2153-2199) — verbatim emission +
  `tool_result success:true` + AgentResult note "Proposed an analysis — review the card; nothing executed."
  ZERO inference on accept paths, ZERO store writes.

### 5. App mount — one callback + one adapter constant (card + executor reused untouched)
- `assistStream.ts`: union member `| { type: 'analysis_proposal'; analysis: Record<string, unknown> }` +
  `dispatchFrame` case (the never-default arms at the exhaustive switch are KEPT — the compile break forcing is
  the feature; PB-CH-4 precedent `assistStream.ts:204-210,378-392`).
- `useChatThread.ts`: `onAnalysisProposal?` option, called in the new case with the same never-break-the-turn
  wrapper PB-CH-4's callbacks use.
- `AiTabPanel.tsx`: route the new event into the EXISTING compile→card→accept/reject/revise flow with
  `adapter: 'analysis'` (the flow at :586 already takes the adapter as a parameter site; one constant, not a
  fork). Card, accept (`:641`), pending-identity supersede logic, spent-card behavior: ZERO changes.
- `client.ts`: WIDEN `compileWorkstateDraft`'s `adapter` field type to the registered set (only sanctioned
  client.ts hunk; accept needs no change — identity triple is adapter-blind).
- `WorkstateProposalCard`, `workstateExecutor.ts`, `useWorkstateExecutor.ts`, `sessionYaml.ts`, `tabId.ts`,
  `useSessionSync.ts`, `OpenTabsContext.tsx`, `openSurface.ts`, `surfaceRoute.ts`: ZERO hunks (frozen — consumed).
- **`app/src/analysis/**: ZERO product-code hunks.** "Focused AnalysisPage/ViewRenderer integration" lands as
  TESTS: (i) ViewRenderer unknown-renderer compatibility error preserved (`ViewRenderer.test.tsx:38` today — kept
  green byte-untouched + a new `renderViews` unsupported-renderer + missing-artifact test); (ii) AnalysisPage
  mount fires ONLY `listAnalysisRevisions`/`listAnalysisRuns` (its only mount-time calls — composer-verified:
  refresh at AnalysisPage.tsx:60-71; execute (:150-154) and promote (:115-121) are click-only) — apiClient-spy
  test; (iii) AiTabPanel accept-of-analysis apply navigates to the record-edit tab path (`tabPath` →
  `/record/<ANR-id>`, WorkspaceTabStrip.tsx:205, RecordHostPage at App.tsx:196). NOTE (honest, feeds OQ1):
  AnalysisPage coerces manifest renderers outside the four shipped ones to `'table'` (AnalysisPage.tsx:198-203,
  composer-verified) — the ViewRenderer compat arm is unit-reachable, not currently browser-reachable via
  /analysis; do NOT "fix" the coercion (architect call).

### 6. Explicitly OUT of scope (zero hunks — reviewer-bait territory)
- ANY call into execute/promotion machinery from ANY new code path (server or client) — see §3 boundary + the
  spy tests; `server/src/api/routes.ts` (routes :1220-1229 byte-frozen), `server/src/analysis/**`,
  `server/src/api/handlers/AnalysisHandlers.ts` (executeRun :169, promoteArtifactHandler :187 — untouched).
- `server/src/drafts/{FormDraftService,draftRoutes,StagingStore,workstateCompile}.{ts}` + their tests — ideally
  ZERO diff (no adapter-name branch, no kind `if`; a tiny EXPORT-only helper lift from workstateCompile is the
  largest sanctioned change and needs justification in the report).
- ALL `schema/**` except the ONE new `analysis-intent.schema.yaml` — incl. workstate-intent, agent-action,
  lab-session, the four chain schemas, form-draft*, surfaces* (enum!), view-spec renderer enum.
- PB-CH-3/4 frozen files (§5 list), `ChatPage`, generic `useAiChat`/`aiClient` stack (PB-CH-6), Analysis-local
  chat mounting (PB-CH-6), ledger/journal (PB-CH-7/8), `workspace-session.ts`, `config.yaml`.
- New tab kinds, new surfaces, new renderers, new endpoints, reject endpoints (reject = abandon, PB-CH-2 §6),
  component-tree/ghost-preview page builders (ledger §7), new AgentEvent beyond the one additive member.
- Vendoring or reading Brad's live tree for code (the spec-doc READ cited in Binding decisions is the sole
  read-only exception; cite, never copy files).

## Acceptance criteria (from the task list, verbatim — task-list.md:1507-1514)
> Red-first compiler/adapter tests: reference grounding, renderer compatibility, revision chaining,
> failed creates, and proof of NO implicit execute/promote calls. Independent browser review on named
> surfaces (run-chat card, AnalysisPage, ViewRenderer output): accept compiled analysis proposal ->
> intended analysis reachable with working controls; reject creates nothing and moves nothing;
> unsupported renderer shows the compatibility error. Screenshots: analysis-compiled-card.png,
> analysis-accepted-workstate.png, analysis-rendered-view.png, analysis-compatibility-error.png.

Also verbatim (task-list.md:1494-1503, the description): "Via the PB-CH-2 adapter seam, compile analysis intent
onto the existing chain … + an optional version:1 workstate opening that analysis. Inputs/terms grounded through
ResolveSpine. Converge authoring on the generic seam — no new schema-specific compile pipeline. Wave-1 effects
limited to supported compiled proposals + staged creates; opening a composed analysis NEVER implicitly executes a
run or promotes an artifact; closed renderer set only, compatibility-error behavior preserved; no component-tree
page builder (ledger §7 forbids)." Files line: "new registered analysis adapter + declarative contracts, analysis
draft-route integration, focused AnalysisPage/ViewRenderer integration + tests."

### Red-first test matrix
Files: `server/src/drafts/analysisCompile.test.ts` (pure; fake spine appends a REAL tier-5 `curie:''` mint EVERY
call — PB-CH-1 S2 convention; harness injects `requestId` like FormDraftService.ts:106),
`AnalysisDraftAdapter.test.ts` (lifecycle through FormDraftService, harness per PB-CH-2's
`WorkstateDraftAdapter.test.ts`), `server/src/ai/submitSuggestionTool.analysis.test.ts` +
`AgentOrchestrator.analysisProposal.test.ts` (mock inference per protocolEdit convention),
`app: assistStream.analysis.test.ts`, `useChatThread.analysis.test.tsx`, `AiTabPanel.analysis.test.tsx`,
`ViewRenderer.compat.test.tsx`, `AnalysisPage.no-execute.test.tsx` (apiClient spies).

| Criterion | Named test | Where |
| --- | --- | --- |
| reference grounding | `revision/run terms resolve via spine tiers [0,1], mint-only never binds`; `UNRESOLVED_TERM / AMBIGUOUS_TERM with ok:false`; `invented recordId never projects (UNKNOWN_RECORD)` | pure + lifecycle |
| renderer compatibility | `ViewRenderer unknown renderer still renders view-spec__error (frozen test byte-green)`; `renderViews unsupported renderer + missing artifact show the error arms`; `zero new renderer identifiers in the diff` | app |
| revision chaining | `staged run's revisionRef.id equals the resolved revision recordId`; `revision term resolving to an analysis-run yields WRONG_REFERENCE_KIND, nothing staged`; `record-edit tab ids re-derive equal via the mapping's idPrefix` | pure + lifecycle |
| failed creates | `an invalid staged run envelope blocks: DRAFT_INVALID, canAccept:false, no canonical write`; `staged create is the ONLY store mutation during compile (spy: create-form-draft/update-form-draft plus the single staged analysis-run, zero elsewhere)` | lifecycle |
| NO implicit execute/promote | `vi.mock(analysisRunner/artifactPromotion/analysisService) — zero calls across compile+accept+repeat-accept`; `module-boundary source-pin: no server/src/analysis import in server/src/drafts/**`; `accept returns queued status; no execute-route invocation` | lifecycle + pure |
| no implicit execute client-side | `AnalysisPage mount fires only listAnalysisRevisions/listAnalysisRuns (spies) — no execute, no promote`; `AiTabPanel accept path issues exactly one /drafts/accept fetch and ZERO /ai/assist/stream` | app |
| staged mutation actor-bound | `staged run payload.initiator equals the authenticated actor`; `cross-actor accept is 403`; `writes carry ensureOwnerPolicy (spy)` | lifecycle |
| reject creates/moves nothing | `compile (with staged create) then abandon: canonical records hash + var/sessions/<user>/main.yaml sha256 BYTE-IDENTICAL` (pattern PB-CH-2's byte-hash test, live :3093 receipt route) | lifecycle + receipt |
| accept lands the workstate | `accept body deep-equals compile result (flat sessionDocument/summary/resolvedTerms, lab-session Ajv-valid, activeTabId server-derived)`; `repeat accept byte-identical, no duplicate run record` | lifecycle |
| card lifecycle by contract | `analysis_proposal event alone renders NO accept control until compile response`; `canAccept:false → diagnostics, no accept control`; `adapter 'analysis' is the only flow delta; card/accept code paths shared (source-pin) not forked` | AiTabPanel |
| genericity (the WHY) | `plain compose-workstate opens a seeded analysis-revision with the TWO-YAML-LINE mapping change and ZERO analysis-aware code` (workstate suite, fake spine) — seam-is-generic proof | both |
| envelope pins | `intent schema tolerates compiler-injected requestId`; `new AgentEvent member parses, optional fields ABSENT not undefined` | server/app |

## First targeted check (run EARLY, before any wiring)
Pure-module file only: `cd /mnt/vast/home/brad/git/cl-integration-2/server && npx vitest run src/drafts/analysisCompile.test.ts src/drafts/workstateCompile.test.ts`.
Expected RED first (module absent). Then BOTH green, and the load-bearing early signal inside them: with ONLY the
`workstate-tab-kinds.yaml` two-entry addition (zero analysis-aware code), the plain workstate compile resolves a
seeded analysis-revision term and projects a `record-edit` tab — if that generic case needs ANY special-casing in
`workstateCompile.ts` to pass, the design is wrong: STOP and report before touching any host file. Also prove the
staged-create assumption here: a stage that calls `context.store.create` lands in `compiled.writes` with
`canAccept:true` while `update`/`list` still throw (the StagingStore capability boundary) — if the generic gate
rejects the non-empty writes set for projection-shaped domains, STOP (that is a new-mutation-semantics
stop-boundary, architect's call).

## Verification (complete, with expected output vs baselines)
1. RED outputs pasted; then new server+app suites green.
2. `cd server && npx vitest run src/drafts` → 3 baseline files (39) + 2 new files, ZERO failures (baseline [m] 3/39).
3. `cd server && npx vitest run src/ai` → [m] 10/21/578 failing-file SET identical + the deliberate six→seven pin
   delta shown; `npx vitest run src/analysis` → 6/32 [m] untouched green; `src/schema src/surfaces` → [m]
   4-file set identical (symlink landmines reported, not fixed).
4. `cd app && npx vitest run src/analysis src/shared/session src/event-editor/right-pane/ai` → baselines [m]
   9 + 70 + (deckLayout env-red) preserved + new files green (deckLayout load-error: environmental, report only).
5. `cd app && npx vitest run` → failing-file SET set-identical to the [m] 53-file baseline (paste `comm -3`;
   ClarificationPicker flake tolerated via set-union, declared); totals ≈ 63 failed / ≥1945 passed / ≥287 files.
6. Typechecks: server 26 set-IDENTICAL [m pin]; app 34 set-IDENTICAL [m pin] (path-normalized comparison).
7. Forbidden-path proof, pasted: `git diff --name-only` ⊆ declared files; `git diff --stat schema/knowledge/
   schema/workflow/ schema/registry/surfaces/ server/src/analysis app/src/analysis server/src/api/routes.ts
   app/src/shared/session app/src/shared/surfaces` EMPTY except the ONE new schema file (listed as untracked);
   `grep -rn 'analysisService\|analysisRunner\|artifactPromotion\|/execute\|/promote' server/src/drafts` = ZERO
   (source-pin); `grep -rn "adapter: 'workstate'" app/src/event-editor/right-pane/ai/AiTabPanel.tsx` still shows
   the shared flow, not a fork.
8. API receipts (:3093 after orchestrator restart — PENDING-RESTART per PB-CH-2 DEFECT-1 if you cannot avoid it;
   YAML changes REQUIRE the restart): seed 1 analysis-revision + 1 data-reference via ordinary APIs;
   a. `POST /api/drafts/compile {"adapter":"analysis","intent":{"operation":"compose-analysis","target":{"revision":{"term":"<seeded rev title>"},"newRun":{"inputs":{"trace":{"term":"<seeded dref>"}}}}}}`
      (x-user-id lane user) → 200, `canAccept:true`, `result.sessionDocument` version:1 with `record:` ids,
      `writes` = exactly the ONE staged `analysis-run` (status `queued`, initiator == actor), `reads` pinning the
      revision + dref;
   b. sha256 `var/sessions/<user>/main.yaml` + canonical-records tree hash BEFORE compile and AFTER
      compile+abandon → BYTE-IDENTICAL (reject half); after ACCEPT → exactly ONE new canonical `analysis-run`
      (status `queued`), `main.yaml` untouched server-side (push is client-side), NO new artifact/DREF records;
   c. accept body deep-equals compile result; second accept byte-identical; cross-actor accept → 403; the
      wrong-kind target → diagnostic + `canAccept:false`; NO request ever touches `/analysis-runs/*/execute` or
      `/analysis-artifacts/*/promote` (watch the lane log).
9. Browser gate is ORCHESTRATOR-OWNED AFTER MERGE (independent cl-browser-reviewer, SINGLE vision slot, SERIAL,
   named surfaces only; coder self-verifies NOTHING in the browser — mark PENDING-BROWSER-GATE). Seed lane
   fixtures ONLY (never Brad's live data): an analysis-revision; a SUCCEEDED analysis-run with a manifest (seed
   records + manifest directly if no executor round-trip is convenient — the seeded-run path needs zero execution
   from the review itself); same actor in both browser contexts. Script: (1) run-chat ask → compose analysis →
   card with resolved labels + QUEUED wording → `analysis-compiled-card.png`; (2) Reject → tab strip + `/api/
   session` re-hashed/reloaded PROVEN unchanged → (reuse of the negative) ; (3) re-propose, Accept → tab strip
   lands on the analysis record (`/record/ANR-…`), RecordEditPanel controls live, run status VISIBLE as queued
   → `analysis-accepted-workstate.png`; (4) navigate `/analysis`, select the seeded succeeded run → ViewRenderer
   output (table/metric renders) → `analysis-rendered-view.png`; (5) compatibility error: per OQ1 — capture the
   live-observable compat behavior (unsupported-surface diagnostic card) as `analysis-compatibility-error.png`
   and paste the unit evidence (`ViewRenderer.test.tsx` compat arm) into the reviewer's notes; if the reviewer can
   reach a live `view-spec__error`, capture that instead; (6) re-verify every negative by API/reload; record
   registry IDs/URLs; watcher note: accept turn issues NO `/ai/assist/stream` (network tab).

## Worker contract
- **Gate:** branch off CLAIM-TIME `cl/integration-2` HEAD that INCLUDES the PB-CH-4 merge `ed397216`
  (`git merge-base --is-ancestor ed397216 HEAD` must pass; record claim-time SHA + whether any post-merge
  PB-CH-4 gate-fix chain landed — if it touched AiTabPanel/assistStream/submitSuggestionTool, re-verify every
  cite above against the new reality BEFORE writing; these cites are merged-trunk-verified as of ed397216, NOT
  gospel after further fixes).
- Worktree `wt/PB-CH-5-lane2-l2t<HHMM>` under `/mnt/vast/home/brad/git/wt/`, lane bootstrap: node_modules +
  server symlinks from trunk (NFS worktree-add in BACKGROUND — AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS), `git -c
  core.fileMode=false`, NEVER `git add -A`, NEVER touch `/mnt/vast/home/brad/git/computable-lab`.
- Deliverable report (unique path): `.hermes/plans/PB-CH-5-report.wip-l2t<HHMM>.md` — MUST contain: red-first
  outputs, test-matrix mapping, verification 2-7 verbatim (comm -3 set-diffs, forbidden diffs empty), the
  six→seven enum golden diff shown deliberately, the staged-create payload excerpt (initiator + queued status),
  the byte-hash pairs (compile+abandon AND accept deltas), claim-time SHA + ed397216-ancestor proof,
  PENDING-RESTART / PENDING-BROWSER-GATE declarations, and an explicit statement that execute/promotion
  machinery is unimported (source-pin output pasted).
- ONE branch, ONE logical commit (+ optional report commit). No stack restart by the coder. Zero component-tree
  machinery. If ANY stop-boundary (Binding decisions list) fires: stop, report, return to architect.

## Reviewer bait (the adversarial review looks exactly here)
- **A new schema-specific compile pipeline = automatic reject.** One adapter registration + one pure module riding
  the EXISTING FormDraftService/CompilerKernel/PipelineRunner + Ajv-through-SchemaRegistry. A second validation,
  policy, or draft service anywhere = reject (task verbatim: "no new schema-specific compile pipeline").
- **Implicit execute/promote anywhere = automatic reject.** Proof owed: the vi.mock zero-call lifecycle test, the
  source-pin grep, the lane-log no-execute-route receipt, and the AnalysisPage mount-spy test. A "convenience"
  that auto-executes the queued run after accept, or that promotes artifacts to "show a view", dies in review.
  Also reject: `status` ever written past `queued` by new code (analysisRunner.ts:429-452 owns transitions).
- **Hardcoded analysis special-case in generic code:** zero `if (kind === 'analysis-…')` / operation-name branches
  in FormDraftService.ts, draftRoutes.ts, workstateCompile.ts, AiTabPanel's shared flow. The ONLY sanctioned TS
  touch to `adapters.ts` is the registration entry; kind nouns live in the two YAMLs; surface membership via
  `surfaces.get`/registry only (repo rules #1/#2, hard-boundary section of CLAUDE.md).
- **Capability gap silently no-oped instead of tested behavior:** WRONG_REFERENCE_KIND, UNSUPPORTED_SURFACE,
  UNMAPPABLE_RECORD_KIND, ACTIVE_TAB_UNRESOLVED, input-kind rejection — each is a NAMED diagnostic + canAccept:false
  + a test. A tab silently dropped, a bad input silently skipped, or a blocked Accept control hidden-without-message
  = reject (PB-CH-6's phrasing: "missing capability = explicit tested behavior, never a silent no-op control").
- **Staged mutation without actor binding:** the staged run MUST carry `initiator` == the resolveRequestUser actor
  (draftRoutes actor resolution precedent); accept must pass through `ensureOwnerPolicy` (FormDraftService.ts:183)
  — spy-prove it. Cross-actor accept 403 re-proved for the new adapter. Client-named identity/actor fields are
  never trusted (lifecycle contract).
- **Deterministic idempotence trap:** staged `ANR-` id must be a deterministic function of the canonical store
  scan (nextId pattern) — a `Date.now()`/random in stage breaks the accept-side recompile `reviewHash` equality
  check (FormDraftService.ts:167-168) and every repeat-accept test. If re-evaluate can't reproduce the id, STOP.
- **exactOptionalPropertyTypes sites (server tsconfig:13, measured true):** `newRun?.title`, `parameters?`,
  `focus?`, `open?`, tab `title?`, diagnostics — conditional spread everywhere; `activeTabId` is `string | null`
  — emit `null`, never `undefined`. App files: same discipline by convention (strict:true, no flag).
- **requestId + YAML-reload traps:** declare `requestId` in the new envelope (compile injects at
  FormDraftService.ts:106); the lane backend restarts ONLY at boot for schema/adapter registration — receipts
  without the restart disagree with tests; `adapters.yaml`/`workstate-tab-kinds.yaml`/`analysis-composition.yaml`
  ARE per-call — do not add a process-cache "optimization".
- **Frozen-file smuggling:** the four chain schemas, workstate-intent, agent-action, lab-session, surfaces (the
  surfaces.schema.yaml:33 id ENUM is why no new surface is possible without an architect meta-schema change),
  PB-CH-3/4 client files, routes.ts — diff must be EMPTY. `view-spec` renderer enum widening = architect, period.
- **The AnalysisPage coercion landmine:** AnalysisPage.tsx:198-203 normalizes manifest renderers to the shipped
  set; "fixing" it to surface the compat arm at the browser level CHANGES shipped behavior — OQ1 territory, not a
  coder call. Preserve-and-test, don't touch.
- **Symlink landmines:** deckLayout (app) + EventGraphEquipmentSchema/LabwarePhysicalGeometryData/surfacesAjv
  (server) + createRecordIntent are gitignored symlinks into the live tree; load-fails are baseline RED — report,
  never delete/un-symlink/fix.
- **PB-CH-4 collateral:** the six→seven enum pin is a deliberate golden diff; silently re-goldening anything else
  = scope creep. Do not "improve" the card, executor, or accept path (their PB-CH-4 tests are your regression net).
- **Ports/data:** any :3001/:5174 evidence or writes under the main data dir = automatic fail; browser fixtures are
  SEEDED, never Brad's DNeasy/ROS data.

## Open questions (could not resolve locally; max 3)
1. **Browser-gate reachability of the compatibility error (and of /analysis itself).** The task's gate line
   "unsupported renderer shows the compatibility error" + `analysis-compatibility-error.png` + the named surface
   "ViewRenderer output": the compat arm is real and unit-tested (ViewRenderer.tsx:137-142,
   ViewRenderer.test.tsx:38) but AnalysisPage coerces non-shipped manifest renderers to `'table'`
   (AnalysisPage.tsx:198-203, composer-verified), and the `analysis` SURFACE has no `params`
   (schema/registry/surfaces/surfaces.yaml:57-62, composer-verified) so no compiled proposal can deep-link
   `/analysis` — landing tabs are record-edit (`/record/:id`). This spec preserves both behaviors and scripts the
   gate per Verification 9 (live diagnostic-card capture + unit evidence for the renderer arm). If the architect
   wants browser-level ViewRenderer error and/or analysis deep-linking, that is a meta-schema/tab-mapping change
   (surfaces YAML + tabForSurface) — explicitly stop-boundary, NOT PB-CH-5. Checked: all three files above,
   ViewRenderer/AnalysisPage full reads, surfaces.schema.yaml:33 enum.
2. **Wave-1 staged-create scope = analysis-run only.** New-revision composition (a model-authored `entryScript`
   staged as analysis-revision) was cut: entryScript is executable substance and composing it without an
   execution-policy ruling is exactly the "execute/promotion policy questions return to architect" clause — and
   the `/analysis-revisions/draft` AI-authoring route (AnalysisHandlers.ts draftRevision, routes.ts:1222) already
   owns method authoring behind its own gates. If the orchestrator wants revision-composition in wave 1, the
   envelope + policy grow and the architect must rule on staged entryScript acceptance. Checked: task's "staged
   creates" phrasing, analysisService createRevision/createRun, the draft route, the runner's execute-only
   posture (analysisRunner.ts:189-191 spawns python at execute time ONLY).
3. **Adapter selection on the wire: client-supplied `adapter:'analysis'` (spec default) vs server-side operation
   routing.** The drafts compile request already carries `adapter` as client data validated against the registry
   (FormDraftService.ts:63-67 — unknown adapter is a DraftError, so the server stays authority), matching how PB-CH-4
   ships `adapter:'workstate'` (AiTabPanel.tsx:586, verified). The alternative — one endpoint deriving the adapter
   from `intent.operation` — touches PB-CH-2's service/routes (its contract is "no adapter-name branch in the
   service"; operation-routing is arguably the same class of special-case). Checked: draftRoutes.ts full read,
   FormDraftService compile gate, form-draft-request.schema.yaml (adapter: plain string, additionalProperties:false).
   Flag, don't bulldoze; the client design survives a later server-side routing change with a one-line client diff.

---
Report: DONE — draft at this path. Summary: PB-CH-5 registers an `analysis` adapter on the PB-CH-2 seam (adapters.yaml
+ adapters.ts registration + pure analysisCompile.ts) compiling a new analysis-intent envelope onto the EXISTING
analysis-revision→run→artifact→view-spec chain — one staged `analysis-run` create (status `queued`, initiator = the
authenticated actor, revisionRef spine-resolved), a version:1 workstate of record-edit landing tabs derived from
two new workstate-tab-kinds.yaml DATA entries, reusing PB-CH-4's thin-event + card + accept lifecycle verbatim with
`adapter:'analysis'` as the only mount delta; hard guarantees pinned by tests: zero execute/promote calls (source-pin
+ vi.mock + lane-log), closed renderer set, reject byte-identical, cross-actor 403. **PB-CH-4 MERGED DURING
COMPOSITION (ed397216) — all its cites re-verified against merged trunk; coder still gates on the ancestor check +
gate-fix chain.** Baselines: MEASURED by composer — server tsc 26, app tsc 34 (file-set pins), full app 53 failed
files/63 failed/1945 passed (287 files; ClarificationPicker ±1 flake class; deckLayout symlink env-red in set),
drafts 3/39, server src/ai 10/21/578 (updated pin post-PB-CH-4), app shared/session 7/70, app analysis 2/9, server
analysis 6/32, schema+surfaces 4 failed files (3 are live-tree symlinks — environmental); INHERITED — PB-CH-4
targeted 59/59+35/35 (merge msg), :3093/:5193 health. Scout screening (bounded, computable): zero drafts→analysis
imports corroborated + AnalysisPage click-only execute/promote corroborated — both self-verified; scout1 returned
empty (its question self-answered by composer). Open: browser reachability of the compat error + /analysis deep-link
(architect), wave-1 create-scope cut of new-revisions, client-vs-server adapter-routing shape.
