# FAME-4G platform decision — architect ruling (lane 1, 2026-11-01)

Request: `2026-11-01_fame-4g-platform-render-decision-request.md`.
Decision maker: cl-architect. Evidence read first-hand: gate report
`/home/brad/.hermes/cl/receipts/FAME-4/gate-l1t1855/report.md` (+ trail refs),
`server/src/analysis/analysisService.ts:240-242`,
`server/src/api/handlers/AnalysisHandlers.ts:87-90`,
`app/src/analysis/AnalysisPage.tsx:295-314`,
`server/src/store/types.ts:64-76` (RecordFilter), `server/src/store/RecordStoreImpl.ts:453-520`,
`server/src/api/handlers/TreeHandlers.ts:1666-1690`, `schema/knowledge/view-spec.schema.yaml`,
live GETs on :3092 (read-only).

## 0. Live re-verification (architect, independent of the orchestrator's)

- `GET /api/analysis-runs` -> 50 runs, `total: 50`, first `ANR-000001`, last `ANR-000050`;
  `ANR-000049` present, `ANR-000055` absent. `GET /api/records?kind=analysis-run` -> **65** true
  records (the request said 61; FAME-5's runs are accruing LIVE — the cap worsens every tick).
- D1 cause confirmed verbatim: `analysisService.list(kind, limit = 50)`; `listRuns` returns
  `total: runs.length` (AnalysisHandlers.ts:89) — the misreport is real, not a display artifact.
  `RecordStoreImpl.list` returns scan-order (recordId order => oldest-first) records truncated at
  the limit, so the client only ever sees the OLDEST 50.
- `AnalysisPage.tsx:300` `if (!runs.some(r => r.recordId === deepLinkRun)) return` — deep link is
  gated on list membership; confirmed the exact silent-empty-state behaviour the trail measured.
- **D2 nuance the request did not state:** `GET /api/analysis-runs/ANR-000055` -> 200, and its
  `payload.outputManifest` already carries `views: [assignment_results_view, analyte_summary_view,
  effective_parameters_view]` (renderer `table`) plus the full `{columns,rows}` artifact values —
  the same data AOUT-000096/099 published. The /analysis ViewRenderer path renders exactly this
  shape for reachable runs (gate pass-1 proved it on ANR-000049). So the artifact tables DO have a
  legitimate renderer; the only wall is reachability.
- Reuse found: `TreeHandlers.listRuns` (GET /runs, the study-run collection) already parses
  `limit`/`offset` query params (default 200) and sorts `updatedAt` descending. `RecordFilter`
  already supports `limit` and `offset`. The pattern to follow is in-repo; nothing new is needed.
- `schema/knowledge/` has NO `analysis-output-artifact.ui.yaml` and no `analysis-run.ui.yaml` —
  the /record/AOUT-* 404 is a genuine missing-data gap (declarative surface absent, not code bug).

## 1. Ruling — Option 3: narrow the fix to REACHABILITY (FAME-4G), re-gate FAME-4 after it,
##    and let FAME-6 keep the artifact-SURFACE scope it was approved for.

Options 1 and 2 are both half-right. Folding D1+D2 into ONE platform item overreaches (it
pre-empts FAME-6's approved report/artifact-surface scope); accepting FAME-4 now under-reaches
(verification-claims rule BRAD-BINDING: a UI claim without a live round-trip receipt on the NAMED
leg is false; "works" means Brad clicks it). The evidence shows D2 is not really a second blocker:
once a run is reachable, its published table data renders through the existing declarative
view-spec + ViewRenderer path. So FAME-4G is ONE defect: newest runs unreachable.

### FAME-4G — "analysis run lists are reachable and honest" (SMALL platform item, lane 1)

Scope (strictly generic, zero FAME vocabulary):
1. Server: `AnalysisHandlers.listRuns` honours `limit`/`offset` query params (reuse the
   `TreeHandlers.listRuns` parse pattern; `RecordFilter` already supports both) and returns runs
   newest-first (sort by `updatedAt` desc like TreeHandlers, or by numeric id suffix — coder's
   choice, acceptance just requires the newest runs to be in the default page).
2. Server: `total` must be the TRUE count of kind=analysis-run records, never `runs.length`.
   Answer to question (c): YES — the misreport is part of FAME-4G, obligation 2 above. A truncated
   list that claims `total == returned` is the defect that made D1 invisible to every consumer;
   leaving it would re-hide the next cap crossing at 200.
3. Client: the `?run=` deep link resolves by FETCHING the run by id (`GET /api/analysis-runs/:id`
   exists and returns 200 for ANR-000055 today) instead of gating on list membership
   (AnalysisPage.tsx:300). Keep the one-shot ref discipline and the param strip; the
   selectRun/manifest-seed landing is reused verbatim.

Size bound: two server files + one client file + their tests; **<=150 changed product lines**,
no schema change, no new record kinds, no ui-spec additions, no UI redesign. Any coder report
exceeding the bound comes back to me before merge. D3/D4/D5 minors stay intake-grade — NOT in
FAME-4G (the lane keeps its own defect ledger; mixing visual minors into a reachability fix
inflates the merge-gate surface).

The generic `/record/AOUT-*` view spec (making D2's residual — a standalone artifact-record
surface — declarative) is deliberately NOT in FAME-4G: that is FAME-6's approved territory
(report rendering via view specs; "fold, don't found"). FAME-6's spec author should treat
"artifacts have no generic published surface" as an input to its own scope, and FAME-7's
cross-run binding will want the same reachability FAME-4G provides.

### (a) Does FAME-4 close on the amended reading? NO.
Wire honesty (adv2 + orch recompute) plus the ANR-000049 sibling render is real evidence, but the
named legs ANR-000055/056 cannot be opened and the gate itself ruled the sibling render
insufficient ("wire truth is not the acceptance bar"). I do not overrule my own gate. FAME-4 stays
in-progress, and closes via a re-gate: after FAME-4G merges + stack restart, cl-browser-reviewer
re-runs ONLY obligations 1, 2, 5-registry-clause on `/analysis?run=ANR-000055` and
`?run=ANR-000056` (expect: analyte_summary table with 1664.7037274749032/100 on AOUT-000099's leg
and the excluded row rendering NULL/NULL as empty cells) plus a console-clean check. Obligations 3
and 4 already hold full round-trip receipts and are not re-litigated. Expected cost: one targeted
gate pass, not a full re-gate.

### (b) What carries the fix; does it gate FAME-5/FAME-6?
FAME-4G carries it — a lane-1 platform item the orchestrator creates and dispatches itself under
normal merge gates (adv + orch; browser gate for FAME-4G = the deep link resolving live on
ANR-000055 + the list showing the newest runs first with truthful total). Ordering:
- FAME-4G merges + :3092/:5192 restart BEFORE the FAME-4 re-gate.
- FAME-4G also gates FAME-5's browser gate — YES, explicitly: FAME-5's runs land even deeper past
  the cap (live count 65 and climbing); a FAME-5 gate today is a guaranteed re-trip. FAME-5's
  CODING may continue (it must — its artifacts are wire-verifiable); only its browser gate waits.
- FAME-6: transitively gated already (deps FAME-4+FAME-5 merged, and FAME-4 now closes via
  FAME-4G), so no separate gate edge is added.

### (c) The `total = runs.length` misreport: YES, in scope (FAME-4G obligation 2, above).

## 2. Why this is the computable-lab way
Zero hardcoded domain truth: the fix touches only list/paging plumbing and a route-resolution
rule; rendering stays 100% declarative (view-specs riding the manifest, ViewRenderer as shipped).
No FAME vocabulary anywhere in FAME-4G. No new surface founded where one exists (/analysis already
renders these tables — reachability, not capability, is the gap). The generic-artifact-record
surface remains DATA (a future ui.yaml) and remains FAME-6's call.

## 3. What the orchestrator does next
1. Create FAME-4G in `~/.hermes/cl/lanes/1/task-list.md` with the scope, size bound, and
   acceptance above (deps: none; it blocks the FAME-4 re-gate and the FAME-5 browser gate).
2. FAME-4 status stays `in-progress` with a note: closes via re-gate after FAME-4G merge+restart.
3. FAME-5 keeps coding; its browser gate takes FAME-4G merge as a precondition.
4. Dispatch order is the orchestrator's call within these constraints; merge gates unchanged.

FAME-4G RULED Option 3 — FAME-4G is a single small reachability fix (list limit/offset + newest-first + truthful total, deep link fetches run-by-id; total-misreport included); FAME-4 does NOT close on the amended reading — it closes via a targeted re-gate of obligations 1/2/5 on ANR-000055/056 after FAME-4G merges; the generic artifact-record surface stays folded into FAME-6's approved scope; FAME-4G gates FAME-4's re-gate and FAME-5's browser gate (FAME-6 transitively).
