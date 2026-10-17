# SPEC DRAFT — HARNESS-SEQ-1 (l2t0650) — Unified harness chat on sequences, Phases 1–2

Status: composer draft, NOT canonical, awaiting orchestrator review.
Source plan: `.hermes/plans/2026-10-11_100213-unified-harness-chat-sequences.md` (Phases 1–2 only).
Every file:line below was re-verified against trunk `cl/integration-2` @ tip `2531fc3d` on
2026-10-14 (git -c core.fileMode=false). The plan's own line citations are treated as
hypotheses; where they drift, this spec's citations win.

## Goal (one sentence)

Replace the bespoke `SequenceChat` right pane of `/lab/sequences` with the shared
`HarnessChatPane` that renders the chat already registered via `useRegisterAiChat`, add a
surface-agnostic `SurfaceFocusHeader` + `ChatFocusContext` that derives the working-focus
label from resolved surface state with zero model calls, and prove it with an unmodified
`three-pane-harness.spec.ts`, a new rule-12 e2e, and the :5193 browser gate.

## Why

One chat panel, one chat engine, one focus concept. The registration seam
(`useRegisterAiChat` -> `AiPanelContext`) is fed by six surfaces today and consumed by
NOBODY (verified: no `useAiPanel` consumer outside `AiPanelContext.tsx` itself — grep on
current trunk; scout screening said the same). Sequences is functionally on the harness
backend already (`useAiChat` endpoint 'sequences', `/api/ai/assist/stream`,
`sequenceIntentTool`, server `forceDraftTool` for `surface==='sequences'` at
`server/src/ai/AgentOrchestrator.ts:1081,:1144`); only the panel and focus semantics are
bespoke. This is the deliberately-integrated nonparticipating route the harness plan
reserved, minus Phase 3 (agent actions) and Phase 4 — both stay gated (HARNESS-SEQ-2).

## Ground-truth findings (file:line verified in the CURRENT tree @ 2531fc3d)

1. Sequences host today — `app/src/sequences/SequencesPage.tsx`:
   - `:9` imports `SequenceChat`; `:108` `rightPane={<SequenceChat messages={chat.messages}
     isStreaming prompt onPromptChange onReview onSend onCancel/>}`. The `prompt` textarea
     state is owned by the PAGE (`:18` `const [prompt,setPrompt]=useState('')`).
   - `:14` `const tabs=['Editor','Assay','Analysis','Setup','Import','Knowledge'] as const`
     (TS const; moving it to YAML is Phase 3's work — do NOT touch it here).
   - `:16` `tab` state, `:17` `selected` record id, `:17` `records` — these three ARE the
     resolved surface state the focus header needs; zero derivation cost, no model call.
   - `:33-37` `onSequenceProposal` (save_sequence/create_oligo -> editor draft, else the
     structured-action YAML textarea at `:107`); `:38` sessionStorage handoff
     `cl-sequence-proposal`; `:47` `selectRecord` honors `editorRef.canLeave()===false`.
     ALL of these stay byte-identical in behavior.
   - `:39` `aiContext` (surface 'sequences', summary `Sequence workspace — <tab>`);
     `:40` `useAiChat({aiContext,onSequenceProposal,endpoint:'sequences',
     proposalScopeKey})` + `useRegisterAiChat(chat)` — :40 is now LOAD-BEARING: it is the
     ONLY thing feeding the panel.
   - NOTE: the plan's `SequencesPage.tsx:101-108` shell citation still holds
     (`:101` AppShell, `:108` rightPane); plan's "line 40" chat claim verified exactly.
   - Shell three-pane split renders whenever `navPane` is supplied:
     `app/src/shared/shell/AppShell.tsx:186,286` (`cl-workspace__pane--chat`).

2. The pane to promote — `app/src/sequences/SequenceChat.tsx` (87 lines):
   - Scroll spine `followLatest` + ResizeObserver (`:23-52`) + resize-vs-user-scroll
     disambiguation (`:54-68`) — keep verbatim per plan ("better than a naive scrollTop").
   - Contract pinned by tests/e2e: root `<aside class="... sequence-chat">` (`:70`),
     `role="log" aria-label="Conversation"` (`:73`), 'Review action' button for
     `message.sequenceProposal` (`:78`), 'Latest messages ↓' pill (`:82`), textarea labelled
     `Message` (`:83`), Send/Cancel (`:84-85`).
   - `SequenceChat.test.tsx` (70 lines) pins review-with-originating-request + scroll
     behavior; `app/e2e/sequence-chat-scroll.spec.ts` (exists TODAY, plan missed it) pins
     `.sequence-chat` (`:70`), `getByRole('log',{name:'Conversation'})` (`:56`),
     `getByLabel('Message',{exact:true})` (`:57`) — see reviewer bait.

3. The registration seam — `app/src/shared/context/AiPanelContext.tsx`:
   - `useAiPanel` (`:70-76`) returns `chat: chatRef.current` (null when nothing registered)
     + subscribes via `chatVersion`. `useRegisterAiChat` (`:78-95`) writes the ref every
     render, bumps on mount, CLEARS on unmount — a single-slot ref, one chat per provider.
   - Provider is app-wide: `app/src/main.tsx:40` wraps `<App/>`
     (`CurrentUserProvider > AiPanelProvider > App`). Two surfaces nest their OWN provider
     (`LiteratureBody.tsx:46`, `BrowserBody.tsx:36`) — HarnessChatPane must NOT add another
     provider; consume the nearest one.
   - Other registrants today (verified): `MaterialsPage.tsx:46-47`,
     `FormulationsPage.tsx:640-641` (both endpoint 'browser'), `ProtocolsBody.tsx`,
     `LiteratureBody.tsx`, `BrowserBody.tsx`. They are the future consumers named in the
     plan; this item does NOT rewire them.

4. The run-workspace pane (regression boundary):
   - `app/src/agent/AgentChatPane.tsx` = `ChatContextHeader` + `AiTabPanel`,
     `data-testid="agent-chat-pane"`. Mounted ONLY at `app/src/run/RunWorkspacePage.tsx:138`
     (route lives at `app/src/App.tsx:44,194` — the file `app/src/graph/RunWorkspacePage.tsx`
     also exists but is NOT what the /runs/:runId route lazy-imports; the 2026-10-11 plan's
     "mounted only by graph/RunWorkspacePage" is stale on the directory).
   - `app/src/event-editor/right-pane/ai/ChatContextHeader.tsx` reads
     `useProtocolSelection` (`:11,:15`); testid `chat-context-header` (`:20,:36`); empty text
     "No step focused — ask the AI to navigate" (`:22`); active text "EDITING" +
     `Step <ordinal>: <text>` (`:39-40`).
   - `app/e2e/three-pane-harness.spec.ts` (EXACT PATH `app/e2e/three-pane-harness.spec.ts`)
     asserts, on `/runs/RUN-2026-09-07-run-nzrs`: agent-chat-pane visible; protocol-nav +
     3 run-nav tabs; the three `.cl-workspace__pane--*`; >=4 `protocol-nav-step-*`;
     `chat-context-header` contains "No step focused" then "EDITING" + "Step 1" after a rail
     click; action pane contains deck text (5 tests). UNMODIFIED = zero characters edited.
     `AgentChatPane.test.tsx` (21 lines) also pins the header+panel+no-tablist.

5. useAiChat surface (what the pane may render):
   - `app/src/shared/hooks/useAiChat.ts`: `UseAiChatReturn` `:110-136` — public
     `messages: ChatMessage[]`, `isStreaming`, `inputText`, `sendPrompt(prompt,
     attachments?)`, `cancelStream`, `aiAvailable`, `thinkingMode/setThinkingMode`.
   - Options `:150-187`: `aiContext`, `endpoint` (thread hydrate/append per-endpoint),
     `onSequenceProposal`, `proposalScopeKey`, plus workstate/analysis/agent-action
     callbacks (PB-CH wave — out of scope here).
   - Clarification rides the messages: assistant messages get
     `clarification: result.clarification` at `useAiChat.ts:660` (message content becomes
     `result.clarification?.prompt` first, `:656`); `ChatMessage` declares
     `clarification?: AiClarification` (`app/src/types/ai.ts:549`, interface `:199-210`:
     `prompt` + numbered `options[]` + optional `menuProvider`) and
     `clarificationRequests?: AiClarificationRequest[]` (`:551`).
     SCOUT SCREENING WAS WRONG HERE: a cl-scout pass claimed "useAiChat does not surface
     clarification data"; refuted by `useAiChat.ts:660` + `types/ai.ts:549` read directly.
     A new pane CAN adopt the clarification turn without touching AiTabPanel internals.

6. Lane 2's clarification-turn mechanism as merged (the thing to REUSE, files in section
   "Clarification-turn adoption" below). Server-side shorthand seams `shorthandChat.ts` /
   `coerceAgentIntent.ts` live in `server/src/ai/` (present at tip; Phase 3 concern only).

7. Backend facts confirmed but OUT OF SCOPE: `surfaces.yaml:92-97` declares the `sequences`
   surface (aiRole verified); `sequenceIntentTool` import at `AgentOrchestrator.ts:1`;
   `forceDraftTool` hard-true for sequences at `:1081` and `:1144`. NO server file and NO
   YAML file is in scope for Phases 1–2 — that relaxation is HARNESS-SEQ-2's re-verification
   duty (its dispatch_gate says exactly that).

## Explicitly OUT of scope

- ANY file under `server/` and ANY file under `schema/` (no surfaces.yaml, no tabs-as-data,
  no agent-action schema, no forceDraftTool change — HARNESS-SEQ-2 owns those).
- `app/src/ingestion/protocol-review/ReviewAiPanel.tsx` + its tests/css — DO NOT TOUCH
  (list it in the handoff as a future HarnessChatPane consumer, per the item).
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` internals, chatReducer, sidebarState,
  ChangesPanel, QuestionsPanel, MessageLog — import/export-reuse only, zero edits (the
  SHORTHAND-COMP wave + ReviewAiPanel walls landed on these since 2026-10-11; they are hot).
- `app/src/graph/RunWorkspacePage.tsx`, ChatPage (`app/src/chat/`), LiteratureBody/
  BrowserBody/ProtocolsBody/MaterialsPage/FormulationsPage rewiring (future consumers).
- Phase 3/4 of the plan (agent_action emission, capabilities YAML, tab-aware open-surface,
  cross-surface threads).

## File plan (new / promoted / removed)

NEW (all app-side; the lane list's "app/src/shared" wording is read as "shared component" —
`app/src/agent/` is the harness-pane home and the plan's own commands target `src/agent`;
see open question 1):
- `app/src/agent/HarnessChatPane.tsx` (+ `HarnessChatPane.css` if needed)
  - reads `useAiPanel().chat` (AiPanelContext.tsx:70); renders
    `SurfaceFocusHeader` + `ChatLog` + composer (prompt state LOCAL to the pane;
    Send -> `chat.sendPrompt(prompt)` + clear; Cancel -> `chat.cancelStream()` while
    `isStreaming`); `data-testid="harness-chat-pane"` on the root.
  - `chat === null` -> honest empty state (e.g. "No surface has registered a chat with
    this panel."), NO fake messages, NO crash, composer disabled.
  - accepts optional host prop `onReviewProposal?: (proposal, userRequest?) => void`
    threaded into ChatLog's Review-action button; absent -> button omitted or no-op with a
    visible reason (decide + test; SequencesPage passes its existing `onSequenceProposal`).
- `app/src/agent/ChatFocusContext.tsx`
  - tiny provider `{ focus: { surface, label, detail?, refs? } | null, setFocus }`;
    focus lives in the HOST page's state (SequencesPage), not in the context's own logic;
    absent provider -> SurfaceFocusHeader renders nothing/honest fallback.
- `app/src/agent/SurfaceFocusHeader.tsx`
  - renders `Working focus: <label>` from `ChatFocusContext` ONLY. NEVER from AI prose,
    never a model call. Mirror the visual contract of ChatContextHeader (label+value) but
    its own testid, e.g. `surface-focus-header` (do NOT reuse `chat-context-header` —
    three-pane spec counts it on the run page).
- `app/src/agent/HarnessChatPane.test.tsx`, `app/src/agent/ChatFocusContext.test.tsx`
  (RED-first, see test plan).
- `app/e2e/sequences-harness-chat.spec.ts` (rule 12 e2e).

PROMOTED (git mv, keep green):
- `app/src/sequences/SequenceChat.tsx` -> `app/src/agent/ChatLog.tsx` (component `ChatLog`;
  same props minus nothing it uses; keep scroll spine verbatim; KEEP the `sequence-chat`
  class name on the root — see reviewer bait B2).
- `app/src/sequences/SequenceChat.test.tsx` -> `app/src/agent/ChatLog.test.tsx`.
- CSS: move the needed `SequencesPage.css:17-22` (`.sequence-chat*` rules) into
  `app/src/agent/ChatLog.css`; delete dead ones from SequencesPage.css.

MODIFIED:
- `app/src/sequences/SequencesPage.tsx` — delete `:9` import + `:18` prompt state; wrap the
  page in `ChatFocusProvider`; publish focus on every tab/selected/records change:
  label `Sequences — <Tab>` plus ` · <selected record label>` when `selected` resolves in
  `records` (label = `payload.label ?? name ?? title ?? recordId`, the same fallback chain
  as `:30`); `rightPane={<HarnessChatPane onReviewProposal={onSequenceProposal} />}`.
  Everything else (:33-47, :101-107 nav/textarea/handoff) untouched.
- `app/src/event-editor/right-pane/ai/ChatContextHeader.tsx` — Phase 2 ONLY: optional
  delegation — if a `ChatFocusContext` is present and non-null use it, else the EXISTING
  `useProtocolSelection` path byte-for-byte (no run page publishes the new context, so run
  output is literally unchanged; testid + all strings stay identical).

REMOVED: `app/src/sequences/SequenceChat.tsx` (via the promotion above — acceptance says
"no SequenceChat.tsx in tree").

HANDOFF obligation: report names `ReviewAiPanel` (app/src/ingestion/protocol-review/
ReviewAiPanel.tsx) + the five other registrant surfaces as future HarnessChatPane consumers.

## Clarification-turn adoption (lane 2 mechanism — REUSE, never duplicate)

Lane 2's ruling: confirm terms in the review dialogue (the chat's clarification turn),
never a blocking pre-draft card. The merged mechanism's reusable parts, all import-only:
- `app/src/event-editor/right-pane/ai/ClarificationPicker.tsx` — exported
  `ClarificationPicker` (`:163`) + `requestHasPicker`; already reused across surfaces
  (QuestionsPanel.tsx:112, ProtocolLocalizationThread.tsx:771, ProtocolIdeShell.tsx:521).
  Proven pattern: import it, don't fork it.
- `AiTabPanel.tsx:51-58` `clarificationAnswerPrompt` and `:61-74`
  `clarificationAnswersPrompt` — EXPORTED; import them for the answer-round-trip prompt
  text if HarnessChatPane answers typed requests.
- Data contract: `ChatMessage.clarification` (`app/src/types/ai.ts:549`; interface
  `:199-210`), set by `useAiChat.ts:660` — that is what a useAiChat pane reads.
What HARNESS-SEQ-1 does: ChatLog/HarnessChatPane renders an assistant message carrying
`m.clarification` as a clarification turn — the `prompt` plus its numbered `options` as
buttons; picking one calls `chat.sendPrompt(clarificationAnswerPrompt-style text)`, i.e.
the confirmation happens as the next chat turn, never a modal/card that blocks the pane.
If `menuProvider` typed questions ever reach a sequences turn, the pane may reuse
`ClarificationPicker` rather than invent a chooser. What it does NOT do: re-implement
QuestionsPanel/MessageLog/cards, touch AiTabPanel, or add any pre-draft gate. Honest note
(verified): `surface==='sequences'` hard-sets `forceDraftTool` true
(AgentOrchestrator.ts:1081,:1144), so today the sequences backend may rarely emit
clarification turns; the pane makes the mechanism AVAILABLE and unit-tests it with a stub
chat — emission behavior belongs to HARNESS-SEQ-2, which must not build a second one either.

## RED-first test plan

0. Baselines FIRST, before any edit (record outputs in the report):
   - `cd app && npx playwright test e2e/three-pane-harness.spec.ts e2e/sequence-chat-scroll.spec.ts --project=chromium`
     with `PLAYWRIGHT_BASE_URL=http://localhost:5193` (playwright.config.ts:11 defaults to
     :5174; the lane stack is :5193). Expected: all pass (5 + 1 tests).
   - `npm run typecheck -w app` — record the exact error-line baseline; ZERO new lines
     allowed (lane baselines have been 34-47 recently; compare sorted lists, not vibes).
1. RED unit: `app/src/agent/HarnessChatPane.test.tsx` — render under `AiPanelProvider`
   with a stub host calling `useRegisterAiChat(fakeChat)`; assert
   `[data-testid="harness-chat-pane"]`, focus-header slot, fakeChat messages, Send calls
   `fakeChat.sendPrompt`; AND `chat===null` -> honest empty state, no sendPrompt. Confirm
   RED: `cd app && npx vitest run src/agent/HarnessChatPane.test.tsx` fails
   "Cannot find module './HarnessChatPane'". Same RED step for ChatFocusContext/SurfaceFocusHeader.
2. GREEN: `cd app && npx vitest run src/agent src/sequences src/event-editor/right-pane/ai`
   — all green (the right-pane/ai set is the AiTabPanel/ChatContextHeader regression wall
   the SHORTHAND wave built; it must not move).
3. Unmodified regression: `cd app && npx vitest run src/run` green; the :5193
   three-pane + sequence-chat-scroll e2e pair passes with the spec files untouched
   (`git diff --name-only` must not list either spec).
4. NEW e2e `app/e2e/sequences-harness-chat.spec.ts` (rule 12), copying the proven stub
   pattern from `app/e2e/sequence-chat-scroll.spec.ts:21-53` (page.route('**/api/**'
   thread/catalog/contract + addInitScript fetch-swap for /api/ai/assist/stream):
   a. `/sequences` shows `[data-testid="harness-chat-pane"]` alongside the Library nav
      (three-pane, `.cl-workspace__pane--chat` present);
   b. type + Send -> user bubble in `getByRole('log',{name:'Conversation'})`, streaming
      state toggles, streamed reply lands (emit via the stub window hook);
   c. honest-empty: mount with the registration absent (stub: hard to do from e2e — unit
      test 1 covers chat===null; e2e asserts the PANE exists instead — do not fake it);
   d. focus without a model call: click the Analysis tab, then a Library record; header
      label follows BOTH; assert ZERO `/api/ai/assist/stream` requests fired on those
      clicks (spy on the fetch swap before Send is ever used);
   e. clarification turn: stub `done` result with `clarification:{prompt,options}` ->
      options render; clicking an option fires a SECOND stream request whose body carries
      the chosen term (round-trip proof, still the same chat.sendPrompt path).
   Run: `cd app && npx playwright test e2e/sequences-harness-chat.spec.ts --project=chromium`.
5. Typecheck + report. UI is not done until cl-browser-reviewer returns VERDICT: accept
   against :5193 on the MERGED trunk tip (candidate = post-merge commit; stack via
   cl-lane-stack.sh 2 — restart is BLOCKING, use background; tsx --watch does NOT reload
   YAML, but this item ships no YAML so no restart is strictly needed unless trunk moved).

## Acceptance criteria (verbatim from the lane list, id HARNESS-SEQ-1)

  /lab/sequences right pane is HarnessChatPane (no SequenceChat.tsx in tree); focus header
  follows tab/record changes without a model call; three-pane-harness.spec.ts passes
  UNMODIFIED; pane honest-empty without registered chat. Browser gate :5193; VERDICT:
  accept.

## Worker contract

- Worktree: `wt/HARNESS-SEQ-1-lane2-l2t<ts>` off trunk `cl/integration-2` AT DISPATCH TIP
  (never off 455232cf / main; re-check trunk moved — g2dfix3 merge is expected soon).
- Lane stack: worktree /mnt/vast/home/brad/git/cl-integration-2, backend :3093, frontend
  :5193, manage via `cl-lane-stack.sh 2` (`2 status` safe; `restart` BLOCKING — background).
- Playwright: `cd app && npx playwright test <file> --project=chromium` with
  `PLAYWRIGHT_BASE_URL=http://localhost:5193`.
- Deliverable report: `.hermes/plans/HARNESS-SEQ-1-report.wip-l2t<ts>.md` (unique path),
  end marker `HARNESS-SEQ-1 DONE <sha>`; include baseline outputs, RED evidence, per-criterion
  mapping, and the ReviewAiPanel future-consumer note.
- `git -c core.fileMode=false` everywhere; commit style per lane
  (`feat(harness): ...` / `test(harness): ...` RED commits welcome).
- Fleet lock: ONE coder at a time (queues behind any live W29-G2DFIX3 chain).

## Reviewer bait (expect these to be attacked)

- B1 — three-pane-harness.spec.ts UNMODIFIED means the delegation in ChatContextHeader must
  be fall-through-identical when no ChatFocusContext exists (run page). Any string,
  testid, or data-attr drift on the run header = FAIL. `AgentChatPane.test.tsx` too.
- B2 — `e2e/sequence-chat-scroll.spec.ts` pins `.sequence-chat` (spec :70), role=log
  name=Conversation, label 'Message'. ChatLog MUST keep those selectors (keep the
  `sequence-chat` class on the root) or the coder edits a shipped spec — allowed for THIS
  spec (it is not the three-pane one) but the orchestrator should prefer zero churn.
  YAML-reload analog: do not "modernize" selectors opportunistically.
- B3 — AiPanelContext single-slot ref: unmount clears (`AiPanelContext.tsx:88-93`). The
  pane must re-render on `chatVersion` bump (useAiPanel already subscribes) and must NOT
  cache a stale chat across surface switches; and do NOT wrap HarnessChatPane in another
  AiPanelProvider (nested providers already exist at LiteratureBody.tsx:46 /
  BrowserBody.tsx:36 — a third layer would shadow registrations).
- B4 — ontology/domain terms: sequences proposals must keep the exact `sequenceProposal` /
  `sequenceProposalRequest` flow (SequenceChat.tsx:78, types/ai.ts:532-533,
  useAiChat.ts:659); 'Review action' must pass the ORIGINATING user request, including when
  a newer user message exists (SequenceChat.test.tsx pins this). Knowledge-layer vocabulary
  in the Knowledge tab (claim/context/assertion/evidence selects) must not move — if any
  wording is touched, read docs/knowledge-layer-canonical-example.md first; best: touch none.
- B5 — hardcode boundary: focus label derives ONLY from resolved state (tab/selected/
  records); zero `/api/ai/assist/stream` on clicks is e2e-enforced (test 4d). No
  surface-name branches added anywhere; no new YAML/TS constants for tabs (that is SEQ-2
  3.1's YAML-first move). exactOptionalPropertyTypes is BACKEND-only (no backend edits in
  scope); app side is `strict` (app/tsconfig.json:18) and the codebase convention is
  conditional spread `...(x ? {k:v} : {})` — never assign `undefined` to optional props.
- B6 — honest empty state must be HONEST: no placeholder messages, no enabled composer,
  and it must disappear the moment a chat registers (unit-test both directions).
- B7 — do NOT import AiTabPanel into HarnessChatPane ("renders the registered chat" =
  AiPanelContext, not the deck-coupled panel); do NOT touch ReviewAiPanel; do NOT relax
  forceDraftTool; do NOT touch schema/ or server/.

## Open questions for the orchestrator

1. Pane home: lane list says "new app/src/shared HarnessChatPane + ChatFocusContext/
   SurfaceFocusHeader"; the source plan's tasks/commands say `app/src/agent/` (where
   AgentChatPane lives). I speced app/src/agent/ (co-located with the pane family, matches
   `vitest run src/agent`). If "app/src/shared" is literal, it is a 3-path rename before
   dispatch. Checked: app/src/shared has no chat-pane precedent; plan text consistently uses src/agent.
2. Clarification adoption depth: no sequences turn emits `clarification` today (forced
   draft at AgentOrchestrator.ts:1081,:1144). I speced "render + round-trip support,
   unit-tested on a stub, e2e-tested on a stub frame" as Phases 1-2's honest share, with
   real emission deferred to SEQ-2. If the orchestrator wants a live clarification turn on
   sequences inside this item, that contradicts the no-server-edit boundary — needs a ruling.
   Checked: useAiChat.ts:656-660, types/ai.ts:549, AgentOrchestrator.ts:1081/:1144.
3. sequence-chat-scroll.spec.ts: keep `.sequence-chat` class on ChatLog (zero spec churn —
   my recommendation, B2) vs rename to `.chat-log` + update that spec. I chose keep.
   Checked: spec :70 selector vs SequenceChat.tsx:70 root class.

## Assumptions the coder may NOT make

- May NOT assume the 2026-10-11 plan's file:line citations are current except where THIS
  spec re-verified them (notably: RunWorkspacePage is `app/src/run/`, not `app/src/graph/`).
- May NOT assume AiTabPanel internals are safe to import beyond the two exported prompt
  helpers named above, or that QuestionsPanel props fit useAiChat (they don't — it is
  bound to AiClarificationRequest + paused-draft semantics).
- May NOT assume the run page publishes ChatFocusContext (it must not; the fallback path is
  the regression guarantee).
- May NOT assume `chat` is non-null in HarnessChatPane (chat===null is a first-class state).
- May NOT assume the lane stack serves a worktree — :5193 serves the TRUNK app dir; the
  browser gate runs post-merge only; coder e2e runs against :5193 exercise trunk code, so
  land-then-gate, and re-verify served tip (curl a served module) before the gate.
- May NOT assume no other spec is broken by the rename: run the full `src/agent`,
  `src/sequences`, `src/event-editor/right-pane/ai`, `src/run` vitest sets and the two
  e2e specs; report baselines and finals verbatim.
- May NOT add server/schema/YAML changes "to make clarification real" — that is SEQ-2.
- May NOT touch ReviewAiPanel, AiTabPanel.tsx internals, chatReducer, sidebarState,
  ChangesPanel, QuestionsPanel (import-only where exported), or any other registrant page.

SPEC-DRAFT-DONE /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-14_0655-HARNESS-SEQ-1-harness-chat-spec-draft-l2t0650.md
