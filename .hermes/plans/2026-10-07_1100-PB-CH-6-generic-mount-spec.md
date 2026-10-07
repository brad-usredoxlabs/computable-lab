# SPEC — PB-CH-6: Follow-on mount: Analysis-local chat + ONE scout-named generic useAiChat consumer

Status: DRAFT for orchestrator review (composer l2t0720, 2026-10-07 ~08:50 EDT). NOT dispatchable until promoted.
Baseline trunk at spec time: `cl/integration-2` @ **8bfa6c1f** (docs tip; code tip **88496f2c** = PB-CH-4
fix1+fix2 merged — the `sendChat` single-choke-point version). PB-CH-4's browser GATE still owes a verdict
(handoff 2026-10-07_0810: run-4 fresh-thread plan); PB-CH-5 not yet claimed. This item **deps PB-CH-4 AND
PB-CH-5**: gate before first write (coder records both):
`git merge-base --is-ancestor 88496f2c HEAD` AND `git merge-base --is-ancestor <PB-CH-5-MERGE-SHA> HEAD`
(SHA unknown at spec time — pin it at claim; the PB-CH-5 report records it).

## Goal (one sentence)
Extend the generic AI stack (`app/src/shared/hooks/useAiChat.ts` + `app/src/shared/api/aiClient.ts` +
`app/src/types/ai.ts`) to understand the wave-1 channel envelopes (workstate_proposal / agent_action) WITHOUT
forking the wave-1 card/compile/accept machinery — extracted once into a shared flow hook — so that (1)
`/analysis` gets a real local chat + proposal card (none exists today), and (2) exactly ONE scout-named live
generic `useAiChat` consumer gains the same behavior, with every missing capability rendered as an explicit,
tested diagnostic — never a silent no-op control.

## RECON (composer did this read-only at 8bfa6c1f; every cite opened by the composer)

### (a) Who owns the Analysis tab's AI panel today — ANSWER: nobody. There is no chat surface at /analysis.
Trace: surfaces registry `analysis` (`schema/registry/surfaces/surfaces.yaml:57-62` — id `analysis`, path
`/analysis`, **no `params`** → header comment lines 11-16: no-params surfaces are AI-CONTEXT surfaces, not
deep-linkable) → `app/src/App.tsx:206` routes `/analysis` → `app/src/analysis/AnalysisPage.tsx` (lazy at :69).
`AnalysisPage.tsx` (full read) renders AppShell + WorkspaceTabStrip + two panes; its ONLY AI affordance is the
one-shot **"AI-author a method" box** (`AnalysisPage.tsx:228-239`, data-testids `analysis-ai-author` /
`analysis-ai-prompt` / `analysis-ai-author-btn`) which calls `apiClient.draftAnalysisRevision` (:96-97 → the
`/analysis-revisions/draft` route) — NOT `useAiChat`, NOT `/ai/assist/stream`: no message list, no SSE envelope
handling, no thread persistence, no proposal card. **Scope statement (explicit, per the task's "if absent, say
so"): PB-CH-6 CREATES the Analysis-local chat; it does not modify an existing one.** No "owner" exists to
enable — the mount is new UI on `AnalysisPage`, composed from the existing channel parts.
Mount feasibility, verified: `/analysis` lives under `App.tsx`'s `OpenTabsProvider` (`App.tsx:127-128` +
`<SessionSync/>` wired to `useSessionSync` at `App.tsx:93`) → `useWorkstateExecutor` + accept-driven tab
adoption work there structurally. What does NOT work: mounting `AiTabPanel` itself — it requires
`useWorkspace()` (`AiTabPanel.tsx:139`), which THROWS outside `<WorkspaceProvider>`
(`event-editor/workspace/WorkspaceContext.tsx:217-219`). AnalysisPage has no WorkspaceProvider. So the
Analysis mount is a NEW slim panel reusing the shared pieces (below), NOT AiTabPanel dragged onto the page.

### (b) Every generic useAiChat consumer, enumerated, and the ONE live-routed one.
Direct call sites (grep `useAiChat(` app/src, production files only; each opened or trace-verified):
| # | Consumer | Cite | Routed? | Provider (AiPanelProvider) | State carried |
|---|---|---|---|---|---|
| 1 | `editor/MaterialsPage.tsx` | :46 (`endpoint:'browser'`) | **NO** — zero importers repo-wide (grep `/MaterialsPage'` = 0) | registers (:47) | page ctx only |
| 2 | `editor/FormulationsPage.tsx` | :640 | **NO** — zero importers | registers (:641) | page ctx |
| 3 | `literature/PdfProtocolBuilder.tsx` | :127 (`endpoint:'literature'`, surface `protocol-builder` ctx: pdfUrl/pageCount/selectedText :113-124) | **YES** via `/literature?view=build` (App.tsx:181 → LiteraturePage → LiteratureBody:111 `view === 'build'`) | inside LiteratureBody's provider (LiteratureBody.tsx:64-68) but does NOT register; renders its chat **locally** via `LiteratureRightPanel` (:221 → `LiteratureRightPanel.tsx:86-98` message list) | url view + recordId + pdf selection |
| 4 | `literature/LiteratureBody.tsx` | :73-74 (`endpoint:'literature'`, registers) | **YES** `/literature` | YES (owns it :64-68) | searchParams view/recordId |
| 5 | `knowledge/LiteratureExplorer.tsx` | :65-66 (no endpoint = memory-only) | via `/literature?view=explore` (default view, `resolveLiteratureView` :39-42) | registers into outer provider | selectedSource/searchQuery/preview ctx |
| 6 | `graph/LabwareEventEditor.tsx` | :1011-1021 (the ONLY consumer with real editor workspace state — deck placements + `onAcceptEvent: addEvent` + `onAddLabwareFromRecord`) | **NO page route.** Importers: `main.tsx:14` ONLY as the `?screen=labware-editor&fixture=` kiosk (main.tsx:11-31) and `graph/RunEditorRouter.tsx:8`, which itself has **zero importers** | fixture route has AiPanelProvider (main.tsx:19-26); the panel `<Slot name="chat.panel.global">` renders **NullSlot** on this host (see below) | full deck/editor state |
| 7 | `graph/RunWorkspacePage.tsx` | :61-62 (`endpoint:'event-editor'`; chat passed to RunOverviewTab/RunBiologyTab/… → RunAiSummary/RunAiSuggestions `sendPrompt` buttons) | **NO** — dead: App routes `./run/RunWorkspacePage` (App.tsx:44), `graph/RunWorkspacePage` has ZERO importers | registers | run tabs ctx |
| 8 | `protocol-ide/ProtocolIdePage.tsx` | :184-185 | **NO** — only importer is `protocols/ProtocolsBody.tsx:23` (lazy), and ProtocolsPage/ProtocolsBody are unrouted: `/protocols` → `LegacyModeRedirect` (App.tsx:180) | registers | foundry ctx |
| 9 | `browser/BrowserBody.tsx` | :129-130 | **NO** — BrowserPage unrouted (`/browser` → LegacyModeRedirect App.tsx:179; BrowserPage importers = 0) | registers | browser ctx |
| 10 | `protocols/ProtocolsBody.tsx` | :79-80 | **NO** (App.tsx:180 redirect) | registers | protocols ctx |
| 11 | `run/RunWorkspacePage.tsx` | — does NOT use useAiChat; mounts `AgentChatPane` → `AiTabPanel` (`run/RunWorkspacePage.tsx:138`, `agent/AgentChatPane.tsx:2-12`) = the PB-CH-4 wave-1 mount (NOT a generic consumer) | YES `/runs/:runId` | n/a | n/a |

Overlay fact that decides everything about "consumer" (all verified, plus one LIVE measurement): the AI chat
PANEL for context-registered chats is an extension slot — `protocols/ProtocolsPage.tsx:23`
`<Slot name="chat.panel.global">`, `literature/LiteraturePage.tsx:19` `chat.panel.literature`. On THIS host
`VITE_AI_OVERLAY` is unset — I measured the served module: `curl :5193/src/extensions/loadOverlay.ts` shows an
env WITHOUT VITE_AI_OVERLAY → `OVERLAY_ENABLED=false` (`loadOverlay.ts:17-20`) → `defaultManifest` = empty
slots (`defaultRegistry.ts:18-21`) → every `<Slot>` renders `NullSlot` ("AI feature unavailable. Install an AI
overlay.", `extensions/NullSlot.tsx`, `ExtensionContext.tsx` Slot fallback). `useAiPanel()` has ZERO in-repo
consumers (grep = definition + a vite.config comment only; the renderer lives in the absent overlay). So on the
lane host, a context-registered chat (rows 4,5,6) has NO visible renderer — visible chat exists only where the
page renders it locally (row 3).

**Named consumer (the ONE):** the task demands provider + workspace state named BEFORE coding. Plain finding,
per the task's own fallback clause: on the lane host there is **no consumer that has an AiPanelContext-driven
renderer** (renderer lives in the missing overlay), and **no useAiChat consumer maps to a surfaces-registry id**
(the AiSurface union `types/aiContext.ts:8-18` is a separate app-level vocabulary from
`surfaces.schema.yaml:33`). The closest honest candidates, both live-routed at `/literature`:
- **RECOMMENDED (prop, needs orch ruling — OQ1):** `literature/PdfProtocolBuilder.tsx` as rendered from
  `literature/LiteratureBody.tsx:111` — component path `app/src/literature/PdfProtocolBuilder.tsx:113-127`
  (own `useAiChat` + visible `LiteratureRightPanel` AI tab chat renderer at :221 — the ONLY browser-visible
  generic chat on the bare host), registry id: **none exists** (AiSurface `protocol-builder`; the nearest
  registry surface is `protocol-review` = `/ingestion/vendor-pdf/:recordId`, a different page), URL
  `http://localhost:5193/literature?view=build`. Provider: LiteratureBody's `AiPanelProvider` (LiteratureBody.tsx:64-68).
  State: pdfUrl/pageCount/selectedText + url view/recordId. Alternative same-URL: `LiteratureBody.tsx:73-74`
  itself (registers, but invisible on bare host → mounting the channel there without a local renderer IS the
  forbidden silent no-op unless the renderer also lands).
- `LabwareEventEditor.tsx:1011` has by far the richest workspace state (`onAcceptEvent`, labware additions, deck
  placements) but is fixture-route-only (`?screen=labware-editor&fixture=`) and its panel is a NullSlot — it is
  NOT "a real consumer" of the routed app; inventing it as the named consumer would violate "no invented
  consumers." It stays named-here-as-rejected for the reviewer.

### (c) What the generic mount MUST reuse without forking (where each lives TODAY)
- **Channel envelope handling:** server emits the workstate event on `/ai/assist/stream` —
  `server/src/ai/AgentOrchestrator.ts:2163-2223` (compose_workstate branch; verbatim emission
  `onEvent?.({type:'workstate_proposal', workstate})` at **:2199**, inside run(), always before `done` — the
  ordering cite fixed by fix2 points at `AIHandlers.ts:458` assistStream). App-side wave-1 parsing lives in
  `event-editor/right-pane/ai/assistStream.ts` (union members :204-210, `dispatchFrame` cases :378-392) — used
  by `useChatThread` ONLY. The generic stack's parser `shared/api/aiClient.ts streamAssist` (:171-313; endpoint
  select :234-236: non-`event-editor` surfaces → `/ai/assist/stream` — the SAME endpoint) already passes ANY
  JSON frame through `parseSSEBlock` (:99-120) but `types/ai.ts:96-106` `AiStreamEvent` has NO
  `workstate_proposal`/`agent_action` member → today `useAiChat` silently drops such frames (falls through the
  loop `useAiChat.ts:420-544`) — **that silent drop is precisely the defect class PB-CH-6 closes.**
- **Proposal-card behavior:** `event-editor/right-pane/ai/WorkstateProposalCard.tsx` — actionable ONLY from a
  server `canAccept:true` compile (header rule :1-12; phases `compiling|review|blocked|applied` :17); consumed
  by `AiTabPanel.tsx:1122`-ish render + compile POST with `adapter:'workstate'` at :627-628; the
  compile→card→accept orchestration currently sits INLINE in AiTabPanel (`workstateTurnRef` :352, :367-368,
  :621; the single `sendChat` choke point :734-737, merged fix2 at 88496f2c).
- **Compiled-accept lifecycle:** `apiClient.acceptWorkstateDraft({draftId,revision,reviewHash})` →
  `executor.applyAcceptedWorkstate(body, {accepted:true}, identity)` (`AiTabPanel.tsx:678-683`) →
  `shared/session/useWorkstateExecutor.ts:79-121` (attestation required, duplicate guard,
  `useApplySessionDocument` = OpenTabs replaceState, navigate to `tabPath`); push happens ONLY through
  `useSessionSync`'s existing debounced effect. The executor's absent-provider behavior is ALREADY the tested
  conservative shape (`useWorkstateExecutor.ts:5-9`: NO_TAB_STORE / NO_FOCUS_PROVIDER diagnostics — consume it,
  do not add fallbacks).
- **Never an accept-time AI call, zero-writes-on-reject, flat accept body** — PB-CH-3/4 contract, pinned by
  `AiTabPanel.workstate.test.tsx` (14 tests, measured green at 8bfa6c1f) and
  `useChatThread.agentAction.test.tsx` — these are the regression net for any extraction refactor.

## VERIFIED baseline (composer-measured `[m]` at trunk 8bfa6c1f; `[i]` inherited)
- `cd app && npx tsc --noEmit` → **34 `error TS` lines [m]** (file-set pin; re-verify at claim).
- `cd app && npx vitest run src/shared/hooks src/shared/api` → **[m] 3 files PASS / 26 tests; 1 FAIL =
  `useAiChat.surfaceContext.test.ts`** — a gitignored SYMLINK into Brad's live tree (`ls -la` shows
  `-> /mnt/vast/home/brad/git/computable-lab/...`), environmental env-red; report, never fix. Bar: 26 PASS +
  your new files green, failing-set identical.
- `cd app && npx vitest run src/event-editor/right-pane/ai` → **[m] 26 files PASS / 197 tests; 3 FAIL, ALL
  symlinks** (`ParameterAnswerInput.test.tsx`, `draftChanges.test.ts`, `useChatThread.deckLayout.test.tsx` —
  `ls -la` verified). Included positives: AiTabPanel.workstate **14**, protocolEdit **9**, runPageSurface **7**,
  WorkstateProposalCard, ChangesPanel — the extraction-regression net.
- `cd app && npx vitest run` full-app → **[i] 53 failed files / 63 failed / 1945 passed (287 files)** pin from
  the PB-CH-5 spec composer-run at ed397216; ClarificationPicker ±1 flake class tolerated by SET comparison;
  bar: zero NEW failing files vs the set.
- Stack health **[m this session]**: `:3093 /api/health` 200 (schemas 185, ai available, model
  qwen3.8-flash-next via thunderbeast), `:5193` 200; served `loadOverlay.ts` module lacks VITE_AI_OVERLAY.
- Trunk facts **[m]**: `ebec9ad0` and `ed397216` are ancestors of HEAD (fix chain merged); handoff
  2026-10-07_0810 records PB-CH-4 gate run-4 still owed, fleet lock FREE, PB-CH-5 dispatch next tick.
- UNVERIFIED (declare, do not assume): whether the model reliably emits `compose_workstate` on NON-deck generic
  surfaces via the forced tool (the orchestrator branch runs in run() for any assistStream turn, but lane-gate
  history shows compliance flakiness on generic surfaces). The First-targeted-check curl below measures it
  before any wiring; if it never emits on `analysis`/`literature` at historyLen≈0 with the lane profile, that
  is a model-compliance item for the orchestrator, NOT a reason to fake the card (see reviewer bait).

## Design (exact, minimal)

### 1. Envelope awareness in the generic stack (the "both envelope variants" of the task)
- `app/src/types/ai.ts`: add `| { type: 'workstate_proposal'; workstate: Record<string, unknown> }` and
  `| { type: 'agent_action'; action: … }` to `AiStreamEvent` (:96-106) — additive members mirroring
  `assistStream.ts:204-210` exactly (same wire shape from the SAME handler; two unions must not drift → a
  source-pin test asserts the member shapes).
- `shared/hooks/useAiChat.ts`: extend `UseAiChatOptions` (:149-164) with OPTIONAL
  `onWorkstateProposal?` / `onAgentAction?` callbacks, called in the sendPrompt event loop (the `for await` at
  :421-544) for the two new event types, with the same never-break-the-turn wrapper style the existing
  `pipeline_diagnostics` branch (:442-456) uses. Absent callbacks ⇒ the frame is surfaced as a NAMED system
  bubble (`'The assistant proposed a workspace change but this page cannot show proposal cards yet.'`-class
  message — reuse the precedent at :519-530's empty-success system message), NEVER swallowed. Text/draft
  compatibility: every existing branch byte-identical.
- `shared/api/aiClient.ts`: **target ZERO product diff** — `streamAssist` already posts `/ai/assist/stream`
  (:236) for non-event-editor surfaces and `parseSSEBlock` is type-agnostic (:99-120). Diff allowed ONLY for
  typing. (Files-line honesty: the task lists aiClient.ts; the honest finding is it may not need to change.)
- `app/src/shared/context/AiPanelContext.tsx`: ZERO diff. The mount renders locally (props), NOT via
  `useAiPanel()` — that path dead-ends in the missing overlay on this host (recon (b)).

### 2. The shared flow — ONE extraction, zero forks
- NEW `app/src/shared/ai/useWorkstateProposalFlow.ts` (+test): lift AiTabPanel's inline orchestration —
  compile POST (`adapter` as a parameter, `client.ts` `compileWorkstateDraft` already takes it), card phase
  machine (compiling/review/blocked/applied), pending-identity supersede, accept via
  `acceptWorkstateDraft` + `executor.applyAcceptedWorkstate`, reject = abandon-zero-writes — into this hook
  consumed by BOTH AiTabPanel and the new mounts. `AiTabPanel.tsx` diff = behavior-preserving refactor to
  consume it (its 14+9+7 green tests + `WorkstateProposalCard.test.tsx` are the byte-green proof; the
  `sendChat`/`workstateTurnRef` sites :352/:367/:621/:734-737 STAY in AiTabPanel — they guard the AiTabPanel
  turn model, not the flow). `WorkstateProposalCard.tsx` props may gain OPTIONAL fields only if a mount needs
  one; phases/trust rule byte-frozen. If extraction cannot preserve AiTabPanel behavior byte-identically, STOP
  (turn-ownership stop-boundary, architect).
- `useWorkstateExecutor`: CONSUMED, zero hunks. NO second executor, no NO_TAB_STORE fallback hardening.

### 3. Analysis-local mount (`/analysis`)
- `app/src/analysis/AnalysisPage.tsx`: right-pane chat section — compact message list + input + health-gated
  send via `useAiChat({ aiContext })` (NEW `AiSurface` value `'analysis'` in `types/aiContext.ts:8-18`) +
  `useWorkstateProposalFlow` rendering `WorkstateProposalCard` inline in the panel. The existing
  `analysis-ai-author` box stays byte-identical (PB-CH-5 depends on it). Mount-time call set stays
  `listAnalysisRevisions`/`listAnalysisRuns` only (`AnalysisPage.tsx:60-71`) until the user sends (PB-CH-5's
  no-execute spy test must stay green).
- `server/src/ai/systemPrompt.ts`: add `'analysis'` to the server `AiSurface` union (:281-291) — additive;
  `getSurfacePreamble` (:374-378) already falls through to the generic prompt with empty preamble, which is the
  intended behavior; NO new preamble/prompt-template unless the precheck shows the generic prompt can't drive
  the forced tool (then report, don't invent).
- Accept semantics on `/analysis`: the workstate document is the SHARED session document (App-level
  OpenTabsProvider/SessionSync) — accept opens record-edit/analysis tabs exactly as PB-CH-5 projects them and
  navigates via the executor's existing `tabPath` move. Two-context sync (pending-vs-accepted) repeats here.
- Reject on `/analysis`: zero writes, `/api/session` byte-identical (re-verify by API, per task).
- Missing-capability arms, each named + tested: AI unhealthy (`aiAvailable===false` from
  `useAiChat.ts:318-326` getAiHealth) ⇒ visible disabled input + reason line, never a dead button;
  no-tab-store (only reachable in unit trees) ⇒ executor NO_TAB_STORE diagnostic surfaced verbatim;
  `canAccept:false` ⇒ card blocked phase (existing, unchanged).

### 4. The ONE generic consumer (pending OQ1 ruling)
- Per recommendation: PdfProtocolBuilder's chat gets the proposal card by composing the SAME
  `useWorkstateProposalFlow` (its `useAiChat` call gains the two callbacks via the flow hook). Its surface
  stays `protocol-builder` — NO new AiSurface unless OQ1 rules otherwise. No other consumer file gets a hunk;
  the dead rows (Materials/Formulations/ProtocolsBody/BrowserBody/graph-RunWorkspacePage/ProtocolIdePage/
  LabwareEventEditor) are explicitly OUT — no 26-page sweep, no cleanup of dead code.

### 5. Explicitly OUT of scope (zero hunks — reviewer-bait territory)
- `app/src/chat/ChatPage.tsx` + `chat/chatClient.ts` — standalone ChatPage stays OUT (it proxies
  `/ai/chat/stream`, a raw chat passthrough with no channel — header `ChatPage.tsx:1-14`; route App.tsx:208).
- `useWorkstateExecutor.ts`, `workstateExecutor.ts`, `sessionYaml.ts`, `tabId.ts`, `useSessionSync.ts`,
  `OpenTabsContext.tsx`, `assistStream.ts`, `useChatThread.ts` — wave-1/3 frozen, consumed.
- `AiDraftBar` (`app/src/components/registry/AiDraftBar.tsx`) — ledger §7: no revival (it EXISTS on trunk;
  touching it = automatic reject).
- Dead consumer files (list above); dead `graph/RunEditorRouter.tsx` — do NOT delete "to help".
- ALL schema/** and config/** YAML (including `surfaces.yaml` — the `analysis` surface keeps NO params per
  PB-CH-5 OQ1 ruling; no deep-linking), `server/src/drafts/**`, `server/src/ai/AgentOrchestrator.ts`,
  `submitSuggestionTool.ts` (six-intent enum untouched by this item; PB-CH-5 owns enum changes),
  `routes.ts`. `server/src/ai/systemPrompt.ts` hunk = the one additive union member ONLY.
- `apiClient.compileWorkstateDraft/acceptWorkstateDraft` (`shared/api/client.ts`) — consumed as-is (PB-CH-5
  widens the adapter field there; re-verify shape at claim, do not re-widen).
- Any second SSE parser, any WebSocket, any per-page copy of the flow, any executor logic in AnalysisPage.

## Acceptance criteria (from the task list, VERBATIM — task-list.md:1646-1652)
> Red-first hook/SSE tests for both envelope variants + text/draft compatibility + missing-provider
> path + tool-traces-never-execute. Independent browser review on named surfaces (Analysis AI panel,
> run AiTabPanel regression, the scout-named consumer): proposal + accept flows repeat on the
> mounted path incl. pending-vs-accepted two-context sync. Screenshots: analysis-local-proposal.png,
> analysis-local-accepted.png, generic-<approved-surface-id>-action.png,
> generic-<approved-surface-id>-proposal.png, run-channel-regression.png.

Also verbatim (task-list.md:1633-1642, the description): "Mount the same channel/executor in the generic stack
(app/src/shared/hooks/useAiChat.ts + shared/api/aiClient.ts), reusing proposal-card behavior + compiled-accept
lifecycle — no forks. Scout FIRST which stack actually owns the Analysis AI panel; enable Analysis-local
composition through its owner. For the generic mount, scout identifies exactly ONE real useAiChat consumer with
provider + workspace state and names it (component path, registry id, URL) BEFORE coding — no 26-page sweep, no
invented consumers. Missing capability = explicit tested behavior, never a silent no-op control. Stop-boundary:
absent providers or turn-ownership conflicts return to architect; standalone ChatPage stays OUT (raw proxy, no
channel); no second executor, no AiDraftBar revival (ledger §7)." Files line: "useAiChat.ts, aiClient.ts,
shared channel/card integration, Analysis panel mounting, the one approved consumer."
Note the description assumes an Analysis-panel "owner" exists; recon (a) proves none does — the spec's mount IS
the answer to "through its owner" and the orchestrator should record that ruling when promoting.

### Red-first test matrix (mirrors the verified-by block)
| Criterion | Named test | Where |
| --- | --- | --- |
| envelope variant A: draft-events text/draft compat | `useAiChat.textDraft.compat.test.tsx`: existing event loop behavior unchanged (status/text_delta/draft/pipeline_diagnostics/done arms byte-green; 26 baseline tests stay green) | app hooks |
| envelope variant B: assist + channel frames | `useAiChat.channelEnvelopes.test.tsx`: workstate_proposal frame ⇒ callback fires with verbatim payload; agent_action ⇒ callback; NO callback registered ⇒ NAMED system bubble, frame not swallowed (assert text present) | app hooks |
| union pin, no drift | `aiStreamTypes.pin.test.ts`: the two new `AiStreamEvent` members structurally match `assistStream.ts`'s members (source-pin/golden) | app |
| missing-provider path | `analysisChat.health.test.tsx`: getAiHealth false ⇒ input disabled + named unavailable message + send never fires fetch; executor NO_TAB_STORE diagnostic surfaced verbatim in unit tree | app |
| tool-traces-never-execute | `useAiChat.tracesNoExecute.test.tsx`: tool_call/tool_result/agent_action frames with fetch-spy ⇒ ZERO `/drafts/accept`, ZERO session PUT, ZERO `/ai/assist/stream` during a trace-only turn | app |
| card lifecycle on generic stack | `useWorkstateProposalFlow.test.ts(x)`: no accept control until `canAccept:true`; blocked diagnostics; double-accept duplicate-guard; accept = exactly ONE accept fetch + ZERO stream calls; reject = zero writes | app shared/ai |
| AiTabPanel refactor byte-green | existing `AiTabPanel.workstate` 14 + `protocolEdit` 9 + `runPageSurface` 7 + `WorkstateProposalCard.test` PASS UNTOUCHED; AiTabPanel diff contains NO new behavior asserts-failing edits | app (regression) |
| Analysis mount honesty | `AnalysisPage.chat.test.tsx`: mount still fires ONLY listAnalysisRevisions/listAnalysisRuns (no execute/promote/assist); card renders inside panel on callback; accept navigates via executor outcome | app |
| consumer mount (per OQ1) | `pdfProtocolBuilder.card.test.tsx` (or ruled equivalent): card appears on workstate_proposal; text chat unaffected | app |
| envelope pin server-absent-not-undefined | new `AiStreamEvent` members: optional fields ABSENT, not `undefined` (app strict conditional-spread convention) | app |

## First targeted check (run EARLY, before any wiring — proves the approach early)
Single clean-turn precheck on the lane stack proving the server already carries channel frames to a GENERIC
surface (the whole item's load-bearing assumption):
```
curl -sN -X POST http://localhost:3093/api/ai/assist/stream \
  -H 'Content-Type: application/json' -H 'x-user-id: <lane user>' \
  -d '{"prompt":"compose the workspace: open the analysis surface","surface":"analysis","context":{},"history":[]}'
```
Expected: at least one `data:` frame containing `"type":"workstate_proposal"` (or `agent_action`) BEFORE
`done`, mirroring `AgentOrchestrator.ts:2199`. Repeat with `"surface":"literature"` (the consumer surface).
If BOTH return prose-only at historyLen=0 on the lane profile (qwen3.8-thunderbeast), STOP and report
model-compliance (orchestrator owns the profile/endpoint; gate run-3 precedent AS-LANE2-PBCH4-GATE3-
HISTORY-CONTAMINATION says use FRESH threads). Then the RED vitest file:
`cd app && npx vitest run src/shared/hooks/useAiChat.channelEnvelopes.test.tsx` → RED (union/callbacks
absent) → GREEN. If the frame shape on the wire differs from `assistStream.ts:204-210`, STOP (envelope drift →
architect), do not adapt silently.

## Verification (complete, with expected output)
1. RED outputs pasted, then new suites green.
2. `cd app && npx vitest run src/shared/hooks src/shared/api` → baseline [m] 26 PASS + new files green; the ONE
   symlink FAIL (`useAiChat.surfaceContext.test.ts`) unchanged; paste failing-file set.
3. `cd app && npx vitest run src/event-editor/right-pane/ai src/shared/session src/analysis` → workstate 14 /
   protocolEdit 9 / runPageSurface 7 / session 70 [i, PB-CH-5 spec pin] / analysis suites PASS + the 3 symlink
   FAILs unchanged; ZERO new failures (this is the no-fork proof).
4. `cd app && npx vitest run` → failing-file SET set-identical to [i] 53-file baseline (`comm -3` pasted;
   symlink set members expected).
5. `cd app && npx tsc --noEmit` → **34 error-TS lines, file-set identical** (path-normalized comm EMPTY). No
   server tsc bar applies beyond systemPrompt.ts (server pin 26 [i] if the coder can run it; the one-line union
   hunk must not add a line).
6. Forbidden-path proof pasted: `git diff --name-only` ⊆ declared files; `git diff --stat app/src/chat
   app/src/components/registry app/src/shared/session schema config server/src/drafts
   server/src/ai/AgentOrchestrator.ts server/src/ai/submitSuggestionTool.ts
   app/src/event-editor/right-pane/ai/useChatThread.ts app/src/event-editor/right-pane/ai/assistStream.ts
   app/src/protocols app/src/browser app/src/editor app/src/protocol-ide app/src/knowledge
   app/src/graph` → EMPTY; `grep -rn "AiDraftBar" <diff>` zero; `grep -c "adapter" app/src/shared/ai/*` shows
   the parameterized reuse, `grep -rn "compileWorkstateDraft" app/src --include=*.tsx` still ONLY the shared
   flow (+ AiTabPanel via it) — the no-fork grep.
7. No YAML/schema changed ⇒ declare **NO-RESTART-NEEDED**; server hunk (systemPrompt.ts) requires the
   orchestrator to bounce the lane backend for the curl receipts step only if tsx-watch misses it (tsx --watch
   DOES reload .ts — the YAML trap does NOT apply here; declare which you observed).
8. API receipt: the two precheck curls pasted (analysis + literature surfaces), fresh history each.
9. Browser gate ORCHESTRATOR-OWNED after merge (independent cl-browser-reviewer, single vision slot, serial,
   named surfaces; screenshots verbatim: `analysis-local-proposal.png`, `analysis-local-accepted.png`,
   `generic-<approved-surface-id>-action.png`, `generic-<approved-surface-id>-proposal.png`,
   `run-channel-regression.png`). Script skeleton: fresh thread per ask (run-4 lesson); ctx A /analysis
   ask→card→reject (session sha unchanged, re-read by API)→re-ask→accept→tab lands + ctx B sees it via
   attach; `/literature?view=build` (or OQ1-ruled surface) action + proposal shots; `/runs/RUN-2026-09-19-run-vwr8`
   AiTabPanel regression (existing wave1 asks still produce card); accept turns carry ZERO
   `/ai/assist/stream` network hits; every negative re-verified by API/reload. Coder marks
   PENDING-BROWSER-GATE, touches no browser.

## Worker contract
- Branch `PB-CH-6-lane2-l2t<HHMM>` off CLAIM-TIME `cl/integration-2` HEAD including the PB-CH-4 fix chain
  (`git merge-base --is-ancestor 88496f2c HEAD`) AND the PB-CH-5 merge (`--is-ancestor <PB-CH-5-SHA> HEAD`;
  both SHAs + claim SHA recorded in the report). If PB-CH-4 gate run-4 or PB-CH-5 landing introduced
  AiTabPanel/assistStream/useAiChat hunks after this spec, RE-VERIFY every cite above before writing — cites
  are merged-trunk-verified at 8bfa6c1f, not gospel.
- Worktree `wt/PB-CH-6-lane2-l2t<HHMM>` under `/mnt/vast/home/brad/git/wt/`, node_modules symlinks from trunk
  (NFS worktree-add in background — AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS); `git -c core.fileMode=false`;
  NEVER `git add -A`; NEVER touch `/mnt/vast/home/brad/git/computable-lab` (symlink landmines point AT it —
  report their failures, never edit through them); runtime evidence ONLY :3093/:5193 (RE-MEASURE both 200 at
  claim; composer measured both 200 this session).
- Report (unique path): `.hermes/plans/PB-CH-6-report.wip-l2t<HHMM>.md` — RED outputs, matrix mapping, the two
  precheck curls, verification 2-7 verbatim, the AiTabPanel no-fork statement (byte-green test list + the
  shared-flow greps), claim-SHA/ancestor proofs, PENDING-BROWSER-GATE + OQ1-consumer ruling recorded from the
  dispatch prompt.
- ONE branch, ONE logical commit (+ optional report commit). No stack restart by the coder. ONE consumer
  touched — the one the orchestrator rules on OQ1. Any stop-boundary (envelope drift, extraction can't preserve
  AiTabPanel behavior, absent provider, turn-ownership conflict) ⇒ STOP, report, architect.

## Reviewer bait (the adversarial review looks exactly here)
- **The fork detector:** a second compile/accept/cancel implementation anywhere = automatic reject. Grep the
  diff for a second `compileWorkstateDraft` / `acceptWorkstateDraft` call site; the ONLY sanctioned shape is
  one call site inside the shared flow (+ AiTabPanel consuming the flow). Likewise a second SSE parser or a
  copy-pasted dispatchFrame.
- **Silent no-op controls:** workstate_proposal with no handler registered, aiAvailable false, NO_TAB_STORE,
  canAccept:false blocked card — every one is a NAMED visible behavior + a test. A disabled-but-unexplained
  button, a swallowed frame, or a card hidden without a message dies in review (task verbatim: "never a silent
  no-op control").
- **The extraction trap:** refactoring AiTabPanel while "preserving behavior" but silently changing the
  workstateTurnRef/sendChat choke semantics (fix2's merged D1 closure at :352/:367/:621/:734-737). The choke
  point and turn flag must STAY in AiTabPanel; if the flow hook tempts them out, STOP. The 14 workstate tests
  (incl. the two reviewer-reproduced leak tests) are byte-green or the merge dies.
- **Naming the consumer:** mounting the two dead `/protocols`-family pages, "reviving" LabwareEventEditor, or
  inventing an AiPanelContext renderer that only the absent overlay would see (NullSlot on this host —
  recon (b) LIVE-measured) are all variants of "invented consumers." Mount locally-rendered, or don't mount.
- **ChatPage smuggling:** `/chat`'s raw proxy (`chatClient.streamChat` → `/ai/chat/stream`) getting a "while
  you're in there" channel hookup = automatic reject (task: "standalone ChatPage stays OUT").
- **AiDraftBar landmine:** it still exists at `app/src/components/registry/AiDraftBar.tsx`; any diff hunk
  touching it (even an import tidy) = ledger §7 violation.
- **Missing-provider ≠ crashing provider:** AnalysisPage must NOT be wrapped in WorkspaceProvider just to
  reuse AiTabPanel (that's the drag-the-panel fork by another name, and it would fight the session tab model —
  turn-ownership stop-boundary). `useWorkstateExecutor`'s optional-provider diagnostics are the answer.
- **exactOptionalPropertyTypes/undefined traps:** app is `strict` without the flag but the convention holds —
  new optional callback fields via conditional spread; `workstate` payload `Record<string, unknown>` forwarded
  verbatim (validate only at the compile boundary, the trust boundary is `/api/drafts/compile`, PB-CH-4 OQ1).
- **Symlink landmines:** the env-red set in scope grows near you — `useAiChat.surfaceContext.test.ts` sits in
  the hooks dir; do not add a file of that name, do not un-symlink, do not "fix" the three ai-dir symlink
  failures; paste them as unchanged in the report.
- **Baseline drift:** full-app FAIL-set comparison (not totals); ClarificationPicker flake tolerated via
  set-union; server-side hunk limited to the systemPrompt union member — a preamble/template added "to help
  compliance" is an unrequested prompt change needing golden-test diffs.
- **Ports/data:** any :3001/:5174 evidence, or writes under the main data dir, = automatic fail; fixtures are
  lane-seeded only.

## Open questions (could not resolve locally; recommendations attached)
1. **Name the ONE approved generic consumer + its `<approved-surface-id>`.** My finding is plain: no live
   generic consumer maps to a surfaces-registry id (AiSurface ≠ registry ids; recon (b) table), no consumer has
   an overlay-driven panel renderer on this host (NullSlot, measured), and every consumer except the
   `/literature` family is unrouted dead code. RECOMMENDATION: approve
   `app/src/literature/PdfProtocolBuilder.tsx:113-127` (rendered via `LiteratureBody.tsx:111`, URL
   `/literature?view=build`, provider = LiteratureBody's AiPanelProvider, state = pdfUrl/pageCount/selectedText)
   and accept the AiSurface string `literature` as `<approved-surface-id>` for the screenshot names (it is the
   endpoint/identity its chat already persists under). Alternative the orch may prefer: declare
   `LiteratureBody.tsx:73-74` the consumer and ALSO land a local renderer there (bigger AnalysisPage-adjacent
   diff, same guarantee). Fallback ruling available: drop the generic consumer from PB-CH-6 scope entirely and
   ship Analysis-only — but that under-delivers the task title, so I recommend against. Checked: all 11 call
   sites opened or import-traced; App.tsx route table; main.tsx fixture branch; served overlay env.
2. **Analysis panel placement within AnalysisPage.** Two shapes: (a) a compact chat column replacing the
   current right pane's top section (proposal cards interleave with the run views), or (b) a collapsible
   drawer. This is UI-preference territory I cannot settle by reading — the page is AppShell + two sections
   (`AnalysisPage.tsx:225+`) with no existing rail convention on this page. RECOMMENDATION: (a) — the right
   pane already owns ViewRenderer output; put the chat + card stack above the artifact area with a
   `data-testid="analysis-chat-panel"`, matching the run page's chat-right discipline, no new layout machinery.
   The browser-gate screenshots should make the choice auditable either way. Checked: full AnalysisPage read,
   AppShell, DeckHostPage/RecordHostPage for layout precedent.
3. **Server prompt for the `analysis` surface.** The additive union member alone yields the GENERIC prompt with
   an empty preamble (`systemPrompt.ts:374-378,424-440`). Whether that suffices to drive the forced
   agent-intent tool on this lane profile is exactly what the First-targeted-check measures; if clean-turn
   precheck fails on `analysis` but succeeds on `workspace.deck`, the gap is prompt-compliance (a new
   `analysis` preamble = a server prompt change with golden-test implications, arguably architect territory per
   PB-CH-4's model-compliance precedents). RECOMMENDATION: precheck FIRST; ship the union member only; escalate
   compliance as its own item rather than letting the coder author prompt text. Checked: systemPrompt.ts union +
   preamble fall-through + AIHandlers surface cast (`AIHandlers.ts:359,450` — no validation wall for a new
   surface string); live compose_workstate emission itself UNVERIFIED on generic surfaces (precheck resolves it).

---
Report: DONE — draft at this path. Summary: recon (a) — /analysis has NO AI chat owner (AnalysisPage's only AI
piece is the one-shot draftAnalysisRevision author box, cited); the item CREATES the Analysis-local chat, and
AiTabPanel cannot be dragged there (useWorkspace throws outside WorkspaceProvider) so the mount is a new slim
panel composed of the existing parts. Recon (b) — all 11 generic useAiChat call sites enumerated with liveness
verdicts: every one except the /literature family is unrouted dead code, the AiPanelContext panel renderer
lives in the absent overlay (NullSlot measured live on the served host), and no consumer maps to a surfaces-
registry id — the spec names PdfProtocolBuilder at /literature?view=build as the ONE consumer and routes the
registry-id impossibility to an explicit OQ1 with the plain no-consumer fallback, never an invented consumer.
Recon (c) — reuse-without-fork targets pinned: WorkstateProposalCard trust rule, AiTabPanel inline compile/
accept flow lifted once into a shared flow hook (AiTabPanel consumes it; its 14+9+7 green tests are the byte-
green regression net), useWorkstateExecutor consumed zero-hunk, and the generic aiClient.streamAssist already
hits the same /ai/assist/stream endpoint — the real generic-stack gap is the missing AiStreamEvent union members
+ callbacks in useAiChat (today such frames are silently dropped — the exact defect class PB-CH-6 closes).
Baselines MEASURED this session at 8bfa6c1f: app tsc 34; hooks+api suites 26 PASS + 1 symlink env-red; ai-dir
197 PASS + 3 symlink env-red; :3093/:5193 both 200; VITE_AI_OVERLAY absent from served env. INHERITED: full-app
53-failed-file pin, session 70-pin, server tsc 26. Coder gates on claim-time ancestry of 88496f2c + the future
PB-CH-5 merge SHA. Open: consumer naming/registry-id ruling (OQ1), analysis layout shape (OQ2), server prompt
adequacy for the analysis surface pending the single precheck curl (OQ3).

---

## ORCHESTRATOR PROMOTION + OQ RULINGS 2026-10-07T11:00 EDT (bind the coder)

Status: PROMOTED to canonical. Baseline update: claim-time trunk tip is >= a9426cfd
(PB-CH-5 merged) PLUS the PB-CH-4b merge SHA (recorded in the PB-CH-4b handoff — the
claim gate is `git merge-base --is-ancestor <PB-CH-4b-MERGE-SHA> HEAD` in addition to
88496f2c and the PB-CH-5 SHA a9426cfd). Do NOT claim until PB-CH-4b has merged.

- OQ1 RULED = RECOMMENDATION APPROVED: the ONE generic consumer is
  `app/src/literature/PdfProtocolBuilder.tsx` (useAiChat :127 `endpoint:'literature'`,
  rendered via LiteratureBody.tsx:111 at view==='build'; orch re-verified at a9426cfd).
  `<approved-surface-id>` = `literature` — screenshot names become
  `generic-literature-action.png` / `generic-literature-proposal.png`. Provider =
  LiteratureBody's AiPanelProvider; no registry id is invented.
- OQ2 RULED = (a) compact chat column in the right pane above the artifact area,
  `data-testid="analysis-chat-panel"`, no new layout machinery, existing
  `analysis-ai-author` box byte-untouched (PB-CH-5 gate depends on it).
- OQ3 RULED = RECOMMENDATION APPROVED: precheck curl FIRST (fresh history, analysis +
  literature surfaces); ship the additive systemPrompt union member ONLY; if prose-only
  on both surfaces, STOP and report model-compliance to the orchestrator — the coder does
  NOT author prompt text. Note: PB-CH-4b (registry ids injected into the forced tool
  descriptions) merges before this item and materially improves surface-id compliance on
  generic surfaces; if a precheck fails AFTER PB-CH-4b, that strengthens the compliance
  escalation.
- Extra hazard for dispatch: PB-CH-5's browser gate (and PB-CH-4 gate run-6) may land
  AiTabPanel assistStream-adjacent fixes; re-verify cites :352/:367/:621/:734-737 before
  refactoring anything in AiTabPanel.
