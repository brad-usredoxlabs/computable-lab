# Handoff — lane 1 tick 2026-10-22 11:15 → ENVIRONMENT HEALED (Brad restored app/src 11:02); QMS8-C browser gate re-fired tier-1; INSTR-COLLAPSE-1 adv-reviewer waiter armed; lane-sync repaired to copy-mode — 51st

Author: orchestrator cron tick l1t1100 — lane 1 only.
All git via -c core.fileMode=false. :5192/:3092 lane stack mine; :3001/:5174 not touched this tick.

## The headline: the data-loss incident HEALED on its resume check

Resume check `test -e /mnt/vast/home/brad/git/computable-lab/app/src/shared/surfaces/
registry.ts` = PRESENT at 11:13 (Brad restored app/src; dir mtime 11:02:31 — inside this
tick). First-hand: all 12 lane symlinks resolve real content (registry.ts md5
3a500c9aaf07585ab131347520c1ad8e, vite-transform 200, WorkstateProposalCard transform
200, /registry html 200, :3092 health 200). Lane 2: 0 dangling symlinks. Incident doc
stands as history; the blocker is cleared.

## Actions this tick (first-hand)

1. RECONCILE: INSTR-COLLAPSE-1 coder ALIVE (queue bash 3885824 systemd
   cl-l1-coder-instrcol1-l1t0755; hermes 3905584, ~3h15m at 11:01 — 2-4h class, 2x
   ~11:46, 3x ~15:46 per SOUL 7b). FORWARD MOTION: 5 commits on branch
   cl/lane1-instr-collapse-1-l1t0755 (986f0bb0 C1-RED, b18d087d C1-schema, 0d51bb05
   C1-TS, 5aab4a88 C2-RED, 739d68fe C2-GREEN+retargets 10:57); artifacts
   C2-RED/C2-GREEN-gate/specsuites-postC2/app-unit-postC2 under
   artifacts/INSTR-COLLAPSE-1/. Report instr-collapse-1-report-l1t0755.md absent =
   in flight. Fleet lock held by lane 1 (pid file: INSTR-COLLAPSE-1(l1t0755)
   pid:3885824). Do NOT duplicate.
2. ADV GATE ARMED: prompt prompts/advreview-instrcollapse1-l1t1100.txt (cycle-1,
   scope-C1+C2-only, dangling-symlink app-tsc caveat REMOVED — env healed; server tsc
   = hard gate; baseline debt list embedded) + waiter
   wait-advreview-instrcollapse1-l1t1100.sh as systemd unit
   cl-l1-wait-adv-instrcol1-l1t1100: fires cl-adversarial-reviewer on runner exit +
   "STATUS: complete"; on blocked/requires-rescope it stands down and the next tick
   routes. Report path advreview-instrcollapse1-l1t1100.md.
3. QMS8-C BROWSER GATE RE-FIRED (tier-1 cl-browser-reviewer, per handoff-50 NEXT-TICK
   checklist item 1): systemd unit cl-l1-browergate-qms8c-run2-l1t1115 (PID 269003,
   cwd=/home/brad — NOT the lane tree), prompt
   prompts/browergate-qms8c-l1t0955.txt (carries the STACK SAFETY GUARD; receipts dir
   auto-timestamps under ~/.hermes/cl/receipts/QMS8-C/). Served checkout verified to
   contain candidate dad6bbdc (merge-base --is-ancestor first-hand). Tier ladder: tier-1
   first per ladder (free/fast); tier-2 = OpenRouter deepseek retry if it dies/hangs
   (>2x expected ~30min).
4. TIER-1 CREDENTIAL/HAZARD NOTE cleared: expected duration ~30min from 11:15; 2x =
   11:45, at which the next tick re-shots at tier-2 per SOUL 6c.
5. LANE TOOLING REPAIR (the follow-up defect handoff-50 named) DONE by the
   orchestrator (lane tooling is orch-owned, not product code):
   cl-lane-sync.sh now COPIES all synced files (was: symlinks for server/src+app/src),
   refreshes copies by checksum each run, heals DANGLING symlinks into copies when the
   source returns, and reports source-missing counts instead of silently skipping.
   bash -n clean; ran on lane 1: "nothing to link" (Brad's checkout currently lists 0
   untracked files under server/src app/src schema — his restore left everything
   tracked or the untracked set is now empty; re-check next tick: if his checkout
   regains untracked files, the copy mode will populate both lanes).
   NOTE: existing HEALTHY symlinks are intentionally left (no churn in live lanes);
   new links are never created. The start-app.sh global-kill hazard (lane trunk copy)
   is NOT fixed here — that file is tracked product-adjacent code; if a lane script
   ever needs scoped kills it becomes a claimed item.
6. TRUNK: HEAD e5caebe5 (dad6bbdc + docs), working tree clean except M pnpm-lock.yaml
   (AS-ORCH-L1-248). Decision watch 2026-10-21_qms8c-cleanbreak-decision.md md5
   8b67f579 UNCHANGED — not re-asked. No new human questions owed; Brad's restore
   arrived without further input.
7. QUEUE: QMS8-C in-progress (gate live now — evidence is the ONLY thing left),
   INSTR-COLLAPSE-1 in-progress (coding), INSTR-COLLAPSE-2 todo (spec promoted
   2026-10-22_instr-collapse-2-kind-deletion-spec.md; deps COLLAPSE-1 merge + fleet
   slot). No new coder dispatches (fleet single-slot, mine).

## Brad

No open asks. (His :3001/:5174 stack: down as of handoff-50; out of lane-1 authority —
he can `./start-app.sh` but note the global-kill hazard toward lane backends.)

## NEXT TICK checklist

1. QMS8-C gate: read the newest receipts dir under ~/.hermes/cl/receipts/QMS8-C/ +
   unit status (systemctl --user status cl-l1-browergate-qms8c-run2-l1t1115 — note
   --collect auto-purges; absence of the unit + a written report = done). VERDICT
   accept -> mark QMS8-C done, check AS-ORCH-L1-236 (no-draft-button click evidence).
   VERDICT fix -> defect list + absolute screenshot paths to a fix run. Died/hung/no
   trail -> tier-2 re-shot per 6c (cl-browser-reviewer -m
   deepseek/deepseek-v4.1-flash --provider openrouter; receipts dir new timestamp;
   record tier+reason in gate log).
2. INSTR-COLLAPSE-1: waiter cl-l1-wait-adv-instrcol1-l1t1100 fires the adv reviewer on
   completion. Check waiter log
   logs/wait-advreview-instrcollapse1-l1t1100.log + advreview report
   advreview-instrcollapse1-l1t1100.md. At 2x (~11:46) verify coder log/artifact
   motion (artifacts/INSTR-COLLAPSE-1/ newest mtime, git log); 3x ~15:46 escalate per
   7b. On adv VERDICT: fix -> fix run same worktree/branch with defect list verbatim
   (max 2 cycles). On ACCEPT -> orch self-verify: full diff dad6bbdc..branch, server
   tsc exit 0, touched suites green + failing-FILE delta zero vs baseline pins, then
   merge --no-ff into cl/integration-1, YAML shipped => stack restart + curl proofs
   (spec's acceptance greps), mark done, handoff.
3. After COLLAPSE-1 merges: CLAIM INSTR-COLLAPSE-2 (fleet lock + queue lock; spec is
   promoted — RE-PIN every file:line at claim per the spec's own rule; QMS8-C merged at
   dad6bbdc changes instrument entry line etc.). Dispatch cl-coder (fleet slot then
   free) + cl-spec-composer for the item AFTER it if one exists in the list.
4. lane-sync follow-up: check `cd /mnt/vast/home/brad/git/computable-lab && git ls-files
   --others --exclude-standard -- server/src app/src schema | wc -l` — if Brad's
   restore surfaced untracked files again, run cl-lane-sync.sh 1 (copy mode) and
   confirm lanes build.
5. Follow-ups (unchanged): engine-initial-state fallback + LifecycleHandlers.ts:58
   literal (own item), ProtocolCompileMonolithPass OBS-B, pnpm-lock.yaml reconciliation
   (AS-ORCH-L1-248).

## assumptions:

New this tick: AS-ORCH-L1-252 (environment heal attributed to Brad's 11:02 restore —
verified first-hand by content+md5, not assumed); AS-ORCH-L1-253 (lane-sync repair:
existing healthy symlinks left in place to avoid churn; dangling-only heal — cleared
when both lanes run copy-mode after a fresh sync, or accepted as final posture).
Closed: the incident's Brad-restore ask (handoff-50) — RESOLVED.
Carried open (unchanged): AS-ORCH-L1-042; 082; 087 PARTIAL; 088; 089; 096; 097; 099;
101; 119; 137 residual; 154; 201; 206; 209; 210; 211; 212; 217; 218; 219; 221; 227; 228
(historical); 229; 230; 236 (evidence debt — the LIVE gate run is the candidate to
clear it); 238; 239; 240; 241; 242; 243; 244; 247; 248; 249 (superseded by heal: gate
un-blocked); 250 (Brad's stack state unchanged by me); 251.

## live-worker checkpoint (budget expiry state)

- BROWSER GATE (MINE, tier-1): unit cl-l1-browergate-qms8c-run2-l1t1115 PID 269003,
  started 11:15, cwd /home/brad, expected ~30min, 2x 11:45 -> tier-2 per 6c.
- FLEET CODER (MINE): INSTR-COLLAPSE-1 as in §1. Fleet lock held. Do NOT duplicate.
- WAITER: cl-l1-wait-adv-instrcol1-l1t1100 armed (survives this tick via systemd).
- Lane stack :3092/:5192 200/200 (mine). Brad's :3001/:5174 not touched.
- Trunk HEAD e5caebe5; clean except M pnpm-lock.yaml.
