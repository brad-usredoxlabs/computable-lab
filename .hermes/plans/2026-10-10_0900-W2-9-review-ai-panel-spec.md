# W2-9-REVIEW-AI-PANEL — spec DRAFT (l2t0030, 2026-10-10 ~01:55 EDT)

DRAFT ONLY — cl-spec-composer output, NOT canonical, NOT dispatched. Orchestrator reviews + rules
§11, then promotes once deps merge.

GOAL (one sentence): mount a chat panel on the protocol-review host's (currently empty) rightPane —
composed from the existing right-pane AI precedent, grounded on the open candidate (SAID) + draft
protocol (MEANT) — whose accepted proposals land as ordinary revisions on the extraction-draft XDR
through the same propose-never-write + expectedSha discipline as direct edits, while /settings
gains the semantic-pass model exposure that persists to config data.

Base examined: lane trunk /mnt/vast/home/brad/git/cl-integration-2 @ docs tip **987bd34c** (code
base 78bee2c8 — the three commits above are docs/handoff only; every product cite below was OPENED
first-hand this session on that tree). Deps W2-5 (cl-coder r2 LIVE), W2-6 (draft spec), W2-8
(draft ruled, UNMERGED) — EVERY bind to their shapes reads **CAMT = CONFIRM AGAINST MERGED TRUNK
AT PROMOTION**; the merged trunk wins over every shape assumed here. cl-scout screening was used
twice (logs /tmp/scout-w29-protocoledit.log, /tmp/scout-w29-clientframe.log); both findings that
are load-bearing here were re-verified first-hand (§0.5, §0.6) or are marked screening. git ALWAYS
`-c core.fileMode=false`. NEVER :3001/:5174/:3093/:5193. NEVER touch computable-lab.

## 0. TRUNK REALITY (every file:line OPENED by the composer this session)

0.1 THE HOST + THE GAP:
- app/src/ingestion/ProtocolReviewHostPage.tsx (73 lines, read in full): AppShell layout="workspace",
  `leftPane={<VendorPdfReviewPage embedded />}` (:66-72), NO rightPane — the verified gap. Header
  note (:14-16) records the D2 rationale for the old single pane; W2-9 deliberately re-adds an AI
  pane (the task overrides that decision for wave-2: assistance in the AI panel, D7+D8).
- app/src/App.tsx:150 — the one review route `/ingestion/vendor-pdf/:recordId`; :209 `/settings`.
- app/src/shared/shell/AppShell.tsx — `rightPane?: ReactNode` (:61) exists; three-pane split is
  already shell-supported (:64-65 comment). NO shell change needed.
- W2-8 owns VendorPdfReviewPage's repoint (its draft §3 declares ZERO edits to AppShell rightPane
  — the rightPane is ours). W2-8's SemanticDraftPanel/SaidFactsPane will live under
  app/src/ingestion/protocol-review/ (its W2/W3) — our new files share that directory; §3 says
  which files belong to whom.

0.2 THE AI PANEL PRECEDENT (what "mount the precedent" concretely means):
- app/src/event-editor/right-pane/ai/AiTabPanel.tsx (1248 lines): surface derivation :151-154
  (PROTO-AI-9 ruling: deck-editor mounted -> 'workspace.deck', else active-tab kind); attachedProtocol
  context build :160-189 (identity+steps+roles, steps.length===0 -> null, "an invention invitation");
  protocol_edit branch :416-472 (proposal -> protocolEditDiffFrom -> ChangesPanel review; NO deck
  ghost; unmappable envelope falls through); useChatThread mount :623-629 (`surface: systemPrompt.id`);
  error-result guard :385-390 (failed turn resets sidebar — PB-CH-4 D1 / R-Defect-1: never open an
  actionable review over an empty change list).
- PROVIDER WALL: AiTabPanel calls `useWorkspace()` (:130) which THROWS outside WorkspaceProvider
  (workspace/WorkspaceContext.tsx:217-221). The run page mounts it only because RunWorkspacePage
  wraps WorkspaceProvider + EventEditorProvider + ProtocolSelectionProvider (run/RunWorkspacePage.tsx
  :126-138, rightPane={<AgentChatPane />} at :138; agent/AgentChatPane.tsx:5-16 is a 16-line chrome
  wrapper). The protocol-review host has NONE of those providers.
- THE DOCUMENTED ALTERNATIVE: app/src/analysis/AnalysisChatPanel.tsx header (:1-22) — "composed from
  the existing channel parts, NOT AiTabPanel dragged onto the page (it requires useWorkspace, which
  throws outside WorkspaceProvider)". This is the precedent W2-9 follows (PB-CH-6 ruling).
- BUT: AnalysisChatPanel rides useAiChat, and **useAiChat does NOT parse the protocolEdit frame**
  (grep app/src/shared/hooks/useAiChat.ts + shared/api/aiClient.ts: zero `protocolEdit`; the field
  exists only on AssistDraftResult, event-editor/right-pane/ai/assistStream.ts:143). The protocol_edit
  channel end-to-end is useChatThread -> runAssistStream -> done-frame `result.protocolEdit`
  (useChatThread.ts:86 surface, :141-196 request build; scout screening places the done-frame parse
  at assistStream.ts:415-417 — SCREENING, verify at claim; the TYPE site :143 is first-hand).
  => the review panel must ride **useChatThread** (the AiTabPanel channel), not useAiChat.
- Channel parts reusable as-is: useChatThread (hook), MessageLog (message-log testid, :128),
  ChatInput (chat-input :159, chat-input-send :179), ChangesPanel protocol mode (protocolDiff prop
  :24, single Accept -> onApply testid changes-apply :95-105, protocolEditDiffFrom :271).

0.3 THE APPLY DISCIPLINE (lane-2 precedent every chat edit must ride):
- app/src/event-editor/right-pane/protocol/protocolEditOps.ts: STALE_PROTOCOL_WRITE_MESSAGE :56;
  ProtocolEditOp type :157; **`applyOps` is EXPORTED and PURE** (:257-269) — payload in, payload out,
  op-index-named throws; `applyProtocolEdit` :367-393: getRecord(protocolId) -> meta.contentSha lock
  (refuse without token) -> pure applyOps -> deepEqual no-op idempotence -> ONE updateRecord
  {expectedSha} -> stale-409 -> reload message, NO auto-retry. NOTE the brief's real question
  CONFIRMED first-hand: :373 `apiClient.getRecord(protocolId)` fetches a PROTOCOL record; ops never
  run against an XDR through this entry point.
- protocolStepEditing.ts `editableProtocolSteps` :43-50 — `applyOps` steps addressing REQUIRES
  `payload.kind === 'protocol'` (throws otherwise) and refuses controlled/lifecycle-locked payloads.
  CAMT: W2-6's minted `candidates[0].draft` must be a kind-'protocol' payload (W2-6 §target_kind
  'protocol'; W2-8 spec §W2 assumes the same) — if merged trunk shows otherwise, §11 OQ2 fires.
- app/src/shared/api/client.ts (the REAL path; NOT app/src/api/client.ts): updateRecord :2403-2415
  already takes `{signatureRefs?, message?, expectedSha?}`; listRecordsByKind :2052;
  listAiProfiles :3240; activateAiProfile :3270. No client.ts change planned (§3).

0.4 THE SERVER CHAT PATH + THE SURFACE-GROUNDING LANDMINE (PROTO-AI-9 saga):
- server/src/api/handlers/AIHandlers.ts: surface is read verbatim from the body (:348/:366),
  required string (:381-383), CAST `surface as AiSurface` (:464) — an unregistered string passes at
  runtime. /ai/assist/stream is the endpoint useChatThread posts to.
- server/src/ai/systemPrompt.ts: AiSurface union :281-298 ('event-editor' | 'workspace.deck' |
  'analysis' | 'run-workspace[:sub]' | 'materials' | 'formulations' | 'ingestion' | 'literature' |
  'protocol-ide' | 'protocol-builder' — NO 'protocol-review'); getSurfacePreamble falls back to ''
  for unknown bases (:380-384); buildSurfaceAwarePrompt :400-446: the FULL event-graph template
  (with protocol_edit instruction region + ATTACHED PROTOCOL block) renders ONLY for
  'event-editor'/'workspace.deck' (:408-410); DOMAIN_PROMPT_TEMPLATES :369-374 names only
  run-workspace subfaces; everything else gets the generic chat prompt (:429-446).
- buildSystemPrompt :450-490: the protocol_edit instruction region is marker-gated and renders ONLY
  when `context.attachedProtocol` is present (:470-479); formatAttachedProtocol :519+ renders
  'ATTACHED PROTOCOL (ground truth for protocol_edit)' with every stepId.
- server/src/ai/AgentOrchestrator.ts: the intent=protocol_edit branch :2077-2118 is **surface-
  UNGATED** (verified first-hand: no surface test around the branch; scout corroborates) — it
  validates the envelope against the REGISTERED protocol-edit-op schema (:2083) and emits VERBATIM
  or returns a corrective schema-rejection error (:2094). The retry prompt mentions protocol_edit
  (:780-782). So dispatch WORKS on any surface; the failure mode is the PROTO-AI-9 one (task list
  :363-371): a surface whose prompt never renders the ATTACHED PROTOCOL block => the model has no
  citable stepIds/vocabulary => invented stepIds or schema rejections. The surface W2-9 mounts with
  MUST be one the server prompt actually grounds — §11 OQ1 rules HOW (additive server change is
  required; option (i) 'protocol-builder' generic preamble and option (iii) hijacking
  'event-editor' are both rejected there).
- server/src/ai/submitSuggestionTool.ts: agent_intent enum :443 includes protocol_edit; ops/
  protocolId fields :457/:463 — the proposal vocabulary the review panel receives.
- schema/workflow/protocol-edit-op.schema.yaml header (read): PROPOSAL ENVELOPE, vocabulary is DATA;
  `unevaluatedProperties:false` at every level (D2) — **the op vocabulary CANNOT express provenance,
  rungs, or vendor-text edits**. That structural fact is the load-bearing half of acceptance clause
  "chat cannot relabel an inference as vendor truth"; client + server never need bespoke refusals
  for it, and the envelope must NOT be extended here.
- schema/registry/surfaces/surfaces.yaml :83-90 — id `protocol-review`, path
  /ingestion/vendor-pdf/:recordId ALREADY registered (for workspace_action membership — a DIFFERENT
  registry from AiSurface; F-W29-4). The chat surface id naming it keeps the two vocabularies aligned.

0.5 /SETTINGS MODEL MACHINERY (located — the brief's grep task, resolved):
- app/src/settings/SettingsRoute.tsx (35 lines) wraps shell/SettingsPage.tsx, which mounts
  `AiModelSection` (SettingsPage.tsx:22, :158). app/src/shell/settings/AiModelSection.tsx header
  (:1-19): "the ONE place the model is chosen ... Every surface — chat, the event editor, ingestion,
  extraction, compile — follows the active profile." Profile editor + Test + Activate UI.
- Persistence path (first-hand): server/src/api/routes.ts:847-854 config routes ->
  configHandlers.ts activateAiProfile :603-644: copies profile.inference into top-level ai.inference,
  sets ai.activeProfile, `writeConfigYaml(configPath)` (**persists to config data**), onConfigUpdate
  hot-swap hook. GET /api/config exposes the stored shape.
- W2-6 OQ3 was RULED (a): the semantic pass consumes `resolveAiProfile(appConfig.ai).inference`
  (config/types.ts:235-239, wired server.ts:789/:1001 — mirrors). Precedent for a SEPARATE optional
  block exists in the same file: shadowRouter optional block (types.ts:178, loader.ts:355-370
  validation, kill-switch = MISSING config means OFF). W2-6 draft :463-470 states option (b) = a
  dedicated `ai.semanticPass` block falling back to the profile. THE TASK TEXT ("distinct from
  drafting model", "without touching unrelated model settings") is in TENSION with ruling (a) —
  §11 OQ3 surfaces, does not resolve.

0.6 SAID/MEANT WRITE WALLS (what makes the negatives FAIL VISIBLY, not just UI-side):
- SAID (VPDF/VPC): behind W2-5's appendOnlyKinds 405 wall + revisions (W2-5 spec §3.1,
  RecordHandlers.ts:728-738 cited there; ExtractHandlers.ts has NO expectedSha today — handoff
  l2t0030 §2). MEANT = extraction-draft XDR; edits ride PUT /records/:XDR + ordinary revisions
  (W2-5 §3.4; GET /records/:id/revisions routes.ts:224). ALL CAMT (W2-5 r2 LIVE).
- Promotion route exists (routes.ts:632 promoteCandidate, W2-5 spec :56-57) — W2-8 OQ3 ruling (a)
  says NO promotion button on this surface. W2-9 inherits: the AI panel exposes no promote
  affordance and its code path never calls the promote endpoint.
- provenance refs on MEANT steps: merged StepProvenanceRef requires [kind,type,id,pageStart],
  `id` = SAID recordId (handoff l2t0030 §2 W2-6 addendum, :1029/:1032 both sites). Accepted chat
  edits must leave provenance byte-equal — applyOps step_update touches label/description/notes/
  settings (+kind rebuild) only; provenance rides base fields untouched (first-hand :288-296).

0.7 TEST/BASELINE REALITY:
- vitest + Testing Library; page-level precedent app/src/event-editor/right-pane/ai/
  AiTabPanel.protocolEdit.test.tsx (mocks the stream frames — the pattern T2 copies); gate precedent
  app/e2e/gate-pbch6.spec.mjs (baseUrl localhost:5193, /api/health precheck at :3093). Run form
  `cd app && npx playwright test <file> --project=chromium`.
- exactOptionalPropertyTypes is SERVER-ONLY (server/tsconfig.json:13; app has none — verified by
  grep). App tests must still use `...(x !== undefined ? {x} : {})` on round-tripped XDR data.
- Pins (handoff l2t0030 Baseline facts): app tsc 34 primary lines, server tsc 26 multiset; health
  schemas:192 lintRules:77 (WILL move at W2-5 merge — re-pin at claim); no VPDF/VPC/XDR seeds on
  trunk (W2-8 F-W28-5) — the gate reuses W2-8's seeding leg (CAMT).

## 1. SCOPE / OUT OF SCOPE

IN: the rightPane mount + the review-local chat panel (surface-grounded protocol_edit proposals) +
a draft-aware ACCEPT apply path (new module; propose-never-write until Accept, expectedSha lock,
idempotence, stale-stop) + the /settings semantic-pass model exposure (shape per OQ3 ruling) + the
checked-in gate spec.
OUT: VendorPdfReviewPage + SemanticDraftPanel + SaidFactsPane (W2-8's files — ZERO edits; the
coordination contract is in §3 R1); W2-5 lifecycle server files; W2-6's pass/endpoint (CALL per
rulings, never re-implement); AiTabPanel.tsx / protocolEditOps.ts / ChangesPanel.tsx / client.ts /
useAiChat (byte-untouched — reuse via exports); protocol-edit-op schema (vocabulary extension would
be a rung/op re-mint — banned); rung badges (W2-8 OQ4 ruling (a) inherits); promotion UI (OQ3-of-
W2-8 ruling (a)); schema/lint/ui YAML edits (none planned).

## 2. DECLARATIVE SURFACES FIRST

1. Proposal vocabulary = protocol-edit-op.schema.yaml (DATA). This item adds NO op, NO field, NO
   TS switchboard on top of it; the panel reads `ops` structurally exactly like ChangesPanel does.
2. The chat surface id names the registered surfaces.yaml id `protocol-review` — the server-side
   AiSurface union member mirrors it (PB-CH-6 'analysis' precedent, additive + commented). No
   surface string is invented that isn't in surfaces.yaml.
3. Model choice stays config data: profiles + activeProfile via the EXISTING endpoints (routes.ts
   :847-854); OQ3 (b) would add `ai.semanticPass` as an optional config block (shadowRouter
   precedent: MISSING = fallback, every field optional) — never a model/host literal in TS (§8 bait
   8, D7).
4. Panel-disabled arms are named + reasoned (AnalysisChatPanel :59-62 precedent), never dead chrome.
5. No new record kinds, no new lint rules, no new schemas, no new CURIEs.

## 3. OWNED FILES + EDITS

R1 (EDIT) app/src/ingestion/ProtocolReviewHostPage.tsx — the mount (the item's named deliverable):
  `rightPane={<ReviewAiPanel recordId={recordId} onDraftApplied={...} />}` inside the existing
  AppShell (:66-72), + a `draftNonce` state keyed onto the VendorPdfReviewPage element
  (`key={`${recordId}:${draftNonce}`}`) so an accepted chat write re-reads the XDR without any
  W2-8 file edit (remount discards unsaved direct edits — disclosed §9 F-W29-7; the expectedSha
  lock is the correctness backstop either way, §8 bait 6). Fetches the open XDR
  (listRecordsByKind('extraction-draft') filtered source_artifact.id === recordId, status !==
  'promoted' — the SAME discovery shape W2-8 §3(a) uses, CAMT; factor into a shared hook ONLY if
  merged W2-8 already exposes one — otherwise a local hook in the new file, duplication declared).
R2 (NEW) app/src/ingestion/protocol-review/ReviewAiPanel.tsx + ReviewAiPanel.test.tsx — the panel:
  composed from channel parts (§0.2): useChatThread({surface:'protocol-review', context}) +
  MessageLog + ChatInput + ChangesPanel protocol mode. Builds `context.attachedProtocol`
  (AssistAttachedProtocol shape, assistStream.ts:31-41) from the OPEN XDR: recordId = the XDR id,
  sha = XDR meta.contentSha (the lock token rides the proposal), steps = candidates[0].draft steps
  (stepId/ordinal/label/kind) — steps.length===0 => null attachedProtocol (AiTabPanel :164-166
  discipline: identity alone is an invention invitation) + a named reason line. Also sends
  `reviewContext` {candidateRecordId (SAID VPC id when resolvable, CAMT §0.6/W2-8 §0.8 join)} so
  the prompt can speak about SAID/MEANT. proposalEdit branch: copy AiTabPanel :416-472 semantics
  (error-result reset first; proposal -> protocolEditDiffFrom -> ChangesPanel; NEVER an actionable
  Accept over an empty change list). Accept is BIND-WHAT-IS-OPEN: target = the open XDR recordId;
  a `protocolEdit.protocolId` that differs (e.g. a live PRT-*) is REFUSED with a visible message
  (chat cannot retarget writes). Apply calls R3; onApplied bumps the host nonce.
  No SourcesStrip, no RunInEventEditorButton, no warm chip, no deck/interpretation paths — a chat
  column + review card, honest to this surface (dead chrome is a defect).
R3 (NEW) app/src/event-editor/right-pane/protocol/applyDraftProtocolEdit.ts + .test.ts — the
  draft-aware apply fn (OQ2's declared answer): `applyDraftProtocolEdit(xdrRecordId, draftPath,
  ops)`: ONE getRecord(XDR) -> lock from meta.contentSha (refuse-without-token, exact message
  family of protocolEditOps :377-378) -> editable draft body MUST be kind 'protocol' (the
  editableProtocolSteps wall arrives via reused, byte-untouched `applyOps` — an intent-arm/other
  body throws a NAMED error, never a silent no-op) -> PURE `applyOps(draftBody, ops)` (imported,
  :257 — protocolEditOps.ts itself UNTOUCHED) -> deepEqual no-op idempotence -> rebuild the XDR
  envelope surgically (replace ONLY candidates[i].draft; preserve source_artifact,
  ambiguity_spans, statuses, diagnostics verbatim) -> ONE updateRecord(xdrId, envelope,
  {expectedSha, message:'chat-accepted edit'}) -> stale-409 -> STALE_PROTOCOL_WRITE_MESSAGE,
  no-retry (import the constant; do not fork the prose). WHY NOT applyProtocolEdit directly:
  :373 getRecord(protocolId) writes a PROTOCOL record — a draft lives inside an XDR (§0.3; the
  brief's flagged question, ruled as OQ2 with this recommendation).
R4 (EDIT, shape per OQ3) app/src/shell/settings/: default under ruling (a) — NEW
  SemanticPassModelSection.tsx + .test.tsx mounted in SettingsPage.tsx beside AiModelSection
  (:158 site): lists profiles (apiClient.listAiProfiles), activates
  (apiClient.activateAiProfile -> writeConfigYaml persistence, §0.5), labeled for its semantic-pass
  role, with the single-knob disclosure line ("the semantic pass follows the active profile —
  switching also switches chat/drafting"). Under (b): the section instead reads/writes an
  `ai.semanticPass` block through GET/PATCH /config (routes.ts:848-849), MISSING = fallback
  (shadowRouter kill-switch semantics mirrored), and the server reads it at the merged W2-6 wiring
  site — that server read is the CAMT seam (§8 bait 9; restart may be owed, orchestrator's).
R5 (NEW, OQ1-gated) server/src/ai/systemPrompt.ts — additive ONLY: `AiSurface` union += 
  'protocol-review' (PB-CH-6 'analysis' comment style) + buildSurfaceAwarePrompt branch: for
  'protocol-review' render a dedicated review-agent prompt that includes the ATTACHED PROTOCOL
  block + protocol_edit instruction region when context.attachedProtocol is present — the smallest
  honest route is delegating to buildSystemPrompt(context) like :408 does (the template's deck
  sections render from an EMPTY deck context; the protocol-edit region + ATTACHED PROTOCOL block
  are attachedProtocol-gated, :470-479/:519). Alternative within OQ1: a dedicated prompt template —
  ruled, not assumed. Existing branches byte-unchanged (KV-cache byte-stability note :456-460).
  Companion server test alongside the existing systemPrompt tests.
R6 (NEW) app/e2e/w29-review-ai-panel.spec.mjs — the gate spec (§6.2), BASE_URL ?? :5193,
  health precheck :3093/api/health, seeding reuses the merged W2-8 fixture leg (CAMT).
R7 (EDIT, minimal) app/src/ingestion/protocol-review/reviewAiPanel.css (or sibling of W2-8's css —
  placement CAMT at claim; styles for the new panel only).
ZERO edits to: AiTabPanel.tsx, protocolEditOps.ts (import-only), ChangesPanel.tsx, useChatThread.ts,
assistStream.ts, useAiChat.ts, client.ts, VendorPdfReviewPage.tsx, SemanticDraftPanel.tsx,
protocol-edit-op.*.yaml, any record schema/lint/ui YAML.

## 4. ROUTES / FLOWS (no new route)

- `/ingestion/vendor-pdf/:recordId` gains rightPane. Wave-2 vs no-draft is DATA: with no open XDR
  the panel renders a named unavailable/disabled state (chat can still ANSWER questions but no
  proposals apply — no draft = no target; disabled Accept reason, never dead chrome).
- Happy flow: scientist opens review -> rightPane chat -> "reword step 3's label for our bench" ->
  server (surface 'protocol-review', grounded prompt + ATTACHED PROTOCOL ids) -> agent_intent
  protocol_edit -> schema-validated ops -> ChangesPanel before/after -> Accept -> getRecord(XDR) +
  lock + applyOps + ONE PUT {expectedSha} -> revision + audit (W2-5) -> onApplied -> draftNonce++
  -> left/right panes re-read the XDR; provenance untouched.
- Negative flows (all FAIL VISIBLY, §5): rewrite vendor text -> panel has no write path to
  VPDF/VPC (server 405 wall CAMT); relabel inference as vendor truth -> no op exists (schema
  envelope rejects, corrective error rendered in the chat log via the :2094 error channel — R2
  renders error results like AiTabPanel :385-390: visible, no review opened); bypass validation ->
  PUT still rides record-schema + lint (422 verbatim); promote -> no affordance, no call, refusal
  note.
- /settings: SemanticPassModelSection -> activate/profile-write -> GET /api/config reflects; next
  semantic pass consumes per OQ3 shape (observability leg §5 B7).

## 5. ACCEPTANCE-CLAUSE -> PROOF MAP (criteria VERBATIM §10)

| # | Clause (verbatim excerpt) | Automated proof | Browser receipt (gate) |
|---|---|---|---|
| B1 | "panel mounted and usable beside SAID/MEANT" | T1 host test: rightPane renders review-ai-panel + chat-input testids; no-draft arm named | screenshot all three panes; send a chat turn, assistant reply in message-log |
| B2 | "chat attempts to rewrite vendor text ... FAIL visibly" | T3: violation-spy — updateRecord/createRecord NEVER target VPDF-*/VPC-* ids from any panel path; ops apply to candidates[i].draft ONLY | ask chat to "change the vendor text on page 2"; receipt: no ops target SAID (schema refusal text in chat log or refusal note) + GET /records/VPDF sha unchanged before/after (paste both) |
| B3 | "relabel an inference as vendor truth ... FAIL visibly" | T3 arm: envelope with any provenance/rung-flavored op is REJECTED by the registered schema (server test on validateProtocolEditPayload — existing file extended is OUT, so assert client-side: malformed proposal never reaches apply) | ask chat to "mark the inferred 5-min incubate as vendor-stated"; receipt: visible refusal/schema-rejection text; GET XDR shows candidates[0].draft[*].intent.provenance byte-equal |
| B4 | "bypass validation ... FAIL visibly" | T2: 422/405 server errors rendered verbatim, no write-retry; apply never skips getRecord+lock (refuse-without-token test) | force a server-side reject (edit a draft to violate schema is too invasive — instead: stale-lock leg: open two tabs, accept in A, direct-save in B, accept again -> reload message, NO second revision in GET /records/XDR/revisions count) |
| B5 | "promote unauthorized ... FAIL visibly" | repo grep: zero promote-endpoint references in the item's diff; DOM test: no promote testid on the route | ask chat to "promote the draft"; receipt: refusal, XDR status unchanged (GET before/after) |
| B6 | "an accepted chat edit lands as an ordinary revision with provenance" | T2: Accept -> updateRecord(XDR, envelope, {expectedSha}) with ONLY candidates[i].draft changed; deepEqual no-op writes nothing; stale-409 -> STALE msg, no retry; retarget (protocolId=PRT-*) REFUSED | edit a step label via chat -> Accept -> GET /records/XDR/revisions contains a new revision (paste); GET XDR: step label changed, intent.provenance byte-equal, source_artifact intact (paste) |
| B7 | "/settings model change persists and is observably consumed by the next extraction call without touching unrelated model settings" | T4 settings test (profiles listed, activate called, persisted state rendered); (b) shape: config round-trip + fallback tests | change selection -> GET /api/config shows it (paste before/after) -> trigger a fresh semantic pass on a seeded VPDF -> backend.log/captured-request shows the NEW model on that call (W2-6 T2 pattern; if (a) holds, the receipt honestly names the single-knob caveat, OQ3) |

## 6. RED-FIRST TEST PLAN + BROWSER GATE

6.1 HEADLESS (vitest, app/; server test under server/ for R5; write RED first):
- T1 ProtocolReviewHostPage.reviewAiPanel.test.tsx: mocked XDR fixture -> RED: no rightPane today
  (this fails on clean trunk BY DESIGN — the approach proving itself). GREEN per §3 R1/R2.
- T2 ReviewAiPanel.test.tsx (pattern: AiTabPanel.protocolEdit.test.tsx frame mocks): proposal ->
  ChangesPanel before/after; Accept -> R3 call shape (ONLY candidates[i].draft changed, expectedSha
  present, message present); no-op Accept -> zero writes; stale-409 -> reload message + zero retry;
  error-result turn -> NO actionable Accept (PB-CH-4 D1 class); protocolId retarget -> visible
  refusal, zero writes; steps-loading-empty -> null attachedProtocol + reason line, no proposal
  offered.
- T3 applyDraftProtocolEdit.test.ts: envelope surgery (untouched fields byte-preserved incl.
  ambiguity_spans/statuses/diagnostics); kind!=='protocol' draft body -> NAMED throw; refuse-
  without-token; provenance deep-equal after step_update; provenance NEVER constructible via ops
  (schema-shaped negative: an op object with a provenance key is passed through to applyOps which
  ignores unknown op fields only if the SERVER validated it — client never re-validates, so the
  test asserts the client ALSO never writes provenance: post-apply payload deep-equals provenance
  sub-trees).
- T4 SemanticPassModelSection.test.tsx (shape per OQ3): list/activate round-trip, persisted display,
  (b)-shape: MISSING block = fallback label, PATCH body exact.
- T5 (server, R5 only): systemPrompt test — buildSurfaceAwarePrompt('protocol-review',
  {attachedProtocol}) CONTAINS 'ATTACHED PROTOCOL' + the protocol_edit instruction section; WITHOUT
  attachedProtocol it contains neither; every pre-existing surface renders BYTE-IDENTICAL to today
  (the byte-stability pin).
- FIRST TARGETED CHECK (single command, proves the approach early):
  `cd app && npx vitest run src/event-editor/right-pane/ai src/event-editor/right-pane/protocol src/ingestion`
  -> ALL GREEN at the claim base (every channel part + apply fn this item reuses works today);
  then T1 RED.
- VERIFICATION (expected): `cd app && npx vitest run src/ingestion src/event-editor/right-pane
  src/shell/settings` -> green; `cd app && npm run typecheck` -> error SET byte-equal to the
  claim-base baseline (34 primary lines at 78bee2c8 — capture at claim, set-equality); if R5
  lands: `cd server && npm run typecheck` -> multiset EQUAL to 26-line pin; grep gates over the
  diff: zero rung names, zero model-name literals in non-test source, zero
  `promote|/extraction/drafts` call sites, zero `candidateToProtocolPayload`.

6.2 BROWSER-GATE FLOW (cl-browser-reviewer against :5193, VERDICT: accept owed; spec runs ONLY
against the orchestrator's stack — coder never starts/touches :5193):
 0. precheck :3093 /api/health 200 + :5193 200; localStorage cl.currentUserId=USR-BRAD;
 1. seeding leg: merged W2-8 fixture (VPDF + blob + semantic-draft XDR), CAMT;
 2. B1: open /ingestion/vendor-pdf/<VPDF> -> screenshot three panes; send "summarize this draft"
    -> assistant reply visible (message-log);
 3. backend grounding receipt: the turn's backend.log line names surface=protocol-review with the
    grounded prompt size (a jump vs the ~31k ungrounded PROTO-AI-9 trace; exact threshold per
    reviewer judgment, the surface NAME is the assertion);
 4. B6 positive leg: ask for a label reword -> proposal card -> screenshot before/after -> Accept
    -> GET /api/records/<XDR> shows the new label + provenance byte-equal; GET
    /api/records/<XDR>/revisions shows a new revision (paste both);
 5. B2/B3/B5 negatives: ask rewrite-vendor-text, relabel-inference, promote — each refusal/schema
    error screenshotted; VPDF sha + XDR provenance + XDR status unchanged (pastes);
 6. B4 stale-lock leg: two tabs, direct-save then chat-accept -> reload message, revisions count
    unchanged after the failed accept (paste count);
 7. B7 settings leg per OQ3 shape (§5 B7), incl. "unrelated model settings" paste (agent/chat
    fields unchanged under (b); under (a) the disclosure sentence);
 8. receipts + verdict line.

## 7. WORKER CONTRACT

- Branch `W2-9-lane2-l2t<token>` off the lane trunk `cl/integration-2` TIP AT DISPATCH. Promotion
  gate: W2-6 + W2-8 MERGED (which transitively means W2-5 merged) — at claim, RE-DERIVE every CAMT
  cite (XDR shapes, W2-8 panel discovery shape + seeding fixture, W2-6 endpoint/wiring/model knob,
  the StepProvenanceRef `id`-field addendum) against the merged trunk before writing code.
- Worktree `<integration>/wt/W2-9-lane2-l2t<token>` (coder creates; lane exclude-file + node_modules
  wiring standard).
- Unique deliverable: report at TRUNK checkout `.hermes/plans/W2-9-report.wip-l2t<token>.md`; final
  log line `W29 DONE <sha>`. Every report citation is an opened file:line.
- Owned files ONLY (§3). git always `-c core.fileMode=false`. NEVER :3001/:5174/:3093/:5193. Do
  NOT re-pin W2-5/W2-6/W2-8 files; if the merged trunk contradicts this spec, STOP-and-report —
  don't improvise a re-wire. Context hygiene (W2-5 r1 lesson): tail logs/test output, don't cat
  whole files at inherited baselines.

## 8. REVIEWER BAIT (the adversarial cycle WILL hunt these; pre-empt all)

1. THE SURFACE IS THE ITEM: sending 'event-editor' or 'workspace.deck' from the review host (or
   any surface whose prompt doesn't render the ATTACHED PROTOCOL block) is the PROTO-AI-9 defect
   class — reviewer must demand the backend.log surface receipt (§6.2 step 3), not just "UI works".
2. NO NEW RAIL: proposals render in ChangesPanel via its protocolDiff prop ONLY (PROTO-AI-9 D1);
   a bespoke proposal card fragments approval.
3. RETARGET REFUSAL: a model-emitted protocolId != the open XDR must be REFUSED client-side with a
   visible message; a reviewer will try "edit protocol PRT-000001" from the review chat and MUST
   find zero writes outside the XDR.
4. PROPOSE-NEVER-WRITE: zero updateRecord/createRecord calls may exist anywhere in the panel except
   R3's single post-Accept PUT; reviewer greps the diff for write call sites and traces each.
5. ENVELOPE SURGERY: the accepted-payload rebuild must preserve every untouched XDR field byte-for-
   byte (source_artifact, ambiguity_spans, status, diagnostics); `key: undefined` writes are a
   defect (server PUTs revalidate under exactOptionalPropertyTypes — server/tsconfig.json:13 — so
   this bites SERVER-side even though the app lacks the flag).
6. THE LOCK RACE: chat Accept vs direct TabTab save — the second writer MUST stop with the reload
   message, zero writes, no retry (W2-8 bait 6's twin); last-write-wins is CRITICAL. The draftNonce
   remount must not be used to paper over a lost write.
7. THE EMPTY-ACCEPT DEFECT CLASS (PB-CH-4 D1 / R-Defect-1 / PB-CH-8): any turn ending in error /
   refusal / notes-only MUST NOT leave an actionable Accept over an empty change list — reviewer
   probes with a refusal turn.
8. D7 HARDCODE: no model/endpoint/host literal in non-test source (settings section reads profiles
   from the API; grep gate §6.1).
9. MODEL-KNOB HONESTY: if OQ3 lands (a), the section text MUST disclose single-knob semantics —
   claiming "distinct model" while flipping the shared profile is a false claim; if (b), the
   semanticPass block must be OPTIONAL with MISSING = fallback (shadowRouter kill-switch precedent)
   and unrelated ai.* fields byte-preserved through the PATCH (reviewer diffs config before/after).
10. RUNG/ONTOLOGY BOUNDARY: no rung vocabulary strings, no provenance-field touches, no
    schema/vocabulary extension anywhere in the diff (bait: reviewer greps diff for
    VENDOR|DERIVED|INFERRED_INVARIANT|LOCAL_REALIZATION and for protocol-edit-op schema hunks).
11. YAML-RELOAD TRAP: zero schema/lint/ui YAML edits planned; the only data write is config.yaml
    through the existing activate/PATCH endpoints. Any boot-lint change in receipts = scope creep.
12. FAKE-GREEN HUNTS: vitest mocks frames (fine); the gate's B6 revision leg is a REAL server
    round-trip — demand the GET /records/:XDR/revisions paste; a receipt that "reload shows the
    edit" without the revisions paste is fake.
13. tsc baselines: app 34 set-equality, server 26 multiset (only if R5 lands); fail-file SET
    {EGE,LPG} untouched by an app-side diff; MANIFEST empty.

## 9. DECLARED FINDINGS (not repaired here)

- F-W29-1: AiTabPanel is NOT mountable on this host as-is (useWorkspace throws outside
  WorkspaceProvider; deck/warm/protocol-selection wiring is run-page machinery). "The existing
  right-pane 'ai' panel precedent" is honored as the PB-CH-6 precedent: composition from the same
  channel parts (useChatThread/MessageLog/ChatInput/ChangesPanel), not a literal component reuse.
- F-W29-2: useAiChat does not parse protocolEdit (first-hand grep) — AnalysisChatPanel's own path
  could not carry this item; useChatThread/assistStream is the only protocol_edit channel.
- F-W29-3: the op vocabulary reaches base step fields + structural ops only — semantic intent-arm
  payload fields (semanticVerb, constraints) are NOT chat-editable today. Extending the envelope is
  schema territory, a later item; declared, not silently worked around.
- F-W29-4: surfaces.yaml `protocol-review` (workspace_action membership registry) and the AiSurface
  prompt union are two different registries; naming the chat surface after the registered id keeps
  them aligned — do not confuse membership with grounding.
- F-W29-5 (OQ3 (b) shape only): W2-6's wiring resolves the pass client at construction — a profile/
  block change may need a stack restart to be observably consumed on the next extraction call
  (restart = orchestrator's job; the gate's B7 log leg accounts for it). CAMT the merged wiring.
- F-W29-6: no seed records on trunk (W2-8 F-W28-5 carries) — the gate reuses W2-8's merged seeding
  fixture; the orchestrator ratifies the combined fixture at promotion.
- F-W29-7: the draftNonce remount discards UNSAVED direct edits in the W2-8 panel (no W2-8 file may
  be edited to add a dirty-guard). The expectedSha lock keeps this safe (lost keystrokes, never lost
  writes); a dirty-aware handoff belongs to a later coordination pass once both surfaces are merged.
- F-W29-8: scout screening — the assistStream done-frame parse cite (:415-417) is scout-placed, not
  composer-verified; the TYPE (:143) and the server emit (AgentOrchestrator.ts:2087, read first-hand)
  are. Verify the parse site at claim.

## 10. ACCEPTANCE CRITERIA (VERBATIM from the task block `verified by:`)

Browser receipts: panel mounted and usable beside SAID/MEANT; chat attempts to rewrite vendor text
/ relabel an inference as vendor truth / bypass validation / promote unauthorized all FAIL visibly;
an accepted chat edit lands as an ordinary revision with provenance; /settings model change persists
and is observably consumed by the next extraction call without touching unrelated model settings.

## 11. OPEN QUESTIONS FOR ORCHESTRATOR

OQ1 — CHAT SURFACE ID + PROMPT GROUNDING (server diff required). The protocol_edit DISPATCH is
surface-ungated (§0.4 first-hand) but the GROUNDING (ATTACHED PROTOCOL block + protocol_edit
instruction region) renders only for 'event-editor'/'workspace.deck' (systemPrompt.ts:408,470-479).
Options: (a) RECOMMENDED — additive: AiSurface union += 'protocol-review' + buildSurfaceAwarePrompt
delegates 'protocol-review' to the buildSystemPrompt path when context.attachedProtocol is present
(R5; PB-CH-6 'analysis' additive precedent; companion test T5); (b) reuse 'protocol-builder' —
generic preamble only, model never sees citable stepIds: REJECT (replays PROTO-AI-9's schema-reject
saga, task-list :363-371); (c) hijack 'event-editor' from the client — REJECT (dishonest telemetry,
breaks the surface-ruling discipline, §8 bait 1). Checked: systemPrompt.ts full surface region,
AIHandlers passthrough/cast, AgentOrchestrator :2060-2118 read, surfaces.yaml :83-90, PROTO-AI-9
task-list history. Smallest ruling: "(a)" (plus "template" vs "delegate" if you care — delegate is
the recommendation).
OQ2 — APPLY TARGET SHAPE: draft-aware apply fn (RECOMMENDED (a): R3 reuses exported pure applyOps +
the lane lock discipline, Accept lands an ordinary XDR revision directly — matches "lands as an
ordinary revision with provenance"; protocolEditOps.ts byte-untouched) vs (b) route Accept through
W2-8's SemanticDraftPanel dirty state (the edit becomes unsaved until a manual Save — then the
acceptance clause "lands as a revision" needs a reviewer-side Save step AND panel/host plumbing
through a W2-8-owned file). The alternative applyProtocolEdit is VERIFIABLY wrong for XDRs (:373
fetches a protocol record). Checked: protocolEditOps.ts:367-393 read in full, applyOps export :257,
editableProtocolSteps kind-wall :44, XDR schema draft-is-unvalidated-at-layer (W2-8 §0.5 cites).
Risk noted: applyOps needs draft body kind 'protocol' — CAMT W2-6's minted shape; if the merged XDR
draft is NOT kind-'protocol', R3 fails LOUD (named error) and this ruling reopens. Smallest ruling:
"(a)".
OQ3 — /SETTINGS SEMANTIC-PASS MODEL vs W2-6 OQ3 RULING (TENSION, surfaced not resolved). Task
verbatim demands "distinct from drafting model" + "without touching unrelated model settings";
W2-6 OQ3 was ruled (a) = the pass consumes the ACTIVE PROFILE (one knob — switching it also
switches chat/drafting, i.e. the clause's "unrelated settings" get touched). Options: (a) keep the
ruling; W2-9 ships the profile section with the §8-bait-9 disclosure AND the report states plainly
which half of the clause the ruling cannot honor — orchestrator either accepts the clause as
"persisted + observably consumed" only, or rules (b); (b) re-rule W2-6 OQ3 to its own draft option
(b) — an optional `ai.semanticPass` block (precedent shadowRouter types.ts:178 + loader.ts:355-370,
MISSING = fallback) read at the merged W2-6 wiring seam; W2-9 owns config block + loader validation
+ the settings section, and its ONLY server product touch is that one resolution seam (CAMT; a
restart may be owed per F-W29-5). Checked: AiModelSection.tsx header ("the ONE place the model is
chosen"), configHandlers.ts:603-644 (writeConfigYaml persistence — the "config data" clause is
already satisfied for (a)), W2-6 draft :463-470, handoff l2t0030 §2 tension flag. Smallest ruling:
"(a)" or "(b)".
OQ4 — GATE GROUNDING RECEIPT: is the backend.log surface=protocol-review line an acceptable B1/B7
evidence leg for the browser reviewer (it cannot read prompt bodies), with the prompt-content itself
pinned by unit test T5? (a) RECOMMENDED yes (PROTO-AI-9's own close used backend.log surface traces
as the grounding receipt); (b) require an orchestrator-run direct probe of POST /api/ai/assist/stream
from the lane-stack before the gate. Checked: PROTO-AI-9 close notes task-list :470/:549 (orch
pre-checks with real endpoint calls), AIHandlers logs surface. Smallest ruling: "(a)".

COMPOSED 2026-10-10 ~01:55 EDT by cl-spec-composer (l2t0030). Every §0 product cite opened
FIRST-HAND this session at code base 78bee2c8 (tip 987bd34c); cl-scout screening twice,
corrections/limits marked (§0.4, F-W29-8). All W2-5/W2-6/W2-8 binds are CAMT — merged trunk wins
at promotion. Nothing here is promoted or dispatched.


---

## PROMOTION NOTE (orch l2t0715, 2026-10-10 ~07:30 EDT) — the OQ2 CAMT-fires condition is RESOLVED EARLY, first-hand at merged trunk f19cfa95:
- OQ2 condition CLEARED: the merged W2-6 semantic pass lands the XDR with candidates[0] =
  {target_kind:'protocol', draft:{kind:'protocol', recordId:`PRT-<CAN>-semantic`, title, steps,
  branch_axes?}} (SemanticFamilyPass.ts:288-312) — the draft body IS protocol kind, so the ruled
  draft-aware apply fn (OQ2(a), reusing exported applyOps) does NOT reopen. The edit path is
  PUT /records/:XDR + expectedSha (M3, W2-8 promotion record).
- W2-6 OQ3(b) machine block CONFIRMED MERGED exactly as re-ruled: AIConfig.semanticPass
  (types.ts:189; fields baseUrl/model/apiKey/maxTokens/temperature/enableThinking/thinkingLevels/
  defaultThinkingLevel) + resolveSemanticPassInference seam (SemanticFamilyPass.ts:65). W2-9's
  /settings section binds THESE keys — no new knob, no second seam.
- Trigger endpoint for the panel affordance (if spec §11 wires one): POST
  /extraction/vendor-candidates/:recordId/semantic-draft, param = CAN-* candidate id (W2-8
  promotion record M1 — same facts).
- STILL OPEN at W2-9 claim: W2-8 merged surface shapes (W2-8 is in-progress on the coder slot at
  this note's time; its merge closes the promotion gate).


---

## OQ RULINGS (orch l2t0810, 2026-10-10 ~08:25 EDT) — binding at promotion; cites re-verified FIRST-HAND at merged trunk (trunk tip 7ac648b8, code f19cfa95-era surfaces):

- OQ1 = (a) APPROVED. Additive AiSurface member 'protocol-review' + buildSurfaceAwarePrompt
  delegates to buildSystemPrompt(context) when context.attachedProtocol is present, mirroring the
  event-editor/workspace.deck delegation at server/src/ai/systemPrompt.ts:408 (verified merged).
  Companion unit test T5 pins the prompt content (stepIds/roles/op vocabulary present under
  surface protocol-review + attached protocol; absent without one).
- OQ2 = (a) CONFIRMED (per l2t0715 promotion note): draft body IS kind 'protocol' at merged
  W2-6 (SemanticFamilyPass.ts:288-312); draft-aware apply fn reusing exported applyOps is the
  ruling; applyProtocolEdit stays byte-untouched.
- OQ3 = RESOLVED BY THE MERGE (the tension is gone): W2-6 OQ3 was re-ruled (b) and the machine
  block MERGED exactly — AIConfig.semanticPass (server/src/config/types.ts:189, verified) +
  loader validation (server/src/config/loader.ts:376-379, verified) + resolveSemanticPassInference
  seam (server/src/ingestion/vendor-protocol/SemanticFamilyPass.ts). The verbatim clause
  "distinct from drafting model / without touching unrelated model settings" IS honorable: the
  /settings section binds the ai.semanticPass keys ONLY (baseUrl/model/apiKey/maxTokens/
  temperature/thinking fields per the merged block) — never the active-profile POST activate
  route. NO new knob, NO second seam, NO re-rule needed. W2-9 owns config block UI + settings
  section; its ONLY server product touch is the settings-resolution seam if a restart-read gap
  is found (F-W29-5).
- OQ4 = (a) APPROVED: backend.log "surface=protocol-review" line is an acceptable grounding
  receipt leg (PROTO-AI-9 close precedent); prompt content is pinned by unit test T5 instead of
  an orch stream probe.
