# DECISION REQUEST — GC-12 browser-gate blocker: directory-kind analysis input (lane 1)

Requested by: lane-1 orchestrator tick 2026-10-28T22:30. Need: a written decision at
`/mnt/vast/home/brad/git/cl-integration-1/.hermes/plans/2026-10-28_lane1-gc12-directory-input-decision.md`
(the orch watches this exact path). Bounded question — options enumerated below; a
one-paragraph ruling + rationale is sufficient.

## Context

GC-12's full V7 re-gate (tier-1, receipts
`/home/brad/.hermes/cl/receipts/GC-12/20261028T2155-regate2/report.md`, served candidate
2cdbeca5) returned VERDICT: fix. Criteria (a)(b)(c)(d)(e)(g)(h)(i) PASS, incl. the
StrictMode sheet-renders regression this re-gate exists for (fixed, verified on create
path AND cold load). The ONLY blocker is criterion (f) "execute -> results" for a
GC-created run, and the reviewer proved first-hand it is PRE-EXISTING, not in GC-12's
merged diff:

- The GC Analyze handoff pins `inputs.package` to the acquisition DREF — for
  ACQP-000001 that is DREF-000028, dataKind `signal-collection`, `path:
  machine1/20201025-RESTEK-H-KERRYGOLD.D` — a DIRECTORY on the gc-fid-nas device.
- `server/src/analysis/analysisRunner.ts` `provisionInputs` (~:217-225) streams EVERY
  data-reference with `provider.read(path)` -> `read` on a directory throws EISDIR;
  the outer catch relabels it `INTERNAL_ERROR: EISDIR`, 0 results, run
  queued/failed.
- UI-free proof (no browser, no GC code): `POST /api/analysis-runs` with
  `inputs:{package: DREF-000028}` -> execute -> EISDIR (ANR-000021); same create with
  `inputs:{signal: DREF-000008}` (a FILE dref) -> succeeded with a manifest
  (ANR-000022).
- `analysisRunner.ts` last touched by GC-6 (109251fc). GC-12's merge = 3 client files.
- Side observation (not part of this decision): ANREV-000006 requires `peak_detection`,
  which no lane engine declares — the named refusal there is correct behavior.

## The question

How should the lane make "execute -> results" true for a GC-created run (criterion V7(f))
— which fix is the APPROVED one? Options as surfaced by the reviewer, plus the
orchestrator's note that they may compose:

- **(A) Runner support for directory-kind inputs**: `provisionInputs` grows a
  directory branch (expand the DREF to its member files under `<inputDir>/<name>/`,
  engine-side contract per dataKind), or at minimum a NAMED `INPUT_IS_DIRECTORY` /
  `DIRECTORY_INPUT_UNSUPPORTED` error instead of the relabeled INTERNAL_ERROR.
  Broadest infra change; touches shared runner (GC-4/GC-5/GC-6 surfaces); the named-error
  half ALONE does not satisfy (f)'s "results" for GC runs — it only names the failure.
- **(B) Amend the D3 pinning**: the GC Analyze handoff pins a FILE-level dref (e.g. the
  FID channel file) instead of the package directory dref. Narrowest; but the
  registration flow currently mints ONE directory-level DREF per package (readerVersion
  `gc-4-registration/1`) — does it need to mint member-file DREFs too, and which member
  is "the signal" is engine/dataKind knowledge (today: engine pycal consumed DREF-000008,
  a single .CH file from an earlier campaign).
- **(C) Registration-level**: `POST /api/acquisition-packages/register` mints both the
  package DREF (directory, hash over tree) AND per-member file DREFs, and the Analyze
  handoff pins the member the engine declares it can read. Bigger data-model footprint
  (more DREFs per package); arguably the most "provenance-complete" option.

The reviewer explicitly asked that this NOT be silently routed to the GC-12 coder —
hence this request.

## What the orch will do on receipt

Dispatch ONE fix run (fleet slot, staggered) against `cl/integration-1` with the ruling
verbatim + the browser gate's minor defects 2-7 from the same report (RunCollectionView
loading state + no silent gcMethods[0] fallback; invisible `.gc-results a` link styling;
column-visibility affordance; stale chrome note next to a new error token; silent
busy-guarded no-op on Analyze; carried console noise stays carried). Then a browser
re-gate of (f)+(c) legs on the new trunk. GC-12 stays in-progress until then.

## Evidence

- receipts report.md + phase8/phase9/phase5 shots named there; trails phase1/3-10.
- `git -c core.fileMode=false log --oneline -- server/src/analysis/analysisRunner.ts`
- live: ANR-000021 (EISDIR), ANR-000022 (file-dref success) on :3092.
