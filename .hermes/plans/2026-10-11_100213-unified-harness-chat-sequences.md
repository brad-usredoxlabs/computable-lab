# Unified harness chat for the sequences workspace

Status: Implementation spec, drafted 2026-10-11. Not yet executed.
Continues: `.hermes/plans/2026-09-07_220226-three-pane-agent-harness.md` (the agent-harness-for-biology plan), its audit `.hermes/plans/2026-09-12_153932-audit-three-pane-harness.md`, and `.hermes/plans/2026-09-12_154900-phase2-left-nav-tabs-permanent-ai-chat.md` (built `AgentChatPane`).

## Goal

Make `/lab/sequences` a participating surface of the unified agent harness: replace its bespoke right-side `SequenceChat` with the shared harness chat panel, give it a surface-agnostic working-focus header, and let that one conversation drive the sequences surfaces (switch tabs, select records, propose actions) through declarative, Ajv-validated agent actions — never prose parsing.

One chat panel, one chat engine, one working-focus concept, across surfaces. This is the "deliberate integration" the harness plan reserved for nonparticipating routes ("Existing nonparticipating routes retain their layouts until deliberately integrated").

## Target scenario (Brad's 16S alignment example, added 2026-10-11)

The acceptance picture this spec builds toward: while looking at a run, the scientist says **"set up an alignment of all of the 16S sequences in the Gut Microbiome project."** The chat — whichever surface it is docked on — does not freehand anything. It fills a small structured form (`agent_action`: `open-surface`, surface `sequences`, scoped to the Gut Microbiome project, operation `run_mafft`, cohort "16S sequences"). The server validates that form against the YAML contracts, and the app resolves it:

- If a Gut Microbiome project tab is already open (OpenTabsContext), that tab navigates to the sequences surface's alignment view.
- If not, a new tab opens on that project's sequences surface, already navigated to the Analysis tab with the 16S collection selected as input.
- If a requirement is unmet (no configured `mafft` endpoint, no records matching "16S"), the app says so plainly and offers the Setup surface — it never invents a collection or silently runs a guessed cohort.

This makes Phase 4 (cross-surface) concrete and adds two requirements to it: **tab-aware open-surface resolution** and **YAML-declared surface capabilities + prerequisites** (see Phase 4).

## Why this exists

Brad's direction: the app is a biology-specific AI harness — a unified chat panel driving the surfaces — not a per-page sidecar chat. `/lab/sequences` was built outside the Hermes pipeline (checkpoint commit `455232cf`, Oct 3–6 direct working-tree work) and shipped its own chat component. It is functionally already on the harness backend; only the UI panel and focus semantics are bespoke. This spec closes that gap and, as its proof surface, completes the harness plan's unfinished Phase 0/4 (declarative agent-instruction jump/focus) on a surface where the action contract is already rich.

## Verified current state (evidence, read 2026-10-11)

| Area | Observed | Evidence |
|---|---|---|
| Sequences chat UI | Bespoke `SequenceChat` rendered as the shell's `rightPane` | `app/src/sequences/SequencesPage.tsx:108` (`rightPane={<SequenceChat …>}`), `app/src/sequences/SequenceChat.tsx` |
| Sequences chat engine | `useAiChat({ aiContext, endpoint:'sequences', onSequenceProposal, proposalScopeKey })` + `useRegisterAiChat(chat)` | `SequencesPage.tsx:40` |
| Engine transport | `useAiChat` streams via `streamAssist` → `/api/ai/assist/stream` — the SAME agentic loop as the run harness (`AgentOrchestrator`); server already has sequences-surface handling incl. `sequenceIntentTool` and forced-draft for `surface==='sequences'` | `app/src/shared/hooks/useAiChat.ts:11,432`; `server/src/ai/AgentOrchestrator.ts:965,1011,1644`; `server/src/ai/systemPrompt.ts:296-304` |
| Shell | Sequences is ALREADY three-pane (`navPane`=Library, `leftPane`=main, `rightPane`=chat); the `nav \| action \| chat` split renders whenever `navPane` is supplied | `SequencesPage.tsx:101-108`; `app/src/shared/shell/AppShell.tsx:250-293` |
| Registration seam | Every non-run surface (sequences, materials, formulations, protocols, literature, browser) registers its chat into `AiPanelContext` via `useRegisterAiChat`; `useAiPanel()` currently has **no consumer** — the shared panel (`AiChatPanel`) referenced in the comment was removed | `app/src/shared/context/AiPanelContext.tsx:78-95` (comment at :86); grep: `useAiPanel` used nowhere outside its own file |
| Harness chat pane | `AgentChatPane` = `ChatContextHeader` + `AiTabPanel`, hardcoded to run-workspace contexts (`ChatContextHeader` reads `ProtocolSelectionContext`; `AiTabPanel` reads `WorkspaceContext`/`EventEditorContext`) — not portable to sequences | `app/src/agent/AgentChatPane.tsx`; `app/src/event-editor/right-pane/ai/ChatContextHeader.tsx:15`; mounted only by `app/src/graph/RunWorkspacePage.tsx` |
| Action contract | Declarative agent-action schema EXISTS: `action: focus \| open-surface`, targets `protocol-step` or generic `Ref`, `contextNote` may annotate but never override the resolved label; structured output validated by Ajv, never prose-parsed | `schema/workflow/agent-action.schema.yaml`; `server/src/schema/AgentActionSchema.test.ts` |
| Surface registry | `sequences` is a declared surface with `aiRole` | `schema/registry/surfaces/surfaces.yaml:92-97` |
| Threads | Per-endpoint conversation persistence already works: `/api/ai/threads/:endpoint` hydrate + append | `app/src/shared/api/aiThreadClient.ts:12`; `useAiChat.ts:223-305` |
| Proposal path | Sequences proposals land via `onSequenceProposal`: `save_sequence`/`create_oligo` → `SequenceEditor.propose`; everything else → structured-action YAML textarea for review/accept | `SequencesPage.tsx:33-38,107` |

**Bottom line:** the backend unification is already true (one `/api/ai/assist/stream` loop, one thread store, one surface registry, one action contract). What is missing is (1) a shared, surface-agnostic chat PANEL that consumes the registered chat, (2) a focus header that works for non-run surfaces, and (3) the executed agent-action jump/focus (harness plan Phase 0/4, still NOT BUILT per the 2026-09-12 audit).

## Analysis surface: the second proof surface (state of the universal-analysis plan, verified 2026-10-11)

The generalization Brad asks for is already half-built on the other side of the app. The universal data-analysis plan is `specs/analysis.md` (v0.1, 2026-09-05) plus its three execution plans (`.hermes/plans/2026-09-05_150500-analysis-surface-slice-a.md`, `..._153000-storage-instrument-analysis-surface.md`, `..._170500-analysis-model-lifecycle-chained.md` — the last marked **DONE**).

**Implemented (evidence):**
- Record kinds as YAML: `analysis-revision`, `analysis-run`, `analysis-output-artifact`, `view-spec`, `data-reference` (`schema/knowledge/`).
- Server machinery: `analysisService`, `analysisRunner` (spawns isolated Python workers, streams large artifacts to storage as `data-reference`s), `analysisAuthoring` (AI drafts complete Python methods), `artifactPromotion` (A06 "Use Result in New Analysis", idempotent).
- Python SDK `computable_lab_analysis` (`server/python-executor-service/src/`) with `ctx.publish/input/view/metric` and a headless `__main__` replay runner; fixtures incl. train→predict→filter chaining reproducing known values.
- Frontend: `AnalysisPage.tsx` + `ViewRenderer.tsx` with ONLY shipped renderers (`table, signal, metric, static-figure, model, binary`; unknown renderer → visible compatibility error — spec §8 boundary holds).

**Not yet there:**
- The analysis surface has **no chat panel at all** — just an inline "AI-author a method" one-shot textarea (`AnalysisPage.tsx:229-240`). It is not a harness participant; it does not register a chat.
- Live store holds **0 `analysis-run` / 0 `data-reference` / 0 `analysis-revision` records** — the machinery is fixture-proven but no real analysis has been persisted. Harness plan Gate B (qPCR Ct cohort) remains ungrounded; Scenario B/C must never be demoed on fabricated artifacts.
- Deferred per the DONE-status: container isolation, FCS/gating, plate-reader and qPCR reader slices.

**How this extends the plan (analysis joins every phase):**

### Target scenario 2 — the clofibrate fatty-acid query (Brad, 2026-10-11; named acceptance test for the analysis surface)

**"What was the average fatty acid composition of every well treated with clofibrate over the last six months compared to vehicle control?"**

This is Scenario B generalized, and it is the acceptance test because it exercises the whole stack at once:

1. **Treatment identity via the material hierarchy.** "Clofibrate" resolves as a material *concept* → its *formulations* (analyte, concentration, units, basis) → the wells whose biological `context` contains that treatment. Never a text search; a provenance walk. Wells with missing/ambiguous treatment annotations go to an explicit `unknown` bucket with counts, never silently included or excluded.
2. **Cohort via context + measurement time.** Contexts → samples → wells → measurement occurrences, filtered on real acquisition timestamps (declared boundary convention for "last six months"), complete retrieval with count reconciliation — no 500-item truncation, no filename inference.
3. **Controls via context-roles.** "Vehicle control" is found through the declared vehicle-control context-role on real contexts, not well-name guessing.
4. **Method as an inspectable revision.** The AI authors/edits an `analysis-revision` (Python + parameter schema + method notes: analyte identity, replicate weighting, handling of undetermined values). The deterministic runner computes on the **frozen** cohort (membership snapshot + source hashes); the model narrates the grouped table (clofibrate vs vehicle per analyte, units, n-counts, exclusions) but never computes it.
5. **Drill-down provenance.** Every cell in the result opens its contributing wells and their full biological contexts. A rerun next month cannot silently change last month's answer.

Acceptance legs: (a) fully grounded cohort → correct grouped table against a known-answer fixture; (b) missing treatment annotations → explicit unknown counts, honest result; (c) no measurement coverage → explainable "no observations in scope" report, never a fabricated table; (d) refinement turns ("split by passage", "exclude run X") produce new cohort/method revisions linked to the prior work, prior results preserved. Like Gate B before it, the demo-able version of this scenario is gated on real ingestion→observation coverage; the harness, actions, and capability declarations are buildable now.


1. **Phase 1b — mount `HarnessChatPane` on `AnalysisPage`.** Replace the inline author textarea with the unified conversation (register via `useAiChat({ endpoint: 'analysis' })` + `useRegisterAiChat`); the deterministic Run/Cancel/promote controls stay exactly as they are — the chat *orchestrates* them, it does not become them. The right pane today is the results surface; results stay center/right deterministic, chat joins as the harness chat pane (three-pane with a nav pane listing analyses/revisions/runs).
2. **Phase 3 — the same agent actions, analysis targets.** Extend `agent-action.schema.yaml` targets with `analysis-revision`, `analysis-run`, `analysis-output-artifact` focus/open. "Open the output artifact of last week's run" (harness Scenario C) is an `open-surface`/`focus` action resolved through the same navigation service.
3. **Phase 4a — analysis capabilities declared in YAML.** The `surfaces.yaml` capability pattern generalizes directly: analysis declares `author-revision` (requires: prompt + authorized dataset descriptors; effect: analysis-revision draft, reviewPolicy explicit-accept), `run-revision` (requires: revision + resolved frozen inputs + parameters; effect: analysis-run), `promote-artifact`. Sequences declares `run-virtual-pcr`, `run-mafft`, `run-blastn`. One declared-capability grammar for every surface; the orchestrator's per-surface special-casing (e.g. `surface==='sequences'` branches in `AgentOrchestrator.ts`) is the thing this contract is meant to replace — code follows the declared capability data, not surface-name branches (CLAUDE.md rule 2).
4. **The compute boundary is already correct and must not drift.** `specs/analysis.md` §8/§10 and the harness plan agree: the AI writes/edits method *revisions* (inspectable Python, validated manifests), the deterministic runner computes, only shipped renderers display, numbers come from tool results not prose. The unified chat adds no new compute path — it is the front desk for this one.
5. **Data grounding first, as always.** Unifying the analysis chat is safe to build now (UI + actions + declared capabilities). Demoing Scenario B (mean Ct grouped by cell type × treatment × concentration) stays gated on real ingestion→observation coverage, same as the harness plan's Gate B.

## Coordination with active lanes (observed 2026-10-11)

Two pipeline lanes are actively coding in worktrees, merging into `cl/integration-1` (lane 1) and `cl/integration-2` (lane 2); `main` sits at `455232cf` awaiting integration.

**Lane 1 — lab ownership & sharing policy** (plan `2026-10-10_192635-lab-ownership-and-sharing-policy.md`, tasks OWN-1..OWN-6, plus QMS-8 authz fixes): `schema/identity/ownership-policy.{schema,lint,ui}.yaml`, record-union registration, `OWN-LAB-DEFAULT` seed record, `server/src/security/{OwnershipPolicyService,AccessControlService,AuthorizationService}`, Settings page.

**Lane 2 — semantic-protocol-family wave 2 (W2-1..10) + shorthand noun spine (SPINE-1..8, SHORTHAND-CHAT/CORPUS) + PB-CH**: naming crosswalk, provenance ladder, draft lifecycle, semantic pass, SAID/MEANT review surfaces, vocabulary doors — AND active edits to the chat stack: `AiTabPanel.tsx`, `assistStream.ts`, `QuestionsPanel`, `ChangesPanel`, `sidebarState.ts`, a new `ReviewAiPanel` for protocol review, and server-side `AgentOrchestrator.ts` + new `shorthandChat.ts` compile seam + `coerceAgentIntent.ts`.

Impact on this plan:

1. **No file conflicts on the core seams.** Since 2026-10-08 no lane has touched `app/src/sequences/`, `app/src/agent/`, `AiPanelContext`, `aiThreadClient`, `OpenTabsContext`, `schema/registry/surfaces/surfaces.yaml`, or `agent-action.schema.yaml`. Phases 1–2 are safe to build now, branched from post-integration `main`.
2. **Phase 3 collides with lane 2's live churn** — `AgentOrchestrator.ts` and `assistStream.ts` are being edited by SHORTHAND-CHAT right now. Phase 3 must (a) wait for `cl/integration-2` to land, and (b) reuse lane 2's structured-output seams (`shorthandChat.ts`, `coerceAgentIntent.ts`, the clarification-turn mechanism) rather than adding a parallel emission path. The `forceDraftTool` relaxation for sequences must be re-verified against the post-merge orchestrator, not the 455232cf line numbers cited above.
3. **Lane 2's clarification-turn pattern is the pattern to reuse.** SHORTHAND-CHAT puts term confirmation on the chat's clarification turn (Brad's ruling: confirm terms in the review dialogue, never a blocking pre-draft card). `HarnessChatPane` must adopt that mechanism, not build a second one.
4. **Lane 1's ownership policy governs agent actions.** `open-surface` / `focus` / analysis-run effects must pass through `AccessControlService`/`AuthorizationService` and the declared ownership defaults — opening a project tab the scientist has no access to yields an explainable refusal. Phase 4a's `reviewPolicy` references ownership-policy data; it does not invent a parallel policy.
5. **`ReviewAiPanel` (new lane-2 chat panel for protocol review)** is another chat surface. This plan does not touch it, but the unification follow-on should list it as a future `HarnessChatPane` consumer rather than letting a fourth bespoke panel calcify.
6. **Vocabulary doors.** Phase 4a's cohort resolution ("16S") resolves through the noun-spine/crosswalk vocabulary (SPINE/W2-1), not ad-hoc label matching.

## Target shape

```
AppShell (nav | action | chat)            — unchanged
  navPane    = surface's own nav (sequences Library)
  leftPane   = surface's own work
  rightPane  = HarnessChatPane            — NEW shared component
                 ├─ SurfaceFocusHeader    — label from RESOLVED surface state, never AI prose
                 ├─ ChatLog               — promoted from SequenceChat's scroll-follow log
                 └─ composer + cancel     — bound to the chat registered via useRegisterAiChat
```

- `HarnessChatPane` reads the chat from `AiPanelContext` (`useAiPanel().chat`) — the seam every surface already feeds but nothing consumes. One panel serves sequences, materials, formulations, protocols, literature, browser.
- `ChatFocusContext` (new, small): each participating surface publishes its resolved working focus (`{ label, detail?, refs? }`). Sequences publishes `Sequences — <Tab> · <selected record label>`. `ChatContextHeader` (run) delegates to the same context with its existing `ProtocolSelectionContext` fallback — run behavior stays byte-identical.
- Chat drives the surface via the EXISTING `agent-action.schema.yaml`, extended (YAML first) with sequences targets. The server validates with Ajv and emits the action as a structured stream frame; the client executes it (select record / switch tab). A pure user click issues no model call; an AI-authored `contextNote` annotates the header but never overrides it (harness plan §4.1/§5.1 rules preserved verbatim).

## Non-goals / boundaries

- No second chat engine, no second chat store, no second validator (Ajv stays the sole authority). `useAiChat` + `AiThreadStore` + `agent-action.schema.yaml` are reused.
- No redesign of sequences domain records (sequence/oligo-spec/assay-definition/sequence-endpoint/interpretation flows stay as-is).
- Do NOT migrate the run workspace's `AiTabPanel` engine in this pass. `AiTabPanel` is a second, deck-coupled implementation (own reducer + `assistStream` + ghost preview); collapsing it onto `useAiChat`/`HarnessChatPane` is a separate, larger follow-on (see Open decisions).
- Preserve the structured-action YAML review textarea and the `save_sequence`/`create_oligo` → editor-draft handoff exactly as they behave today.
- Preserve the full-page vendor-PDF review experience and existing two-pane routes.

## Phase 1 — Shared `HarnessChatPane` + sequences mount (UI unification)

### Task 1.1 (RED) — HarnessChatPane renders the registered chat
New test `app/src/agent/HarnessChatPane.test.tsx`: render under an `AiPanelProvider` with a stub surface that calls `useRegisterAiChat(fakeChat)`; assert the pane renders `[data-testid="harness-chat-pane"]`, the focus-header slot, the message log with `fakeChat.messages`, and that sending calls `fakeChat.sendPrompt`. Confirm RED (module missing):
```
cd app && npx vitest run src/agent/HarnessChatPane.test.tsx
```

### Task 1.2 (GREEN) — promote `SequenceChat` into the shared log, build the pane
- Move `app/src/sequences/SequenceChat.tsx` → `app/src/agent/ChatLog.tsx` (rename component `ChatLog`; keep its proven follow-latest / ResizeObserver scroll behavior — it is better than a naive `scrollTop` effect; move `SequenceChat.test.tsx` → `app/src/agent/ChatLog.test.tsx` and keep it green).
- New `app/src/agent/HarnessChatPane.tsx`: reads `useAiPanel().chat`; renders `SurfaceFocusHeader` (Phase 2 slot; Phase 1 renders a plain surface label from `aiContext.summary` passed via `ChatFocusContext` — see 2.1, acceptable to land the context first) + `ChatLog` + composer (prompt state local to the pane; `sendPrompt`/`cancelStream` from the chat) + streaming/cancel affordances. Handle `chat === null` (no surface registered) with an honest empty state, not a fake chat.
- `cd app && npx vitest run src/agent` → green; `npx tsc --noEmit -p app/tsconfig.json` → clean.
- Commit: `feat(harness): shared HarnessChatPane consuming AiPanelContext registration`.

### Task 1.3 — rewire SequencesPage
- `SequencesPage.tsx`: replace `rightPane={<SequenceChat …/>}` with `rightPane={<HarnessChatPane />}`; delete `app/src/sequences/SequenceChat.tsx` and its import; the bespoke `prompt` state in `SequencesPage` moves into the pane. `useRegisterAiChat(chat)` (line 40) stays — it is now load-bearing.
- Keep `onSequenceProposal`, the proposal textarea, `sessionStorage` handoff, and Library nav untouched.
- Check `SequencesPage.css` for `sequence-chat` rules → move needed rules into `ChatLog.css`; remove dead ones.
- Unit: `cd app && npx vitest run src/sequences src/agent` green; typecheck clean.
- Commit: `feat(harness): sequences workspace mounts the unified chat pane`.

### Task 1.4 — e2e (rule-12 gate)
New `app/e2e/sequences-harness-chat.spec.ts` (chromium): visit `/lab/sequences`; assert `[data-testid="harness-chat-pane"]` present alongside the Library nav (three-pane); type a prompt, assert a user message appears and streaming state toggles; assert a `save_sequence`-style proposal (stub the stream via the existing e2e stubbing pattern used by `three-pane-harness.spec.ts`) routes to the Editor draft surface, not into chat prose.
```
cd app && npx playwright test e2e/sequences-harness-chat.spec.ts --project=chromium
```

## Phase 2 — Surface-agnostic working focus (`ChatFocusContext` + `SurfaceFocusHeader`)

### Task 2.1 (RED) — focus header derives from resolved surface state
`app/src/agent/ChatFocusContext.tsx`: a tiny provider `{ focus: { surface, label, detail?, refs? }, setFocus }` (surface-local state, published from the host page's RESOLVED state — for sequences: active tab + selected record label; never from AI text). Test: provider + `SurfaceFocusHeader` renders `Working focus: Sequences — Analysis · <record>`; with no selection renders the plain surface label.

### Task 2.2 (GREEN) — implement + wire
- `SequencesPage` publishes focus from `tab`/`selected` (already resolved client state; server-side focus parity is Phase 4's concern).
- `HarnessChatPane` renders `SurfaceFocusHeader` above `ChatLog`.
- `ChatContextHeader` (run pane) delegates: if a `ChatFocusContext` is present use it, else keep the existing `ProtocolSelectionContext` logic unchanged. Run e2e `three-pane-harness.spec.ts` must stay green WITHOUT edits to its assertions (the run header label is unchanged).
- Commit: `feat(harness): surface-agnostic chat focus header`.

### Task 2.3 — e2e
Extend `sequences-harness-chat.spec.ts`: selecting a Library record updates the header label; switching to the Analysis tab updates it; no model call is issued for either (assert via the stubbed network: zero `/api/ai/assist/stream` requests on pure clicks).

## Phase 3 — The chat drives the sequences surfaces (harness plan Phase 0/4, proven here)

### Task 3.1 — YAML first: extend the action contract
`schema/workflow/agent-action.schema.yaml`: add to `target.oneOf`:
```yaml
- type: object
  required: [ kind, recordId ]
  properties:
    kind: { const: sequence-record }
    recordId: { type: string }
    label: { type: string }
  additionalProperties: false
- type: object
  required: [ kind, tab ]
  properties:
    kind: { const: sequence-tab }
    tab: { enum: [ Editor, Assay, Analysis, Setup, Import, Knowledge ] }
  additionalProperties: false
```
The tab enum mirrors the surface's declared tabs; if the tabs become declared data (they are currently a TS `const tabs` in `SequencesPage.tsx:14`), move them into the surface registry entry for `sequences` FIRST and have both the page and this schema read the declared list — YAML is king. Add validation tests to `server/src/schema/AgentActionSchema.test.ts` (valid sequence-tab/sequence-record; invalid tab rejected).

### Task 3.2 — server: emit validated actions as structured frames
In the sequences turn (`server/src/ai/AgentOrchestrator.ts`, `sequenceIntent.ts` path): when the model's tool call resolves to a navigation/focus intent (not a mutation proposal), emit an `agent_action` stream frame containing the action object validated against `agent-action.schema.yaml` by Ajv before emission. Invalid actions produce an explainable tool result, never a frame. Note the current `forceDraftTool = true` for `surface==='sequences'` (AgentOrchestrator.ts:965,1011) forces every turn into a draft; relax it so a pure `focus`/`open-surface` turn may answer without mutating (harness plan §5.2: "a prose/lookup turn must answer without mutating"). This routing stays declared (tool choice in the orchestrator's declared capability set), not keyword-hardcoded.

### Task 3.3 (RED→GREEN) — client handler
`app/src/sequences/applyAgentAction.ts` (pure function over `(action, surfaceState)` → `{ tab?, selectedRecordId?, message? }`) + unit tests: `sequence-tab` switches tabs; `sequence-record` selects a record (respecting `editorRef.canLeave()` — an unsaved editor draft must block the jump with an honest message, same rule as `selectRecord` today, `SequencesPage.tsx:47`); unknown target → explainable result, no state change. Wire the frame in `useAiChat`'s stream handling (it already parses stream events) → `SequencesPage` executes via the SAME `selectRecord`/`setTab` paths a human click uses — one navigation service for clicks and agent actions (harness plan §5.1).

### Task 3.4 — tests + e2e
Server: `npm run test:run -w server` (schema + orchestrator emission tests). App unit: handler tests green. e2e: ask (stubbed stream emitting a valid `agent_action`) → Analysis tab opens / a record selects; assert the header focus label follows; assert a `contextNote` never replaces the resolved label.

## Phase 4 — Cross-surface conversation + tab-aware open-surface (staged, gated — NOT in this pass by default)

Harness plan §6 requires "stable conversation IDs independent of endpoint, route, or component mount." Today threads are per-endpoint (`/api/ai/threads/sequences` vs `/threads/run`). Making ONE conversation follow the scientist across surfaces needs: conversation identity in data (existing conversation schema promotes threads into YAML records), focus-transition recording, and a migration of per-endpoint threads. This is its own reconciliation task against §6 — scope it as a follow-on spec after Phases 1–3 ship. Do not silently collapse per-endpoint threads in Phase 1.

Two additions per the 16S target scenario above:

**4a — YAML-declared surface capabilities and prerequisites.** Extend `schema/registry/surfaces/surfaces.yaml` (per harness plan §5.1: "extend the existing surface registry with supported capabilities, target kinds, input/output schema refs, validation requirements, and effect/review policy"). For `sequences`, declare e.g.:
```yaml
capabilities:
  - operation: run_mafft
    requires:
      inputs: [sequence-collection]        # what must be resolvable from records
      endpoint: sequence-endpoint          # a configured, verified endpoint record
      endpointEngine: mafft
    effect: analysis-run                   # what it may create
    reviewPolicy: explicit-accept          # scientist owns scientific edits
```
The agent may only propose capabilities the surface declares; the server checks the prerequisites against real records before any navigation/draft, and an unmet prerequisite yields an explainable result (missing endpoint → point at Setup), never a fabricated substitute. A lint/UI companion keeps the declared capability list and the surface's actual action contract (`sequenceRequestFidelity`/contract endpoint) in sync — code reads the YAML, makes no policy decisions.

**4b — Tab-aware open-surface resolution.** `open-surface` actions resolve through the SAME navigation service human clicks use (`openContent` + `OpenTabsContext`): find an existing tab whose scope matches the target (project/run), navigate it; otherwise open a new tab at the registered surface `path` with the resolved focus (tab, collection ref) as initial state. The action frame is engine-agnostic — both `HarnessChatPane` (useAiChat surfaces) and the run pane's `AiTabPanel` consume the same validated `agent_action` frame through one shared client-side `applyAgentAction` dispatcher. Acceptance test = the 16S scenario end to end, both tab states (already-open and not-open), plus the unmet-prerequisite path.

## Verification summary

| Gate | Command | Expected |
|---|---|---|
| App unit | `cd app && npx vitest run src/agent src/sequences` | all green |
| Run-harness regression | `cd app && npx vitest run src/run src/event-editor/right-pane/ai` | all green, unchanged |
| Server unit | `npm run test:run -w server` | green (incl. new agent-action target tests) |
| Typecheck | `npm run typecheck` | exit 0 |
| e2e (rule 12) | `cd app && npx playwright test e2e/sequences-harness-chat.spec.ts e2e/three-pane-harness.spec.ts --project=chromium` | all pass |
| Browser check | live `/lab/sequences` on :5174 with the local model configured; one real prompt → streamed reply in the shared pane; a real "open the Analysis tab" → tab switches via validated agent action | observed, receipts under `~/.hermes/cl/receipts/` if the browser reviewer is run |

## Risks, tradeoffs, open decisions

1. **Two chat engines remain.** `HarnessChatPane` unifies the `useAiChat`-based surfaces (sequences, materials, formulations, protocols, literature, browser). The run workspace keeps `AiTabPanel` (deck-coupled ghost preview, TermPanel, QuestionsPanel). Collapsing run onto the shared pane is the real end-state but is a large refactor of draft/preview semantics — deliberately out of scope here; flag it as the next spec. Until then "unified" means: one panel component + one engine for all non-deck surfaces, and the run pane visually aligned (same header pattern).
2. **Two message renderers.** `MessageLog` (AiTabPanel's reducer state) vs `ChatLog` (promoted SequenceChat, `ChatMessage[]`). Consolidation deferred until the engine decision in (1); do not force an adapter now.
3. **Composer parity.** `HarnessChatPane` starts with the plain composer (as sequences has today). `AiTabPanel`'s TipTap composer + term/clarification panels is richer; adopting it here is a follow-on once friction-first behavior is confirmed (Brad's ruling: snappy+acceptable beats correct-but-slow).
4. **forceDraftTool relaxation (3.2)** changes sequences turn routing — a regression test must confirm drafting still happens for authoring requests ("save this sequence") while pure navigation answers without a draft.
5. **Tab enum as data.** If the sequences tabs move to the surface registry (3.1), `SequencesPage.tsx` must read them from the declared entry; if Brad prefers keeping the TS const for now, the schema enum is authored by hand and a compatibility test asserts they match — a stopgap, not the end state.
6. **`canLeave()` guard.** Agent-driven record switches must honor the unsaved-draft block exactly like human navigation (3.3) — a jump that silently discards an editor draft is a hard-stop violation of the draft-retention rule.
7. **No hardcoding.** The pane must work with zero registered chat (honest empty state), with the model unavailable (`aiAvailable` false → existing health affordance), and with the action schema removed (server reports missing configuration rather than inventing actions).

## Definition of done (this pass)

- `/lab/sequences` right pane is `HarnessChatPane` (no `SequenceChat.tsx` in the tree).
- Focus header shows the resolved sequences focus and follows tab/record changes without a model call.
- One real local-model conversation can switch the sequences tab and select a record through an Ajv-validated `agent_action` frame; invalid/unknown actions produce explainable results and no state change.
- Run-workspace harness e2e (`three-pane-harness.spec.ts`) passes unmodified.
- All gates in the verification table green, browser-verified per SOP rule 12.
