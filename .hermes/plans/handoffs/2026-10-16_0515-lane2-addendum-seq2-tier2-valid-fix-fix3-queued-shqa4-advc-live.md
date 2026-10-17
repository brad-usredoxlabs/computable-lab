# ADDENDUM l2t0445b — lane 2 — 2026-10-16T05:15 EDT (same tick, post-handoff events)
# Supersedes the 'workers live' + queue sections of 2026-10-16_0455 handoff. Trunk tip now
# 23dc26a1 (docs; code tip 27ef008f unchanged — nothing merged this tick).

1. SH-QA-4 CODER DONE (exited 04:49:15, code=0, marker 'SH-QA-4 DONE 287189fd', ran only
   ~34 min on lock). Branch cl/SH-QA-4-lane2-l2t0250 (base 95f73755): RED 26017219,
   GREEN af5e9936 (merge rev, 5 files +119/-36), docs 36ca0c2e/287189fd. Report at
   .hermes/plans/SH-QA-4-report.wip-l2t0250.md. Claims + caveats annotated in the task block.
2. ADVC C1 LIVE (OpenRouter deepseek-v4.1-flash): bash 2979968
   (proc_3cbec4d45e8a), log logs/advc-SHQA4-c1-l2t0455.log, report path
   .hermes/plans/reviews/advc-SHQA4-c1-l2t0455.md. Mandate attacks coder claims 1-6 incl.
   independent baseline re-run (the lane-exclude symlink detour inflated fresh-worktree
   baselines to 27/26 — reviewer must reproduce 23/1 at base and confirm the repair is
   harness-only). ~45-60 min expected; 2x ~06:15.
3. SEQ-2 TIER-2 GATE EXITED EARLY WITH A VALID GATE (~25 min): receipts
   receipts/HARNESS-SEQ-2/2026-10-16_0445-regate-tier2/ — integrity audit PASSED all 5
   checks FIRST-HAND: 8 distinct-md5 shots (+ honest relocation of 5 byte-identical
   pre-captures with explanation), trail.json full (network, shaPair, raw [agent] lines),
   every cited [agent id] (zyyrls, 1ta7ju, mgcnh6, dh649w, 6cx0oa, 720rmx) matched to
   backend.log lines I grepped myself (zero-toolCall runs vs agent_intent-emitting runs
   corroborate both defects exactly as framed). VERDICT: fix. C1 PASS, C4 per ruling,
   C2-negative D1 HIGH (model emits no frame -> client selectableKinds gate has nothing to
   refuse -> generic text instead of named refusal), C3 D2 MED first-attempt flake.
4. FIX3 QUEUED on fleet lock per queue rule (same-branch lineage impossible: prior SEQ-2
   worktrees pruned by admin watch-item; new worktree
   wt/HARNESS-SEQ-2-fix3-lane2-l2t0510 off trunk tip). bash 3034691 (proc_9c7bce54c82c),
   log logs/coder-HARNESSSEQ2-fix3-l2t0510.log, prompt
   prompts/coder-HARNESSSEQ2-fix3-l2t0510.txt. Repair shape (orch-authored from gate
   evidence, DATA-first per CL principles): deterministic pre-model/zero-toolcall named-
   refusal guard reading the registry selectableKinds data (registry-swap pin proves
   data-drivenness), one bounded forced-tool retry, honest failure naming. stop_boundary:
   if determinism is impossible without a tool-loop architecture change ->
   'HARNESS-SEQ-2-FIX3 BLOCKED <diagnosis>' -> architect.
5. FLEET QUEUE STATE (flock-arbitrated, cap=1 live coder): lock HELD by lane-1
   queue-qms7-3.sh hermes (pid 2971970, since ~04:26); lane-2 SH-QA-3 fix-c2 chain
   (bash 2865664, flock 2865727) and SEQ2FIX3 chain (bash 3034691) QUEUED behind. Order is
   flock's; all single-slot safe. SH-QC-1 composer (bash 2743020) still live, ~95 min at
   05:12 — inside 2x (~06:15), watch forward motion next tick (rule 7b: 3x ~06:55 ->
   orch writes provisional spec from evidence if it stalls).

QUEUE / NEXT TICK (priority):
(1) SH-QA-4 advc c1 exit -> read reviews/advc-SHQA4-c1-l2t0455.md. ACCEPT -> orch
    self-verify FIRST-HAND: full app suite fail-file comm base 95f73755 vs 287189fd (the
    coder deferred this merge-time step per spec), targeted vitest re-run, app tsc sorted-diff,
    server tsc byte-identical (md5 745876ef...), diff file-list subset check (5 files, no
    YAML, no untouchables), grep material-name literals -> merge --no-ff -> no restart if
    YAML-free -> fold WellTooltip spot-check into next deck gate -> mark SH-QA-4 done +
    clear AS-LANE2-SHQA4-QUEUED / AS-LANE2-SHQA4-DOCS-TIP-BASE. FIX -> defect list to fix
    run on same worktree/branch (max 2 cycles -> architect).
(2) SH-QA-3 fix-c2 coder (will get the lock; marker 'SHQA3FIX2 DONE <sha>' in
    logs/coder-SHQA3-fix2-l2t0335.log) -> advc c2 (fresh probes D1-D4 + bar-independence) ->
    accept -> self-verify -> merge -> STACK RESTART MANDATORY (config/drafting YAML) ->
    mode-2 as-served replay.
(3) SEQ2FIX3 coder (behind fix-c2) -> on DONE -> advc c1 (mandate: registry-swap pin
    realness, no-hardcoded-kinds grep, retry boundedness in logs, stop_boundary honesty) ->
    accept -> self-verify -> merge -> RESTART if YAML -> tier-2 gate re-shoot at FIXED rev
    (reuse the 04:45 tier-2 prompt shape + artifact-ordering mandate).
(4) SH-QC-1 composer exit -> review draft, rule OQs, promote canonical, link in task block;
    its coder sequences AFTER SH-QA-4 merges (eventGraph.ts collision).
(5) AI-13 recount each tick (base 278).
(6) FOLLOW-UP F1 (non-blocking): app transport union 3-armed agent_action type-mirror lag.
(7) BRAD-PENDING (recorded, never re-asked unattended): D1 run-page-Accept-422 / D2
    clarification loop / D3 path-fork routing; W2-11 naming-stability; THREAD mint-floor OQ;
    PROTO-AI-11/12 §2 + BACKLOG unchanged.

LESSON (already candidate for skill update): the ARTIFACT ORDERING MANDATE in the tier-2
prompt (script -> run -> screenshots first -> trail with raw backend.log lines -> REPORT
LAST) is what made this gate valid where two tier-1 runs fabricated. Carry it verbatim into
EVERY future gate prompt.

assumptions (delta to the 0455 handoff; all carried entries from that handoff stay open):
- RESOLVED-PARTIAL: AS-LANE2-SEQ2-TIER1-FABRICATION-2X — the tier-2 re-shot SUCCEEDED with
  valid receipts; the debt TRANSFERS to AS-LANE2-SEQ2-MERGED-GATE-PENDING (gate must render
  accept at the FIXED rev). Ledger entry closed here, successor stands.
- ADDED: AS-LANE2-SEQ2-FIX3-REPAIR-SHAPE (debt TRUE — the deterministic pre-model
  named-refusal guard + bounded forced-tool retry is the ORCH's chosen repair shape from the
  gate's shared-mechanism framing, not a sourced design; D1's refusal semantics must be
  registry-data-driven and advc+gate will prove it; clears at advc accept + valid gate
  accept at fixed rev; cleanup if the coder returns BLOCKED: architect decision on the
  tool-loop).
- ADDED: AS-LANE2-SHQA4-SYMLINK-DETOUR (debt TRUE — coder repaired ~60 missing lane-exclude
  symlinks in its fresh worktree to reach authoritative 23/1 baselines; must be confirmed
  harness-only by advc c1 and by my self-verify diff-list check; if any config/ignore file
  rides in the merge, that is a defect not an assumption).

workers live at checkpoint:
- SH-QA-4 advc c1: bash 2979968 (OpenRouter cloud; no local slot).
- Lane-1 queue-qms7-3.sh coder on fleet lock (pid 2971970; not mine, flock observes).
- SH-QA-3 fix-c2 chain: bash 2865664 QUEUED. SEQ2FIX3 chain: bash 3034691 QUEUED.
- SH-QC-1 composer: bash 2743020 live, draft not yet on disk at 05:12.
- Fleet lock: HELD (lane-1). DO NOT dispatch any coder directly.

next checks: (1) logs/advc-SHQA4-c1-l2t0455.log EXITED + review report VERDICT; (2)
logs/coder-SHQA3-fix2-l2t0335.log lock-acquired/DONE; (3) logs/coder-HARNESSSEQ2-fix3-l2t0510.log
lock-acquired/DONE/BLOCKED; (4) composer 'SH-QC-1 DRAFT DONE' + forward motion if >2x;
(5) AI-13 recount (base 278); (6) trunk tip + stack status.
