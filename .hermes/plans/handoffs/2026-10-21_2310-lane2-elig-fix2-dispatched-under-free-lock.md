# LANE 2 HANDOFF — l2t2250 (2026-10-21T23:10 EDT) — ELIG FIX-RUN 2 DISPATCHED (lock was FREE); C3 PROMPT PRE-STAGED; VERIFICATION LEGS STILL PRE-POSITIONED

Trunk tip: a881a2fd (docs; code tip unchanged cae30d6c). No merges this tick. Stack :3093/:5193
200/200. No YAML changes on trunk -> no restart.

## RECONCILE (first-hand)
- Previous handoff (l2t2210) said ELIG fix2 gated on the fleet lock held by lane-1 QMS8C.
  CHECKED FIRST-HAND at 22:50: lock reports FREE via flock -n; pidfile names QMS8C(l1t2205)
  pid:2463306 and kill -0 says that pid is GONE -> stale lockfile entry per AS-LOCKFILE-STALENESS;
  no cl-coder process existed fleet-wide. Lock was genuinely free.
- ELIG worktree wt/matres-elig-lane2-l2t1445 at 172f556a (base of fix2), status clean apart from
  the known-not-mine untracked draftChanges.{ts,test.ts} (named off-limits in the prompt).
- PROTO-AI-13 recount under task-list.lock: n=324/500 (last ts 2026-10-21T22:50:38.249Z) — FLAT
  4th. INSUFFICIENT-side, no action. File /home/brad/.computable-lab-lane2/shadow-router/events.jsonl.
- CELLRATE-1 / MIXFRAC-1 / REVISE-GHOST-1: unchanged queue positions (behind ELIG merge, binding
  fleet order). GAPCARD-1 composer log speccomposer-GAPCARD1-l2t2110.log is from Oct 19 and
  already harvested/promoted — no pending composer artifact.

## PIPELINE WORK THIS TICK
1. ACQUIRED fleet lock + dispatched ELIG FIX RUN 2 (fix cycle 2 of max 2): wrapper bash 2572260,
   flock 2572315, hermes pid 2572316, pidfile 'ELIG-FIX2(l2t2250) ... pid:2572316', log
   lanes/2/logs/coder-MATRES-ELIG-fix2-l2t2250.log (buffered 0 B until exit — normal), SAME
   worktree/branch, prompt prompts/coder-MATRES-ELIG-fix2-l2t2210.txt (verbatim c2 defect list +
   reviewer fix directions, RED/GREEN replay of probes K+L mandated, no-over-rejection probe,
   evaluator untouched, unique report coder3-fix2.md, single scoped commit).
2. Task block updated under lock: FIX-RUN 2 DISPATCHED note + status todo -> in-progress.
3. ADVC C3 prompt PRE-STAGED at prompts/advc-MATRES-ELIG-c3-l2t2250.txt: replay K+L with
   ORCH-fresh probe authorship mandated (don't trust coder's /tmp files), ONE NEW adversarial
   guard-defeat shape beyond c2 (alias/negation-wrapped/mirror predicate), no-over-rejection leg,
   regression legs (elig suites exact counts, typecheck -w server EXIT 0, golden replay 37/37,
   scoped >=43 files/448), scope check 172f556a..HEAD, evaluate.ts weakening = automatic MAJOR.
   Output path contains 'l2tPLACEHOLDER' — REPLACE with the actual dispatch stamp before use.
4. Liveness verified via lsof (30 fds, state.db held, log fds): coder alive at 23:06, ~14 min in;
   fix-run 1 precedent ~50 min -> expected exit ~23:40-23:50, 2x ~00:45, 3x ~01:50 (rule 7b).

## QUEUE STATE / FLEET ORDER (restated, binding)
ELIG fix-run 2 LIVE (hermes 2572316, lock holder) -> C3 gate -> merge -> REVISE-GHOST-1 coder
(worktree wt/REVISE-GHOST-1-lane2-l2t2050 staged at 92ec682d; PIN post-ELIG-merge tip in prompt;
spec .hermes/plans/2026-10-21_2030-REVISE-GHOST-1-revise-remount-spec.md, §0 rulings binding,
§8 discriminator curl RED before any edit) -> MIXFRAC-1 -> CELLRATE-1 -> FULFIL (spec carries
BINDING amendment gate: read MATRES-FULFIL-postrecv-reverify-amendment.md FIRST, D-1..D-10
supersede cites; prompt additions P1-P5 verbatim) -> PANEL -> CHAIN gate.

## NEXT TICK (priority order)
1. If fix2 STILL LIVE: observe only (do NOT duplicate). If EXITED: run ADVC c3 using
   prompts/advc-MATRES-ELIG-c3-l2t2250.txt (stamp the report path; launch background, own log
   advc-MATRES-ELIG-c3-l2t<ts>.log). If NO probe-K/L improvement on c3: route D1-shape-pin to
   architect with probe evidence (rule 6/7), do NOT merge, do NOT run a 3rd fix cycle.
2. On C3 ACCEPT merge myself: verification legs already green on 172f556a (handoff l2t2210 §3) —
   re-run scoped suite + golden replay on the NEW HEAD only. Merge --no-ff into cl/integration-2
   (inspect trunk first; three-dot base 6f8fb519). NEW SCHEMA YAML under
   schema/scientist-intent/material-eligibility/** -> cl-lane-stack.sh 2 restart with
   background=true (BLOCKING script), live lint/validate + :3093/:5193 200s -> mark MATRES-ELIG
   done in task-list + promote report to canonical + assumptions + handoff.
3. Post-ELIG-merge: dispatch REVISE-GHOST-1 under fleet lock with pinned tip (log
   lanes/2/logs/coder-REVISEGHOST1-l2t<ts>.log; report .hermes/plans/REVISE-GHOST-1-report.wip-l2t<ts>.md).
   Browser-gate window must not overlap PANEL's (shared fixture run page).
4. After REVISE-GHOST-1 merge: MIXFRAC-1 (blessed), then CELLRATE-1 (confirm tracked
   draftChanges.ts at its dispatch tip — true from cae30d6c).
5. PROTO-AI-13 recount every tick (n=324/500, FLAT 4th).

## Blockers / open obligations
- No lane blocker. ELIG at fix cycle 2 of max 2: no improvement -> architect, not merge.
- Fleet lock held by US (ELIG-FIX2 l2t2250); lane-1 serializes behind us now. Release is at
  coder exit (flock -c wrapper).
- Brad-level (watched, unchanged): APPENDONLY array-replace escalation
  (decisions/APPENDONLY-array-replace-escalation-l2t1210.md); MIXROLE-1 role-gap enum rides its
  spec phase; CELLRATE-1 OQ-3 wording Brad-overrulable.
- EVIDENCE DEBT OPEN: AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY + AS-CELLRATE-OQ1-PRECLEARED-
  TRACKED-COPY (both clear at main-promotion reconciliation).
- PANEL browser gate post-ELIG-merge; gate windows must not overlap REVISE-GHOST-1's.
- AS-LOCKFILE-STALENESS stands: reconcile pidfile-pid liveness before trusting the lockfile
  (this tick it correctly flipped HELD->FREE and lane 2 took the lock legitimately).

## assumptions:
- NEW: AS-ELIG-FIX2-LOCK-FREE-BY-PID-CHECK (lockfile said QMS8C but its pid was dead; flock -n
  confirmed FREE — lane 2's dispatch is legit, lane-1 QMS8C had exited without clearing the
  pidfile; consistent with AS-LOCKFILE-STALENESS, not a violation of fleet single-coder).
- CARRIED, IN FORCE: AS-ELIG-FIX2-SCOPE-READ, AS-FULLSUITE-GONE4-FLAKY,
  AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY [evidence debt], AS-CELLRATE-OQ1-PRECLEARED-
  TRACKED-COPY [evidence debt], AS-LOCKFILE-STALENESS, AS-CELLRATE-OQ2-OQ3-RULINGS,
  AS-CELLRATE-SEQUENCING-PRECOMMIT, AS-MIXFRAC1-AMEND-PROMOTED-BINDING,
  AS-REVISEGHOST-DISPATCH-PINNED-TIP-PENDING, AS-REVISEGHOST-OQ1-RULED, AS-REVISEGHOST-FLEET-SLOT,
  AS-REVISEGHOST-USECHATTHREAD-PATH, AS-REVISEGHOST-COMPOSER-LEG-NUMBERS,
  AS-MIXFRAC1-OQ1-RULING-HARVESTED, AS-MIXFRAC1-OQ2-OQ3-OQ4-RATIFIED,
  AS-FULFIL-REVERIFY-PATCHES-BINDING, AS-ELIG-NO-FILE-OVERLAP-RECV, AS-CHAIN-OQ-RULINGS,
  AS-RECV-D6-VENDORSCAN-RULED, AS-CHAIN-ACCEPTS-RIDE-RAIL-A, AS-RECV-OQ2-RATIFIED,
  AS-RECV-OQ1-DEFERRED, AS-RECV-OQ3-GOVERNANCE, AS-RECV-NO-BROWSER-GATE,
  AS-ATTEST-DISPATCH-UNDER-DEFAULTS, AS-ATTEST-OQ-RULINGS, AS-ATTEST-NO-BROWSER-GATE,
  AS-REPLAY-PARTIAL-CLAIM, AS-REPLAY-READONLY-LANE-REPO, AS-ELIG-SCREENING-NOT-AUTHORITY,
  AS-ELIG-DEP-DISCHARGED, AS-LANE2-UIWITNESS-ORCH-SCRIPTED, AS-LANE2-WITNESS-NO-ACCEPT,
  AS-LANE2-ORPHAN-RESTART, AS-LANE2-OPTIONBIND-TSC-BASELINE-0, AS-FULFIL-OQ1-FORMULA-QUEUED,
  AS-RECV-MERGE-FLAKE-FOUNDRY, AS-APPENDONLY-ARRAYS-REPLACE (escalated; lane protected).

## live-worker checkpoint at exit (~23:08 EDT; ~18 min used of 45)
- ELIG FIX-RUN 2 LIVE: hermes pid 2572316 (wrapper 2572260, flock 2572315), fleet lock ours,
  log lanes/2/logs/coder-MATRES-ELIG-fix2-l2t2250.log (0 B = buffered, normal; liveness proven
  via lsof). Landed deliverables: on-branch report .hermes/plans/MATRES-ELIG-report.l2t1445-
  coder3-fix2.md. Expected exit ~23:40; 2x 00:45, 3x 01:50.
- No other lane-2 worker live. Vision slot free. Thunderbeast: self only. No browser gate due.
