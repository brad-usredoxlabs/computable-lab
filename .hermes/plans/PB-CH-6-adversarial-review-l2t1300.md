# Adversarial review — PB-CH-6 (Lane 2), Analysis-local chat + ONE generic useAiChat consumer

Reviewer: cl-adversarial-reviewer (OpenRouter deepseek-v4.1-flash; different model family from coder).
Item: PB-CH-6. Worktree: /mnt/vast/home/brad/git/wt/PB-CH-6-lane2-l2t1115
Branch: cl/PB-CH-6-lane2-l2t1115. Code commit: 3a0b074d. Tip/report commit: aaf503e9. Base: e629b0c6 (orch-verified ancestor — not re-litigated).
Spec: /mnt/vast/home/brad/git/cl-integration-2/.hermes/plans/2026-10-07_1100-PB-CH-6-generic-mount-spec.md
Coder report: .hermes/plans/PB-CH-6-report.wip-l2t1131.md

Full diff read: `git -c core.fileMode=false diff e629b0c6..3a0b074d` → 2230 lines, 19 files, +1766/-195. Every hunk read.

## Commands run (my own execution, this host)

1. Diff + name-status:
   `git -c core.fileMode=false diff --stat e629b0c6..3a0b074d` → 19 files +1766/-195 (matches report).
   `git -c core.fileMode=false diff --name-status e629b0c6..3a0b074d` → 10 A, 9 M (listed below).
2. Targeted new suites (all 8 new suites + related):
   `npx vitest run src/shared/ai src/types/aiStreamTypes.pin.test.ts src/shared/hooks/useAiChat.channelEnvelopes.test.tsx src/shared/hooks/useAiChat.textDraft.compat.test.tsx src/shared/hooks/useAiChat.tracesNoExecute.test.tsx src/analysis src/literature/pdfProtocolBuilder.card.test.tsx`
   → **Test Files 12 passed (12); Tests 49 passed (49)**. New-file breakdown: aiStreamTypes.pin 5, channelEnvelopes 5, textDraft.compat 5, tracesNoExecute 1, useWorkstateProposalFlow 10, pdfProtocolBuilder.card 2, analysisChat.health 2, AnalysisPage.chat 5 = 35 new tests.
3. AiTabPanel regression net:
   `npx vitest run src/event-editor/right-pane/ai`
   → AiTabPanel.workstate **14 ✓**, protocolEdit **9 ✓**, AiTabPanel.test **15 ✓**, plus 29 files/209 tests passed. 3 FAILs are the known env symlinks (ParameterAnswerInput.test.tsx, draftChanges.test.ts, useChatThread.deckLayout.test.tsx — resolved id → /mnt/vast/home/brad/git/computable-lab/...); unchanged.
   `npx vitest run src/event-editor/right-pane/ai/AiTabPanel.analysis.test.tsx` → **6 passed** (retargeted pin green).
4. Hooks+api baseline: `npx vitest run src/shared/hooks src/shared/api` → **Tests 37 passed (37); 1 failed file = useAiChat.surfaceContext.test.ts** (the known gitignored symlink into Brad's live tree). Baseline 26 + new files green; failing set = exactly that symlink.
5. App typecheck: `npx tsc --noEmit` → **34 `error TS` lines**, distinct-file set (24) `comm -3` vs the coder's pristine baseline (`/tmp/pbch6-tsc-baseline2.txt`) **EMPTY**. Zero changed-file error lines (grep for AnalysisChatPanel/AnalysisPage/AiTabPanel/PdfProtocolBuilder/useAiChat.ts/types/ai.ts/aiContext/useWorkstateProposalFlow → none).
6. Server typecheck: `cd server && npx tsc --noEmit` → **26 `error TS` lines** (matches server pin); **zero** lines reference systemPrompt.ts → the union hunk added no error line.
7. Full app: `npx vitest run` → Test Files 54 failed | 246 passed (300); Tests 64 failed | 2000 passed (2064); 5 unhandled errors (all pre-existing: ClarificationPicker.tsx:215, RawRecordEditor/taptab mock). See "Observations".
8. Independent server precheck (fresh history, my own curl):
   `curl -sN -X POST http://localhost:3093/api/ai/assist/stream -H 'Content-Type: application/json' -H 'x-user-id: USR-BRAD' -d '{"prompt":"compose the workspace: open the analysis surface","surface":"analysis","context":{},"history":[]}'`
   → frame types: 11 status, 1 tool_call, **1 workstate_proposal**, 1 tool_result, 1 done. Payload:
   `data: {"type":"workstate_proposal","workstate":{"operation":"compose-workstate","tabs":[{"surface":"analysis","title":"Analysis"}],"activeTab":{"index":0}}}`
   Wire shape matches the app union/pin member `{"type":"workstate_proposal","workstate":{...}}` exactly.
9. Forbidden path / zero-diff proofs:
   `git -c core.fileMode=false diff e629b0c6..3a0b074d -- app/src/shared/api/aiClient.ts app/src/shared/context/AiPanelContext.tsx` → **0 lines**.
   `git -c core.fileMode=false diff --name-only e629b0c6..3a0b074d -- schema config lint app/src/chat app/src/components app/src/shared/session server/src/drafts server/src/ai/AgentOrchestrator.ts server/src/ai/submitSuggestionTool.ts app/src/event-editor/right-pane/ai/useChatThread.ts app/src/event-editor/right-pane/ai/assistStream.ts app/src/protocols app/src/browser app/src/editor app/src/protocol-ide app/src/knowledge app/src/graph` → **EMPTY**.
   `git diff e629b0c6..3a0b074d | grep -c AiDraftBar` → **0**.

Files in diff: app/src/analysis/{AnalysisChatPanel.tsx(A), AnalysisPage.chat.test.tsx(A), AnalysisPage.css(M), AnalysisPage.tsx(M), analysisChat.health.test.tsx(A)}, app/src/event-editor/right-pane/ai/{AiTabPanel.analysis.test.tsx(M), AiTabPanel.tsx(M)}, app/src/literature/{PdfProtocolBuilder.tsx(M), pdfProtocolBuilder.card.test.tsx(A)}, app/src/shared/ai/{useWorkstateProposalFlow.ts(A), useWorkstateProposalFlow.test.tsx(A)}, app/src/shared/hooks/{useAiChat.ts(M), useAiChat.channelEnvelopes.test.tsx(A), useAiChat.textDraft.compat.test.tsx(A), useAiChat.tracesNoExecute.test.tsx(A)}, app/src/types/{ai.ts(M), aiContext.ts(M), aiStreamTypes.pin.test.ts(A)}, server/src/ai/systemPrompt.ts(M).

## Contract checks (each verdict + evidence)

**C1 — NO FORKS (ONE compile→card→accept/reject implementation).** PASS.
- `compileWorkstateDraft` production call sites: only `app/src/shared/ai/useWorkstateProposalFlow.ts:92`; `acceptWorkstateDraft` only `:143`. `shared/api/client.ts` is the definition only.
- AiTabPanel.tsx has **zero** `compileWorkstateDraft(`/`acceptWorkstateDraft(` (retargeted pin asserts this; grep confirms; no dangling `executor.`/`handleWorkstateAccept`/`handleWorkstateReject`).
- AiTabPanel consumes the flow: import `useWorkstateProposalFlow, type WorkstateAdapter` (AiTabPanel.tsx:47), `const flow = useWorkstateProposalFlow()` (:543), `handleWorkstateProposal(intent, adapter)` delegates `void flow.proposeWorkstate(adapter, intent)` (:587-588), `onAgentAction: flow.handleAgentAction` (:598), card render from `flow.card` (:1065+), accept/reject from `flow.acceptWorkstate()/rejectWorkstate` (:1086-1087).
- AnalysisChatPanel.tsx:48-55 and PdfProtocolBuilder.tsx:125-133 both compose the SAME flow (`onWorkstateProposal → flow.proposeWorkstate`, `onAgentAction: flow.handleAgentAction`). No second SSE parser: `dispatchFrame`/`parseSSEBlock` exist only in assistStream.ts/aiClient.ts (untouched); no `EventSource`/`event-stream` under shared/ai, analysis, shared/hooks.

**C2 — useAiChat optional callbacks + REAL ref pattern + named bubble on absent callback.** PASS.
- Options: useAiChat.ts:1969-1970 `onWorkstateProposal?`, `onAgentAction?`.
- Refs (not a comment): `const workstateProposalRef = useRef(onWorkstateProposal); workstateProposalRef.current = onWorkstateProposal` and same for agentActionRef (useAiChat.ts:1986-1989). Branches read `workstateProposalRef.current` / `agentActionRef.current` (:488-555), not the captured option.
- Absent callback: workstate_proposal → system bubble "…cannot show proposal cards yet. Nothing was written." (:503-513); agent_action → "…cannot apply workspace actions yet. Nothing was written." (:543-553). Both `continue` (never swallowed). Throwing-callback wrapper mirrors the pipeline_diagnostics style and keeps the turn alive (:490-502, :518-542). Asserted by useAiChat.channelEnvelopes.test.tsx (5 tests green) incl. the no-callback and throwing-callback cases.

**C3 — types/ai.ts union members mirror assistStream.ts; pin grounds itself in the real files.** PASS (with note).
- `types/ai.ts`: `AiWorkstateProposalEvent {type:'workstate_proposal'; workstate: Record<string,unknown>}` and `AiAgentActionEvent {type:'agent_action'; action: AiAgentActionEnvelope}` + `AiAgentActionEnvelope`/`AiAgentActionTargetEnvelope`, added to `AiStreamEvent`. Field-for-field identical to assistStream.ts:175-186/204/210 (action union, target union, optional `surface`/`contextNote`/`supportedBy`, absent-not-undefined).
- The pin (`aiStreamTypes.pin.test.ts`) is NOT a hand-copied duplicate: it `readFileSync`s BOTH `types/ai.ts` and `event-editor/right-pane/ai/assistStream.ts` and regex-asserts each real file's shape, two-way (one test asserts assistStream.ts still carries its own members). A drift in either file fails the pin. 5/5 green.
- Note (not a defect): the pin's reference authority is `assistStream.ts` (a hand-maintained TS mirror of `schema/workflow/agent-action.schema.yaml`), not the schema file itself. That is exactly the source-pin the spec's red-first matrix names ("structurally match assistStream.ts's members (source-pin/golden)"), so it satisfies the criterion; it does not independently bind the schema.

**C4 — server/src/ai/systemPrompt.ts hunk type-only.** PASS.
- Diff adds only 6 lines at :280-285: `| 'analysis'` to `export type AiSurface` plus a 5-line comment. No `getSurfacePreamble`/template/prompt text change. Runtime-erased. My own precheck (cmd 8) confirms the generic-prompt path drives the forced tool on `analysis`. NO-RESTART-NEEDED is honest for the app; the server hunk is type-only.

**C5 — workstateTurnRef + sendChat choke STAY in AiTabPanel (extraction trap).** PASS.
- `workstateTurnRef` declared AiTabPanel.tsx:343, consumed at :358-359, set `true` at :587 (inside handleWorkstateProposal, synchronously before `void flow.proposeWorkstate`), reset at the single choke `sendChat` :621. `sendChat` wrapper :619-625 unchanged. The flow hook does not capture the turn flag (useWorkstateProposalFlow.ts takes no turn-flag parameter). AiTabPanel.workstate 14/14 green.

**C6 — declared DEVIAION: AiTabPanel.analysis.test.tsx source-pin retarget.** PASS (stricter).
- BEFORE (base e629b0c6, PB-CH-5): panel asserted `handle\w*Proposal = useCallback` count 1; `handle\w*(Workstate|Analysis)Accept = useCallback` count 1; panel contains `"adapter: 'workstate' | 'analysis'"`; panel contains both `handleWorkstateProposal(intent, 'workstate')` and `(intent, 'analysis')`; compile call sites in the panel count 1.
- AFTER (3a0b074d): panel `compileWorkstateDraft(` count **0**, panel `acceptWorkstateDraft(` count **0** (strictly stronger: the panel may hold no call site at all); panel proposal-handler count 1; panel still contains both adapter-literal handler call sites; flow asserted to hold `export type WorkstateAdapter = 'workstate' | 'analysis'` and exactly ONE `compileWorkstateDraft({` and ONE `acceptWorkstateDraft({`.
- Net: the fork detector did not weaken — the panel guarantee moved from "exactly one accept handler" to "zero compile/accept call sites in the panel", with the single call-site count now pinned in the flow. The only superseded assertion is the old in-panel accept-handler count, which is subsumed by the zero-call-site assertion. Test green (6/6).

**C7 — exactOptionalPropertyTypes (optional absent, not undefined).** PASS.
- Card props at all three mounts use conditional spread: `{...(flow.card.summary !== undefined ? {summary: …} : {})}` etc. (AnalysisChatPanel.tsx:98-103; PdfProtocolBuilder.tsx:949-954; AiTabPanel.tsx:1065-1070). Optional callback options declared `?`; `optional fields ABSENT` documented at types/ai.ts:105. No `: undefined` assignments in the new production code.

**C8 — tests non-vacuous (35 new across 8 suites).** PASS.
- useWorkstateProposalFlow.test.tsx (10): asserts card phase transitions (compiling→review/blocked/applied), `compileWorkstateDraft` called with `{adapter,intent}`, supersede/discard of a late response (`card.draftId !== 'DRAFT-STALE'`), accept = exactly ONE accept fetch + `applyAcceptedWorkstate(result,{accepted:true},identity)`, duplicate-ignored spends the card, ok:false → blocked with executor diagnostics, reject zero calls, agent-action narrowing / named diagnostic.
- AnalysisPage.chat.test.tsx (5): mount fires ONLY listAnalysisRevisions/listAnalysisRuns (no execute/promote/compile/accept); panel visible + analysis-ai-author intact; workstate_proposal → compiling slot (asserts accept control ABSENT) then review card, accept → one accept call + executor apply + applied; reject zero writes; agent_action → executeTier1.
- pdfProtocolBuilder.card.test.tsx (2): card renders + accept rides the flow; plain text turn → ZERO compile/accept and no card.
- analysisChat.health.test.tsx (2): aiAvailable false → disabled input+send + named reason + zero stream calls; NO_TAB_STORE executor diagnostic surfaced verbatim.
- channelEnvelopes (5), textDraft.compat (5), tracesNoExecute (1), aiStreamTypes.pin (5) — all assert observable messages/events/call args, not import smoke. All green.

**C9 — scope discipline / YAML.** PASS.
- Diff touches no schema/**, lint/**, config/** YAML (forbidden-path diff EMPTY). No opportunistic refactor: the only production edits are the mandated extraction (AiTabPanel + new flow), the mount, the one consumer, the union members. AiDraftBar = 0 hits. (Untracked `schema/*.yaml` in `git status` are pre-existing symlinks into computable-lab, absent from the diff.)

**C10 — PdfProtocolBuilder consumer + aiClient.ts/AiPanelContext.tsx zero-diff.** PASS.
- PdfProtocolBuilder.tsx:125-133 composes the flow; card local render :945-959; surface stays `protocol-builder`/endpoint `literature` (aiContext unchanged); no other consumer file hunks.
- `aiClient.ts` and `AiPanelContext.tsx` → 0-line diff (cmd 9).

## Spec acceptance criteria (verbatim) and how checked

> "Red-first hook/SSE tests for both envelope variants + text/draft compatibility + missing-provider path + tool-traces-never-execute. Independent browser review on named surfaces (Analysis AI panel, run AiTabPanel regression, the scout-named consumer): proposal + accept flows repeat on the mounted path incl. pending-vs-accepted two-context sync. Screenshots: analysis-local-proposal.png, analysis-local-accepted.png, generic-<approved-surface-id>-action.png, generic-<approved-surface-id>-proposal.png, run-channel-regression.png."

- Red-first tests both envelope variants + text/draft compat + missing-provider + tool-traces-never-execute: **CHECKED** — useAiChat.channelEnvelopes (variant B), useAiChat.textDraft.compat (variant A), useAiChat.tracesNoExecute, analysisChat.health; all green. (RED-first capture is the coder's claim; my independent evidence is the green suites + tsc, cmd 2-3.)
- Independent browser review on named surfaces (Analysis AI panel, run AiTabPanel regression, consumer): **NOT CHECKED HERE** — orchestrator-owned `cl-browser-reviewer` gate; coder marks PENDING-BROWSER-GATE and touched no browser (confirmed: no browser artifacts in diff). My run AiTabPanel regression = 14/9/15 green (cmd 3).
- pending-vs-accepted two-context sync + screenshot set: **OUT OF THIS REVIEW'S SCOPE** — browser gate. Screenshot names remain as spec (OQ1 `<approved-surface-id>` = `literature`); no screenshot files exist in the diff.

## Observations (checked, non-defects)

- **Full-app run variance (not attributable).** My full run: Test Files 54 failed | 246 passed (300), Tests 64 failed | 2000 passed (2064). The coder's baseline and head2 artifacts both report 53 failed files. Set-diff of distinct FAIL-file lines (baseline artifact vs my run) yields exactly ONE extra: `src/graph/events/forms/AddMaterialForm.biological.test.tsx`, failure `AssertionError: expected 0 to be greater than 0` at `:115` (`onChange.mock.calls.length`). That file imports nothing touched by this diff (AddMaterialForm, types/events, shared/bioTypes), and it **passes in isolation** (2/2). It is a full-suite scheduling flake of the tolerated class, not a PB-CH-6 regression. All other failing-file lines are set-identical; the 5 unhandled errors are pre-existing (ClarificationPicker.tsx:215, RawRecordEditor `./taptab` mock) and untouched.
- **Pin grounding** (C3 note) — authority is assistStream.ts, per the spec's own matrix.
- **Report bookkeeping**: report item 6's `git diff HEAD --name-only` lists only the 9 modified tracked files and omits the 10 newly-added files (untracked at that command's moment); the forbidden-path diff itself is genuinely empty, and the committed diff's file set (19) is in scope.

## Verdict

VERDICT: accept

No defects found. All 10 contract checks pass with file:line evidence and real command output above. The one full-app extra failing file is an unrelated load flake that passes in isolation and imports nothing this diff touches; app tsc error file-set is identical to the pristine baseline (24 files, 34 lines); server tsc 26 lines with zero systemPrompt hits; the two concerned files (aiClient.ts, AiPanelContext.tsx) are zero-diff; no YAML/schema/config changed; the named consumer and the extraction are the sanctioned shapes. Browser gate (screenshots + two-context sync) remains orchestrator-owned and is not adjudicated here.
