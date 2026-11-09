# FAME-5 SPEC DRAFT — l1t0535 (composer draft, pending orchestrator review/promotion)

Item: FAME-5 "Restek composition check artifact: measured area-% vs declared 3mg/mL /
palmitate-6% facts (controlled outcome, not-assessable is a pass)" — lane 1, trunk
cl/integration-1.

Composer worked at trunk tip 2b48b30a (225TH handoff commit; FAME-2 merge b654a8d6 verified
ancestor via git branch --contains). ALL file:line cites below were read first-hand in
/mnt/vast/home/brad/git/cl-integration-1 (or live :3092 GETs) this session; ONE scout call
(record-kind screening) was used and every load-bearing claim from it was re-read by the
composer before citation. Trunk moves often — re-verify tip + the DEPENDENCY GATE list at
promotion.

## DEPENDENCY GATE (stated plainly, per the brief)
DISPATCH WAITS UNTIL FAME-4 IS MERGED into cl/integration-1 (FAME-5 deps: FAME-4,
task-list.md:10817). Transitively this means FAME-3 must also be merged (FAME-4 is gated on it,
FAME-4 spec §18 R-5) and the lane stack restarted. At composition start (2026-11-01 ~05:35):
FAME-2 MERGED (b654a8d6, tip 2b48b30a — verified first-hand), FAME-3 coder LIVE on
wt/fame-3-lane1-l1t0245 (single commit 393fee16 = W3 schema triplet; UNMERGED), FAME-4 spec
promoted, undispatched. The shape this spec assumes MUST be re-verified at promotion:
1. FAME-4's successor revision is MERGED/live and its published artifacts exist: the
   `assignment_results` + `analyte_summary` AOUT records on the RES35077-5 leg (FAME-4 spec §9
   W3-W4 names those artifact names; the AOUT ids are minted only at FAME-4 bench time — the
   FAME-5 coder reads them live at start; not an OQ).
2. FAME-3's merged assignment_state vocabulary is exactly the enum the composer saw on the
   in-flight branch (wt/fame-3 @393fee16, gc-method.schema.yaml compound_assignments:
   `assignment_state: enum [verified, provisional]`; "unassigned" is the ABSENCE of an entry).
   Grep the MERGED schema at dispatch; this spec references those terms, NEVER re-declares them
   (FAME-3 §18, FAME-4 §15 bait #3).
3. The live working gc-method record: today GCM-DEMO-AOAC-FAME exists with ONE assignment whose
   compound_ref is {id: CMP-DEMO-HEXANOIC} (dangling — composer live-GET; FAME-3 §5/§18 OQ-2
   class) and NO assignment_state (pre-FAME-3 state). After the FAME-3 merge the working record
   must be the FAME-3 one with FAME-LOCAL ontology refs (bait #3).
4. The frozen FAME-2 artifacts still present + unchanged (append-only): ANR-000033 /
   AOUT-000041 peak_table 31 rows (composer re-verified LIVE at 2b48b30a: 31 rows, 9 cols, rows
   2/3/4 saturated, overlap flag on rows 2-5, ALL 31 area_percent values null — see §3 the
   null-area_percent fact is load-bearing for this item), ANR-000035 / AOUT-000044 2 rows
   (rt 4.27/4.52, re-verified live).
5. No ontology-term change has landed without a ruling: composer verified fame-local.yaml has
   EXACTLY 6 terms (n6/n8/n10 FFA + methyl-ester) and ZERO palmitate/n16 coverage — repo-wide
   case-insensitive grep 'palmit' = 0 hits at 2b48b30a AND on the in-flight FAME-3 branch; live
   lookup of FAME-LOCAL palmitate 404. If a palmitate term exists at dispatch, OQ-2 was resolved
   — read the ruling before writing W3.
6. quantification.py / peak_integration.py / analysisRunner.ts line numbers cited below may
   shift with merged fix cycles — re-grep the NAMED symbols (AREA_PERCENT_HONESTY,
   FLAG_OVERLAP_SHARED_BASELINE, provisionInputs), not the lines.

## 1. Goal
One sentence: mint an immutable successor analysis-revision (RECORD via POST
/api/analysis-revisions) whose Python entry script consumes FAME-4's published
assignment_results + analyte_summary artifacts plus a set of DECLARED Restek reference facts
(3 mg/mL total fatty acids; palmitate 6% of total; source = Brad's bench statement; basis
declared), and publishes (a) a reference-check artifact — observed vs expected, a
percentage-point delta, and an outcome word from the controlled vocabulary
comparison-only|within-tolerance|outside-tolerance|not-assessable, where tolerance is a declared
parameter and comparison-only is what an unset tolerance yields — and (b) a reusable
standard-summary artifact (measured results + full provenance) for FAME-7's cross-run binding,
with ZERO TypeScript logic (R3), NO calibration curve and NO response factors (R1/R2), and
not-assessable treated as an honest pass.

## 2. Code/data boundary (declarative-first)
CLAUDE.md:147 — "Code never makes policy decisions — it follows the rules declared in data"
(composer-verified at /mnt/vast/home/brad/git/computable-lab/CLAUDE.md:147: "Business logic
lives in declarative YAML. Code never makes policy decisions — it follows the rules declared in
data"). Campaign rules R1-R7 at
~/.hermes/specs/intake/2026-10-31_fame-quantitation-chain/draft-campaign-list.md:24-43
(composer-verified): R1 relative area-% only; R2 the Restek check vocabulary + "not assessable is
an honest pass" + "~17 clusters cannot establish 37 resolved FAMEs"; R4 denominators always
shown, never tune integration to make 6% appear; R7 lane 1 + the two reference files.
- Compute rides the REVISION RECORD's entryScript (Python, data), exactly as FAME-4's promoted
  §18 R-1 ratified for the analyte summary: ctx.publish (ctx.py:264-275 composer-verified),
  publish_file (:277+), metric (:316-324), view (:326-344), log (:345), manifest (:355). NO new
  SDK module (the FAME-4 ruling stands; a module would be requires-rescope, not a coder call).
- EVERY policy input is declared parameterSchema DATA on the revision record: the expected
  facts (expected_total_concentration {value, unit, basis}, expected_analyte identity ref/label,
  expected_percent_of_total), tolerance_pp (OPTIONAL number — unset => comparison-only), the
  observed-denominator basis (see OQ-3), and the assignment-state strings it reads (opaque
  equality against declared params, FAME-4 §5 pattern — never baked state strings in the script).
- The outcome vocabulary is DECLARED DATA too: it appears in the published artifact's schema
  text + the entry script's declared outcome constants — grep proof it lives NOWHERE else today:
  composer ran `grep -rn 'comparison-only|within-tolerance|outside-tolerance|not-assessable'
  schema/ server/src app/src config/ docs/` at 2b48b30a -> 0 hits; repo-wide (excluding .git,
  node_modules) only .hermes/plans/2026-11-01_fame-4-spec*.md mention it as FAME-5's boundary.
  These words are LOCAL DECLARED OUTCOME VALUES for the reference-check entity — following the
  composition-entry participation precedent (schema/core/datatypes/composition-entry.schema.yaml
  :36-48: relation names are "NEVER minted into schema/registry/ontology-terms/*"), they MUST
  NOT be minted as ontology terms and MUST NOT reuse shipped enums elsewhere: assertion.schema
  .yaml outcome.detection enum [detected, not_detected, indeterminate, invalid] (:60 region —
  composer read; DIFFERENT entity), gc-method assignment_state [verified, provisional],
  engine-support terms — all different entities, all NOT to be borrowed.
- Records land in the lane data repo via the API at :3092 only — never hand-written YAML, never
  the code repo (FAME-2/FAME-4 doctrine, unchanged).

## 3. Grounding — what exists TODAY vs what arrives with FAME-3/FAME-4
EXISTS ON TRUNK (composer-verified at 2b48b30a / live :3092 GETs):
- THE CONSUMED-OBSERVED PROBLEM, resolved by FAME-4: on AOUT-000041 every peak_table
  area_percent is null (live re-read: all 31 rows null — rows 2/3/4 have null area_pa_min via
  UNRECOVERABLE_SATURATED, and the shipped rule nulls area_percent on EVERY row when any accepted
  area is null — peak_integration.py :1007-1021 pattern, cited in FAME-4 spec §7 and re-confirmed
  by the live data). => FAME-5 MUST NOT compute observed % from raw peak_table; it consumes
  FAME-4's analyte_summary (which retains denominator + excluded/unresolved buckets — the R4
  carriers) and assignment_results (per-row match states). This is WHY FAME-5 deps: FAME-4.
- Artifact-as-input door: analysisRunner.ts provisionInputs accepts type analysis-output-artifact
  with inlineValue (:171-199 region, composer-verified inline branch) or dataReferenceRef;
  POST /api/analysis-runs + /:id/execute at routes.ts:1282-1284 (composer-read).
  POST /api/analysis-revisions at routes.ts:1278 (composer-read).
- Provenance plumbing for the standard-summary (question 4): the runner stamps every published
  artifact with runRef (:421-428 region), carries sourceRelations (:428), and at :786 sets
  artifact.sourceRelations = the run's declared inputs — so the consumed FAME-4 artifacts are
  machine-linked from the published standard_summary for free. Small artifacts persist inline;
  >= 50_000 chars go to storage with a data-reference + sha256 (persistToStorage, analysisRunner
  .ts:409-433 region — composer read). The digest witness pattern = params_digest metric
  (calibration_fit.py:164-165/1048 shipped precedent; FAME-2 report §8 proved the append-only
  method: re-GET before/after, byte-identical).
- Views-as-data: renderer enum CLOSED, includes table — view-spec.schema.yaml:41
  enum [table, signal, metric, static-figure, chromatogram, trace-compare, calibration-curve]
  (composer read). NO new renderer (FAME-6 owns the ONE new generic id; FAME-5 renders through
  'table', FAME-2's already-fixed {columns,rows} TableView arm).
- The reference-check FACTS homes in shipped kinds (question 1, scout-screened, composer
  re-read every claim): material-spec.schema.yaml formulation.concentration accepts
  concentration.schema.yaml — required [value, unit, basis], unit enum includes mg/mL, basis
  enum includes mass_per_volume and mass_fraction (schema/core/datatypes/concentration.schema
  .yaml:9-45) — AND formulation.composition items composition-entry.schema.yaml (component_ref +
  optional concentration / concentration_range with basis mass_fraction); material-spec
  provenance.source enum includes human (:49-58). vendor-product carries declared_composition
  (:51-55) + composition_provenance with source_type manual + source_text (:175-193). So a
  concentration fact with DECLARED BASIS + human provenance fits shipped shapes HONESTLY —
  BUT both composition entries require component_ref, and NO palmitate identity exists in the
  governed vocabulary (§3 item 5: 6 FAME-LOCAL terms, zero palmitate; CMP-* kinds ruled out by
  FAME-3 §18 OQ-2 "NO new kind"). Whether the Restek facts live on a material-spec/vendor-product
  record or as revision parameterSchema DATA is OQ-1 (recommendation: parameterSchema DATA).
ARRIVES WITH FAME-3 (in flight): assignment_state [verified, provisional] + provenance +
reporting_basis_ref on compound_assignments entries (wt/fame-3 @393fee16 diff, composer read:
+31 schema lines, +12 ui lines, 2 test files). Consumed indirectly via FAME-4's frozen params.
ARRIVES WITH FAME-4 (undispatched): the successor revision + its RES35077-leg assignment_results
+ analyte_summary artifacts — the ONLY observed-side inputs this item may consume.

## 4. Grounding — the honest semantics of THE CHECK (R2)
- R2 verbatim (draft-campaign-list.md:28-32): "Area-% vs the Restek certified composition (3
  mg/mL total FA, palmitate 6%) is a CHECK, not an equivalence claim; FID area% != mass%.
  Outcome vocabulary controlled ... 'not assessable' is an honest pass." The artifact schema text
  MUST carry an honesty sentence in AREA_PERCENT_HONESTY's style — quantification.py:86-90
  (composer read): "area_percent is a peak-area fraction of the reported table total; it is NOT
  a mass fraction, NOT a concentration, and is not derived from the calibration model." FAME-5's
  sentence adds: the expected value is a DECLARED bench-statement fact; area% vs declared mass%
  are compared as a CHECK only; no response-factor or calibration claim is made (R1).
- Outcome semantics, all driven by declared data + consumed artifact states, never by tuning:
  * comparison-only — tolerance_pp ABSENT (the DEFAULT arm; must NOT be treated as 0 tolerance);
  * within-tolerance / outside-tolerance — tolerance_pp declared, |delta_pp| vs it (comparison
    rule declared in the script's declared constants, delta = observed - expected in PERCENTAGE
    POINTS, not relative %);
  * not-assessable — the honest non-result arm (question 3). Its drives, all observable in
    consumed data: (i) NO assignment entry targets the expected analyte (the real TODAY state:
    no palmitate identity exists in the lane, §3 item 5); (ii) the target row's match is absent
    or AMBIGUOUS (FAME-4's assignment_results per-row match state / its declared unmatched &
    AMBIGUOUS_PEAK_MATCH-class warnings — quantification.py's loud-match semantics FAME-4 rides,
    :635-642/:899-904 precedent); (iii) the consumed analyte_summary denominator is null
    (FAME-4's zero/near-zero non-result leg) or the target row's area_percent is null;
    (iv) the target row's peak carries OVERLAP_SHARED_BASELINE or saturated exclusion on the
    consumed rows (flags are echoed in assignment_results rows per FAME-4's contract).
  The script decides outcome from these declared/echoed fields ONLY. A reviewer replaying the
  consumed artifacts must be able to re-derive the outcome word from the artifact payload alone.
- DENOMINATOR HONESTY (R4, load-bearing, OQ-3): the declared 6% is "6% of TOTAL" over the
  standard's full composition (~37 FAMEs per R2); FAME-4's analyte_summary denominator is the
  DECLARED ELIGIBLE SET (today: at most the C6/C8/C10 ontology terms). Those are DIFFERENT
  denominators and comparing across them dishonestly is exactly what R4 forbids. The artifact
  MUST publish both denominators side by side (eligible-set denominator carried from
  analyte_summary; the declared-expected denominator as its own field with its declared basis)
  and state which one observed_percent was taken over. OQ-3 names the two options.
- Tuning ban (R4/R2): this item consumes FROZEN artifact ids; it creates NO peak-detection runs,
  NO re-integrations, NO threshold changes. Every tolerance/parameter change = a fresh immutable
  run with a distinct params_digest (FAME-2 §8 method); earlier runs byte-identical on re-GET.

## 5. Grounding — the door for tolerance and the not-assessable leg (question 3)
- Tolerance-as-parameter: parameterSchema declares `tolerance_pp: {type: number, minimum: 0}`
  OPTIONAL (additionalProperties:false block, ANREV-000012 working template cited by FAME-4 §5).
  ctx.parameters (:237-239 composer-verified pattern) returns the frozen params; absence of the
  key (NOT null, NOT 0 — absent, exactOptionalPropertyTypes doctrine) => the script takes the
  comparison-only arm and logs a named declared-code reason (REASON_/CODE_* precedent, FAME-4
  §7: e.g. REASON_TOLERANCE_UNDECLARED — NOT a vocabulary word from the outcome enum).
- Ambiguity drive = CONSUMED DATA, listed: FAME-4's assignment_results per-row fields (match
  state, compound_ref echo, flags echo incl. OVERLAP_SHARED_BASELINE / null-area codes) and the
  analyte_summary's per-analyte area_percent + denominator null-with-reason. No new signals, no
  re-derivation from raw .D bytes, no re-running peak detection to "clarify" an ambiguous match
  (tuning ban, §4).

## 6. Grounding — the standard-summary artifact for cross-run binding (question 4)
Purpose: FAME-7 binds THIS artifact's DREF/record-id into a COUNTRYSIDE run (task-list.md:10857,
10873). What carries provenance today, cited in §3: runRef stamp + sourceRelations auto-link
(analysisRunner.ts:428, :786), inline persistence for small payloads / DREF+sha256 for large
(:409-433 region), params_digest freeze witness. The payload shape (table, renderer 'table' view):
- measured block: per-analyte rows re-echoed from the consumed analyte_summary (compound_ref,
  label, area_pa_min, area_percent-over-eligible-set, assignment_state echo, flags echo) +
  the eligible-set denominator + excluded/unresolved buckets carried through (R4 — nothing
  re-derived, everything echoed);
- declared-facts block: the Restek facts echoed verbatim from the frozen parameters, each with
  source + basis fields (OQ-1 home-agnostic: the echo is identical either way);
- provenance block IN the payload: producer run id + params_digest + consumed upstream artifact
  ids (AOUT refs of FAME-4's artifacts AND their runRefs, read from ctx inputs' meta/manifest
  echo — the same provenance-echo pattern ANREV-000011/-000012 do in-script, FAME-4 §2), plus a
  source_honesty sentence: facts are a bench statement, not a certificate document, no CoA
  artifact is attached;
- honesty block: the R2 area%-vs-mass% sentence + "measured on RES35077-5.D frozen bytes via
  <ANREV id>" + which denominator each % rides.
Digest-verified unchanged on re-read (task verified-by): GET the artifact before/after the
tolerance-leg runs, byte-compare (FAME-2 §8 method verbatim).

## 7. Work items (in order; default = ZERO product-code diff — records + receipts only)
W1. Fresh baselines at claim (tsc baselines DRIFT — capture fresh, gate = zero NEW; FAME-4 W1
    method) + capture pristine trunk SHA + re-run §10 First Check + the DEPENDENCY GATE re-verify
    list. If FAME-4 is not merged and its artifacts not live, STOP.
W2. RED-first local dry run BEFORE minting: drive the candidate entry script via the shipped CLI
    `python3 -m computable_lab_analysis run <entry.py> --inputs <json> --parameters <json>`
    (__main__.py:1-30 composer-read) with synthetic inline fixtures for every outcome arm:
    (a) unique match + tolerance absent => comparison-only + delta present; (b) tolerance
    declared + delta inside => within-tolerance; (c) declared + outside => outside-tolerance;
    (d) target absent / ambiguous match / null denominator => not-assessable each sub-drive.
    Raw outputs filed in the report. The script reads inline dict payloads via .inline DIRECTLY
    (read_rows() returns [] for {columns,rows} dict inline — ctx.py:64-66 trap, composer-
    re-verified at 2b48b30a: read_rows only handles list inline / path).
W3. Restek facts as DATA per the OQ-1 ruling (default if unreplied at dispatch: parameterSchema
    DATA — expected_total {value: 3, unit: mg/mL, basis: mass_per_volume}, expected_analyte
    label/identity, expected_percent_of_total: 6, source: "Brad bench statement 2026-10-31",
    basis: declared-fact, not certificate). If the ruling names the record home, create it via
    POST /api/records and reference it from the run parameters (values still frozen per run —
    the record is never the frozen carrier).
W4. Author the successor revision via POST /api/analysis-revisions: parentRevisionRef -> FAME-4's
    successor ANREV (read live); inputs = declared names for the consumed FAME-4 artifacts
    (dataKind 'table', existing enum term); entryScript per §4-§6 (reads ctx.input payloads
    directly; outcome arms per §4; ZERO compound-name/RT/percent literals — the expected analyte
    is matched by the DECLARED identity ref/label against the echoed compound_ref/label fields);
    publishes reference_check (table) + standard_summary (table) + effective_parameters echo
    (+ params_digest + consumed artifact ids) + metrics (outcome as string metric, delta_pp or
    null, tolerance_pp or null, denominator echo) + views reference_check_view +
    standard_summary_view renderer 'table'. parameterSchema: additionalProperties:false;
    tolerance_pp optional; NO outcome enum in the parameterSchema (outcome is OUTPUT — the
    enum words live in the artifact schema text + script declared constants, declared once).
    engineRef ENG-L1G-6a298b; requiredCapabilities [] / omit (it detects nothing — ANREV-000007
    precedent, FAME-4 bait #2); sdkVersion 0.4.0.
W5. Runs on the RES35077-5 leg (DATA, :3092; :5192 re-Analyze round trip rides the browser
    gate):
    (a) honest-TODAY leg — the real lane state: FAME-4's assignment_results has no entry for the
        expected analyte (no palmitate identity exists, §3 item 5) => outcome NOT-assessable,
        published artifact, run SUCCEEDED. This is the acceptance headliner: not-assessable is
        a pass; report ACTUALS. If the FAME-3/Brad bench data changed that by dispatch, the
        coder reports the ACTUAL arm observed — never forces an arm.
    (b) tolerance arms — same consumed artifacts, tolerance_pp declared at two values across
        fresh runs (params_digest distinct each) => whichever of within/outside the real delta
        yields (on the not-assessable leg the outcome STAYS not-assessable even with tolerance —
        not-assessable outranks the comparison; that IS the honesty), plus tolerance absent =>
        comparison-only. If leg (a) yielded a real numeric delta, the within/outside arms are
        real; else the synthetic W2 dry-run receipts are the within/outside evidence, stated so.
    (c) discrepancy arm — expected_percent_of_total set to an absurd value via a fresh run's
        frozen params (e.g. 90) => the outcome says outside-tolerance (when tolerance declared)
        with the real delta; the discrepancy is NEVER relabeled (task verified-by). Params are
        check inputs, not results: this leg proves the check bites.
W6. Standard-summary provenance proof: GET the standard_summary AOUT: provenance block resolves
    (producer run + params_digest + consumed AOUT ids all 200), sourceRelations link the run's
    declared inputs (:786 auto-stamp observed), byte-identical re-GET after the W5(b/c) runs
    exist (append-only, FAME-2 §8).
W7. ROUND-TRIP-GATE-1 receipts: revision-create body, each run create/execute body, rendered
    check + summary pairs under ~/.hermes/cl/receipts/FAME-5/<ts>/, zero /api/ai/**
    interception. Browser gate on the rendered check/summary is the orchestrator's.

## 8. Explicitly out of scope
- FAME-2/3/4's frozen chain, records, schema/UI/editor surfaces: do not touch.
- FAME-6 (new renderer id, per-analyte report), FAME-7 (the cross-run BINDING UI + inputs:{}
  fix — FAME-5 only PUBLISHES the bindable summary; it does NOT build the Run-method-card
  controls), FAME-8 (walkthrough).
- Calibration curve, response factors, absolute concentrations, ISTD (R1/R2; F1c stays
  deferred+named). NO calibration-curve renderer use (view-spec enum has one — it is NOT this
  item's).
- NO new record kind (FAME-3 §18 OQ-2 ratified NO new kind; OQ-1 below is about which EXISTING
  home, not a new one), NO new ontology term (palmitate term = architect call, OQ-2), NO new
  capability/renderer/assignment-state term, NO reuse of assertion detection enum. ZERO
  schema/lint/ui YAML edits — the parameterSchema rides the revision RECORD (API-created, no
  reload; the YAML-reload trap has no door here, FAME-4 bait #2). No server/TS change; no
  analysis-run schema edits.
- No promotion provisional->verified (bench work, BRAD-DATA). No task-list edits, no merges, no
  :3092/:5192 restarts. Genuine platform gap mid-flight -> STOP that leg, requires-rescope.

## 9. Acceptance criteria (verbatim from the task block, task-list.md:10830-10833)
VERIFIED BY (verbatim):
  On RES35077-5 the check renders ACTUAL observed vs 6% expected + outcome word; ambiguous
  palmitate assignment => not-assessable; discrepancy never relabeled to pass. Standard-summary
  artifact published with provenance (digest-verified unchanged on re-read).
Standing gates: fresh baselines at claim, zero NEW failures/errors (per-file/per-file-set comm
against fresh baselines); adversarial review gate; ROUND-TRIP-GATE-1 on every changed surface
(browser gate: orchestrator's, VERDICT accept); NO new vocabulary beyond the four declared
outcome words + REASON_/CODE_*-style declared codes (assignment-state terms referenced, never
re-declared — FAME-3 §18); R2 (check-not-equivalence honesty sentence in the artifact schema;
tuning ban — zero peak-detection runs created); R4 (both denominators + excluded/unresolved
carried through; never "all fatty acids" implied); R3 (zero TS logic — empty TS diff expected);
R7 (lane 1, RES35077-5 as standard, WEGMANS/RES35077-4 never inputs); records via API
read-and-create only (PUT only on the item's OWN new records); append-only (distinct
params_digest per param set, predecessors byte-identical on re-GET); :3001/:5174 untouched;
NEVER pkill; git -c core.fileMode=false; node_modules symlink never committed through.

## 10. First targeted check (run before anything else; early-proves the approach)
The item stands or falls on FAME-4's published artifacts existing and being consumable as
inputs. At :3092, read live the FAME-4 RES35077-leg run (id from the FAME-4 report/handoff at
dispatch), then its analyte_summary + assignment_results AOUT records:
  curl -s -H 'x-user-id: USR-LOCAL-ADMIN' http://localhost:3092/api/records/<ANR-fame4> | python3 -c "import sys,json;r=json.load(sys.stdin)['record']['payload'];print(r['status'],[a['id'] for a in r.get('artifacts',[])])"
then GET each AOUT -> expect succeeded + dataKind table + inlineValue {columns,rows} (or
dataReferenceRef) on analyte_summary + assignment_results, denominator field + per-row state
fields present, and the palmitate-identity arm readable (an assignment row whose compound_ref is
not the expected analyte => the not-assessable drive is OBSERVABLE in the payload). Pair with the
W2 CLI dry run (all four outcome arms exit 0, outcome word in the manifest) as the true early
check. Companion: the FAME-2 frozen witness still holds —
  curl -s -H 'x-user-id: USR-LOCAL-ADMIN' http://localhost:3092/api/records/AOUT-000041 | python3 -c "import sys,json;p=json.load(sys.stdin)['record']['payload'];iv=p['inlineValue'];rows=iv['rows'];print(len(rows),len(iv['columns']),sum(1 for r in rows if r['area_percent'] is None))"
Expected (composer ran this session at 2b48b30a): 31, 9, 31 — all-null area_percent, i.e. the
proof FAME-5 must consume FAME-4's summary, not the raw table. If FAME-4's artifacts are absent:
STOP, the dependency gate did not hold.

## 11. Verification commands (expected outputs)
- Python suites (untouched — regression fence): cd server/python-executor-service &&
  python -m unittest tests.test_peak_integration tests.test_quantification -> FAME-4 composer
  measured "Ran 65 tests ... OK (skipped=1)"; re-measure fresh at claim, gate zero NEW failures.
- CLI dry runs (W2): each of the four outcome arms -> exit 0, manifest carries
  reference_check + standard_summary + the outcome metric with the exact controlled word
  (raw JSON filed).
- Server vitest: npm run test:run -w server -- src/analysis -> fresh baseline at claim, zero new
  failing files; server tsc per-file comm vs fresh baseline (25 pre-existing error lines class).
- App: npm run test -w app -> fail-FILE-SET comm empty vs fresh baseline (FAME-2 §2 method);
  app tsc fresh-baseline-minus-zero-new (do NOT claim exit-0).
- Records proof: GET the new ANREV -> parentRevisionRef.id == FAME-4's successor, tolerance_pp
  OPTIONAL in parameterSchema (not required), additionalProperties:false, no expected-value
  literals beyond the declared DATA facts; GET each run -> succeeded (all arms, incl.
  not-assessable) + distinct params_digest per param set + predecessors re-GET byte-identical.
- Artifact proof: GET reference_check -> observed / expected / delta_pp (percentage POINTS) /
  outcome word exactly one of the four controlled words / tolerance echo / both denominators
  labeled / honesty sentence present; GET standard_summary -> provenance block ids all resolve
  200 at :3092, sourceRelations == the run's declared inputs, byte-identical on the W6 re-GET.
- Vocabulary proof: repo-wide grep of the four outcome words -> hits ONLY the new lane-data
  records (report quotes them), ZERO in schema/ server/src app/src config/ (the shipped tree must
  stay 0 — the words live in API-created records + the entryScript DATA only).

## 12. Worker contract + file ownership
- Branch: wt/fame-5-lane1-<ts> off cl/integration-1 (branch point = trunk tip AT DISPATCH, which
  MUST include the FAME-3 AND FAME-4 merges — re-verify, do not trust this draft's SHAs).
- Deliverable report (unique path): <ORCH-FILL:
  /home/brad/.hermes/cl/lanes/1/fame-5-report-l1t<ts>.md> + receipts
  ~/.hermes/cl/receipts/FAME-5/<ts>/.
- Files OWNED: DEFAULT diff = ZERO code files. Everything is lane-data records via API (the
  successor ANREV, the runs, the runner-persisted AOUT/VSPEC records; plus the facts record if
  OQ-1 rules the record home) + report/receipts. If any leg proves a TS/server gap: STOP,
  requires-rescope, do not fork the platform.
- Records discipline: READ-and-CREATE against :3092 (x-user-id: USR-LOCAL-ADMIN for REST reads;
  analysis routes ACL-free — FAME-2 report §4). Mark in-progress on claim; NEVER mark done.
  Final marker: `FAME-5 DONE <full-sha>` / `FAME-5 BLOCKED <one-line>`.

## 13. Reviewer bait (expect these; pre-empt in diff/report)
1. exactOptionalPropertyTypes: DEFAULT diff has zero TS sites; if any sneaks in, every optional
   field is an explicit conditional spread, never undefined-assignment.
2. YAML-reload trap: ZERO schema/lint/ui YAML edits declared — any report claiming a
   gc-method/view-spec/ontology edit here is a scope break. The four outcome words appearing in
   schema/ = the same scope break (they live in API-created records + entryScript DATA only);
   their absence from the shipped tree is a FEATURE, §11's vocabulary grep is the receipt.
3. Ontology/vocabulary: expected-analyte identity MUST be either an existing FAME-LOCAL term id
   (kind:ontology) or an honest declared label+note — a fabricated CMP-* record, a new
   FAME-LOCAL:palmitate-* term minted by the coder, or a {kind:record,type:compound} ref =
   instant reject (FAME-3 §18 OQ-2: NO new kind; the palmitate term is OQ-2's architect call).
   assignment_state strings exactly FAME-3's merged terms; outcome words exactly the four;
   assertion's detection enum / engine-support terms / 'unassigned'/'pending'/'tentative'
   anywhere = invented/borrowed vocabulary, reject.
4. The not-assessable headliner is the EXPECTED honest arm today (§3 item 5: no palmitate
   identity exists). A report that "found" a way to make palmitate match — by renaming a peak,
   re-integrating, tuning thresholds, or faking an assignment — committed the exact R2/R4 ban
   this item exists to police. Demand: which consumed artifact FIELD drove the outcome word
   (payload quote), and zero new peak-detection runs in the diff.
5. Denominator conflation (R4, the subtlest dishonesty available here): reviewer checks the
   artifact labels WHICH denominator observed_percent rides (eligible-set vs declared-total);
   an observed % computed over FAME-4's eligible-set silently compared against 6%-of-total is
   the R4 violation bait #4 protects against — and conversely an artifact that re-derives
   observed % from raw peak_table (all-null area_percent anyway, §3) instead of consuming
   FAME-4's summary skipped the dependency. Both denominators present + named = pass.
6. read_rows trap: the entry script reads inline dict payloads directly (ctx.py:64-66 returns
   [] for {columns,rows}); a dry-run receipt with zero rows consumed on a 31-row upstream is
   THAT bug, not a pass. Replay W2's CLI command.
7. Delta honesty: delta_pp is percentage POINTS (observed - expected), signed, present even in
   comparison-only; a report showing relative % error or |delta|/expected is wrong units.
   tolerance unset => outcome comparison-only, NEVER within-tolerance-by-default; tolerance 0
   declared is NOT the same as absent — check the payload distinguishes them.
8. Discrepancy arm quality: the absurd-expected leg must show the outcome word CHANGE with the
   real delta while the observed side stays byte-identical (same consumed artifacts, distinct
   params_digest) — a leg that "fixed" the discrepancy by changing observed data is the
   never-relabel-to-pass violation (task verified-by).
9. Provenance quality: reviewer re-GETs every id in standard_summary.provenance (must 200) and
   byte-compares the standard_summary before/after the tolerance legs (W6); a provenance block
   with prose instead of resolvable record ids fails the FAME-7 binding premise.
10. Append-only + tuning ban: every param change = new run (params_digest set distinct, count
    them); zero runs in the diff with revisionRef pointing at peak-detection revisions
    (ANREV-000013 et al.) — this item creates NO integrations.

## 14. Open questions (composer could not resolve locally — do not guess at dispatch)
OQ-1 (where the Restek facts live as DATA — the task's own first sentence):
  Option A (composer RECOMMENDS): revision parameterSchema DATA — the facts freeze per run
  alongside tolerance_pp (params_digest is then the freeze witness for the FACTS too, the same
  property FAME-3 §18 OQ-3 ratified for assignments); source/basis fields declared in the
  parameterSchema descriptions; zero new records. Evidence FOR: FAME-3 OQ-3 ratified
  transcription-into-frozen-params as the lane's door; ANREV-000012 shows a fat parameterSchema
  is the working template; the check's whole honesty model is "declared facts". Evidence
  AGAINST: parameterSchema is machine-typed DATA, not a governed record — no lifecycle, no ACL,
  a reviewer cannot click to a "reference material" record.
  Option B: existing-record home — material-spec (formulation.concentration {value:3,
  unit:'mg/mL', basis:'mass_per_volume'} — schema/core/datatypes/concentration.schema.yaml
  required [value, unit, basis] fits the total fact EXACTLY; provenance.source: human fits the
  bench statement) or vendor-product (declared_composition + composition_provenance
  source_type: manual + source_text). BUT: the 6%-of-total composition fact rides
  composition-entry which REQUIRES component_ref, and no governed palmitate identity exists
  (§3 item 5) — Option B therefore needs OQ-2 resolved first, or the composition entry degenerates
  to a string note (weaker than DATA). If B is ruled, the coder must still freeze the values into
  run parameters (record read at creation, frozen per run — never read live at execute time).
  Checked first-hand: both schema files, concentration/composition-entry datatypes, live
  GCM-DEMO-AOAC-FAME, FAME-3 OQ-2 ruling. Recommendation: A now, B in a later reference-materials
  campaign if/when the identity concept lands.
OQ-2 (palmitate identity — governs leg (a)'s wording, NOT its mechanics): the expected analyte
  "palmitate (16:0)" has NO governed term: fame-local.yaml = exactly 6 terms (n6/n8/n10), repo-
  wide grep 'palmit' = 0 at 2b48b30a AND on wt/fame-3-lane1-l1t0245, live lookup 404, FAME-3
  §18 OQ-2 ratified NO new kind / ontology-refs-only. Option A: mint FAME-LOCAL:palmitic-acid-n16
  + methyl-palmitate-n16 with verified ChEBI CURIEs (architect-verified minting, the file's own
  header doctrine) — makes the check potentially ASSESSABLE once Brad assigns the peak, and
  honest today (still not-assessable until an assignment exists). Option B: declare the expected
  analyte as a label-only DATA fact ("palmitic acid (16:0)", declared source) with an explicit
  no-governed-term note — zero vocabulary growth, but the expected-analyte ref is a string, and
  every leg is not-assessable BY CONSTRUCTION until a term exists. The check's not-assessable
  arms work under both; only the compound_ref echo/match field differs. This is a vocabulary
  minting call (an ontology file edit + restart-adjacent) — architect/orch, NOT the coder. The
  composer does NOT recommend minting from inside this item (it would be a schema-tree edit in an
  item that declared zero YAML edits).
OQ-3 (which denominator observed_percent rides — R4 load-bearing): FAME-4's analyte_summary
  denominator is the DECLARED ELIGIBLE SET; the declared 6% is %-of-TOTAL (R2: ~37 FAMEs; 3
  ontology terms can't cover it). Option A: observed_percent = target's area over FAME-4's
  eligible-set denominator, published WITH the eligible-set denominator + an explicit
  "subset vs total" disclosure — delta vs 6% is then a labeled cross-denominator COMPARISON
  (comparison-only is its natural home; within/outside-tolerance reads as conservative under this
  reading). Option B: require the consumed analyte_summary to expose a full-table denominator
  (denominator-over-all-reported-areas) and take observed % over THAT — closer to "of total" but
  still missing saturated/null-area rows (rows 2-4 are unassessable by physics, R2's "~17
  clusters" honesty) and FAME-4's artifact contract may not carry it (its spec §5 retains
  excluded buckets — the coder reads the ACTUAL published fields at dispatch and reports which
  exists). RECOMMENDATION: A with both denominators published + never-imply-all-fatty-acids
  wording (R4 verbatim), and if FAME-4 published a full-table denominator, echo it too. NOT a
  coder call if the ruling wants a strict mass%-equivalence gate — then the honest answer is the
  check is not-assessable at v1, which R2 pre-blesses.
