# GC-14 SPEC (DRAFT) — Lane-3 acceptance dossier: one real NAS .D completes run→method→samples→analysis→assertion

> DRAFT — cl-spec-composer run l1t1640, 2026-10-28. NOTHING here is approved; the orchestrator
> reviews, fixes, and promotes to the canonical path `.hermes/plans/2026-10-30_GC-14-acceptance-dossier.md`
> (does not exist at draft time — confirmed: `ls .hermes/plans/ | grep GC-14` → empty [F-run]).
>
> **RE-ANCHOR BANNER (orch, 2026-10-29T06:40 tick, applied at trunk `ae2bcaa4`):** the draft's
> trunk stamp `125e31cf` is stale. Since drafting: **GC-13 MERGED (b89a44d1, no-ff)** —
> evidence.lint.yaml now carries 5 rules and assertion.lint.yaml 1 (draft's "`rules: []`" cite is
> superseded), `POST /acquisition-packages/register` + `/:id/analysis-inputs` are LIVE on trunk
> (routes.ts:435-436 at ae2bcaa4 — draft's "zero hits" cite superseded), the `/analysis?run=`
> deep-link consumer exists (AnalysisPage.tsx:266-276), and ClaimWorkspace exists. GC-13's
> browser gate returned FIX; a gatefix coder is in flight (defects D3/D4/D5/D6; D1/D2 fixture
> repairs already applied). GC-12's dirfix minorfix cycle-3 is live in
> wt/gc12-dirfix-lane1-l1t2250 — GC-12 trunk merge still pending. AMEND-AT-MERGE remains binding
> for everything the two in-flight cycles touch (attach-panel chrome, failure arms, claim->run
> hand-off affordance). First-hand verified this tick: [orch-run] `npx vitest run
> src/sequences/nativeDraft.test.ts` at ae2bcaa4 -> 1 failed | 3 passed ("errorLike is not a
> constructor") — the DNA leg is STILL red at trunk; see OQ-2 resolution below.
> TRUNK STAMPED AGAINST: `cl/integration-1` @ `125e31cf` (docs tip; GC-11 merged d8cd79a7,
> GC-12 UNMERGED — fix1+D3 legs live in wt/gc-12-lane1-l1t1220; GC-13 UNDISPATCHED, gated on the
> GC-12 merge). **AMEND-AT-MERGE (binding, house pattern):** every cite to a GC-12/GC-13 surface
> is a hypothesis about an unmerged worktree's target state. GC-14's *dossier procedure* is stable;
> the exact results-surface paths, hand-off affordance names, and evidence record ids must be
> re-anchored at claim against the merged trunk.

## Goal (one sentence)

On the lane stack with gc-fid-nas live, drive ONE real NAS `.D` package (RES35077-4.D class)
through the whole cycle in the browser — run sheet → method → samples → NAS attach → analyze →
results → cross-run compare with a second identified trace → a scientist-authored assertion standing
on genuine, lint-guarded evidence — and record every claim (IDs, revisions, hashes, engine versions,
numerical checks, test output, receipts) in a single dossier document that Brad reviews as the
campaign's definition-of-done.

## What binds

- Task block GC-14, `/home/brad/.hermes/cl/lanes/1/task-list.md` :8838-8860 — description,
  `verified by`, `files:` quoted VERBATIM in §Acceptance. deps: GC-13. status: todo.
- Task block GC-12 (:8732-8811) and GC-13 (:8813-8836): GC-14 is the release gate OVER their
  shipped surfaces — their `verified by` clauses are the minimum surfaces the dossier must exercise
  end-to-end (run-sheet browser receipt; provenance-chain-to-NAS-hash + lint-blocked missing-context).
- GC-D1..D6 campaign decisions (task-list :7468-7480): GC-D1 no parallel app (this gate runs on
  existing surfaces), GC-D3 "plug in different libraries and the library becomes part of the
  evidence bundle" — the engine identity in the dossier must come from `engineProvenance` records,
  not from prose.
- `CLAUDE.md` non-negotiables (:135-163): declarative/imperative split, no hardcoded domain logic,
  Ajv sole validation authority, `exactOptionalPropertyTypes` on backend, controlled vocabularies /
  CURIE terms (:157), materials hierarchy never collapsed (:158), the Hard Boundary (:163).
- `specifications/computable-lab-principles.md` :65 (hardcode = hard stop) and :73 (specs first).
- `docs/knowledge-layer-canonical-example.md` — binding on the claim/assertion/evidence records the
  dossier's cycle authors (ontology discipline: one claim = one triple, RO: predicate CURIEs).
- Standing wave-2 rules (task-list :36-47): only the orchestrator marks done; negative claims must
  be re-verified before reported; dead chrome is a defect; receipts under
  `~/.hermes/cl/receipts/<task>/<ts>/`.
- Honesty rule from the description itself: **synthetic standards may NOT prop a quantitative
  claim** — written into the dossier template §S6, non-negotiable.

## Oriented facts (composer-verified first-hand 2026-10-28 at 125e31cf unless marked [I])

Legend: [F] file:line opened by the composer this run; [F-run] command actually executed by the
composer this run (read-only — nothing restarted or mutated); [I] inference.

### Lane facts and stack state
- [F-run] `curl :3092/api/config` → 200; `storageDevices` lists `vast` (local-mount
  `/mnt/vast/computable-lab-data`, default) AND `gc-fid-nas` (label "GC FID NAS (read-only)",
  kind local-mount — matches lane facts). `curl :5192/` → 200.
- [F] `config.yaml:48-51` (worktree copy, GITIGNORED — `git check-ignore -v config.yaml` →
  `.gitignore:36`) declares `gc-fid-nas → mountPath /mnt/vast/gc-fid`. [F] `config.example.yaml:92`
  carries the commented sanctioned example (GC-4 precedent).
- [F-run] **NAS correction to the dispatch brief:** `find /mnt/vast/gc-fid -name '*.D' -type d`
  returns **14** `.D` dirs TOTAL — but only **12** sit directly under `machine1/`; 2 more live
  inside `machine1/GCFID_CHECKOUT 2026-10-23 14-33-13/001F0101.D` and `.../2026-10-25 17-14-28/101F0101.D`.
  `RES35077-4.D` (327K: ACQ.M, ACQRES.REG, DA.M, FID1A.CH, RUN.LOG, SAMPLE.MAC.bak, SAMPLE.XML,
  SINGLE.B) and `RES35077-5.D` (387K, adds 6890GC1.INI) both present. Dossier names the second
  trace as `RES35077-5.D` (same sample series, cleanest same-axes partner [I]); 10 named butter/
  RESTEK traces are alternates.
- [F-run] Engine readback: `GET /api/records/ENG-PYCAL01-L1T2305` → engine_version
  `reference-2026-10`, adapter `python-entry-script`, python `>=3.11`, packages `[]`, interpreter
  system, capabilities curve_fitting+weighted_regression `supported`.
  `GET /api/records/ANR-000013` → `engineProvenance.engineRef = ENG-PYCAL01-L1T2305`,
  `engineVersion reference-2026-10`, `interpreterPath /usr/bin/python3`, `interpreterVersion 3.14.7`,
  status succeeded, revisionRef ANREV-000008 — the provenance pattern the dossier must reproduce on
  the REAL-file run. [F-run] `/usr/bin/python3 --version` → `Python 3.14.7`; `import scipy` FAILS
  (packages [] — consistent with the declared constraint; do not "fix" this).
- [F-run] Lane fixture census at draft time: ACQP-GATE-L1T2130 / ISEN-GC3-GATE-001 /
  GCM-DEMO-AOAC-FAME / AOUT-000020 all read 200; analysis-revision total 11 (ANREV-000008 = TEST
  GC-11 calibration revision); **claim total 0, assertion total 0, measurement-context total 0** —
  the gate creates its own knowledge-layer records; nothing may hardcode pre-existing ids.
- [F-run] GC-12's register route is NOT on trunk yet: `grep -n 'acquisition-packages'
  server/src/api/routes.ts` → zero hits at 125e31cf. GC-12's D4 glue (`POST
  /acquisition-packages/register`, `/acquisition-packages/:id/analysis-inputs`, GC-12 spec :216-219)
  lives in the unmerged branch. Every dossier mount leg is AMEND-AT-MERGE on that route landing.

### Trust anchors the dossier re-pins at gate time
- [F-run] Independent sha256 of the primary package: `FID1A.CH` =
  `a13bcd0e0f4f409fec1d81e6fd273c467df00f0c647d3892a20cad7803f21300`, `SAMPLE.XML` =
  `d38cefcc2ab44116f9a8c2ba235203cd3e8fb726ab1d445575b97575815cb876` (sha256sum,
  /mnt/vast/gc-fid/machine1/RES35077-4.D). The DREF `contentHash` values minted at gate time must
  BYTE-MATCH these, computed independently of the server.
- [F] `schema/knowledge/data-reference.schema.yaml:40,59,109` — contentHash + readerVersion
  schema-required (required list :109). [F] `server/src/storage/acquisitionPackage.ts:519`
  `verifyAcquisitionPackage`, `:599` `packageAnalysisInputs`, `:603` VERIFY-FIRST (PACKAGE_HASH_DRIFT
  refused at input-resolution). [F] `acquisitionPackage.test.ts:438-445` — unit-level
  PACKAGE_HASH_DRIFT at verify AND inputs already pinned.
- [F-run] Hash-drift venue is available: `vast` device mount `/mnt/vast/computable-lab-data`
  exists and is writable-scope for lane scratch; `df -h /mnt/vast` → 42T free. The NAS device is
  labelled read-only — **drift proof never mutates /mnt/vast/gc-fid**; it mutates a COPY on the
  `vast` device (see §Verification V4).

### Surfaces the dossier exercises (mostly AMEND-AT-MERGE)
- [F] Route inventory (`app/src/App.tsx:148-226`): `/runs`, `/runs/:runId`, `/claims`,
  `/claims/:claimId`, `/analysis`, `/sequences` + `/lab/sequences` (DNA), `/record/:recordId`,
  `/registry` all exist at 125e31cf. `/runs/:runId` serves `app/src/run/RunWorkspacePage` — the
  GC-12 host; `/claims/:claimId` serves ClaimWorkspace (GC-13 D4 target).
- [F] Compare surface exists post-GC-10: view-spec records serve "Trace comparison" — [F-run]
  `GET /api/records?kind=view-spec` → total 12, VSPEC-000901..905 titled "Trace comparison"
  (GC-D4 same-axes compare shipped with GC-10/11, merge d8cd79a7).
- [F] Knowledge-layer lint files are EMPTY today: `schema/knowledge/evidence.lint.yaml:4` and
  `assertion.lint.yaml` both ship `rules: []` — GC-13's D5 leg fills them; GC-14's dossier must
  demonstrate the lint-BLOCKING path live, which only exists after GC-13 merges.
- [F] Predicate registry is a curated ~28-predicate allow-list consumed by LintEngine
  (`schema/registry/predicates.registry.yaml:1-29`) — the dossier's claim predicate must come from
  it; compound terms from `schema/registry/compound-classes/fame-medium-chain.yaml` (FAME-LOCAL
  candidates, CHEBI ids) — verified present.
- [F] GC-12 spec of record carries the binding 2026-10-28 D3/OPT-A amendment (:270-278): Analyze
  Flow A — create the analysis-run WITH pinned inputs + `collectDefaults` parameters, land
  `/analysis?run=<id>`, the `?gc=` path deleted. [F-run] `collectDefaults` exported at
  `app/src/analysis/ParameterForm.tsx:561` on trunk. The dossier's analyze leg follows the AMENDED
  flow, and its V7(f)-equivalent receipt expectation is: created run visible at /analysis?run= with
  non-empty params when the revision declares defaults.

### Baselines measured this run [F-run] — re-capture at the final tip, never carry
At 125e31cf (GC-12/GC-13 NOT yet merged):
- `cd app && npx vitest run src/analysis src/run` → **27 files / 285 tests, all passed**.
- `cd app && npx tsc --noEmit | grep -c 'error TS'` → **21** (pre-existing trunk drift; the bar is
  ZERO NEW, per GC-12 V4 precedent).
- `cd server && npx vitest run src/lint src/storage/acquisitionPackage.test.ts` → **12 files /
  218 tests, all passed** (acquisitionPackage suite ~78s, hash-heavy — spawn-heavy suites must run
  SERIALIZED per the analysisDReader.test.ts header note [F]).
- `cd server && npx tsc --noEmit | grep -c 'error TS'` → **0** (post-GC-11 re-anchor stands).
- **TRUNK FAILURE WITNESSED:** `cd app && npx vitest run src/sequences` → **1 failed | 53 passed
  (54)**, failing test `src/sequences/nativeDraft.test.ts > native draft review state > blocks
  acceptance while compiling or invalid and retains failed acceptance for retry` — reproduced
  SERIALLY (1 failed | 3 passed standalone), so it is a real trunk-red test at 125e31cf, not a
  parallel flake. GC-14's non-GC regression clause names DNA sequences → this MUST be green (or
  explicitly adjudicated) by gate time. → OQ-2.

## The dossier — contents template (this IS the deliverable shape)

Promoted spec instructs the orchestrator to author the dossier AT
`.hermes/plans/2026-10-30_GC-14-acceptance-dossier.md`, filling this template with gate-window
artifacts only. Every line in the dossier must name its artifact (receipt path, record id, hash, or
command output) — that is the `verified by` clause made mechanical.

- **S1 Revisions pinned.** Code: `git rev-parse HEAD` of cl/integration-1 at gate start AND at
  dossier commit (identical, or a delta appendix lists every intervening merge). Schema revision =
  same sha (schema/ rides the code repo). Data revision: `git -C
  /home/brad/.computable-lab-lane1/worktrees/main rev-parse HEAD` before/after the gate window.
  Runtime config: `sha256sum config.yaml` (gitignored — hash it, do not commit it).
- **S2 The cycle, with IDs.** Every record minted during the gate window, in order, with its GET
  readback: run record (kind run), ISEQ/ISEN records, SMP- sample, GCM- method (or the selected
  existing method + REV- pin if pinned), ACQP- id for RES35077-4.D + RES35077-5.D, per-file DREF
  ids with contentHash + sizeBytes + readerVersion, the analysis-run ANR id + status transitions,
  output artifacts AOUT ids, the VSPEC compare record, the assertion ASN id + claim CLM id, and the
  evidence bundle EVD id(s) with their supports/refutes/assesses choice.
- **S3 Hashes.** Table: file path on NAS → independent `sha256sum` (shell, server-independent) →
  DREF.contentHash → MATCH column. Both `.D` packages, every hashed file.
- **S4 Engine identity (GC-D3).** The gate run's `engineProvenance` verbatim from the record
  (engineRef/engineRecordId/engineVersion/adapter/interpreterPath/interpreterVersion/packages/
  probedAt/capabilitiesReported), plus live `/usr/bin/python3 --version` output, plus the engine
  record's declared constraint. Declared-vs-actual side by side; render `approximate` verbatim if
  ever present (never relabel).
- **S5 Numerical checks.** Independent recomputation of every number the dossier asserts:
  peak/fit values re-derived from the artifact payloads (equation + statistics re-evaluated in an
  independent python one-liner against the artifact's fit points), run/row counts recounted from
  `GET /api/records?...` totals, no number carried from a UI screenshot without the record field
  beside it.
- **S6 Quantitative-honesty clause (VERBATIM INTO THE DOSSIER, task-binding):**
  "Synthetic standards may not prop a quantitative claim. Any quantitative assertion in this
  dossier names the real standards (record ids + lot/level provenance + real-file hashes) that
  support it. Where real standard values are unavailable, the assertion is stated as QUALITATIVE
  (`assesses`, or a supports claim explicitly scoped to non-quantitative content) and this dossier
  says so plainly." The dossier's S2 assertion must be classed against this clause and the classing
  justified by named records. (At draft time the lane's calibration chain ANR-000013 is a TEST
  fixture with synthetic frozen levels — it may evidence TEST surfaces, never a quantitative
  scientific claim.)
- **S7 Test/typecheck transcripts.** Raw tail output (not summaries) of the §Verification commands
  run at the FINAL tip in the gate window: vitest counts, tsc error-line counts vs baseline, server
  suites, the DNA/sequences leg.
- **S8 Browser receipts.** Every `~/.hermes/cl/receipts/GC-14/<ts>/` dir: report.md verdicts,
  trail.json, shot names; the reviewer's per-criterion lines (A1-A9 below) quoted with screenshot
  filenames; per the reviewer-reliability rule, every negative claim (404/absent/not-rendered)
  marked re-verified.
- **S9 Git hygiene + drift proof.** The V4/V5 command outputs: no raw/large bytes added to either
  repo (code repo and the embedded data repo), and the end-to-end PACKAGE_HASH_DRIFT witness on the
  scratch copy. Plus the declarative-substitution flip record (V6): before/after readbacks, empty
  code diffs, restart note.

## Acceptance criteria — VERBATIM from task-list.md :8838-8860 (BINDING)

description:
:   Release gate. On the lane stack with gc-fid-nas configured: one real RES35077-4.D-class file
:   completes the whole cycle end-to-end in the UI; same-axes cross-run comparison demonstrated
:   with a second identified trace; assertion stands on genuine evidence (synthetic standards may
:   NOT prop a quantitative claim — qualitative assertions stand otherwise, stated honestly);
:   dossier records IDs, code/schema/data revisions, hashes, engine versions, numerical checks,
:   vitest/typecheck output, all browser receipts; git-hygiene check (no raw/large bytes in either
:   repo, hash-drift detection proven); a declarative substitution fixture flips method values +
:   compound terms + storage id with no code change; non-GC regression pass on /analysis and DNA
:   sequences.

verified by:
:   The dossier itself, reviewed by Brad; every claim in it points at a named artifact (receipt,
:   test run, record id, hash).

files: .hermes/plans/ dossier doc only

### Clause → proof map

| Clause | Proof (dossier section + command/receipt) |
|---|---|
| "lane stack with gc-fid-nas configured" | S1 config sha + [F-run pattern] `curl :3092/api/config` snippet showing the device entry (OPS pre-flight) |
| "one real RES35077-4.D-class file completes the whole cycle end-to-end in the UI" | Browser leg A1-A5 receipts + S2 id chain (run→ISEN→ACQP/DREF→ANR→results→EVD→ASN/CLM) — every id GET-verified |
| "same-axes cross-run comparison demonstrated with a second identified trace" | Leg A6: second `.D` (RES35077-5.D named) registered, VSPEC trace-comparison record id + screenshot of both traces on shared axes (GC-D4 surface) |
| "assertion stands on genuine evidence … synthetic standards may NOT prop a quantitative claim … stated honestly" | S6 verbatim clause + S2 classing justification; reviewer leg A8 confirms the form offers no quantitative shortcut without real standards |
| "dossier records IDs, code/schema/data revisions, hashes, engine versions, numerical checks, vitest/typecheck output, all browser receipts" | S1-S8 above; each section names its artifacts |
| "git-hygiene check (no raw/large bytes in either repo …)" | V5 outputs in S9: `git ls-tree -r HEAD --long` top-N in code repo + `git -C …/worktrees/main ls-tree -r HEAD --long` top-N in data repo, compared to pre-gate capture; zero new `.CH/.D/.M/.XML/raw` blobs |
| "hash-drift detection proven" | V4 in S9: register copy on `vast` scratch → verify OK → flip one byte IN THE COPY → re-verify/analysis-inputs returns named `PACKAGE_HASH_DRIFT`; unit-level pin exists [F :438], this is the live end-to-end witness |
| "declarative substitution fixture flips method values + compound terms + storage id with no code change" | V6: pre/post YAML fixture pair + API/UI readbacks; `git diff` EMPTY in the code repo across the flip; storage-id flip lives in gitignored runtime config (data/config, never TS) |
| "non-GC regression pass on /analysis and DNA sequences" | S7: `npx vitest run src/analysis` green AND `npx vitest run src/sequences` green at the final tip (see OQ-2 — sequences is red at draft time) + browser leg A9 spot-check of /analysis and /sequences render |
| "verified by: every claim points at a named artifact" | Dossier review pass by Brad; composer-mandated: no section may cite a bare adjective — only ids, paths, hashes, transcripts |

## First targeted check (prove the approach early)

Run it the moment GC-13 merges (all deps closed), BEFORE assembling any other dossier section:
register RES35077-4.D through the SHIPPED GC-12 mount route on the UI's own path and re-hash
independently:

    curl -s -X POST http://localhost:3092/api/acquisition-packages/register \
      -H 'content-type: application/json' \
      -d '{"deviceId":"gc-fid-nas","directoryKey":"machine1/RES35077-4.D"}'
    # then: GET the minted ACQP, follow files[].dataReferenceRef, and compare each DREF.contentHash
    # against (cd /mnt/vast/gc-fid/machine1/RES35077-4.D && sha256sum *)

Expected: 201/200 with an ACQP- id; every contentHash matches the independent sha256sum
[F-run anchors above for two of the files]. If the route shape differs post-merge, re-anchor the
exact path/payload from the merged RunSheetHandlers — do NOT hand-forge the ACQP record. If this
check fails, the entire dossier is blocked at the acquisition hop and the orchestrator escalates —
the rest of the dossier cannot paper over a broken trust anchor.

## Verification (complete commands; orchestrator-run, expected outputs pinned at re-anchor)

1. **V1 app legs** at FINAL tip (post GC-12+GC-13 merges):
   `cd app && npx vitest run src/analysis src/run` → ALL green (draft-time witness: 27 files/285
   [F-run]; expect growth, ZERO failures). Then the non-GC legs: `npx vitest run src/analysis`
   green AND `npx vitest run src/sequences` green (draft-time: 1 failed in nativeDraft.test.ts —
   MUST be fixed/adjudicated, OQ-2).
2. **V2 typecheck floors:** `cd app && npx tsc --noEmit 2>&1 | grep -c 'error TS'` → ≤ 21
   (draft baseline [F-run]; >21 = gate red, diff must name no gate files — dossiers don't write
   code); `cd server && npx tsc --noEmit 2>&1 | grep -c 'error TS'` → 0.
3. **V3 server legs (SERIALIZED spawns):** `cd server && npx vitest run src/lint
   src/storage/acquisitionPackage.test.ts` → green (draft witness 12 files/218 [F-run]);
   python-spawning suites (`analysisDReader`, `analysisGcCalibrationChaining`) each in their own
   `npx vitest run <file>` process per the standing NFS/parallel-flake ruling.
4. **V4 hash-drift end-to-end (drift detection proven):**
   (a) `mkdir -p /mnt/vast/computable-lab-data/gc14-drift && cp -r
   /mnt/vast/gc-fid/machine1/RES35077-4.D /mnt/vast/computable-lab-data/gc14-drift/` ;
   (b) register the copy via the register route with `deviceId: "vast"`,
   `directoryKey: "gc14-drift/RES35077-4.D"`; verify → clean;
   (c) `printf 'x' >> <copy>/FID1A.CH` ; (d) re-run verify / analysis-inputs → expect NAMED
   `PACKAGE_HASH_DRIFT` token, non-2xx. Capture request/response into S9. NEVER mutate
   /mnt/vast/gc-fid (device is read-only by policy — the copy is the whole point).
5. **V5 git hygiene:** before gate: capture
   `git ls-tree -r HEAD --long | sort -k4 -n | tail -20 > /tmp/gc14-code-top.txt` and the same on
   the data repo (`git -C /home/brad/.computable-lab-lane1/worktrees/main ls-tree -r HEAD --long`);
   after gate: re-capture, `diff` → the only allowed additions are the dossier (+ fixture YAML)
   commit(s) in the code repo and record YAMLs in the data repo. Explicit hunts:
   `git diff --name-only <gate-start>..HEAD | grep -Ei '\.(ch|d|m|xml|reg|log|bak|bin|pdf)$'` →
   empty; data-repo `find records/ -newer <stamp> -size +200k -name '*.yaml'` → empty (pre-existing
   AOUT-000013 1.67 MB + `_index/records.jsonl` + `var/jsonld-index.sqlite*` predate the window —
   hygiene scopes to NEW files, per the GC-13 bait-8 fixture-drift caveat).
6. **V6 declarative substitution flip, NO code change:**
   Fixture pair committed with the dossier under `.hermes/plans/gc14-substitution/`:
   `gc14-baseline.yaml` + `gc14-substituted.yaml` — each a gc-method payload (schema
   `schema/lab/gc-method.schema.yaml` [F: id `^GCM-…`, required kind/id/name/method_version, units
   embedded in field names e.g. `target_temp_c`, `ramp_rate_c_per_min`, enum carrier_gas
   [helium|nitrogen|hydrogen|other], additionalProperties:false — payloads MUST validate]) plus
   compound-term and device-id fields:
   - **method values:** oven ramp / inlet setpoints differ between the two payloads;
   - **compound terms:** swapped between the shipped vocabulary members — `FAME-LOCAL:methyl-octanoate-n8`
     (baseline) → `FAME-LOCAL:methyl-decanoate-n10` (substituted), both present candidates of
     `schema/registry/compound-classes/fame-medium-chain.yaml` [F] — no invented nouns (CLAUDE.md :157);
   - **storage id:** a DREF-payload arm + the runtime config device choice flips `gc-fid-nas` →
     `vast` (the drift-copy device) — config.yaml is gitignored data (`.gitignore:36` [F-run]), so
     the flip is config-only.
   Procedure: POST baseline payload via `/api/records` (Ajv+lint server-side), open its editor
   projection, screenshot the values; PUT the substituted values (or draft-copy per lane rules);
   re-read; screenshot flipped values. **Proof pins:** `git -C <code repo> diff --stat` EMPTY across
   the flip; no stack restart needed for record-level values (records re-read per request); if the
   orchestrator also flips a registry YAML (compound-class file) as an extended arm, that DOES need
   the orchestrator-owned restart (tsx --watch does not reload YAML) — record which arm ran.
7. **V7 browser gate (cl-browser-reviewer, tier-1, against :5192; receipts
   `/home/brad/.hermes/cl/receipts/GC-14/<ts>/`).** Criteria, handed verbatim:
   - A1 create/open a GC run via the shipped GC-12 door (run + sheet + table visible);
   - A2 method select/author + sample add land real records (ids into S2);
   - A3 attach `machine1/RES35077-4.D` on device gc-fid-nas — device dropdown only, NO path text
     box; ACQP id lands on the row;
   - A4 Analyze per the AMENDED OPT-A flow → lands /analysis?run=<id>, run created with pinned
     inputs (+ defaults when the revision declares them) → execute → results render;
   - A5 results→evidence hand-off (GC-13 surface): reviewer opens full context on a real-file
     artifact and sees engine name/version/interpreter VERBATIM (S4 values) + the provenance chain
     resolving to the NAS file hash from S3;
   - A6 second trace `RES35077-5.D` registered; same-axes compare rendered with BOTH traces
     identified; VSPEC id recorded;
   - A7 assertion authored: predicate from the registry, explicit supports/refutes/assesses choice
     (no pre-decision), lint-blocked missing-context attempt shown VERBATIM first, then the complete
     bundle creates (EVD readback 200);
   - A8 honesty probe: no path exists to phrase a quantitative claim off synthetic standards without
     the named-standards context (negative claim → re-verified per the reliability rule);
   - A9 non-GC control: open /analysis (an existing TEST run still renders) and /sequences (DNA
     surface loads, zero GC chrome); zero console errors across the session.
8. **Dossier self-check:** `grep -cE 'TODO|TBD|\[\.\.\.\]' <dossier>` → 0; every S2 id passes a
   live `GET /api/records/<id>` → 200 on :3092 at dossier-commit time (re-run at Brad's review if
   the stack moved).

## Files IN / OUT

IN (the only writes this item makes):
- `.hermes/plans/2026-10-30_GC-14-acceptance-dossier.md` — the dossier (task `files:` line).
- `.hermes/plans/gc14-substitution/gc14-baseline.yaml` + `gc14-substituted.yaml` — fixture YAML
  (data, committed WITH the dossier commit).
- Runtime-only, uncommitted by design: gitignored `config.yaml` drift-device entry (already shipped
  devices suffice), `/mnt/vast/computable-lab-data/gc14-drift/` scratch copy, lane data-repo records
  minted via API, receipts under `~/.hermes/cl/receipts/GC-14/`.

OUT (hard stops — reviewer rejects on sight):
- ANY file under `app/src/` or `server/src/` or `schema/**` — GC-14 ships ZERO code and ZERO schema.
  If the gate exposes a product-code gap (missing affordance, unresolvable hop, broken surface),
  STOP: record the gap verbatim in the dossier's `GAPS` appendix and route it to the orchestrator as
  a requires-rescope (standing platform-gap rule :39-40). Do not absorb a fix into the dossier item.
- No task-list edits, no merges, no restarts by any worker; stack lifecycle is orchestrator-owned.
- NEVER touch :5174/:3001, Brad's live data dir, or the main tree (standing lane rule).
- NEVER write to `/mnt/vast/gc-fid/**` (read-only device).
- No cleanup "tidying" of pre-existing lane records (all records are TEST DATA per Brad; A4
  no-cleanup posture).

## Worker contract

- **This item is orchestrator-run + cl-browser-reviewer heavy.** No cl-coder leg is planned.
  The orchestrator runs V1-V6 mechanically, dispatches the A1-A9 browser gate to
  cl-browser-reviewer (computable vision, systemd-run, PATH-export launcher per AS-L1T1045-1),
  audits receipts (receipt-audit duty: open screenshots, don't trust the report), then authors the
  dossier.
- Coder legs ONLY for a witnessed gap, and only gaps the orchestrator adjudicates as in-scope
  micro-fixes; each such leg branches `wt/gc-14-<leg>-lane1-l1t<ts>` off the CURRENT trunk tip,
  reports to `/home/brad/.hermes/cl/lanes/1/gc14-report-<leg>-l1t<ts>.md`, end-marker
  `GC14 <LEG> DONE <sha>`, RED-first, and re-opens the affected dossier section + adv review,
  since code changed under a release gate. A gap that is not a micro-fix is a rescope, not a leg.
- Browser gate branch/receipt contract: receipts `/home/brad/.hermes/cl/receipts/GC-14/<ts>/`
  (report.md, trail.json, shots), candidate stamp = trunk sha served at :5192.
- Dossier promotion: orchestrator commits the dossier + fixture YAML to the trunk as a docs commit
  (`docs(lane1): GC-14 acceptance dossier`), then Brad reviews.

## Reviewer bait (name the likely edge errors up front)

1. **Synthetic-standard smuggling — THE trap for this item.** A reviewer must hunt any quantitative
   number (concentration, recovery %, calibration slope asserted as lab truth) and demand the real
   standards chain beside it; anything backed by TEST fixtures (ANR-000013-style synthetic levels)
   re-classed as QUALITATIVE or struck. The S6 clause exists precisely because green fixtures +
   polished UI cannot prop the claim (task `why:` :8854-8856).
2. **Hash theatre.** ContentHash equality checked by re-reading the DREF twice proves nothing —
   S3 requires INDEPENDENT `sha256sum` in a separate shell. Drift "proof" by quoting the unit test
   instead of the live V4 witness, or mutating the real NAS copy (forbidden), is a reject.
3. **Raw/large bytes sneaking into either repo.** The natural failure: someone commits `FID1A.CH`
   (or a screenshot blob, or a `.raw` transcript) "as evidence." Data repo has a 1.67 MB inline
   precedent (AOUT-000013) [F-run] — hygiene scoped to NEW files in the window; any new >200k yaml
   or binary blob = reject; receipts live in `~/.hermes/cl/receipts/`, NOT in the repos.
4. **YAML-reload trap in the substitution leg.** The record-level flip needs no restart; a registry
   YAML flip DOES (tsx --watch does not reload YAML). A dossier that flips registry YAML and
   "forgets" the restart proves the opposite of what it claims (stale projection). State which arm
   ran, with the restart stamp.
5. **Ontology terms required.** Claim predicate must exist in `predicates.registry.yaml` [F];
   compound terms must be `FAME-LOCAL:` candidates of a shipped compound-class [F]; a fabricated
   CURIE or free-text noun is a defect (CLAUDE.md :157). One claim = one triple; never collapse
   concept ≠ formulation ≠ instance ≠ aliquot (CLAUDE.md :158) in the lineage screenshots.
6. **Hardcode boundary in the substitution.** The flip must ride the existing generic record API +
   projection; if completing the flip needed ANY TS change, the criterion is FAILED, not amended —
   the dossier must say so rather than quietly accepting a code-assisted flip.
7. **Engine-version laundering.** S4 compares DECLARED constraint vs ACTUAL probe
   (`packages []` + missing scipy is CONSISTENT, python 3.14.7 satisfies `>=3.11`); presenting the
   engine record's claims without the live probe output, or the run's engineProvenance without the
   engine record, is half-proof.
8. **Negative-claim reliability.** A8/A9 negatives (no path, no chrome, no console errors) must be
   re-verified live per the wave-2 reviewer rule — the falsified-404 and stale-screenshot incidents
   are the precedent.
9. **Baseline carrying.** All expected test counts in this spec are DRAFT-TIME witnesses at
   125e31cf; a dossier that pastes them instead of re-runs at the final tip is a reject. Including
   the known-red `src/sequences/nativeDraft.test.ts` — do not hide it under a filter run; either
   green it legitimately or the dossier records the orchestrator's explicit adjudication.
10. **exactOptionalPropertyTypes / tsc** — moot if the no-code rule holds; it is the tripwire that
    proves it (V2 floors, zero new).

## Ops prerequisites (orchestrator-owned, pre-flight before the gate)

1. NAS liveness: `ls /mnt/vast/gc-fid/machine1/RES35077-4.D/FID1A.CH` succeeds AND `curl
   :3092/api/config | grep gc-fid-nas` present — both re-run at gate start into S1 (mount can lapse;
   the 2026-10-28 verification predates the gate window).
2. Deps merged: GC-12 merged incl. fix1+D3+cycle-2 adv gate+browser V7, GC-13 merged incl. its G1-G8
   browser gate; trunk re-anchored; lane stack RESTARTED post-merge with the served candidate
   pre-checked (`:5192` serves the merged app).
3. Fixture seeding: the cycle mints its OWN chain via UI/API (claim/assertion/MCTX totals are 0
   today [F-run] — nothing to inherit); do NOT hand-seed records the browser leg is supposed to
   create. The GC-13 TEST records (its gate's EVD/ASN) may exist post-merge — reuse them only for
   surfaces explicitly allowed; the dossier's own assertion is freshly authored in-browser.
4. Scratch room: `/mnt/vast/computable-lab-data/gc14-drift/` create + remove around V4 (42T free
   [F-run]).
5. Engine probe freshness: confirm the engine still resolves (availability/interpreter) before the
   analyze leg; python interpreter unchanged (`/usr/bin/python3 --version` [F-run] 3.14.7).
6. Sequences-suite green-ness resolved (OQ-2) BEFORE the dossier is assembled.

## What the composer verified vs assumed

VERIFIED first-hand this run: everything marked [F]/[F-run] above — route inventory, device config
+ gitignore, NAS tree (14 `.D` incl. 2 nested; 12 top-level), engine + provenance readbacks,
fixture/claim/assertion/MCTX/view-spec counts, lint-files-empty, predicate registry, FAME class,
independent hashes of 2 files, all test/tsc counts, the red sequences test (serial), absent GC-12
route on trunk, data-repo layout (`worktrees/main` is the embedded git — top-level data dir is NOT
a git repo [F-run]).
ASSUMED [I]: RES35077-5.D is the appropriate second same-axes trace (same series; content parity not
scientifically confirmed — the reviewer's A6 render is the proof); GC-12's shipped route/params as
described in its amended spec; GC-13's shipped hand-off surface per its D1-D4; that claim/assertion
creation via the generic record path satisfies the reviewer without a bespoke wizard (GC-13 D3 says
yes). No cl-scout dispatch this run: every load-bearing fact was verifiable locally and was
verified first-hand (GC-13 composer precedent — scout output is screening, not authority).

## OPEN QUESTIONS (orchestrator; max 3)

> **ORCH ADJUDICATIONS 2026-10-29T06:45 (tick, trunk ae2bcaa4) — applied to this spec:**
>
> OQ-2 RESOLVED by orch. Red re-witnessed FIRST-HAND at ae2bcaa4 ([orch-run]: 1 failed | 3
> passed, `errorLike is not a constructor`). Root cause already pinned 2026-10-28 (task-list
> `native_draft_root_cause_20261028T2150`): vitest-dev/vitest#5285 — the
> `@testing-library/jest-dom/vitest` global extend in `app/src/test/setup.ts:1` breaks
> `rejects.toThrow(<regex>)` app-wide. Orch checked both remediation legs first-hand at
> ae2bcaa4: option (a) drop-the-extend is OUT — 49 test files rely on jest-dom matchers with
> zero per-file imports (grep count), so the "per-suite imports" variant is a 49-file churn,
> not a micro-fix; option (b) is ADOPTED — convert the exactly-10 `rejects.toThrow(/regex/)`
> sites (grep-enumerated: nativeDraft.test.ts:39, applyDraftProtocolEdit.test.ts:166,176,211,218,
> protocolEditOps.test.ts:411,433, eventGraphPersistence.test.ts:136,220, semanticDraft.test.ts:199)
> to try/catch message-regex asserts. ADJUDICATION: this is lane infra owned by the ORCHESTRATOR
> as a small dedicated coder leg DISJOINT from GC-12/GC-13 boundaries (composer's recommendation
> accepted), to run BEFORE dossier assembly. GC-14 itself keeps no sequences file authority; the
> dossier's DNA clause is satisfied only when `npx vitest run src/sequences` is green at the final
> tip — no exception clause.
>
> OQ-3 RESOLVED by orch (QUALITATIVE-default folded, per 152nd handoff carry + task-list
> `native_draft_root_cause` context): the gate's assertion is planned as QUALITATIVE
> (`assesses`) by default. No invented standard values, ever (Hard Boundary). If Brad supplies
> genuine standard values as records pre-gate, the quantitative arm activates; until then the
> dossier demonstrates the lint machinery on the missing-context BLOCKING attempt (a real
> lint-blocked create is itself gate evidence, GC-13's evidence.lint floor now live on trunk).
> S6 stays verbatim and binding either way.
>
> OQ-1 REMAINS OPEN until the GC-12 merge + GC-13 gatefix merge land; re-anchor §First-targeted-
> check, V6, A1-A9 at claim against the post-merge trunk tip.

- **OQ-1 (deps not shipped — mount-leg cites are hypotheses).** GC-12 (fix1/D3 in flight at draft
  time, 140th handoff) and GC-13 (undispatched) will move every surface this dossier walks:
  register route path, Analyze Flow-A chrome, GC-13 hand-off affordance, evidence lint rules.
  CHECKED: routes.ts has no acquisition-packages route at 125e31cf [F-run]; evidence/assertion lint
  `rules: []` [F]. RESOLUTION at claim: re-anchor §First-targeted-check, V6, A1-A9 against merged
  trunk; this spec's procedures and honesty rules need no change.
- **OQ-2 (DNA regression clause is trunk-RED today).** `app/src/sequences/nativeDraft.test.ts`
  "blocks acceptance while compiling or invalid and retains failed acceptance for retry" fails at
  125e31cf in serial [F-run] — inside the very clause "non-GC regression pass on … DNA sequences."
  CHECKED: not a parallel flake (serial repro); GC-13's file list does not include app/src/sequences;
  GC-12's boundary caps it out of sequences. Ask: does a GC-12/GC-13 leg own greening it, does it
  predate the campaign (blame + adjudication needed), or does GC-14 get an exception clause? A
  release gate should not ship over it silently — my recommendation: assign green-up (or a written
  adjudication) to the orchestrator BEFORE dossier assembly, not to GC-14's file-scoped boundary.
- **OQ-3 (quantitative vs qualitative adjudication).** The task text anticipates this: real
  quantitative claims need real standard values; the lane's only level/standards chain (ANR-000013,
  frozen `parameters.levels[]`) is a TEST gate fixture and the real RES35077 `.D` files carry no
  standard-value records. CHECKED: claim/assertion tables empty [F-run]; nothing in the data dir
  names real standard concentrations. Recommendation: plan the gate's assertion as QUALITATIVE
  (`assesses`, honestly classed per S6) unless Brad supplies genuine standard values with the
  sample metadata; the dossier then demonstrates the lint machinery on the missing-context attempt
  rather than on a fake quantitative floor. If Brad wants the quantitative arm, the real numbers must
  arrives as records — a pre-gate OPS seed, not an invention at gate time.

## RE-ANCHOR ADDENDUM (orch, 2026-10-29T11:00 tick, post-merge trunk `ea479a43`) — OQ-1 CLEARED

OQ-1 is CLOSED by first-hand witness at trunk ea479a43 (GC-12 merged, GC-13 merged incl.
gatefix2 aa9bd8d5; GC-13 browser gate2 IN FLIGHT, pinned aa9bd8d5 — GC-14 promotion still
waits on that VERDICT).

1. §First-targeted-check PAYLOAD IS SUPERSEDED. The merged register route
   (routes.ts:435-436, RunSheetHandlers.ts:114-175) REQUIRES `entryRef`:
   `{"deviceId":"gc-fid-nas","directoryKey":"machine1/RES35077-4.D","entryRef":{"kind":"record","id":"<ISEN-...>","type":"instrument-sequence-entry"}}`.
   Auth gate = SAME as record update: 404 unknown entry -> 401 no user -> 403 no WRITE on the
   entry, DENIED BEFORE minting (no orphan). Witness [orch-run l1t1055]: as USR-LOCAL-ADMIN and
   USR-QMS-ADMIN -> 403 on ISEN-d2k8o6; as USR-BRAD -> 200 `ACQP-000002`, 21 files,
   DREF-000029..000049, every contentHash BYTE-MATCHED independent `sha256sum` (21/21 MATCH,
   zero mismatch; file list + per-file verdicts in this tick's log). ACQ.M/ and DA.M/ nested
   members hashed too. FID1A.CH=`a13bcd0e...21300`, SAMPLE.XML=`d38cefcc...5cb876` reproduced.
   -> Dossier V-leg "one real file completes the cycle" TRUST ANCHOR IS LIVE ON TRUNK.
2. IMPLICATION FOR BROWSER LEG A3 (gate-window ops): the attach identity must hold WRITE on the
   run-sheet's ISEN entry. ISEN-d2k8o6's ACL admits USR-BRAD (the GC-12/13 regate fixtures ran
   under it). At gate, either author the run sheet under an identity that owns its own ISEN
   (cleanest — the UI flow creates the chain), or grant the chosen identity editor on the entry
   via its ACL record. Record which identity ran A3 in S2.
3. Superseded draft cites, corrected at this tip: evidence.lint.yaml = 5 rules LIVE,
   assertion.lint.yaml = 1 rule LIVE (draft's `rules: []` cite is dead). Lane claim total = 1,
   assertion total = 1 (GC-13 gate residue), measurement-context total = 0. GC-14's own
   assertion is still freshly authored in-browser; do not reuse GC-13's.
4. DNA clause (OQ-2 remediation leg) IS SATISFIED at trunk: DNAAFIX merged 94a8c0ed;
   `npx vitest run src/sequences` 54/54 GREEN in the 1.6.0 acceptance env (156th handoff cites).
   Dossier V1 sequences leg re-runs at the FINAL tip anyway (baseline-carrying bait #9 stands).
5. NAS pre-flight RE-RUN at gate start (ops-prereq 1): this tick witnessed 12 top-level .D dirs
   under machine1 (RES35077-4.D + RES35077-5.D present), `vfat` mount live,
   :3092 /api/config storageDevices = [vast, gc-fid-nas].
6. Gate-window hygiene baseline: capture code-repo + data-repo `ls-tree` tops AFTER the GC-13
   gate2 residue settles (the in-flight gate is minting records NOW; ACQP-000002 + DREF-000029..49
   from this pre-check are pre-gate-window — exclude from the V5 new-file diff by stamping the
   gate window start AFTER this tick).

