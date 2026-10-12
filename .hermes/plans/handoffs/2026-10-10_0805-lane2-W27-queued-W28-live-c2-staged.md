# HANDOFF - lane 2 - 2026-10-10T08:05 EDT (orch tick l2t0750, invoked ~07:50)

HEADLINE: W2-8 coder LIVE and progressing (session 20261010_072053_73c8cb, 196 msgs, last
activity 07:57:07, worktree clean off 529b787d). W2-7 fix run QUEUED behind it (fleet coder
single slot; W2-8 holds appliance-2). C2 adversarial-gate prompt PRE-STAGED for zero-latency
dispatch after the fix. One incident: an errant concurrent fix dispatch (~60s) killed at once;
W2-7 worktree verified untouched.

## 1. RECONCILE (first-hand)
- W2-8 coder: bash 3711552 / hermes 3711608 ALIVE at 07:57 (ps + cl-coder state.db session
  20261010_072053_73c8cb 196 msgs, MAX(timestamp) 07:57:07 = forward motion). Worktree
  wt/W2-8-lane2-l2t0630 git-clean at 529b787d (still pre-first-commit). Log
  logs/coder-W2-8-l2t0630.log 0 B (buffered-until-exit pitfall, expected). Elapsed 37 min at
  checkpoint; expected exit ~08:45-10:00; 2x ~09:15, 3x ~10:45 (rule 7b).
- Fleet lock: appliance2-coder.pid = W2-8 owner line (restored after incident, see §2).
- W2-7: worktree wt/W2-7-lane2-l2t0550 HEAD cf7d548a UNTOUCHED (git status: only the untracked
  report, md5-identical size/mtime 26870 B/07:14). Adv c1 report read first-hand:
  reviews/review-W2-7-adversarial-l2t0715-c1.md VERDICT: fix, DEFECTS 1 major (:550 verb
  literals) + 3 minors (:542-545 field paths; unconsumed substitutionAdjudication; vacuous T5
  shake arm). All cycle-1 PASS arms listed in the report's §5/§6.
- Trunk TIP 02e0333a (docs addendum over 248e9b0c). No W2-7 code on trunk yet.
- Stack :3093 /api/health + :5193 both 200.
- BRAD-PACKET-spine7-spine8: ANSWERED 2026-10-09 — APPROVE BOTH; SPINE-7-ROLES-SEAM and
  SPINE-8-LEVELFOR already published as todo entries in the list (lines 3949/4088). NOT
  re-asked (unchanged human question, answered).
- PROTO-AI-13: passive only — no new corpus accrual evidence found this tick; last known
  90/500 (2026-10-09T09:49); no action permitted either way.

## 2. INCIDENT (recorded, self-reported)
At 07:54 a fleet-lock acquisition + fix dispatch fired WHILE W2-8 was alive (flock -n returned
free because W2-8's dispatch does not hold the lock for its run — only the pid FILE records
ownership). Fleet-single momentarily violated by a SECOND cl-coder (3782679/3782735). Killed
within ~60s (log shows EXITED code=143 at 16 B — never read a spec, made ZERO edits; worktree
verified byte-untouched). Pid file restored to W2-8. LESSON: flock only serializes dispatch
INSTANTS, never the run — the live-coder check MUST be `kill -0 <coder pid from pid file>`
BEFORE any coder dispatch, not flock alone. Apply that check at the W2-7-fix dispatch.

## 3. TICK WORK
- Read c1 report + staged fix prompt fully (prompt verified complete: 4 defects verbatim,
  append-report discipline, end-marker W2-7-FIX DONE <sha>, disjoint server/** vs W2-8 app/**).
- Pre-staged C2 gate prompt: prompts/review-W2-7-adversarial-c2-TEMPLATE-l2t0750.txt
  (c1 clone + CYCLE-2 MANDATE: per-defect re-verify A-D, full-branch regression re-hunt B,
  fix-run integrity C, MANIFEST pin corrected to blob 58c447eb, two-cycle terminal rule).
  At dispatch: replace <TICK> with the tick token, unique report path
  reviews/review-W2-7-adversarial-l2t<tick>-c2.md.
- Task-list updated under lock (W2-7 queue-state note incl. incident + C2 staging + Brad
  answer recorded). Trunk commit 02e0333a was already in place from l2t0715.

## 4. QUEUE / NEXT TICK (ordered)
a. W2-7 FIX DISPATCH (PRIMARY): when 3711552 is GONE (kill -0 check, pid-file ownership — NOT
   flock alone, §2) -> `flock -n /home/brad/.hermes/cl/appliance2-coder.lock -c ...` dispatch
   prompts/coder-W2-7-fix-c1-l2t0715.txt, log logs/coder-W2-7-fix-c1-attempt2-<tick>.log (NEW
   unique path; the 143 log is an artifact of the incident, NOT a fix attempt), pid file line
   'W2-7-fix-c1 ...'. Expected ~40-60 min (small localized fix).
b. On fix exit (marker W2-7-FIX DONE <sha>): dispatch C2 gate from the staged template. On
   ACCEPT c2 -> orch self-verify (T-suites in worktree, scoped fail-SET == 11-file pin
   /tmp/l2t2310-w25-baseline-failfiles.txt, tsc multiset 26 vs /tmp/l2t0415-tsc-server.txt,
   MANIFEST blob 58c447eb untouched, lintRules 81 post-boot, determinism + fail-loud re-run),
   merge --no-ff, RESTART STACK BACKGROUND (new policy YAML schema/registry/realization/
   robot-realization.policy.yaml is touched by the fix — D1 moves verb policy INTO it), promote
   report, mark done, handoff. Headless — NO browser gate. Two-cycle max: if c2 returns FIX
   again -> architect with evidence, no third cycle.
c. W2-8 coder observation (2x ~09:15 / 3x ~10:45 rule 7b): on exit -> adv gate (pre-draft c1
   prompt per W2-7 pattern, unique report path), self-verify (app tsc multiset vs
   /tmp/l2t2230-tsc-app.txt 34, fresh app unit fail-SET, retired-call-site greps), merge,
   restart stack, BROWSER GATE vs :5193 (spec §10 verbatim; receipts/W2-8-SAID-MEANT-SURFACE/
   <ts>/; use corrected-nav-facts precedent prompts/review-W2-3-browser-l2t2200-tier2.txt —
   real routes /record/:recordId, /ingestion/vendor-pdf/:recordId; NO
   /project/:study/record/<id>; tier ladder rule 6c).
d. After W2-7 merge: W2-10 promotion gate MET (deps W2-6+W2-7) -> resolve N6 CAMTs against
   merged trunk, append note, promote spec, bootstrap worktree (~6-8 min NFS, background) —
   coder stays serialized. W2-9 promotes after W2-8 merge. W2-11 gated on W2-7..W2-10.
e. PROTO-AI-13 corpus: passive check only.

## assumptions:
NEW: AS-LANE2-FLEETLOCK-DISPATCH-ONLY-INCIDENT (flock serializes dispatch instants, not runs;
live-coder pid check is mandatory before ANY coder dispatch; incident 2026-10-10T07:54, zero
worktree impact verified).
DISCHARGED: none this tick.
CARRIED OPEN (unchanged): AS-LANE2-W27-OQ2-RULED-AT-MERGE, AS-LANE2-W27-OQ-RULINGS,
AS-LANE2-W27-WORKTREE-BOOTSTRAP-ORCH (live until W2-7 acceptance), AS-LANE2-W27-MANIFEST-PIN-STALE
(value sourced: blob 58c447eb — use for c2/self-verify, never 873e1343),
AS-LANE2-W28-WORKTREE-BOOTSTRAP-ORCH, AS-LANE2-W28-OQ-RULINGS, AS-LANE2-W29-OQ-RULINGS,
AS-LANE2-W210-OQ-RULINGS, AS-LANE2-W211-OQ-RULINGS, AS-LANE2-W211-COMPOSED-PRE-DEPS,
AS-LANE2-PBCH5-MODEL-PROMPT-COMPLIANCE-ITEM, AS-LANE2-APP-TSC-PIN-47-24,
AS-LANE2-PBCH4B-LEGACY-RUN-FIXTURE-ROOTCAUSE, AS-LANE2-S2-TSC-PIN-27, AS-LANE2-SPINE6-R1/R2,
AS-LANE2-PBCH9-CROSSRUN-GATE-DISCLOSURE, AS-LANE2-W21-COLLISION-FINDINGS-DEFERRED,
AS-LANE2-CODER-HARNESS-COMPRESSION-DEATH (standing), AS-LANE2-COMPOSER-LOG-BUFFER-FALSE-DEATH
(standing), AS-LANE2-W2x-COMPOSED-PRE-DEPS, AS-LANE2-W23-LEGACY-LITERAL-WRITE-FREEZE,
AS-LANE2-BROWSER-REVIEWER-FABRICATED-ROUTE, AS-LANE2-W24-CANDIDATE-WHEN-GUARD-ADVISORY,
AS-LANE2-W26-COMPOSER-EMPTY-PROMPT-ABORT, AS-LANE2-W210-PRE-DEPS. No credentials recorded.
No open evidence-debt entries.

## Baseline facts (carry forward)
- Trunk TIP 02e0333a (docs) over 248e9b0c over ff66b3cc; W2-7 candidate cf7d548a (+fix commits
  pending) NOT merged. W2-8 branch off 529b787d.
- Pins: server tsc 26 /tmp/l2t0415-tsc-server.txt; app tsc 34 /tmp/l2t2230-tsc-app.txt; scoped
  fail-file SET 11 files /tmp/l2t2310-w25-baseline-failfiles.txt; goldens 15; MANIFEST blob
  58c447eb; health schemas 192 / lintRules 81; :3093 health at /api/health.
- Specs: W2-7 promoted md5 4fdc584d; W2-8 canonical md5 eb9fa8a8; W2-9 + W2-10 drafts with
  promotion notes (md5 b90c8542-era); W2-11 draft md5 13bdc236 pre-reviewed.
- PITFALLS standing: worktree excludes need `git config --worktree`; worktree add NFS 6-8 min
  background; vitest FROM package dir; cl-lane-stack restart BLOCKING -> background; hermes -z
  logs buffer until exit; pgrep -f matches own cmdline; flock != run lock (NEW, §2).

## Budget
Invoked ~07:50, checkpointed ~08:05 (~15 min). Arc: reconcile both workers first-hand ->
incident (premature fix dispatch, killed, verified no damage, lesson recorded) -> c1 report +
fix prompt verified -> c2 template staged -> Brad packet found ANSWERED (no re-ask) ->
task-list under lock + this handoff. Two live model sessions: W2-8 coder (fleet-single,
appliance-2). No other workers. W2-7 fix + c2 fully staged for next tick.
