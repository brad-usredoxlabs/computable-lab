# HANDOFF ADDENDUM - lane 2 - 2026-10-11T00:55 EDT (orch l2t0030, same tick)

The 00:45 handoff is superseded on the gate section by what actually landed ~40 min later:
both gate legs returned REAL receipts with VERDICT: fix, each with a genuine, root-caused
precondition discovery. Nothing fabricated; every claim below is my first-hand read.

## Combined gate (bash 1840363 -> hermes 1840418, exited ~00:49) — ADOPTED as real receipts
### LEG 1 W2-8 A5 (receipts W2-8-SAID-MEANT-SURFACE/2026-10-11_0040-a5/, VERDICT: fix)
- 6 distinct shots + trail (16 steps, consoleErrors []). My prompt's URL form was WRONG:
  /deck/:eventGraphId/:runId? is a PATH param (DeckHostPage.tsx:40 reads useParams, not
  search params) — reviewer self-corrected to /deck/EVG-a5-fixture-method/RUN-2026-09-19-run-vwr8.
- ROOT CAUSE (reviewer-cited, orchestrator-verified in source): the thread's
  sourceProtocolId = universalProtocolId ?? availableProtocols[0]; universalProtocolId is set
  only when extractUniversalProtocolSetup(env) passes, which requires declared abstract roles
  (ProtocolTabPanel.tsx:302-333 — returns null when roles lists are all empty). The promoted
  CAN carried roles: {} (the XDR draft had none). -> fixture precondition gap, not code.
- ORCH FIX 00:47: PUT declared roles onto CAN-protocol-1791692042751
  (labwareRoles microcentrifuge-tube + materialRoles lysis-reagent, description-bearing) —
  success verified by GET (axes still present). Product-defect candidate recorded separately
  (realization entry depends on declared roles to even SEE a universal protocol; availableProtocols[0]
  is arbitrary — cheap-fix item candidate).
### LEG 2 W2-9 criterion 2 (receipts W2-9-REVIEW-AI-PANEL/2026-10-11_0040-g2/, VERDICT: fix)
- 6 distinct md5s, FULL assistant text in trail (not booleans), zero-write before/after pastes.
  The five negatives DID all fail visibly with zero writes — but NOT-RUN as the criterion's
  test: the panel had NO open draft (permanent, not D1 race) because MY A5 seeding flipped
  XDR-w28-gate0001 to status promoted, and findSemanticDraft skips promoted drafts
  (semanticDraft.ts:70). Fixture collision of my own doing; reviewer named it precisely and
  seeded nothing.
- ORCH FIX 00:53: created XDR-w29-gate-panel01 (clone of the draft body, status pending_review,
  same source_artifact VPDF-5256F3288E3C) via POST /records — verified pending_review.
  Panel discovery should ground again (if discovery picks a specific one among duplicates, next
  leg's trail will show it).
- TWO REAL W2-9 PRODUCT DEFECTS found (fix runs needed, fleet coder free):
  D-SCROLL [medium] .review-ai__log overflow:hidden + MessageLog scrollTo on non-scrolling
  .message-log (reviewAiPanel.css:31-35, MessageLog.tsx:109-120) -> replies clipped, newest
  unreachable; ALSO explains the prior gate's dup-md5 mystery (identical visible state).
  D-CoT [low-med] assistant bubbles render raw chain-of-thought before the answer
  (MessageLog.tsx:151 renders m.text verbatim) — likely streaming-channel merge; product chat,
  touches EVERY chat surface, not just this panel. Route the fix via W2-9-owned files where
  possible; CoT channel is server-side (ai stream) — scope question for the fix brief, keep
  smallest-justified.

## NEXT TICK (ordered)
1. RE-SHOT both legs in ONE combined reviewer dispatch, NEW receipts dirs
   (2026-10-11_01xx-a5b/ and ...-g2b/): A5 via /deck/EVG-a5-fixture-method/RUN-2026-09-19-run-vwr8
   (roles now declared; expect details OPEN + 'Which lysis method?' -> answer bead-beater ->
   accept -> LPR branch_resolution paste); G2b first GET /api/records/XDR-w29-gate-panel01 to
   confirm discovery grounds the panel (noDraftArm absent) before sends; MANDATE: scroll fix is
   NOT in the product yet, so force wrap overflow in-harness like this reviewer did, and keep
   the full-reply-text trail requirement. 3rd shot per criterion — root cause NEW each time,
   improvement per attempt is real; if the SAME root cause repeats, change approach (orch-run
   deterministic playwright + artifact judging per 6b/6c).
2. SHORTHAND-CHAT adv c1 STILL LIVE: hermes 1847813 (bash wrapper 1847747 died early but the
   python child 1847813 is ALIVE and working, log buffered to 117 B — the buffering pitfall;
   judge by reviews/SHORTHAND-CHAT-advc1-l2t0030.md appearance + state.db, not the log). On
   verdict: fix -> coder fix run (fleet lock free); accept -> orch battery (diff 16985fbf...HEAD,
   tsc 19/34, fail-sets 11/35, MANIFEST 58c447eb) -> merge -> browser gate.
3. W2-9 defect fix run (D-SCROLL, maybe D-CoT) — dispatch on cl-coder AFTER SHORTHAND-CHAT
   lands (fleet single). Same worktree branch wt/PROTO... no: NEW worktree off trunk tip for
   W2-9 fixes (branch W2-9-fix1-lane2-l2t<token>).
4. W2-10 scoped re-dispatch (cl-worker, computable free): rep cap ~4, incremental report,
   brief from 00:45 handoff §4.
5. SHORTHAND-CORPUS draft pre-review + OQ rulings + promotion when coder queue position is clear.

## assumptions (delta from 00:45 handoff):
NEW: AS-LANE2-DECK-RUNID-PATH-PARAM (route form /deck/<evg>/<runId> — prompt authors must use
  path form; standing for gate prompt writing),
  AS-LANE2-A5-FIXTURE-NEEDED-DECLARED-ROLES (roles PUT onto CAN-protocol-1791692042751 verified
  by GET; product-defect candidate 'realization entry blind to universal protocol without
  declared roles' recorded, debt FALSE),
  AS-LANE2-W29-G2-PANEL-COLLISION-XDR-PROMOTED (my A5 promote flipped the W2-9 panel's draft;
  XDR-w29-gate-panel01 clone seeded pending_review — panel grounding proof rides the g2b leg;
  debt TRUE until g2b),
  AS-LANE2-W29-DEFECT-LOGSCROLL (medium product defect, evidence receipts 0040-g2 defect 1 +
  code cites; fix run owed before W2-9 done),
  AS-LANE2-W29-DEFECT-COT-LEAK (low-med, cross-surface; scope decision in fix brief; debt TRUE
  until dispositioned),
  AS-LANE2-W29-PRIORGATE-DUPMD5-EXPLAINED (the logscroll defect is the confirmed root cause of
  the prior dup-md5 forensics — forensics stand, mechanism now known).
OPEN EVIDENCE-DEBT unchanged + the above W29-G2-COLLISION.
