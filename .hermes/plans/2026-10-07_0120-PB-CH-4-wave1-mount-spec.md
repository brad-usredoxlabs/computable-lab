# SPEC — PB-CH-4: Wave-1 mount in run chat + two-device workstate acceptance proof (and focus goes into the request)

Status: DRAFT for orchestrator review (composer l2t0005, 2026-10-07T00:05 EDT). NOT dispatchable.
**PB-CH-4's coder does NOT run until PB-CH-3 MERGES** — PB-CH-3 is IN FLIGHT (coder pid 2512495, worktree
`wt/PB-CH-3-lane2-l2t2357` off `85a16976`) and its executor is the surface this item mounts. The worker branches
off claim-time `cl/integration-2` HEAD that INCLUDES the PB-CH-3 merge commit.

Baseline trunk at spec time: `cl/integration-2` @ `85a16976` (docs tip; code tip `236228fc` = PB-CH-2 merge chain).

## Goal
Mount the PB-CH-3 shared executor at `AiTabPanel` so the run chat is a real channel: tier-1 compiled
`agent_action` events (PB-CH-1) apply immediately, tier-2 workstate proposals render a chat PROPOSAL CARD whose
Accept drives the actor-bound compiled draft through the single writer and pushes exactly once — proven
two-device (accept on context A, adopted on context B via attach) by an independent browser review — while
working focus finally leaves the DOM and rides the request contract.

## Binding decisions (campaign rulings — do not re-litigate)
- **AR-2, the load-bearing one:** NEVER auto-push an unaccepted workstate. Tier-1 (focus | open-surface) applies
  on arrival; tier-2 is a card with Accept/Reject/revise. A pending proposal's `sessionDocument` must never enter
  `OpenTabsContext` and never reach the 500 ms push. "Never weaken the no-push-before-accept guarantee — STOP
  rather than soften it" (task-verbatim).
- **Never render an actionable proposal from raw model output or schema-validity alone** (task-verbatim). The card
  becomes actionable only from a server `POST /api/drafts/compile` response with `canAccept: true`; a blocked
  compile renders summary + diagnostics with Accept NOT offered (the contract's "pending or blocked drafts cannot
  be accepted" — a disabled/absent control with tested behavior, not a dead button).
- **Accept = actor-bound compiled draft → shared executor → single writer.** Accept re-sends ONLY
  `{draftId, revision, reviewHash}`; the server returns the STORED compiled result (authoritative — the client
  cannot resubmit a document); the client feeds it to `applyAcceptedWorkstate` (PB-CH-3). **No second AI call at
  accept time, ever** — the accept path performs zero `/ai/assist/stream` requests.
- **AR-1:** the server compiles; only resolved Ajv-validated events reach the client; unresolvable ⇒ visible
  diagnostic, nothing moves. Diagnostics already ride `pipeline_diagnostics` (`pass_id:'workspace-action-compile'`)
  and land in the trace (useChatThread.ts:186-190) — reuse, do not fork.
- **AR-3:** one executor. PB-CH-4 CONSUMES PB-CH-3's hook; it does not re-implement, fork, or "improve" it. The
  conservative OQ2/OQ3 behaviors promoted with the PB-CH-3 spec (bare-ref focus = activate-or-diagnostic, no
  deep-link invention; `NO_TAB_STORE` with no window-hack fallback) are honored AS-IS by the mount — surfacing the
  executor diagnostic is correct UI behavior, not a defect to paper over.
- **Friction-first (task-verbatim):** no preliminary ontology wizard, no navigation approval dialog, no ghosted
  tabs, no dead controls; show compile progress promptly. Concretely: no `window.confirm` anywhere; a tier-1 action
  actually navigates (it does not ghost a preview tab); while a card is pending no proposed tab is rendered
  anywhere; Accept/Reject/revise must all DO something real; while the compile POST is in flight the card slot
  shows "compiling…" (see §5).
- **Context gap fix is part of this item (task-verbatim):** "the model cannot open 'the step I'm looking at' while
  focus never leaves the DOM." `ProtocolSelectionContext.focusedStep` is display-only today —
  `ChatContextHeader.tsx:16` (`const focused = sel?.focusedStep`, exact as the task cites; the header only renders
  "EDITING: Step N — label", never sends it). Here it goes INTO the request contract as a typed field.
- **Stop-boundary (task-verbatim):** no generic `useAiChat` rollout (PB-CH-6), no ChatPage changes, no merge
  semantics, no session history (PB-CH-7/8). Missing routes or blank surfaces require API/reload re-verification
  before reporting.
- Lane discipline: runtime evidence ONLY on :3093/:5193; NEVER :3001/:5174 or the main data dir; `git -c
  core.fileMode=false` (NFS); NEVER `git add -A`; do NOT restart the lane stack (the coder legitimately cannot —
  PB-CH-2's DEFECT-1 precedent: mark live receipts PENDING-RESTART and the orchestrator executes them post-merge;
  `tsx --watch` DOES hot-reload `.ts`, but :3093 serves the trunk tree, not the coder's worktree).

## What is on trunk vs what PB-CH-3 will add (name the dep by CONTRACT, not file path)
**ON trunk today (verified by the composer at `85a16976`):** everything PB-CH-1/PB-CH-2 shipped —
`server/src/ai/compileWorkspaceAction.ts`, the FROZEN `agent-action.schema.yaml`, the `agent_action` AgentEvent
member (`server/src/ai/types.ts:846 AgentActionPayload`, :864 union member), the orchestrator's ONE emit path
(`AgentOrchestrator.ts:2075-2147`, `onEvent?.({ type:'agent_action', action })` at :2091), the five-intent forced
menu (`submitSuggestionTool.ts:443` — `workspace_action` included), and PB-CH-2's workstate machinery
(`server/src/drafts/workstateCompile.ts`, `config/drafting/workstate-tab-kinds.yaml`,
`schema/workflow/workstate-intent.schema.yaml`, `/api/drafts/compile|accept`). Also on trunk: the client stacks —
`app/src/event-editor/right-pane/ai/{AiTabPanel,useChatThread,assistStream,chatReducer,ChangesPanel}.tsx/ts`,
`app/src/agent/AgentChatPane.tsx`, `app/src/run/RunWorkspacePage.tsx` (mounts `AgentChatPane` at :138 inside
`ProtocolSelectionProvider` :127), `app/src/event-editor/protocol/ProtocolSelectionContext.tsx`
(`focusedStep`/`setFocusedStep` :122-131 region, `useProtocolSelection()` null outside provider),
`app/src/shared/session/**` (unmodified — `useApplySessionDocument` still zero production callers),
`app/src/shared/api/client.ts` (`x-user-id` header plumbing at :1384; `putSession` :2243-2251;
**ZERO draft endpoints today** — `grep -rn 'drafts/compile|drafts/accept|/api/drafts' app/src` = 0 hits, verified).
`grep -rn agent_action app/src` = **0** (verified) — the app union (`assistStream.ts:156-168`) has no member for
it and `dispatchFrame` (:311-349) silently drops it today; the `never`-default in `useChatThread.ts:194-197` is the
forcing seam (task's `:139-196` is stale by ~1 line — the switch body is :140-198).

**NOT on trunk — arrives with the PB-CH-3 merge (CONTRACT, from the promoted spec
`.hermes/plans/2026-10-06_2345-PB-CH-3-shared-executor-spec.md` + its promotion notes):**
```ts
// app/src/shared/session/useWorkstateExecutor.ts  (contract — do not import server types)
export function useWorkstateExecutor(): {
  executeTier1(action: Tier1ActionLike): ExecutorOutcome;                       // focus | open-surface
  applyAcceptedWorkstate(body: unknown, attestation: { accepted: true },
    identity: { draftId: string; revision: number; reviewHash: string }): ExecutorOutcome;
}
// ExecutorOutcome = { ok:true; kind:'navigated'|'activated'|'focused'|'replaced'|'duplicate-ignored'; route?; diagnostics:[] }
//                   | { ok:false; kind:'noop'; diagnostics: ExecutorDiagnostic[] }  // UNKNOWN_SURFACE, NO_FOCUS_PROVIDER,
//                                                                                   // NO_TAB_STORE, ACCEPT_ATTESTATION_MISSING, ...
```
The accept body is the FLAT compiled result `{sessionDocument:{version:1,tabs,activeTabId}, summary, resolvedTerms}`
— identity fields are NOT in the body (orchestrator live receipt, PB-CH-3 promotion notes). The hook wires
`useOptionalOpenTabs`/`useNavigate`/`useSurfaceRegistry`/`useProtocolSelection`/`useApplySessionDocument` itself.
PB-CH-4 depends on NOTHING else from PB-CH-3's files; if the merged surface deviates from this contract, STOP and
report — do not adapt by re-implementing executor internals.

**What PB-CH-4 itself adds server-side (see design §4/§6 — flagged, this exceeds the task-list's shorthand file
list; rationale + fallback in Open questions):** one `agent_intent` intent for tier-2 emission, one `AgentEvent`
member carrying the model's workstate INTENT (never a compiled doc), `workingFocus` on the assist body + a prompt
block. Zero YAML anywhere in this item (the workstate-intent + agent-action + lab-session schemas are already
registered and byte-frozen — `git diff --stat schema/` must be EMPTY).

## VERIFIED baseline (composer ran everything below at `85a16976`; re-measure at claim — trunk moves under you)
Provenance: every number marked **[m]** was measured by the composer's own terminal at 85a16976; **[i]** =
inherited pin from the 23:55 handoff, corroborated.
- `cd app && npx tsc --noEmit --pretty false 2>&1 | grep -c 'error TS'` → **[m] 34** (method note: raw
  `--noEmit` output is 47 lines because of multi-line pretty-continuations — THE PIN COUNTS `error TS` LINES;
  `npm run typecheck -w app` is the canonical command). Post-change bar: **34, error-file set IDENTICAL**
  (`comm -3` of sorted error-file lists empty) — PB-CH-4 TOUCHES app, so new hunks must be error-free.
- `grep -rn agent_action app/src --include='*.ts*'` → **[m] 0 occurrences.** After PB-CH-4 the union + switch +
  tests are the ONLY sites (plus the card component) — grep must not leak into executor or session files.
- Targeted app suites (the ones this item touches/adjacent) **[m]**:
  `cd app && npx vitest run src/event-editor/right-pane/ai src/shared/session` → **11 files PASS / 74 tests PASS**,
  plus ONE pre-existing ENVIRONMENTAL failure: `useChatThread.deckLayout.test.tsx` is a gitignored SYMLINK into
  Brad's live tree (`-> /mnt/vast/home/brad/git/computable-lab/app/...`) and fails to LOAD in any other checkout
  (vite resolution). Same landmine class as `server/src/ai/createRecordIntent.test.ts` (AI-7 note). Do NOT
  "fix" it by deleting, un-symlinking, or chasing — it is expected RED in the pre-change baseline; report it as
  such. (`src/shared/session` = 6 files green inside the 11.)
- **Full app suite** — `cd app && npx vitest run` → **[m] 53 failed files / 63 failed tests / 1866 passed
  (280 files, 6 errors)** — byte-matches the inherited 53-failing-file baseline **[i]** (handoff 23:55 /
  PB-CH-3 spec). Post-change bar: failing-file SET set-identical (zero NEW failing files; paste `comm -3` of the
  sorted FAIL lists), totals ≈ 63 failed / 1866+new passed / 280+new files.
- `npm run typecheck -w server` → **[m] 26 error lines** — matches the orchestrator pin 26 (AS-LANE2-SERVER-TSC-PIN-26)
  **[i]**. PB-CH-4 adds server hunks: bar is **26, set-IDENTICAL** (zero new error lines; `exactOptionalPropertyTypes`
  is REAL here, `server/tsconfig.json:13`).
- `cd server && npx vitest run src/ai` → **[m] 10 failed files / 21 failed tests / 565 passed (73 files, 2
  errors)** — matches the handoff pin exactly. Post-change: file-set identical + the deliberate intent-pin delta (§Verification 6).
- `cd server && npx vitest run src/drafts` → **[i] 3 files / 39 PASS** (handoff at merged trunk; PB-CH-4 must leave
  `src/drafts/**` byte-empty so this stays green untouched).
- `exactOptionalPropertyTypes`: server `tsconfig.json:13` true; app has `strict:true` WITHOUT it (PB-CH-3 spec's
  honest reading of `app/tsconfig.json:20`) — still use conditional spread everywhere.

## The design (exact, minimal)

### 1. The mount — `app/src/event-editor/right-pane/ai/AiTabPanel.tsx`
`AiTabPanel` already holds `useOptionalOpenTabs()` (:122) + `useNavigate()` (:123) — the task's `:120/:121` is
stale by 2 (PB-CH-3's spec already corrected it). Additions, mirroring the EXISTING protocol-edit proposal pattern
in this same file (proposal held in a ref + `ChangesPanel` rendered inline at :956, reject-zero-mutation at :704,
target-swap invalidation at :596):
- `const executor = useWorkstateExecutor()` (PB-CH-3 hook — it self-wires provider context; the panel does NOT
  pass openTabs/navigate/focus down to it).
- Pass `onAgentAction` / `onWorkstateProposal` callbacks into `useChatThread` (§2). Tier-1:
  `onAgentAction(a) => executor.executeTier1(a)` — applies on arrival; outcome surfaces in the trace (§3). A
  `{ok:false}` outcome shows its diagnostic message in the trace — NO dialog, NO retry loop, NO local fallback.
- Tier-2: `onWorkstateProposal(intent)` → POST `/api/drafts/compile` via new apiClient methods (§2c) with
  `{ adapter:'workstate', intent }` (or `{ adapter:'workstate', draftId, revision, intent }` to bump a revision —
  PB-CH-2's existing revision path); while in flight render a "compiling…" card slot; on response render the
  `WorkstateProposalCard` (§2b). A NEW proposal supersedes a pending one (ai-drafting-and-ui-projection lifecycle
  item 4: "Discard superseded responses") — the ref holds at most one pending draft identity
  `{draftId, revision, reviewHash}`.
- Accept: `await apiClient.acceptWorkstateDraft({draftId, revision, reviewHash})` → flat body →
  `executor.applyAcceptedWorkstate(body, { accepted: true }, { draftId, revision, reviewHash })`; on
  `{ok:true}` keep the card as a spent "applied" state (controls disappear — no dead buttons); on `{ok:false}`
  show the diagnostics, card stays rejectable, NOTHING moved.
- Reject: drop the card + clear the pending identity. There is NO reject endpoint (PB-CH-2 §6) — reject = abandon.
  Zero store calls, zero fetches except nothing.
- Revise: the chat input stays enabled; the next turn that yields a new `workstate_proposal` compiles with the
  pending `draftId+revision` (revision bump, server-side deterministic recompile — no automatic AI re-propose;
  the USER's message drives it).

### 2. The channel — request types, stream union, exhaustive switch
**a. `assistStream.ts` — request contract (the context-gap fix).** New TOP-LEVEL optional on
`AssistStreamRequest` (:42-62), NOT inside `context`:
```ts
/** Structured working focus: the step the ChatContextHeader shows. Rides the
 *  request (like protocolStepContext) so the server can render it; NOT folded
 *  into `context` because focus changes per turn and would churn the KV warm
 *  prefix (attachedProtocol's stability precedent does not apply). */
workingFocus?: { protocolId: string; stepId: string; label: string; ordinal?: number }
```
`AiTabPanel` populates it from `useProtocolSelection()` (`focusedStep` + `protocol?.recordId`; conditional spread,
omitted when null). Structured selection: the deck/well selection ALREADY rides `context` via
`acceptedGraphProjection` (AiTabPanel.ts:215-320, `focusedLabwareId`/`sourceSelection`) — do not duplicate it; the
`activeTabKind`/`activeArtifactId`/`activeEventGraphId` structured ids are already there too. `focusedStep` is the
ONLY piece that never leaves the DOM; this closes it. **b. App stream union.** `AssistStreamEvent` (:156-168)
gains TWO members and `dispatchFrame` (:311-349) gains two cases (typed additions to the `parsed` annotation at
:302):
```ts
| { type: 'agent_action'; action: AgentActionEnvelope }              // server AgentActionPayload transport mirror
| { type: 'workstate_proposal'; intent: Record<string, unknown> }    // the model's workstate INTENT — not actionable alone
```
Define a local `AgentActionEnvelope` structural type in `assistStream.ts` mirroring the frozen schema shape
(`action:'focus'|'open-surface'; target?; surface?; contextNote?; supportedBy?`) — comment it as "transport mirror
of schema/workflow/agent-action.schema.yaml; the schema is the authority" (PB-CH-1's `AgentActionPayload`
discipline; no import from `server/**`).
**c. `app/src/shared/api/client.ts`** gains `compileWorkstateDraft(req)` / `acceptWorkstateDraft(body)` riding the
existing `request()` helper (x-user-id header plumbing at :1384 comes free — the drafts routes resolve the actor
from it). NO other client.ts hunks.
**d. `useChatThread.ts`** — `UseChatThreadOptions` gains
`onAgentAction?: (action: AgentActionEnvelope) => void` and `onWorkstateProposal?: (intent) => void`, called in
the switch cases with the same never-break-the-turn try/catch wrapper as `onDraftResult` (:149-153). The
exhaustive switch (:140-198) gains `case 'agent_action'` (forward + dispatch a trace entry, §3) and
`case 'workstate_proposal'` (forward only). **The `never` default at :194-197 is KEPT** — this task proves the
forcing seam works: the new server members make the app compile BREAK until these cases exist; adding a `default`
"for robustness" is forbidden. `SendOptions`/request build (:125-133) conditionally spreads `workingFocus`
threaded in from AiTabPanel via a new option (mirrors how `protocolStepContext` threads today at :132).
**e. `chatReducer.ts`** — one additive change: `TraceEntry.kind` (:36) gains `'action'`; the agent_action case
dispatches `{type:'stream-trace', entry:{seq, kind:'action', evidence:'<verb> <resolved label> — nothing was written.' | executor outcome text}}`.
MessageLog renders unknown kinds safely today (`message-log__trace--${t.severity}` fallback pattern) — verify the
`action` icon renders, one component test. NOTHING else in chatReducer.

### 3. Tier-1 behavior at the mount (applies immediately post-server-compile)
On arrival (server already compiled — PB-CH-1's Ajv+spine+registry gate is the trust anchor), `executeTier1`
applies WITHOUT any user gesture (AR-2 tier-1). The result is shown two ways: the trace entry (§2e) and, for
`ok:false`, the diagnostic message text — the model's own corrective notes already arrive via `done.result.notes`
(AgentOrchestrator :2136) so the user never stares at silence. Unsaved-work preservation through tier-1 is the
EXECUTOR's guarantee (reference-identity of non-target tabs, no replace/close, no confirm dialog); the mount must
not add a confirm, a snapshot, or a second navigation. Friction-first: the tab strip moves, `ChatContextHeader`
updates itself (a `focus` action lands via the executor's `useProtocolSelection` wiring — if PB-CH-3 merged
without that wiring, see Open question 3), no approval prompts.

### 4. Tier-2 emission — server-side minimal (1 intent, 1 event, 1 body field, 1 prompt block)
The chat→draft proposal emission mount is assigned to PB-CH-4 by the promoted PB-CH-2 spec's out-of-scope list
("the chat→draft proposal-emission mount is PB-CH-4"). Minimal shape, ONE emit path discipline preserved:
- `server/src/ai/submitSuggestionTool.ts`: add a 6th intent `'compose_workstate'` to the enum (:443), the
  `AgentIntentArgs` union, the description (:435/:445), the parser gate (:564), retaining
  `workstate?: Record<string, unknown>` verbatim (the workstate-intent envelope AS THE MODEL SEES IT:
  operation + tabs `{surface,target:{term|recordId}}` + activeTab — VERBS AND TERMS ONLY; the description states
  the server compiles it into a proposal that only becomes actionable after review, and that it writes nothing).
- `server/src/ai/types.ts`: `| { type: 'workstate_proposal'; workstate: Record<string, unknown> }` on AgentEvent —
  carries the model's retained-verbatim intent. This is NOT a compiled draft and is NOT actionable alone — the
  Ajv gate is `/api/drafts/compile` (which already validates against the registered workstate-intent `$id` and
  returns `canAccept:false` + diagnostics for garbage). The event stays thin because the draft service — not this
  event — is the compilation trust boundary (documented in the code comment).
- `server/src/ai/AgentOrchestrator.ts`: one dispatch branch beside `workspace_action` (:2075):
  `onEvent?.({ type:'workstate_proposal', workstate: agentIntent.workstate })` + `tool_result success:true` +
  AgentResult note "Proposed a workspace — review the card to accept; nothing was written." Runs NOTHING else.
- `server/src/api/handlers/AIHandlers.ts`: `AssistBody` (:46-60) gains optional `workingFocus` (same shape as
  §2a) + `server/src/ai/systemPrompt.ts` gains ONE block beside `formatAttachedProtocol` (call site :468-494):
  `WORKING FOCUS: Step <ordinal> — <label> (stepId <stepId>) of protocol <protocolId>. Interpret "this step" /
  "the step I'm looking at" as exactly this step; cite its stepId, never invent one.` Rendered ONLY when present.
- The two intent-menu pins (`submitSuggestionTool.test.ts` enum-equality + `…protocolEdit.test.ts` "N-intent menu,
  exactly") update FIVE→SIX deliberately, golden-test discipline: diff called out in the handoff.

### 5. The proposal card — `WorkstateProposalCard.tsx` (+ .css) in `right-pane/ai/`
Native controls, ChangesPanel-styled precedent (theme tokens, light+dark readable — PROTO-AI-14 precedent).
Content: `summary` (server-provided), the proposed tabs (`sessionDocument.tabs` kind + title via
`useSurfaceRegistry` labels — NO surface-name literals), `resolvedTerms` count/labels (the resolution receipts),
`diagnostics` when `canAccept:false` (beside the review, not a toast), Accept / Reject / revise-through-chat
affordance note, draftId/revision small-print. While the compile POST is in flight: a "compiling…" slot (friction
rule — prompt progress). Accept → the flow in §1. Keyboard-operable, distinct buttons. `data-testid`s:
`workstate-card`, `workstate-card-accept`, `workstate-card-reject`, `workstate-card-compiling`.

### 6. Explicitly OUT of scope (zero hunks — reviewer-bait territory)
- `ChatPage.tsx` and the generic `useAiChat`/`aiClient` stack (PB-CH-6); `useApplySessionDocument` call sites
  outside the executor; ALL of `app/src/shared/session/**` and `app/src/shared/surfaces/**` and
  `OpenTabsContext.tsx` (PB-CH-3's files + the byte-frozen reducer); `openSurface.ts`, `useSessionSync.ts`
  (`PUSH_DEBOUNCE_MS`/`applyingRemote`/`lastPushedPayload` frozen); the PB-CH-3 executor files themselves.
- `AgentChatPane.tsx` (pure composition today — it must STAY a composition, not a second turn owner);
  `ChatContextHeader.tsx` (stays display-only; the request contract does the talking); `RunWorkspacePage.tsx`
  (provider already mounted); `ChangesPanel` / protocol-edit paths; `MessageLog` beyond verifying the `action`
  trace kind renders (only if a one-line icon map entry is actually needed).
- ALL YAML: `schema/**`, `config/**` (workstate-intent schema + tab-kinds mapping already registered by PB-CH-2;
  agent-action + lab-session byte-frozen; the YAML-reload trap cannot fire because there is zero YAML here).
- `server/src/drafts/**` (PB-CH-2's; consumed via HTTP only), `/api/session` routes, `workspace-session.ts`,
  ledger/journal (PB-CH-7/8), `form-draft*.yaml`, `SUBMIT_TOOL_NAMES`, `ToolBridge` allowlists, `config.yaml`,
  `protocolStepContext` semantics (do not overload it with focus — it ghosts the deck; `workingFocus` is separate).
- Reject ENDPOINTS (none exists; reject = abandon), merge semantics, session history, generic rollout.

## Acceptance criteria (from the task list, verbatim)
> Red-first component/protocol tests, then INDEPENDENT browser review (single vision slot, serial,
> named surfaces only): ask run chat to focus a seeded protocol step + open a seeded surface
> (immediate compiled navigation, unsaved work preserved); pending card + reject => context B and
> /api/session PROVEN unchanged; accept in context A => visible adoption in context B via attach,
> no second AI call. Screenshots: wave1-tier1-focus.png, wave1-open-surface.png,
> wave1-unresolved-diagnostic.png, wave1-pending-card.png, wave1-rejected-unchanged.png,
> wave1-accepted-A.png, wave1-attached-B.png. Registry IDs/URLs recorded. Negative claims
> re-verified by API/reload.

### Browser gate (the real gate — AFTER merge + orchestrator restart, never the coder's own tests)
- INDEPENDENT cl-browser-reviewer, single vision slot used SERIALLY (one gate at a time on the computable
  endpoint); named surfaces ONLY: Run Workspace `AgentChatPane`/`AiTabPanel` on :5193, the live tab strip,
  `ChatContextHeader`, and the registry-declared destination surface(s) reached by seeded fixtures. Seed
  fixtures (a protocol with ≥3 steps + a run + a record that maps to a tab via workstate-tab-kinds.yaml); same
  test actor in both contexts; do NOT use Brad's live data.
- Script: (1) focus a seeded protocol step → `wave1-tier1-focus.png` (ChatContextHeader updates, immediate);
  (2) open a seeded surface → `wave1-open-surface.png` (compiled navigation, and an editor with UNSAVED edits
  still intact in its tab); (3) an unresolvable/unsupported ask → `wave1-unresolved-diagnostic.png` (trace shows
  the compile diagnostic, NOTHING moves); (4) a workstate ask → pending card
  `wave1-pending-card.png` while context B (second browser context, same actor) and `GET /api/session` provably
  unchanged (re-hash/reload the negative); (5) Reject → `wave1-rejected-unchanged.png`, re-verify context B +
  `/api/session` AGAIN via API/reload; (6) re-propose, Accept in context A → `wave1-accepted-A.png`; (7) focus
  context B (the attach trigger: window focus / visibilitychange) → visible adoption in B →
  `wave1-attached-B.png`; record that the accept turn issued NO second AI call (reviewer watches the network
  tab: `/api/drafts/accept` yes, `/ai/assist/stream` no). Record exact registry IDs/URLs.
- The coder may prepare Playwright receipts against :5193 ONLY for the parts served pre-merge (there are none for
  the new behavior) — the honest route is PENDING-BROWSER-GATE in the report, exactly as PB-CH-2 handled
  PENDING-RESTART. Missing routes / blank surfaces must be re-verified by API/reload before being claimed.

### Red-first test matrix
Files: `assistStream.agentAction.test.ts` (frame parsing), `useChatThread.agentAction.test.tsx` (switch+callbacks
via the `runStream` seam :74), `AiTabPanel.workstate.test.tsx` (mount integration, renderHook-free — panel harness
per `AiTabPanel.protocolEdit.test.tsx` precedent: providers mocked per that file), `chatReducer.test.ts` extended,
`WorkstateProposalCard.test.tsx`, `server: submitSuggestionTool.workstate.test.ts` +
`AgentOrchestrator.workstateProposal.test.ts` (mock inference client per protocolEdit convention).

| Criterion | Named test | Where |
| --- | --- | --- |
| union/parse of PB-CH-1's emission | `an agent_action SSE frame parses into the typed envelope (surface/contextNote OMITTED when absent, never undefined)`; `an unknown frame type still parses to nothing (default branch intact)` | assistStream |
| exhaustive seam | `onAgentAction fires exactly once per event and the never-default still compiles (type-level: the switch has NO default case — source-pin grep test)`; `onWorkstateProposal forwards the intent verbatim without touching the tab store` | useChatThread |
| tier-1 applies on arrival | `an agent_action event causes exactly one executor.executeTier1 call with the payload` (executor vi.mocked via a seam the panel imports) | AiTabPanel |
| tier-1 diagnostic = visible, no movement | `an ok:false executor outcome renders its message in the trace and opens no dialog / makes no second call` | AiTabPanel |
| no actionable card from raw output / schema-validity alone | `a workstate_proposal event alone renders NO accept control (compiling slot or nothing) until the compile response arrives`; `compile response canAccept:false renders summary+diagnostics and NO accept control` | card + panel |
| no push before accept | `with a pending card, advancing 600 ms fires ZERO putSession and the tab store reference-identity is unchanged` (fake timers + mocked apiClient, useSessionSync.test.ts:13-30 harness precedent) | panel |
| accept = executor-only path | `Accept posts exactly {draftId,revision,reviewHash}; the flat response body is handed to applyAcceptedWorkstate with {accepted:true} + identity; ZERO /ai/assist/stream fetch occurs during accept` (fetch spy) | panel |
| reject touches nothing | `Reject drops the card, clears the pending identity, zero apiClient calls, zero store dispatches` | panel |
| revision bump | `a second proposal while one is pending compiles with draftId+revision and the old card is superseded (stale response for a superseded draftId+revision is DISCARDED — late response must not resurrect it)` | panel |
| context gap fix on the wire | `with focusedStep set, the request body carries workingFocus {protocolId,stepId,label,ordinal}; with none focused the key is ABSENT (not undefined)`; `context stays byte-identical when only focus changes (warm-prefix stability)` | useChatThread/panel |
| trace renders the action kind | `a kind:'action' trace entry renders with the trace icon` | chatReducer/MessageLog |
| server emission | `compose_workstate intent retains the workstate envelope verbatim and emits exactly one workstate_proposal event + zero store writes` (onEvent capture); `an invalid workstate envelope still emits the intent verbatim and lets /api/drafts/compile own the diagnostic (server never client-side-compiles here)` — honest: thin-event design, see OQ1 | orchestrator/tool |
| workingFocus reaches the prompt | `the WORKING FOCUS block renders only when workingFocus is present and cites protocolId+stepId` | systemPrompt |
| pins | five-intent enum pins updated to six, DIFF shown | server suite |

## First targeted check (run EARLY, before touching the panel)
Extend/author `assistStream.agentAction.test.ts` with the two new frames + a no-undefined-optionals pin, RED first
(union members absent → type errors / parse drops), then:
```
cd /mnt/vast/home/brad/git/cl-integration-2/app && npx vitest run src/event-editor/right-pane/ai/assistStream.agentAction.test.ts src/event-editor/right-pane/ai/assistStream.test.ts
```
Expected GREEN with the existing `assistStream.test.ts` still untouched-green. If the union addition forces a
change in `dispatchFrame`'s existing cases to compile, the design is wrong — STOP and report (the `default:`
return at :345 must stay).

## Verification (complete, with expected output vs baselines)
1. RED outputs pasted, then all new app/server suites green.
2. `cd app && npx vitest run src/event-editor/right-pane/ai src/shared/session` → baseline **[m]** 11 files/74
   PASS + your new files, ZERO failures (the `useChatThread.deckLayout.test.tsx` symlink load-error is the known
   pre-existing environmental RED — report it, do not touch it).
3. `cd app && npx vitest run` → failing-file SET set-identical to the **[m] 53-file baseline** (paste `comm -3`).
4. `npm run typecheck -w app` → **34 `error TS` lines, set-IDENTICAL** to the pinned 34 (comm -3 empty).
5. `npm run typecheck -w server` → **26 `error TS` lines, set-IDENTICAL** (exactOptionalPropertyTypes sites:
   `workingFocus?`, event `workstate?` — conditional spread, never `{x: undefined}`).
6. `cd server && npx vitest run src/ai` → the **[m] 10/21/565 (73 files, 2 errors)** failing-file SET unchanged
   PLUS the deliberate intent-pin deltas shown; `cd server && npx vitest run src/drafts` → 3/39 untouched-green;
   `npx vitest run src/schema src/surfaces` green.
7. Forbidden-path proof: `git diff --name-only` contains ONLY the files in §1-§6 in-scope lists;
   `git diff --stat schema/ config/ app/src/shared/session/ app/src/shared/surfaces/
   server/src/drafts/ app/src/pages/ChatPage*` is EMPTY (paste it). `grep -rn 'window.confirm'
   app/src/event-editor/right-pane/ai` = 0. `grep -rn agent_action app/src` hits ONLY assistStream /
   useChatThread / AiTabPanel / the new tests / chatReducer-adjacent card files.
8. Live receipts: SSE capture from a real run-chat turn proving (a) an `agent_action` frame with RESOLVED ids,
   (b) request bodies carrying `workingFocus` for a focused-step turn, (c) a `workstate_proposal` frame whose
   client-side compile→accept round-trip returns the flat body — **coder-executed ONLY if possible WITHOUT a
   stack restart; otherwise PENDING-RESTART, exactly the PB-CH-2 DEFECT-1 route; the orchestrator runs the
   sequence post-merge and appends receipts.** The browser gate (§Browser gate) is a separate post-merge step
   owned by the orchestrator's cl-browser-reviewer dispatch.

## Worker contract
- **Gate: do not start until the PB-CH-3 merge commit is on trunk.** Worktree `wt/PB-CH-4-lane2-l2t<HHMM>` off
  CURRENT `cl/integration-2` HEAD at claim time — HEAD must include the PB-CH-3 merge (verify with
  `git log --oneline`; record BOTH the claim-time SHA and the PB-CH-3 merge SHA in the report). Standard lane
  bootstrap: node_modules + server/src symlinks from trunk, NFS `git worktree add` in BACKGROUND, `git -c
  core.fileMode=false`, NEVER `git add -A`, NEVER touch `/mnt/vast/home/brad/git/computable-lab`.
- Deliverable report (unique path): `.hermes/plans/PB-CH-4-report.wip-l2t<HHMM>.md` — MUST contain: red-first
  outputs, the test-matrix mapping, verification 2-7 outputs verbatim (comm -3 set-diffs, empty forbidden diffs),
  the intent-pin five→six diff shown deliberately, the `workingFocus` request-body excerpt, the executor-contract
  SHA it built on, honest notes for PENDING-RESTART / PENDING-BROWSER-GATE items, and an explicit statement that
  the tier-1 unsaved-work guarantee is the EXECUTOR's (cite its merged report), mounted, not re-implemented.
- One branch, one logical commit (+ optional report commit). **UI task ⇒ browser gate AFTER merge** (the
  orchestrator owns it; the coder self-verifies nothing in the browser pre-merge). Zero YAML ⇒ **no stack restart
  for YAML reasons**; :3093/:5193 serve trunk — the coder does not restart them.

## Reviewer bait (the adversarial review looks exactly here)
- **The actionable-from-garbage card (THE criterion):** any path where Accept is reachable from the SSE intent
  alone, or from `canAccept:false`, or where the model's raw terms render as an actionable proposal. Proof owed:
  the two "no accept control" tests + a late-superseded-response test. A card whose Accept appears the instant
  `workstate_proposal` lands is an automatic FAIL.
- **Push before accept:** any `replaceState`/store dispatch while a card is PENDING; the pending
  `sessionDocument` copied into OpenTabsContext "for preview"; a ghosted tab. Proof owed: the 600 ms zero-putSession
  test with a pending card + non-target tab reference identity. If the temptation is `useApplySessionDocument`
  "just for preview" — that function IS the single writer; preview via it is the vandalism AR-2 names.
- **Second AI call at accept:** Accept that re-asks the model, re-compiles via `/ai/assist/stream`, or re-sends
  the intent for a "confirmation pass". Proof owed: the fetch-spy accept test; server-side, accept touches no
  inference client (structural, PB-CH-2 verdict 5 — don't reintroduce one).
- **Unsaved-work regression through tier-1:** the mount dispatching its own `replaceState`/`close`, re-rendering
  the editor tree on apply, or ADDING A CONFIRM DIALOG when the executor returns `NO_FOCUS_PROVIDER`/`NO_TAB_STORE`.
  Those diagnostics are CORRECT conservative behavior (PB-CH-3 OQ2/OQ3 promotions) — surfacing text is the fix;
  re-implementing deep-link fallbacks or `openInNewTab` hacks locally is scope theft from the architect.
- **The exhaustive seam weakened:** adding a `default:` to `useChatThread`'s switch (it MUST keep the
  `const _exhaustive: never = event` arm), or widening `dispatchFrame`'s default to swallow agent_action, or
  `as any`-ing the new union members. The compile error was the FEATURE.
- **ChatPage hunks / generic-stack creep:** any diff in ChatPage, `useAiChat.ts`, `aiClient.ts`, or a second
  proposal-card implementation for another stack (PB-CH-6 owns the generic mount; reuse comes later).
- **Focus fakes:** reading `document.querySelector('[data-ctx-step]')` off ChatContextHeader instead of
  `useProtocolSelection().focusedStep`; or stuffing `workingFocus` into `context` (warm-prefix churn + the
  attachedProtocol precedent is about STABILITY); or overloading `protocolStepContext` (it ghosts the deck).
- **Hardcode boundary:** surface-name literals in the card (labels come from `useSurfaceRegistry`); tab-kind
  switches duplicating the executor's mapping; verb lists in TS. Registry/data is authority.
- **exactOptionalPropertyTypes sites:** `workingFocus?`, `ordinal?`, `surface?`, `contextNote?`, event fields —
  conditional spread (`...(x ? {x} : {})`), server bar 26 set-identity; app convention identical even though
  app tsconfig omits the flag.
- **Intent-pin collateral:** updating the enum pin AND silently re-goldening anything else = scope creep; the
  five→six diff must be explicit in the report. Not updating the pins = red suite.
- **Symlink landmine:** `useChatThread.deckLayout.test.tsx` (app) and `createRecordIntent.test.ts` (server) are
  gitignored symlinks into Brad's live tree; the deckLayout load-fail is baseline RED — do not touch either.
- **Ports/data:** any :3001/:5174 evidence or writes under `/home/brad/.computable-lab/` (main data) = automatic
  fail. Browser fixtures are SEEDED, never Brad's live DNeasy/ROS data.

## Open questions (could not resolve locally; max 3)
1. **Tier-2 emission trust-boundary shape (design §4).** This spec emits the model's workstate INTENT verbatim
   as `workstate_proposal` and lets the client relay it to `POST /api/drafts/compile` — the compile endpoint (not
   the stream) is the Ajv/canAccept trust boundary, matching ai-drafting-and-ui-projection.md lifecycle step 1
   ("Submit the structured proposal to POST /api/drafts/compile") and PB-CH-2's assignment "the chat→draft
   proposal-emission mount is PB-CH-4". Checked: draft lifecycle doc, PB-CH-2 §6/out-of-scope, AgentOrchestrator
   workspace_action branch (:2075-2147 — the tier-1 precedent compiles INLINE because a draft service with a
   request-bound actor does not exist in the orchestrator's deps: AIHandlers has no AppContext/drafts access).
   If the architect rules that NO raw model term may ever cross the wire (even as a non-actionable event), the
   alternative is server-side FormDraftService plumbing inside the turn (actor resolution inside AIHandlers +
   emitting only the compiled draftId+summary+diagnostics) — bigger server diff, same client. Flag, don't
   bulldoze either way; the client design survives BOTH if the event grows a `draftId` instead of `intent`.
2. **`workingFocus` prompt block is a server hunk beyond the task-list's file shorthand.** The task's files line
   names only app files + "shared request types", but "goes INTO the request contract" is inert unless the model
   sees it — hence §4's AssistBody field + one systemPrompt block (zero YAML, hot-reloads). Checked: task block
   files line, AssistBody (AIHandlers.ts:46-60 passes `context` unvalidated — the field could also ride `context`
   unrendered with zero server diff, but then the model literally cannot resolve "the step I'm looking at" and the
   gap-fix is cosmetic). If the orchestrator rules server files out, PB-CH-4 ships the typed client field and the
   gate can only prove explicit-"step 3" focus via the ATTACHED PROTOCOL block — say so in the promotion notes.
3. **Does the merged PB-CH-3 hook actually wire `useProtocolSelection` internally?** The promoted spec §2 says
   yes (NO_FOCUS_PROVIDER path), so AiTabPanel passes no focus callback. Checked: promoted spec §2 text; PB-CH-3's
   code is NOT on trunk yet (in flight, pid 2512495). If the merge lands with focus-supply left to the caller,
   PB-CH-4 passes `focusProtocolStep` from `useProtocolSelection()` at the mount — one-line adapt, contract in the
   promotion notes; if it lands differently AGAIN, STOP.

---
Report: DONE — draft at this path. Summary: PB-CH-4 mounts PB-CH-3's `useWorkstateExecutor` at AiTabPanel
(hooks already at :122-123), extends the app union + the never-default switch with `agent_action` (PB-CH-1,
emitted today, silently dropped by `dispatchFrame` — verified 0 occurrences in app/src) and a thin
`workstate_proposal` intent event, renders a WorkstateProposalCard that becomes actionable ONLY from a
`/api/drafts/compile` `canAccept:true` response, and Accepts via the orchestrator-confirmed FLAT body →
`applyAcceptedWorkstate(body, {accepted:true}, {draftId,revision,reviewHash})` with zero second AI call and zero
push-before-accept; the context gap closes with a typed top-level `workingFocus` on the assist request (+ one
server prompt block, OQ2) sourced from `ProtocolSelectionContext.focusedStep`. Baselines I measured myself at
85a16976: app tsc 34 `error TS` lines (47 raw lines — pin counts error lines), server tsc 26 (confirms the
inherited pin), full app 53 failed files/63 failed/1866 passed (matches the inherited baseline exactly), targeted
ai+session 11 files/74 PASS + 1 environmental symlink load-red (deckLayout), server src/ai 10/21/565 (73 files),
grep agent_action app/src = 0, app/src draft endpoints = 0. Inherited: src/drafts 3/39, PB-CH-3 executor API
(contract-trust until merge). The browser gate is an independent serial-vision-slot review AFTER merge with the
seven named wave1 screenshots and API/reload re-verification of every negative claim. **Coder does not start
until the PB-CH-3 merge is on trunk.** Open: tier-2 emission trust-boundary shape, server-file ruling for the
focus prompt block, PB-CH-3 focus-wiring confirmation at merge.
