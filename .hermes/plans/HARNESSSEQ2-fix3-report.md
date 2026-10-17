# HARNESS-SEQ-2 FIX3 — lane2 coder report (l2t0510)

## 0. Branch point / cite re-pins
- Worktree: /mnt/vast/home/brad/git/wt/HARNESS-SEQ-2-fix3-lane2-l2t0510
- Branch: cl/HARNESS-SEQ-2-fix3-lane2-l2t0510 off cl/integration-2 tip
- Branch point commit: fc9115766adbec5bb2c2e7cbcb48a406a6d5296a (docs(lane2) l2t0445b addendum)
- Gate evidence: /home/brad/.hermes/cl/receipts/HARNESS-SEQ-2/2026-10-16_0445-regate-tier2/
  (served HEAD 01feef67, 27ef008f lineage). All cites re-pinned at fc911576.
- Commits on branch:
  - b7224ffc test(HARNESS-SEQ-2-fix3): RED
  - f61d210a feat(HARNESS-SEQ-2-fix3): GREEN
  - c5b49854 test(HARNESS-SEQ-2-fix3): spec-driven re-pin of the prose_only retry-budget pin

## 1. Diagnosis (from gate REPORT.md + code read at fc911576)
- D1 (HIGH, C2-negative): "focus on record ANR-000001" (kind analysis-run, outside sequences
  selectableKinds [sequence, sequence_interval, oligo-spec], surfaces.yaml:92-97). The model emitted
  ZERO agent_intent calls ([agent zyyrls]/[agent 1ta7ju], 3 turns, toolCalls=0), so the client-side
  selectableKinds gate (app/src/sequences/applyAgentAction.ts:119-128) had nothing to refuse; the
  chat showed only the generic line at server/src/ai/AgentOrchestrator.ts:2054 (pre-fix).
  Root cause: the refusal depended entirely on the model emitting a frame.
- D2 (MED, C3): the zero-toolcall sequences branch (AgentOrchestrator.ts:2041 pre-fix) allowed TWO
  nudges (three turns) and then returned the generic "The model did not return a structured sequence
  proposal." — a drafting-flavored line even for navigation asks. The retry itself already landed on
  the second attempt (trace dh649w); the flake is model compliance, the defect is the unbounded
  budget + dishonest failure text.

## 2. Fix (smallest, data-driven)
NEW server/src/ai/sequencesFocusGuard.ts — PRE-MODEL deterministic guard, wired in
server/src/ai/AgentOrchestrator.ts immediately after the write-wall block and BEFORE the
`[agent ...] start` line (so a refusal logs its own line and makes ZERO inference calls):
- fires only on surface 'sequences' when deps.store + deps.surfaces are present (production wiring
  confirmed: server.ts:1155 store: ctx.store, server.ts:1169 surfaces: loadDefaultSurfacesRegistry,
  both spread into createAgentOrchestrator at server.ts:1203-1215; assistStream -> orchestrator.run
  at AIHandlers.ts:460).
- request-shape probe only (focus|show|open|display|view + an id token needing a hyphen or digit);
  NO kind list, NO surface literal, NO id-prefix policy in TS.
- the record's kind comes from the store's answer (payload.kind, schemaId fallback — the same reader
  compileWorkspaceAction.ts uses); selectability comes from the registry DATA
  (SurfacesRegistry.get(surface).selectableKinds).
- refusal text mirrors the client gate's wording: `Record "ANR-000001" (kind analysis-run) is not a
  kind Sequences can select (it declares sequence, sequence_interval, oligo-spec). Nothing was
  changed.` Rides AgentResult.error -> the chat bubble (app/src/shared/hooks/useAiChat.ts:656
  `content: result.error ?? ...`). Zero agent_action frames, zero writes, zero authoring fetch.
D2 in AgentOrchestrator.ts: zero-toolcall sequences branch budget 2 -> 1 (bounded, logged
`[agent <tid>] sequences forced-tool compliance failure model=... attempts=... tool=agent_intent`),
and the failure text now names the model-compliance failure: `The model (<model>) did not emit the
required agent_intent tool call after N attempts (the retry was requested once). Nothing was saved.`
No model swaps, no temperature/param changes, no profile changes.

## 3. Files touched (whole diff vs fc911576 — 4 files, 502+/3-)
- server/src/ai/sequencesFocusGuard.ts (NEW, 105 lines)
- server/src/ai/AgentOrchestrator.ts (+49/-2: import, pre-model guard block, bounded retry, honest text)
- server/src/ai/AgentOrchestrator.sequencesFocusGuard.test.ts (NEW, 345 lines, 7 pins)
- server/src/sequences/sequenceIntent.test.ts (+5/-1: prose_only retry-budget re-pin 3->2 calls)
NO app/src edits. NO YAML added/changed (refusal text is built from registry data + store answer;
no config YAML touched -> no stack restart needed for YAML reasons). agent-action.schema.yaml
byte-identical (not in diff). No SH-QA-3/SH-QA-4 files touched. No existing pins/goldens weakened:
the single re-pin is the retry COUNT the approved D2 direction explicitly names ("retry the turn
ONCE"); its honest-failure assertions are kept and strengthened (now also names agent_intent).

## 4. RED run (commit b7224ffc, guard NOT yet wired)
`npx vitest run src/ai/AgentOrchestrator.sequencesFocusGuard.test.ts`
 Test Files 1 failed (1); Tests 4 failed | 3 passed (7)
 FAIL G1 (named refusal with zero model cooperation) — got 3 model requests + generic text
 FAIL G1b (registry swap flips refusal text) — no refusal at all
 FAIL H1 (one retry then honest failure) — got 3 requests, generic text
 (G3 initially failed on my own expectation error — prose-stall + intent = 2 requests; corrected in
 the same RED commit's file before GREEN, not a product defect.)

## 5. GREEN run
Targeted: `npx vitest run src/sequences/sequenceIntent.test.ts src/schema/AgentActionSchema.test.ts
src/ai/compileWorkspaceAction.test.ts src/ai/AgentOrchestrator.sequencesAgentAction.test.ts
src/ai/AgentOrchestrator.sequencesFocusGuard.test.ts`
 -> Test Files 5 passed (5); Tests 71 passed (71)
Regression sweep (src/ai src/surfaces src/sequences), head vs branch-point base, comm of sorted
`^ FAIL` lists: NEW-FAILS-VS-BASE = EMPTY.
 head: 23 failed | 973 passed | 2 skipped (998) — all 23 are pre-existing trunk fails present in the
 base run (bypass/golden/tubeGate/ChatbotCompileDeckSlot/chatbotCompile.e2e/createRecordIntent/
 submitSuggestionTool.tubeSchema/attachedProtocol/AgentOrchestratorForwarding/surfacesAjv).
 base: 26 failed | 930 passed — the 3 extra base-only entries are exactly the 3 RED probes (G1, G1b,
 H1) that GREEN turned green. Raw logs: /tmp/seq2fix3-head-ai.log, /tmp/seq2fix3-base-ai.log,
 /tmp/seq2fix3-head2.log.
Real-registry probe (temporary probe file, deleted before commit) against the gate's exact prompts:
 REFUSE | focus on record ANR-000001 | Record "ANR-000001" (kind analysis-run) is not a kind
        Sequences can select (it declares sequence, sequence_interval, oligo-spec). Nothing was changed.
 silent | focus on record SEQ-827c4175a52a4ef65916eca5   (C2-positive control stays open)
 silent | show me record OLG-000007 / switch to the Assay tab / propose a new DNA sequence ...
 REFUSE | open ANR-000001 and tell me what it measured   (explicit out-of-kind id -> named refusal)

## 6. tsc evidence
- server tsc: 1 error at BOTH base and head — the pre-existing
  src/ai/AgentOrchestrator.ts TS2339 ('id' on ResolvedActionTarget union). Base line 345, head line
  346: the ONLY diff is that one pre-existing error's line number shifting by 1 because of my import
  line in the same file (diff-only-in-my-files). Position-stripped sorted diff: EMPTY
  (SERVER-TSC-IDENTICAL-MOD-POSITIONS). Raws: /tmp/seq2fix3-server-tsc-base.txt,
  /tmp/seq2fix3-server-tsc-head2.txt.
- app tsc: 23 errors at base AND head; sorted diff EMPTY (APP-TSC-SORTED-DIFF-EMPTY). Baselines were
  re-measured at MY branch point after repairing the fresh worktree's missing lane-exclude symlinks
  (without repair app tsc read 28 with 5 phantom TS2307; after repair it matches the fleet pin 23).
  Sorted lists: /tmp/seq2fix3-app-tsc-base-sorted.txt, /tmp/seq2fix3-app-tsc-head-sorted.txt.

## 7. Honest limits / notes for the orchestrator
- D1 determinism is proven for the gate's shape: an EXPLICIT record id in the ask. If the user names
  a record by LABEL only ("focus on the ROS run"), the guard stays silent and the outcome still rides
  model cooperation — that is outside the gate's probe and outside the approved scope.
- D2 is honesty + bounded retry, NOT a cure for model forced-tool compliance: a proposal request can
  still fail after the single retry (now with an honest named failure). The shared mechanism (model
  compliance at historyLen=20) remains a fleet-wide blocker class; this fix makes the negative leg
  model-independent (D1) and bounds + names the failure (D2). No BLOCKED condition: both defects are
  addressed deterministically within scope.
- The prose_only pin re-pin (3->2 calls) is the only existing-pin change; it encodes the retry budget
  the approved spec names. Flag for orchestrator awareness.
- No YAML changes -> no stack restart required for this fix. Browser re-gate is the orchestrator's.
