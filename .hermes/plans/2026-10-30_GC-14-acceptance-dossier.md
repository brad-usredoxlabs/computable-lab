# GC-14 ACCEPTANCE DOSSIER — campaign release gate
> STATUS: IN-FLIGHT (159th tick scaffold; S2/S4/S5/S6 + gate-receipt sections pending the WI-3
> browser gate running at :5192). Gate window start: 2026-10-29T14:04:31-04:00
> (`/home/brad/.hermes/cl/lanes/1/gc14-window-start.txt`). Every claim names its artifact.

## S1 — Revisions + configuration under test (WI-0, orch first-hand)
- code revision at gate start: `a5aa77f6da0abdb56b55204c54329c38ef8c6eb3` (cl/integration-1; code
  content tip 049e5b87 = GC-13 gatefix3 merge; docs-only delta above it)
- data revision at gate start: `d7e942cf34a9efccfc85d5dc8f2dde8d9c512403`
  (/home/brad/.computable-lab-lane1/worktrees/main)
- config.yaml (gitignored) sha256: `e30a5706499d559e12793f9507aef90b131f49416bb97f174a1c3f67c4eed2dd`
- stack: :3092 + :5192 (lane-1 stack; :3001/:5174 untouched); `GET :3092/api/config` storageDevices
  = `[vast, gc-fid-nas]` (witnessed 14:04).
- engine freshness: ENG-PYCAL01-L1T2305 200 as USR-BRAD; host `/usr/bin/python3 --version` = 3.14.7
  (satisfies declared >=3.11; scipy absent is CONSISTENT with declared `packages []` — GC-1
  unknown-is-unknown, not "fixed"). Declared-vs-actual render lands in S4 via the gate trail.
- hygiene baselines (pre-window, for the V5 diff): code-repo largest tracked =
  resources/vendor_pdfs/Cayman-natural-prodccuts.pdf 3,520,476 B; data-repo largest =
  var/jsonld-index.sqlite-wal 4,350,752 B / records/analysis-output-artifact/
  AOUT-000013__gc10-d-signal-trace-72k.yaml 1,671,747 B (both PRE-EXISTING, excluded from window).

## S2 — Records minted by the gate
PENDING the WI-3 gate (fills from the reviewer's trail: RUN / GCM / REV / SMP / ACQP x2 / ANR /
VSPEC / EVD / CLM ids). Pre-gate residue (EXCLUDED from the window diff by the window stamp):
ACQP-000002 (157th trust-anchor witness) + DREF-000029..49, GC-13's claim(1)/assertion(1) — left
untouched and NOT reused.

## S3 — Trust anchor: NAS -> DREF hash byte-match (WI-1, orch independent re-hash 14:04)
`/home/brad/.hermes/cl/lanes/1/gc14-wi1-witness.txt`: ACQP-000002 files=21,
**21/21 DREF contentHash byte-matched** a server-independent
`(cd /mnt/vast/gc-fid/machine1/RES35077-4.D && find . -type f -exec sha256sum {} +)` — includes
nested members (ACQ.M/ACQ.TXT = 6743baa1…4b263 == DREF-000035.contentHash). In-window fresh
registrations (A3/A6) carry their own per-file independent hashes from the gate trail + S2.

## S4 — Engine truth (declared vs actual, side by side)
Pending gate A5 screenshot values (VERBATIM engine/version/interpreter off the provenance panel).
Baseline pair witnessed here: declared constraint (engine record >=3.11, packages []) vs actual
(/usr/bin/python3 3.14.7, scipy absent) — see S1.

## S5 — Same-axes comparison
Pending gate A6 (RES35077-5.D second trace, VSPEC id, both traces identified on shared axes).

## S6 — Honesty clause (VERBATIM task text, binding)
"assertion stands on genuine evidence (synthetic standards may NOT prop a quantitative claim —
qualitative assertions stand otherwise, stated honestly)". RULING (AS-L1T0740-3, unchanged): the
gate assertion is QUALITATIVE (`assesses`) — the lane has zero genuine standard-value records
beyond TEST fixture levels and no pre-gate seed arrived (OQ-C). The S2 assertion is therefore
classed QUALITATIVE with this justification; no quantitative number is asserted anywhere in this
dossier. The lint refusal of the context-less attempt (gate A7 first attempt) is affirmative
evidence the floor is real.

## S7 — Verification legs re-run at the final tip (WI-6, orch OWN runs, raw tails)
Gate-start tip a5aa77f6 (code 049e5b87), 14:16-14:17 EDT (`gc14-wi6-app.log`):
- app GC trio `npx vitest run src/analysis src/run` — **422 tests passed (422)**, 22.3s
- DNA leg `npx vitest run src/sequences` — **54 tests passed (54)**, solo 3.35s
- app typecheck `npx tsc --noEmit | grep -c 'error TS'` — **21** (== zero-NEW floor, no new
  error-bearing files)
Server legs (`gc14-wi6-server.log`, 14:24-14:26 EDT, orch OWN run):
- `npx vitest run src/lint src/storage/acquisitionPackage.test.ts --no-file-parallelism` —
  **236 tests passed (236)**, 85.6s
- server typecheck `npx tsc --noEmit | grep -c 'error TS'` — **0**

## S8 — Declarative substitution flip, ZERO code (WI-5, orch first-hand)
`/home/brad/.hermes/cl/lanes/1/gc14-wi5-witness.txt`:
fixture pair committed at `.hermes/plans/gc14-substitution/gc14-{baseline,substituted}.yaml`
(shipped FAME-LOCAL vocabulary only — methyl-octanoate-n8 -> methyl-decanoate-n10, both present in
schema/registry/ontology-terms/fame-local.yaml; namespace-carrying ontology refs per
core/datatypes/ref.schema.yaml).
- baseline `POST /api/records` (server-side Ajv + lint) -> 201 GCM-GC14-SUB-BASE
- substituted `PUT /api/records/GCM-GC14-SUB-BASE` -> 200; API re-read shows the flip: oven step1
  hold 3.0 / 70.0 C, step2 ramp 20.0 / 260.0 C, inlet 260 C / 22 psi, compound
  FAME-LOCAL:methyl-decanoate-n10, rt 9.1
- storage-id arm: the SAME register route ran against device `vast` (ACQP-000003, WI-4) and
  `gc-fid-nas` (ACQP-000002) — device choice is config data, never code.
- PROOF PINS: `git -c core.fileMode=false diff --stat` over app/server/schema = 0 lines across the
  flip; record-level flip needed NO restart; editor projection loads clean (diagnostics [],
  blocks+slots bound) — value proof is the API re-read (the projection inlines shape, not payload
  values; disclosed honestly rather than overclaimed).

## S9 — Hash-drift detection proven end-to-end (WI-4, orch first-hand)
`/home/brad/.hermes/cl/lanes/1/gc14-wi4-witness.txt`: copy of RES35077-4.D under
/mnt/vast/computable-lab-data/gc14-drift -> register(device=vast) 200 ACQP-000003 -> clean verify
200 -> `printf 'x' >> copy/FID1A.CH` (NAS untouched: its FID1A.CH hash verified unchanged
a13bcd0e0f4f… post-mutation) -> re-verify `POST /api/acquisition-packages/ACQP-000003/analysis-inputs`
-> **422 {"error":"PACKAGE_HASH_DRIFT","message":"content hash drifted since registration:
FID1A.CH (expected a13bcd0e0f4f…, got 49e8f3a5e963…)"}**. Scratch dir removed after the leg.

## S10 — Hygiene close (WI-8)
PENDING close: window diff `git diff --name-only <gate-start>..HEAD` filtered for
raw/large byte extensions -> must be EMPTY; data-repo new-file size sweep; every S2 id read back
200; dossier TODO/TBD grep -> 0. Receipts live ONLY under ~/.hermes/cl/receipts/GC-14/.

## GAPS appendix
(empty so far; any requires-rescope platform gap lands here verbatim per the stop-boundary rule)
