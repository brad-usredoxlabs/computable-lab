# Handoff — lane 1 tick 2026-10-22 10:30 → QMS8-C gate RENDERED blocked: Brad's app/src deleted → lane symlinks dangling; Brad recovery needed; INSTR-COLLAPSE-1 coding on — 50th

Author: orchestrator cron tick l1t0940 — lane 1 only.
All git via -c core.fileMode=false. :5192/:3092 lane stack mine; :3001/:5174 incident
documented below (NOT restored by me — Brad's authority, AS-ORCH-L1-250).

## The headline: environment data loss discovered first-hand

Brad's live checkout /mnt/vast/home/brad/git/computable-lab lost `app/src` ENTIRELY at
2026-10-22 06:01:55 EDT (dir mtime; 1172 tracked ` D` entries in his git status). Both
lane trunks keep 12 UNTRACKED app/ files as symlinks INTO that checkout by design
(cl-lane-sync.sh:12-20; lane-exclude names them). All 12 are now dangling; 11 have NO
surviving copy anywhere (git --all = zero history); ParameterAnswerInput.tsx survives as a
real file in cl-integration-2 (md5 acdc0c7672c20e8af4f7c634afe7eb67 == e1ad8009 blob).
Consequence: Vite import-analysis 500 -> /registry cannot mount on :5192 (and lane 2 is
identically broken). Full incident + recovery conditions:
/home/brad/.hermes/cl/lanes/1/incidents/2026-10-22_lane-sync-symlink-data-loss.md

RESUME CHECK (every tick): `test -e
/mnt/vast/home/brad/git/computable-lab/app/src/shared/surfaces/registry.ts` — heals
automatically on a snapshot restore (Arch btrfs; no snapshots visible to me: /.snapshots
empty, snapper unreadable without root).

## Reconcile (first-hand this tick)

1. TIER-1 BROWSER GATE: hung 2h05m, ZERO receipts (dir 20261022T114947 empty), AND caused
   a collateral incident: at 08:02 it spawned `npm run dev` chains from the LANE tree
   (cgroup cl-l1-browergate-qms8c-l1t0755, cwd cl-integration-1) onto :5174/:3001 —
   start-app.sh's global `kill_by_pattern "tsx.*src/server\.ts"` + default ports. I
   stopped the unit (whole cgroup died, incl. the rogue vite/tsx), restarted lane 1 via
   cl-lane-stack.sh (background), :3092/:5192 back to 200 by 09:51.
2. TIER-2 GATE (SOUL 6c ladder; cl-browser-reviewer -m deepseek/deepseek-v4.1-flash
   --provider openrouter; receipts ~/.hermes/cl/receipts/QMS8-C/20261022T140032/; tier +
   reason recorded in the gate log): ran 14:02-14:06Z, VERDICT: blocked with a REAL trail
   (trail.json, 13 shots, api-evidence.txt, grep-proofs.txt). Criterion 3 (/lab Equipment:
   no status column, "Equipment" label landed) PASSED with DOM+shot evidence. Criteria
   1/2/4 (/registry row pill, form-no-Status-field, tabs-no-status-column) UNTESTED —
   route cannot mount (root cause above, NOT the QMS8-C diff). F-1 carried: 6 archived
   equipment records keep status:active (the AS-ORCH-L1-247 wall-refused posture; no UI
   renders them). QMS8-C STAYS in-progress: browser evidence incomplete.
3. FLEET CODER (MINE): INSTR-COLLAPSE-1 queue bash 3885824 + coder 3905584 ALIVE 2h51m
   at 10:31 (2-4h class; 2x-checkpoint ~11:46). FORWARD MOTION first-hand: C1 RED (08:38),
   C1-GREEN-schema (09:08), baseline2 + targeted-baseline pins (09:02), baseline3-postC1
   pin 10:09; branch commits 986f0bb0 RED + b18d087d C1 schema + 0d51bb05 C1 TS. Report
   instr-collapse-1-report-l1t0755.md absent (correct mid-flight). Do NOT duplicate.
   Adversarial reviewer prompt to fire on exit (mirror prompts/advreview-qms8c-cycle1
   pattern, unique path advreview-instrcollapse1-l1t<tick>.md) via systemd-run waiter.
4. QUEUE: QMS8-C in-progress (gate blocked-on-environment, structured blocker in the task
   block), INSTR-COLLAPSE-1 in-progress (coding), INSTR-COLLAPSE-2 todo (deps COLLAPSE-1
   merge + fleet slot). Nothing else ready. Fleet lock: lane 1 holds it (queue
   3885824). No new dispatches this tick: the only coder-needed item is already live, and
   the only gate needed is blocked on Brad.
5. TRUNK REPAIR: reverted the 09:49 ambient one-line working-tree edit
   (WorkstateProposalCard.tsx import depth) — AS-ORCH-L1-251; trunk HEAD 569c3a64
   authoritative. `M pnpm-lock.yaml` untouched (AS-ORCH-L1-248).
6. DECISION WATCH: 2026-10-21_qms8c-cleanbreak-decision.md md5 8b67f579 UNCHANGED — not
   re-asked. Sweep of plans/ + decisions/ + inbox newer than 08:15: nothing. No human
   question owed EXCEPT the incident's restore ask (below — an access/input need, not a
   design decision).

## Brad's decision/input needed (recorded, not blocking other work)

- RESTORE app/src in /mnt/vast/home/brad/git/computable-lab (btrfs/TimeShift snapshot
  older than 2026-10-22 06:01 EDT; e.g. `time-shift -a`-style snapshots or
  `btrfs subvolume list`/root access I don't have). 12 lane+lane2 files heal on restore.
  If no snapshot exists, the 11 unrecoverable files must be re-authored by their origin —
  incident doc lists them.
- His stack :3001/:5174 is down (the 08:02 collision). He can bring it back with his usual
  `./start-app.sh` run; the lane queues are safe from it EXCEPT for that global tsx-kill
  pattern — running it while cl-lane-stack tsx servers exist WILL kill the lane backends
  (previously noted; now incident-proven).
- FOLLOW-UP DEFECT (lane tooling repair item, to spec next tick): cl-lane-sync should COPY
  untracked app/ files (as it already does for schema/) instead of symlinking into Brad's
  checkout; and any lane-trunk script path that can reach start-app.sh needs scoped kills.
  Spec + claim once the queue drains (fleet slot busy).

## NEXT TICK checklist

1. Resume check: `test -e /mnt/vast/home/brad/git/computable-lab/app/src/shared/surfaces/registry.ts`.
   If HEALED: re-fire the QMS8-C gate (tier-1 cl-browser-reviewer, prompt
   prompts/browergate-qms8c-l1t0955.txt — carries the STACK SAFETY GUARD now; systemd-run,
   receipts dir auto-timestamped). On accept: mark QMS8-C done + check whether the
   no-draft-button surface was clicked for AS-ORCH-L1-236 debt.
2. INSTR-COLLAPSE-1: on runner exit + STATUS: complete -> fire cycle-1 adversarial
   reviewer (worktree /mnt/vast/home/brad/git/wt/instr-collapse-1-lane1-l1t0755, branch
   cl/lane1-instr-collapse-1-l1t0755, spec
   .hermes/plans/2026-10-22_INSTR-COLLAPSE-1-contract-as-data-spec.md, report
   instr-collapse-1-report-l1t0755.md). NOTE: the app tsc delta check is currently
   unreliable until app/ is restored (vite/tsc against dangling symlinks); server-side
   verification proceeds normally. At 2x (~11:46) verify log/artifact motion; 3x ~15:46
   escalate per SOUL 7b.
3. Orch verify post-adv-accept, merge --no-ff, restart stack if YAML shipped, curl proofs
   per the handoff-49 checklist (items 3-5 carry forward unchanged).
4. Follow-ups (unchanged): engine-initial-state fallback + LifecycleHandlers.ts:58
   literal (own item), ProtocolCompileMonolithPass OBS-B, pnpm-lock.yaml reconciliation
   (AS-ORCH-L1-248), lane-sync copy-instead-of-symlink repair item.

## assumptions:

New this tick: AS-ORCH-L1-249 (gate-blocked attribution to environment, re-gate is the
check), AS-ORCH-L1-250 (Brad's stack left down deliberately — his authority; global-kill
hazard), AS-ORCH-L1-251 (ambient trunk edit reverted, single-line, recoverable).
Closed/superseded: AS-ORCH-L1-245 window-resolved (prior tick).
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099;
101; 119; 137 residual; 154; 201; 206; 209; 210; 211; 212; 217; 218; 219; 221; 227; 228
(historical); 229; 230; 236 (evidence debt — clears ONLY on a no-draft-button click in a
real browser verdict; the re-gate after restore is the candidate); 238; 239; 240; 241;
242; 243; 244; 247; 248.

## live-worker checkpoint (budget expiry state)

- FLEET CODER (MINE): INSTR-COLLAPSE-1, queue bash 3885824 (systemd
  cl-l1-coder-instrcol1-l1t0755), coder hermes 3905584 (alive 2h51m at 10:31), worktree
  /mnt/vast/home/brad/git/wt/instr-collapse-1-lane1-l1t0755, branch
  cl/lane1-instr-collapse-1-l1t0755, log logs/coder-INSTRCOLLAPSE1-l1t0755.log, report
  instr-collapse-1-report-l1t0755.md (absent = in flight). Fleet lock held by lane 1.
  Do NOT duplicate.
- No gate live (tier-2 exited 10:06 with its verdict; tier-1 unit stopped by me at 09:47).
- No composer/scout live. Lane stack :3092/:5192 200/200 (mine, restarted 09:51).
- Brad's :3001/:5174 DOWN (AS-ORCH-L1-250) — his restore, not lane 1's.
- Trunk HEAD 569c3a64 (dad6bbdc + docs); working tree clean except M pnpm-lock.yaml.
