# GC-1 — Feasibility spike: .D decode, engine environment, reference values
Status: DRAFT v1 by orchestrator (l1t1730 tick). Read-only spike; NO product code.
Campaign: gc-analysis-cycle (Brad approved 2026-10-25 "approved as is"; lane-1 placement ruled 2026-10-26).
Task: GC-1 in ~/.hermes/cl/lanes/1/task-list.md (deps: none).

## Ground truth verified by the orchestrator at claim time (2026-10-25T17:45, trunk b7a3dd8c)

- `server/src/analysis/analysisRunner.ts:27` — `const DEFAULT_PYTHON = '/usr/bin/python3';`
  (constructor param `private readonly python = DEFAULT_PYTHON` at :96; spawn at :193; SDK root
  resolution `python-executor-service/src` at :35-47).
- `/usr/bin/python3` = Python 3.14.7; `scipy` ABSENT (ModuleNotFoundError, re-verified this tick);
  `numpy` also ABSENT; `ensurepip` WORKS (pip 26.2.1); `python3 -m venv` works. `uv` NOT on PATH.
- The (host) venv python is 3.11.16 with NO pip module — irrelevant to the runner but note it:
  the spike's venv must be created from an interpreter whose ensurepip works.
- NAS read-only corpus (verified this tick): `/mnt/vast/gc-fid/machine1/` holds
  RES35077-4.D and RES35077-5.D among 11 .D dirs; RES35077-4.D contents:
  ACQ.M, ACQRES.REG, DA.M, FID1A.CH, RUN.LOG, SAMPLE.MAC.bak, SAMPLE.XML, SINGLE.B.
  `ACQUIRING.TXT` exists at machine1/ root (in-progress-acquisition marker — do NOT treat any
  .D next to it as complete unless its own files say so).
- Reference screenshots exist: /mnt/vast/home/brad/git/computable-lab/tmp/chemstation-screenchots/
  screenshot-2026-10-25_15-57-03.png, _15-59-16.png, _16-01-21.png (READ-ONLY; never write into
  Brad's tree). They are ChemStation UI captures; the coder may read pixel values only by
  careful inspection IF its model can; otherwise state this limitation and use the two-decoder
  cross-check route (allowed by the task text).
- `schema/lab/readout-definition.schema.yaml:34` — instrument_type enum
  `[plate_reader, qpcr, gc_ms, lc_ms, microscopy, other]` — NO gc_fid (GC-2 adds it; not GC-1).
- `config.yaml:40-45` — storageDevices declares ONLY `vast` (local-mount
  /mnt/vast/computable-lab-data). A `gc-fid-nas` local-mount entry pointing at /mnt/vast/gc-fid
  is the intended shape (per campaign header) — it is gitignored CONFIG data, declared not
  hardcoded. GC-1 does NOT need to wire it; note what wiring a later item needs.
- Lane data dir /home/brad/.computable-lab-lane1/ = auth/ repos/ worktrees/ only today.

## Scope (verbatim from task, expanded)

(a) Inventory a real .D (RES35077-4.D): every file, size, role hypothesis, confidence.
(b) Plausible FID1A.CH decode: time axis + pA values, scaling/units STATED; cross-check against
    an independent reference — either ChemStation-read peak RTs from the screenshots above OR a
    SECOND INDEPENDENT DECODER implemented differently. State remaining uncertainty honestly.
    Do the decode with throwaway scripts under /tmp ONLY (never in the repo, never on the NAS).
    Bytes never leave the NAS into either git repo. Decode is read-only.
(c) Python execution environment decision: name the exact venv location + creation + provisioning
    commands (ensurepip/pip route is available and verified; uv absent — do not assume it).
    Decide how AnalysisRunner's DEFAULT_PYTHON should resolve to it (config-declared, env var, or
    derivation) — DECIDE + JUSTIFY; do NOT implement product code. Pin dependency versions.
    Actually CREATE the spike venv under /tmp (or a lane artifacts dir) and prove scipy imports
    (GC-D5 pre-approves the scipy install; this is environment provisioning, not a code change).
(d) Engine screen per GC-D3: scipy-based baseline integration vs at least ONE real
    chromatography library candidate (e.g. pybaselines, chromatographics, or better — check
    licenses/maintenance on PyPI at screen time). Capability matrix supported/approximate/
    unsupported/unverified for: baseline control, width/slope sensitivity, area/height reject,
    timed ON/OFF integration windows, peak detection, deconvolution (state if unverified).
    License + deps + pluggability per candidate.
(e) .M parsing verdict: state whether ANY .M parsing is truly needed; default = opaque
    preservation + scientist-entered method data.
(f) Numerical comparison tolerances + representative trace sizes (file bytes, n points if
    decodable) for the GC-10 chart perf budget.

## Boundaries

- NO product code, no repo edits outside .hermes/plans/ (report committed in worktree's
  .hermes/plans/). Throwaway scripts under /tmp only. No writes to /mnt/vast/gc-fid,
  /mnt/vast/home/brad/git/computable-lab, ~/.computable-lab. No stack restarts. No model
  service touches. Never git-add anything from the NAS.
- Stop boundary: if the decode cannot be made plausible at all, stop and report the evidence
  — do not invent a format.

## Verification commands (orchestrator will re-run these yourself)

- Report contains: inventory table; decode evidence (values vs reference, tolerance stated);
  venv decision + exact commands; capability matrix; .M verdict; tolerances + trace sizes.
- `git -c core.fileMode=false diff --stat <base>..HEAD` in the worktree: only .hermes/plans/ files.
- Orchestrator re-runs the spike venv creation command and a scipy import from the report.
- Orchestrator independently re-decodes one peak RT from a second sample (.D or file) if the
  coder used the second-decoder route, or vision-checks the screenshot route.

## Deliverable (unique path)

Report: /home/brad/.hermes/cl/lanes/1/gc-1-report-l1t1730.md (commit a copy in the worktree's
.hermes/plans/; orchestrator promotes the accepted output to
.hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md — this file itself is the brief,
not the deliverable).
End stdout with exactly: GC1 DONE <sha>
