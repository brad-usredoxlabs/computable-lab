# HARNESS-SEQ-2 CODER REPORT — RESUME RUN (l2t1045 resume, lane2 worktree wt/HARNESS-SEQ-2-lane2-l2t1045)
Branch: cl/HARNESS-SEQ-2-lane2-l2t1045 (base trunk 28e8a1fc). Resume of the run that died to
context-compression after 5 clean commits + 2 dirty files. This run: verified the inherited work
against the canonical spec, completed the implied wiring (guidance-bullet registry-data provenance
tests), ran the full verification suite, committed the dirty files, wrote this report.

## 0. Commit map (lane-owned, on top of 28e8a1fc)
- 837e7962 test(seq2): RED — sequences agent-action suites (inherited; RED raws below)
- b5acc73d feat(seq2): surfaces registry tabs + agent-action target arms + meta-schema delta (same commit — boot-safe)
- 1f7cf8e4 feat(seq2): compiler sequence-tab/sequence-record arms + visibility door (TARGET_NOT_VISIBLE / UNSUPPORTED_TARGET)
- da93824f feat(seq2): guidance bullet + visibility wiring at the ONE workspace_action dispatch branch (+ server.ts dep wiring)
- ded96d73 feat(seq2): client applyAgentAction executor + SequencesPage mount
- 61921402 feat(seq2): [RESUME] guidance bullet reads DECLARED tabs from deps.surfaces registry data (the dirty AgentOrchestrator.ts diff, verified compliant) + 2 GUIDANCE/B4 provenance tests + request-capture in the scripted client
- 26f46302 test(seq2): [RESUME] e2e agent_action navigation legs (the dirty sequences-harness-chat.spec.ts +133, verified against real committed code paths, run green)
- <report commit> docs(seq2): this report

## 1. Baselines (verbatim, from .hermes/raws)
- BASE server tsc (seq2-1045-base-server-tsc.txt): `tsc --noEmit` clean — 0 errors.
- BASE app tsc (seq2-1045-base-app-tsc.txt): 23 `error TS` lines (event-editor/ingestion/shared debt; verbatim in raw).
- BASE full server suite (seq2-1045-base-full-server.txt): `Test Files 90 failed | 624 passed | 9 skipped (723)` / `Tests 99 failed | 5755 passed | 70 skipped (6097)` / `Errors 2 errors`; FAIL-file set 86 files (seq2-1045-base-failfiles.txt, comm-verified identical to the set derived from the raw).
- HEAD (resume tip) server tsc (seq2-1045r-head-server-tsc-final.txt): 0 errors — EQUALS base.
- HEAD app tsc (seq2-1045r-head-app-tsc.txt): 23 error lines; comm of sorted error lines base vs head = EMPTY (set-identical, not just equal counts).
- HEAD full server suite, TWO runs (load-flap discipline):
  - run1 (seq2-1045r-full-server.txt): 93 failed | 623 passed | 9 skipped (725); 99 failed tests; Errors 2. FAIL set 89 (seq2-1045r-run1-failfiles.txt).
  - run2 (seq2-1045r-full-server-2.txt): 90 failed | 626 passed | 9 skipped (725); 99 failed tests; Errors 2. FAIL set 86 (seq2-1045r-run2-failfiles.txt). comm(base, run2) = EMPTY — FAIL-FILE SET EQUALS THE BASE SET.
  - The run1-only trio (KnowledgeAIHandlers.assertions, DraftCopyDerivedRefValidation, IdShape): lane diff touches ZERO of them (`git diff 9df3c22a..HEAD --name-only | grep` = 0); all 3 PASS in isolation (seq2-1045r-flap3-isolated.txt: 3 files / 17 tests green); absent from run2. Load-flap, proven by isolation + second full run, not asserted.
  - `Errors 2` unhandled-error debt identical base↔head (pre-existing).
- surfacesAjv.test.ts: FAILS in base set AND head set (85th line of both) — pre-existing trunk debt (symlink to computable-lab trunk; fails on the closed surface-id enum). Not ours; zero lane delta on it.

## 2. RED evidence (inherited commit 837e7962, raws preserved)
- seq2-1045-red-app.txt: `cd app && npx vitest run src/sequences/applyAgentAction` → 1 failed file, "no tests" (module-missing RED).
- seq2-1045-red-server.txt: targeted server run at the RED commit → `Test Files 6 failed | 1 passed (7)`, `Tests 28 failed | 43 passed (71)` — new arms RED, existing green.

## 3. First targeted check (inherited probe, cited not re-run)
seq2-1045-probe-server.log (prior run's probe stack :3095, CL_DATA_DIR=.computable-lab-seq2probe, model qwen3.8-flash-next): after the YAML delta + restart, a REAL-model sequences turn compiled through the seam TWICE:
- `done workspace_action compiled ok action=open-surface target=analysis`
- `done workspace_action compiled ok action=open-surface target=SEQ-827c4175a52a4ef65916eca5`
The branch FIRES for surface=sequences — the core design assumption holds (spec: "if the branch never fires, STOP"). The real-model acceptance leg remains the browser gate's (:5193) — this coder did not run the gate.

## 4. T-map (acceptance criteria → test evidence)
AC1 "one real local-model conversation switches the tab and selects a record through an Ajv-validated agent_action frame" — REAL-MODEL LEG = BROWSER GATE (orchestrator dispatches cl-browser-reviewer; not this coder's). Test-proven scaffolding:
  - server/src/ai/AgentOrchestrator.sequencesAgentAction.test.ts: tab turn emits EXACTLY ONE agent_action frame, success:true, zero sequenceProposal, store tripwire zero mutations; record turn emits with AUTHORITATIVE label (model label overwritten).
  - server/src/ai/compileWorkspaceAction.test.ts (29 tests): arms validate through the registered $id (Ajv sole authority), registry tab fence, store-verify.
  - probe log (above): real model actually chose workspace_action for both legs.
  - e2e (26f46302): frames drive the page (Leg 1 tab switch + focus header; Leg 2 record select via selectRecord + header follows).
AC2 "an invalid action changes nothing and says why" — TEST-PROVEN:
  - server: undeclared tab → UNSUPPORTED_TARGET pipeline_diagnostics, ZERO agent_action, notes carry the message; invented id → UNKNOWN_RECORD zero action.
  - client unit: undeclared tab / unknown kind / target-less → NAMED refusal, ZERO effects.
  - e2e Leg 3: "switch to the Settings tab" → log names the refusal, aria-pressed unchanged, no Settings button, header unchanged.
AC3 "drafting still happens for 'save this sequence' while pure navigation drafts nothing" — TEST-PROVEN:
  - regression arm: valid sequence_action turn → result.sequenceProposal (operation save_sequence), ZERO agent_action, zero store.create.
  - navigation arms: zero sequenceProposal + store tripwire (create/update/delete throw if touched).
  - GUIDANCE test 2: drafting guidance present regardless of tab declaration (relaxation is additive only).
  - guidance bullet text itself: "Navigation drafts nothing and writes nothing. Use intent=sequence_action only for proposals."
AC4 "canLeave() block honored" — TEST-PROVEN:
  - unit: blocked record switch calls selectRecord ANYWAY (guard inherited, never reimplemented) and returns the honest line; canLeave undefined (unmounted) is NOT a block (===false strictness); TAB switch is NOT draft-guarded (neither stricter nor looser than human clicks).
  - e2e Leg 4: 500 on /api/drafts/accept → draft incomplete ("Save incomplete — retry to finish") → record-switch turn BLOCKED: log says "unsaved sequence draft", header still shows the previous record, draft intact.
AC5 "Browser gate :5193; VERDICT: accept" — ORCHESTRATOR's gate. YAML delta landed in b5acc73d; the ORCH restarts the stack (:5193/:3093) — this run did NOT restart them and NEVER touched :5174/:3001.

## 5. Verification commands + real output (this run)
- Targeted server (seq2-1045r-targeted-server-final.txt): surfaces.test 6 + surfacesTabsCompat 4 + AgentActionSchema 10 + compileWorkspaceAction 29 + sequencesAgentAction 9 + workspaceAction 10 → `Test Files 6 passed (6) / Tests 68 passed (68)`. (The compat test proves registry tabs ≡ schema-enum ≡ page-const set-identity.)
- Regression neighbors (seq2-1045r-regression-neighbors.txt): AgentOrchestrator.shorthandChat + src/compiler/scientistIntent → `22 passed (22) / 259 passed (259)` — MANIFEST trip SILENT (COMP-4's re-bless fbf743ab intact, zero lane delta on treeState files).
- App unit (seq2-1045r-app-unit.txt): `npx vitest run src/sequences src/agent` → `7 passed (7) / 44 passed (44)`.
- App neighbors (seq2-1045r-app-neighbors.txt): src/event-editor/right-pane/ai + src/run → 46 passed; 3 FAIL files (ParameterAnswerInput, draftChanges, useChatThread.deckLayout) are symlink-load failures ("Failed to load url … resolved id …/computable-lab/…") — PROVEN PRE-EXISTING by stash-parity (seq2-1045r-app-neighbors-stashbase.txt: identical 3 failures with the dirty diffs stashed). Lane symlink-exclude materialization debt, zero relation to this diff.
- e2e (seq2-1045r-e2e.txt): `PLAYWRIGHT_BASE_URL=http://127.0.0.1:5196 npx playwright test e2e/sequences-harness-chat.spec.ts --project=chromium` → `2 passed (6.8s)` — the NEW navigation-leg test green against the lane vite dev server (left running by the prior run; used read-only).
- e2e neighbors (seq2-1045r-e2e-neighbors-serial.txt): three-pane-harness + sequence-chat-scroll `--workers=1` → `6 passed (24.4s)`. The parallel run (seq2-1045r-e2e-neighbors.txt) flapped 2 (scroll 'History 23' leg; three-pane protocol-nav-list 15s timeout under 6 cold workers) — both specs are FROZEN (git diff shows ZERO hunks in them), the scroll flap is the fleet's documented load-timing flap (SEQ-1 report l2t1040 §55-59), and serial re-run is fully green. three-pane spec UNMODIFIED (diff-proof: 0 lines).
- Typecheck: server 0 = base 0; app 23 = base 23, comm of error lines EMPTY.
- Test-file latent-TS discipline (server tsconfig excludes **/*.test.ts): standalone tsc (project flags) on AgentOrchestrator.sequencesAgentAction.test.ts = 70 latent error classes BEFORE and 70 AFTER my test edits; comm (line-number-normalized) EMPTY — zero new error classes introduced (pre-existing test-file debt, per fleet memory).

## 6. Dirty-diff reconciliation (what the resume run did)
- AgentOrchestrator.ts (+13/-2): guidance bullet now reads `deps.surfaces?.get(args.surface)?.tabs` and interpolates the DECLARED list; bullet OMITTED when no tabs declared (no invented vocabulary). VERIFIED COMPLIANT with HARD RULES (tab list from registry data, not hardcoded) — and now LOCKED by two new provenance tests (GUIDANCE/B4): swapping in a registry that declares ['Alpha','Beta'] makes the bullet follow the data and NOT leak the real page's tab names; a registry with no tabs emits no bullet while drafting guidance stays. forceDraftTool booleans, tool_choice pinning, FORCED_DRAFT_TOOL_INSTRUCTION, coercion branches: UNTOUCHED (grep-verified in lane delta).
- sequences-harness-chat.spec.ts (+133): four legs (tab frame, record frame, undeclared-tab no-op, canLeave block). Every referenced selector/endpoint verified against real committed code (surface-focus-header testid, aria-pressed tab buttons, SequenceEditor 'Review and save'/'Accept and save'/'Save incomplete — retry to finish', nativeDraft incomplete=5xx rule, useAiChat pipeline_diagnostics + agent_action frame handling). Stub frames mirror the server's REAL emission shapes (agent_action after compile ok; pipeline_diagnostics+notes on refused compile). Stub branches on the request's own `prompt` field (not body.includes) because history bodies carry earlier prompts — test scaffolding only; zero product keyword-routing.

## 7. Bait audit B1-B7
- B1 exactOptionalPropertyTypes: visibility wiring is `...(deps.authorizationService ? { visibility } : {})` (absent key OMITTED, never undefined); client handler returns `string | undefined` (never ''); effects objects omit absent keys; test opts use spread-conditional wiring. Verified in committed code.
- B2 YAML-reload trap: YAML delta (b5acc73d) predates the probe restart evidence (§3). Vitest processes load YAML fresh (no cross-process singleton staleness in tests). For the live stack: the ORCH restarts :5193/:3093 after merge — this run did NOT restart them (dispatch rule) and never touched :5174/:3001.
- B3 ontology/registry terms: surface id `sequences` (registry), tab strings byte-identical to the declared list — enforced by surfacesTabsCompat.test.ts (registry ≡ schema enum ≡ page const, 4 tests green); meta-schema `tabs` key delta landed in the SAME commit as surfaces.yaml (b5acc73d) so boot never throws against additionalProperties:false.
- B4 hardcode boundary: zero new surface-name/keyword policy branches (lane-delta grep: the only `surface==='sequences'` site is the pre-existing guidance block); tab literals appear ONLY in schema/registry YAML, the page const, and test files; registry-data provenance of the bullet is now TEST-PROVEN (§6), not assumed.
- B5 canLeave semantics: guard fires only on ===false, only on RECORD selection, INHERITED via selectRecord (never reimplemented); agent path SPEAKS (named line), human path stays silent; tab switches unguarded. Unit + e2e Leg 4.
- B6 ONE emit path: grep server src (non-test) for `type: 'agent_action'` → exactly ONE construction (AgentOrchestrator.ts:2633, inside the workspace_action dispatch branch AFTER compileWorkspaceAction ok). Zero new SSE types (agent_action/pipeline_diagnostics/tool_result/done all pre-existing). Double-frame idempotence: unit tests (already-selected → no effects + honest note; same tab frame twice → identical decision).
- B7 MANIFEST/golden: lane diff (9df3c22a..HEAD) touches ZERO treeState-pinned files (agent-action.schema.yaml, surfaces*.yaml are NOT pinned per finding 8; scientist-intent/* untouched by the lane — the MANIFEST blob move 83fda3b4→fbf743ab on this branch is COMP-4's own merge 3bc6ab0b, theirs). scientistIntent battery green (259 tests) → goldenIntentToGraph trip silent. NO re-bless performed.

## 8. Assumptions (explicit)
1. run1's 3-file FAIL delta is load-flap (isolation pass + run2 exact-base parity + zero lane delta on those files) — NOT a regression from this lane.
2. surfacesAjv.test.ts failure is pre-existing trunk debt (present in the BASE fail set; symlinked file; id-enum error).
3. The 3 app-neighbors symlink-load failures are lane materialization debt (stash-parity proof), not code failures.
4. e2e neighbor flaps are the fleet's documented load-timing flaps (frozen specs, serial green).
5. Probe log (§3) is the prior run's real-model seam evidence on the probe stack; the real-model ACCEPTANCE leg is the browser gate's.
6. Lane vite :5196 / probe :3095 were already running from the prior run; used read-only for e2e. No stack restarts performed by this run.
7. The e2e stub's prompt-field branching is test scaffolding; no product code routes on prompt text.

## 9. Handoff notes for the orchestrator
- YAML delta is live in the branch (agent-action.schema.yaml + surfaces.yaml + surfaces.schema.yaml): restart :5193/:3093 (ORCH) before the browser gate; verify :5193 serves the post-merge tip first.
- Gate legs to expect per spec §Browser-gate (legs 1-5 + zero-writes trail proof); the coder-side legs AC2/AC3/AC4 are already test-proven above.
- Battery raws: .hermes/raws/seq2-1045r-*.txt (this run) + seq2-1045-*.txt (inherited base/RED/probe).
