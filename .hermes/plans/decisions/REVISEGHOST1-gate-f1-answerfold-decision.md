# REVISE-GHOST-1 gate F1 — architect decision request (orchestrator l2t1855, OPEN)

Question: the browser gate attempt 4 rendered VERDICT: fix with F1 (the positive
revise-remount leg) UNREACHABLE — not failing, unreachable. The blocker is on the
answer/submit leg that PREDATES this item's diff. Decide: (a) does the F1 gate wait on a
fix to the answer-fold non-convergence class (and if so, under which item — REVISE-GHOST-1
as in-scope repair, or a new item requiring Brad); (b) is F2's sub-assert ("chat input
still exists after the failure") satisfied by the visible cards + Cancel affordance, or
must the input literally remain enabled during a legit hold.

## Evidence (orchestrator first-hand)
- Gate report: /home/brad/.hermes/cl/receipts/REVISE-GHOST-1/2026-10-22_1150-c4-tier2/report.md
  (trail.json + shots/). F2 PASS on its head criterion (cards visible, honest wall absent);
  F2 sub-assert FAIL literally (input replaced by "Answer the questions above to continue."
  + Cancel). F1 FAIL-unreachable: canonical 5-card hold never folds; every 5/5 submit logs
  'shorthand answers have no 1:1 mapping onto the held intent' and re-extracts a fresh
  5-card set; chat input stays disabled -> revise prompt can never be sent.
- Backend corroboration: .run/backend.log agents xvedl6/t96n1s/7vnfaf/ltv4yv — every answer
  turn logs the fold-null fallback BEFORE any model call (AgentOrchestrator.ts:1421), then a
  full extraction re-ask; 4+ rounds, never converges. historyLen rises, cards reset.
- The fold machinery (foldAnswersIntoShorthand, server/src/ai/shorthandChat.ts:578-670;
  content-keyed join factRequestId(fact) <- answer.requestId) predates 66cb7915: introduced
  by cfdfc2e9 + SH-QA-1. REVISE-GHOST-1's diff is additive reuse-bindings on the fold-SUCCESS
  path only — so the item's own fix is untested-because-unreachable, not proven absent.
- Related prior ruling: decisions/W28-A5m-answer-loop-stagnant-labware-class-decision.md
  (STAGNANT-HEDGE class, MODEL-side label divergence on the compile-from-prompt label-key
  join) — DIFFERENT join (that one is the resolveNounsPass slot-value join; this failure is
  the chat fold's requestId/content-key join returning null outright). Sibling sub-class
  worth checking: the UI keys resolvedClarificationsRef by refId ?? requestId
  (AiTabPanel.tsx:1135-1147) and re-sends `all` accumulated answers on every submit —
  stale/accumulated answers could themselves be part of the non-convergence.
- Scout screening (NOT authority): fold returns null iff (a) requestId matches no held fact
  (content-key or legacy digits), (b) label empty, (c) fact lacks actionLocation,
  (d) slot not a string, (e) re-parse Ajv-invalid. Orch verified the code paths directly at
  trunk. Which null arm fires for the canonical utterance's 5 cards is UNMEASURED — the
  server never logs which arm. A one-line diagnostic (log requestId + which arm on null)
  would settle it; that is a lane-repair step, flagged here, not done.

## Constraints
- Do not weaken the gate criterion. Do not gut :3728's intentional hold.
- Fleet coder is serial; MIXFRAC-1 fix-run is already queued ahead of any new coder work.
- If the answer says "new item", it is Brad-gated per campaign rules; say so plainly.
DECISION: <architect writes>
