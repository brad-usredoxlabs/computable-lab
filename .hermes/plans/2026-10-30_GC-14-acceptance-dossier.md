# GC-14 ACCEPTANCE DOSSIER — campaign release gate
> STATUS: GATE RUN COMPLETE — VERDICT: fix (two named platform gaps, recorded verbatim in the
> GAPS appendix; everything else evidenced). AWAIT BRAD REVIEW (task `verified by` names Brad).
> Gate window start: 2026-10-29T14:04:31-04:00
> (`/home/brad/.hermes/cl/lanes/1/gc14-window-start.txt`). Every claim names its artifact.
> Gate receipts: `/home/brad/.hermes/cl/receipts/GC-14/20261029T181557-gate/`
> (report.md, 11 harness-written trail.json sessions w/ listener-captured console/pageError/
> network arrays, 55 shots, manifest.json, s3-hashes.txt). Orch receipt audit 160th tick
> (2026-10-29 ~14:50 EDT): md5 dup sweep = 5 dup groups, ALL disclosed in the report's
> trail-hygiene section as same-state/fail-shots, none a two-states-one-shot violation;
> every S2 id GET :3092 -> 200 (live re-check); negatives re-verified (measurement-context
> total 0, ASN-GC14-NOT-AUTHORED 404, view-spec total 12 = no VSPEC minted); A1 + A5 shots
> vision-checked by the orch (sheet + provenance panel render, stub engine facts visible).

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
All minted IN-WINDOW through the shipped UI as USR-BRAD; all re-read 200 on :3092 by the orch
after the gate (160th tick). Full trail: receipts report.md §S2.
| Role | Id |
|---|---|
| run (kind run) | RUN-gc-14-gate-sheet-res3507-2uz9vw (GC-12 door, createdBy USR-BRAD) |
| sequence header / entries | ISEQ-2uz9vw; ISEN-2uz9vw, ISEN-mrufti |
| party / request / samples | PARTY-2uz9vw, REQ-2uz9vw, SMP-2uz9vw; PARTY-mrufti, REQ-mrufti, SMP-mrufti |
| gc-method (selected, data-driven select) | GCM-DEMO-AOAC-FAME |
| analysis revision (selected) | ANREV-GC10A |
| acquisition packages | ACQP-000004 (machine1/RES35077-4.D, 21 files), ACQP-000005 (machine1/RES35077-5.D, 22 files) — device gc-fid-nas via the config-driven select, shipped relative-key input, no mount-path box |
| data references | DREF-000073…094 (pkg 4), DREF-000095…116 (pkg 5); pinned signal DREF-000074 (FID1A.CH), manifest DREF-000094 |
| analysis runs | ANR-000023 (4.D), ANR-000024 (5.D) — both succeeded, `inputs {signal: DREF-…}` |
| output artifacts | AOUT-000029, AOUT-000030 — both `stub_echo` / dataKind metric (see S4) |
| view-spec | NONE minted (total still 12; A6 blocked — GAPS 2) |
| assertion / claim / evidence | NONE minted (A7 blocked in-browser — GAPS 1) |

Pre-gate residue (NOT reused, untouched): ACQP-000002/000003, GC-13's
ASN/CLM/EVD-TEST-GC13-214258. Console inventory: 1 campaign-noted protocols/steps 400
(segregated, AS-L1T0935-1), 1 pre-existing vendor-exa 502 on run-page mount (D4, out of GC
scope), 2 reviewer-probe 404s on the missing A7 surfaces (evidence, not shipped-flow errors);
pageErrors 0 across 10 sessions; no 401/403 anywhere.

## S3 — Trust anchor: NAS -> DREF hash byte-match (WI-1 orch re-hash + IN-WINDOW gate hashes)
Pre-gate witness (`/home/brad/.hermes/cl/lanes/1/gc14-wi1-witness.txt`): ACQP-000002 files=21,
**21/21 DREF contentHash byte-matched** a server-independent
`(cd /mnt/vast/gc-fid/machine1/RES35077-4.D && find . -type f -exec sha256sum {} +)` — includes
nested members (ACQ.M/ACQ.TXT = 6743baa1…4b263 == DREF-000035.contentHash).
IN-WINDOW (gate, receipts `s3-hashes.txt`): **ACQP-000004 21/21 and ACQP-000005 22/22** DREF
contentHashes byte-MATCH an independent shell `sha256sum` sweep of the mounted directories
(incl. nested ACQ.M/DA.M members and the extra 6890GC1.INI on 5.D). Anchor
FID1A.CH 4.D = `a13bcd0e0f4f409fec1d81e6fd273c467df00f0c647d3892a20cad7803f21300` (75846 B) is
also the exact `content hash (sha256)` the A5 provenance panel rendered for storage
`gc-fid-nas:machine1/RES35077-4.D/FID1A.CH` (shot `partE/29-a5-32`) — the UI's chain resolves to
the NAS bytes end to end. NAS was read-only throughout (FID1A.CH mtime still 2026-10-23T11:18).

## S4 — Engine truth (declared vs actual, side by side) — read VERBATIM off the panel (gate A5)
Rendered on the gate run's provenance panel (`partE/shots/29-a5-32-provenance-full-facts.png`,
orch vision-checked; `partD/shots/09-a5-21`):
- `engine (actual) | ENG-STUBLIVE01-L1T0130` | `engine version (actual) | unknown` |
  `interpreter (actual) | /usr/bin/python3 3.14.7`
- `engine (declared) | ENG-STUBLIVE01-L1T0130` | `sdk version | 1.0.0` | `revision | ANREV-GC10A`
- `status | succeeded` | `input signal | DREF-000074 (data-reference)`
- `content hash (sha256) | a13bcd0e…300` | `storage | gc-fid-nas:machine1/RES35077-4.D/FID1A.CH`
- 21 per-file DREF hops + manifest DREF-000094; the one non-resolving hop is the honest named-gap
  arm `gc-prov-hop-absent-measurement-context` ("not linked (named gap)").

HONEST HEADLINE (gate D3, stated plainly, not laundered): **the gate's executed engine is the
declared stub** — adapter `stub-echo`, packages `[]`, run log's own words "stub adapter — performs
no scientific computation". Nothing shipped computes from the `.D` bytes; both ANR outputs are
`dataKind metric`. The S4-target `ENG-PYCAL01-L1T2305` (>=3.11, packages []) is bound only to
`ANREV-000008`, which declares five `table` inputs the Analyze door never pins (ANR-000019
precedent). Declared-vs-actual freshness witness (S1): host python 3.14.7 satisfies >=3.11;
scipy absent is CONSISTENT with declared `packages []` (unknown-is-unknown).
Gatefix3 pin evidenced via served-code probe (defect-0 guard: fetched
`GcProvenancePanel.tsx` = 46163 B contains `gc-prov-hop-unresolved`) plus the named-gap arm; no
unresolved hop occurred in this chain, stated plainly, not claimed as exercised.

## S5 — Same-axes comparison — NOT EVIDENCED (gate A6 FAIL, blocking; GAPS 2)
Registration half PASSED: second trace registered through the same panel -> ACQP-000005, 22/22
hashes byte-match, ANR-000024 executed. But both gate runs render "no signal artifacts in this
run" in Compare traces — zero selectable artifacts, no overlay, `compare-save` disabled,
**no VSPEC minted**. Root cause (reviewer read first-hand, orch concurs): every revision
reachable from the Analyze door binds the `stub-echo` engine, which publishes a `metric`, never
a `signal`; the only signal artifacts in the lane are GC-10 synthetic seeds (`AOUT-000010..13`),
which the criteria forbid substituting (control shot `partH/12-a6-46` shows the comparison
surface itself works — for those seeds). No synthetic substitution was passed as real; the leg
is recorded FAILED.

## S6 — Honesty clause (VERBATIM task text, binding)
"assertion stands on genuine evidence (synthetic standards may NOT prop a quantitative claim —
qualitative assertions stand otherwise, stated honestly)". RULING (AS-L1T0740-3, unchanged): the
gate assertion is QUALITATIVE (`assesses`) — the lane has zero genuine standard-value records
beyond TEST fixture levels and no pre-gate seed arrived (OQ-C). **OUTCOME, stated honestly:
the clause is NOT closed — no assertion stands on genuine evidence yet, because the browser
exposes NO authoring surface for an assertion/claim at all (gate A7 FAIL, GAPS 1).** No
quantitative number is asserted anywhere in this dossier and none could be phrased in the UI:
the evidence form has zero numeric and zero standards inputs (stance supports|refutes|assesses +
context/target ids + QC note only; re-verified twice in-browser and once via API:
measurement-context total 0 — gate A8 PASS, shots `partE/36-a8-33`, `partG/20-a8-45`). The GC
evidence form's own loud refusals ARE affirmative evidence the floor is real at the consume
boundary: it refuses verbatim "Name the target assertion or claim (id + kind)" with no target,
and refuses an unresolved id ("target … does not resolve (NOT_FOUND) — the id is never POSTed
unresolved") (shots `partE/44-a7-35`, `partE/49-a7-36`). The lint refusal of a context-less
creation attempt (`asn-scoped-assertion-needs-context`) could NOT be exercised — nothing can
POST an assertion in the browser — recorded as unreachable, not as passing.

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
Tip-pin (AS-L1T1430-2 close-out): the gate returned requires-rescope gaps, NOT code defects — no
fix cycle ran, code content tip is UNCHANGED at 049e5b87 (`git diff --name-only a5aa77f6..HEAD`
outside `.hermes/plans/` = 0 files, S10). These legs stand at the final tip; no re-run required.

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

## S10 — Hygiene close (WI-8) — CLOSED by the orch at the final tip (160th tick)
- window diff: `git diff --name-only a5aa77f6..HEAD` outside `.hermes/plans/` = **0 files**;
  grep of window-diff names for raw/large byte extensions (.D .CH .M .RAW .BIN .ZIP .PNG .CSV
  .XML .MTH .REG .LOG .INI …) = **EMPTY** (code repo gained docs/receipts-plan files only).
- data-repo new-file size sweep (window >=14:04:31): 98 new record files, **largest 3,609 B**
  (ACQP-000005 header), **0 files >500 kB** — no raw/large bytes in the data repo either.
- every S2 id read back `GET :3092/api/records/<id>` -> 200 (orch live re-check, 160th tick).
- no unfinished-section markers remain in this dossier (S2-S10 all filled first-hand).
- receipts live ONLY under ~/.hermes/cl/receipts/GC-14/.

## GAPS appendix (VERBATIM from the WI-3 gate report; requires-rescope, per the stop-boundary
rule these are NOT absorbed into GC-14's docs-only file boundary)
1. **Assertion authoring (A7).** No product affordance authors an assertion or a claim in the
   browser; `/record/new/:kind` only knows study|experiment|run, `/registry` has no knowledge
   kinds, `+ Create` offers Run/Project/Claim and the Claim path renders no form. Needs a product
   surface (or an architect-ruled authoring door) before the "assertion stands on genuine
   evidence" clause can be evidenced.
2. **Trace from a registered `.D` (A6).** No shipped analysis revision binds an engine that reads
   a registered `.D` while accepting the Analyze door's pinned `signal` input; the only such
   engine (`ENG-PYCAL01-L1T2305`) is bound to a five-table-input revision. Until a revision
   (data) or a reader adapter (code) exists, the same-axes comparison with a second real trace
   cannot be produced.
3. **Named, pre-existing, out of GC scope (gate D4):** `POST /api/vendor/exa/search` 502 on every
   run-page mount (useMaterialSearch -> useVendorExaSearch), so A9's "zero console errors" is
   literally not met; independent of the GC flow (absent on /analysis, /sequences, /claims).

Orch corroboration (not required, recorded for the architect): gap 1 confirmed against trunk code
— `app/src/shared/shell/RecordHostPage.tsx:6` documents the create route as
`/record/new/:nodeType/:parentId?` and the surrounding code only resolves study/experiment/run;
`schema/knowledge/assertion.schema.yaml` exists and serves (204 schemas loaded) but no route or
registry tab reaches it for authoring. Gap 2 confirmed via S4: the Analyze door's only reachable
revision pins `stub-echo` (metric-only publisher).

## BRAD REVIEW — 2026-10-30 ~20:0x EDT (recorded by architect from phone chat, verbatim)
"accept dossier, close GC-14 per close-out protocol"
=> GC-14 human blocker RESOLVED: dossier accepted as-is (failed legs S5/S6 stand recorded
   verbatim; no laundering). Close-out per the gaps-answer protocol: re-gate ONLY A6 + A7 +
   lint-refusal demo + console delta at current trunk (GC-15 merged ANREV-DREADER-1 + GC-16
   Knowledge door + WIDGET-R1 merged); all other sections stand at the audited state; GC-14
   flips done when that addendum re-gate ACCEPTS.
Related rulings this exchange: GC-17 (vendor-exa 502, GAPS 3) = QUEUED.
MOUNT-NONEVENT-1 + MATRES-REPLAY approvals + transform_sequence P10 revcomp = PARK ALL.
FLEET-3B ninfer restart = authorized to apply when the in-flight run ends (idle window).
