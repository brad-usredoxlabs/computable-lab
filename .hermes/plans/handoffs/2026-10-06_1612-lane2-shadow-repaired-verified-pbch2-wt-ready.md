# Handoff — LANE 2 tick 2026-10-06T16:12 EDT
## (Shadow-router corpus clock REPAIRED + end-to-end VERIFIED — prior tick's enablement was dead config; PB-CH-2 coder worktree prepped; AI-14 run 2 + PB-CH-2 composer still live)

Campaigns: `ai-protocol-edit-and-router` + `page-builder channel`. Trunk `cl/integration-2` HEAD
**`1a9aa893`** (docs-only above d6e566e1; contains PB-CH-1). Lane stack :3093/:5193 **200**
(restarted 15:39 this tick with corrected config; records endpoint verified 200 post-restart).
Brad's :3001/:5174 untouched. Fleet coder lock: **FREE**, no live cl-coder (pgrep verified).

## Reconcile at tick start (verified with real output)
- AI-14 browser gate RUN 2: python **1235682** ALIVE, wal advancing (16:05:03), ~2:20 elapsed —
  within reviewer precedent; receipts dir still empty (writes land at exit). NOT re-dispatched.
- PB-CH-2 spec-composer: python **1260414** ALIVE, wal advancing (16:04:53), ~2:10 elapsed;
  DRAFT file `.hermes/plans/2026-10-06_1355-PB-CH-2-workstate-draft-adapter-spec-DRAFT.md`
  absent yet (written near exit). NOT re-dispatched.
- No coder live. Ready set = PB-CH-2 (spec not promoted yet), PB-CH-3/4 dep-gated behind PB-CH-2;
  PROTO-AI-11 completion needs its browser clause (vision slot held by AI-14 run 2 — queued);
  PROTO-AI-13 = corpus-clock item (see below); PB-CH-8 hard-gated on Brad's ledger decision.
  Readiness gate: `7 2 0 -` (0 due/changed blockers).

## SHADOW ROUTER — real bug found and fixed this tick (AI-13 corpus was NOT accruing)
- Discovered: the 14:20 tick enabled shadowRouter in the **trunk worktree's** config.yaml, but the
  lane backend loads **CONFIG_PATH=/home/brad/.hermes/cl/lanes/2/lane2-config.yaml**
  (cl-lane-stack.sh:76; confirmed via /proc/<pid>/environ of the serving pid). Corpus file was
  absent, backend.log had zero shadow lines = router OFF.
- Fix: added the identical shadowRouter block to lane2-config.yaml (enabled:true,
  http://appliance-2:8900/v1, model lfm2.5-350m, telemetryPath
  /home/brad/.computable-lab-lane2/shadow-router/events.jsonl), restarted the lane stack
  (background=true per pitfall), ports 200, endpoint appliance-2:8900 confirmed serving lfm2.5-350m.
- VERIFIED END-TO-END: ran the lane pre-check (`precheck-assist-turn.py`, real
  POST /api/ai/assist/stream, surface workspace.deck, fixture PRT-4iaey2): model emitted a
  schema-VALID protocol_edit AND telemetry landed — 2 paired records with real routerPick/
  authoritativePick/latencies (lfm2.5-350m CPU latency ~65-162 ms). The 14:20 assumptions entry is
  corrected in assumptions.md (**AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH**).
- CONSEQUENCE: PROTO-AI-13 (>=500 pairs, >=50 protocol_edit, per the pre-registered spec —
  pre-registration also mandates timeouts/parse-failures count AGAINST; insufficient => verdict
  INSUFFICIENT, never pass) is a pure corpus-clock item. Real accrual starts ~15:39 this tick.
  Both pairs so far are routerPick=parse_failure vs authoritative protocol_edit — early evidence
  the tiny model is weak, exactly what the gate exists to measure. Watch `wc -l` daily; AI-13
  dispatch waits for the pre-registered minimum.

## PROTO-AI-14 — gate RUN 2 still live; restart-collateral note now has hard evidence
- backend.log turn cd3f29 shows a schema-rejected protocol_edit with 'No user query found in
  messages' 400s + repeated stream resumes — consistent with the 14:20 restart interrupting a turn.
  My 15:39 healthy turn proves the surface works. If run 2 returns BLOCKED citing connection
  errors -> re-run ONCE (run 3) with the same prompt (prior handoff's rule) before changing
  diagnosis. On accept: promote report, mark done. On fix: defect list + absolute screenshots ->
  coder on wt/PROTO-AI-14-lane2-l2t1020 (fix cycle 1/2; queues behind PB-CH-2 coder for the fleet
  lock).
- NOTE (subagent-verified, read-only): AgentOrchestrator calls shadowRoute('protocol_edit', ...)
  unconditionally on the success axis (:2059 after the ternary at :2027-2036) — rejected turns DO
  accrue corpus pairs (authoritativePick=protocol_edit). Same for event_graph/deck_layout/
  create_record; workspace_action is NOT shadow-covered (asymmetry, harmless for this campaign's
  four classes). No denominator distortion.

## PB-CH-2 — worktree PREPPED ahead of dispatch (next tick dispatches immediately on draft review)
- Worktree **/mnt/vast/home/brad/git/wt/PB-CH-2-lane2-l2t1550** on branch
  **cl/PB-CH-2-lane2-l2t1550** at 1a9aa893 (post-PB-CH-1, dep met), node_modules symlinked
  (./, server/, app/), 43 server/src symlinks replicated from trunk readlink targets (gitignored,
  never git-added). git status = only the 3 node_modules untracked lines. PITFALL hit this tick:
  the FIRST `git worktree add` attempt timed out mid-copy on NFS and left a half-registered entry
  (.git pointed at a nonexistent computable-lab admin dir -> 'not a git repository: (null)');
  recovery = rm -rf the dir + `git worktree prune` + re-add (background=true).
- On composer exit: review draft (load-bearing: adapter-capability verdict — projection-only +
  actor-binding within the existing contract, else stop-boundary to architect), promote, CLAIM
  under queue lock, dispatch cl-coder under the fleet lock into that worktree. Unique report path
  .hermes/plans/PB-CH-2-report.wip-l2t1550.md, log logs/PB-CH-2-l2t1550.log.

## Queue / dispatch order (resume exactly here)
1. AI-14 run 2 verdict -> close or fix-queue. THEN AI-11 run 4 on the freed vision slot
   (prompt prompts/review-PROTO-AI-11-rail-20261006T1055.txt + keep-it-small note, fresh receipts
   dir receipts/PROTO-AI-11/<ts>/). On accept: promote report, mark AI-11 done (data commit
   63bfab20 already adversarially accepted).
2. PB-CH-2 composer exit -> draft review -> promote -> CLAIM -> cl-coder dispatch (fleet lock;
   worktree ALREADY PREPPED). AI-14 fix coder (if needed) queues behind it.
3. PB-CH-3 spec-composer commission after PB-CH-2 promotes (needs its contract).
4. Shadow corpus: `wc -l /home/brad/.computable-lab-lane2/shadow-router/events.jsonl` each tick;
   AI-13 only at the pre-registered minimum (disclose AS-PROTO-AI-12-W1 QAD-Q4_0 at verdict).
5. Human artifacts UNCHANGED this tick (md5 PROTO-AI-11-data-approval f86d9e33,
   PB-CH-7-ledger-storage 6b9f7e3c): do not re-ask; silence is never approval.

## Thunderbeast capacity at checkpoint
4-session ceiling: orch (this) + composer 1260414 = 2. Reviewer = computable vision slot
(not thunderbeast). Headroom OK.

## Live at checkpoint (NOT killed; do NOT duplicate)
- cl-browser-reviewer AI-14 run 2: python **1235682** -> receipts/PROTO-AI-14/2026-10-06_1345/
- cl-spec-composer PB-CH-2: python **1260414** -> .hermes/plans/2026-10-06_1355-...-DRAFT.md

## assumptions:
- NEW **AS-LANE2-SHADOW-CORRECTED-CONFIG-PATH** — corrects AS-LANE2-SHADOW-ENABLED-LANE-LOCAL:
  lane backend uses CONFIG_PATH=lanes/2/lane2-config.yaml, NOT the trunk config.yaml; enablement
  re-applied to the right file + verified end-to-end (2 real telemetry pairs). reversible true;
  evidence_debt false. Owner: orchestrator.
- NEW **AS-LANE2-PBCH2-WTPREPPED-OFF-1A9AA893** — coder worktree prepped off 1a9aa893 before spec
  promotion; if trunk moves before dispatch, coder branches from worktree HEAD (PB-CH-1 merge
  already contained); reversible true, evidence_debt false. Owner: orchestrator.
- Carried (unchanged): **AS-PROTO-AI-12-W1** (QAD-Q4_0 quant disclosure — due at AI-13 verdict),
  AS-LANE2-REVIEWER-COMPRESSION-DEATH-RETRY-OK, AS-PROTO-AI-14-REVIEW-OBSERVATIONS-ACCEPTED,
  AS-LANE2-WORKTREE-BOOTSTRAP-NODELINKS, AS-PROTO-AI-11-LANE2-STORE-SEED-TESTDATA,
  AS-PROTO-AI-11-AMEND-LOCAL-ONLY, AS-PROTO-AI-11-LBW-MATCH-REVIEW,
  AS-LANE2-11434-VISION-SERVICE-ALREADY-DOWN, AS-PROTO-AI-2-C1-ANCHOR, AS-PROTO-AI-9-C5-ROLENAME,
  AS-PROTO-AI-9-LANE2CONFIG-RECREATE, AS-PROTO-AI-9-W8, AS-PROTO-AI-9-SURFACE-MOUNTED,
  AS-PROTO-AI-9-RDEFECT2-PLACEMENT, AS-PROTO-AI-9-DRAFTCHANGES-LANE-LOCAL,
  AS-PROTO-AI-9-ISOLATED-STACK, AS-PBCH7-OUT-OF-SCOPE-SESSION-AUTHZ-GAP,
  AS-PBCH1-AMBIGUITY-MINIMAL-RULE.

## Open evidence-debt entries
- **AS-PROTO-AI-12-W1** — served router artifact is the QAD-Q4_0 quant of LFM2.5-350M (sha256
  3d10b6ab...); disclose with the PROTO-AI-13 verdict digest. STILL OPEN (due at AI-13).

## Baseline facts (carried; unchanged this tick)
- Trunk HEAD **1a9aa893** (code tip d6e566e1). server src/ai: **10 failed files / 21 failed /
  565 passed** at d6e566e1; tsc server 33 lines. Vitest src/ai ~15-30 s.
- :3093 has NO /health (404) — liveness via GET /api/records/PRT-4iaey2.
- Shadow telemetry: /home/brad/.computable-lab-lane2/shadow-router/events.jsonl (append JSONL).
  IMPORTANT: config lives ONLY in /home/brad/.hermes/cl/lanes/2/lane2-config.yaml (CONFIG_PATH).
- Carried pitfalls: lane-stack restart BLOCKING (background=true); `git worktree add` on NFS can
  exceed 120 s — run background=true, and on mid-copy timeout `rm -rf + git worktree prune`
  before re-add; bare worktree needs node_modules (3) + 43 server/src symlinks; NEVER `git add -A`
  in coder worktrees; NFS git -c core.fileMode=false; hermes -z one-shots buffer logs until exit;
  reviewer sessions can die on context compression; lint schemaId full https form; SPA record
  route /record/<id>; lane data store /home/brad/.computable-lab-lane2/worktrees/main; verify NO
  live cl-coder session before trusting a free lock.

## ADDENDUM 2026-10-06T16:30 (same tick) — AI-14 gate run 2 died on infra; run 3 dispatched with hygiene override
- Run-2 python 1235682 exited ~16:05: log = single context-compression-death line, ZERO receipts
  (same death as AI-11 run 3). NOT a product verdict. Premise re-verified healthy (served CSS/
  byId greps, ports 200, real schema-valid protocol_edit turn end-to-end via precheck + telemetry
  pair landed).
- RUN 3 dispatched 16:25 pid **1561766** with a context-hygiene override appended to the run-2
  prompt (no full snapshots/DOM dumps, incremental trail.json, 240s-capped waits, <120-line
  report), receipts receipts/PROTO-AI-14/2026-10-06_1625/, log
  logs/review-PROTO-AI-14-gate-run3-20261006T1625.log. Change-of-diagnosis honored. If run 3 dies
  identically: stop reviewer re-dispatch; investigate the reviewer profile's auxiliary.compression.
- Queue order at next tick: run 3 verdict -> close/fix AI-14; AI-11 run 4 next on the vision slot;
  PB-CH-2 composer (python 1260414, still live wal-advancing at 16:05) -> review draft -> promote
  -> CLAIM -> cl-coder into ALREADY-PREPPED wt/PB-CH-2-lane2-l2t1550. Vision slot: only run 3.
