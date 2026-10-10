# ADVERSARIAL REVIEW — PB-CH-4 (lane 2), worktree `wt/PB-CH-4-lane2-l2t0150`

Reviewer: cl-adversarial-reviewer (deepseek, distinct model family from the coder).
Item: PB-CH-4 "Mount the workstate executor in run chat + two-device workstate acceptance proof
(and focus goes into the request)".
Diff reviewed: `git -C <wt> -c core.fileMode=false diff dcf2de3f..HEAD` — 26 files, +2261/−71.
Commit under review: `c3c29a69` on base `dcf2de3f` (PB-CH-3 merge `1f466b8b` is an ancestor).
I did NOT fix, edit, restart, or run the app stack. I ran the tests and typechecks myself.

---

## 1. Scope / ownership

`git -c core.fileMode=false diff --stat dcf2de3f..HEAD -- schema/ config/ app/src/shared/session/
app/src/shared/surfaces/ app/src/shared/session/ server/src/drafts/` → EMPTY.
`git diff --name-only` for ChatPage / useAiChat.ts / aiClient.ts → EMPTY.
Server hunks: AgentOrchestrator.ts, submitSuggestionTool.ts, systemPrompt.ts, types.ts, AIHandlers.ts
(+ their tests) — exactly the spec-named files. No second proposal-card implementation.
26 changed files decompose to: 9 new/adjusted implementation files, 2 pin-test edits, 3 existing
AiTabPanel test-harness provider wraps (see §7 M2), and the new test files. No `.snap`/golden files
re-golded.

## 2. Acceptance criteria (spec "Acceptance criteria", verbatim) and how each was checked

> Red-first component/protocol tests, then INDEPENDENT browser review (single vision slot, serial,
> named surfaces only): ask run chat to focus a seeded protocol step + open a seeded surface
> (immediate compiled navigation, unsaved work preserved); pending card + reject => context B and
> /api/session PROVEN unchanged; accept in context A => visible adoption in context B via attach,
> no second AI call. Screenshots: wave1-tier1-focus.png, wave1-open-surface.png,
> wave1-unresolved-diagnostic.png, wave1-pending-card.png, wave1-rejected-unchanged.png,
> wave1-accepted-A.png, wave1-attached-B.png. Registry IDs/URLs recorded. Negative claims
> re-verified by API/reload.

The screenshots / two-device attach / network-tab second-AI-call proof are the POST-MERGE browser gate
(§"Browser gate"), owned by the orchestrator's cl-browser-reviewer — NOT verifiable pre-merge and not
claimed by the coder. I verified the CODE-level preconditions each screenshot would exercise (below)
and the red-first tests. The browser gate remains PENDING by construction.

## 3. The ten non-negotiable checks — each checked, with evidence

**C1 — No actionable card from schema-validity/raw SSE alone.**
`WorkstateProposalCard.tsx:137–166` renders the Accept button ONLY when `phase === 'review'`.
`AiTabPanel.tsx:576–596` sets `phase: res.canAccept ? 'review' : 'blocked'` — the sole assignment of
'review', sourced from the `POST /api/drafts/compile` response. A `workstate_proposal` SSE frame sets
`phase:'compiling'` (no controls) then calls the compile; a thrown/blocked compile sets 'blocked'
(no Accept). Rendering the card requires `workstateCard !== null`; the only thing that writes it is
`handleWorkstateProposal`.
My run of the panel/card tests: "a workstate_proposal event alone renders NO accept control … until
the compile response arrives" and "compile response canAccept:false renders summary + diagnostics and
NO accept control" both PASS (see §5). No path yields Accept from the raw event. PASS.

**C2 — No push before accept.**
`AiTabPanel` tier-2 handlers touch only local state refs (`workstateCardRef`, `pendingDraftRef`,
`compileSeqRef`); no `replaceState`/OpenTabs dispatch; the accepted `sessionDocument` is never copied
into the store. `executor.applyAcceptedWorkstate` is called only inside `handleWorkstateAccept`.
My run: the 600 ms pending-card test (`with a pending card, advancing 600 ms fires ZERO putSession
and the tab store reference-identity is unchanged`) PASSES with a REAL `OpenTabsProvider` +
REAL `useSessionSync` + real `StoreProbe`; it also asserts the proposed tab id never appears in
`store.tabs`. The executor (PB-CH-3) is the only writer. PASS.

**C3 — No second AI call at accept.**
`handleWorkstateAccept` (`AiTabPanel.tsx:631–664`) calls only `apiClient.acceptWorkstateDraft`.
`/api/drafts/accept` is served by `FormDraftService.accept` (server/src/drafts/draftRoutes.ts), which
contains no inference client (grep for `InferenceClient|completeStream|assist/stream` in
server/src/drafts/*.ts → 0 hits). My run of the fetch-spy accept test PASSES. PASS.

**C4 — Exhaustive seam intact.**
`useChatThread.ts:265` adds `case 'workstate_proposal'`; the `agent_action` case is present; the
`default: { const _exhaustive: never = event; return _exhaustive }` arm SURVIVES
(`grep -n "_exhaustive"` → line 272–273). No `as any` on new union members (`grep -rn "as any"` on
the changed impl files → only a comment). `assistStream.dispatchFrame`'s `default:` return is intact
(the unknown-frame test passes). PASS.

**C5 — No out-of-scope creep.**
ZERO hunks in ChatPage, useAiChat.ts, aiClient.ts (verified). Server files limited as in §1. No second
proposal-card implementation. (One scope-adjacent test-only touch — see §7 M2, disclosed, non-product.)
PASS with note.

**C6 — Focus contract.**
`AssistStreamRequest.workingFocus` is a NEW TOP-LEVEL optional member (`assistStream.ts:1570`), not
inside `context`, and not overloaded onto `protocolStepContext`. It is populated in
`AiTabPanel.tsx:522–534` from `useProtocolSelection().focusedStep` + `protocol.recordId` (NOT a DOM
`querySelector`), conditionally spread. Threaded through `useChatThread` SendOptions and serialized
because `runAssistStream` does `JSON.stringify(request)` (whole object). Server side: `AssistBody.
workingFocus` (`AIHandlers.ts:2771`), parsed in the `assistStream` handler (the one bound to
`POST /ai/assist/stream`, routes.ts:645), conditionally spread into `editorContext`, rendered by
`formatWorkingFocus` only when present. My run of the two useChatThread focus tests PASSES
(`workingFocus` key ABSENT when unfocused). PASS.

**C7 — Hardcode boundary.**
`WorkstateProposalCard.tsx` contains no surface-name literals: tab labels resolve via
`useSurfaceRegistry()` (`labelForKind`, line 72–74); everything else is generic copy. No verb lists or
tab-kind switches duplicated in TS (the tab-kind policy stays in `config/drafting/workstate-tab-kinds.
yaml`, untouched). See §7 M1 for a join-key observation (not a literal-hardcode violation). PASS.

**C8 — exactOptionalPropertyTypes discipline.**
All new optional object fields use conditional spread (`...(workingFocus ? {workingFocus} : {})` in
AIHandlers/useChatThread/AiTabPanel; `...(surface ? …)`, `...(workstate ? …)` in submitSuggestionTool;
`...(focused.ordinal !== undefined ? {ordinal} : {})` in AiTabPanel). Server tsc error multiset is
IDENTICAL to trunk (see §6) — zero new `error TS` lines, so no undefined-vs-absent violation. PASS.

**C9 — Intent-pin honesty.**
The five→six widening is confined to exactly two files: `submitSuggestionTool.test.ts` and
`submitSuggestionTool.protocolEdit.test.ts` (both edited to the six-element array with the PB-CH-4
rationale in comments). No other enum pin exists (`grep` for the 5-element literal across app+server →
0 hits outside those two). Nothing else re-goldened. PASS.

**C10 — Tests actually assert.**
I read every new test body. The three load-bearing ones are genuinely falsifiable:
- "no accept control" tests: assert `queryByTestId('workstate-card-accept')` is null while
  `workstate-card-compiling` is present, and null for `canAccept:false` — would fail if the card were
  prematurely actionable.
- 600 ms zero-putSession test: real `useSessionSync` + real store probe + `mockClear()` of the
  baseline push, then asserts zero `putSession` and store reference identity — would fail on any mount
  store write.
- fetch-spy accept test: asserts the accept body `{draftId,revision,reviewHash}` exactly, the flat
  body handed to `applyAcceptedWorkstate` with `{accepted:true}`+identity, and no `assist/stream`
  fetch. PASS.
(The accept fetch-spy loop is a weak negative — vacuous if no fetch fires — but the accept body and
executor-call assertions in the same test are strong and load-bearing. Not a defect.)

## 4. Other real-bug hunt (races, superseded responses, idempotence)

- **Superseded compile**: `handleWorkstateProposal` guards both the success and catch paths with
  `if (seq !== compileSeqRef.current) return`. Reject bumps `compileSeqRef`. My run of the
  superseded-response test PASSES ("late response … must not resurrect"). No stale-resurrection path.
- **Double-Accept idempotence**: after a successful accept the phase becomes `'applied'` and the
  controls unmount; a same-tick second click is absorbed by PB-CH-3's executor dedup guard
  (`seenKeys`/`recordAcceptedApply`), and the server's `accept` is idempotent
  (`if(draft.status==='accepted') return …`). No double-write path.
- **Accept body shape / seam**: client `acceptWorkstateDraft` sends `{draftId,revision,reviewHash}`;
  `FormDraftService.accept` reads exactly those; it returns `compiled.result` =
  `{sessionDocument, summary, resolvedTerms}` (the flat body the executor expects). `compile` request
  `{adapter:'workstate', intent, draftId?, revision?}` matches `FormDraftService.compile`; adapter
  `workstate`/operation `compose-workstate` is registered. Seam is consistent.
- **Emission**: `AgentOrchestrator` `compose_workstate` branch emits exactly one `workstate_proposal`
  + `tool_result success:true`, no store/compiler call; missing envelope → error channel, no event.
  `AIHandlers.sendEvent` JSON-stringifies the whole event, so `workstate` reaches the stream; the
  client `dispatchFrame` reads `parsed.workstate`. End-to-end field name matches.
- **Tier-1 narrow**: open-surface without a registered surface / focus without a target returns a
  diagnostic string instead of guessing; `executeTier1` is called exactly once per event (test PASS).

## 5. Commands I ran (real output)

App new tests (the item's own files):
`cd app && npx vitest run assistStream.agentAction.test.ts useChatThread.agentAction.test.tsx
AiTabPanel.workstate.test.tsx WorkstateProposalCard.test.tsx chatReducer.actionTrace.test.tsx
assistStream.test.ts` → **Test Files 6 passed (6) / Tests 39 passed (39)**.

App targeted (spec verification 2):
`cd app && npx vitest run src/event-editor/right-pane/ai src/shared/session` →
**Test Files 3 failed | 33 passed (36) / Tests 263 passed (263) / Errors 1 error.**
The 3 failed FILES are pre-existing gitignored symlink load-errors into Brad's live tree
(draftChanges.test.ts, ParameterAnswerInput.test.tsx, useChatThread.deckLayout.test.tsx); the 1 error
is the pre-existing `ClarificationPicker.tsx:215` timer error. Both reproduce on trunk.

Server targeted (incl. src/drafts):
`cd server && npx vitest run <6 named test files> src/drafts` →
**Test Files 8 passed (8) / Tests 74 passed (74)** (incl. src/drafts 3 files/39 green, untouched).

App full suite (spec verification 3): worktree **53 failed | 234 passed (287) / 63 failed | 1945
passed (2008)**; trunk **53 failed | 229 passed (282) / 63 failed | 1917 passed (1980)**.
`comm -3` of the sorted FAIL-file lists → **EMPTY (set-identical)**. +5 files / +28 passed.

App tsc (spec verification 4): `npx tsc --noEmit --pretty false | grep -c "error TS"` → **34** both
trees; normalizing out line:col the error multiset diff is **IDENTICAL** (zero new errors).

Server typecheck (spec verification 5): **26** `error TS` lines both trees; normalized multiset diff
**IDENTICAL** (zero new errors).

Server `src/ai` (spec verification 6): worktree **10 failed | 66 passed (76) / 21 failed | 578 passed
(599)**; trunk **10 failed | 63 passed (73) / 21 failed | 565 passed (586)**; `comm -3` FAIL-file sets
→ **EMPTY**. Intent pins (five→six) shown in the diff and both now green.

Grep proofs: `window.confirm` in the card/panel → 0; `as any`/`@ts-ignore` in changed impl → 0;
`_exhaustive` arm present; forbidden-path diffs empty.

## 6. Minor, non-blocking observations (do NOT require a fix cycle)

M1 (cosmetic label resolution). `WorkstateProposalCard.tsx:72–74` resolves labels with
`registry.find(s => s.id === kind)`, joining surface-registry ids against lab-session TAB kinds. The
registry ids are `find|run-plan|run-design|run-execute|results|analysis|knowledge|project|ingestion|
protocol-review`; the compilable tab kinds are `run|project|record-edit|protocol-review`. So 'run' and
'record-edit' never match and fall back to the raw kind string; only 'project'/'protocol-review'
resolve. In practice compiled tabs almost always carry a `title` (workstateCompile populates it), which
wins at line 94, so this is cosmetic. No surface-name literal is present, so C7 still passes. If a
title is ever absent the card shows a raw kind token.

M2 (scope-adjacent, test-only, disclosed). Three pre-existing AiTabPanel test harnesses
(`AiTabPanel.test.tsx`, `AiTabPanel.protocolEdit.test.tsx`, `AiTabPanel.runPageSurface.test.tsx`) were
wrapped in `OpenTabsProvider` — pure test scaffolding, no product code, because the panel now consumes
the executor whose `useApplySessionDocument` requires the provider (production mounts it app-wide at
`App.tsx:128`). These files are not in the spec's §1–§6 in-scope list, but the change is behavior-
neutral (all pass 12/12, 12/12, 12/12) and was declared as AS-PBCH4-OPENTABS-WRAP.

M3 (naming deviation from spec text). Spec §2b/§2d name the client union field/param `intent`;
the implementation uses `workstate`, matching the server wire frame (§4 `{type:'workstate_proposal',
workstate}`). The spec is internally inconsistent here; the implementation picked the only value that
can actually parse the server frame. Functional.

M4 (observation). The `compose_workstate` branch does not call `shadowRoute(...)` the way
`deck_layout`/`protocol_edit`/`workspace_action` do. Not required by the spec's binding decisions and
not covered by any test; noting for the orchestrator's awareness only.

## 7. VERDICT

Every one of the ten non-negotiable checks passes with my own command output as evidence. The
red-first "no accept control", 600 ms zero-putSession, fetch-spy accept, superseded-response, and
focus-on-the-wire tests are genuinely falsifiable and green. Typecheck error sets are byte-identical
to trunk; full-suite and server `src/ai` failing-file sets are set-identical to trunk. No blocking
defect found. The remaining observations (M1–M4) are cosmetic/scope-disclosed and do not violate any
STOP rule. The browser gate and two-device attach proof remain PENDING post-merge by construction.

VERDICT: accept
