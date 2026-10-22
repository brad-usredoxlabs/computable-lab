# LANE 2 HANDOFF — l2t2335/l2t2355 (2026-10-22T00:12 EDT) — ELIG C3 VERDICT: FIX (N1 itemField neuter); FIX-RUN 3 PROMPT STAGED; LANE 1 TOOK THE FLEET LOCK FIRST

Trunk tip: 37cf7163 (docs; code tip cae30d6c — unchanged; NO merges this tick — correct, c3
returned fix). Stack :3093/:5193 200/200. No YAML merged -> no restart.

## RECONCILE (first-hand)
- ELIG fix-run 2 (hermes 2572316) exited code=0 at 23:34 (~41 min, on precedent). Deliverable
  commit 48d9c023 on cl/lane2-matres-elig-l2t1445; name-only diff 172f556a..HEAD = lint/schema/
  data yaml + 5 fixture copies + MaterialEligibilitySchemas.test.ts + report ONLY; evaluate.ts
  untouched (diff empty). ORCH ran myself on 48d9c023: eligibility+MaterialEligibilitySchemas
  8 files/41 tests PASS; typecheck -w server EXIT 0; golden replay 37/37.
- ADVC c3 (hermes, log advc-MATRES-ELIG-c3-l2t2335.log) exited ~23:39 with VERDICT: fix: K/L now
  rejected; all legs green; scope clean; BUT new probe N1: custodyGuard = pinned three keys PLUS
  itemField -> PredicateEvaluator.ts:412-418 projects scalars off a scalar collection -> allowed
  set EMPTY -> noneIn vacuous -> tier-4 bind PASS; loader ACCEPTS the mutant. Defect 2 MINOR:
  meta-schema/depth overclaims.
- ORCH GROUNDING before accepting the direction (first-hand): itemField is a DECLARED property of
  the membership branch in schema/lint/lint-v1.schema.yaml (:295+ block, documented) ->
  additionalProperties:false would NOT close N1; protocol.lint.yaml legitimately uses itemField.
  Correct fix = E12 leg not(exists custodyGuard.itemField). Recorded in the fix prompt.
- FIX-RUN 3 DISPATCH FAILED SILENTLY: flock -n lost the race — lane-1 QMS8C-RESUME(l1t2355) pid
  2741402 (LIVE, 15+ min at check) took the lock at 23:54:31. Our 00:07 attempt produced a 0-byte
  log and NO coder process. Corrected the task-block note (was wrongly "DISPATCHED"). Lesson ->
  assumptions: a 0-byte log with no lsof holder = dispatch FAILURE, not buffering.
- PROTO-AI-13 recount: n=324/500, last ts 22:50:38 — FLAT 5th. INSUFFICIENT-side, no action.

## QUEUE STATE / FLEET ORDER (restated, binding)
FLEET LOCK HELD BY LANE 1 (QMS8C-RESUME pid 2741402). ELIG FIX-RUN 3 QUEUED FIRST behind it
(prompt staged, unchanged worktree/HEAD 48d9c023). Then: c4 gate (report path template below) ->
merge -> REVISE-GHOST-1 coder (worktree wt/REVISE-GHOST-1-lane2-l2t2050 clean on
cl/lane2-revise-ghost-1-l2t2050@92ec682d; spec §0 rulings binding; coder prompt PRE-STAGED at
prompts/coder-REVISEGHOST1-l2tPLACEHOLDER.txt — replace PINNED_TIP/PINSTAMP with the post-ELIG-
merge trunk tip at dispatch; RESET branch to the merge tip first) -> MIXFRAC-1 -> CELLRATE-1 ->
FULFIL (BINDING amendment gate first) -> PANEL -> CHAIN gate.

## HARD RULE ON ELIG CYCLES (recorded in task block + AS-ELIG-FIX3-CYCLE3-OVERRIDE)
Fix-run 3 is an orch-authorized EXCEPTION (measured narrowing each cycle, concrete small fix
direction), NOT a rolling allowance: ANY repeat of the N1 class (or any MAJOR) at c4 -> ARCHITECT
with the probe evidence pack; no 4th coder cycle. Merge only on a c4 VERDICT: accept + own
verification (re-run scoped suite + golden replay on the new HEAD; NEW SCHEMA YAML under
schema/scientist-intent/material-eligibility/** -> cl-lane-stack.sh 2 restart with
background=true; live lint/validate + :3093/:5193 200s).

## C4 PROMPT (pre-staged direction; stamp on dispatch)
Copy prompts/advc-MATRES-ELIG-c3-l2t2335.txt -> advc-MATRES-ELIG-c4-l2t<ts>.txt: retarget base to
48d9c023..HEAD, replay K/L/N1/N2/N3 fresh-authored (never trust coder /tmp files), ONE new guard
defeat attempt beyond itemField (e.g. path-alias via ['candidate']['tier'] style if the grammar
allows, or a second declared key), no-over-rejection leg, the 4 regression legs, scope check
48d9c023..HEAD (allowed files: eligibility lint yaml + fixture lint copy + MaterialEligibility
Schemas.test.ts + report), report -> reviews/MATRES-ELIG-advc4-l2t<ts>.md. Evaluator weakening or
lint-v1 edits in-diff = automatic MAJOR.

## NEXT TICK (priority order)
1. Fleet lock free? (flock -n + pidfile-pid liveness per AS-LOCKFILE-STALENESS) -> dispatch
   prompts/coder-MATRES-ELIG-fix3-l2t2355.txt under flock, log logs/coder-MATRES-ELIG-fix3-
   l2t<ts>.log, pidfile 'ELIG-FIX3(l2t<ts>)'. CONFIRM the coder process exists before exiting the
   dispatch (0-byte log + no lsof holder = failed dispatch).
2. On fix-run-3 exit: dispatch c4 per the template above. Accept -> merge (see hard rule); any
   MAJOR -> architect packet (include probe N1 script, E12/E8 yaml, PredicateEvaluator:412-418,
   spec §7.3/§9 cites, c2+c3 reports).
3. Post-ELIG-merge: REVISE-GHOST-1 dispatch (reset branch to merge tip, stamp prompt, log
   coder-REVISEGHOST1-l2t<ts>.log, report REVISE-GHOST-1-report.wip-l2t<ts>.md). Browser-gate
   window must not overlap PANEL's.
4. PROTO-AI-13 recount every tick (n=324/500, FLAT 5th).

## Blockers / open obligations
- No lane blocker; fleet lock is lane 1's right now (serial by design).
- Brad-level (watched, unchanged): APPENDONLY array-replace escalation
  (decisions/APPENDONLY-array-replace-escalation-l2t1210.md); MIXROLE-1 role-gap enum rides its
  spec phase; CELLRATE-1 OQ-3 wording Brad-overrulable.
- EVIDENCE DEBT OPEN: AS-LANE2-GAPCARD-PARAMINPUT-TRACKED-COPY + AS-CELLRATE-OQ1-PRECLEARED-
  TRACKED-COPY (both clear at main-promotion reconciliation).
- PANEL browser gate post-ELIG-merge; gate windows must not overlap REVISE-GHOST-1's.

## assumptions:
- NEW: AS-ELIG-FIX3-CYCLE3-OVERRIDE (cycle-3 exception rationale; c4 hard stop to architect).
- NEW: AS-ELIG-FIX3-LOCK-RACE-LOST (0-byte log w/o lsof holder = failed dispatch; confirm coder
  pid exists post-dispatch).
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

## live-worker checkpoint at exit (~00:12 EDT; ~41 min used of 45)
- NO lane-2 worker live (fix2 exited+gate consumed; fix3 never launched — lock race lost).
- Fleet lock: lane 1 (QMS8C-RESUME, pid 2741402 live). Vision slot free. Thunderbeast: self only.
- Staged for next tick: prompts/coder-MATRES-ELIG-fix3-l2t2355.txt (dispatch-ready),
  prompts/coder-REVISEGHOST1-l2tPLACEHOLDER.txt (needs tip stamp), c4 direction (this handoff).
