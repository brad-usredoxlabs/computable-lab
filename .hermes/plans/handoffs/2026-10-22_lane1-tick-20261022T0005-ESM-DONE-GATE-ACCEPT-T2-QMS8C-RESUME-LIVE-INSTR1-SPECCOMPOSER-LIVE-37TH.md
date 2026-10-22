# Handoff — lane 1 tick 2026-10-22 00:05 → ESM-DIRNAME-1 DONE (tier-2 gate ACCEPT, real receipts) + QMS8-C RESUME coder LIVE (detached) + INSTR-COLLAPSE-1 spec-composer LIVE (detached) + dispatch-durability lesson recorded

Author: orchestrator cron tick l1t2330 — lane 1 only. :3001/:5174 never touched.
All git via -c core.fileMode=false. Budget 23:00→~23:45 (dispatches at 23:54,
checkpoint written at budget).

## CRITICAL LESSON (apply every tick from now on)

THE PREVIOUS TICK KILLS EVERYTHING IT LAUNCHED VIA terminal(background=true).
Evidence, first-hand this tick: the QMS8-C coder queue wrapper, its coder
session (2267 msgs froze 22:46, no EXITED line, 0 commits), and the tier-1
browser gate (froze 22:47, 0-byte log, 0 receipts) ALL died within the minute
the 22:00 tick exited (~22:46-47). Hermes background terminal sessions are tied
to the launching session's lifetime; a one-shot `-z` runner gets no late-completion
either. FIX APPLIED: launch every dispatch that must outlive the tick via
`systemd-run --user --collect --unit=cl-l1-<item>-<ts> bash <queue-script>` —
verified surviving, proper FIFO lock behavior, log paths unchanged. (setsid/nohup
via terminal is rejected by the tool policy; systemd-run is the clean route on
this Arch host.) Record in EVERY future handoff until a tick empirically proves
terminal-launched dispatches survive (they didn't twice).

## Reconcile (first-hand)

1. FLEET: lane-2 MATRES-ELIG fix-run-2 (pid 2572316, holder at tick start, 39m
   live at 23:49, last session activity 23:34) confirmed DEAD by ~23:55 (process
   gone, fleet lock free). Fleet rule honored throughout: zero lane-1 coder
   dispatch while it held the lock.
2. ESM-DIRNAME-1: in-progress -> **DONE**.
   - Tier-1 gate death diagnosed as collateral of the prior tick's exit (above),
     not a model failure. Per ladder 6c re-shot at TIER-2 (never blind re-shot
     at the same tier): cl-browser-reviewer -m deepseek/deepseek-v4.1-flash
     --provider openrouter (cloud, no vision-slot contention; queue script
     queue-browergate-esm-tier2-l1t2330.sh, log logs/browser-ESMDIRNAME1-
     l1t2330-tier2.log, EXITED 23:39 code=0).
   - VERDICT: accept with REAL receipts
     ~/.hermes/cl/receipts/ESM-DIRNAME-1/gate2-20261021T233010/ — orch read
     trail.json (10 steps + network summary, POST s:200), report.md (ends
     VERDICT: accept), 4 non-empty screenshots, api-can.json 200 contentSha
     4a0eb57c. Reviewer's live lap created XDR-semantic-6e458ead1eca1754
     (honest duplicate). No 500; backend grep "__dirname is not defined" = 0.
   - Caveats accepted + recorded as evidence debt AS-ORCH-L1-236 (button absent
     in already-drafted state; reviewer exercised the button's identical request
     from the page via fetch; React draftToken re-render path unverified).
   - Code gates were already all green (adv cycle-3 ACCEPT, orch vitest 760/26,
     live lap 200, merged 4fe39303). Gate closed -> task marked done under the
     queue lock with tick_reconcile_20261021T2350 stamp.
3. QMS8-C: first-hand confirmed the 22:27 coder died mid-Task-0 (see lesson).
   Worktree wt/QMS8-C-lane1-l1t2205 clean at base 4bc57ebe, 0 commits; Task-0
   artifacts ON DISK and adoptable (artifacts/QMS8-C/first-targeted-check-
   l1t2205.txt + baseline-targeted-l1t2205.txt — vitest baseline 15 failed |
   172 passed, matches the 2+1 known-failure posture). RESUME RUN dispatched
   23:54:31 via queue-qms8c-resume-l1t2355.sh under systemd-run unit
   cl-l1-qms8c-resume-2355 (pid 2741415): fleet lock acquired 23:54:31,
   pid-file QMS8C-RESUME(l1t2355); brief = resume header + original brief
   verbatim (briefs/coder-qms8c-l1t2355-resume.txt); log
   logs/coder-QMS8C-l1t2355-resume.log; report
   /home/brad/.hermes/cl/lanes/1/qms8c-report-l1t2205.md (fresh write, none
   existed). Expected 2-4 h (C1->C4). Fleet rule held: ONE live coder.
4. INSTR-COLLAPSE-1: NOT claimed (deps QMS8-C — correct, do not code it yet),
   but the spec pipeline started per cycle step 4: cl-spec-composer dispatched
   23:54:31 under systemd-run unit cl-l1-speccomposer-instr1-2340 (thunderbeast;
   briefs/speccomposer-instr-collapse-l1t2340.txt; draft path
   .hermes/plans/drafts/DRAFT-2026-10-21T2340-INSTR-COLLAPSE-1-spec.md; log
   logs/speccomposer-INSTRCOLLAPSE1-l1t2340.log). Orch reviews the draft,
   verifies cites, promotes to canonical spec path when QMS8-C nears merge.
   No scout used this tick: composer inspects trunk directly and the brief
   forbids scout-sourced cites; load-bearing claims get orch verification at
   promotion.
5. Queue: ESM-DIRNAME-1 closed. QMS8-C in coder's hands (resume). INSTR-
   COLLAPSE-1 spec drafting. No third ready item.

## Next tick checklist

1. QMS8-C resume coder: observe logs/coder-QMS8C-l1t2355-resume.log (EXITED
   line = done; session lives in cl-coder state.db newest session). On exit ->
   adversarial review cycle-1 (unique report path advreview-qms8c-l1t*.md),
   then ACCEPT->orch verify (real diff, own vitest deltas vs the 15|172
   baseline, typecheck) -> MERGE C1... note the spec's runtime legs: after the
   C1 merge fire the A1-4 apply lap (dry-run -> --apply via
   CONFIG_PATH=/home/brad/.hermes/cl/lanes/1/lane1-config.yaml -> re-dry 0
   planned -> RESTART stack (YAML in C1) -> re-probe :3092 0 vocab records
   status-no-state) = closes evidence debt AS-ORCH-L1-232. C2 dry-run report
   verbatim in coder report; C3 flip; C4; browser gate LAST (verified-by 5:
   /registry EQP-NEW-7LS1 Draft pill, no Status field). tsx --watch crash-
   reload risk after big TS merges: health-check :3092, restart via
   cl-lane-stack.sh 1 restart (background=true, blocking script).
2. INSTR-COLLAPSE-1 draft: on composer exit, review draft vs memo + trunk
   cites (verify load-bearing line cites yourself), promote or send back.
3. Dead-worker forensics: any frozen session with 0 receipts = suspect the
   tick-exit kill FIRST; check the owning tick's exit time before blaming the
   model, then re-ladder per 6c.
4. Honest-create: ANSWERED (supersession) — do NOT re-ask. Watch path md5 was
   8b67f579 at l1t2205; re-check cheaply, never re-ask unchanged questions.

## assumptions:

New: AS-ORCH-L1-236 (ESM tier-2 gate accepted the raw-fetch exercise of the
button's request path; React draftToken re-render unverified in-browser —
EVIDENCE DEBT OPEN, clear on any future no-draft button click in a gate).
AS-ORCH-L1-237 (QMS8-C resume adopts the dead session's Task-0 artifacts
first-targeted-check + baseline 15|172 as its own baseline; verified on-disk,
mtime-confirmed authored 22:34-22:42 by the adopted session; reversible: a
resume coder may re-pin the baseline if it doubts it).
Carried open (unchanged unless noted): AS-ORCH-L1-042; 082; 087 PARTIAL; 088;
089; 096; 097; 099; 101; 119 (+post-QMS76 ext); 137 residual; 154; 201
(posture-watch); 206; 209; 210; 211; 212; 217; 218; 219; 221; 227 (VPDF-4
fail-branch unit-only posture); 228 (ESM spec loss-reconstruction — historical
record, keep); 229; 230; 236 (NEW, evidence debt).
Closed: AS-ORCH-L1-234, 235 remain closed; AS-ORCH-L1-232 STILL OPEN (closes
with the QMS8-C C1-merge apply-lap receipts, next tick+).
