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
## Architect verification (first-hand at trunk 24997f1b, 2026-10-22)

All load-bearing cites re-confirmed in the product tree (git via -c core.fileMode=false):
- AgentOrchestrator.ts:1421 — the "no 1:1 mapping" line sits in the fold branch
  (:1341 takeHeldShorthandIntent -> :1342 foldAnswersIntoShorthand; the else-arm
  at :1418-1422 re-holds `held` verbatim and falls to the extraction re-ask at
  :1834-1839). The refusal fires before any model call, as reported.
- shorthandChat.ts:502-514 — factRequestId is the sha1 content-key
  [actionIndex, action, argument, reason, label]; :578-665 the fold; the null
  arms are exactly the scout's five (join-miss incl. legacy-digit fallback,
  empty label, missing actionLocation, non-string slot value, Ajv-invalid
  re-parse). `if (answered.size === 0) return null` at :633 is a sixth exit.
- resolutionEngine.ts:155-162 and :439-452 — every ENGINE clarification always
  carries actionLocation (clarificationFor spreads req.actionLocation; the
  request factory constructs it unconditionally). The canonical run's 5 cards
  are all engine facts (diag3.json: unknown-noun labware + 4x ambiguous-noun
  material), so arms (b)/(c) are excluded for round 1 by construction; the
  round-1 null is one of (a) join-miss, (d) non-string slot, (e) Ajv re-parse.
  Which one is genuinely UNMEASURED — the server never logs the arm.
- AiTabPanel.tsx:1135-1147 — the sibling hazard is real: resolvedClarificationsRef
  keys `refId ?? requestId` and re-sends `all` accumulated answers; the ref is
  cleared on fresh-send (:1101), cancel (:1158), accept/reject (:1326/:1361)
  but NEVER when a new held card-set arrives after a failed fold. With the
  degenerate identical-row candidate lists (diag3.json: all 4 material cards
  carry the same 12 rows), refId-keying can additionally COLLAPSE distinct
  cards' answers onto one map key. Whether this poisons rounds >=2 is also
  unmeasured — backend.log shows clarificationAnswers=5 every round, which the
  accumulation theory does not straightforwardly predict; measure, don't assume.
- AiTabPanel.tsx:1538 — "Answer the questions above to continue." is the
  intentional hold string (the :3759 legacy hold is present at trunk, per the
  merge note). W28-A5m confirmed a DIFFERENT join (resolveNounsPass label-key
  vs this requestId/content-key fold join) — not the same class.

## DECISION

(a) F1 — the gate WAITS on the answer-fold fix, and it is NOT a REVISE-GHOST-1
    in-scope repair. Options considered: (i) fold the repair into REVISE-GHOST-1
    as in-scope; (ii) new item; (iii) re-shape REVISE-GHOST-1's gate to dodge the
    fold leg. RULING: (ii), and (iii) is rejected — dodging would mean re-testing
    the revise leg by manufacturing a pre-folded state, which proves nothing about
    the scientist-facing flow §4C describes.
    Why not (i): the blocker lives in the fold machinery introduced by cfdfc2e9
    and re-keyed by SH-QA-1 — verified by me as ancestors of the item's base,
    different subsystem, different join. REVISE-GHOST-1's merged diff (:303d
    additive reuse-bindings on the fold-SUCCESS path, 0 removed lines) contains
    nothing to fix; ruling the pre-existing fold-null "in scope" would relitigate
    approved scope and park an advc-accepted, merged item behind an unrelated
    defect class.
    Item routing — this is a NEW item, so per campaign rules it is BRAD-GATED:
    PROVISIONAL-until-Brad. Proposed block (do NOT enqueue until Brad approves):
      id: ANSWER-FOLD-NULL-1
      title: "Chat answer-fold returns null on the canonical 5-card hold — instrument, root-cause, converge (FOLD-NULL class)"
      status: todo (PROVISIONAL — unapproved block, never claim)
      description: >
        Leg 1 (server, additive-only): at the fold-null else-arm
        (AgentOrchestrator.ts:1418-1422) log, per answer, the requestId and
        which of the five shorthandChat.ts null arms fired (thread the arm out
        of foldAnswersIntoShorthand or re-derive it in the caller — smallest
        change), plus the answer-count vs held-fact-count. Leg 2: replay the
        canonical utterance against :3093, read the arm, and fix the named root
        cause with a RED test shaped on the canonical 5-card set (50/50
        Trypsin-EDTA/DMEM + 10% FBS, 200 HepG2 cells/uL, A1:A3). If leg 2's
        evidence names the UI accumulation (AiTabPanel.tsx:1135-1147 re-sending
        stale `all` / refId-collision, ref never cleared on a new held card-set)
        as cause or aggravator, the item gains an explicit second bounded
        app/ leg — and the orchestrator MUST serialize it against the AiTabPanel
        hot-file cluster (SH-QA serialization rule).
      why: F1 of REVISE-GHOST-1's gate is unreachable until the fold converges;
        the class blocks every scientist answer turn on the shorthand surface,
        not just this gate. Reuses the existing fold branch, the SH-QA-1 content
        join, and the W28-A5m decision's probe idiom (/tmp/w28a5m-probe.py is
        write-free). Distinct from STAGNANT-HEDGE (different join) — do not
        route there.
      verified by: (1) the new arm-log line appears in .run/backend.log on a
        fresh canonical-run answer submit; (2) the canonical utterance, answered
        5/5, reaches `shorthand answer folded deterministically ... no model
        call` with events>0 (the sstv0t->yiyirv converging shape already in
        backend.log proves this outcome is reachable); (3) a server test locks
        the RED->GREEN; (4) no app/ edits unless leg 2 named them.
    Queue: FIFO behind MIXFRAC-1's fix run (fleet coder serial; no violation).
    REVISE-GHOST-1 disposition: STATUS stays in-progress, gate obligation stays
    OPEN (rule 6b), its own fix neither proven absent nor proven present —
    untested-because-unreachable stands as recorded. NO new gate attempt until
    ANSWER-FOLD-NULL-1 merges; a tier re-shot today only re-hits the same wall.
    On merge, attempt 5 re-runs spec §4C whole (F1 + F2), store-warm first per
    the report's reproduce block.
(b) F2 sub-assert — SATISFIED by the cards + Cancel, with the assertion
    amended, not the product. The sub-assert "chat input still exists" was
    written as a proxy for "pane not dead-ended". During a legitimate question
    hold the input replacement IS the designed contract: the pane shows the
    reason, the questions, and a Cancel escape (AiTabPanel.tsx:1538 + Cancel),
    and the constraints forbid gutting the :3728/:3759 intentional hold —
    demanding a live input during a live hold would contradict it head-on.
    RULING: F2 is adjudicated PASS on both head criterion and the not-dead-ended
    intent. Gate-harness assertion form going forward: during a live question
    hold assert Cancel affordance + reason text (NOT chat-input presence); the
    literal chat-input-must-exist assertion applies to FAILURE states — the
    honest-failure-wall leg, which is REVISE-GHOST-1's own deliverable — where
    no questions are outstanding. This changes the acceptance form only; the
    head criterion is untouched.
(c) Scope discipline: the degenerate-clarification-candidate-lists observation
    (identical aggregate-formulation rows x12, no per-component candidates) is
    real and visible in diag3.json, but it belongs adjacent to MATRES-PANEL's
    clarification-fact shape and MIXFRAC-1's ambiguous-attachment leg — it is
    recorded, NOT folded into ANSWER-FOLD-NULL-1. It does not by itself explain
    the round-1 fold-null (round 1 answers were fresh, all five answered).
(d) Nothing here weakens the gate criterion, touches :3728/:3759, or requires
    a stack restart. Next actor: orchestrator files the ANSWER-FOLD-NULL-1
    block for Brad; work that may continue meanwhile is unchanged (MIXFRAC-1
    fix-run keeps the FIFO head).
