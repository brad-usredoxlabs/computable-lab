# QMS7-7 SPEC DRAFT — AI-proposed draft training document for human review (universal panel)

- Lane: 1 · worktree /mnt/vast/home/brad/git/cl-integration-1 · trunk cl/integration-1
- Composed at trunk 9fd7db7b (tip incl. QMS7-1..QMS7-5 merges + QMS7-6 spec promotion; QMS7-6 merge NOT yet in — branch when it lands, see worker contract)
- Status: DRAFT for orchestrator review. Not dispatchable until promoted.
- Wave-3 intake: ~/.hermes/specs/intake/2026-10-15_qms-registry-unification-wave3/wave3-append-blocks.md (id: QMS7-7, :222-248)

## Goal

Extend the ONE existing proposal flow (shared/ai/useWorkstateProposalFlow — tier-2 intent-relay, single pending card, explicit human accept) with a record-creation proposal TARGET so a prompt on the /registry surface's AI panel ("create a proposed training document for human review") yields a reviewable training-material proposal card, and ONLY human acceptance creates exactly one governed DRAFT record — via the same server-trusted compile→accept machinery, never a direct AI write.

## CRITICAL correction to the intake briefing (measured at tip — do not code to the briefing)

The briefing line "server stamping lifecycleId registry-ops + state draft (RecordHandlers.ts:568-595)" describes the QMS7-3 stamp-at-create for COVERED kinds. **training-material is NOT a covered kind.** First-hand at tip:

- schema/registry/registry-kinds.registry.yaml `kinds:` = person, equipment, equipment-class, training-record, competency-authorization, instrument, calibration-record. training-material is absent (governed kinds are deliberately not listed — their lifecycleId is a per-schema const).
- schema/lab/training-material.schema.yaml: `lifecycleId` is `const: "document-control"` (:91-93) and there is NO `state` property anywhere in the schema; root `unevaluatedProperties: false` (:7). A payload carrying `state: "draft"` is REJECTED by Ajv at create/validation.
- The governed-draft reading for training-material comes from the lifecycle read fallback: server/src/api/handlers/LifecycleHandlers.ts:53 `state = String(payload.state ?? payload.status ?? 'draft')` + schema/core/lifecycles/document-control.lifecycle.yaml (`draft` is `initial: true`). The Training tab's governed path (QMS7-5 handleCreateRecord → POST /records → RecordHandlers.ts createRecord :557) already produces exactly this shape; the accept-side write must produce the SAME shape.

AC-4's "governed DRAFT" therefore means: a schema-valid training-material payload WITHOUT a `state` field, lifecycleId per the schema const (or absent — it is not in the schema's required list; required = kind, id, title, materialType), read as `draft` through the lifecycle surface — byte-compatible in kind with what QMS7-5's Save writes today. Pin this with a test that GETs the accepted record and asserts the lifecycle view reads draft and no undeclared `state`/`status` field leaked in.

## Where the machinery lives (measured anchors, tip 9fd7db7b)

Client flow (THE one proposal system, PB-CH-6):
- app/src/shared/ai/useWorkstateProposalFlow.ts (207 lines): `WorkstateAdapter` union :35 (`'workstate' | 'analysis'`); proposeWorkstate :85 (relays intent verbatim to apiClient.compileWorkstateDraft :92; `pendingDraftRef` single-pending :77; supersede-by-seq :87-97); acceptWorkstate :138 (ONE accept fetch with {draftId,revision,reviewHash} only — client can never resubmit a document); rejectWorkstate :173 (zero fetches, seq bump discards in-flight compiles).
- Fork detector (file comment :5): `grep -rn compileWorkstateDraft app/src` must show this file as the ONLY call site (client.ts method DEFINITION at app/src/shared/api/client.ts:2303/:2331 is the second allowed hit — it is the transport, not a fork).
- Mounts: AiTabPanel.tsx (handleWorkstateProposal :705-718 → adapter constants :726-733 — "analysis is ONE constant, not a fork" is the pattern to copy), AnalysisChatPanel.tsx :46/:53, PdfProtocolBuilder.tsx :142. Stream-event branches: app/src/shared/hooks/useAiChat.ts :510 (workstate_proposal), :548 (analysis_proposal).
- Card: app/src/event-editor/right-pane/ai/WorkstateProposalCard.tsx — presentational; props {phase, summary?, tabs?, resolvedTerms?, diagnostics?, draftId?, revision?, onAccept, onReject} (:34-44); phase vocabulary WorkstateCardPhase.

Server pipeline (the trust boundary):
- POST /api/drafts/compile + /api/drafts/accept: server/src/drafts/draftRoutes.ts:6-16 (under the /api prefix, server.ts:1751).
- FormDraftService.ts (191 lines): compile :61 (adapter lookup from config/drafting/adapters.yaml :32 + draftAdapters registry — BOTH must register, :65; operation must be in the YAML's operations :67); evaluate :85 runs stage→evaluate→project passes against a STAGING PROXY store (:89-100) whose update/delete are prohibited and whose create (:22-31 in StagingStore.ts) validates + lints against the real schema and lands ONLY in an in-memory writes map — nothing durable before accept; canAccept :145 (no error diagnostics, no policy-blocked/needs-missing-fact outcomes, all policy decisions allowed); target-change 409 "Draft target changed. Start a new draft." :76 (the existing silent-retarget guard); accept :150 (reviewHash re-check :155, full re-evaluation under :166-167 with prior writes hidden, then ONE write loop :176-184 through ctx.store.create with audit message `Accept draft ${id}` and ensureOwnerPolicy :183; a mid-save failure returns 503 "Save incomplete; retry Accept" with the draft resumable — never a partial-success lie).
- Adapter mechanics: server/src/drafts/adapters.ts draftAdapters (:15) — 'sequence-authoring' stages real record creates through the staging store (the precedent for a write-staging adapter), 'workstate'/'analysis' stage zero/mostly-zero writes.
- Model-side intent: server/src/ai/submitSuggestionTool.ts :443 intent enum (event_graph, deck_layout, create_record, protocol_edit, workspace_action, compose_workstate, compose_analysis, query_workstate_history, event_shorthand); envelopes described at :536/:591. Stream event union: server/src/ai/types.ts :918 (workstate_proposal), :928 (analysis_proposal). Orchestrator arms: AgentOrchestrator.ts compose_workstate :2528, compose_analysis :2607; per-surface tool-def precedent (sequences arm) :1043/:1076/:1139.
- Surface hosting (first-hand): /registry is RegistryHostPage (app/src/shared/shell/RegistryHostPage.tsx) and mounts the SAME universal RightPane (:19, :51) → RightPane renders AiTabPanel as the AI tab (app/src/event-editor/right-pane/RightPane.tsx :25, :87). THERE IS NO registry-specific AI host — the proposal target rides AiTabPanel exactly like the analysis adapter rides it: one new adapter constant + one new stream-event branch, NOT a new panel. AiTabPanel's system prompt per active tab comes from systemPromptForViewer(systemPromptKindForTab(activeTab)) (:151-154) — the new tool arm must be available on the prompt surface the registry tabs resolve to (check systemPromptForViewer for the kind the record-edit/registry tabs map to; do not widen other surfaces' availability).
- QMS7-5 governed create path (the shape to match): RecordRegistryPage.tsx REGISTRY_TABS training entry :23 (kinds ['training-material','training-record']); seedIdFromDeclaredPattern :49 (id seeded from the schema-declared properties.id.pattern — AS-ORCH-L1-122 ruling: derive, never a prefix table); openCreateForKind :255ff (kind from the ACTIVE tab's kinds DATA, schemaId from GET /schemas + deriveSchemaNode); handleCreateRecord :224; activeTab-keyed reset effect :165-176 (the silent-retarget precedent).
- training-material schema/ui: schema/lab/training-material.schema.yaml — required [kind,id,title,materialType], id pattern ^TRM-[A-Z0-9][A-Z0-9_-]* (:22-24), materialType enum [sop, slide_deck, video, quiz, worksheet, observation_checklist, other]; schema/lab/training-material.ui.yaml form sections Identity / Classification / Lineage / Notes — the card's field vocabulary must come from this projection (server-side ui spec), never TS literals. No training-material.lint.yaml exists (verified) — do not invent one.

## Central design question (OQ-1 — recommendation, orchestrator rules)

Can a training-material proposal ride the EXISTING compile→draft→accept pipeline with a NEW ADAPTER, or does it need something else?

Analysis of the three shapes:
- (A) NEW ADAPTER `record-drafting` on the existing pipeline — RECOMMENDED. Follows PB-CH-5 verbatim: (1) one block added to config/drafting/adapters.yaml ({domain: registry-records, operations: [compose-record], projection: {}}); (2) one entry in server/src/drafts/adapters.ts whose stage() compiles the intent into a full training-material envelope (resolved via SchemaLoader kind→schemaId, id derived from the schema-declared id pattern — the server-side counterpart of seedIdFromDeclaredPattern; no kind→schema map, no prefix table) and stages it through the staging store's create() (which runs the REAL schema validate + lint at compile time — an invalid proposal yields a DRAFT_INVALID stage diagnostic → canAccept:false → blocked card with NO accept control; nothing durable); accept then writes it via the EXISTING accept loop (:176-184) with the `Accept draft ${id}` audit message and ensureOwnerPolicy. (3) Client: WorkstateAdapter gains ONE constant; AiTabPanel gains ONE callback branch; useAiChat gains ONE event branch mirroring :510/:548. This is "extend the existing adapter contract" exactly as the task words it. IT REQUIRES an adapters.yaml edit = a YAML demand → OQ, needs orchestrator un-freeze (the YAML-frozen rule says YAML demand = OQ/stop, not design; PB-CH-5 is the precedent of a sanctioned block-add).
- (B) Client-relay accept: card accept → frontend calls POST /records (literally the QMS7-5 path). REJECTED as primary: it forks accept into two different write regimes (workstate/analysis apply server-side-compiled drafts; record accept would bypass the form-draft trust boundary — reviewHash pinning, re-evaluation, owner-policy loop), and it lets the client hold the payload the server compiled, inverting "the server returns the STORED compiled result; the client can never resubmit a document" (flow comment :133-135).
- (C) Bend the `analysis` adapter to also stage a training-material: REJECTED — operation enum + analysis-composition.yaml kind policy would have to lie; that IS the second-proposal-system smell inside the first one.

## Acceptance criteria — task verified-by mapped 1:1

Task verified-by (verbatim source of intent): "In :5192 /registry AI panel: the prompt yields a proposal card with valid training-material fields; NO training-material record exists before acceptance (storage check); reject -> nothing persisted; accept -> exactly one draft record with proposal/audit attribution, visible in the Training tab; prompts demanding immediate approval / signature / locked-content edits fail honestly; invalid model output -> no partial record. cl-browser-reviewer VERDICT: accept."

| # | Task clause | Component/contract-test layer (RED-first, coder) | Browser-gate layer (orchestrator, :5192, receipts) |
|---|---|---|---|
| AC-1 | prompt yields a proposal card with valid training-material fields | Server: FormDraftService.compile with adapter 'record-drafting' + a well-formed intent (operation compose-record, kind training-material, title, materialType from the schema enum) → canAccept:true, result carries the field list rendered with ui-v1 labels (assert labels == training-material.ui.yaml labels, proving projection-vocabulary not literals). Client: flow test — new adapter constant rides proposeWorkstate (compile called with it; card phase 'review' only when canAccept). RED at base: adapter unknown → "Unknown form draft adapter." | Type the scripted prompt in /registry AI panel → card appears with Title/Material Type fields populated; card shows draftId/revision chrome |
| AC-2 | NO training-material record exists before acceptance (storage check) | Server test: after compile (never accept), backing store has zero training-material records (staging writes are in-memory; assert store.get(seedId) → null on the backing store). Client test: compile-phase card fires ZERO POSTs beyond the compile call | Before accept: read-only `curl -H 'x-user-id: USR-QMS-ADMIN' 'http://localhost:3092/api/records?kind=training-material'` → total 0, captured in the trail; card open, nothing written |
| AC-3 | reject → nothing persisted | Flow test (extend useWorkstateProposalFlow.test.tsx pattern at :207): reject clears card, ZERO fetches, a later accept is a no-op | Click Reject → storage re-check total 0 → screenshot after network settle (negative-claim re-verify rule) |
| AC-4 | accept → exactly ONE draft record with proposal/audit attribution, visible in Training tab | Server test: accept writes exactly one envelope (writes.length === 1 pre-accept; backing gains exactly the one TRM id), form-draft record retained with status 'accepted' + verbatim intent + actor (the attribution: the DRAFT-... record IS the proposal provenance; the audit message `Accept draft DRAFT-...` names it); lifecycle read of the accepted record === 'draft'; payload has NO `state` field and lifecycleId consistent with the schema const (see CRITICAL correction) | Accept → Training tab list shows the new TRM-... record, state Draft; GET /api/records/<id> readback; exactly one new file (no revision/audit detritus beyond the expected audit event) |
| AC-5 | prompts demanding immediate approval/signature/locked-content edits fail honestly | Server: the envelope shape cannot express approval/signature — a model intent that smuggles state:'approved' or a wrong lifecycleId is Ajv-rejected at staging → DRAFT_INVALID diagnostic → canAccept:false → blocked card, no accept control (test pin). accept endpoint still requires {draftId,revision,reviewHash}; there is no accept-by-prompt path | Live negative prompts ("approve and sign this now", "edit the approved SOP in place"): either a text refusal with no card, or a card whose accept CANNOT advance state — then the AC-4 lap proves the created record is a draft with no signatureRefs. Reviewer must NOT see any control that skips review |
| AC-6 | invalid model output → no partial record | Server test: malformed intent (missing materialType, bad id shape, unknown kind, unevaluated extra field) → compile → canAccept:false with readable diagnostics, ZERO writes; accept on a blocked draft throws DraftError ('Draft is blocked...') and writes nothing; mid-save failure path keeps the draft resumable (existing 503 semantics — do not fork it) | Not gate-exercisable deterministically (model non-determinism) — gate relies on the pinned component layer; if the live model emits garbage, that IS the AC-6 witness: blocked card, no record — reviewer captures it if it occurs |
| AC-7 | cl-browser-reviewer VERDICT: accept | — | Orchestrator-run gate, flow below |

## First targeted check (proves the approach early; read-only; measured by the composer 2026-10-16 ~18:31Z)

```
curl -s http://localhost:5192/api/health | head -c 300
```
Expected (measured): `{"status":"ok",...,"ai":{"available":true,"inferenceUrl":"https://openrouter.ai/api/v1","model":"qwen/qwen3.8-flash",...}}` — proves in one command that (a) the :5192 frontend proxies to the lane backend :3092 (VITE_API_PROXY wired via cl-lane-stack.sh), and (b) the configured AI provider is LIVE, so the browser gate can drive a real proposal turn end-to-end on the very surface the feature mounts on. Companion one-liners (also read-only, also verified): `curl -s -H 'x-user-id: USR-QMS-ADMIN' 'http://localhost:3092/api/records?kind=training-material'` → `{"records":[],"total":0}` (clean AC-2 baseline), and the fork detector `grep -rln compileWorkstateDraft app/src | grep -v test` → exactly useWorkstateProposalFlow.ts + shared/api/client.ts.

## Design (bound to: extend the adapter contract, NOT a second proposal system)

1. Server, new adapter 'record-drafting' (OQ-1 ruling pending): adapters.yaml block (frozen-YAML demand → OQ-1) + draftAdapters entry. stage(): validate the intent envelope against the NEW envelope's own JSON-schema shape declared in the tool def (submitSuggestionTool.ts, per the compose_workstate/compose_analysis envelope pattern :536/:591); resolve kind→schemaId via SchemaLoader (no map); derive the proposed id from the schema's declared properties.id.pattern (server-side derivation; if a shared helper must move out of RecordRegistryPage, extract it — do not duplicate a prefix table in either workspace); build the payload with ONLY schema-declared fields + provenance matching the POST /records handler's field set (createdAt/updatedAt/createdBy — see OQ-2); stage it through the staging store's create() so REAL validate+lint run at compile time. Accept rides the existing loop untouched. project() = intent echo like workstate/analysis. NO writes outside the staging store, EVER.
2. Model surface: new intent value (e.g. compose_record_draft) + envelope in submitSuggestionTool.ts; new stream event `record_draft_proposal` in server/src/ai/types.ts beside :918/:928; AgentOrchestrator arm beside :2528/:2607 emitting the INTENT VERBATIM (it is a relay; POST /api/drafts/compile remains the trust boundary — the arm must NOT call FormDraftService itself, matching the workstate/analysis arms which only emit the envelope).
3. Client: WorkstateAdapter = 'workstate' | 'analysis' | 'record-drafting' (ONE union member); useAiChat.ts gains one event branch beside :510/:548; AiTabPanel gains one `onRecordDraftProposal` → handleWorkstateProposal(intent, 'record-drafting') — the workstateTurnRef flag treatment copies the analysis pattern. NO new flow hook, NO new card component, NO second pending-proposal state.
4. Card rendering with the schema's projection/vocabulary: the compiled `result` carries a `recordFields: [{label, value}]` list whose labels come from the training-material ui.yaml projection (ui spec loaded server-side) + the schema's materialType enum vocabulary for the select value; WorkstateProposalCard gains ONE optional presentational block consuming it (phase vocabulary unchanged, imported, never re-declared). Map nothing by kind name in TS.
5. Silent-retarget: mirror the QMS7-5 precedent. (a) Registry tab switch or selection change must not silently re-target a pending proposal: the registry's selection→tab effect (RecordRegistryPage.tsx :186ff, QMS7-1) already re-targets the AI CONTEXT; the proposal card's pending identity is keyed to the compiled draft and the server already 409s a target change (FormDraftService.ts:76) — pin with a component test that switching tabs with a pending card either preserves the card verbatim or clears it via the activeTab-keyed reset pattern (:165-176); it must NEVER re-target silently. (b) A second proposal supersedes the first through the existing compileSeqRef/pendingDraftRef path — zero new state.
6. Trust rule unchanged: no accept control until the server says canAccept:true; reject = zero fetches; ZERO AI calls during accept, ever; the accept request carries ONLY {draftId, revision, reviewHash}.

Out of scope (explicitly): training-record kind proposals; approval/signature/transition of the created draft (lifecycle chrome owns that, QMS6A/QMS7-6 machinery); any edit to the OTHER adapters' semantics; any new endpoint; any app-side kind→schema literal; CsvImportModal resurrections; :3001/:5174.

## Files — ownership table (coder touches ONLY these)

| File | Change |
|---|---|
| config/drafting/adapters.yaml | +1 block (ONLY with OQ-1 un-freeze ruling) |
| server/src/drafts/adapters.ts | +1 draftAdapters entry ('record-drafting') |
| server/src/drafts/recordDraftCompile.ts (new, optional) or inlined | intent→envelope compile, schemaId resolution, id derivation from declared pattern |
| server/src/drafts/FormDraftService.ts | NO change (generic pipeline rides it — if you feel the need to branch on adapter name, STOP: adapters.ts:34 says the gate is generic, not an adapter-name branch) |
| server/src/ai/submitSuggestionTool.ts | +1 intent enum value + envelope def + description |
| server/src/ai/types.ts | +1 stream event beside :918/:928 |
| server/src/ai/AgentOrchestrator.ts | +1 relay arm (emit intent verbatim; no service call) |
| app/src/shared/ai/useWorkstateProposalFlow.ts | WorkstateAdapter union +1 constant (comments updated; flow logic UNTOUCHED — a diff here beyond the union line is reviewer bait) |
| app/src/shared/hooks/useAiChat.ts | +1 event branch (shape-copy of :510/:548) |
| app/src/event-editor/right-pane/ai/AiTabPanel.tsx | +1 callback → handleWorkstateProposal(intent, 'record-drafting'); systemPromptForViewer availability check for the registry tab kind |
| app/src/event-editor/right-pane/ai/WorkstateProposalCard.tsx | +1 optional presentational block (presentational only) |
| app/src/event-editor/right-pane/ai/systemPromptForViewer.ts | registry-tab prompt-kind check/extension (minimal) |
| Tests: server/src/drafts/ (new .test.ts for the adapter), app/src/shared/ai/useWorkstateProposalFlow.test.tsx, AiTabPanel.test.tsx, WorkstateProposalCard test | RED-first |
| schema/**, RecordRegistryPage.tsx | NO CHANGE (YAML frozen pending rulings; registry page already hosts everything via the shell) |

## Reviewer bait (the coder must pre-empt these)

1. HARDCODE HUNTING: any `kind`/`TRM-` literal map, prefix table, or materialType list in TS. The id derivation must read properties.id.pattern from the fetched schema (QMS7-5 seedIdFromDeclaredPattern precedent + AS-ORCH-L1-122); card labels from the ui.yaml projection; materialType vocabulary from the schema enum. Grep targets a reviewer WILL run: `grep -rn "TRM-\|training-material" server/src/drafts app/src/shared/ai` — expected hits are comments and test fixtures only.
2. DOUBLE PROPOSAL SYSTEM: a second flow hook, a second pending-ref, a new card component, or the orchestrator arm calling FormDraftService directly (the stream is NOT the trust boundary — POST /api/drafts/compile is; file comment in types.ts :913-914 says so). Fork detector must stay exactly two files (flow + client.ts).
3. SILENT RETARGET: a pending proposal whose card mutates its target when the user switches tabs/selection. Pin: component test copying the RecordRegistryPage :165-176 activeTab-keyed-reset pattern, plus the server-side :76 409 ("Draft target changed. Start a new draft.") reachable for this adapter.
4. PRE-ACCEPT PERSISTENCE: any code path where the record exists before reviewHash-verified accept. The ONLY durable writes are the form-draft records (kind form-draft, actor-scoped, FormDraftService.persist — that one is BY DESIGN and is the attribution trail) and the accept-loop create. Storage check AC: `?kind=training-material` total stays 0 through compile+reject.
5. exactOptionalPropertyTypes stays on: every card-state/recordFields optional must be spread conditionally (`...(x ? {x} : {})`) — the flow's setCard sites (:106-121) are the house style; a bare `label: undefined` will not typecheck.
6. YAML-RELOAD TRAP: tsx --watch does NOT reload YAML (task-list standing fact). If OQ-1 lands the adapters.yaml block, verification requires a lane-stack restart (`bash cl-lane-stack.sh 1 restart` from the worktree — orchestrator-sanctioned only, coder never restarts the lane stack unbidden).
7. STATE LITERAL LEAK: sending `state:"draft"` in the payload (per the briefing's misreading) → Ajv rejection at create/validate. The draft-ness is read-side (LifecycleHandlers.ts:53 + document-control initial). Pin with the AC-4 test.
8. The orchestrator arm must emit intent VERBATIM — "server compiles this into a review card ... Nothing is written" is the envelope contract text (:536); a server-side "helpful" rewrite of model output is dishonest relaying.

## Verification commands (coder runs in the worktree; expected outputs pinned)

```
# RED first: adapter absent at base -> "Unknown form draft adapter." (DraftError)
cd server && npx vitest run src/drafts            # green at tip; new suite included
cd app  && npx vitest run src/shared/ai/useWorkstateProposalFlow.test.tsx src/event-editor/right-pane/ai
npm run typecheck -w app                           # exit 0 (app baseline: 0 type errors)
npm run typecheck -w server                        # NO NEW ERRORS: baseline is the trunk's
                                                   # pre-existing server tsc error set (23 per
                                                   # QMS7-5 gate), ZERO in touched files —
                                                   # "exit 0" is NOT the bar (EDITOR-1 precedent)
# fork detector
grep -rln compileWorkstateDraft app/src | grep -v test   # exactly the 2 allowed files
# app full-suite drift note: AS-ORCH-L1-102 — 6 pre-existing vitest failures at eafd8442
# match the worktree; report against THAT baseline, same delta rule as tsc.
```
Lane facts: :3092 backend serves /home/brad/.computable-lab-lane1 (OPS-1 isolation; log line `Data dir:` is the witness); spoof header `x-user-id: USR-QMS-ADMIN`; cheatsheet docs/qms-manual-testing-cheatsheet.md §ports table.

## Worker contract

- Branch: `wt/QMS7-7-lane1-<ts>` off cl/integration-1 AT THE POST-QMS7-6-MERGE TIP (dispatch_gate: QMS7-1 + QMS7-5 DONE — both true at this writing; re-anchor every line reference above after the QMS7-6 merge lands, tips shift; do not code against QMS7-6's branch).
- Deliverable: trunk diff + handoff at .hermes/plans/handoffs/2026-10-16_QMS7-7-<worker-id>-handoff.md; report under ~/.hermes/cl/lanes/1/.
- NEVER write to :3092 (read-only curls only), never touch :3001/:5174, never restart the lane stack unbidden, never hand-edit records YAML or the lane data repo, no `open('w')` without staged temp+rename.
- YAML FROZEN except the OQ-1 adapters.yaml block IF and ONLY IF the orchestrator's ruling ships in the promoted spec. Any OTHER YAML demand = STOP, requires-rescope to the architect (standing wave rule).
- RED-first commits; the inversion called out in the message; mark in-progress on claim, never done.
- AI-model caveat: the lane routes to openrouter qwen/qwen3.8-flash (live-verified). Coder tests MUST stub the transport (vitest mocks of apiClient / injected deps — the WorkstateDraftAdapter.test.ts pattern), never a live-model dependency in CI-able tests.

## Open questions (ruled by orchestrator at draft review; composer recommendation each)

- OQ-1 (central, above): new adapter `record-drafting` on the existing pipeline, requiring a one-block un-freeze of config/drafting/adapters.yaml. Checked: adapters.yaml contents, FormDraftService dual-registration + generic gate (no adapter-name branch possible), analysis/PB-CH-5 precedent (same shape shipped), form-draft-request.schema.yaml needs NO change (adapter is a free-form string, :10). Rec: APPROVE A.
- OQ-2: accept writes via ctx.store.create in the accept loop, NOT via the POST /records handler — so handler-side provenance injection (payload createdAt/updatedAt/createdBy, RecordHandlers.ts:703-718) does not happen unless the adapter's stage() puts those fields in the staged envelope. Checked: createEnvelope carries envelope meta {createdAt,updatedAt,createdBy} (RecordHandlers :766-779 precedent); stagingStore.create runs the same validate+lint the handler would; owner policy is enforced at accept (:183). Rec: require the adapter to embed the same payload provenance fields so the accepted record is field-identical to a POST /records create; document the residue difference (no LIFECYCLE/ARCHIVE guard legs run — training-material creates carry no covered refs so the guard would no-op anyway; state it in the handoff).
- OQ-3: browser-gate determinism vs AI availability. Checked: ai.available:true + openrouter qwen/qwen3.8-flash live at :3092 AND through the :5192 proxy (measured 18:31Z); no request-stub or fixture-replay seam exists at the SSE layer (adding one = product-code scope creep). Rec: gate preflights `curl :5192/api/health | jq .components.ai.available`; if false/down, QUEUE the gate (single vision slot anyway) rather than stub; AC-5/AC-6 negatives are component-pinned, and a live garbage-output turn is itself an AC-6 witness, not a failure. If Brad demands an offline-capable gate, that is a new task (fixture-replay harness), not a QMS7-7 rider.

## Browser-gate flow (for the orchestrator; receipts ~/.hermes/cl/receipts/QMS7-7/<ts>/)

Pre-flight: health via :5192 proxy (first targeted check); record `GET /api/records?kind=training-material` total (expect 0 or note the baseline ids); restart the lane stack first (no warm-dev-process trust; required anyway if adapters.yaml changed). :5192/registry → switch to the Training tab → right pane AI tab. Scripted prompt: "Create a proposed training document for human review: a slide deck teaching basic pipetting safety." Expect a proposal card (never instant state change). Screenshot 1. Storage check (read-only curl) → no new TRM. Reject → re-verify absence by re-curl BEFORE reporting (negative-claim rule) → screenshot 2. Re-prompt → Accept → Training tab shows exactly one new record, Draft state, opened readback shows the proposed title/materialType; `meta`/createdBy attribution = the human acceptor, audit trail names the DRAFT-... id → screenshots 3-4, network trace shows POST /api/drafts/compile + POST /api/drafts/accept and NO POST /records from the panel. Negative lap: "Approve and sign this training document immediately" — expect honest failure or a card whose accept cannot advance state. Every negative claim re-verified per the reviewer reliability rule.

---

## ORCHESTRATOR REVIEW & RULINGS (20261016T1500 — PROMOTED, dispatchable)

Composer anchors spot-verified by the orchestrator at trunk tip (current): training-material
ABSENT from registry-kinds.registry.yaml kinds (verified); training-material.schema.yaml
lifecycleId const "document-control" (:91-93), zero `state` property occurrences, required
[kind,id,title,materialType], id pattern ^TRM- (:24); LifecycleHandlers.ts:53 fallback read
(verified); fork detector returns exactly useWorkstateProposalFlow.ts + shared/api/client.ts
(verified); config/drafting/adapters.yaml carries sequence-authoring/workstate/analysis blocks
in the exact shape the draft describes (verified); form-draft-request.schema.yaml `adapter:
{type: string, minLength: 1}` — free-form, no schema change needed (verified :10).

- OQ-1 = APPROVE (A): new adapter `record-drafting` on the existing pipeline. The
  adapters.yaml ONE-BLOCK un-freeze is sanctioned: exactly one new block
  (`record-drafting: {domain: registry-records, operations: [compose-record], projection: {}}`,
  operations naming matching the existing kebab-case style of siblings — coder: pick the
  kebab-case form consistent with siblings, e.g. compose-record, and keep YAML and code in
  lockstep). Any OTHER YAML change = STOP, requires-rescope (standing wave rule).
- OQ-2 = ACCEPT recommendation: adapter stage() embeds the same payload provenance fields so
  the accepted record is field-identical to a POST /records create; state the guard-leg residue
  difference in the handoff.
- OQ-3 = ACCEPT recommendation: gate preflights ai.available; if unavailable, QUEUE the gate,
  never stub product code; live garbage-output turn is an AC-6 witness.
- BRANCH ANCHOR RULING: branch off cl/integration-1 at CURRENT tip. QMS7-7's file set is
  DISJOINT from QMS7-6's (RecordRegistryPage/LifecycleHandlers/client.ts record-browsing
  surface vs AI/drafts/proposal surface) — do NOT wait for the QMS7-6 merge; do NOT code on
  QMS7-6's branch. If the QMS7-6 merge lands mid-coder, rebase onto the new trunk tip at the
  coder's discretion only if git reports a conflict in a file both touched (expected: none).
- YAML-RELOAD: the sanctioned adapters.yaml block means the browser gate runs AFTER a lane
  stack restart (orchestrator does the restart at merge; coder verifies via worktree-local
  vitest only, never the lane stack).
