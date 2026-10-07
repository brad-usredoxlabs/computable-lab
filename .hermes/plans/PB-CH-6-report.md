# PB-CH-6 report — Follow-on mount: Analysis-local chat + ONE generic useAiChat consumer

Lane 2 coder item. Spec: `/mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-07_1100-PB-CH-6-generic-mount-spec.md` (promoted, dispatch-ready). OQ1/OQ2/OQ3 rulings followed as binding — not re-litigated.

Worktree: `/mnt/vast/home/brad/git/wt/PB-CH-6-lane2-l2t1115`
Branch: `cl/PB-CH-6-lane2-l2t1115`
Claim HEAD (lane trunk tip): `e629b0c6`

## Claim-gate ancestors (verified at claim, `git merge-base --is-ancestor`)
- `88496f2c` (PB-CH-4 fix chain) — ANCESTOR OK
- `a9426cfd` (PB-CH-5 merge) — ANCESTOR OK
- `e629b0c6` (PB-CH-4b merge = claim HEAD) — ANCESTOR OK

Trunk (`/mnt/vast/home/brad/git/cl-integration-2`) and Brad's live tree (`/mnt/vast/home/brad/git/computable-lab`) were NOT touched. All work is in the lane worktree.

## OQ rulings honored
- **OQ1**: consumer = `app/src/literature/PdfProtocolBuilder.tsx` (protocol-builder, reached at `/literature?view=build` via `LiteratureBody.tsx:111`; `useAiChat` at :127 endpoint `'literature'`). `<approved-surface-id> = literature`. ONE consumer touched. No other dead page, no LabwareEventEditor revival, no invented renderer.
- **OQ2**: Analysis mount = compact right-pane chat column, `data-testid="analysis-chat-panel"` (rendered inside `analysis-right`, above the artifact area).
- **OQ3**: precheck-first (ran FIRST, before any wiring — outputs below). Server change is the `systemPrompt.ts` `AiSurface` union member ONLY (6 added lines, 5 of them comment). No prompt text authored.

## First targeted check (ran BEFORE any wiring) — both prechecks, fresh empty history each

### Precheck 1 — surface `analysis`
```
curl -sN -X POST http://localhost:3093/api/ai/assist/stream \
  -H 'Content-Type: application/json' -H 'x-user-id: USR-BRAD' \
  -d '{"prompt":"compose the workspace: open the analysis surface","surface":"analysis","context":{},"history":[]}'
```
Frame sequence (full capture `/tmp/pbch6-precheck-analysis.txt`):
```
data: {"type":"status","message":"Processing analysis request..."}
data: {"type":"status","message":"Skipping compiler preflight; asking AI to call compile_event_graph_draft directly…"}
data: {"type":"status","message":"Turn 1..."}
data: {"type":"status","message":"AI request sent to thunderbeast; waiting for compile_event_graph_draft…"}
data: {"type":"status","message":"AI drafting on thunderbeast… 3s elapsed, waiting for first model chunk."}
data: {"type":"status","message":"AI drafting on thunderbeast… 6s elapsed, waiting for first model chunk."}
data: {"type":"status","message":"AI drafting on thunderbeast… 9s elapsed, waiting for first model chunk."}
data: {"type":"status","message":"AI stream resumed from thunderbeast."}
data: {"type":"status","message":"Drafting on thunderbeast…"}
data: {"type":"status","message":"Drafting on thunderbeast…"}
data: {"type":"tool_call","toolName":"agent_intent","args":{"intent":"compose_workstate","workstate":{"operation":"compose-workstate","tabs":[{"surface":"analysis","title":"Analysis"}],"activeTab":{"index":0}}}}
data: {"type":"workstate_proposal","workstate":{"operation":"compose-workstate","tabs":[{"surface":"analysis","title":"Analysis"}],"activeTab":{"index":0}}}
data: {"type":"tool_result","toolName":"agent_intent","success":true,"durationMs":0}
data: {"type":"done","result":{"success":true,"notes":["Proposed a workspace — review the card to accept; nothing was written."]}}
```

### Precheck 2 — surface `literature`
```
curl -sN -X POST http://localhost:3093/api/ai/assist/stream \
  -H 'Content-Type: application/json' -H 'x-user-id: USR-BRAD' \
  -d '{"prompt":"compose the workspace: open the literature surface","surface":"literature","context":{},"history":[]}'
```
Channel frames (full capture `/tmp/pbch6-precheck-literature.txt`; 23 `text_delta` + 7 `status` frames precede these):
```
data: {"type":"tool_call","toolName":"agent_intent","args":{"intent":"compose_workstate","workstate":{"operation":"compose-workstate","tabs":[{"surface":"knowledge","target":{"term":"literature"},"title":"Literature"}],"activeTab":{"index":0}}}}
data: {"type":"workstate_proposal","workstate":{"operation":"compose-workstate","tabs":[{"surface":"knowledge","target":{"term":"literature"},"title":"Literature"}],"activeTab":{"index":0}}}
data: {"type":"tool_result","toolName":"agent_intent","success":true,"durationMs":0}
data: {"type":"done","result":{"success":true,"notes":["Proposed a workspace — review the card to accept; nothing was written."]}}
```

**Result: NOT prose-only.** Both surfaces emitted `workstate_proposal` BEFORE `done` at `history: []` on the lane profile (qwen3.8-thunderbeast). No model-compliance stop. Wire frame shape matches `assistStream.ts:204-210` exactly (`{"type":"workstate_proposal","workstate":{...}}`, `{"type":"agent_action","action":{...}}`) — no envelope drift, no architect escalation.

Note for the browser gate: on `literature` the model mapped the ask to the registered `knowledge` surface (its own words: "the registered surfaces are find, run-plan, … 'literature' maps to the knowledge/find surface"). That is model behavior over the declarative registry, not a defect; the card still lands on the consumer page.

## What was built

### 1. Envelope awareness in the generic stack
- `app/src/types/ai.ts` (+38): `AiWorkstateProposalEnvelope`-class members added to `AiStreamEvent` — `{ type: 'workstate_proposal'; workstate: Record<string, unknown> }` and `{ type: 'agent_action'; action: AiAgentActionEnvelope }`, mirroring `assistStream.ts`'s `AssistStreamEvent` members field-for-field (incl. `AiAgentActionEnvelope` / target mirror). Optional fields are ABSENT, not `undefined` (conditional-spread convention).
- `app/src/types/aiContext.ts` (+5): `'analysis'` added to the app `AiSurface` union (comment ties it to the `/analysis` work surface and registry id `analysis`).
- `app/src/shared/hooks/useAiChat.ts` (+101): `UseAiChatOptions` gains OPTIONAL `onWorkstateProposal?` / `onAgentAction?`; the `sendPrompt` event loop handles the two new event types with the same never-break-the-turn wrapper style as the existing `pipeline_diagnostics` branch (a throwing callback cannot kill the turn). **Absent callback ⇒ NAMED system bubble**, never swallowed:
  - `'The assistant proposed a workspace change but this page cannot show proposal cards yet. Nothing was written.'`
  - agent_action arm names its own diagnostic likewise.
  Callbacks ride refs (`workstateProposalRef` / `agentActionRef`), following the hook's existing `addLabwareFromRecordRef` convention — required because `sendPrompt` is memoized and a stale closure captured a pre-registry-load handler (found by test, fixed by convention, not by a new mechanism).
- `app/src/shared/api/aiClient.ts`: **ZERO diff** (spec's honest finding — `streamAssist` already posts `/ai/assist/stream` for non-event-editor surfaces and `parseSSEBlock` is type-agnostic). `app/src/shared/context/AiPanelContext.tsx`: **ZERO diff** (mount renders locally via props).

### 2. The shared flow — ONE extraction, zero forks
- NEW `app/src/shared/ai/useWorkstateProposalFlow.ts` (207 lines): the lifted AiTabPanel orchestration — compile POST (`adapter` as a PARAMETER), card phase machine (compiling/review/blocked/applied), pending-identity supersede (a newer proposal discards a late compile response), accept via `acceptWorkstateDraft` + `executor.applyAcceptedWorkstate(body, {accepted:true}, identity)`, reject = abandon with zero writes. Consumed by AiTabPanel AND both new mounts.
- `app/src/event-editor/right-pane/ai/AiTabPanel.tsx` (226 lines changed, net −155): behavior-preserving refactor to consume the flow. `WorkstateAdapter` type now imported from the flow.
- **Extraction trap honored**: `workstateTurnRef` (AiTabPanel.tsx:343, :358-359, :587, :621) and the single `sendChat` choke point (:619-621, :632-637) STAY in AiTabPanel — they guard the panel turn model, not the flow. Comment at :575-576 records the ruling. No dangling `executor.` references remain in the panel.
- `useWorkstateExecutor` / `workstateExecutor.ts` / `sessionYaml.ts` / `tabId.ts` / `useSessionSync.ts` / `OpenTabsContext.tsx` / `assistStream.ts` / `useChatThread.ts`: **zero hunks** (consumed). NO second executor, no NO_TAB_STORE fallback hardening — the executor's conservative diagnostics are surfaced verbatim.

### 3. Analysis-local mount (`/analysis`)
- NEW `app/src/analysis/AnalysisChatPanel.tsx` (135 lines): compact chat column — message list + input + health-gated send via `useAiChat({ aiContext })` on the new `'analysis'` AiSurface + `useWorkstateProposalFlow` rendering `WorkstateProposalCard` inline. `data-testid="analysis-chat-panel"`.
- `app/src/analysis/AnalysisPage.tsx` (+5): panel mounted in the right pane above the artifact area. `analysis-ai-author` box byte-identical. Mount-time call set stays `listAnalysisRevisions`/`listAnalysisRuns` only.
- `app/src/analysis/AnalysisPage.css` (+16): the compact chat column styles.
- Server: `server/src/ai/systemPrompt.ts` (+6, 5 of them comment) — the additive `'analysis'` union member ONLY. `getSurfacePreamble` falls through to the generic prompt with an empty preamble (intended). No preamble/prompt template authored.

### 4. The ONE generic consumer
- `app/src/literature/PdfProtocolBuilder.tsx` (+42): the existing `useAiChat({ aiContext, endpoint: 'literature' })` call gains the two callbacks via the SAME `useWorkstateProposalFlow`; the tier-2 card rides the chat locally (same discipline as the run page — while a card is pending, no proposed tab renders anywhere). Surface stays `protocol-builder`; no new AiSurface. No other consumer file got a hunk.

### Missing-capability arms (each NAMED + tested, never a silent no-op)
- AI unhealthy (`getAiHealth` → `available:false`): input + send DISABLED with a visible reason line (`analysis-chat-unavailable`), send never fires fetch — `analysisChat.health.test.tsx`.
- No tab store (unit trees only): executor `NO_TAB_STORE` diagnostic surfaced verbatim — `useWorkstateProposalFlow.test.tsx` + `analysisChat.health.test.tsx`.
- `canAccept:false`: card blocked phase with diagnostics (existing card behavior, unchanged) — `useWorkstateProposalFlow.test.tsx`.
- No callback registered on a mount: NAMED system bubble (above) — `useAiChat.channelEnvelopes.test.tsx`.

## Verification (spec "Verification" contract, items 1-9)

### 1. RED first, then GREEN — genuine RED captured against pristine HEAD
Implementation hunks were stashed (`git stash push -u -m pbch6-red-capture -- <impl paths>`) so the new suites ran against pristine `e629b0c6` + new tests only. RED output (`/tmp/pbch6-red-capture.txt`):
```
FAIL  src/shared/ai/useWorkstateProposalFlow.test.tsx [ src/shared/ai/useWorkstateProposalFlow.test.tsx ]
⎯⎯⎯⎯⎯⎯⎯ Failed Tests 9 ⎯⎯⎯⎯⎯⎯⎯
 FAIL  src/types/aiStreamTypes.pin.test.ts > AiStreamEvent ↔ AssistStreamEvent channel-member pin (PB-CH-6) > types/ai.ts carries the workstate_proposal member with the verbatim wire shape
 FAIL  src/types/aiStreamTypes.pin.test.ts > ... > types/ai.ts carries the agent_action member with the verbatim wire shape
 FAIL  src/types/aiStreamTypes.pin.test.ts > ... > the envelope mirror matches assistStream.ts AgentActionEnvelope field-for-field
 FAIL  src/types/aiStreamTypes.pin.test.ts > ... > the target mirror matches assistStream.ts AgentActionTargetEnvelope variants
 FAIL  src/shared/hooks/useAiChat.channelEnvelopes.test.tsx > useAiChat — channel envelope callbacks (PB-CH-6) > workstate_proposal frame fires onWorkstateProposal with the verbatim payload
 FAIL  src/shared/hooks/useAiChat.channelEnvelopes.test.tsx > ... > agent_action frame fires onAgentAction with the verbatim envelope
 FAIL  src/shared/hooks/useAiChat.channelEnvelopes.test.tsx > ... > workstate_proposal with NO callback registered surfaces a NAMED system bubble — the frame is never swallowed
 FAIL  src/shared/hooks/useAiChat.channelEnvelopes.test.tsx > ... > agent_action with NO callback registered surfaces a NAMED system bubble — the frame is never swallowed
 FAIL  src/shared/hooks/useAiChat.channelEnvelopes.test.tsx > ... > a throwing callback does not break the turn (pipeline_diagnostics wrapper style)
 Test Files  3 failed (3)
      Tests  9 failed | 1 passed (10)
```
GREEN after implementation (`/tmp/pbch6-green-newsuites.txt`, all 8 new suites):
```
 ✓ src/types/aiStreamTypes.pin.test.ts  (5 tests) 13ms
 ✓ src/shared/hooks/useAiChat.tracesNoExecute.test.tsx  (1 test) 114ms
 ✓ src/shared/hooks/useAiChat.channelEnvelopes.test.tsx  (5 tests) 304ms
 ✓ src/shared/hooks/useAiChat.textDraft.compat.test.tsx  (5 tests) 328ms
 ✓ src/shared/ai/useWorkstateProposalFlow.test.tsx  (10 tests) 564ms
 ✓ src/literature/pdfProtocolBuilder.card.test.tsx  (2 tests) 383ms
 ✓ src/analysis/analysisChat.health.test.tsx  (2 tests) 167ms
 ✓ src/analysis/AnalysisPage.chat.test.tsx  (5 tests) 540ms
 Test Files  8 passed (8)
      Tests  35 passed (35)
```
Test matrix coverage: envelope variant A (text/draft compat), variant B (channel frames + no-callback bubble), union pin, missing-provider path, tool-traces-never-execute, card lifecycle on the generic stack, Analysis mount honesty, consumer mount, envelope pin server-absent-not-undefined.

### 2. `npx vitest run src/shared/hooks src/shared/api` (`/tmp/pbch6-ver2-hooks.txt`)
```
 ✓ src/shared/api/client.signature.test.ts  (12 tests) 14ms
 ✓ src/shared/hooks/useAiChat.tracesNoExecute.test.tsx  (1 test) 108ms
 ✓ src/shared/hooks/useAiChat.triState.test.ts  (7 tests) 57ms
 ✓ src/shared/hooks/useAiChat.textDraft.compat.test.tsx  (5 tests) 330ms
 ✓ src/shared/hooks/useAiChat.channelEnvelopes.test.tsx  (5 tests) 331ms
 ✓ src/shared/hooks/useAiChat.empty.test.ts  (7 tests) 238ms
 FAIL  src/shared/hooks/useAiChat.surfaceContext.test.ts [ src/shared/hooks/useAiChat.surfaceContext.test.ts ]
 Test Files  1 failed | 6 passed (7)
      Tests  37 passed (37)
```
Baseline 26 PASS held (triState 7 + empty 7 + signature 12) + new files green; the ONE symlink FAIL (`useAiChat.surfaceContext.test.ts`, a gitignored symlink into Brad's live tree) unchanged — reported, never fixed. Failing-file set: exactly that one file.

### 3. `npx vitest run src/event-editor/right-pane/ai src/shared/session src/analysis` — no-fork proof
```
 FAIL  src/event-editor/right-pane/ai/ParameterAnswerInput.test.tsx [ ... ]
 FAIL  src/event-editor/right-pane/ai/draftChanges.test.ts [ ... ]
 FAIL  src/event-editor/right-pane/ai/useChatThread.deckLayout.test.tsx [ ... ]
 Test Files  3 failed | 42 passed (45)
      Tests  300 passed (300)
```
`AiTabPanel.workstate` **14**, `protocolEdit` **9**, `runPageSurface` **7**, `WorkstateProposalCard` 5, `AiTabPanel.test` 15, `assistStream` 11, `assistStream.agentAction` 4, `useChatThread.agentAction` 7, `workstateExecutor` 35, `useWorkstateExecutor` 16, `sessionYaml` 6 + dedupe 3, `applySessionDocument` 4 — all byte-green. The 3 FAILs are the known symlinks (`ls -la` verified: `ParameterAnswerInput.test.tsx -> /mnt/vast/home/brad/git/computable-lab/...`), unchanged. ZERO new failures.

### 4. Full-app `npx vitest run` — failing-file SET set-identical to the 53-file baseline
Baseline (pristine HEAD, `/tmp/pbch6-fullapp-baseline.txt`): `Test Files 53 failed | 239 passed (292)`, `Tests 63 failed | 1966 passed (2029)`.
Head (`/tmp/pbch6-fullapp-head2.txt`): `Test Files 53 failed | 247 passed (300)`, `Tests 63 failed | 2001 passed (2064)`.
```
$ grep -oE "FAIL  src/[^ >]+" <baseline> | sort -u > /tmp/base-failset.txt   # 34 distinct FAIL-file lines
$ grep -oE "FAIL  src/[^ >]+" <head>      | sort -u > /tmp/head2-failset.txt # 34 distinct FAIL-file lines
$ comm -3 /tmp/base-failset.txt /tmp/head2-failset.txt
COMM=0        # EMPTY — set-identical
```
Passed-file count rose 239→247 and passed tests 1966→2001 (my 8 new files, 35 tests) with the failing set unchanged.

Honesty note on an intermediate run: an earlier head run (`/tmp/pbch6-fullapp-head.txt`) showed 55 failed files — two extra: `AnalysisPage.chat.test.tsx` (my own test's 60ms compile timer resolved before `findByTestId`'s first poll under full-suite load, skipping past the `compiling` slot) and `SurfaceIndicator.test.tsx` (a `getSurfaces` mock leak from a sibling analysis test under that scheduling). I fixed MY test's race deterministically (test-controlled deferred `compileGate` + `release()` only after observing the compiling slot — no timer), re-ran, and the set is now identical. `SurfaceIndicator.test.tsx` passes in isolation and in every pair run with my files; it is not touched by this item and does not appear in the final failing set.

### 5. `npx tsc --noEmit`
App: **34 `error TS` lines**, path-normalized `comm -3` vs baseline EMPTY (`/tmp/pbch6-tsc-baseline2.txt` vs `/tmp/pbch6-tsc-head2.txt`, `COMM_EXIT=0`) — file-set identical. (An intermediate 35-line run was my own unused `act` import in a new test; removed, back to 34.)
Server: **26 `error TS` lines**, `comm -3` vs the server baseline EMPTY (`/tmp/pbch6-server-tsc-baseline.txt` vs `/tmp/pbch6-server-tsc-head.txt`) — the one-line union hunk added no error line.

### 6. Forbidden-path proof + no-fork greps
`git -c core.fileMode=false diff HEAD --name-only` (⊆ declared files):
```
app/src/analysis/AnalysisPage.css
app/src/analysis/AnalysisPage.tsx
app/src/event-editor/right-pane/ai/AiTabPanel.analysis.test.tsx
app/src/event-editor/right-pane/ai/AiTabPanel.tsx
app/src/literature/PdfProtocolBuilder.tsx
app/src/shared/hooks/useAiChat.ts
app/src/types/ai.ts
app/src/types/aiContext.ts
server/src/ai/systemPrompt.ts
```
Forbidden-path diff (`app/src/chat app/src/components/registry app/src/shared/session schema config server/src/drafts server/src/ai/AgentOrchestrator.ts server/src/ai/submitSuggestionTool.ts app/src/event-editor/right-pane/ai/useChatThread.ts app/src/event-editor/right-pane/ai/assistStream.ts app/src/protocols app/src/browser app/src/editor app/src/protocol-ide app/src/knowledge app/src/graph`) → **EMPTY**.

- `git diff HEAD | grep -c AiDraftBar` → **0** (AiDraftBar untouched; ledger §7 respected).
- No-fork grep: `grep -rn "compileWorkstateDraft" app/src --include=*.ts --include=*.tsx | grep -v .test.` →
  ```
  app/src/shared/api/client.ts:2261:  async compileWorkstateDraft(req: {      # the client definition (consumed as-is)
  app/src/shared/ai/useWorkstateProposalFlow.ts:5: * machinery. The fork detector: ...  # comment
  app/src/shared/ai/useWorkstateProposalFlow.ts:92:        const res = await apiClient.compileWorkstateDraft({   # THE single call site
  ```
  One call site, inside the shared flow; AiTabPanel reaches it only via the flow.
- No second SSE parser: `grep -rn "EventSource|parseSSEBlock|event-stream" app/src/shared/ai app/src/analysis app/src/shared/hooks` → EMPTY. `dispatchFrame` exists only in `assistStream.ts` (untouched) — no copy-paste.
- `grep -c "adapter" app/src/shared/ai/useWorkstateProposalFlow.ts` → parameterized reuse (adapter union + single compile/accept sites).
- `app/src/shared/api/aiClient.ts` and `app/src/shared/context/AiPanelContext.tsx` → zero diff.

### 7. NO-RESTART-NEEDED
No YAML/schema/config changed. The only server hunk is a TypeScript **type-only** union member in `systemPrompt.ts` (`export type AiSurface = ... | 'analysis'`) — runtime-erased, so the running server's behavior is unchanged. The lane backends are live and were NOT restarted: `:3093 /api/health` 200 and `:5193` 200 (re-verified), and `ps` shows the `tsx --watch src/server.ts` processes still running with multi-day elapsed times (no bounce occurred during this item). The precheck curls above ran against the live tsx-watch server. The YAML trap does not apply (no YAML touched). Nothing observed that would require a bounce for the curl receipts step.

### 8. API receipts
The two precheck curls are pasted in full above (analysis + literature, fresh `history: []` each). No other curls were made; the stack was not restarted; no browser was touched.

### 9. PENDING-BROWSER-GATE
Browser review is orchestrator-owned after merge (independent `cl-browser-reviewer`, single vision slot, serial). Screenshots owed verbatim (OQ1 ruling fills `<approved-surface-id>` = `literature`): `analysis-local-proposal.png`, `analysis-local-accepted.png`, `generic-literature-action.png`, `generic-literature-proposal.png`, `run-channel-regression.png`. Coder touched NO browser. Suggested gate notes from this implementation: fresh thread per ask; on `/literature?view=build` the model may propose the `knowledge` surface (see precheck note) — the card is the assertion, not the surface name; accept turns must carry zero `/ai/assist/stream` hits.

## Deviations / consequential assumptions (declared)
1. **`AiTabPanel.analysis.test.tsx` source-pin retargeted** (the one test file in the diff). PB-CH-5's pin asserted the PRE-extraction inline shape (`const handleWorkstateAccept = useCallback` in the panel, `adapter: 'workstate' | 'analysis'` declared in the panel, a compile call site in the panel). PB-CH-6's design §2 mandates lifting exactly that orchestration into the shared flow, and the spec's own verification item 6 describes the POST-extraction shape ("compileWorkstateDraft ... ONLY the shared flow (+ AiTabPanel via it)"). The pin now asserts the same no-fork intent against the sanctioned shape: panel has ZERO compile/accept call sites, exactly ONE proposal handler, both adapter constants passed to the SAME handler; the flow holds the adapter union and exactly one compile + one accept call site. No assertion was weakened — the fork detector got stricter (panel call sites must now be zero).
2. **`useAiChat` callbacks ride refs** (following the hook's existing `addLabwareFromRecordRef` convention). Required: `sendPrompt` is memoized, so a direct option capture held a stale handler from before the surface registry promise resolved (surfaced as a real test failure, not a guess).
3. **`AnalysisPage.chat.test.tsx` uses a test-controlled compile gate** rather than a timer, after a load-dependent race was observed in the full-suite run (see item 4 honesty note).
4. `app/src/shared/ai/` previously contained no flow file; the new directory entry `app/src/shared/ai/` in git status is this item's new file pair (flow + test).

## Stop boundaries — none crossed
- Providers present (prechecks produced channel frames on both surfaces). No turn-ownership conflict: `workstateTurnRef`/`sendChat` stayed in AiTabPanel and its 14+9+7 tests stayed byte-green, so the extraction preserved behavior. No envelope drift (wire shape matched `assistStream.ts:204-210`). No stop was hit; nothing was pushed through a boundary.

## Status
Implementation complete and locally verified. **Acceptance PENDING-BROWSER-GATE** (orchestrator dispatches the reviewer; coder marks it and touches no browser).
