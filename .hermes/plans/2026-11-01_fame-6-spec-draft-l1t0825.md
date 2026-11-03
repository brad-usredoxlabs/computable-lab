# FAME-6 SPEC DRAFT — l1t0825 (composer draft, pending orchestrator review/promotion)

Item: FAME-6 "Per-analyte relative report via view specs: one new generic renderer id
(GC-10 enum precedent), no bespoke FAME UI" — lane 1, trunk cl/integration-1.
Composer worked at trunk **e45481d110cc018d6e9b83fb54e2de1985298f9a** (2026-11-01 ~08:25-08:45).
ALL file:line cites below were read FIRST-HAND in /mnt/vast/home/brad/git/cl-integration-1 at this
SHA (one scout call was used for the schema-cache question; its answer was re-verified in person at
server.ts:388-404 — scout output is screening, not authority).

## DEPENDENCY GATE (stated plainly, per the brief)
DISPATCH WAITS UNTIL **FAME-4 AND FAME-5 ARE BOTH MERGED** into cl/integration-1 (task deps,
task-list.md:10948). Transitively that means FAME-3 merged (it gates FAME-4) and the lane stack
(:3092/:5192) restarted so the FAME-3 schema and any merged view-spec enum change are LIVE.
State at composition (2026-11-01 ~08:25, trunk e45481d1): FAME-1 fix3 + FAME-3-resume coders LIVE;
FAME-2 MERGED (b654a8d6/aad849f6); FAME-4 spec PROMOTED, undispatched; FAME-5 spec PROMOTED,
dispatch-gated on FAME-4 (+ FAME-ONTO-1 preferred first). EVERY cite in this draft — and every
artifact field name — MUST be re-verified by the coder at dispatch: the FAME-3/4/5 merges reshape
the analyte_summary / reference_check field names this renderer displays. Specifically re-verify:
1. The MERGED FAME-3 `assignment_state` enum terms: today `grep -rn assignment_state schema/
   app/src server/src config/` = **0 hits** (composer-verified at e45481d1). The terms and their
   exact spelling arrive with the FAME-3 merge — grep the MERGED schema at dispatch, NEVER
   re-declare them anywhere in this item (bait #3).
2. FAME-4's PUBLISHED analyte_summary / assignment_results artifacts: live ids + actual payload
   field names (denominator, contributing_peak_refs, excluded/unresolved buckets, honesty
   sentence — FAME-4 spec §5/W3 promise them, but the artifact's ACTUAL published shape is the
   contract; read it live, never assume).
3. FAME-5's PUBLISHED reference_check + standard_summary artifacts incl. the §15 OQ-3-ruling
   fields: denominator_basis subset-vs-total disclosure, observed/expected as DISTINCT labeled
   fields, tolerance_pp/expected_percent_of_total, the four outcome words.
4. Whether FAME-4/5's runs already persist a view per artifact (their specs publish
   `renderer: 'table'` views; the dedupe door is analysisRunner.ts:451-456, composer-verified).
   FAME-6's report views ride a NEW successor revision (OQ-2), not edits to theirs.
5. If this enum commit merges but the lane stack is NOT restarted, the runner's VSPEC persistence
   will reject the new renderer id at schema validation (see §Grounding: restart requirement) —
   the orchestrator restarts :3092 between the merge and the data legs. The coder never restarts.

## 1. Goal
One sentence: extend the shipped view-spec renderer set with ONE generic, domain-free artifact-table
id — enum + TS union + dispatch + page whitelist in ONE commit per the GC-10/GC-11 precedent — and
put a declarative report view-spec (DATA) on top of it so a fresh live analysis at :5192 renders the
FAME-4 analyte summary (ontology/CMP labels, RT/peak provenance, area, area-%, assignment_state,
basis note, denominator + exclusion warnings) alongside the FAME-5 composition-check block, with
provisional/unresolved states readable without opening JSON and ZERO analyte names, RTs, or
normalization logic in TypeScript (R8).

## 2. Code/data boundary (declarative-first)
- CLAUDE.md (computable-lab): "Business logic lives in declarative YAML specs, not in TypeScript"
  and "Code creates records. Records are linted against schemas... Code never makes policy
  decisions — it follows the rules declared in data" (composer-verified, /mnt/vast/home/brad/git/
  computable-lab/CLAUDE.md, Backend Architecture section). The generic renderer is the CODE layer:
  it renders whatever fields the view-spec's `bindings` NAME and the artifact PAYLOAD carries.
  Choosing which column is "the analyte label", which is "area-%", which word is a provisional
  state — all of that is DATA (view-spec bindings + artifact payload), never TS branches.
- The renderer id is GENERIC: proposed **`artifact-table`** (the task's own words "generic
  artifact-table id"; kebab-case precedent of chromatogram / trace-compare / calibration-curve;
  zero 'fame'/'analyte'/'fatty' domain words — grep collision check: `artifact-table` currently
  0 hits repo-wide, composer-verified). Final id string is the architect's enum-minting call at
  promotion (OQ-1) — the pattern, not the string, is what this spec binds.
- The report's views are DATA: a successor revision record's entryScript calls ctx.view(name,
  renderer, artifact=, bindings=, options=) — the shipped door, ctx.py `view()` accepts an opaque
  renderer string + free bindings/options dicts (composer-verified, server/python-executor-service/
  src/computable_lab_analysis/ctx.py:326-344). bindings/select field NAMES in the payload
  (chromatogram's markerRtField/markerLabelField precedent, ChromatogramView.tsx:42 + the bindings
  comment block schema/knowledge/view-spec.schema.yaml:44-63).
- R8 verbatim constraint: zero analyte names / RT values / normalization arithmetic in app/src.
  The renderer must contain no `if (state === 'provisional')` branches — state strings render as
  their declared text (readable label arm), selected positionally/by-binding, never switch-matched.

## 3. Grounding — what exists TODAY at e45481d1 (first-hand) vs what arrives with FAME-4/FAME-5
EXISTS ON TRUNK (composer-verified at e45481d1):
- **ViewRenderer.tsx** app/src/analysis/ViewRenderer.tsx — the whole precedent:
  - renderer union: :29 (`'table' | 'signal' | 'metric' | 'static-figure' | 'chromatogram' |
    'trace-compare' | 'calibration-curve' | 'model' | 'binary'`);
  - page whitelist + pure pass-through: VIEW_RENDERER_WHITELIST :44-52 (7 ids), resolveViewRenderer
    :56-60 (unshipped ids table-coerce — the GC-9 silent-coercion door);
  - TableView :74-105 — the FAME-2 C1 `declared {columns, rows}` arm (:76-87) that already renders
    FAME-4's inline table payloads;
  - dispatch switch :299-377: case 'table' :300, GC-10 arms :311-333, GC-11 calibration-curve arm
    :346-367, `default:` visible compatibility error :371-376 (unknown renderer names itself —
    the closed-set error must survive the widening: new cases land BEFORE default, GC-10 comment
    :309-310 says this explicitly).
- **The GC-10 precedent itself**: commit e6b34229 "[GC-10][E] view-spec enum extended... enum+union+
  dispatch+whitelist in ONE commit" and the GC-11 sibling 51a78ae5 "enum/union/whitelist/schema
  trifecta + page wiring" (git log on schema/knowledge/view-spec.schema.yaml — composer-verified).
  THIS item copies that shape: the SAME one commit touches: schema enum (below), TS union :29,
  whitelist :44-52, dispatch case (new arm before default), and the compat source-pin test
  (below). Anything less is the bait #1 scope break.
- **Schema enum**: schema/knowledge/view-spec.schema.yaml:41 `enum: [ table, signal, metric,
  static-figure, chromatogram, trace-compare, calibration-curve ]`; bindings/options are free
  objects (:64-71, additionalProperties:true) — the GC-10 lesson: NO schema `properties` addition
  is needed for a new renderer; the enum line + comments are the whole schema diff.
- **Compat source-pin**: app/src/analysis/ViewRenderer.compat.test.tsx:38-56 — the PB-CH-5 pin:
  banned identifiers ['quantum','heatmap','scatter','component-tree'] must stay absent (:47-49),
  the mandated id asserted as a LITERAL (:53, "GC-10 D5 lesson: an iterating assertion over the
  implementation constant is tautological"), the error arm survives (:55), resolveViewRenderer
  literal pass-through test :58-64. This test will go red the moment a new id lands — it is
  designed to be amended IN THE SAME COMMIT, exactly as GC-10/GC-11 amended it.
- **Page door**: app/src/analysis/AnalysisPage.tsx:527-586 — manifest views map through
  resolveViewRenderer (:534); persisted outputManifest hydrates the pane (:226-245, always-replace
  semantics). The GC-11 CLIENT-SYNTHESIS door (:549-586, structural calibrationModel gates) is the
  ALTERNATIVE door OQ-2 weighs — the default here does NOT extend it (bait #5).
- **Runner persistence + validation**: server/src/analysis/analysisRunner.ts:449-480 persists a
  VSPEC per manifest view (dedupe by artifactRef+title :451-457, VSPEC-###### mint :459-466,
  schemaId view-spec.schema.yaml :469, renderer passes through verbatim :476).
- **RESTART REQUIREMENT (the YAML-reload trap for THIS item)**: schemas load from disk at server
  STARTUP and cache — SchemaLoader.loadAllSchemas server/src/schema/SchemaLoader.ts:154+,
  SchemaRegistry Map cache server/src/schema/SchemaRegistry.ts:73, AjvValidator built once at
  server/src/server.ts:394-402 (composer-verified in person; matches scout screening). So the enum
  commit needs a lane-stack :3092 restart (orchestrator's, `cl-lane-stack.sh 1 restart`) BEFORE
  any run can persist a view carrying the new id — a report-revision run attempted pre-restart
  fails VSPEC validation, and that failure is the RESTART GATE, not a bug to chase.
- **Schema test door**: server/src/analysis/analysisSchema.test.ts:221-235 — the GC-10 precedent's
  positive legs ("accepts a chromatogram view (GC-10 new enum id)"); the quantum-rejection leg
  stands in the same file.
- **Test baseline measured by the composer at e45481d1**: `cd app && npx vitest run
  src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.compat.test.tsx` = **17 tests /
  2 files passed**.
ARRIVES WITH FAME-4/FAME-5 MERGES (ids/fields unknown today, re-verify at dispatch):
- FAME-4: successor ANREV + runs; `analyte_summary` + `assignment_results` artifacts (per FAME-4
  spec §5/W3: denominator, contributing_peak_refs, named excluded/unresolved buckets, per-row
  area_percent + assignment_state echo + compound_ref echoes + honesty sentence; zero-denominator
  null-with-reason arm). 'table' views persisted by the runner.
- FAME-5: `reference_check` (observed vs expected, delta_pp, outcome word
  comparison-only|within-tolerance|outside-tolerance|not-assessable, tolerance_pp or null) +
  `standard_summary` (provenance block, both denominators side-by-side, denominator_basis
  disclosure per the §15 OQ-3 ruling) artifacts.
- FAME-3 (via FAME-4): merged assignment_state enum terms + the method record's assignment entries.
- The renderer/whitelist/union/enum files: today's content above IS the diff base — the merges do
  not touch app/src view files or view-spec.schema.yaml (FAME-2/4/5 all declared zero TS diffs;
  FAME-4 spec §10 names FAME-6 as the renderer owner).

## 4. What the composition-check block and provisional arms must show (task-bound, data-driven)
- Composition-check block = a view over FAME-5's reference_check artifact rendered through the SAME
  generic renderer (no bespoke component): observed % + its denominator label, expected %-of-total
  + its declared basis, delta_pp, outcome word, tolerance_pp-or-absent (absent renders as a NAMED
  'no tolerance declared / comparison-only' reading, never blank), and the denominator_basis
  subset-vs-total disclosure (FAME-5 §15 OQ-3 ruling — R4: never imply all-fatty-acids).
- Provisional/unresolved readable without opening JSON: the assignment_state cell renders the
  declared state STRING as visible text in a labeled slot (a styled neutral chip is fine; a hidden
  JSON tooltip is not). "one provisional-state row" in verified-by comes from the FAME-4 merged leg
  (d) whose eligible_states included the provisional term — the coder reads the live rows, never
  synthesizes a state string.
- Denominator + exclusion warnings + basis note visible: rendered from the analyte_summary payload
  fields the bindings name (header/caption block + warning rows) — the honest-DENOMINATOR label
  text itself is payload/binding DATA; TS contributes only "render string here".
- Dead chrome is a defect + friction-first: missing bindings or non-{columns,rows} payload render a
  NAMED arm (TableView's 'No rows' precedent, ViewRenderer.tsx:78); no disabled placeholder blocks;
  inline payload renders synchronously (FAME-4/5 summaries are small inline artifacts — do NOT
  wire the DREF content route; if a leg is dref-backed, the named empty arm, not a silent spinner).

## 5. Work items (in order)
W1. At claim: capture pristine trunk SHA; re-verify the DEPENDENCY GATE list above (FAME-4 AND
    FAME-5 merged + stack restarted + FAME-3 enum live) and re-run §7 First Check. If not met, STOP.
    Fresh baselines: app vitest src/analysis + app/server tsc (baselines DRIFT — gate = zero NEW;
    FAME-4 W1 method).
W2. RED-first unit tests BEFORE the enum commit (new test file or extension per app/src/analysis
    file discipline): (a) dispatch renders the new id through to the generic artifact-table arm —
    assert the LITERAL id; (b) resolveViewRenderer passes the new id through, 'quantum' still
    coerces to table; (c) the compat banned-ids + error-arm legs still pass; (d) missing/blank
    payload renders the named arm (dead-chrome rule); (e) an arbitrary state STRING from the payload
    renders as visible text (no TS string-branch); (f) bindings-named column subset renders in
    declared order. Update the ViewRenderer.compat.test.tsx source-pin IN THE SAME commit (amend
    the mandated-literal assertion to include the new id, keep every banned id banned).
W3. THE ONE COMMIT: schema enum line schema/knowledge/view-spec.schema.yaml:41 (+comment citing the
    task) + RenderableView union ViewRenderer.tsx:29 + whitelist :44-52 + dispatch arm before
    `default:` :371 + generic ArtifactTable component in ViewRenderer.tsx (or a sibling file if the
    coder can defend it — sibling files were the GC-10 [C]/[D] pattern: ChromatogramView.tsx etc.;
    a small generic table does NOT need a sibling — architect may prefer size discipline, bait #6,
    either is in-scope as view/renderer files) + AnalysisPage unchanged (it consumes
    resolveViewRenderer at :534 — a pure whitelist addition is sufficient; ANY new
    client-synthesis gate is bait #5, see OQ-2) + server/src/analysis/analysisSchema.test.ts +1
    positive enum leg (quantum-rejection leg untouched) + the compat-pin amend. ONE commit,
    GC-10/GC-11 shape.
W4. VIEW DATA (records via API :3092, never hand-written YAML): mint a report successor revision
    (OQ-2 default: parentRevisionRef -> FAME-5's successor ANREV, or the ratified parent the
    orchestrator names at dispatch) whose entryScript CONSUMES FAME-4's analyte_summary (+
    assignment_results if needed for provenance columns) and FAME-5's reference_check
    (+ standard_summary block if the ruling wants it) artifacts and RE-ECHOES their payloads into
    report artifacts (zero re-derivation, zero normalization — R8; read inline dict payloads
    DIRECTLY, ctx.py:64-66 read_rows trap stands), publishing views with
    ctx.view(..., renderer='<new id>', artifact=..., bindings={<field-name selections>},
    options={<presentation-only>}). parameterSchema additionalProperties:false, no compound/RT/
    percent literals; engineRef ENG-L1G-6a298b; requiredCapabilities [] / omit (it computes
    nothing — ANREV-000007 precedent, FAME-4 bait #2); sdkVersion 0.4.0. AORD: the run must
    SUCCEED post-restart — a VSPEC validation 400 here means the restart gate, not the code.
W5. Live leg at :5192 (after orchestrator restart): fresh analysis run of the report revision on
    the real reference-file chain; the pane shows one row per analyte MATCHING the published
    artifact (receipt: GET the artifact, DOM text pairs), incl. ONE provisional-state row legible
    without opening JSON; denominator + exclusion warnings + basis note + composition-check block
    visible with labeled denominators. Report ACTUALS (which outcome word the real state yields —
    FAME-5's honest-TODAY leg may be not-assessable; that is a pass, never force an arm).
W6. ROUND-TRIP-GATE-1 receipts under ~/.hermes/cl/receipts/FAME-6/<ts>/: per changed surface
    (run-create body, execute body, rendered report; revision-create body) the outgoing REQUEST
    BODY capture PAIRED with the rendered-report screenshot; ZERO interception of /api/ai/**.
    Mounted-DOM alone is not evidence. Browser gate grading is the orchestrator's
    (cl-browser-reviewer, VERDICT accept).
W7. Grep receipts (verified-by's third leg): the compound/RT-literal greps in §8, run on the diff
    AND on app/src overall vs the §8 baseline table; filed raw.

## 6. Explicitly out of scope
- FAME-4's server-side/entryScript COMPUTE (area-% arithmetic, eligibility, denominator math) and
  FAME-5's check compute: this item re-echoes published fields, recomputes NOTHING, renormalizes
  NOTHING (R8). No server/src changes at all EXCEPT the analysisSchema.test.ts +1 enum leg
  (test-only).
- The schema triplet beyond the view-spec enum line: NOT gc-method.schema.yaml, NOT any lint/UI
  YAML, NOT ontology terms (the palmitate terms are FAME-ONTO-1's), NOT assignment_state (FAME-3's
  declaration — referenced as data, never re-declared here, bait #3).
- FAME-5's records/lane data and FAME-4's frozen runs: read-only consumption; append-only (new
  runs, distinct params_digest; predecessors byte-identical on re-GET).
- FAME-7's declared-input controls / inputs:{} fix (AnalysisPage createRun path): do not touch.
- No bespoke FAME UI component, no FAME-specific renderer id, no page-level structural gate that
  recognizes "the analyte summary" by name in TS (bait #5; structural gates were GC-11's ratified
  door for calibration ONLY).
- No :3092/:5192 restarts (orchestrator's), no task-list edits, no merges, no :3001/:5174 touch,
  NEVER pkill, git -c core.fileMode=false, node_modules symlink never committed through.
- Genuine platform gap mid-flight -> STOP that leg, requires-rescope; never absorb.

## 7. Acceptance criteria (verbatim from the task block, task-list.md:10958-10961) + standing gates
VERIFIED BY (verbatim):
  Fresh live analysis at :5192 shows rows matching the published artifact incl. one provisional-
  state row; request-body + rendered-report round trip per ROUND-TRIP-GATE-1; grep receipt: no
  compound/RT literals in app/src.
ROUND-TRIP-GATE-1 (task-list.md:48-61, BRAD-BINDING): every browser gate includes at least ONE
full live round trip per changed surface — real stream, ZERO interception of /api/ai/**, a
user-visible rendered answer, AND the reviewer captures the outgoing REQUEST BODY as a receipt
artifact PAIRED with the rendered-answer screenshot. "Mounted / visible DOM" alone is explicitly
NOT accept evidence. An ACCEPT is void without the request-body artifact + rendered pair.
Standing gates: fresh baselines at claim, zero NEW failures/errors (app vitest fail-file-set comm
empty; tsc per-file comm zero new — app tsconfig has strict:true, app/tsconfig.json:18, but
exactOptionalPropertyTypes is SERVER-ONLY (server/tsconfig.json:13) — see bait #1); adversarial
review gate; browser gate (orch, cl-browser-reviewer) on the report surface; ONE renderer id added
in ONE commit (enum+union+dispatch+whitelist+source-pin); no bespoke FAME UI; dead chrome is a
defect; friction-first; records API read-and-create only; :3001/:5174 untouched.

## 8. First targeted check (run before anything else; early-proves the approach)
The item stands or falls on the CLOSED-SET DOOR surviving its widening: the shipped whitelist/
dispatch/compat trio is green on a known baseline TODAY and the new id is the single delta. At the
pristine trunk SHA (composer MEASURED this at e45481d1):
  cd /mnt/vast/home/brad/git/cl-integration-1/app && npx vitest run src/analysis/ViewRenderer.test.tsx src/analysis/ViewRenderer.compat.test.tsx
Expected: "Test Files 2 passed (2) / Tests 17 passed (17)" (composer-measured 08:42 at e45481d1 —
re-capture fresh at claim, trunk may have moved).
Companion data door (needs the dependency gate closed): the FAME-4 analyte_summary artifact GET
returns an inline {columns, rows} payload —
  curl -s -H 'x-user-id: USR-LOCAL-ADMIN' http://localhost:3092/api/records/<AOUT-analyte_summary-live-id-read-live> | python3 -c "import sys,json;p=json.load(sys.stdin)['record']['payload'];iv=p['inlineValue'];print(p['dataKind'], isinstance(iv,dict), 'rows' in iv, 'columns' in iv)"
Expected: table True True True (field names/ids READ LIVE per the dependency gate; the FAME-2
AOUT-000041 precedent proves small tables persist inline, analysisRunner.ts:409-433). If the
summary is dref-backed instead, the named-empty-arm rule (§4) applies and W4's report revision
re-echoes it inline — report which door you found, never assume.

## 9. Verification commands (expected outputs)
- App unit (the item's own surface): cd app && npx vitest run src/analysis -> fresh baseline at
  claim, fail-FILE-SET comm empty; the NEW/AMENDED ViewRenderer legs green; source-pin green with
  the amended literal.
- Server schema legs: cd server && npm run test:run -- src/analysis/analysisSchema.test.ts (lane
  method) -> +1 new positive leg green, quantum-rejection leg green (closed set preserved).
- Typecheck: per workspace fresh-baseline minus zero NEW (app tsc is NOT exit-0 on trunk — FAME-4
  measured 21 error-TS lines at 5444e69c; do not claim exit-0; server tsc per-file comm only).
- ONE-commit proof: git show --stat <the commit> touches ONLY: schema/knowledge/view-spec.schema.yaml,
  app/src/analysis/ViewRenderer.tsx (+ optional sibling view file), app/src/analysis/ViewRenderer.
  compat.test.tsx (+ new test file), server/src/analysis/analysisSchema.test.ts. AnalysisPage.tsx
  must be UNLESS in that list unless the orchestrator ruled OQ-2's synthesis door.
- Grep receipts (verified-by leg 3), expected counts at e45481d1 in parens — coder re-measures
  baseline at claim, gate = the DIFF adds zero AND overall does not grow:
    grep -rniE 'hexanoate|octanoate|decanoate|palmit' app/src            -> 0 (0 today)
    grep -rniE 'RES35077|COUNTRYSIDE|FAME-LOCAL' app/src                 -> 0 (0 today)
    grep -rn '15\.673' app/src                                            -> 0 (0 today)
    grep -rniE '\bfame\b|\banalyte\b' app/src                             -> report split: pre-existing
      chrome hits (RunCollectionView placeholders etc.) are the BASELINE; the DIFF adds zero; the
      new renderer id + component + comments carry NEITHER word (the id is domain-free per OQ-1).
    grep -rn "'table'\s*:\s*state|provisional|unresolved|verified" app/src/analysis/ViewRenderer.tsx
      -> 0 state-word literals in the renderer TS (bait #3b).
- Records proof: GET the report ANREV (parent set, parameterSchema additionalProperties:false, no
  literals); GET the report run -> succeeded + params_digest; re-GET FAME-4/FAME-5 runs ->
  byte-identical (append-only).
- Live proof: :5192 report rows DOM-text pair against the GETted artifact payload (W5 receipt);
  provisional row legible in the screenshot WITHOUT JSON (no collapsed details as the only carrier).

## 10. Worker contract + file ownership
- Branch: **wt/fame-6-lane1-l1t<dispatch-ts>** off cl/integration-1 trunk tip AT DISPATCH (branch
  point MUST contain the FAME-3, FAME-4 AND FAME-5 merges — re-verify, do not trust this draft's
  SHAs). Worktree /mnt/vast/home/brad/git/cl-integration-1 discipline per lane.
- Deliverable report (unique path): <ORCH-FILL: /home/brad/.hermes/cl/lanes/1/fame-6-report-
  l1t<ts>.md> + receipts ~/.hermes/cl/receipts/FAME-6/<ts>/.
- Files OWNED: app/src/analysis/ViewRenderer.tsx (+ optional generic artifact-table sibling file +
  its test) , app/src/analysis/ViewRenderer.compat.test.tsx (amend pin), any NEW app/src/analysis/
  ViewRenderer-*/artifact-table test file, schema/knowledge/view-spec.schema.yaml (ENUM LINE +
  comments ONLY), server/src/analysis/analysisSchema.test.ts (+1 positive leg). NOT owned / NOT
  touched: server compute (FAME-4's), the schema triplet beyond the enum line incl. assignment_state
  (FAME-3's), records data (FAME-5's lane data), AnalysisPage.tsx (OQ-2 ruling needed), Chromatogram/
  Compare/Calibration files, ctx.py, analysisRunner.ts.
- Records: READ-and-CREATE against :3092 (x-user-id: USR-LOCAL-ADMIN); mark in-progress on claim,
  NEVER done. Final marker: `FAME-6 DONE <full-sha>` / `FAME-6 BLOCKED <one-line>`.
- If any leg proves a platform gap (e.g. bindings cannot address a needed payload position):
  STOP, requires-rescope — do not fork the renderer platform.

## 11. Reviewer bait (expect these; pre-empt in diff/report)
1. exactOptionalPropertyTypes: it is SERVER-only (server/tsconfig.json:13 — composer-verified);
   app is strict:true WITHOUT it (app/tsconfig.json). The mechanical witness is the per-file tsc
   comm either way. In the shared RenderableView/RenderableArtifact interfaces every optional field
   stays an explicit conditional spread (toRenderableArtifact :387 pattern), never undefined-assign.
2. The ONE-commit break: a diff that adds the id to the TS union but not the schema enum (runner
   VSPEC validation then 400s the data leg), or to enum+union but not the whitelist (AnalysisPage
   :534 silently table-coerces it — the GC-9 trap the whitelist exists to catch: the rendered
   report would LOOK like a plain table with no error anywhere; the compat test + resolveViewRenderer
   literal leg is the receipt). Check git show --stat against §9's file list.
3. Vocabulary: assignment_state strings in bindings/parameters/payload re-echoes MUST be exactly
   FAME-3's merged terms (grep the MERGED schema at dispatch; this spec never writes them);
   'unassigned'/'pending'/'tentative'/'candidate' anywhere = invented vocabulary, reject. The four
   FAME-5 outcome words belong to FAME-5's payload — the renderer must not re-declare them as TS
   enums/chip maps. 3b. The renderer TS contains ZERO state-word string comparisons (bait #3b grep):
   provisional rendering is positional/data, not `=== 'provisional'`.
4. Domain-word leak: 'fame'/'analyte'/'fatty' in the renderer id, component name, file name, or CSS
   class = bespoke-FAME-UI violation (task title: "no bespoke FAME UI"). The id is generic; the
   DOMAIN lives in the view-spec DATA.
5. Client-synthesis creep: an AnalysisPage.tsx diff that recognizes the analyte summary
   structurally/by name to auto-inject a view (the GC-11 calibration door) is scope creep UNLESS
   the orchestrator ruled OQ-2 that way — the persisted-view door (:534) is the declarative default;
   synthesis gates are TS knowledge of artifact shape.
6. Hardcode boundary: §9's greps; PLUS — column selection lives in bindings, not in a baked
   DEFAULT_COLUMNS-style constant inside the new component (the DEFAULT_MARKER_FIELDS precedent
   ChromatogramView.tsx:42 names FIELD NAMES not values and is the max coupling allowed; a new
   default list must be defended in the report or the bindings drive it). No RT values, no
   per-compound formatting, no percent math, no sorting-by-area logic in TS (normalization = R8).
7. YAML-reload trap: schema enum changed but the report revision minted BEFORE the orchestrator's
   restart => VSPEC 400 (restart gate). The report must name the restart it ran after; a coder who
   "worked around" the 400 by keeping renderer 'table' in the data leg failed the item's premise.
8. Honesty-surface quality: reviewer re-reads the rendered screenshot and checks denominator is
   LABELED (eligible-set vs total, FAME-5 §15 denominator_basis visible), the composition-check
   shows ACTUAL observed vs expected + outcome word (not-assessable is a PASS, a report that made
   palmitate 'match' by touching data is the R2 ban, FAME-5 bait #4 applies), exclusion warnings
   NAME their buckets, and percent columns sum over the stated denominator only — the renderer
   displays, never fixes.
9. Dead chrome: any always-invisible control (a details/summary wrapper that is the ONLY carrier of
   the provisional row, a disabled placeholder button, a 'coming soon' arm) = defect per standing
   rules. Every named arm must be reachable by a real payload shape (missing bindings -> named arm).
10. Round-trip quality: an ACCEPT without the request-body + rendered-report PAIR per changed
   surface is VOID (ROUND-TRIP-GATE-1 verbatim); screenshots must post-network-settle; every
   NEGATIVE claim (row missing) re-verified via API call before reporting (lane reliability rule).

## 12. Open questions (composer could not resolve locally — orchestrator/architect calls, never the coder)
OQ-1 (the exact id string): proposed `artifact-table` (task's own words "generic artifact-table id";
  collision grep 0 hits; kebab precedent chromatogram/trace-compare/calibration-curve). This is an
  enum-minting vocabulary call on a shipped closed set — architect ratifies the string at promotion;
  everything else in this spec binds the PATTERN, so a rename is a one-token amend. Checked: full
  enum sites §Grounding, compat pin discipline, grep collision.
OQ-2 (report view-spec home / door): DEFAULT = a new successor revision (W4) whose entryScript
  re-echoes + publishes the report views with the new renderer (pure persisted-view door, zero page
  TS). Alternative A: the orchestrator amends/ratifies an FAME-4/5 successor to publish the new-
  renderer views directly (fewer runs, but re-opens merged items' revisions — append-only successor
  either way). Alternative B: extend the GC-11 client-synthesis door — REJECTED by composer
  (TS shape-knowledge, bait #5) unless the architect rules the re-echo revision too heavy. Checked:
  AnalysisPage.tsx:527-586 both doors, analysisRunner.ts:449-480 persisted door, ctx.view opaque
  renderer string ctx.py:326-344. Orchestrator/architect pick; W4's wording assumes the default.
OQ-3 (generic-renderer capability depth): how much structure does `artifact-table` need beyond
  TableView's {columns,rows} arm — the task lists basis note / denominator caption / warning rows /
  composition-check block. Composer's default: TableView-parity core + bindings-named header/
  caption/warning slots reading payload FIELDS (fields as names, values as data). Richer per-block
  layout (e.g. dedicated check-block sub-rendering inside the same id) risks re-inventing bespoke
  UI inside a generic id. Checked: TableView :74-105 (already covers the summary tables), bindings
  free-object precedent + canonical-shape comments view-spec.schema.yaml:44-63. If the architect
  wants block-composition semantics IN the generic id, name them at promotion; else W2's legs (a)-
  (f) are the contract. NOT a coder call at dispatch — the coder builds what the promoted spec says.
