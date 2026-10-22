# LANE 2 HANDOFF — l2t0710 (2026-10-22T08:10 EDT) — MIXFRAC-1 RESUME-3 QUEUED (run-2 kill attributed to a machine-wide sweep; its steps 1-2 are COMMITTED); BRAD-TREE REINSTALL IS DOWNING BOTH LANE STACKS; GATE ATTEMPT 3 MUST BE TIER-2 AFTER STACKS RETURN

Trunk tip: 45e1dad9 (code tip 66cb7915 = REVISE-GHOST-1 merge; newer commits docs-only).
Stack: DOWN at checkpoint — collateral of Brad's live-tree operation (see 3). Retry4 unit
`cl-l2-stackretry4-0808` auto-restarts lane 2 ~08:12.

## RECONCILE (first-hand)
- MIXFRAC-1: RESUME RUN 2 (l2t0640) is DEAD (log: EXITED code=137 at 06:48:41). Kill
  attribution CHANGED from last handoff: the same 06:48-06:54 window also SIGKILLed
  hermes-gateway-orchestrator + hermes-gateway-architect-q38 (systemd `status=9/KILL`),
  Brad's main stack :3001/:5174 and worktree stack :3091/:5191 went DOWN, chromium ABRT'd,
  and `Killed` lines hit our queue bash directly. journalctl -k shows NO kernel OOM;
  systemd-oomd logged NO kills; no lane-1/lane-2 script contains any kill of these pids.
  Conclusion (inferred, recorded as assumption): an external machine-wide teardown sweep,
  not fleet-lock contention — so a queue re-dispatch is the right recovery, not an
  infrastructure escalation (yet). IMPORTANT: run 2 completed mandate steps 1-2 BEFORE
  dying: WIP committed 3c558b9a, trunk 0dd4c513 merged as 32a9d103 on
  cl/lane2-mixfrac1-l2t0310 (worktree wt/MIXFRAC-1-lane2-l2t0310). Nothing lost.
- Gate attempt 2 (REVISE-GHOST-1): DEAD — code=137 at 06:54:08 in the same sweep, NO
  trail, only harness.mjs in receipts/REVISE-GHOST-1/2026-10-22_0640-c2/. Per rule 6c
  (dead, no trail) attempt 3 goes TIER-2: `hermes -p cl-browser-reviewer -m
  deepseek/deepseek-v4.1-flash --provider openrouter` with the corrected c2 prompt
  (prompts/review-REVISEGHOST1-gate-l2t0640-c2.txt) + a NEW receipts dir. NOT dispatched
  this tick because the stack is down (see below); dispatch is gated on :5193=200 +
  :3093 /api/health=200 + served-rev re-verify (candidate 66cb7915 in trunk 45e1dad9).
- Fleet lock: held by lane-1 INSTR-COLLAPSE-1 since 07:46:16 (legitimate acquisition).
  OUR resume-3 queue is FIFO second on the flock. No live cl-coder of ours.

## WORK THIS TICK
1. Recovery of MIXFRAC-1 RESUME RUN 3: prompt
   lanes/2/prompts/coder-MIXFRAC1-resume3-l2t0715.txt (new run-3 header; work-order items
   1-2 rewritten as verify-only; env note about transient module flakes during Brad's
   reinstall; report path UNCHANGED .hermes/plans/MIXFRAC-1-report.wip-l2t0310.md, run-3
   identity required in the resume note). Queued via queue-mixfrac1-resume3-l2t0715.sh,
   unit cl-l2-mixfrac1resume3-0715 (log logs/coder-MIXFRAC1-resume3-l2t0715.log;
   QUEUE-WAIT since 07:52:20). No worktree creation — reuses the surviving branch.
2. Stack recovery: stopped, relaunched twice. Frontend came up once (fe:200 at 07:55) then
   both died again. ROOT CAUSE now first-hand: the lane's node_modules is a SYMLINK into
   Brad's live tree; Brad's tree is mid-reinstall — @tailwindcss dir went to 0700 ACL mid-
   swap (vite ERR_MODULE_NOT_FOUND @tailwindcss/vite), app/node_modules REMOVED (vite
   pre-transform errors on shared/surfaces imports), backend tsx died mid-index-rebuild
   (shared .bin churn), and Brad's tree shows 1172 tracked-file DELETIONS in git status —
   he appears to be mid restructure, unattended-operation hazard for both lane stacks.
   cl-lane-sync.sh 2 => "nothing to link" (surfaces/registry.ts symlink is dangling into
   Brad's tree only while he deletes; it exists again when he restores). We did NOT touch
   Brad's tree. Retry4 unit restarts lane 2 ~08:12 (cl-l2-stackretry4-0808).
3. MIXROLE-1 Brad card ANSWER line: STILL EMPTY (checked 07:15). Watched, not re-asked.
4. PROTO-AI-13 recount 07:20 first-hand: n=325/500, last ts 07:16:09.673Z UTC — FLAT 5th,
   INSUFFICIENT-side (shadow accrual itself may be paused by the backend outages).
5. Task-list updated under queue lock (MIXFRAC-1 + REVISE-GHOST-1 checkpoint notes).

## QUEUE STATE / FLEET ORDER (restated, binding)
NOW: lane-1 INSTR-COLLAPSE-1 in the coder slot; OUR MIXFRAC-1 RESUME-3 FIFO second.
After MIXFRAC-1: CELLRATE-1 -> MIXROLE-1 (needs Brad (c) ruling + CELLRATE-1 merge) ->
FULFIL (amend gate spot-checked @ 78eb4cd1; re-spot only if merges touch
attestation/receiving/lint/config) -> PANEL (+ browser gate, after coder windows) ->
CHAIN gate.

## NEXT TICK (priority order)
1. STACK FIRST: `cl-lane-stack.sh 2 status`; if down, check
   /mnt/vast/home/brad/git/cl-integration-2/.run/{backend,frontend}.log and whether Brad's
   node_modules symlink target is intact (app/node_modules exists, .bin/tsx present). If
   Brad's reinstall has completed (tree stable), start the stack and re-verify
   :3093/health + :5193/200. If still churning after 2 further ticks, file a structured
   ENVIRONMENT blocker on the browser-gate obligation with next_check.
2. coder-MIXFRAC1-resume3-l2t0715.log: LOCK-ACQUIRED -> in-slot (1x ~45-100 min from
   acquisition; 2x/3x rule 7b from acquisition). EXITED code=0 -> verify report first
   line names l2t0715 run 3 -> advc gate (unique suffix l2t<tick>). EXITED 137/143 AGAIN
   while Brad's tree is quiet -> NOW escalate as fleet infrastructure blocker (do not
   blind-re-resume a 4th time). §14 changes composition-entry.schema.yaml -> stack
   restart REQUIRED on merge before live-endpoint re-verify.
3. Gate attempt 3 ONLY when stacks verified up: tier-2 (OpenRouter
   deepseek/deepseek-v4.1-flash, profile cl-browser-reviewer), c2 corrected facts, new
   receipts dir REVISE-GHOST-1/<ts>-c3-tier2/. If it harness-blocks again -> architect.
4. Harvest MIXROLE-1 ANSWER line each tick.
5. AI-13 recount each tick (n=325 flat 5th; if the count advances after stacks return,
   shadow-router outage confirmed collateral).

## Blockers / open obligations
- No lane-2 HARD blocker. ENVIRONMENT soft-block: both live gates (browser gate dispatch,
  coder test runs' module stability) depend on Brad's tree operation finishing.
- REVISE-GHOST-1 browser-gate obligation: MERGE ALREADY DONE (66cb7915, trunk tip
  45e1dad9) — explicit open obligation until real receipts VERDICT: accept. Attempts 1-2
  do NOT count (attempt 1 invalid premise, attempt 2 died no-trail). Attempt 3 = tier 2.
- MIXFRAC-1 report path collision guard: run 3 must name itself in the report resume
  note; reject a report that claims run-2 identity.
- Brad cards watched (not re-asked): APPENDONLY array-replace escalation; MIXROLE-1 (c)
  enum card l2t0530; CELLRATE-1 OQ-3 wording Brad-overrulable.
- EVIDENCE DEBT OPEN: AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY +
  AS-CELLRATE-OQ1-PRECLEARED-TRACKED-COPY (clear at main-promotion reconciliation) +
  NEW AS-LANE2-BRAD-TREE-REINSTALL-IN-FLIGHT (touches the gate timeline; clears when the
  gate renders a real verdict on a stable stack).

## assumptions:
- CARRIED, IN FORCE: AS-ELIG-FIX2-SCOPE-READ, AS-FULLSUITE-GONE4-FLAKY,
  AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY [evidence debt], AS-CELLRATE-OQ1-PRECLEARED-
  TRACKED-COPY [evidence debt], AS-LOCKFILE-STALENESS, AS-CELLRATE-OQ2-OQ3-RULINGS,
  AS-CELLRATE-SEQUENCING-PRECOMMIT, AS-MIXFRAC1-AMEND-PROMOTED-BINDING,
  AS-REVISEGHOST-OQ1-RULED, AS-REVISEGHOST-FLEET-SLOT, AS-REVISEGHOST-USECHATTHREAD-PATH,
  AS-REVISEGHOST-COMPOSER-LEG-NUMBERS, AS-MIXFRAC1-OQ1-RULING-HARVESTED,
  AS-MIXFRAC1-OQ2-OQ3-OQ4-RATIFIED, AS-FULFIL-REVERIFY-PATCHES-BINDING,
  AS-ELIG-NO-FILE-OVERLAP-RECV, AS-CHAIN-OQ-RULINGS, AS-RECV-D6-VENDORSCAN-RULED,
  AS-CHAIN-ACCEPTS-RIDE-RAIL-A, AS-RECV-OQ2-RATIFIED, AS-RECV-OQ1-DEFERRED,
  AS-RECV-OQ3-GOVERNANCE, AS-RECV-NO-BROWSER-GATE, AS-ATTEST-DISPATCH-UNDER-DEFAULTS,
  AS-ATTEST-OQ-RULINGS, AS-ATTEST-NO-BROWSER-GATE, AS-REPLAY-PARTIAL-CLAIM,
  AS-REPLAY-READONLY-LANE-REPO, AS-ELIG-SCREENING-NOT-AUTHORITY, AS-ELIG-DEP-DISCHARGED,
  AS-LANE2-UIWITNESS-ORCH-SCRIPTED, AS-LANE2-WITNESS-NO-ACCEPT, AS-LANE2-ORPHAN-RESTART,
  AS-LANE2-OPTIONBIND-TSC-BASELINE-0, AS-FULFIL-OQ1-FORMULA-QUEUED,
  AS-RECV-MERGE-FLAKE-FOUNDRY, AS-APPENDONLY-ARRAYS-REPLACE (escalated; lane protected),
  AS-ELIG-WT-DRAFTCHANGES-LEFTOVER-UNTRACKED, AS-MIXFRAC1-NO-STACK-RESTART-CODER,
  AS-FULFIL-AMENDGATE-SPOTCHECKED-AT-78EB4CD1, AS-REVISEGHOST-MERGED-GATE-PENDING
  (pinned rev 45e1dad9 contains 66cb7915), AS-MIXROLE-DRAFT-OQABC-DEFAULTS.
- SUPERSEDED: AS-MIXFRAC1-KILLED-BY-EXTERNAL-TEARDOWN (attribution refined — see NEW
  below), AS-REVISEGHOST-GATE-TIER1-AGAIN (attempt 2 died no-trail -> 6c ladder says
  attempt 3 = TIER 2, overriding the same-tier plan), AS-MIXFRAC1-RESUME-FIFO (run 2
  dead; replaced by AS-MIXFRAC1-RESUME3-FIFO).
- NEW: AS-LANE2-MACHINE-SWEEP-TEARDOWN — the 06:43-06:54 kill cluster (our coder+gate,
  Brad main stack, two hermes gateway services, chromium ABRT) attributed to ONE external
  machine-wide teardown (co-timing inference; no kernel OOM, no oomd entries, no lane
  script kills). Drove the resume-3 re-dispatch decision. Full fields in assumptions.md.
  AS-LANE2-BRAD-TREE-REINSTALL-IN-FLIGHT [evidence debt on the gate timeline] — Brad's
  live tree mid-reinstall (node_modules swapped w/ 0700 ACLs, app/node_modules removed,
  1172 tracked deletions); lane stacks symlink through it -> both down; we never touched
  his tree; retry4 auto-restart ~08:12; gate dispatch gated on 200/200 + rev re-check.
  AS-MIXFRAC1-RESUME3-FIFO — run 3 reuses the SAME branch/worktree/report path; its
  brief marks steps 1-2 verify-only (3c558b9a + 32a9d103 exist); requires its own
  identity in the report; queues FIFO behind lane-1 INSTR-COLLAPSE-1.

## live-worker checkpoint at exit (~08:10 EDT; ~55 min wall)
- Fleet coder slot: lane-1 INSTR-COLLAPSE-1 (pid 3885824, since 07:46:16). OURS QUEUED:
  MIXFRAC-1 resume-3 (queue waiting on flock since 07:52:20; unit
  cl-l2-mixfrac1resume3-0715; FIFO second).
- Vision slot: idle (no gate dispatched — stack down).
- Stack: DOWN; retry unit cl-l2-stackretry4-0808 fires ~08:12.
- Thunderbeast: composer idle; orchestrator self. OpenRouter: idle.
