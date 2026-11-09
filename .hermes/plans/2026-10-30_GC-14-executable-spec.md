# GC-14 EXECUTABLE SPEC (DRAFT) — campaign release gate: dossier + one real NAS .D through the full cycle in the browser
> DRAFT — cl-spec-composer run l1t1322, 2026-10-29. Orchestrator reviews, fixes, promotes to
> `.hermes/plans/2026-10-30_GC-14-acceptance-dossier.md`. This spec EXECUTES the proven acceptance
> dossier draft: `~/.hermes/cl/lanes/1/drafts/2026-10-28_GC-14-acceptance-dossier.l1t1640.draft.md`
> INCLUDING its 157th-tick re-anchor addendum. Where they conflict, the addendum's §payload
> (register route REQUIRES `entryRef`) SUPERSEDES the draft's §First-targeted-check payload, and this
> spec's re-measured baselines (below) supersede the draft's 125e31cf witnesses.
>
> TRUNK STAMPED AGAINST (composer first-hand this run): `cl/integration-1` docs tip `32f6c826`,
> code tip `049e5b87` (GC-13 gatefix3 merged; git via `-c core.fileMode=false`).
> 158th handoff (`...GATE3-LIVE-158TH.md`) is the newest.
>
> **PROMOTION IS CONDITIONAL:** GC-13 browser gate3 was LIVE at compose time (receipts
> `GC-13/20261029T131410-gate3/`, AS-L1T1315-2 OPEN). GC-14 may be claimed ONLY on gate3
> VERDICT: accept. If gate3 returns FIX, the trunk moves — re-anchor this spec's cites at the new
> tip before dispatch (house AMEND-AT-MERGE pattern). Nothing below depends on gatefix3's *content*;
> the re-anchor is mechanical (git rev-parse + the re-pin table in §Baselines).

## Goal (one sentence)
On the lane stack with gc-fid-nas live, drive ONE real NAS `.D` package (RES35077-4.D) through the
whole cycle in the browser — run sheet → method → samples → NAS attach → analyze → results →
same-axes cross-run compare with a second identified trace (RES35077-5.D) → a scientist-authored
QUALITATIVE assertion standing on lint-guarded evidence — and record every claim (IDs, revisions,
hashes, engine versions, numerical checks, test output, receipts) in a single dossier document that
Brad reviews as the campaign's definition-of-done.

## Task contract — VERBATIM from task-list.md :9350-9372 (BINDING)
- id: GC-14; status: todo; deps: GC-13; spec path (canonical): `.hermes/plans/2026-10-30_GC-14-acceptance-dossier.md`
- description (verbatim): "Release gate. On the lane stack with gc-fid-nas configured: one real
  RES35077-4.D-class file completes the whole cycle end-to-end in the UI; same-axes cross-run
  comparison demonstrated with a second identified trace; assertion stands on genuine evidence
  (synthetic standards may NOT prop a quantitative claim — qualitative assertions stand otherwise,
  stated honestly); dossier records IDs, code/schema/data revisions, hashes, engine versions,
  numerical checks, vitest/typecheck output, all browser receipts; git-hygiene check (no raw/large
  bytes in either repo, hash-drift detection proven); a declarative substitution fixture flips
  method values + compound terms + storage id with no code change; non-GC regression pass on
  /analysis and DNA sequences."
- verified by (verbatim): "The dossier itself, reviewed by Brad; every claim in it points at a
  named artifact (receipt, test run, record id, hash)."
- files (verbatim): ".hermes/plans/ dossier doc only"

**This item ships ZERO product code.** The `files:` line admits the dossier document and its
fixture YAML only. If the gate exposes a product-code gap, STOP (§Stop boundaries) — do NOT
absorb a fix into the dossier item.

## Adjudications already landed (apply, do not relitigate)
- **OQ-1 CLOSED (157th addendum).** Register route live at `server/src/api/routes.ts:435-436`,
  REQUIRES `entryRef` (`server/src/api/handlers/RunSheetHandlers.ts:116-120` — composer re-read
  first-hand at 049e5b87): 400 without entryRef, 404 unknown entry → 401 no user → 403 no WRITE on
  the entry, DENIED BEFORE minting (no orphan). Witness: USR-BRAD → 200 `ACQP-000002`, 21 files,
  DREF-000029..49, 21/21 contentHash byte-matched independent sha256sum.
- **OQ-2 CLOSED.** DNA-FIX merged 94a8c0ed. Composer re-witnessed THIS run at 049e5b87:
  `cd app && npx vitest run src/sequences` → **7 files / 54 tests, all passed** (solo, 13.2s).
- **OQ-3 CLOSED (orch).** The gate's assertion is planned QUALITATIVE (`assesses`). No invented
  standard values, ever (Hard Boundary). If Brad supplies genuine standard records pre-gate, the
  quantitative arm activates. S6 clause stays verbatim either way.
- **Lint floor is LIVE** (draft's `rules: []` cite dead): evidence.lint.yaml = 5 rules,
  assertion.lint.yaml = 1 rule (`asn-scoped-assertion-needs-context`, :19) — composer-verified.

## Oriented facts (composer-verified first-hand this run at 049e5b87 unless noted)
Legend: [F] opened first-hand; [F-run] executed first-hand; [A] from the 157th addendum/orch log.

- Stack: `curl :3092/api/config` → storageDevices = `['vast','gc-fid-nas']` [F-run]; `:5192` → 200
  [F-run]. config.yaml (gitignored) declares `gc-fid-nas` at :48 [F].
- NAS: 12 top-level `.D` dirs under `/mnt/vast/gc-fid/machine1` [F-run]; RES35077-4.D and
  RES35077-5.D both present [F-run]. Independent re-hash THIS run [F-run]:
  `FID1A.CH = a13bcd0e0f4f409fec1d81e6fd273c467df00f0c647d3892a20cad7803f21300`,
  `SAMPLE.XML = d38cefcc2ab44116f9a8c2ba235203cd3e8fb726ab1d445575b97575815cb876` (reproduces the
  addendum anchors exactly). Nested-member hashing reproduced independently:
  `sha256sum ACQ.M/ACQ.TXT = 6743baa1…4b263` == `DREF-000035.contentHash` [F-run].
- Lane record counts now [F-run]: claim total **1**, assertion total **1** (GC-13 gate residue —
  do NOT reuse; GC-14's assertion is freshly authored in-browser), measurement-context **0**,
  analysis-run **27**, view-spec **12**. `ACQP-000002` readable with 21 files [F-run] —
  PRE-GATE residue; exclude from V5 new-file diff (157th addendum item 6).
- Shipped surfaces the browser legs walk: `/gc-run/:runId` → GcEvidenceRunPage
  (`app/src/App.tsx:211` [F]) hosting GcEvidenceHandoff + GcProvenancePanel
  (`app/src/run/gc/GcEvidenceHandoff.tsx`, `GcProvenancePanel.tsx`, `gcEvidenceSources.ts` —
  the kind→EvidenceSource.type data table) [F]; `/claims/:claimId` → ClaimWorkspace
  (`App.tsx:158`) [F]; `/analysis` with `?run=` deep-link (AnalysisPage.tsx:276
  `searchParams.get('run')`) [F]; `/sequences` + `/lab/sequences` (App.tsx:227-228) [F];
  `/record/:recordId` (App.tsx:217) [F]. Attach panel: `app/src/run/gc/GcAttachPanel.tsx` —
  device **`<select>` built from GET /config** (never hardcoded; :69 comment, :196 select) and a
  directoryKey **text input** — the key is a relative directory key, NOT a mount path (route
  400-message: "the CONFIG storage device id … never a mount path", RunSheetHandlers.ts) [F].
- Drift machinery: `PACKAGE_HASH_DRIFT` named token at `server/src/storage/acquisitionPackage.ts:87`,
  raised :576/:582 on verify/input-resolution [F]. Unit pin exists; V4 below is the live
  end-to-end witness.
- Substitution vocabulary: `FAME-LOCAL:methyl-octanoate-n8` (fame-medium-chain.yaml:17) and
  `FAME-LOCAL:methyl-decanoate-n10` (:19) both shipped candidates [F]; `schema/lab/gc-method.schema.yaml`
  + `gc-method.lint.yaml` present [F]. No invented nouns (CLAUDE.md :157).

## Baselines — RE-MEASURED by the composer THIS run at 049e5b87 (never carry; re-capture at final tip)
| Leg | Command | Witness @049e5b87 |
|---|---|---|
| app GC trio | `cd app && npx vitest run src/analysis src/run` | **44 files / 422 tests, all passed** |
| DNA leg | `cd app && npx vitest run src/sequences` | **7 files / 54 tests, all passed** (solo) |
| app typecheck | `cd app && npx tsc --noEmit \| grep -c 'error TS'` | **21** (zero-NEW floor) |
| server typecheck | `cd server && npx tsc --noEmit \| grep -c 'error TS'` | **0** |
| server legs | `cd server && npx vitest run src/lint src/storage/acquisitionPackage.test.ts --no-file-parallelism` | **13 files / 236 tests, all passed** (~94s) |
Python-spawning suites (`analysisDReader`, `analysisGcCalibrationChaining`) run each in their own
`npx vitest run <file>` process per the standing serialization ruling.

## Work items (numbered; file boundaries per item)
The orchestrator runs WI-0/1/2/5/6 and authors WI-7/8; cl-browser-reviewer runs WI-3; WI-4 is
orchestrator-run against the API. No cl-coder leg is planned (see §Worker contract).

### WI-0 — Pre-flight (writes: nothing; outputs into dossier S1/S9)
1. `git -C /mnt/vast/home/brad/git/cl-integration-1 rev-parse HEAD` (code revision, gate start).
2. `git -C /home/brad/.computable-lab-lane1/worktrees/main rev-parse HEAD` (data revision;
   composer witness this run: d7e942cf [F-run]).
3. `sha256sum config.yaml` (gitignored — hash, never commit).
4. NAS liveness: `ls /mnt/vast/gc-fid/machine1/RES35077-4.D/FID1A.CH` succeeds AND
   `curl -s :3092/api/config | grep -o gc-fid-nas` non-empty (mount can lapse; re-run at gate start).
5. Engine freshness: `GET :3092/api/records/ENG-PYCAL01-L1T2305` → 200; `/usr/bin/python3 --version`
   → 3.14.7 (satisfies declared `>=3.11`; scipy absent is CONSISTENT with `packages []` — do not
   "fix"). Render declared-vs-actual side by side in S4.
6. Hygiene baseline capture BEFORE the window (157th addendum item 6): the two `git ls-tree -r
   HEAD --long | sort -k4 -n | tail -20` tops (code repo + data repo) and a window-start stamp
   taken AFTER the GC-13 gate residue settles — ACQP-000002 + DREF-000029..49 + GC-13's
   claim/assertion residue are pre-window, excluded from V5.
7. Fresh serial baseline re-run of the §Baselines table at the FINAL tip if it moved since this
   draft.

### WI-1 — FIRST TARGETED CHECK (early proof; run before assembling any other section)
Register RES35077-4.D through the SHIPPED GC-12 route with the ADDENDUM payload (entryRef required
— the draft's two-field payload returns 400 and is dead):
```
curl -s -X POST http://localhost:3092/api/acquisition-packages/register \
  -H 'content-type: application/json' \
  -d '{"deviceId":"gc-fid-nas","directoryKey":"machine1/RES35077-4.D",
       "entryRef":{"kind":"record","id":"<ISEN-...>","type":"instrument-sequence-entry"}}'
```
`<ISEN-...>` = an entry the operating identity has WRITE on (the 157th witness used ISEN-d2k8o6
under USR-BRAD; at gate, prefer an ISEN the UI flow itself creates in WI-3 A1/A2 — S2 records
which identity ran). Then GET the minted ACQP, follow every `files[].dataReferenceRef`, and
compare each `DREF.contentHash` against a server-independent
`(cd /mnt/vast/gc-fid/machine1/RES35077-4.D && find . -type f -exec sha256sum {} +)`.
Expected: 200 with an `ACQP-` id; 21 files (incl. nested `ACQ.M/…` members); **every hash
byte-MATCHes** (21/21; the 157th witness plus this run's reproduction of FID1A.CH / SAMPLE.XML /
ACQ.M/ACQ.TXT). If this fails, the dossier is BLOCKED at the acquisition hop — escalate, the rest
of the dossier cannot paper over a broken trust anchor. Do NOT hand-forge the ACQP record.

### WI-2 — Hygiene baseline + revision pinning (dossier S1, S9 scaffolding)
Covered by WI-0 items 1-3, 6. Files in scope: none (read-only commands; outputs go to the dossier).

### WI-3 — Browser gate A1–A9 (cl-browser-reviewer, tier-1 vision, against :5192; :3092 data plane)
Criteria handed VERBATIM (mapped to the acceptance clauses at the top of each). S2 fills from the
trail. Branch: none — the gate runs against the trunk served at :5192 (candidate stamp = trunk
sha, recorded in report.md).
- **A1** (clause: "one real … file completes the whole cycle end-to-end in the UI", part 1):
  create a GC run via the shipped GC-12 door — run + sheet + table visible on the served run page.
- **A2** (same clause, part 1): method select/author + sample add land real records (GCM-/REV-,
  SMP- ids into S2).
- **A3** (same clause, part 2 — NAS attach): attach `machine1/RES35077-4.D` on device
  gc-fid-nas via **GcAttachPanel**: device chosen from the `/config`-driven dropdown ONLY (no
  mount-path text anywhere — the directoryKey text input is the shipped sanctioned affordance for
  the relative `.D` key; see bait #11); ACQP id lands on the row; the operating identity has WRITE
  on the entry (403/401 arms would be a defect — record which identity ran in S2).
- **A4** (same clause, part 3 — analyze): Analyze per the AMENDED OPT-A Flow A → lands
  `/analysis?run=<id>`; run created with pinned inputs (+ defaults when the revision declares
  them — `collectDefaults`); execute; results render.
- **A5** (clause: "dossier records … engine versions" + GC-D3): results → evidence hand-off —
  reviewer opens full context (GcProvenancePanel on `/gc-run/:runId`) on a real-file artifact and
  sees engine name/version/interpreter VERBATIM (S4 values: engineRef ENG-PYCAL01-L1T2305 or its
  gate-time successor, engineVersion, interpreterPath/Version) + the provenance chain resolving to
  the S3 NAS file hash. Unresolved hops render TEXT, not a dead `/record` anchor (gatefix3 pin).
- **A6** (clause: "same-axes cross-run comparison demonstrated with a second identified trace"):
  second `.D` = **RES35077-5.D** registered the same way (own ACQP + DREFs, hashes into S3);
  same-axes compare rendered with BOTH traces identified on shared axes (view-spec
  "Trace comparison" surface); VSPEC record id recorded.
- **A7** (clause: "assertion stands on genuine evidence"): assertion authored in-browser —
  predicate from `schema/registry/predicates.registry.yaml` (allow-list), explicit
  supports/refutes/**assesses** choice with NO pre-decision, the lint-BLOCKED missing-context
  attempt shown VERBATIM first (assertion.lint `asn-scoped-assertion-needs-context` refuses),
  then the complete bundle creates (EVD readback 200 on :3092). Per OQ-3: QUALITATIVE (`assesses`)
  by default.
- **A8** (clause: "synthetic standards may NOT prop a quantitative claim — … stated honestly"):
  honesty probe — no path exists to phrase a quantitative claim off synthetic standards without
  named-standards context (negative claim → MUST be re-verified per the reliability rule).
- **A9** (clause: "non-GC regression pass on /analysis and DNA sequences"): open `/analysis` (an
  existing TEST run still renders) and `/sequences` (DNA surface loads, zero GC chrome); zero
  console errors across the session (negative claims re-verified).
- **Receipt dir (unique pattern):** `/home/brad/.hermes/cl/receipts/GC-14/<UTC ts>/` —
  `date -u +%Y%m%dT%H%M%S` at dispatch, e.g. `GC-14/20261029T143012-gate/`; contents report.md
  (per-criterion A1–A9 verdict lines quoting screenshot filenames), trail.json, shots/. Receipts
  live ONLY there — never in either repo.

### WI-4 — V4 hash-drift end-to-end witness (dossier S9; clause "hash-drift detection proven")
(a) `mkdir -p /mnt/vast/computable-lab-data/gc14-drift && cp -r
/mnt/vast/gc-fid/machine1/RES35077-4.D /mnt/vast/computable-lab-data/gc14-drift/`
(b) register the COPY: `deviceId:"vast"`, `directoryKey:"gc14-drift/RES35077-4.D"`, an entryRef
the identity can WRITE → verify clean. (c) `printf 'x' >> <copy>/FID1A.CH`. (d) re-run verify /
`POST /api/acquisition-packages/<id>/analysis-inputs` → non-2xx carrying the NAMED token
`PACKAGE_HASH_DRIFT` (token at acquisitionPackage.ts:87, raised :576/:582). Capture request/
response into S9. **NEVER mutate /mnt/vast/gc-fid** (read-only device — the copy is the whole
point). Scratch dir created and removed around the leg (42T free on vast).

### WI-5 — V6 declarative substitution flip, NO code change (clause "declarative substitution fixture flips …")
Fixture pair committed WITH the dossier under `.hermes/plans/gc14-substitution/`:
`gc14-baseline.yaml` + `gc14-substituted.yaml` — schema-valid gc-method payloads
(`schema/lab/gc-method.schema.yaml`; units embedded in field names e.g. `target_temp_c`,
`ramp_rate_c_per_min`; enum carrier_gas; additionalProperties:false — payloads MUST validate).
- **method values:** oven ramp / inlet setpoints differ between the pair;
- **compound terms:** swapped between shipped vocabulary members — `FAME-LOCAL:methyl-octanoate-n8`
  (baseline) → `FAME-LOCAL:methyl-decanoate-n10` (substituted), both verified present
  (fame-medium-chain.yaml:17,19) — no invented nouns;
- **storage id:** DREF-payload arm + runtime-config device choice flips `gc-fid-nas` → `vast`
  (config.yaml is gitignored data — the flip is config-only).
Procedure: POST baseline via `POST /api/records` (Ajv + lint server-side), open its editor
projection, screenshot; PUT the substituted values (or draft-copy per lane rules); re-read;
screenshot flipped values. **Proof pins:** `git -C /mnt/vast/home/brad/git/cl-integration-1 diff --stat`
EMPTY across the flip; no restart needed for record-level values; IF the orchestrator also flips a
registry YAML (compound-class file) as an extended arm, that DOES need the orchestrator-owned
restart (tsx --watch does not reload YAML) — record WHICH arm ran, with the restart stamp.
If completing the flip needed ANY TS change, the criterion is FAILED, not amended — the dossier
says so plainly.

### WI-6 — V1–V3 verification legs at the FINAL tip (dossier S7; raw tails, not summaries)
Run the §Baselines table commands verbatim at the final tip (never paste this draft's witnesses —
bait #9). Gate: ZERO failures; app tsc ≤ 21 error lines with zero NEW files-with-errors; server
tsc 0. The DNA leg must be green outright — OQ-2 pre-satisfied, no exception clause.

### WI-7 — Dossier authoring (the deliverable)
At the canonical path `.hermes/plans/2026-10-30_GC-14-acceptance-dossier.md`, template §S1–S9 of
the proven draft, verbatim, with gate-window artifacts only. Every line names its artifact
(receipt path, record id, hash, or command output) — that is the `verified by` clause made
mechanical. S6 carries the honesty clause VERBATIM (draft §S6) and classes the S2 assertion
against it with named-record justification. GAPS appendix (empty if none).

### WI-8 — Hygiene close + dossier self-check + promotion commit (clause "git-hygiene check")
1. V5 re-capture + diff vs WI-0/6 baselines: only allowed additions = the dossier + fixture YAML
   commit(s) in the code repo, record YAMLs in the data repo. Explicit hunt:
   `git diff --name-only <gate-start>..HEAD | grep -Ei '\.(ch|d|m|xml|reg|log|bak|bin|pdf)$'` →
   EMPTY; data-repo `find records/ -newer <stamp> -size +200k -name '*.yaml'` → EMPTY (hygiene
   scopes to NEW files; pre-existing AOUT-000013 1.67 MB + `_index/` + sqlite index predate).
2. Self-check: `grep -cE 'TODO|TBD|\[\.\.\.\]' <dossier>` → 0; EVERY S2 id passes a live
   `GET :3092/api/records/<id>` → 200 at dossier-commit time.
3. Orchestrator commits dossier + fixture YAML to trunk as `docs(lane1): GC-14 acceptance dossier`;
   Brad reviews. DONE is marked by the orchestrator only, after Brad's review per the task's
   `verified by`.

## Files IN / OUT
IN (the only writes this item makes):
- `.hermes/plans/2026-10-30_GC-14-acceptance-dossier.md` — the dossier (task `files:` line).
- `.hermes/plans/gc14-substitution/gc14-baseline.yaml` + `gc14-substituted.yaml` — fixture YAML,
  committed WITH the dossier commit.
- Runtime-only, uncommitted by design: gitignored config.yaml (never edited beyond shipped devices —
  shipped `[vast, gc-fid-nas]` suffices), `/mnt/vast/computable-lab-data/gc14-drift/` scratch,
  lane data-repo records minted via API, receipts under `~/.hermes/cl/receipts/GC-14/`.
OUT (hard stops — reviewer rejects on sight):
- ANY file under `app/src/`, `server/src/`, `schema/**` — GC-14 ships ZERO code and ZERO schema.
- No task-list edits, no merges, no stack restarts by any worker; stack lifecycle is
  orchestrator-owned.
- NEVER touch :5174/:3001, Brad's live data dir, or the main tree.
- NEVER write to `/mnt/vast/gc-fid/**` (read-only vfat device).
- No "tidying" of pre-existing lane records (all records are TEST DATA; A4 no-cleanup posture).

## Stop boundaries (platform gap → requires-rescope, never absorbed)
- Any gate leg that needs a product-code affordance that does not exist (missing hand-off,
  unresolvable hop, broken surface) → record the gap VERBATIM in the dossier's GAPS appendix,
  route to orchestrator as **requires-rescope** (standing platform-gap rule). The dossier passes
  WITHOUT the gap leg only if the acceptance clause it blocks can still be evidenced otherwise;
  otherwise the gate is red.
- V4 returning a generic 500 (not the NAMED `PACKAGE_HASH_DRIFT`) is a defect witness, not a
  workaround opportunity.
- V6 needing any TS change = criterion FAILED (record it as such).
- New schema field/kind anywhere → requires-rescope to architect. No faked lint rules.

## Worker contract
- **Orchestrator-run + cl-browser-reviewer heavy. No cl-coder leg is planned.** The orchestrator
  runs WI-0/1/2/4/5/6 mechanically, dispatches WI-3 to cl-browser-reviewer (computable vision,
  systemd-run launcher per AS-L1T1045-1; NEVER terminal(background) — rc=143 precedent), audits
  receipts first-hand (open the screenshots; the receipt-audit skill applies BEFORE consuming the
  verdict), then authors WI-7/8.
- Coder legs ONLY for an orch-adjudicated in-scope micro-gap: worktree
  `/mnt/vast/home/brad/git/wt/gc-14-<leg>-lane1-l1t<ts>` off the CURRENT trunk tip AT DISPATCH
  (never off a remembered sha), branch `wt/gc-14-<leg>-lane1-l1t<ts>`, all git with
  `-c core.fileMode=false`; report `/home/brad/.hermes/cl/lanes/1/gc14-report-<leg>-l1t<ts>.md`;
  end marker `GC14 <LEG> DONE <sha>` / `GC14 <LEG> BLOCKED <reason>`.
  **RED-first is MANDATORY on any such leg** (failing test lands first, commit names the
  inversion) — but per the task's `files:` line GC-14 itself demands NO code, so no RED-first leg
  is specified here; a leg exists only after an orch-ruled gap (scope questions OQ-A/B below are
  the candidate triggers). A code leg re-opens the affected dossier section + adv review — code
  changed under a release gate. A gap that is not a micro-fix is a rescope, not a leg.
- Records minted via API only, never hand-edited into the data repo; gate records carry no TEST-
  requirement (they are the gate's own knowledge-layer records) but the same no-hand-edit rule
  applies.
- Receipt dir pattern (unique per dispatch): `~/.hermes/cl/receipts/GC-14/<date -u +%Y%m%dT%H%M%S>-gate/`.

## Reviewer bait (name the likely edge errors up front)
1. **Synthetic-standard smuggling — THE trap.** Any quantitative number in the dossier (concentration,
   recovery %, slope as lab truth) must have the real-standards chain beside it; anything propped
   by TEST fixtures (ANR-000013-style synthetic levels) is re-classed QUALITATIVE or struck.
2. **Hash theatre.** DREF-vs-DREF comparison proves nothing — S3 demands independent `sha256sum`
   in a separate shell, per file, including NESTED members (ACQ.M/… — witness reproduced this run).
   Drift "proof" by quoting the unit test instead of the live WI-4 witness = reject. Mutating the
   real NAS copy = reject.
3. **Raw/large bytes into either repo.** No `FID1A.CH`, screenshot blob, or `.raw` transcript gets
   committed "as evidence"; hygiene scoped to NEW files in the window; receipts live in
   `~/.hermes/cl/receipts/`, NOT the repos.
4. **YAML-reload trap (WI-5).** Record-level flip needs no restart; registry-YAML flip DOES
   (tsx --watch does not reload YAML). State which arm ran with the restart stamp, or the dossier
   proves a stale projection.
5. **Ontology terms required.** Predicate from predicates.registry.yaml; compound terms are shipped
   `FAME-LOCAL:` candidates; fabricated CURIE or free-text noun is a defect (CLAUDE.md :157);
   one claim = one triple; never collapse concept ≠ formulation ≠ instance ≠ aliquot in lineage
   renders (CLAUDE.md :158).
6. **Hardcode boundary.** The flip rides the generic record API + projection; any TS assistance =
   FAILED criterion, said plainly.
7. **Engine-version laundering.** S4 = declared constraint AND live probe side by side
   (`packages []` + absent scipy is CONSISTENT; 3.14.7 satisfies `>=3.11`); `approximate` renders
   verbatim, never relabeled.
8. **Negative-claim reliability.** A8/A9 negatives re-verified live (falsified-404 precedent).
9. **Baseline carrying.** The §Baselines witnesses in THIS spec are composer runs at 049e5b87 on
   2026-10-29; the dossier re-runs at the FINAL tip or it is a reject — including the DNA leg
   (green today; re-run anyway, no hiding behind a filter).
10. **exactOptionalPropertyTypes / tsc** — moot while the no-code rule holds; V2 is the tripwire
    that proves it (21-line app floor with zero NEW error-bearing files, server 0).
11. **A3 "no path text box" reading.** The shipped GcAttachPanel deliberately has a device
    `<select>` (config data) plus a directoryKey TEXT INPUT for the relative `.D` key
    (GcAttachPanel.tsx:17,196-207). The banned affordance is a MOUNT-PATH box / hardcoded device
    list, not the key field. A reviewer rejecting the key input, or a worker hacking around it,
    both misread the clause — see OQ-A.

## Assumptions (explicit)
- AS-L1T1322-1: GC-13 gate3 (live at compose time) returns ACCEPT on trunk ≥ 049e5b87; if FIX,
  re-anchor this spec mechanically before dispatch. evidence_debt flag until then.
- AS-L1T1322-2: RES35077-5.D is the second same-axes trace (same series; the A6 render, not
  composer belief, is the proof).
- AS-L1T1322-3: the gate identity holds WRITE on the run-sheet ISEN it operates (cleanest: the UI
  flow creates its own chain under USR-BRAD, per the 157th addendum item 2); which identity ran
  A3 is recorded in S2.
- AS-L1T1322-4: shipped devices `vast` + `gc-fid-nas` suffice — no config.yaml edit is planned;
  WI-0 hashes it as found.
- AS-L1T1322-5: the engine record ENG-PYCAL01-L1T2305 (or a gate-time successor record of the same
  interpreter) resolves at gate; probe freshness re-run at WI-0/5.
- AS-L1T1322-6: GC-13's residue claim(1)/assertion(1) records are left untouched and NOT reused;
  GC-14 mints its own chain fresh in-browser.
- No cl-scout dispatched this run: every load-bearing fact was verified locally first-hand (scout
  output is screening, not authority — composer precedent).

## Open questions (orchestrator; ≤3)
- **OQ-A (A3 affordance adjudication, not code).** The acceptance clause (via the draft's A3) says
  "device dropdown only, NO path text box." The shipped panel has a device dropdown + a relative
  directoryKey text input (GcAttachPanel.tsx [F]; GC-12 shipped it deliberately; the route rejects
  mount paths by design). My reading (adopted in WI-3/A3): the clause bans mount-path entry and
  hardcoded device lists; the key input satisfies it. CHECKED: panel source, route 400-message,
  GC-12 shipped tests. If the orchestrator rules the clause demands a directory PICKER, that is a
  product gap → requires-rescope (a new coder leg), not a dossier workaround.
- **OQ-B (gate3 FIX contingency).** If GC-13 gate3 returns FIX, the trunk moves again: does the
  orchestrator want a full re-compose of this spec or the mechanical re-anchor (git stamp +
  baseline re-capture + cite spot-check)? CHECKED: nothing in this spec's procedures depends on
  gatefix3 content; I recommend mechanical re-anchor.
- **OQ-C (quantitative-arm seed timing).** OQ-3 closed with QUALITATIVE-default. If Brad intends
  to supply genuine standard-value records for the quantitative arm, they must be seeded as
  records BEFORE WI-3 (pre-gate OPS seed, never invented at gate time). CHECKED: lane has zero
  standard-value records beyond TEST fixture levels; the dossier S6 works either way.

SPEC-DRAFT-DONE GC14 l1t1322
