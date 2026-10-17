# SHORTHAND-COMP-3 / A6 fix spec — suppress assistant text_delta emission on forced-tool draft turns

Spec: 2026-10-14_0500-COMP3-A6-draft-prose-suppression-fix-spec.md (l2t0430)
Item: SHORTHAND-COMP-3 (and SHORTHAND-COMP-2 close, both gated on criterion A6)
Defect source: receipts/SHORTHAND-COMP-3/2026-10-14_0335-hepg2-gate/report.md §DEFECT-1
Architect decision (ADOPTED, verified first-hand by orch at trunk 29fa7e20):
  /home/brad/.hermes/cl/lanes/2/decisions/COMP3-A6-draft-prose-display-decision-l2t0430.md

## Problem
Run-page chat renders the model's interleaved first-person deliberation (up to 1804 chars,
3/3 repro) while a forced-tool draft turn streams. A6 requires the reply to go STRAIGHT to
the shorthand YAML panel — no reasoning prose.

## Fix (architect route (a), emission-side server — orch verified the seam)
server/src/ai/AgentOrchestrator.ts stream-chunk text-delta block (verified @ 29fa7e20 lines
1731-1736): emit onEvent({type:'text_delta'}) ONLY when the instance's declared
draftFlowMode !== 'forced-tool'. Under 'forced-tool', KEEP accumulating accumulatedContent
byte-unchanged (stop-coercion path + contentPreview diagnostics consume it).

Orch-verified anchors: draftFlowMode default 'forced-tool' @ :983; existing declared fork at
:993/:1149/:1155/:3262/:3278 — branching delta emission on the instance's own declared mode
is code interpreting declared data; NO new config field.

## Boundaries (coder must pin; from the decision artifact — read it fully)
- Final product copy stays visible: A5's "Drafted 1 event. Draft compiled deterministically…"
  rides the result payload (summarizeDraftResult/stream-done/fallbackText) — do NOT touch.
- Non-forced flows byte-unchanged (preflight-llm / preflight-deterministic / ledger /
  protocol-review / analysis): T2 regression pin.
- Server-built honest text (refusals, cannot-draft wording, clarifications) rides the RESULT
  payload — stays rendered. No status/tool-trace/ledger_answer suppression.
- ZERO client changes; no profile/prompt edit as the fix; no UI YAML.

## Tests (RED first, vitest, pattern per AgentOrchestrator.*.test.ts, fake streaming client)
- T1 RED→GREEN: forced-tool instance streaming content deltas interleaved with tool calls →
  zero text_delta events; coercion path still fires (accumulatedContent intact).
- T2: same fake on preflight-llm instance → deltas emitted verbatim (regression pin).
- T3: forced-tool success still emits terminal done with result payload; refusal arm still
  surfaces server-built refusal message.

## Verify battery (orch will re-run on merged trunk)
Targeted server ai suite dir green; server tsc 0 new; app tsc set-diff vs baseline empty.

## Gate r2 evidence (after merge + stack restart; may reuse gate4 harness — run-page
clarifications = questions-panel/.message-log__clarification-picker selectors, NOT pl-*)
PROMPT 1 + 2 on /runs/RUN-2026-10-09-run-1i4b: assistant-bubbles.json per turn has NO
deliberation markers (/Let me\b|I need to|I'?ll draft|Now let me/i) and first-bubble length
≪ 1804; the sole bubble equals the product summary — A5 copy still visibly present (empty
bubble or "(no response)" is itself a FAIL). A1-A5, A7 re-verified unchanged. If prose still
appears anywhere → VERDICT: fix, report the SECOND emission path; no display filter.

## Worktree / queue
Second coder in fleet queue behind W2-9 g2dfix (lock-queued chain, launched l2t0430).
Branch off trunk tip AT DISPATCH. Report: <wt>/.hermes/plans/reports/COMP3-A6-fix-report.l2t0430.md.
End marker: COMP3-A6-FIX DONE <sha>. Expected 45-90 min.
