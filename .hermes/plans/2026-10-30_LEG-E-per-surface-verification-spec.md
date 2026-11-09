# SPEC DRAFT — L2-CHAT-UI-1 LEG E: per-surface verification of the chat standard (e2e specs + test ports ONLY)

Status: DRAFT by cl-spec-composer run l2t1415 (token SPECCOMP-LEGE-L2T1415), 2026-10-30.
Awaiting orchestrator ratification. NOT dispatch-grade until ratified.
Trunk verified first-hand at d18f1c13 (cl/integration-2 @ /mnt/vast/home/brad/git/cl-integration-2; LEG D0 merged 4b17d44c, D0 browser-gate accepted; LABSTATE fix3 merged 223a7910 is server/compiler-only — `git -c core.fileMode=false diff --stat 4b17d44c..d18f1c13 -- app/src` EMPTY, so the app censuses below hold at tip). :5193/:3093 both 200 at compose time; served tree app-equivalent to tip.

## 0. Goal (one sentence)

Prove, per surface family already on HarnessChatPane (deck / run / sequences / event-editor family / LEG C hosts), that the universal chat standard renders and behaves in-browser — directional bubbles, intent card before accept, clarification compaction, honest wall, per-surface behaviors — and repair the carried stale e2e pins (O1) so the whole named pin suite runs green, WITHOUT porting any product behavior.

## 1. Binding basis (read in full before editing anything)

1. Campaign spec `.hermes/plans/2026-10-28_L2-CHAT-UI-1-chat-standard.md` §4 LEG E (lines 83-86) + §5 serialization + §7 environment facts + §11 ratification. LEG E owns "e2e specs + test ports only (no product code unless a defect surfaces -> separate fix commit on this branch)" (campaign :84).
2. Ruling `.hermes/plans/decisions/CHATUI1-legD-OQ2-chain-port-ruling-l2t0135.md` §2 (protocol-edit review's live home is the routed ReviewAiPanel, NOT the universal pane), §4 (deletion note), §5 (lines 102-107): "A universal protocol-edit chat card (every pane) remains a SEPARATE future item". Consequence binding on E: **E reports protocol-edit/chain status per surface and NEVER builds new cards or ports AiTabPanel behavior** (that dies with LEG D per ruling §3/§4).
3. Claim order (handoff 2026-10-30_1355 §NEXT TICK 2-3 + 2026-10-30_0130 §1-3): LEG D's spec is in composition concurrently by a DIFFERENT composer run (`.hermes/plans/2026-10-30_LEG-D-aitabpanel-deletion-spec.DRAFT.l2t1210.md` exists; D's coder claims the freed slot). **E branches off the POST-D tip and E's claim is AFTER LEG D merges.** E must not duplicate D's work: campaign §4 leg D (line 76) already assigns D the duty "CHECK three-pane-harness.spec.ts's chat-context-header count pin before cutting and update the spec in the SAME commit." If D lands the three-pane re-pin, E VERIFY-AND-RECORDS it; if D leaves it, E owns it (E's scope statement names the file either way). E does NOT re-open anything D re-pinned.
4. Evidence debt (assumptions.md:5906-5911, handoff 2026-10-30_0130 §1): AS-L2T0052-O1-THREEPANE-E2E-PIN / **ED-L2T0052-O1-E2E-PIN: "LEG E must show the spec green after re-point (receipt in its gate)"** — clearing ED-L2T0052-O1-E2E-PIN is E's acceptance condition.

## 2. Surface-family census at tip d18f1c13 (first-hand grep of HarnessChatPane mounts, non-test)

HarnessChatPane mounts (grep `HarnessChatPane` src, non-test):
1. SEQUENCES — app/src/sequences/SequencesPage.tsx:150 — rightPane, WITH `onReviewProposal={onSequenceProposal}` (the Review-action seam). Route /sequences (App.tsx:218).
2. RUN — app/src/run/RunWorkspacePage.tsx:161 — rightPane, registrar = RunSurfaceChatBridge mounted at :158 (RunSurfaceChatBridge.tsx:36, wires onAcceptEvent + ghost mount + adoption seam). Route /runs/:runId (App.tsx:202).
3. DECK — app/shared/shell/DeckHostPage.tsx: DeckSurfaceChat mounted :139 (endpoint 'event-editor', DeckSurfaceChat.tsx:166-167; publishes chat focus via useSetChatFocus DeckSurfaceChat.tsx:207-216; ChatFocusProvider wrap :138) + RightPane :148. RightPane's positive arm `panelSlot?.chat ? <HarnessChatPane />` (RightPane.tsx:95-96) serves the pane. Route /deck/:eventGraphId (App.tsx:212).
4. EVENT-EDITOR FAMILY — the legacy routes /event-editor*, /runs/:runId/event-editor are a REDIRECT SHIM now: EventEditorPage.tsx:2-13 redirects to `/project/:studyId[/event-graph/:id]`. The live event-editor surfaces are therefore ProjectWorkspacePage (ProjectWorkspacePage.tsx:45 imports SurfaceChatBridge, RightPane at :244) + the deck host. E treats "event-editor" as: ProjectWorkspacePage event-graph tabs + /deck/:eventGraphId.
5. LEG C SURFACES (gained HarnessChatPane during leg C, merge 302f602c) — RegistryHostPage.tsx:51, RecordHostPage.tsx:53, ArtifactHostPage.tsx:49, ProjectWorkspacePage (SurfaceChatBridge at :45): all register via app/src/shared/shell/SurfaceChatBridge.tsx (renders NOTHING; RightPane's positive arm shows the pane — SurfaceChatBridge.tsx:8-12 header). Leg C browser gate receipts already on disk: /home/brad/.hermes/cl/receipts/L2-CHAT-UI-1/20261030T0915-legC/{C1-registry,C2-record,C3-artifact,C3b-artifact-valid,C4-project}. E's job for C-surfaces is the STANDARD GRAMMAR (bubbles/card/compaction pins), not re-proving the mount.

Pane internals the pins hang off (HarnessChatPane.tsx): SurfaceFocusHeader :151/:139 (renders nothing without a published focus — SurfaceFocusHeader.tsx:18), thread-picker :86, honest-wall `data-testid="honest-wall" role="alert"` :163-167, ChatPreviewCard :170 (`chat-preview` testids ChatPreviewCard.tsx:112-188), adapter branch chain-vs-workstate :184-201 (LEG D0 — the chain card HAS a universal home; protocol-edit card does NOT and must not get one), ChatLog :204-213.
ChatLog grammar testids (post leg A): bubbles `chat-log-msg chat-log-msg--user/--system/--assistant` (ChatLog.tsx:249-252), intent card `chat-log-intent-card` + `chat-log-intent-card-body` :272-274, compaction `chat-log-clarification-answered` :293, log role=log name=Conversation :240, composer = textarea labelled 'Message' :307 (NO chat-input testid on the universal pane — ChatInput.tsx:159 `chat-input` is AiTabPanel-side and dies with D).

NOT on HarnessChatPane (out of E's surface set): ReviewAiPanel (routed /ingestion/vendor-pdf/:recordId protocol-review surface — the ruled protocol-edit home, ruling §2), ChatPage (/chat), bespoke logs (AnalysisChatPanel etc., campaign §10 tail).

## 3. Named e2e spec inventory — status MEASURED at tip (composer, 2026-10-30, PLAYWRIGHT_BASE_URL=http://localhost:5193, --project=chromium)

Config trap FIRST: app/playwright.config.ts:11 baseURL defaults to **http://localhost:5174**. Every E command MUST export `PLAYWRIGHT_BASE_URL=http://localhost:5193` or it false-reds on a dead port.

A. e2e/three-pane-harness.spec.ts (run surface, 83 lines) — EXISTS. **RED: 2 failed / 3 passed (deterministic, reproduced twice by the composer at tip).**
   - Pin 1, line :21 `[data-testid="agent-chat-pane"]` — the O1 stale pin. AgentChatPane was deleted in leg B (bc6f476a, merge a99a5e3a); the assumption ledger (assumptions.md:5907) records the mount as gone since d1acccdc (10-18). **E's one-line repair: :21 -> `[data-testid="harness-chat-pane"]`** (live testid, HarnessChatPane.tsx:150). This is the O1 repair named in the leg B handoff note (2026-10-30_0130 §1: "LEG E re-points it").
   - Pin 2, lines :55-71 (fails at :58 `[data-testid="chat-context-header"]`). FRESH FINDING (composer-measured; NOT in the assumptions ledger): the run page's permanent ChatContextHeader vanished when the run surface moved onto HarnessChatPane — ChatContextHeader is mounted ONLY inside RightPane's legacy fallback arm (RightPane.tsx:102) and the AiTabPanel tree; the run page mounts `<HarnessChatPane />` directly (RunWorkspacePage.tsx:161) and RunWorkspacePage/RunSurfaceChatBridge publish NO ChatFocus (grep: zero ChatFocus hits in src/run non-test), so SurfaceFocusHeader renders null (SurfaceFocusHeader.tsx:18). **Disposition = orchestrator call, E presents both honest options:**
     (E-α, recommended, within E's defect clause) a SEPARATE fix commit on E's branch — publish the run working-focus exactly as the deck does: wrap the run pane subtree in ChatFocusProvider and `useSetChatFocus` from the resolved focused step (deck precedent DeckSurfaceChat.tsx:207-216; focused-step truth already resolves on the run page via ProtocolSelectionContext, which ChatContextHeader itself reads, ChatContextHeader.tsx:22-23), then re-pin :55-71 from `chat-context-header` to `surface-focus-header`. This ALSO defuses leg D's landmine (D deletes ChatContextHeader; any surviving chat-context-header site goes red at D — E's receipt list must grep `chat-context-header` over src+e2e after the fix and land ZERO e2e sites).
     (E-β, pure test-port) delete/re-scope the header leg and file the run working-focus header as a REPORTED GAP per ruling §5's spirit (no universal home at E-time for that AiTabPanel-side behavior). Downside: silently ratifies a behavior the run surface had; the ledger's "re-points it" wording covers :21 only.
     The spec RECOMMENDS E-α and requires the orchestrator to strike one option at ratification.
B. e2e/sequences-harness-chat.spec.ts (311 lines) — EXISTS. **RED leg :162 "agent_action frames drive the tab, the selection, and refuse honestly" — fails deterministically at :288 `expect(page.getByRole('alert')).toHaveCount(0)` (1 failed / 3 passed for the 3 sequences specs run together; 14 retries resolved 1 alert — not a flake).** Fresh composer finding (not in ledger): the alert is the honest-wall firing on the stub's empty done frame — snapshot text "Draft produced no events and asked no questions. Nothing was proposed and nothing was applied." The honest wall (HarnessChatPane.tsx:163-167, role=alert per L2-CHAT-1 FIX1 D5, landed edef0b5b 10-26) POST-DATES the spec (last touched 6527f815, 10-15). E's repair: keep every other assertion byte-unchanged; re-pin :288 to the ratified behavior — expect EXACTLY the honest-wall alert and assert its copy (e.g. `await expect(page.getByTestId('honest-wall')).toBeVisible()` plus the refusal-line assertion that already follows), NOT a weakened `getByRole('alert')` deletion. RED-first, then green; this pin repair is E's scope (e2e file), no product change.
   Byte-stable green pins that stay UNTOUCHED (the campaign's "pin suite", line 84): :91 harness-chat-pane, :99/:258 surface-focus-header, role=log Conversation, the Review-button leg (:301 'Review and save sequence' -> 'Accept and save').
C. e2e/sequence-chat-scroll.spec.ts (103 lines) — EXISTS, **GREEN measured today** (1 passed with the leg-A classes present — campaign :85 first-check claim holds). Its pinned selectors (role log :57, composer label 'Message', `.sequence-chat` scrollTop, 'Latest messages ↓') stay byte-stable; E adds nothing here unless the matrix needs a bubble assertion.
D. e2e/sequences-multiselect.spec.ts (105 lines) — EXISTS, **GREEN measured today**. Byte-stable; it is the multiselect per-surface behavior pin (toolbar/count testids :50-55). No edit.
E. e2e/deck-ghost-shorthand.spec.ts (481 lines) — EXISTS; **not run by the composer this session on purpose**: its legs PUT shared deck fixtures (EVG-SPK-VERIFY reset) against the live stack — stack-touching runs belong to the E worker at gate time, not to a composer recon. Its two stub builders `blobClarificationResult` (:66) and `fixedShorthandResult` (:149) are **byte-stable-pinned from the server side**: server/src/ai/shorthandChat.e2eStubHonesty.test.ts:100 extracts them VERBATIM via regex + esbuild (:105-110) — any edit to those function bodies goes server-honesty RED. **Composer ran it today: `cd server && npx vitest run src/ai/shorthandChat.e2eStubHonesty.test.ts` -> 7 passed.** E MAY append new legs to this file (reuse the builders in place, per campaign :84 "reuse those stub builders") but must not touch the two builders; appending new legs is safe for the extractor only if the builders' text stays byte-identical (the regex is per-function).
F. Specs ADDED during legs B/D/D0: none under app/e2e (git log app/e2e since 10-28: deck-ghost last touched 332276e2, 10-16). The D0 chain-card gate lived in vitest (useSurfaceChat.chain.test.tsx) + the browser-gate receipt dir /home/brad/.hermes/cl/receipts/L2-CHATUI1-LEGD0. E's matrix adds the deck chain-card VISIBILITY leg (below) rather than re-testing the flow.
G. RISK REGISTER — other chat-driving e2e specs E must MEASURE-AT-CLAIM and classify (composer did not run them; several touch stack fixtures or the :5193 default port): e2e/deck-equipment-via-agent.spec.ts:88-93 and e2e/deck-switch-via-agent.spec.ts:51-56 drive chat via `right-pane-tab-ai` + `[data-testid="chat-input"] .chat-input__editor` — the `chat-input` testid exists ONLY in AiTabPanel's ChatInput (ChatInput.tsx:159; grep confirms zero chat-input sites in HarnessChatPane/ChatLog). On a registered deck the AI tab body is HarnessChatPane (RightPane.tsx:95-96), so these legs are SUSPECTED RED-at-tip for the same stale-mount class as O1. E's first check enumerates them: if red, the repair is the one-line chat-composer re-pin to the ChatLog composer (textarea label 'Message', ChatLog.tsx:307) — a test-port repair in E's ownership; if green (stub posture registers no chat -> fallback arm survives until D), record why and hand the re-pin to D in the handoff note. Either way: no silent skips.

## 4. What E ADDS (new pins, e2e only) so every HarnessChatPane surface-family has the standard

One new spec file plus appended legs, all stub-driven (no model): the sequences stub pattern (page.route + addInitScript fetch-swap, sequences-harness-chat.spec.ts:34-53 header describes it) and the deck stub pattern (deck-ghost-shorthand stubAssistStream :182-203 with the two honesty-pinned builders; stubAssistStreamSequence :216+ for multi-turn).

NEW FILE e2e/chatui1-leGE-surface-matrix.spec.ts — legs (each = its own receipt):
1. sequences bubble/card/compaction: reuse the harness-chat stub; drive a done frame with `shorthand` set (payload shape: deck-ghost fixedShorthandResult carries shorthand verbatim at :177) -> assert `chat-log-msg--user` + `chat-log-msg--assistant` both present and distinct, `chat-log-intent-card-body` text equals the verbatim shorthand BEFORE any accept click, then answer a clarification and assert `chat-log-clarification-answered` + the bulky picker (`chat-log-request-*` / ClarificationPicker inputs) GONE from the DOM.
2. run-surface same grammar at /runs/RUN-2026-09-07-run-nzrs (fixture the three-pane spec already uses, :15) — bubbles + card via a stubbed stream.
3. per LEG C surface (registry /record/artifact/project — routes App.tsx:225/:208/:205/:178): composer ENABLED (textarea 'Message' not the :141 'No surface has registered' empty state), directional bubble classes after one stubbed exchange. (Mount receipts exist from leg C; E adds only the grammar.)
4. deck intent-card-before-accept: append to deck-ghost-shorthand.spec.ts a leg reusing `fixedShorthandResult` in place — after Send, `chat-log-intent-card` visible with the verbatim shorthand doc (ghost doc :177) BEFORE the ghost tile/ChatPreviewCard Apply, proving card-before-accept with byte-honest payloads.
5. deck chain-card UNIVERSAL-HOME VISIBILITY (status per ruling §5, report-grade): stub a chain-frames done (per D0's chain frame shape, useSurfaceChat.chain.test.tsx is the shape authority — do NOT import product code, just the frame the server emits) -> `data-testid="harness-chat-proposal"` (HarnessChatPane.tsx:172) shows the ChainProposalCard on the deck pane. One leg. REJECT leaves no wall leak.
6. protocol-edit/chain STATUS REPORT (not a pin): per surface, grep/observe whether protocol-edit review renders anywhere on the universal pane — expectation per ruling §2 is NO (its home is routed ReviewAiPanel at ProtocolReviewHostPage /ingestion/vendor-pdf/:recordId) — the receipt records it as by-ruling status, never a silent pass.

REPORTED-GAP list E ships (behavior with no universal home at E-time -> named in the report, NOT fixed — ruling §5):
- G1 run working-focus header (see §3A pin 2; becomes a fix commit if orch picks E-α, a gap line if E-β).
- G2 ChatPreviewCard PER-BATCH ATTRIBUTION (campaign :84 "uifix2 D1 legs"): composer grep for attribution/batch semantics in ChatPreviewCard.tsx / ChatLog.tsx returns ZERO hits at tip — the pane mounts ChatPreviewCard (HarnessChatPane.tsx:170) but no per-batch label found under those names. E re-runs a WIDER grep (the uifix2 report naming may differ), records the receipt, files G2 if truly absent. Do not build it.
- G3 universal protocol-edit chat card -> SEPARATE FUTURE ITEM per ruling §5 verbatim; E reports the status line only.
- G4 AiTabPanel-only chrome (SourcesStrip/AddSourceModal/RunInEventEditorButton/per-viewer label — grep: zero mounts in HarnessChatPane.tsx) -> dies-or-is-ported in LEG D per ruling §4; E only reports which surfaces still show ai-tab-* DOM (post-D the answer must be NONE; E runs `grep -rn 'ai-tab-' app/src --include=*.tsx` as a tip-state receipt).

## 5. Playwright runtime prerequisites

- Stack: lane-2 stack serves the merged trunk — frontend :5193, backend :3093 (campaign §7; handoff 2026-10-30_1355 RECONCILE confirms both 200). :5193 must serve E's MERGED branch modules — the gate runs AFTER E merges, so the worker proves candidate freshness the D0 way (served-module cite check against the built tree, per handoff 2026-10-30_1220 "Candidate freshness proven against served :5193 module").
- Every playwright command: `cd app && PLAYWRIGHT_BASE_URL=http://localhost:5193 npx playwright test <spec> --project=chromium` (config default :5174 is a trap, playwright.config.ts:11). chromium project only.
- Stub builders: reuse IN PLACE the deck-ghost builders pinned by server/src/ai/shorthandChat.e2eStubHonesty.test.ts (SPEC_PATH :100, verbatim extraction :105-110 — byte-honest contract). Sequences/run/C-surface legs copy the sequences-harness-chat page.route/fetch-swap PATTERN (self-contained stub payloads; never re-declare names `blobClarificationResult`/`fixedShorthandResult` in a new file where the extractor's per-function regex could confuse ownership — name new builders distinctly, e.g. matrixCardResult).
- Deck legs mutate the shared deck fixture EVG-SPK-VERIFY via PUT (resetEmptyDeck / resetDeckWithPlate, serial-mode file, deck-ghost-shorthand.spec.ts:57 `test.describe.configure({ mode: 'serial' })`): run deck legs when no other gate is live on the stack; keep serial mode.
- Receipt dir convention: **/home/brad/.hermes/cl/receipts/L2-CHATUI1-LEGE/<tag>/** with per-surface subdirs, precedent layout = /home/brad/.hermes/cl/receipts/L2-CHAT-UI-1/20261030T0915-legC/ (per-surface subdirs + report.md + shots/). One playwright run-log + at least one screenshot per surface-family leg; report.md in the receipt dir ends with the per-checklist-row verdict table.
- Gate launches from a tick use systemd-run bare-path, not terminal background (campaign §7). git ALWAYS with `-c core.fileMode=false` (campaign §7, NFS mode-bit fog).

## 6. VERIFIED-BY (commands + expected output)

First targeted check (BEFORE writing anything, at claim, fresh post-D tip):
```
cd /mnt/vast/home/brad/git/cl-integration-2/app \
 && PLAYWRIGHT_BASE_URL=http://localhost:5193 npx playwright test e2e/three-pane-harness.spec.ts --project=chromium --reporter=line
```
Expected at claim IF LEG D left the pins (composer measured at d18f1c13: **2 failed / 3 passed**, failures at :21 and :58): two reds. After the :21 one-line re-pin alone: exactly 1 failed (:58) / 4 passed — that intermediate state is the RED-first receipt proving the two defects are independent. If D already re-pinned, record D's green and cross ED-L2T0052-O1-E2E-PIN off from D's receipt.

Full pin suite, green:
```
cd app && PLAYWRIGHT_BASE_URL=http://localhost:5193 npx playwright test \
  e2e/three-pane-harness.spec.ts e2e/sequences-harness-chat.spec.ts e2e/sequence-chat-scroll.spec.ts \
  e2e/sequences-multiselect.spec.ts e2e/deck-ghost-shorthand.spec.ts e2e/chatui1-leGE-surface-matrix.spec.ts \
  --project=chromium
```
Expected: ALL passed, zero skips. (Composer-measured pre-repair at tip: three-pane 2F/3P; the three sequences specs 1F/3P (sequences-harness-chat :162); deck-ghost unrun by composer — first-run it at claim and classify any red through §3G's rule before touching it; it was green at D0's gate window.)
Risk-register specs (§3G): run deck-equipment-via-agent + deck-switch-via-agent at claim; expected outcome is green (after a chat-composer re-pin if they measure red) — receipt either way.
Server honesty pin must stay green (E's edits must not break the extractor):
```
cd server && npx vitest run src/ai/shorthandChat.e2eStubHonesty.test.ts    # expected: Test Files 1 passed, Tests 7 passed (composer-verified today)
```
App vitest regression (E changes no product code unless E-α fires):
```
cd app && npx vitest run src/agent src/shared/ai src/shared/shell src/sequences src/run    # expected: green, unchanged from claim-time baseline
```
(E-α fix commit additionally owns: new vitest in src/run publishing ChatFocus from the focused step, RED first.)
tsc baseline rule: `cd app && npx tsc --noEmit | grep -c 'error TS'` — MEASURE FRESH on the fresh branch at claim, record the number in the report baseline section, ship with ZERO new. (Composer re-measured at d18f1c13 app/: **20** — matches campaign §7's 20; do not trust remembered 11/12 figures.)
Browser-gate receipts: §5 dir; before/after pair against the leg C receipt set (20261030T0915-legC) per campaign :86 (before/after evidence pair).
Report marker: final line `L2CHATUI1-LEGE DONE <sha>` in the report; ED-L2T0052-O1-E2E-PIN clears ONLY on the green three-pane receipt.

## 7. Ownership / scope / worker contract

OWNED (every file named): app/e2e/three-pane-harness.spec.ts (O1 re-pin :21; header-leg disposition §3A), app/e2e/sequences-harness-chat.spec.ts (the :288 honest-wall re-pin ONLY — everything else byte-unchanged), app/e2e/deck-ghost-shorthand.spec.ts (append-only; the two pinned builders byte-identical), app/e2e/deck-equipment-via-agent.spec.ts + app/e2e/deck-switch-via-agent.spec.ts (chat-composer re-pin ONLY if §3G measures them red), NEW app/e2e/chatui1-leGE-surface-matrix.spec.ts. Conditional fix commit (E-α only): app/src/run/RunWorkspacePage.tsx + RunSurfaceChatBridge.tsx (+ new src/run test file) — ONE separate commit, deck-precedent shape, nothing else in product code.
OUT OF SCOPE (hard): AiTabPanel.tsx + everything under app/src/event-editor/right-pane/ai/ (dies with LEG D — **zero AiTabPanel behavior porting, ruling §5**), ChainProposalCard.tsx / WorkstateProposalCard.tsx / ChatPreviewCard.tsx / ChatLog.tsx / HarnessChatPane.tsx / useSurfaceChat.ts / RightPane.tsx / ChatContextHeader.tsx (product code), server, ZERO YAML (any YAML in the diff = STOP-and-report), no :3001/:5174 stacks, no task-list edits, no merges, no dispatch. No opportunistic refactors (campaign :102 defect rule cuts the other way too: E tests, it does not "improve").
Stop-and-report rule: if a checklist behavior cannot be pinned without touching product code, it goes to the REPORTED-GAP list (§4) and the report flags it for the architect — E never smuggles behavior in through a "test helper".
Worktree: /mnt/vast/home/brad/git/wt/CHATUI1-LEGE-lane2-l2t<tick> (orch sets tick; worktree add run background=true per the NFS-timeout lesson), branch cl/lane2-chat-ui-1-<tag>-legE off the trunk tip AT CLAIM — which MUST be post-LEG-D (D's merge commit an ancestor; verify `git -c core.fileMode=false merge-base --is-ancestor <D-merge> HEAD`). Deliverable/report (write BEFORE any edit, baseline section first, append-only): /home/brad/.hermes/cl/lanes/2/deliverables/L2-CHAT-UI-1-report.<tag>.md — files changed, commands + RAW output excerpts, fresh tsc count with its sha, per-surface checklist table, reported-gap list, receipts under §5 dir. End 'STATUS: complete' + `L2CHATUI1-LEGE DONE <sha>`.

## 8. Reviewer bait (anticipating the adversarial review)

1. GREENWASH TRAP — "make it green by deleting assertions." The three measured reds (:21 stale testid, :58 chat-context-header, sequences :288 honest-wall) each have a composer-measured baseline in §3; the repair must PRESERVE intent (re-pin to the live ratified testid/behavior, never remove the check). Cite the today-counts in the report so no reviewer can claim E invented green.
2. EXACTOPTIONALPROPERTYTYPES — only live if E-α fires: the ChatFocus publish must use conditional spread for optional fields (`detail`), key ABSENT never undefined, same discipline as HarnessChatPane.tsx:187-191's chain spreads. No undefined-valued props into ChatFocusProvider.
3. YAML-RELOAD TRAP — E ships ZERO YAML; a YAML hunk in the diff is out-of-scope drift, STOP.
4. ONTOLOGY TERMS — none required (no schema/knowledge-layer/claim files in scope; canonical-example doc not binding).
5. HARDCODE BOUNDARY — no surface-name string switches in any shared component; the E-α fix copies the DECK's publish pattern (DeckSurfaceChat.tsx:207-216), it does not special-case 'run' inside HarnessChatPane/SurfaceFocusHeader. The matrix spec may branch on route (tests may), product code may not.
6. THE EXTRACTOR — server/src/ai/shorthandChat.e2eStubHonesty.test.ts:100-110 regex-extracts `blobClarificationResult`/`fixedShorthandResult` from deck-ghost-shorthand.spec.ts BY NAME and byte-compares to real compile output. Appending legs to that file is safe; editing those function bodies (even formatting) goes server-honesty RED. New matrix builders get distinct names.
7. STALE-BASELINE TRAP — :5193 serves the TRUNK stack; E's specs only gate after E merges and the stack is restarted with E's tip (candidate freshness proven against the served module, D0 precedent). Pre-merge runs are measurement, not the gate.
8. SERIAL DECK FIXTURE — deck legs PUT shared EVG-SPK-VERIFY; parallel workers race it (deck-ghost-shorthand.spec.ts:57 already serial — the matrix deck legs honor serial mode too).
9. LEG D COLLISION — three-pane re-pin is claimed by BOTH campaign leg-D text (:76) and ledger O1 (E). §1(3) resolves it: whoever lands it first; E re-measures at post-D tip and never double-commits the same re-pin. A reviewer finding "E didn't do :58" must find §3A's disposition instead.
10. THE PORT-REFUSAL — if review demands "just mount SourcesStrip / the protocol-edit card / the AiTabPanel composer on the pane to make the matrix pass": REFUSE. Ruling §5 + campaign §102: E reports gaps; the porting leg was D.

## 9. Open questions (composer could not resolve locally; max 3)

OQ-E1. Three-pane header disposition: E-α (small run-focus publish fix commit, recommended — defuses D's ChatContextHeader deletion landmine and preserves run behavior) vs E-β (delete leg, report gap). Checked: RunWorkspacePage/RunSurfaceChatBridge publish no ChatFocus (grep src/run, zero non-test hits); ChatContextHeader mounts only RightPane fallback + AiTabPanel (RightPane.tsx:102); deck precedent exists (DeckSurfaceChat.tsx:207-216). Needs orch ruling at ratification.
OQ-E2. sequences-harness-chat :288 honest-wall re-pin changes a gate-era assertion's EXPECTATION (0 alerts -> exactly the honest-wall). Is that "repair of a stale pin" (honest wall is ratified loud-failure behavior, edef0b5b) or does it need architect sign-off since it touches a rule-12-gated spec? Checked: failure deterministic x2 today; alert text = honest-wall copy verbatim; spec predates the wall by 11 days. Spec's default reading: repair, with the re-pin justified IN the commit message.
OQ-E3. Do deck-equipment-via-agent / deck-switch-via-agent currently ride the legacy composer (chat-input) into AiTabPanel's fallback on the deck? The composer could not run them (they PUT the shared deck fixture against the live stack — stack-touch belongs to the gate, and the fallback may legitimately still serve them if their stub posture de-registers the bridge). Checked statically: chat-input testid exists ONLY in ChatInput.tsx:159 (AiTabPanel side); RightPane serves HarnessChatPane whenever panelSlot?.chat is set (RightPane.tsx:95). E's first-check measures; if red-at-claim, the §3G re-pin is in E's ownership; if that re-pin is judged behavior-porting, escalate before editing.

END-DRAFT

## 10. ORCH RATIFICATION (2026-10-30T19:10 EDT, l2t1830) — dispatch-grade (CLAIM still gated on LEG D merge)

Composer-run death note: the drafting session exited after END-DRAFT landed (recover-zero-loss
class — the draft is complete on disk). Draft spot-checked first-hand by orch at tip 02008735:
playwright.config.ts:11 :5174 default trap CONFIRMED; three-pane :21 agent-chat-pane pin
CONFIRMED stale (harness-chat-pane is HarnessChatPane.tsx:138); honest-wall role=alert at
HarnessChatPane.tsx:164 CONFIRMED; sequences-harness-chat.spec.ts:288 getByRole('alert')
toHaveCount(0) CONFIRMED; zero ChatFocus publishes in src/run non-test CONFIRMED;
chat-input testid exists in ChatInput.tsx:159 (AiTabPanel side; also ChatPage/one test mock —
E's re-pin targets the deck specs' usage only); extractor contract
shorthandChat.e2eStubHonesty.test.ts:100-110 CONFIRMED.

RULINGS (binding):
- OQ-E1: E-α APPROVED. The run working-focus publish is a separate ONE fix commit on E's
  branch (deck precedent DeckSurfaceChat.tsx:207-216; RED-first vitest; EOPT conditional
  spreads). It preserves run behavior AND defuses LEG D's ChatContextHeader-deletion
  landmine. If at claim LEG D has already deleted ChatContextHeader and left the :58 leg
  red, E-α is the repair path, mandatory.
- OQ-E2: RATIFIED as stale-pin REPAIR within E's scope (the honest wall is ratified
  loud-failure behavior, edef0b5b; the spec predates it). No architect sign-off needed;
  the justification goes in the commit message. Re-pin to exactly-the-honest-wall, never
  assertion deletion.
- OQ-E3: measure-at-claim per §3G. A chat-composer re-pin (chat-input -> textarea 'Message')
  in those two deck specs is a TEST-PORT repair in E's ownership. If pinning them would
  require touching product code -> REPORTED GAP + flag, do not port.
- CLAIM ORDER unchanged: E branches off the post-LEG-D trunk tip, AFTER LEG D merges green.
  §1(3)/bait 9 collision rule stands: whoever lands the three-pane re-pin first; E
  re-measures at tip and never double-commits.
