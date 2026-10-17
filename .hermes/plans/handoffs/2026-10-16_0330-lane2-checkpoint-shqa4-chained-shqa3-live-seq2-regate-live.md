# HANDOFF l2t0250 — lane 2 — 2026-10-16T03:30 EDT
# Trunk cl/integration-2 tip: 58e0f3c0 docs tip; code tip 27ef008f (no code merged this tick).
# Stack :3093/:5193 200. AI profile qwen3.8-thunderbeast (live-API truth; do not repair the
# trunk config.yaml line — carried observation).

COMPLETED THIS TICK (l2t0250):
1. SH-QA-4 SPEC REVIEWED + PROMOTED + CLAIMED + CODER-CHAINED. Composer finished its draft
   (~02:52; 25059 B, DONE marker). Orch verified load-bearing cites FIRST-HAND at tip 27ef008f
   (eventGraph.ts :309/:311-314/:325/:342/:428/:447/:459/:469-476, WellTooltip.tsx
   :61/:85/:87/:88, simpleVerbs.ts :385, sibling sites :104/:284/:266 — all hold; app tsc=23
   re-measured = composer's count). OQ1 RULED: fold in the three sibling render sites (same
   projection, same fabricated field; inconsistency across surfaces is its own defect class;
   they join test coverage per the draft's clause). OQ2 RULED: tally.md + re-verified task-block
   map = deep-dive provenance. OQ3 RULED: count-only when density absent. Promoted canonical
   .hermes/plans/2026-10-16_0300-SH-QA-4-tooltip-volume-spec.md (rulings appended; draft kept).
   Coder chain scripts/coder-chain-SHQA4-l2t0250.sh (bash pid 2678071, log
   logs/coder-SHQA4-l2t0250.log, prompt prompts/coder-SHQA4-l2t0250.txt): ORDER = waits for the
   SH-QA-3 resume chain (pid 2419057) to exit, THEN flock -w 21600 — fleet cap honored (never
   more than 1 live coder). Lean-context + incremental-report mandates carried into the prompt
   (the SH-QA-3 death mode guard). Worktree wt/SH-QA-4-lane2-l2t0250 off trunk at coder START.
2. SH-QA-3 RESUME CODER IS LIVE: acquired the fleet lock 03:03:24 (lane-1 QMS7-1 exited ~03:03;
   QMS7-2 exited earlier). Resume run from wt/SH-QA-3-lane2-l2t2250 atop preserved 39ec85e8.
   Watch logs/coder-SHQA3-resume-l2t0145.log for "SH-QA-3 DONE <sha>" / "EXITED code=".
3. SEQ-2 RE-GATE DISPATCHED (AS-LANE2-SEQ2-MERGED-GATE-PENDING browser leg, priority (3) from
   last handoff): tier-1 cl-browser-reviewer, bash pid 2673865 / hermes child 2673927, log
   logs/review-HARNESSSEQ2-regate-l2t0250.log, receipts HARNESS-SEQ-2/2026-10-16_0305-regate-
   tier1/, candidate 27ef008f ancestry-checked in-trunk by orch before dispatch. Hygiene clauses
   folded (no-history, in-dir receipts, md5s mandated, screenshots-for-negatives). Expected
   ~30-45 min; rule 7b: 2x ~04:05, 3x ~04:50 -> rule 6c ladder (tier-2 OpenRouter if dead/hung
   — NO blind tier-1 retry). C3 leg: do NOT click Accept (known pre-existing D1 422 — pinned as
   D1 repro, not a SEQ-2 regression).
4. AI-13 recount n=269/500 (unchanged since l2t0145 — no gate traffic yet; this tick's gate run
   will accrue).

QUEUE / NEXT TICK (priority):
(1) SH-QA-3 resume exit -> adversarial c1 (unique reviews/advc-SHQA3-c1-l2t<next>.md;
    e2eStubHonesty re-pin is ORCHESTRATOR-RULED per OQ3 — judge disclosure quality;
    distrust-check the adoption: re-run bars fresh on merged tip; verify 39ec85e8 preservation
    wasn't fabricated). ACCEPT -> orch self-verify (diffs, targeted suites, tsc set-diff,
    MANIFEST fbf743ab / cues 8ab1eb70 hashes, scope grep, mode-2 10-run replay vs :3093) ->
    merge --no-ff -> STACK RESTART MANDATORY (config/drafting/shorthand-drafting.yaml YAML in
    scope) -> re-run mode-2 replay after restart. SERVER-only item: no own browser gate; fold a
    prose-blob-card absence check into the next deck-surface gate.
(2) SH-QA-4 coder (auto-starts after (1)'s chain exits + lock): poll
    logs/coder-SHQA4-l2t0250.log. On DONE -> advc c1 -> self-verify (fail-file comm, app tsc
    sorted-diff empty vs branch-point, server tsc byte-identical, OQ1 sibling sites covered) ->
    merge -> fold tooltip spot-check into next deck gate.
(3) SEQ-2 re-gate verdict when it lands: accept -> close AS-LANE2-SEQ2-MERGED-GATE-PENDING
    browser leg + mark HARNESS-SEQ-2 done; fix -> defect list to owning coder; dead/hung ->
    rule 6c tier-2 (prompt template prompts/review-HARNESSSEQ2-regate-l2t0250-tier1.txt is
    tier-2-ready; receipts dir gets a new -tier2 suffix).
(4) AI-13 recount each tick (base 269).
(5) SH-QC-1 (todo, deps none, ready) — next spec-composition candidate; its browser e2e leg
    overlaps SH-QA-4's fold-gate; consider composer dispatch once the queue thins. Also its
    first debug step is capturing the SECOND cycle's terminalArtifacts (diagnostic, no code).
(6) FOLLOW-UP F1 (non-blocking): app transport union 3-armed agent_action type-mirror lag.
(7) BRAD-PENDING (recorded, never re-asked unattended): D1 run-page-Accept-422 / D2
    clarification loop / D3 path-fork routing to next-wave intake; W2-11 naming-stability;
    THREAD mint-floor OQ; PROTO-AI-11/12 §2 + BACKLOG unchanged.

assumptions:
- ADDED: AS-LANE2-SHQA4-QUEUED (debt TRUE — clears at advc accept + self-verify + merge +
  folded browser spot-check).
- CARRIED OPEN: AS-LANE2-RUNPAGE-ACCEPT-422 (debt TRUE), AS-LANE2-SHQA3-RESUME-ADOPTION
  (debt TRUE — clears at advc accept + self-verify + merge + mode-2 replay; coder LIVE now),
  AS-LANE2-SEQ2-MERGED-GATE-PENDING (browser leg IN FLIGHT this tick),
  AS-LANE2-GATE-RECEIPTS-HYGIENE (clauses now baked into the tier-1 template),
  AS-LANE2-FLEET-LOCK-WRAP-DEFECT (sweep pending), AS-LANE2-SEQ2-DEFECT3-CANLEAVE-RULING,
  AS-LANE2-PROFILE-DRIFT-REPAIR (live API = qwen3.8-thunderbeast; don't repair the file),
  AS-LANE2-SEQ2-GATE-TIER2-SELECTOR-RULING, AS-LANE2-SHQA2-OQ-RULINGS,
  AS-LANE2-SHQA3-OQ-RULINGS, W29-G2E-D1-ENUMERATION-TRIPWIRE,
  COMP3-A6-F1-INSTANCE-KEYING-LATENT, COMP4-WIRE-COMPOSITION-GLOBAL,
  GATE-R2-NO-MIDFLIGHT-STATUS-CAPTURE, W211-GATE14-STALL-CLAUSE-EARNED [BRAD],
  THREAD-MINT-SURFACE-GAP [BRAD OQ], AS-LANE2-SEQ1-PANE-HOME-AGENT-DIR,
  AS-LANE2-SEQ1-WORKTREE-BASE-DOCS-TIP, AS-LANE2-G2DFIX5-C5-TRIPWIRE-STANDING,
  AS-LANE2-GATER2-RESTART-WINDOW-ARTIFACT, AS-LANE2-SEQ2-WORKTREE-ADMIN-PRUNED (watch),
  fleet-lock pid-file convention (ADVISORY — cross-lane overwrites harmless under flock).

workers live at checkpoint:
- SH-QA-3 RESUME coder: LIVE on appliance-2 (fleet lock holder since 03:03; chain pid 2419057,
  hermes run inside flock). DO NOT launch any other coder. DO NOT re-dispatch.
- SH-QA-4 coder chain: bash pid 2678071 QUEUED (waits for SH-QA-3 chain exit, then lock).
  DO NOT re-dispatch while alive.
- SEQ-2 re-gate reviewer: bash pid 2673865 (tier-1), started 03:20.
- Fleet lock: HELD by SH-QA-3 resume.

next checks (cheap gate): (1) logs/coder-SHQA3-resume-l2t0145.log — DONE/EXITED marker;
(2) logs/review-HARNESSSEQ2-regate-l2t0250.log + receipts dir trail.json/REPORT.md verdict;
(3) logs/coder-SHQA4-l2t0250.log — chain progress (predecessor-gone / lock acquired);
(4) AI-13 recount (wc -l /home/brad/.computable-lab-lane2/shadow-router/events.jsonl, base 269);
(5) trunk tip + stack :3093/:5193 status.
