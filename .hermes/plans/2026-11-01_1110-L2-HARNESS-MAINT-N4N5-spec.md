# SPEC — L2-HARNESS-MAINT-N4N5 (lane 2, harness maintenance riders) — l2t1110

Status: orch-authored, claimed 2026-11-01 (Brad-visible non-gating riders filed by architect
ruling Q-D, decisions/TRUNKJOURNEYS-c2-cyclecap-l2t0005-ruling.md). dep L2-TRUNK-JOURNEYS-1
is MERGED (trunk 943c4314) — same harness dir, serialization satisfied (no other live worker
touches the harness dir; the concurrent INTENTID coder is server/src/ai-only with a
harness-dir anti-goal).

All cites below re-anchored by orch at trunk 943c4314 (post-fix4; the item text's line
numbers drifted and are superseded by these).

## N4 — the interception-ban attestation exists but is never enforced (prototype-identity gap)

Facts verified first-hand:
- ui-drive.cjs:76-82 wraps context.route / page.route / setRequestInterception by PROPERTY
  ASSIGNMENT and stamps `attest.route_api_wrapped = page.route._clInterceptionProbe === true
  && context.route._clInterceptionProbe === true` (ui-drive.cjs:80-82).
- run-journeys.py NEVER reads attestations.route_api_wrapped (grep: no match).
- advc-c2 evidence (carried in the item text): prototype extraction
  (`Object.getPrototypeOf(context).route.call(...)` or `context['route']` resolved off the
  prototype chain) bypasses property-assignment wraps — the runtime counter misses it; the
  wrapped-flag attestation is the remaining tripwire, and it too only guards OWN-property
  swaps.

Fix contract (two arms, both required):
1. DRIVER ENFORCEMENT: run-journeys.py requires `attestations.route_api_wrapped === true`
   for every journey receipt that produced a verdict; missing/false = journey RED with a
   violation naming the attestation (never silently green).
2. PROTOTYPE-IDENTITY SNAPSHOT at receipt time: in ui-drive.cjs, capture the ORIGINAL
   function identities (context.route, page.route, context.setRequestInterception) BEFORE
   wrapping, and re-check at receipt write that the CURRENT resolved methods (including via
   prototype chain, i.e. `context.route` after any deletion of the own property) are still
   the wrappers (`._clInterceptionProbe === true`); fold the result into
   route_api_wrapped so a prototype-extraction detour flips it false.
3. Comment honesty (same pass): the ui-drive.cjs comment block at :44-46 overstates
   ("even an injection placed before page creation is counted") — restate to what the
   counters + attestation ACTUALLY catch (own-property registration after the wrap lands
   AND prototype-chain usage now that the identity snapshot exists), naming the residual
   gap honestly if one remains.

## N5 — check-gate exact-set + dead self-check arm

1. check-gate.py:147 computes `missing = declared - set(verdicts)` (incompleteness only);
   a SUPERSET verdicts table (extra bogus journey declared green by a tampered run-meta)
   passes. Require EXACT-SET equality between the declared journeys (journeys/*.yaml) and
   the verdicts keys; superset OR missing both BLOCK, naming the diff.
2. test-channel-selfcheck.py:153 regex arm includes `setDefaultNavigation\s*\(` which can
   never match the real Playwright call `setDefaultNavigationTimeout(` — dead arm. Fix the
   regex to match the real API name (`setDefaultNavigationTimeout`) — do NOT just delete
   the arm; the D1 counter-wrapping in ui-drive.cjs covers the real call only if the
   detector sees it (verify what ui-drive wraps; if nothing wraps setDefaultNavigationTimeout
   today, the regex fix still closes the text-scan hole and the report must say so).

## Placement / ownership

Worktree /mnt/vast/home/brad/git/wt/L2-HARNESS-MAINT-N4N5-lane2, branch
cl/lane2-harness-maint-n4n5 off trunk 943c4314. OWNED FILES (ONLY these three):
.hermes/plans/harness/l2-trunk-journeys/run-journeys.py, check-gate.py, ui-drive.cjs,
test-channel-selfcheck.py (four files). ZERO product code, ZERO YAML outside journeys/
reads, no receipt-directory edits. `git -c core.fileMode=false` for all git commands.

## Verification (RED-first)

1. Self-check gains a prototype-extraction INJECTION case (a /tmp-copy scenario or an
   in-suite construction the existing selfcheck style supports) demonstrating the pre-fix
   bypass goes RED post-fix; plus a case where route_api_wrapped=false makes the driver
   grade a journey RED (drive the driver function, not a helper).
2. check-gate superset case: craft run-meta whose verdicts carry a bogus extra journey ->
   gate BLOCKS (rc=1), names the set diff; existing incomplete case still blocks; exact set
   still greens (regression of the lane-root gate: `python3 check-gate.py` against the real
   receipts root stays green — the real latest 20261101T151312Z carries exactly J1/J2/J3).
3. Full self-check suite green (`python3 test-channel-selfcheck.py` -> SELFCHECK: PASS) —
   previously 42+ cases, none weakened.
4. If you run ANY --fake journey run: leave the backend restored (live sampler
   http://127.0.0.1:18099/api/v1, zero l2trunkj-fake profiles) and prove it with a health
   probe in the report. Prefer NOT running real journeys — the driver-enforcement arm can be
   graded with crafted receipts + direct function drives.
5. NEVER restart or touch :3093/:5193 stacks; no git ops in the trunk worktree.

ANTI-CAP TURN DISCIPLINE: small turns; report APPEND-ONLY; excerpts <=20 lines + file path.

Report: /mnt/vast/home/brad/git/wt/L2-HARNESS-MAINT-N4N5-lane2/deliverables/
L2-HARNESS-MAINT-N4N5-report.l2t1110.md. End marker (last line of final turn AND report):
`N4N5 DONE <full-40-char-sha>` or `N4N5 BLOCKED <reason>`. No merge, no task-list edits.
