# Handoff — lane 1 tick 2026-10-27 16:20–17:15 · GC-8 DONE+MERGED 4b7e2b4c (three-cycle close, T3 re-run on trunk); GC-10 coder LIVE slot-1 — 122nd

Author: orchestrator cron tick (started 16:20 EDT) — lane 1 only. All git -c core.fileMode=false.
:3001/:5174 untouched. Trunk: code tip 4b7e2b4c (GC-8 merge), docs + this handoff.

## GC-8 (calibration + quantification revision) — DONE, MERGED 4b7e2b4c

1. Path: original run + resume (legs 0-6, died-to-token-limit then adopted) -> adv cycle 1
   fix (D1-D5) -> fix run 1 stopped WITH EVIDENCE at the D1 stop condition (a THIRD closed
   capability enum in analysis-run.schema.yaml engineProvenance.capabilitiesReported blocked
   the spec's real terms; tick verified the echo site first-hand, analysisRunner.ts:630) ->
   ORCH RULING AMENDMENT 2 ratified +1 data file (05956fb5,
   .hermes/plans/2026-10-27_GC-8-D1-ruling-amendment-2.md) -> fix run 2 widened the third enum
   EXACTLY (ee837d27) -> adv cycle 2 fix on ONE minor token defect (reviews/GC8-advreview-
   cycle2-l1t1640.md; D1/D2/D4/D5 CLOSED; WEIGHTING_CONFLICT+per_point_declared vs spec-
   canonical PARAM_INVALID+:499 and 'per_point') -> fix run 3 (7ffdb7a7, 2 files, +19/-15) ->
   adv cycle 3 ACCEPT, D3 CLOSED (reviews/GC8-advreview-cycle3-l1t1700.md).
2. Orch close track FIRST-HAND at 7ffdb7a7: python suite Ran 180 OK (skipped=1); chaining
   vitest 6/6 (own run, 96.9s); server tsc 0 errors; residual source greps WEIGHTING_CONFLICT/
   per_point_declared = 0; scope git diff 3cf3a9dd..HEAD = exactly 16 ratified files (+3 schema
   enum widenings: engine/revision per ruling, run per amendment 2), zero production .ts
   (test-only version re-pins), zero app/.
3. MERGED --no-ff 4b7e2b4c (ort, clean). SCHEMA YAML changed -> lane stack RESTARTED
   (cl-lane-stack.sh 1 restart, background; :3092 health ok, 204 schemas, dataDir
   /home/brad/.computable-lab-lane1 via lane1-config). OQ1 T3 real-standards smoke re-run on
   the merged trunk 17:12: decoded REAL .D bytes -> CAL leg calibration_table artifact LANDED
   (3 level rows, model=linear, statistic=weighted_r_squared) -> in-process promote -> QUANT
   leg consumed the promoted model (chain executed end-to-end). compounds_quantified=0 is the
   honest declared result (placeholder amounts, TARGET_UNMATCHED on the butter matrix;
   provenance_status=synthetic_levels_not_production_evidence) — OQ1-ratified DEFERRED posture
   stands; GC-14 owns a real-standards quantitative claim.
4. Carried for gc-wave close (ledger): the THREE-ENUM capability vocabulary copies (AS-L1T1635-2)
   should consolidate into a shared capability-vocabulary data file; cycle-2 OBSERVATIONs in the
   review files remain fold candidates for GC-11/GC-12.

## GC-10 (chromatogram + Compare) — coder LIVE slot-1, healthy

- Launcher 2946948 alive at 17:05 (~68 min; expected 90-150 min, due ~17:45, 2x ~19:30).
  Last poll: commits 1ee43190 (RED) + 73ce6e43 (GREEN traceModel core), in-flight
  ChromatogramView.tsx/.test.tsx + AnalysisPage.css + client.ts; report has real content.
  Do NOT re-dispatch while the launcher PID lives.
- NEXT TICK: on `GC10 DONE <sha>` -> adversarial gate (diff base f571e2b9..HEAD; unique report
  reviews/GC10-advreview-cycle1-l1t<ts>.md; cite the cycle-1 path convention correctly — newer
  reports live under /home/brad/.hermes/cl/lanes/1/reviews/). On ACCEPT -> orch verify (app
  vitest src/analysis incl. frozen GC-9 trio, both tsc baselines, chart-dep grep 0, signal-
  renderer-output unchanged) -> lane-stack restart (view-spec YAML changed) -> route curl
  proofs -> browser gate MANDATORY (orch deterministic-Playwright route first +
  inner-scroller technique; receipts receipts/GC-10/<ts>/; criteria = promoted spec
  §Verification 5 a-h verbatim; seeds its own succeeded runs via API per the spec).
- GC-11 composer: dispatch the tick GC-10's shipped exports are known (its ChromatogramView/
  compare exports + view-spec ids) — its re-anchor needs them; commission then.

## Queue / slots at checkpoint

- Slot-0: FREE (GC-8 closed; launcher exited clean). Slot-1: GC-10 coder live (due ~17:45).
- Thunderbeast: orch + lane-2 orch + lane-2 composer. Vision slot FREE.
- Lane stack healthy on the MERGED trunk (:3092 health ok post-restart; :5192 200). 0 due
  blockers. Queue: GC-10 in-progress; GC-11/GC-12/GC-13/GC-14 todo behind deps.

## assumptions:

- AS-L1T1635-1 CLOSED-AT-MERGE (third enum widened exactly as ratified; commit ee837d27 merged;
  acceptance evidence = chaining 6/6 + ajv probes, not the assumption).
- AS-L1T1635-2 stays OPEN as a gc-wave-close cleanup (three enum copies; consolidation deferred).
- AS-L1T1635-3 stands (systemd-run bare-path form; folded into cl-coder-launcher-pattern skill
  this tick).
- AS-L1T1605-2 (table publisher pins NO capability — legacy no-gate path analysisRunner.ts:697)
  CLOSED-AT-MERGE: adv cycle 2 re-proved the gate leg (succeeded CAL run is the proof).
- AS-L1T1605-1 carried (GC-10 worktree config copy; GC-10 still running with it).
  AS-L1T1520-1/2, AS-L1T1405-1 carried; AS-L1T1405-2 CLOSED-AT-MERGE for GC-9 earlier; stands
  for GC-10's gate. AS-L1T1400-2 carried (token-death watch — GC-10 healthy at report-first).
  AS-L1T1310-1/2, AS-L1T1243-1, AS-L1T1250-1, AS-L1T1207-1/2, AS-L1T1155-1/2, AS-L1T1105-1
  carried.
- CARRIED FORWARD: AS-L1T0710-2, AS-L1T0020-2 thunderbeast-non-growth (evidence_debt=TRUE),
  AS-L1T1520(lane2)-2 fields<->properties seam OPEN, AS-L1T1200-1, AS-L1T2355-2 CAS anchors
  (close at GC-wave close), GC-1 vendor-format (low), GC-5 admin-bootstrap email bug
  (LocalIdentityService.ts:69-77, out of scope), AS-L1T2245-1..4, 'Analysis' heading,
  GC-8 $ref-path fact, GC-4 coder AS-1..AS-6, GC-6 cycle-3 OBSERVATIONs, AS-L1T0500-1..3,
  AS-L1T0950-2 carried, GC-7 cycle-3 ratio-helper OBSERVATION (folded), GC-9 cycle-2 6
  OBSERVATIONs, GC-8 cycle-1 12 OBSERVATIONs (reviews at ~/.hermes/cl/reviews/GC8-advreview-
  cycle1-l1t1455.md §4 — now-fold candidates for GC-11/GC-12; O1 ISTD self-ratio amount and O7
  promoted-bytes-vs-envelope wording most substantive), GC-8 cycle-2 2 OBSERVATIONs + cycle-3
  2 OBSERVATIONs (addendum-corrects-in-place convention; all-unit-1/x reports none).
- EVIDENCE DEBT OPEN: AS-L1T0020-2 ONLY.

### 1716 SECOND ADDENDUM (budget-expiry checkpoint) — GC-10 coder DIED BY TOKEN LIMIT; RESUME = NEXT TICK'S FIRST ACTION

GC-10 l1t1550 EXITED rc=0 17:14:29, log tail = output-token-limit death (AS-L1T1400-2 class),
NO end-marker. Launcher 2946948 confirmed GONE 17:15 — slot-1 (and slot-0) FREE. Adopted state
first-hand: legs A-D committed (1ee43190 RED, 73ce6e43 B traceModel, ceef642f C ChromatogramView
92-green, 06003114 D CompareTraces 107-green, tsc 21/0), leg-E IN-FLIGHT UNCOMMITTED (8 files
+228/-18 — ViewRenderer+tests, AnalysisPage.tsx/.css, ChromatogramView tweak, view-spec.schema.
yaml enum +22, analysisSchema.test.ts +34). Remaining: commit E after vitest src/analysis green,
deliverable [F] gate runbook, close battery incl. the report's hard-stop audit (lines 60-69).
NEXT TICK FIRST ACTION: GC-10 RESUME run (same worktree/branch, free slot, bare-path systemd-run
launcher, unique l1t<ts>resume log/report tokens, prompt = adopt-don't-re-explore: everything is
on disk; report-first; end-marker GC10 RESUME DONE <sha>/BLOCKED). The soft-budget rule blocked
dispatching it this tick (expired 17:05, GC-8 close consumed the tail). Task stays in-progress;
details in task-list tick_reconcile_20261027T1716.
