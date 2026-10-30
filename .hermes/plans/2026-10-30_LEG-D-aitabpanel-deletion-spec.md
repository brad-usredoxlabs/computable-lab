# SPEC DRAFT — L2-CHAT-UI-1 LEG D: delete AiTabPanel (the legacy AI tab dies)

Status: DRAFT by cl-spec-composer run l2t1210-retry (token SPECCOMP-LEGD-RETRY-L2T1651), 2026-10-30.
Trunk verified first-hand at tip d18f1c13 (D0 merge 4b17d44c IN; latest merge 223a7910 = server/compiler-only, cannot move app/ mount censuses — re-verified this run).
Awaiting orchestrator ratification. NOT dispatch-grade until ratified.

## 0. Goal (one sentence)

Delete AiTabPanel (the legacy AI tab) and its test fleet, make RightPane's AI mode always HarnessChatPane, move the two clarification-prompt helpers ChatLog still imports onto neutral ground, carry the two leg-C minors (SurfaceChatBridge mirror + scope-pin coverage), and prove every task-named behavior family is alive on the universal pane first — with STOP-and-report on any family that is not.

## 1. Binding basis (read in full before editing anything)

1. `.hermes/plans/decisions/CHATUI1-legD-OQ2-chain-port-ruling-l2t0135.md` — §2 (protocol-edit needs NO port: routed ReviewAiPanel is its live home), §4 (the VERBATIM deletion note below), §5 (leg D re-branches off the post-D0 tip; a universal protocol-edit chat card is a SEPARATE future item — NEVER fold it in).
2. `.hermes/plans/2026-10-28_L2-CHAT-UI-1-chat-standard.md` §4 LEG D (the deletion + dead-CSS sweep definition, the behavior-preservation checklist, the first-check grep, bait list §8 incl. bait 8 'chatReducer dies with D' — NOTE: bait 8's premise check below, chatReducer SURVIVES because useChatThread survives) and §6/§7 (verbatim acceptance + environment facts).
3. `.hermes/plans/2026-10-30_LEG-D0-chain-card-port-spec.md` — D0 merged (4b17d44c, advc ACCEPT zero defects, browser gate ACCEPT per handoff l2t1130); its out-of-scope list is binding on leg D too.
4. Carried riders AS-L2T0915-LEGC-MINORS-DEFERRED (§5 of this spec) — verbatim from `~/.hermes/cl/lanes/2/reviews/L2-CHAT-UI-1-legC-advc-l2t0915.md` DEFECTS D1/D2.

### 1.1 THE VERBATIM DELETION NOTE (must appear character-for-character in BOTH the leg-D report AND the deletion commit message body — ruling §4):

  DELETION NOTE (OQ-2 ruling CHATUI1-legD-OQ2-chain-port-ruling-l2t0135): deleting
  AiTabPanel removes its private ChangesPanel protocolDiff arm (AiTabPanel.tsx:469-511,
  :1550-1553), which only rendered on the legacy chat-less RightPane fallback and served
  no routed behavior (leg C verified C1-C4 "have none today"). Protocol-edit review is
  NOT dropped: its live home is the routed ReviewAiPanel protocol mode
  (ReviewAiPanel.tsx:35/:226-242/:316-319 via ProtocolReviewHostPage.tsx:84) on the
  existing ChangesPanel diff (campaign decision D1); ChangesPanel.tsx/.css and
  protocolEditOps.ts survive byte-identical as ReviewAiPanel's dependencies. Chain-card
  behavior is NOT dropped either: it moved to the universal pane in LEG D0
  (useSurfaceChat onChainProposal + HarnessChatPane adapter branch), which merged before
  this deletion.

### 1.2 Claim gate (met at drafting time)

Legs A (merged), B (merged a99a5e3a), C (merged 302f602c, browser gate ACCEPT 4/4 surfaces), D0 (merged 4b17d44c, advc ACCEPT, browser gate ACCEPT per handoff 2026-10-30T12:10, receipts /home/brad/.hermes/cl/receipts/L2-CHATUI1-LEGD0/20261030T1130/) are all merged. Trunk tip verified this run: d18f1c13; `git -c core.fileMode=false log --oneline -3` shows 223a7910 (L2-LABSTATE-CONTENTS-1 fix3) as the latest merge — server/compiler-only, zero app/ files, cannot move the censuses below. Branch off the trunk tip AT DISPATCH (never a remembered sha).

## 2. Current-mounts census (verified first-hand this run at tip d18f1c13; matches recon dump l2t1651)

### 2.1 NON-TEST imports/mounts of AiTabPanel.tsx — EXACTLY TWO MOUNT SITES + ONE HELPER IMPORT (all resolved this leg)

| Site | What | Disposition |
|---|---|---|
| app/src/event-editor/right-pane/RightPane.tsx:27 | `import { AiTabPanel } from './ai/AiTabPanel'` | delete (fallback arm goes too) |
| app/src/event-editor/right-pane/RightPane.tsx:103 | `<AiTabPanel />` (fallback arm, the `panelSlot?.chat`-null branch; ChatContextHeader :102 beside it) | replaced by `<HarnessChatPane />` — HarnessChatPane is ALREADY imported at RightPane.tsx:26 |
| app/src/agent/ChatLog.tsx:18 | `import { clarificationAnswerPrompt } from '../event-editor/right-pane/ai/AiTabPanel'` | RE-POINT to the moved helper module (§3 step 1) BEFORE the deletion commit |

graph/RunWorkspacePage.tsx:67 is a COMMENT on a dead-routed page (App.tsx routes only run/RunWorkspacePage.tsx). AgentChatPane.tsx NO LONGER EXISTS (retired by leg B — verified `ls src/agent/` shows no AgentChatPane). Every other 'AiTabPanel' string in non-test src is a doc-comment/precedent cite (PdfProtocolBuilder.tsx:132, ReviewAiPanel.tsx:5/:20/:38, useAiChat.ts:249/:383-384/:487/:591/:602, useSurfaceChat.ts:11/:46, SurfaceChatBridge.tsx:12/:18, DeckSurfaceChat.tsx:5, useWorkstateProposalFlow.ts:3/:6/:17-19, SurfaceContext.ts:62, protocolStepSelection.ts:6, StepDetailPane.tsx:5, StepInvestigationPanel.tsx:102, RecordRegistryPage.tsx:316, ChatLog.css:161, useDeckGhostMount.ts:8/:34, ProtocolBuilderOrchestrator.tsx:27, AnalysisChatPanel.tsx:8/:14/:49, toSurfaceContext.ts:5) — prose provenance, NOT mounts; handling in §7 (the campaign's "ZERO hits" verify line needs a ratified relaxation).

### 2.2 Test files importing AiTabPanel (17) — what each PROVES + verdict (all die in the deletion commit UNLESS 'PORT' is named; EVERY dying file gets a one-line justification in the deletion commit body)

| Test file (import line) | Proves | Universal equivalent (verified cite) / verdict |
|---|---|---|
| AiTabPanel.test.tsx:59 | WarmIndicator pulses; clarification answer routing via the helper; panel composition; systemPromptForViewer | PORT the clarificationAnswerPrompt/clarificationAnswersPrompt unit tests into the new helper module's test (§3 step 1). WarmIndicator + composition + systemPromptForViewer DIE (tab-model chrome; the task explicitly rejects the tab strip; ReviewAiPanel.tsx:27 'no warm chip' precedent) |
| AiTabPanel.analysis.test.tsx:129 | analysis card via shared flow, adapter-only delta | AnalysisChatPanel.analysisProposal.test.tsx + shared/ai/useWorkstateProposalFlow.test.tsx -> die with cites |
| AiTabPanel.chain.test.tsx:160 | chain_proposal reaches compile seam + chain-turn honesty wall | LEG D0 landed it: agent/useSurfaceChat.ts:47 `onChainProposal` + HarnessChatPane.tsx:184 adapter branch; agent/useSurfaceChat.chain.test.tsx:155 renders ChainProposalCard on the universal pane; wall = HarnessChatPane.revisionLoop.test.tsx + useAiChat.wall.test.tsx -> die with cites |
| AiTabPanel.chatCorpus.test.tsx:106 | SHORTHAND-CORPUS WS1: chat Accept POSTs /intent/training-pair verbatim (AiTabPanel.tsx:1083 the only chat caller; client.ts:4251) | NO universal caller exists (grep: only other caller is protocol/ProtocolLocalizationThread.tsx:678, a different seam). STOP/OQ-1 (§4) — campaign §4 LEG D: "its assertions must land somewhere before deletion" |
| AiTabPanel.deadChrome.test.tsx:91 | SH-QA-2 dead-chrome host legs INSIDE AiTabPanel | anti-regression lock for a component that ceases to exist -> die |
| AiTabPanel.ghostRemount.test.tsx:92 | draft result REMOUNTS ghosts through the real onDraftResult seam | DeckSurfaceChat.ghost.test.tsx:321 + deck/useDeckGhostMount.ts:8 (same setPreview contract, AiTabPanel.tsx:608-669 port) -> die with cites |
| AiTabPanel.honestWall.test.tsx:117 | honest wall + the Ruling-3 DRIFT PIN (:528, client predicate ⊇ server 7-channel helper; dynamic-imports './draftEmptiness' :531) | wall ported (HarnessChatPane.tsx:158-165 "the universal port of AiTabPanel's ai-tab-honest-wall"; useAiChat.wall.test.tsx). PORT the DRIFT PIN into a surviving wall test (useAiChat.wall.test.tsx or a new wall-drift test beside draftEmptiness.ts) BEFORE deleting — it is Ruling-3 machinery, not AiTabPanel chrome |
| AiTabPanel.interpretingEscape.test.tsx:134 | revise-context hold never a stuck pane (D4: cards OR an escape, never happy-empty) | HarnessChatPane.revisionLoop.test.tsx is BUILT ON this pair (its header :3 cites AiTabPanel.honestWall + interpretingEscape) + ChatLog.tsx:309 interpreting-stop -> die with cite |
| AiTabPanel.ledgerTurn.test.tsx:141 | PB-CH-8: a ledger turn renders the answer in the chat pane | NO universal ledger path (grep 'ledger' over src/agent + src/shared/hooks = zero files). Ledger survives ONLY on legacy-engine surfaces that keep useChatThread (ReviewAiPanel). STOP/OQ-2 (§4) |
| AiTabPanel.protocolEdit.test.tsx:85 | protocol_edit Accept/Reject wiring in AiTabPanel | ruling §2: live home = routed ReviewAiPanel protocol mode (ReviewAiPanel.test.tsx:15 protocolDiff pin, ReviewAiPanel.tsx:35/:226-242/:316-319 via ProtocolReviewHostPage.tsx:84) -> die with the ruling cite |
| AiTabPanel.recordDraft.test.tsx:132 | record-draft card via shared flow (QMS7-7) | useWorkstateProposalFlow.test.tsx (recordFields/adapter discipline) + literature/pdfProtocolBuilder.card.test.tsx -> die with cites |
| AiTabPanel.recordDraft.retarget.test.tsx:132 | pending card vs workspace tab switch (silent-retarget pin) | if grep finds no universal equivalent (coder re-checks useSurfaceChat re-registration), retire with the one-line reason: 'the workspace-tab retarget cannot strand a universal card — card state rides the per-mount useSurfaceChat flow' |
| AiTabPanel.resolvedGhosts.test.tsx:102 | folded draft whose labware resolved to an EXISTING record mounts ghost placements (REVISE-GHOST-1 4C) | DeckSurfaceChat.ghost.test.tsx + ai/draftPreview.resolved.test.ts -> die with cites |
| AiTabPanel.runPageSurface.test.tsx:101 | run page registers chat with accept + ghost seams wired | run/RunWorkspacePage.surface.test.tsx IS the stated mirror (header: "The lock mirrors the legacy AiTabPanel.runPageSurface.test.tsx posture ... at HOOK level") -> die with cite |
| AiTabPanel.shorthandClarification.test.tsx:63 | shorthand renders on the clarification turn | ChatLog intent card ChatLog.tsx:268-274 + ChatLog.test.tsx:176 (chat-log-intent-card) -> die with cite |
| AiTabPanel.shorthandRecompile.test.tsx:107 | Edit+Recompile round-trip (SH-QB-1 T8/T9/T10; AiTabPanel.tsx:602 -> client '/intent/compile') | universal card is READ-ONLY per ratified OQ-3; the edit/recompile affordance RETIRES BY RULING (campaign OQ-3: edit-in-scroll = follow-up item). e2e fallout §3 step 7 |
| AiTabPanel.workstate.test.tsx:153 | tier-1 apply on arrival; tier-2 card gate; D1 no event-graph review for a workstate turn | useWorkstateProposalFlow.test.tsx:223 (executeTier1 narrowing) + :18 header pins the same flow contract -> die with cites |

### 2.3 Tests that MOCK the module path (6 vi.mock sites — delete the mock blocks in the same commit)

agent/HarnessChatPane.clarificationEnds.regatefix2.test.tsx:50, agent/ChatLog.bothfields.uifix1.test.tsx:42, agent/ChatLog.d3chrome.uifix3.test.tsx:78, event-editor/right-pane/RightPane.test.tsx:21, event-editor/deck/DeckSurfaceChat.ghost.test.tsx:139, event-editor/deck/DeckSurfaceChat.deckLayout.uifix1.test.tsx:106. These mocks exist ONLY because ChatLog's real import graph reached pdfjs-dist through AiTabPanel (their headers say so); after the helper move the graph is gone — drop each mock block (RightPane.test.tsx's `panel-ai` mock becomes `panel-harness` per §3 step 2) and keep each suite green UNCHANGED outside the mock block.

### 2.4 AiTabPanel-only helper/module census (grep first-hand at d18f1c13)

| Module | Non-test importers TODAY | Verdict |
|---|---|---|
| clarificationAnswerPrompt + clarificationAnswersPrompt (AiTabPanel.tsx:53-77) | ChatLog.tsx:18 (LIVE) | MOVE to app/src/shared/hooks/clarificationAnswerPrompt.ts FIRST (campaign bait 11: move before delete or build break); re-point ChatLog.tsx:18 |
| WarmIndicator (AiTabPanel.tsx:84, exported) | none outside AiTabPanel.test.tsx | dies with the file |
| useChatThread.ts | ReviewAiPanel.tsx:32, protocol/StepInvestigationPanel.tsx:23 | SURVIVES — do NOT delete (campaign leg D said 'delete if its only consumers were AiTabPanel + its tests — grep-verify at leg start'; the grep says NO). chatReducer.ts survives through it — campaign bait 8's 'chatReducer dies with AiTabPanel in D' premise is FALSE at this tip; record the deviation in the report |
| QuestionsPanel.tsx | AiTabPanel.tsx:34 only (VendorPdfReviewPage/BranchQuestionsPanel are DIFFERENT components — coder re-verify the module name before acting) | dies with AiTabPanel + QuestionsPanel.test.tsx, .deadChrome.test.tsx, .readingCard.test.tsx |
| InterpretationPanel.tsx | AiTabPanel.tsx:36 only (graph/run-workspace/RunResultsTab.tsx:9 imports ResultInterpretationPanel — DIFFERENT component; coder re-verify) | dies + InterpretationPanel.test.tsx |
| SourcesStrip.tsx / AddSourceModal.tsx / RunInEventEditorButton.tsx | AiTabPanel.tsx:31/:45/:40 only | PORT-MOUNT onto HarnessChatPane's header region (§4 sources-strip port) so they survive with a live mount. WARNING: the campaign's 'ReviewAiPanel imports SourcesStrip/RunInEventEditorButton (port precedent)' cite is STALE — ReviewAiPanel.tsx:27 says 'No SourcesStrip, no RunInEventEditorButton, no warm chip'. After this leg AiTabPanel is no longer the ONLY importer; do not re-cite the stale line |
| systemPromptForViewer.ts | AiTabPanel.tsx:30 + AiTabPanel.test.tsx:61 only | dies (tab-model plumbing; the universal pane sends AiContext/surface kind instead — server/src/ai/systemPrompt.ts:299-303 'analysis' declared surface) |
| draftEmptiness.ts | AiTabPanel.tsx:43 + honestWall.test.tsx:531 (dynamic) | SURVIVES — the universal wall counts it (useAiChat.ts:590-591). The drift-pin relocation (§2.2 honestWall row) keeps a test consumer alive. Coder: confirm at claim how useAiChat reaches the predicate (import path) before touching |
| toSurfaceContext.ts | AiTabPanel.tsx:27 + its own unit test only | follows OQ-3 (selection ruling): ported -> module survives as the port's helper; deferred -> module + toSurfaceContext.test.ts die with the panel (re-ported with the future chrome leg) |
| Survivors (byte-identical, NOT collateral-deleted — campaign §4 LEG D): MessageLog.tsx, ChatInput.tsx, ClarificationPicker.tsx (+ParameterAnswerInput), ChangesPanel.tsx/.css, ChainProposalCard.tsx, WorkstateProposalCard.tsx (+.css), sidebarState.ts, draftChanges.ts, draftPreview.ts, assistStream.ts, chatReducer.ts, aiThreadClient.ts | live non-test consumers: ReviewAiPanel.tsx:32-36, ChatLog.tsx:19 (ClarificationPicker), HarnessChatPane.tsx:18/:27-28, DeckSurfaceChat.tsx/useDeckGhostMount.ts (draftPreview), ProtocolIdeShell.tsx:55 + ClarificationPanel.tsx:44 (MessageLog mentionTokenForOption), StepInvestigationPanel.tsx:24 (ChatInput) | untouched |
| ai.css | imported ONLY by AiTabPanel.tsx:51 — BUT it defines classes survivors render: message-log__*, chat-input__* (ReviewAiPanel/StepInvestigationPanel render those DOM classes; reviewAiPanel.css + ChatLog.css cover only part — dump tools 66/69) | DO NOT delete wholesale. Dead-CSS sweep = per-selector zero-consumer grep receipt over src + e2e AFTER the code deletions (campaign bait 10). If a survivor-rendered class lives only in ai.css and ai.css has no importer for that survivor, the coder must keep the rule reachable (either the survivor keeps ai.css's rules via an importer that survives, or the rule moves) — evidence in the report, no silent loss |
| ChatContextHeader.tsx + .css | mount: RightPane.tsx:28/:102 only (AgentChatPane died in leg B); test users: agent/ChatFocusContext.test.tsx:75/:87, protocol/ProtocolNavPanel.actions.test.tsx:31 | dies once the arm is gone. Transplant ChatFocusContext.test.tsx's 'ChatContextHeader delegation' describes to SurfaceFocusHeader coverage (agent/SurfaceFocusHeader.tsx is the surviving header, testid surface-focus-header :18); drop the header from ProtocolNavPanel.actions.test.tsx's render. e2e fallout §3 step 7 |
| pdf-text-selection / protocol-step-selection listeners | the ONLY listeners are AiTabPanel.tsx:1290 + :1323 (first-hand grep); dispatchers live: ProjectWorkspacePage.tsx:330, protocolStepSelection.ts | mechanism dies with the file -> STOP/OQ-3 (§4) — leg C advc O-1 confirmed this and falsified the spec's 'C4 has none today' premise |

## 3. Deletion inventory + commit sequence (app/ ONLY; every path under /mnt/vast/home/brad/git/cl-integration-2/app/)

Order matters (campaign bait 11: helper move BEFORE deletion, same branch). RED-first: the moved-helper test + the drift-pin relocation + the RightPane always-harness pin go in FIRST as a RED commit.

Step 1 — MOVE helpers (commit A):
- CREATE src/shared/hooks/clarificationAnswerPrompt.ts — move `clarificationAnswerPrompt` (AiTabPanel.tsx:53-60) + `clarificationAnswersPrompt` (:63-77) VERBATIM (pure string builders, zero React deps — bodies verified first-hand: `Use ${value} for ${target}.`).
- CREATE src/shared/hooks/clarificationAnswerPrompt.test.ts — port the helper assertions out of AiTabPanel.test.tsx ('clarification answer routing' describe + the material-mention-token case).
- EDIT src/agent/ChatLog.tsx:18 — re-point the import.
Step 2 — RightPane always-harness (commit B):
- EDIT src/event-editor/right-pane/RightPane.tsx — delete :27 (AiTabPanel import), :28 (ChatContextHeader import), and the fallback arm rendering ChatContextHeader+AiTabPanel (:102-104 region): `active === 'ai'` renders `<HarnessChatPane />` unconditionally (panelSlot?.chat no longer gates which chat renders; HarnessChatPane's own no-registration empty state HarnessChatPane.tsx:136-146 is the honest fallback).
- EDIT src/event-editor/right-pane/RightPane.test.tsx — kill the `./ai/AiTabPanel` mock (:21-23); the provider-free tests now expect `panel-harness` (its :278 assertion pattern already fits).
- DELETE src/event-editor/right-pane/ai/ChatContextHeader.tsx + ChatContextHeader.css; transplant ChatFocusContext.test.tsx's 'ChatContextHeader delegation' describes onto SurfaceFocusHeader; drop ChatContextHeader from protocol/ProtocolNavPanel.actions.test.tsx:31's render.
Step 3 — the two riders (§5) (commit C): SurfaceChatBridge mirror fix + scope-pin assertions.
Step 4 — DELETE (commit D — carries the VERBATIM §1.1 deletion note + one-line justification per dying test):
- src/event-editor/right-pane/ai/AiTabPanel.tsx (1708 lines, verified `wc -l`)
- the 17 AiTabPanel.*.test.tsx files of §2.2 (after the §2.2 PORTs are in commit A/C)
- src/event-editor/right-pane/ai/QuestionsPanel.tsx + QuestionsPanel.test.tsx + QuestionsPanel.deadChrome.test.tsx + QuestionsPanel.readingCard.test.tsx
- src/event-editor/right-pane/ai/InterpretationPanel.tsx + InterpretationPanel.test.tsx
- src/event-editor/right-pane/ai/systemPromptForViewer.ts (dead once AiTabPanel.test.tsx dies — verify at claim)
- toSurfaceContext.ts + toSurfaceContext.test.ts ONLY per the OQ-3 ruling outcome (§4/§11)
Step 5 — chrome port onto HarnessChatPane (commit E; §4 sources-strip row): mount SourcesStrip + AddSourceModal + RunInEventEditorButton in HarnessChatPane's header region wired to chat.sendPrompt(prompt, attachments) (useAiChat.ts:270 FileAttachment[]); these three survive with the new live mount.
Step 6 — mock-block removal (§2.3, folds into commits A/B/E as each graph edge dies).
Step 7 — e2e fallout:
- e2e/term-panel-in-modal.spec.ts:12 waits `waitForSelector('[data-testid="ai-tab"]')` on /runs/... — ai-tab DOM is GONE; re-pin to harness-chat-pane + the run page's chat composer in the SAME commit (deviation D-2 §7: this file is in scope despite earlier legs being 'right-pane only' in flavor).
- e2e/w2-11-campaign-demo.spec.mjs:1745 `page.getByTestId('ai-tab')` D6 leg: it ALREADY has an honest fallback (:1752 '[D6 honest] ... API-paste leg stands'), so post-D it degrades honestly — update the comments (:44-45, :1726-1727) to name the universal entry point, keep the fallback leg. Do NOT re-point D6 to a recompile UI (Edit+Recompile retires by ruling — OQ-3).
- e2e/three-pane-harness.spec.ts:58-70 asserts `chat-context-header` visible on /runs — that testid belongs to ChatContextHeader (ChatContextHeader.tsx:27/:36); the run page renders SurfaceFocusHeader. Campaign leg D orders "CHECK three-pane-harness.spec.ts's chat-context-header count pin before cutting and update the spec in the SAME commit" — re-pin to surface-focus-header semantics in commit B/D with a report note. (:21 `agent-chat-pane` is leg B's carried O1 stale pin — LEG E scope; if it blocks, STOP-list it, do not silently fix beyond the re-pin above.)
Step 8 — dead-CSS sweep (commit F, LAST, so every grep receipt sees post-deletion DOM): per-selector over ai.css (166 selectors, dump tool 49): grep the class over src/ + e2e/ AFTER steps 1-7; delete only ZERO-consumer selectors, one grep receipt per deleted selector in the report. KEEP (survivor-consumed): .message-log__*, .chat-input__*, ClarificationPicker classes, .changes-panel__* (verify ChangesPanel.css ownership), the workstate/chain card classes (own css files). If a survivor-rendered class lives ONLY in ai.css while ai.css's only importer died, MOVE the rule into the consuming component's css (named in the report) rather than deleting it.

## 4. Generic-surface check (capability-by-capability)

Verdict key: REPLACED = live universal-pane cite; RETIRES = explicit ruling cites it as dying, no live routed behavior lost; GAP = neither -> STOP condition (§9), listed as an open question (§11), NEVER silently deleted.

| Capability AiTabPanel carried | Status | Cite |
|---|---|---|
| Shorthand clarification cards (intent shown on a clarification turn) | REPLACED | ChatLog.tsx:268-274 chat-log-intent-card (LEG A); ChatLog.test.tsx:176; compacted answered row ChatLog.css:127-158 |
| Protocol-edit ChangesPanel diff path (private protocolDiff arm AiTabPanel.tsx:469-511/:1550-1553) | RETIRES BY RULING — ReviewAiPanel survives UNTOUCHED | ruling §2 + §1.1 note; live home ReviewAiPanel.tsx:35/:226-242/:316-319 via ProtocolReviewHostPage.tsx:32/:84 (routed, App.tsx:162); ChangesPanel.tsx/.css + protocolEditOps.ts byte-identical |
| Chain card (ChainProposalCard) | REPLACED via LEG D0 | useSurfaceChat.ts:47 onChainProposal; HarnessChatPane.tsx:28 import + :184 adapter branch; pinned useSurfaceChat.chain.test.tsx:155; D0 browser gate ACCEPT receipts L2-CHATUI1-LEGD0/20261030T1130/ |
| Ghost remount / draft-result setPreview (onDraftResult :608-669) | REPLACED | deck/useDeckGhostMount.ts:8 (same contract); DeckSurfaceChat.ghost.test.tsx:321; universal run seam pinned run/RunWorkspacePage.surface.test.tsx |
| Reference card (Edit + Recompile, ChangesPanel.tsx:174-233 / handleShorthandRecompile :1055-1088) | RETIRES BY RULING (read-only card ratified) | campaign OQ-3 RULED read-only (task block :14964); editable card = follow-up item; the ChangesPanel COMPONENT survives (ruling §2) so the future item re-homes it |
| Attached-sources strip + AddSourceModal + RunInEventEditorButton (chrome AiTabPanel owned) | GAP UNLESS PORTED — campaign §4 LEG D makes the PORT this leg's job ("the PORT of that chrome onto HarnessChatPane is LEG D's job"; if orch judges it out of scope, "deletion DEFERS and this leg shrinks to a report-first STOP"). §3 step 5 specs the port; OQ-4 (§11) asks orch to ratify port-vs-defer BEFORE dispatch since it is the largest single judgment in the leg | port mount point HarnessChatPane header region; sendPrompt(prompt, FileAttachment[]) useAiChat.ts:270; C1-C4 never had them live (campaign §4 LEG C checklist) |
| Honest wall (reported failure, ai-tab-honest-wall :1437) | REPLACED | HarnessChatPane.tsx:158-165 "the universal port of AiTabPanel's ai-tab-honest-wall"; HarnessChatPane.revisionLoop.test.tsx; drift pin relocated (§2.2 honestWall row) |
| Interpreting escape / never-a-stuck-pane (D4) | REPLACED | HarnessChatPane.revisionLoop.test.tsx (header :3 builds on the two legacy files); ChatLog.tsx:309 interpreting-stop |
| Chain-turn honesty (card is the ONLY review surface on a chain turn) | REPLACED | D0's HarnessChatPane adapter branch renders exactly one card per flow.card state (HarnessChatPane.tsx:184-196); useSurfaceChat.chain.test.tsx D2 relay pins arrival |
| Workstate / analysis / record-draft cards | REPLACED | WorkstateProposalCard via HarnessChatPane.tsx:196; shared flow pinned useWorkstateProposalFlow.test.tsx (executeTier1 :223, recordFields, adapter delta); AnalysisChatPanel.analysisProposal.test.tsx |
| Run-page surface routing (PROTO-AI-9) | REPLACED | run/RunWorkspacePage.surface.test.tsx (explicit mirror); run/RunWorkspacePage.tsx:161 mounts HarnessChatPane as rightPane |
| Working-focus header (ChatContextHeader) | REPLACED | agent/SurfaceFocusHeader.tsx:18 (surviving header, published ChatFocusContext focus); e2e re-pin §3 step 7 |
| Ledger turns (PB-CH-8) | GAP | no universal ledger path exists (grep 'ledger' src/agent src/shared/hooks = 0); ledger lives only on legacy-engine ReviewAiPanel which keeps useChatThread. -> OQ-5 (§11) |
| Corpus capture on Accept (POST /intent/training-pair, :1083) | GAP | no universal accept-path caller (client.ts:4251 exists; chat caller only AiTabPanel.tsx:1083). Campaign names corpus assertions MUST land somewhere before deletion. -> OQ-6 (§11): port the corpus leg onto useWorkstateProposalFlow.acceptWorkstate vs name it a retired behavior family |
| PDF/step selection context (pdf-text-selection :1290, protocol-step-selection :1323 listeners) | GAP | only listeners die with the file; dispatchers stay live (ProjectWorkspacePage.tsx:330). leg C advc O-1 flagged C4 loses it. -> OQ-7 (§11): port to useSurfaceChat (small) vs defer with a named follow-up card |
| WarmIndicator / per-viewer system-prompt label / tab model / QuestionsPanel / InterpretationPanel | RETIRES | task description rejects the tab strip ("ONE single scrolling panel — NO tab strip", task block :14986); ReviewAiPanel.tsx:27 'no warm chip' precedent; universal pane's AiContext surface kind (systemPrompt.ts:299-303) replaces the per-viewer label |

## 5. Carried riders (AS-L2T0915-LEGC-MINORS-DEFERRED) — EXPLICIT IN-SCOPE REQUIREMENTS

Assumption record (lane assumptions.md:5932): "LEG C advc accept carried 2 MINORs ... folded as fix candidates into LEG D0 (scope-pin) and LEG D (mirror removal/align + comment)." The D0 dispatch did NOT carry the scope-pin rider (task-list :14954-14955: "advc-D2 scope-pin rider NOT attached ... carried to LEG D"), so BOTH land here (commit C). Verbatim texts from ~/.hermes/cl/lanes/2/reviews/L2-CHAT-UI-1-legC-advc-l2t0915.md DEFECTS:

- D1 — MINOR — app/src/shared/shell/SurfaceChatBridge.tsx:40 (and header :25-28): "The 'client-side mirror of the server's THREAD_SEGMENT_PATTERN' is not a mirror: it omits the server's DOTS_ONLY_SEGMENT_PATTERN refusal (AiThreadStore.ts:394-410), so '.' / '..' pass the client guard; and the header's 'would 400 the thread fetch and fail every turn' is no longer true (AiThreadHandlers.ts:71 maps malformed scope to undefined = fresh '_'). ... fix direction: delete the redundant mirror or align it with isValidThreadSegment, and re-word the 400 sentence."
  LEG D REQUIREMENT: align the guard (prefer: keep a guard, mirror dots-only refusal correctly — server truth AiThreadStore.ts isValidThreadSegment = THREAD_SEGMENT_PATTERN + !DOTS_ONLY, server/src/api/handlers/AiThreadHandlers.ts:71 maps malformed -> undefined, never 4xx) and re-word the header. Pin: a unit assertion that '.'/'..' are refused client-side too.
- D2 — MINOR — the four new pin files (e.g. app/src/shared/shell/ArtifactHostPage.surfaceChat.test.tsx:110-121): "No pin asserts endpoint 'browser' or the scope prop, so a regression that silently drops scoping (cross-record thread bleed) stays green. ... fix direction: assert the registrar's scope/endpoint (e.g. via the useSurfaceChat mock arguments) in at least one pin per surface."
  LEG D REQUIREMENT: scope/endpoint assertions in all four surfaceChat pin files (registry — no scope, record — recordId edit-mode, artifact — artifactId, project — studyId; commit subjects said 'X-scoped thread', pins must say so).

## 6. Tests & baselines

FIRST TARGETED CHECK (run this EARLY, before any edit — the single command that proves the approach):
  cd /mnt/vast/home/brad/git/cl-integration-2/app && grep -rn "from '.*AiTabPanel'" src --include=*.ts --include=*.tsx | grep -v '\.test\.'
  Expected at branch base (d18f1c13+): EXACTLY the two lines of §2.1 (ChatLog.tsx:18, RightPane.tsx:27). If a third non-test importer appears, STOP (§9).

Suites that must stay green UNCHANGED (byte-stable assertions; do not touch their assertions):
- src/agent/ChatLog.test.tsx + ChatLog.bothfields.uifix1.test.tsx + ChatLog.d3chrome.uifix3.test.tsx (mock block removal ONLY per §2.3; every assertion byte-identical — campaign bait 6: the uifix1 F1 single-arm compaction rule must stay red-proof)
- src/agent/HarnessChatPane.test.tsx, HarnessChatPane.clarificationEnds.regatefix2.test.tsx, HarnessChatPane.revisionLoop.test.tsx (mock block :50 removal only)
- src/agent/useSurfaceChat.chain.test.tsx (the D0 pin — untouched)
- src/event-editor/deck/DeckSurfaceChat.ghost.test.tsx + deckLayout.uifix1.test.tsx (mock block removal only)
- src/shared/ai/useWorkstateProposalFlow.test.tsx + .chain.test.tsx (untouched)
- the four *surfaceChat.test.tsx pins (they gain D2-rider assertions — the pane/composer assertions stay byte-identical)
- shared/hooks/useAiChat.wall*.test.tsx, hydration tests (untouched)
- aiStreamTypes.pin.test.ts (SOURCE-REGEX pin — do not add union members; campaign bait 9)

Re-pin set (assertions legitimately change, each with a report line): RightPane.test.tsx (panel-ai -> panel-harness), ChatFocusContext.test.tsx (ChatContextHeader delegation describes -> SurfaceFocusHeader), ProtocolNavPanel.actions.test.tsx:31 render, the e2e trio of §3 step 7.

Baselines (measure FRESH on the fresh branch; record both in the report's baseline section BEFORE editing):
- tsc: `cd app && npx tsc --noEmit | grep -c 'error TS'` — trunk measurement 2026-10-30 (recon tool 54, tree at 4b17d44c): 20 error lines. Campaign §7: baseline '20' (AS-L2T0310-TSC-BASELINE-20). RULE: re-measure at base; ZERO new errors at head; error SET must not change identity beyond deletions of files being deleted (compare sorted diff, not just count).
- vitest app suite: trunk baseline at probe window (recon tool 75, cwd=app full suite): ~23 failing FILES is trunk's pre-existing set (incl. ParameterAnswerInput, useChatThread.deckLayout, FindTabPanel.*, ClarificationPanel, SurfaceIndicator ...). RULE: zero NEW failing files at head; failing-file SET at head ⊆ failing-file SET at base, MINUS the deleted files. Targeted gate: `cd app && npx vitest run src/agent src/event-editor/right-pane src/shared/ai src/shared/shell` — probe window showed 5 failed | 123 passed (128 files), 8 failed | 864 passed (872 tests); after deletion the file count drops (deleted files leave the denominator) — every SURVIVING file passes except base-failing files ClarificationPanel.test.tsx + SurfaceIndicator.test.tsx (ParameterAnswerInput/FindTabPanel/useChatThread.deckLayout also base-red in the wider run).
- Playwright (live stack :5193, do NOT restart the stack — ZERO YAML, no server edits): the §3-step-7 trio green AFTER their re-pins.

## 7. Deviations from the campaign spec text (state these in the report; ratify via OQ list)

D-1: campaign leg-D verify says `grep -rn "AiTabPanel" src e2e/ | grep -v "\.md" -> ZERO hits`. That is unsatisfiable without rewriting ~30 doc-comment provenance cites in SURVIVING files (§2.1 list) and the D0 spec's own cites. Ratified reading requested (OQ-8): the gate is ZERO IMPORT/MOUNT hits (`grep "from '.*AiTabPanel'"` clean) + zero `vi.mock('...AiTabPanel')` + zero `<AiTabPanel` JSX; historical doc-comments MAY name the dead file (they are provenance records; ai.css:161 / ChatLog.css comments included).
D-2: e2e/term-panel-in-modal.spec.ts joins scope (§3 step 7) — unavoidable, it waits on ai-tab DOM.
D-3: useChatThread.ts + chatReducer.ts SURVIVE (§2.4) — the campaign's conditional delete and bait 8's 'dies with D' are overridden by the live-importer grep.

## 8. VERIFIED-BY

ACCEPTANCE CRITERIA (VERBATIM from the task block's 'verified by', in force for this leg's surfaces as carried by campaign §6):
"Vitest on ChatLog/HarnessChatPane: (1) a compiled-intent turn renders the intent
card with its document body (assert testid + content); (2) user vs assistant turns
carry distinct alignment/bg classes; (3) answered clarification renders the compact
response row and the bulky picker is GONE from the DOM; unanswered keeps the picker.
Browser receipt (:5193, tier-1): Brad's three-sentence corpus flow — user bubbles
right, AI left, the shorthand card visibly marked off before accept, one
clarification answered and compacted. Styling acceptance is VISUAL: reviewer
screenshots judged (dark theme, no raw unstyled text blocks, no overlapping
pickers — the material-picker finding repro-checks here)."
Plus the universal_scope binding in force: "AiTabPanel is NOT deleted until EVERY leg is merged and green" (MET — §1.2) and "a leg that drops a behavior (e.g. SourcesStrip in literature) is a defect, not a scope cut" (the §4 GAP-row discipline exists exactly to honor this).

1. Unit gates: first check (§6) clean at head; targeted vitest (§6) green per the baseline rule; `npx tsc --noEmit` zero-new vs fresh base measurement; RED-first evidence in report (moved-helper test + drift-pin relocation + always-harness RightPane pin fail at base, pass at head).
2. BROWSER GATE (:5193, tier-1 cl-browser-reviewer) after merge, per rule 6b — on the DECK (DeckHostPage -> DeckSurfaceChat) plus one non-deck surface (registry, the leg-C precedent host /registry) proving the surfaces still work POST-deletion: deck: harness-chat-pane renders, a shorthand intent card marks off, ghost mount still mounts (deck-ghost-shorthand stub builders), zero `ai-tab` DOM (assert absence); registry: AI tab shows HarnessChatPane composer ENABLED (not the :136-146 empty state), type a prompt, assistant bubble, D2-rider scope visible; on any RightPane-bearing host that lost the fallback the pane must show the honest empty state, NEVER a crash (provider-free posture is test-pinned).
   Receipts: /home/brad/.hermes/cl/receipts/L2-CHATUI1-LEGD/<tag>/ (report.md + trail.json + shots + criteria; same convention as L2-CHATUI1-LEGD0/20261030T1130/).
3. Adversarial review (advc) ACCEPT before merge; report ends 'STATUS: complete' + marker `L2CHATUI1-LEGD DONE <40-char sha>`.

## 9. STOP boundaries (any of these -> stop, report, do NOT improvise)

- A third non-test importer/mount of AiTabPanel.tsx at claim time (§6 first check).
- Any §4 GAP row the orchestrator has NOT ruled by dispatch time (corpus OQ-6, ledger OQ-5, selection OQ-7, chrome OQ-4): the deletion commit does not go in until each GAP row carries an orch ruling (port here / retire by named follow-up). NEVER port behavior 'just in case' (ruling §5), NEVER silently delete a GAP.
- A universal protocol-edit chat card appearing in the diff = ruling §5 violation (SEPARATE future item, new campaign task).
- Any YAML / server / config change in the diff (immediate STOP — campaign §5.2).
- tsc NEW errors or a NEW failing test file beyond base sets.
- three-pane-harness.spec.ts :21 agent-chat-pane blocking and unfixable inside the §3 step 7 scope -> STOP-list, do not expand into LEG E's carried O1.
- No opportunistic refactors: no ai.css rewrites, no useChatThread/chatReducer/MessageLog/ChatInput touch, no ChatLog render changes beyond the import re-point.

## 10. Reviewer bait (what the advc will probe; the coder pre-empts each with evidence in the report)

1. exactOptionalPropertyTypes: the helper MOVE is byte-identical string builders — any signature change (e.g. widening to `| undefined`) is a defect; if the chrome port adds props, they ride conditional spreads, never `prop: undefined` (the lane's EOPT discipline, leg C advc CHECK 6).
2. YAML-reload trap: ZERO YAML — any YAML hunk is out-of-scope drift (STOP).
3. Ontology terms: none required (no claim/context/evidence work; canonical-example doc not binding).
4. Hardcode boundary: the SurfaceChatBridge rider must NOT grow a per-surface branch (align the single guard); the HarnessChatPane chrome port adds NO surface-name switch (D0 grammar: switch on constants only).
5. Deletion-commit-body completeness: the VERBATIM §1.1 note present character-for-character (advc will diff it against the ruling) + one line per deleted test file (§2.2 verdicts). Missing note = FAIL like leg D0's own gate text demands.
6. The pdfjs mocks (§2.3) — deleting the helper import while KEEPING the mocks is fine short-term but the reviewer will ask why ChatLog tests mock a dead path: remove them and show the suites still green.
7. ai.css sweep over-reach (bait 10): every deleted selector needs a zero-consumer grep receipt; the .message-log__/.chat-input__ survivors are the trap — ai.css's only IMPORTER dies, so prove HOW each survivor still gets its rules (or moved them; receipt).
8. Drift-pin orphan (bait: honestWall.tsx:528 Ruling-3 pin): deleting it silently drops the ⊇ server-channel guard — the relocation cite in the report is mandatory.
9. chatReducer 'do not touch' still applies even though it no longer 'dies with D' (D-3).
10. WarmIndicator export removal: grep src for WarmIndicator consumers outside ai/ before deleting AiWarmStatus touchpoints — client.ts types the status; the TYPE survives, the component dies.

## 11. Open questions for orch (composer could not resolve locally)

OQ-4 (chrome port, GAP row 1): ratify SourcesStrip/AddSourceModal/RunInEventEditorButton PORT (§3 step 5) vs the campaign's own fallback 'deletion DEFERS and this leg shrinks to a report-first STOP'. Checked: the campaign text assigns the port to leg D; ReviewAiPanel precedent cite is stale (§2.4). Recommendation: port (commit E) — it is ~1 header region + 3 components, keeps bait-10 CSS consumers alive, and browser-gates attach-flow on one surface.
OQ-6 (corpus, GAP row 2): port the Accept corpus leg onto useWorkstateProposalFlow.acceptWorkstate (~15 lines, fire-and-forget, mirrors AiTabPanel.tsx:1083 + the chatCorpus assertions) vs declare /intent/training-pair chat-capture a retired family with a follow-up card. Checked: client.ts:4251 seam is generic; ProtocolLocalizationThread.tsx:678 shows the pattern on another surface. The campaign line 'its assertions must land somewhere before deletion' forbids silent loss — one ruling or the other, by dispatch.
OQ-5 (ledger, GAP row 3): universal ledger rendering does not exist anywhere (useAiChat has no ledger arm; grep 0 hits src/agent + src/shared/hooks). Ledger turns only answer on ReviewAiPanel/legacy-engine surfaces. Rule: retire PB-CH-8-on-universal (it never existed universal — arguably NOT a loss at all, which is why this can be a named follow-up card, not a port).
OQ-7 (selection context, GAP row 4): the pdf-text-selection / protocol-step-selection -> SurfaceContext bridge had its sole listener in AiTabPanel. Port now (toSurfaceContext.ts + a useSurfaceChat listener, small) vs named follow-up (leg C advc O-1 pre-cleared deferral to 'LEG D ports the chrome' — that sentence points here). Needs the same ruling style as OQ-4.
OQ-8: ratify deviation D-1 (zero-IMPORT gate vs campaign's literal zero-any-hit grep).

## 12. Ownership / scope / worker contract

- ONE coder, ONE branch. Trunk: /mnt/vast/home/brad/git/cl-integration-2, branch cl/integration-2. ALL git commands as `git -c core.fileMode=false ...` (NFS mode-bit trap, campaign §7).
- Worktree: /mnt/vast/home/brad/git/wt/CHATUI1-LEGD-lane2-l2t<tick> (orch sets tick at dispatch), branch cl/lane2-chat-ui-1-legD-l2t<tick> off the trunk tip AT CLAIM (must contain 4b17d44c D0 merge + d18f1c13; branch off the tip, never a remembered sha).
- OWNED files (app/ ONLY — the complete diff surface): src/shared/hooks/clarificationAnswerPrompt.ts + .test.ts (new); src/agent/ChatLog.tsx (import line ONLY); src/event-editor/right-pane/RightPane.tsx + RightPane.test.tsx; src/shared/shell/SurfaceChatBridge.tsx + the four *surfaceChat.test.tsx pins (riders); src/agent/HarnessChatPane.tsx (+ HarnessChatPane.css if the chrome port needs a class) and its test mock blocks; the §2.3 mock-block files; ALL §3 step 4 deletions (right-pane/ai/*); the three e2e files of §3 step 7; ai.css selectors. EVERYTHING ELSE IS OUT OF SCOPE: server/, ALL YAML, useAiChat.ts, useSurfaceChat.ts, useWorkstateProposalFlow.ts, useChatThread.ts, chatReducer.ts, MessageLog/ChatInput/ClarificationPicker/ChangesPanel/ChainProposalCard/WorkstateProposalCard (byte-identical), ReviewAiPanel + ingestion/*, deck/* (mock block excepted), analysis/*, run/*.
- Deliverable/report (unique, write BEFORE any edit, baseline section first): /home/brad/.hermes/cl/lanes/2/deliverables/L2-CHAT-UI-1-report.legD-l2t<tick>.md — per-work-item diffs with file:line, RED evidence, RAW baseline-vs-head tsc + vitest counts, per-deleted-test one-liners, the VERBATIM §1.1 note quoted, dead-CSS grep receipts, deviations D-1..D-3 + resolved OQ rulings. End 'STATUS: complete' then exactly: `L2CHATUI1-LEGD DONE <full 40-char sha>`. Commit EARLY and OFTEN (engine-pressure survival).
- Browser-gate receipts (orch dispatches tier-1 post-merge): /home/brad/.hermes/cl/receipts/L2-CHATUI1-LEGD/<tag>/.
- Do not touch the task list, do not merge, do not dispatch.

Spec-composer notes: scout dump used as screening; every load-bearing cite above re-verified first-hand this run (mounts, test imports, listeners, D0 wiring, ReviewAiPanel imports, useChatThread importers, corpus callers, ChatLog card lines, three-pane pins, e2e ai-tab sites, AiTabPanel.tsx:53-77 bodies, wc -l). The dump's scout-census (tool 55) 'NO-EQUIVALENT' answers were re-derived individually in §2.2 rather than copied.

END-DRAFT

## 13. ORCH RATIFICATION (2026-10-30T18:40 EDT, l2t1830) — dispatch-grade

Draft spot-checked first-hand by orch at trunk d18f1c13 before ratifying: the two non-test
importers (ChatLog.tsx:18, RightPane.tsx:27) are EXACTLY the §2.1 census; helper bodies
:53-77 verbatim as claimed; RightPane fallback arm :95-104 as described; AiTabPanel.tsx
1708 lines; zero 'ledger' files under src/agent + src/shared/hooks; the ONLY chat caller of
/intent/training-pair is AiTabPanel.tsx:1053 ff; the sole pdf/step/surface-request listeners
are AiTabPanel.tsx:1290/:1323/:1338 with live dispatchers (protocolStepSelection.ts,
ProjectWorkspacePage.tsx:330). Rider texts match the legC advc report. Dump-derived tokens
(AS-L2T1651-DUMP-TOKENS-DEBT / ED-LEGD-DUMP-TOKENS) SPOT-CHECKED AND CLEARED this ratification.

RULINGS (binding for this leg; deviations beyond them = STOP):
- OQ-4 CHROME PORT: PORT (spec §3 step 5 as written). Campaign text assigns it to leg D;
  the browser gate proves attach-flow on registry.
- OQ-6 CORPUS CAPTURE: RETIRE THE FAMILY with a named follow-up. No universal accept path
  carries corpus capture, and the spec's owned-file list HARD-BANS useWorkstateProposalFlow.ts
  — porting there is out of D's owned surface. The behavior loss must be stated verbatim in
  the report's deviations (the /intent/training-pair chat-caller dies; server seam +
  ProtocolLocalizationThread caller survive). Follow-up card is orch-owned post-merge;
  the coder does NOT create tasks.
- OQ-5 LEDGER: RETIRE with a named follow-up (never existed universal — a named gap,
  not a loss). State it in the report.
- OQ-7 SELECTION CONTEXT: DEFER with a named follow-up. Porting requires sendSurfaceContext
  wiring that lives in useAiChat.ts/useSurfaceChat.ts — both HARD-BANNED in this leg's
  owned list. The dispatchers stay live and inert (window CustomEvents with no listener);
  the report must name the three deferred seams (pdf-text-selection, protocol-step-selection,
  surface-ai-request) as behavior retired-pending-follow-up. Do NOT port, do NOT delete
  the dispatchers.
- OQ-8 GREP GATE: RATIFIED as D-1 (zero IMPORT/MOUNT/vi.mock/JSX hits; historical
  doc-comments may name the dead file).
- Retired GAP families (OQ-5/6/7) are the ONLY permitted behavior losses; anything else
  in §4 marked GAP that is not one of these three = STOP.
