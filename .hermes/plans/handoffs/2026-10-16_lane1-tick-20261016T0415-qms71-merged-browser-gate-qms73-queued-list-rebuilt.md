# Handoff — lane 1 tick 2026-10-16 03:41–04:25 EDT (QMS7-1 merged code-track + browser gate running; QMS7-3 spec promoted + coder queued; TASK-LIST DESTRUCTION + FULL REBUILD)

Author: orchestrator cron tick — lane 1. :3001/:5174 never touched. :3092 200 + :5192 200.
Trunk cl/integration-1: 906e7c82 (QMS7-3 spec promotion) then **0a9fcd70** = merge --no-ff of
wt/QMS7-1-lane1-l1t0140 (QMS7-1, code-track). porcelain -uno clean.

## INCIDENT (worst first): task-list.md destroyed and rebuilt — trust the rebuild, read this

At ~04:07 one of my update scripts did `s = open(p).read()` then later `open(p,'w').write(...)`
but an assert fired between the two — except the FIRST failed attempt (04:07 run, before the
assert fix) had already truncated the file to 0 bytes: python `open(p,'w')` truncates at OPEN,
and the exception came after. The live list (369K) was gone.

RECOVERY (complete, verified): rebuilt from `task-list.md.bak-wave3` (snapshot 2026-10-15
19:01, wave-1/2 history + OWN blocks intact, wave-3 not yet appended) + the APPROVED wave-3
intake blocks (`~/.hermes/specs/intake/2026-10-15_qms-registry-unification-wave3/
wave3-append-blocks.md` — architect-authored, Brad "approved as is" 2026-10-15 — plus
`qms7-9-append-block.md`), then stamped current statuses from FIRST-HAND tick evidence only:
QMS7-2 done (my own merge/live-probe this week), QMS7-1 in-progress with
`merge_pending_browser` block, QMS7-3 in-progress claimed (spec promoted 906e7c82), QMS7-9
in-progress coder-live. Reconstruction banner at the file top records all of this. Sanity
anchors checked on a STAGED TMP file before atomic os.replace. 41 `status: done`, ids through
QMS7-9 verified.
LOST (recoverable from handoffs, not re-inlined): per-item tick_reconcile chatter written to
the live file between 10-15 19:01 and 04:07 (composer dispatch pids, coder queue notes,
handoff_latest lines). The durable record of every one of those is in
.hermes/plans/handoffs/ — nothing load-bearing is lost.
LESSON (standing): NEVER open(p,'w') on the list; write p+'.tmp' then os.replace, and run ALL
asserts BEFORE opening anything for write. This is now a pinned rule for every future tick
script in this lane.

## QMS7-1 — MERGED code-track; browser gate is the ONLY open obligation

Chain this tick: coder exited 03:03 rc=0 (last tick) -> ADVERSARIAL GATE **VERDICT: accept**
(reviews/qms7-1-advreview-l1t0320.md, exit 0, zero P0/P1, 3 P2 advisories; reviewer re-ran the
diff, tsc pin, vitest, scope) -> MY OWN verification -> merge --no-ff **0a9fcd70** -> vite
confirmed serving RegistryHostPage.tsx from the merged trunk on :5192 -> browser gate
DISPATCHED (tier-1 cl-browser-reviewer, bg pid 2847178, log
logs/browergate-QMS71-<ts>.log, receipts ~/.hermes/cl/receipts/QMS7-1/<ts>/).

My verification (first-hand, not the reviewer's word):
- Diff opened in full: 13 files +578/-8 == the spec's 12 §11 app files + handoff, exactly.
  RegistryHostPage = AppShell+tab+RightPane over RecordRegistryPage on SCRATCH_STUDY_ID;
  OQ2 effect guarded by useOptionalWorkspace with stable-callback deps (no loop bait);
  root div h-full min-h-0; 'registry' tab kind threaded through ALL six never-guard sites +
  systemPromptKindForTab null-list; tabPath/stableTabId added; no server/schema/YAML in diff;
  zero casts (read the hunks myself).
- `npx tsc --noEmit` MY run: 23 error lines; the spec's exact multiset pin re-computed by me:
  sha256 **723a7fb86ab0ec242d9185ef683abb4f8d9130740b45f9e7e0a1dbc9cbeaeecb** — byte-exact,
  zero drift. (My first naive grep-based normalize showed 3 files in the touched set; the
  errors in Viewer/ViewerToolbar/systemPromptForViewer are the PINNED pre-existing protocol-
  review/never-arm errors at those files — the pin, not my eyeball, is the arbiter.)
- Touched-file proof MY run: 29 files / 219 tests GREEN incl. RegistryHostPage.test.tsx 6/6.
- FULL app suite MY run: 62 failed | 284 passed files / 66 | 2257 tests == the 61-file
  baseline + AddMaterialForm.biological (reviewer + coder both proved it a load flake;
  MY isolated re-run: 2/2 GREEN). Fail-set equality holds.
- RED trail non-vacuous: a1d07b44 fails at base ("Failed to resolve import RegistryHostPage").
- Browser gate criteria (verbatim from verified-by) handed over: shell+strip+right-pane render;
  refresh/back-forward no duplicate Registry tab; tab switch round-trip; /record/:id
  unchanged; selection->AI-context re-target + clear->project-details.

NEXT TICK: read logs/browergate-QMS71-*.log + trail.json/screenshots. VERDICT: accept ->
mark QMS7-1 done in the list + handoff. VERDICT: fix -> defect list verbatim to a new coder
run on wt/QMS7-1-lane1-l1t0140 (fleet-queued). No trail/timed-out -> tier ladder (SOUL 6c):
tier-2 = `-m deepseek/deepseek-v4.1-flash --provider openrouter -p cl-browser-reviewer`;
two failed attempts on THIS revision -> harness is the suspect, escalate as infra defect,
task stays in-progress with evidence debt — never a blind same-tier re-shot.

## QMS7-3 — spec PROMOTED, coder QUEUED (fleet)

Composer exited (no session), draft LANDED 03:19 (433 lines, self-declared first-hand recon).
I spot-checked every load-bearing cite at trunk a584770c BEFORE promotion: equipment-class
:10 top-level unevaluatedProperties:false; FAIRCommon bare; 7 kinds lifecycleId-free;
instrument special shape (:8 additionalProperties:false, no FAIRCommon); lifecycle.meta
roles/description legal + additionalProperties:false; document-control archive arm;
RoleResolver grant-scoping :23-24; ALL THREE lane grants scoped document-controlled-signing
(live lane data read: GRANT-DEMO-AUTHOR/REVIEWER/QMS8-ADMIN); POL-REGULATED
enforceTransitionRoles deny; middleware `?? status` fallback + generic denial wording;
PredicateRegistry throw precedent; SchemaRegistry has()/getAll. ALL HOLD.
RULED: OQ1 YES — post-merge I author GRANT-QMS7-REGOPS (lane DATA: lifecycleId registry-ops,
roles [author, approver], userId USR-QMS-ADMIN + ACL) like the OPS-1 precedent; OQ2 NO guard
(defer to QMS7-4/6); OQ3 keep exactly 7 kinds; OQ4 warn+continue wiring.
AS-ORCH-L1-100 note folded into the spec (seed `model` key — worker must not touch seed).
Promotion commit 906e7c82. Queue: queue-qms7-3.sh (bg pid 2838825) blocking on the fleet
lock BEHIND QMS7-9; worktree wt/QMS7-3-lane1-l1t0400 builds at lock time; prompt
prompts/coder-QMS73-l1t0400.txt; log logs/coder-QMS73-l1t0400.log; report
qms7-3-report-l1t0400.md; end-line "QMS7-3 DONE ...". Server task: post-merge flow =
adversarial gate -> my verify (server tsc 0 pin, governance suites, scope) -> merge ->
LANE RESTART (YAML lands!) -> live gate per spec §live: POST equipment-class governed draft;
PUT draft->active as USR-QMS-ADMIN (needs my GRANT-QMS7-REGOPS first); unauthorized 422 with
generic wording; training-material still document-control. NO browser gate (no UI).

## LIVE at checkpoint (do NOT duplicate)

- QMS7-9 CODER LIVE: hermes pid 2755643 since 03:43, fleet lock holder (pid-file
  QMS7-9(l1t0310) 03:37), worktree wt/QMS7-9-lane1-l1t0310 off a584770c, log
  logs/coder-QMS79-l1t0310.log, report qms7-9-report-l1t0310.md, end-line "QMS7-9 DONE ...".
  Expected ~1-1.5h (small app-only task); SOUL-7b: 2x/3x rules apply. On exit: adversarial
  gate (unique path) -> my verify (tsc 23-pin, targeted vitest, scope ==
  VendorPdfSearchSection+tests) -> merge -> browser gate :5192/ingestion/vendor-pdf
  MANDATORY (upload .md end-to-end + unsupported refusal + search/bring-back unchanged).
- QMS7-1 BROWSER GATE LIVE: wrapper pid 2847178 (tier-1). Lane-2's SHQA4 flock wrapper
  2743409 is queued behind my QMS7-9 on the same lock — lane 2's business.
- Queue: queue-qms7-3.sh (bash pid 2838825) waiting on flock. Queue order on the lock is
  NOT FIFO — reconcile pid-file + live pids, never assume.
- OWN-14 md5 1f41d881 UNCHANGED — not re-asked. OWN-12 gate-owner unchanged. Cheap gate:
  0 due/changed blockers.

## Next tick (ordered)

1. QMS7-1 browser gate verdict -> done or fix-route (tier ladder if dead). Update list +
   handoff (list file is now the REBUILT one — edit via staged tmp + os.replace ONLY).
2. QMS7-9 coder on exit -> full chain above.
3. QMS7-3 coder on exit -> adversarial gate -> my verify -> merge -> RESTART lane stack
   (YAML!) -> I author GRANT-QMS7-REGOPS + ACL in lane data via :3092 API (record API,
   not hand-YAML, per EDITOR-2 fixture rule) -> live gate verbatim from spec §live + the
   task-list verified-by.
4. If the queue fires QMS7-3 while a QMS7-1 fix run is needed: fleet-single — fix run and
   QMS7-3 serialize on the lock; that is fine, check pid-file stamps.
5. Consider (spec-composition, when coder queue depth allows): QMS7-4 composer next (its
   block carries AS-ORCH-L1-100 seed-model fix + the coverage-widen decision from QMS7-3
   OQ3 + archive semantics).

## Evidence-debt / carried (OPEN unless stated)

- OPEN: AS-ORCH-L1-042; AS-ORCH-L1-068 (OWN-14's gate); AS-ORCH-L1-082 (record-only);
  AS-ORCH-L1-087 PARTIAL; AS-ORCH-L1-088; AS-ORCH-L1-089; AS-ORCH-L1-096; AS-ORCH-L1-097;
  AS-ORCH-L1-099 (promotion-commit message override — grep audits for provenance).
- CARRIED: AS-ORCH-L1-100 (EQC-QUANTSTUDIO5 seed `model` key vs schema; resolution planned
  at QMS7-4's seed work; QMS7-3 worker told not to touch seed).
- NEW: AS-ORCH-L1-101 below (the list rebuild itself).
- QMS7-1 browser-gate evidence obligation: OPEN by definition until receipts accept.

## assumptions

- AS-ORCH-L1-101: task-list.md is a RECONSTRUCTION from the 19:01 10-15 snapshot + approved
  intake blocks + first-hand tick status stamps; per-item reconcile chatter 10-15 19:01 ->
  10-16 04:07 lives only in handoffs. Any future dispute about wave-3 task TEXT resolves to
  the intake packet blocks (Brad-approved), which is exactly what the rebuilt file contains.
  Reversible: source materials all on disk.
- AS-ORCH-L1-102 (small): QMS7-1 full-app fail-set compared to the spec's 61-file baseline
  captured at 71412415; trunk moved since. The one delta file failed under load only and
  passed isolated twice (coder, reviewer, me) — treated as proven flake, not new failure.
- Orch assumption: vite HMR serving the merged tree was proven by fetching
  /src/shared/shell/RegistryHostPage.tsx through :5192 (transformed source returned) — the
  browser gate re-pins the full surface.
- Fleet assumption: QMS7-9's worktree base a584770c already contains QMS7-2; no rebase
  needed; zero overlap with the pending QMS7-3 server surface.
