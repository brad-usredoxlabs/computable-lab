# FAME-7 SPEC DRAFT — l1t0210 (composer draft, pending orchestrator review/promotion)

Item: FAME-7 "Cross-run artifact binding reachable: declared-input controls bind the standard
summary DREF into the butter run (closes F1d)" — lane 1, trunk cl/integration-1.
Task block read at /home/brad/.hermes/cl/lanes/1/task-list.md:11275-11294 (verbatim below, §7).
Composer worked at trunk **01ca900588d82ed321abdfac041b3c1ddb293839** ("lane1 242ND late-close:
FAME-5 gate ACCEPT -> FAME-5 DONE; FAME-6 dispatch gate satisfied"), 2026-11-02 ~02:05-02:20 -0500.
EVERY path:line below was read FIRST-HAND in /mnt/vast/home/brad/git/cl-integration-1 at this SHA
plus live GETs on :3092 in this session. No scout call was used for this draft; nothing here is
screening-grade. Re-verify every cite at promotion/dispatch (the FAME-6 merge moves
AnalysisPage-adjacent numbers, not the files FAME-7 owns — see §1).
NOTE: trunk advanced to **002bb74461e05639b6df68b28daee6bf331f6441** at 02:11:32 (243RD tick
bookkeeping) DURING composition; `git diff --stat 01ca9005..002bb744` = 1 file added, a plan doc,
ZERO code files. Every cite below was read at 01ca9005 and is valid at 002bb744.

---

## 0. DEPENDENCY GATE (stated plainly, per the brief)

DISPATCH WAITS UNTIL **FAME-6 IS MERGED** into cl/integration-1 (task deps: FAME-5, FAME-6;
task-list.md:11279). FAME-5 is DONE (merged 2026-11-02 00:15, trunk 01ca9005); FAME-6 was QUEUED
(coder session-1, worktree wt/fame-6-lane1-l1t0150 off 01ca9005) at composition time.

Transitively the gate means, in this order:
1. FAME-6's ONE commit (schema enum + TS union + whitelist + dispatch arm + compat pin, the OQ-1
   ruling) is MERGED, and
2. the lane stack is RESTARTED by the ORCHESTRATOR (`cl-lane-stack.sh 1 restart`) — schemas load
   from disk ONCE at startup and cache (server/src/server.ts:370-376 createSchemaRegistry +
   loadAllSchemas; SchemaRegistry map cache server/src/schema/SchemaRegistry.ts:73), so a
   view-spec/analysis-revision schema change is invisible until restart. A VSPEC 400 or a
   revision-create 400 BEFORE the restart is the RESTART GATE, not a bug to chase.
3. Only then may the FAME-7 coder create the revision whose declared-input contract uses the new
   declaration keys (§3 W2) and whose view names renderer `artifact-table`.

Why FAME-6 must land first (hard, not cosmetic): FAME-7's butter report view is an
`artifact-table` view. At 01ca9005 the id does not exist anywhere —
`grep -rn 'artifact-table' app/src schema/` = 0 hits, and the whitelist
(app/src/analysis/ViewRenderer.tsx:44-52) has 7 ids with `resolveViewRenderer` table-coercing
anything else (:56-60). FAME-7 MUST NOT re-add the enum/whitelist/union/dispatch (that is FAME-6's
ONE commit, and the OQ-2 ruling's "any AnalysisPage hunk = reject" was scoped to FAME-6 ONLY —
this item is the item that OWNS the AnalysisPage createRun path; see §1).

Also binding: FAME-6's door-D ruling (2026-11-01_fame-6-oq1-oq2-oq3-decision.md:36-56) means
FAME-6 delivered a REPORT successor revision + persisted views and touched NO AnalysisPage code.
FAME-7 therefore inherits a clean AnalysisPage: the `inputs: {}` hole is still exactly where
FAME-5 left it. This spec does not re-litigate door B/D; it lands the declared-input work as its
own scope.

State at composition (2026-11-02 ~02:05, trunk 01ca9005): FAME-1..FAME-5 DONE (merged/live);
FAME-6 coder session-1 QUEUED. Live record facts used below were read from :3092 this session and
ARE to be re-read at dispatch (§3 W1).

---

## 1. Goal (one sentence)

Make cross-run artifact binding REACHABLE end-to-end: declare the accepted artifact inputs per
analysis revision as YAML DATA, render one control per declared input in the Run-method card so
`createRun` sends the real `{inputs:{<name>: {kind:'record', id:'DREF-…', type:'data-reference'}}}`
instead of the hardcoded `inputs: {}`, validate that submission server-side with named declared
rejections (never silent), and publish a COUNTRYSIDE comparison report that shows the butter's
area-% beside the bound RES35077-5 standard's measured % and declared facts with the two
denominators kept SEPARATE and the standard's warnings carried — while the producer run and the
bound artifact are proven byte-unchanged by re-GET digest receipts.

## 2. Code/data boundary (declarative-first)

- "Things that can be data should be data." The declared input contract is DATA ON THE REVISION
  RECORD (`analysis-revision.schema.yaml` `inputs` array — it ALREADY exists, see §3 G3). FAME-7
  widens that declaration vocabulary with GENERIC keys (no FAME/compound/standard nouns):
  * `acceptsKinds` (array of record `type` strings) — which ref kinds this input slot admits;
    the shipped admissible set is already declared as DATA in
    config/drafting/analysis-composition.yaml:30 `inputKinds: [data-reference,
    analysis-output-artifact]`. A revision input declaration narrows it per slot.
  * `acceptedArtifactNames` (array of strings) — the producer artifact `name` (the AOUT payload's
    own `name` field, e.g. "standard_summary") that this slot accepts. Generic string matching;
    zero TS knowledge of what the string means.
  * `dataKind` already exists and stays the compatibility axis.
  ENUM/FIELD NAMES ARE THE ARCHITECT'S CALL AT PROMOTION (OQ-3). The SHAPE (declaration keys on
  the revision input item + server validation + UI rendering from them) is what this spec binds.
- TypeScript follows the declaration: the page renders one row per declared input and reads the
  declarations; it contains ZERO analyte/compound/artifact-specific literal. No
  `if (name === 'standard_summary')` branch anywhere. The SERVER validates with a generic
  interpreter over the same declaration (a pure module, `server/src/analysis/declaredInputs.ts`),
  NOT with domain rules.
- The comparison report's CONTENT is DATA: the entryScript lives on a revision record and echoes
  producer payload fields into a declared `{columns, rows}` payload (FAME-4/5 precedent), rendered
  by FAME-6's generic `artifact-table` through `ctx.view(name, 'artifact-table', artifact=…,
  bindings=…, options=…)`. No new renderer, no new TSX.
- R8 verbatim: zero analyte names, RT values, or normalization arithmetic in `app/src` or
  `server/src` — grep receipt is an acceptance artifact (§6). All names live in revision YAML /
  artifact payloads.
- R4 verbatim: percentages never travel without their denominator. Cross-denominator comparison is
  NEVER presented as comparable; the report keeps the two denominator blocks separate and emits a
  NAMED warning when the bases differ (data-driven: compare only if the declared basis strings
  match).
- No silent fallback: missing / undeclared / incompatible / unresolvable input ⇒ a NAMED declared
  rejection token (server) and a NAMED visible block line (page). Never `inputs:{}`, never a
  default artifact, never a fabricated zero.

---

## 3. Grounding — what exists TODAY at 01ca9005 (first-hand)

### G1. The door (the defect F1d named)
- `app/src/analysis/AnalysisPage.tsx:510-535` — `createRun`; **:525 `inputs: {}`** hardcoded,
  with the :519-520 comment recording the gc run-sheet removal that left this path inputless.
- `app/src/analysis/AnalysisPage.tsx:692-745` — the Run-method card: revision `<select>`
  (:693-697), run title (:700), parameter form (:703-740), `Create run` (:744). There is NO
  input control of any kind on this card.
- `app/src/analysis/AnalysisPage.tsx:85-93` — `RevPayload` carries only
  id/title/sdkVersion/entryScript/parameterSchema. **It does NOT read the revision's `inputs`
  declaration today** — the page literally cannot see the contract. (Adding the typed field is a
  W-item, bait #6.)
- `app/src/analysis/AnalysisPage.tsx:431-442` — `useResult(name)` ("Use result downstream"): calls
  `apiClient.promoteAnalysisArtifact(artifactRecordId)` and then only prints
  "reference DREF … in a new run's inputs" (:438). The user is told to do by hand what the page
  cannot do: dead-end chrome, exactly the F1d unreachability.
- `app/src/shared/api/client.ts:3344-3354` — `createAnalysisRun(body)` already types
  `inputs: Record<string, {kind:'record'; id:string; type:string}>` — the wire shape exists; only
  the caller is broken.
- `app/src/shared/api/client.ts:3372-3378` — `promoteAnalysisArtifact` returns
  `{artifactId, dataReferenceId, created}`.

### G2. The serving side already accepts artifact/DREF inputs (proven, not hoped)
- `server/src/analysis/analysisRunner.ts:147-210` `provisionInputs`:
  * artifact branch `:171-199` — `type:'analysis-output-artifact'` resolves the AOUT record; if it
    carries `dataReferenceRef` it resolves that DREF (:179-192, with contentHash drift gate
    `DATA_HASH_MISMATCH` per :161-164); **if it carries `inlineValue` it hands the inline payload
    to the SDK (:193-196)** — this is how every FAME-4/5 run consumed its artifacts; no DREF is
    required;
  * data-reference branch `:200-210+` — `type:'data-reference'` resolves device/path/contentHash.
- Live precedent of a DREF-typed input on the wire: `app/src/run/gc/GcSectionChrome.test.tsx:347-380`
  asserts `createAnalysisRun({… inputs: { signal: {kind:'record', id:'DREF-000101',
  type:'data-reference'} } })`. The shape in the task text ("{inputs:{<name>: {dataReferenceRef
  ...}}}") is that ref object — the field name on the RUN RECORD is `inputs.<name>` and the value
  is the ref (schema §G3); `dataReferenceRef` is the ARTIFACT-side property name
  (`analysis-output-artifact.payload.dataReferenceRef`), not the run-input key. Bait #3.

### G3. The declarative surface EXISTS and is (partly) honest
- `schema/knowledge/analysis-revision.schema.yaml:60-73` — `inputs` is an ARRAY of
  `{name (required), description, dataKind (enum of 12 kinds), required (boolean)}`,
  `items.additionalProperties: false`. **New declaration keys MUST be added here or revision
  creation 400s** (the store validates against this schema).
- `schema/knowledge/analysis-run.schema.yaml:44-48` — run `inputs` is
  `name → ref.schema.yaml` (a record ref: kind/id/type, optional label/revisionRef). Frozen at
  submit; the schema description says so.
- `server/src/analysis/analysisService.ts:82-88` — `CreateRevisionInput.inputs` typed as the same
  4 fields; :89-95 `CreateRunInput.inputs: Record<string, {kind:'record'; id:string; type:string}>`.
- **`server/src/analysis/analysisService.ts:226-248` `createRun` performs ZERO input validation**:
  it mints the id and stores `inputs: input.inputs ?? {}` (:238). It never resolves the revision,
  never reads `revision.inputs`, never resolves the refs. This is the server half of F1d.
- `server/src/api/handlers/AnalysisHandlers.ts:63-74` — the handler is a thin pass-through to the
  service (validation belongs in the service, where `this.ctx.store` lives).
- `config/drafting/analysis-composition.yaml:28-31` — shipped policy DATA already names
  `inputKinds: [data-reference, analysis-output-artifact]` and is loaded PER CALL (never
  process-cached: :1-4 comment). Precedent for loading declaration policy per call, and a possible
  home for a global admissible-kind set (OQ-4).

### G4. The live data legs (read this session on :3092; RE-READ at dispatch — ids drift)
- Standard-summary artifacts on the RES35077-5 leg: **AOUT-000111** (producer run **ANR-000060**,
  status `succeeded`, meta.contentSha `238aca0d12c8cf9ac6c685020323cf58708de912`), plus
  AOUT-000108 (ANR-000059), AOUT-000105 (ANR-000058), AOUT-000102 (ANR-000057).
- AOUT-000111 payload keys: `kind,id,title,name='standard_summary',runRef{ANR-000060},
  sourceRelations[AOUT-000098,AOUT-000099],dataKind='table',schema,inlineValue`.
  `inlineValue` carries `columns, rows(5), denominator_pa_min=1664.7037274749032,
  denominator_reason=null, contributing_peak_refs, eligible_peak_count=1, excluded_peak_count=30,
  unresolved_area_pa_min, unresolved_null_area_peak_count, excluded_buckets[{null_area,
  overlap_excluded, unmatched}], identity_holds, eligible_set_member_refs, declared_facts,
  provenance, honesty`. `declared_facts` = {expected_total 3 mg/mL mass_per_volume,
  expected_analyte FAME-LOCAL:methyl-palmitate-n16, expected_percent_of_total 90, source "Brad
  bench statement 2026-10-31", basis declared-fact}. `provenance` = {producer_revision_id
  ANREV-000017, params_digest 8006958b…, consumed_artifacts [AOUT-000098→ANR-000056,
  AOUT-000099→ANR-000056]}.
- **`dataReferenceRef` is ABSENT on every standard_summary artifact** (AOUT-000111/108/105/102 all
  `inlineValue`-only; GET returns `dataReferenceRef: null`). No existing DREF points at any of
  them (`grep` over GET /api/records?kind=data-reference — the AOUT-0001xx ids appear nowhere).
  ⇒ "bind the real … DREF" REQUIRES a DREF to be minted first. See §9 OQ-1.
- The butter/COUNTRYSIDE chain: AOUT-000044 (COUNTRYSIDE peak table) → **ANR-000050** (ANREV-000016)
  → AOUT-000080 `assignment_results`, **AOUT-000081 `analyte_summary`**,
  AOUT-000082 `effective_parameters`.
  AOUT-000081 `inlineValue`: `denominator_pa_min = null`, `denominator_reason =
  'UNDEFINED_NO_ELIGIBLE_AREA'`, `eligible_peak_count = 0`, `excluded_peak_count = 2`,
  `excluded_buckets [{overlap_excluded, peaks [1,2], area 267032.7186923163}]`, `identity_holds
  true`, plus 2 rows (assignment row with `area_percent: null`, bucket row).
  **The butter area-% is null-with-a-named-reason on today's real data** — the report must SAY
  that, never invent a number. A second declared-parameter arm (overlap inclusion) is available if
  a numeric reading is wanted; both are honest, reporting ACTUALS is mandatory (bait #10).
- Current head revision: **ANREV-000017** (FAME-5, parent ANREV-000016), declaring inputs
  `assignment_results` (required, table) + `analyte_summary` (required, table) — free-text
  descriptions name the AOUT ids, but NOTHING machine-checkable says which artifact `name` or
  `type` is acceptable. That gap is FAME-7's declaration work.

### G5. Immutability / freeze model (what "provably immutable" can honestly mean here)
- Every record GET returns `meta.contentSha` + `meta.commitSha` (live: ANR-000060 →
  `238aca0d12c8…`, AOUT-000111 → `d098ba6f81e7…`). Re-GET compare is the digest witness (FAME-2 §8
  method, cited by FAME-5 §6:205).
- `server/src/analysis/artifactPromotion.ts:51-58` — promote is IDEMPOTENT when the artifact
  already has a `dataReferenceRef` (returns `created:false`, mutates nothing).
- `server/src/analysis/artifactPromotion.ts:60-113` — when the artifact has only `inlineValue`
  (today's case), promote **writes the bytes to storage (:78), mints a DREF with `contentHash`
  (:79-100), then UPDATES the artifact record to add `dataReferenceRef` (:102-113)**. That is a
  MUTATION of the artifact record. There is no automatic REV- snapshot on update: the append-only
  wall covers `record-revision|signature|audit-event` (+config kinds) only
  (RecordStoreImpl.ts:273-278); the prior bytes survive only in the data-repo git history
  (a commit is made per write, RecordStoreImpl.ts:805-838). Bait #4 — see OQ-1.
- `server/src/analysis/analysisRunner.ts:729` — execute reads the run's frozen `inputs`; nothing
  on the execute path writes the source artifact or the producer run.

### G6. Test + tooling baselines (measured by the composer at 01ca9005 THIS session)
- `cd app && npx vitest run src/analysis/AnalysisPage.reanalyze.test.tsx
  src/analysis/ViewRenderer.compat.test.tsx` → **2 files / 10 tests passed**.
- `cd server && npx vitest run src/analysis/analysisService.test.ts` → **1 file / 9 tests passed
  (18.9s)**.
- Scripts: app `typecheck` = `tsc --noEmit`, `test` = `vitest run`; server `typecheck` =
  `tsc --noEmit`, `test:run` = `vitest run` (package.json, both workspaces).

---

## 4. Work items (in order)

W1. **Gate + baselines (no code).** Re-verify at the dispatch SHA: (a) FAME-6 merged
    (`grep -rn 'artifact-table' app/src schema/` > 0, whitelist 8 ids), (b) stack restarted
    (GET /api/records/ANREV-000017 200 and a view with renderer `artifact-table` validates),
    (c) re-read §3 G4 live facts (AOUT-000111/ANR-000060 ids + `dataReferenceRef` state +
    meta.contentSha), (d) capture fresh `tsc --noEmit` baselines in app/ and server/ (gate = zero
    NEW errors), (e) run the §5 First Check. IF FAME-6 is not merged and restarted: **STOP**, report
    BLOCKED on the dependency gate.

W2. **Declare the contract (YAML/record DATA, then schema).**
    (a) Extend `schema/knowledge/analysis-revision.schema.yaml:60-73` items with the generic
    declaration keys ratified at promotion (proposed: `acceptsKinds` array-of-string,
    `acceptedArtifactNames` array-of-string; `additionalProperties:false` stays). Comment block
    names this task and the ruling file, chromatogram-bindings style.
    (b) Mirror in `CreateRevisionInput.inputs` (`analysisService.ts:82-88`) — the service validates
    on create, so an unknown key would 400 the very revision that declares the contract.
    (c) Create the comparison revision via `POST /api/analysis-revisions` (records API
    read-and-create only) with:
        * `parentRevisionRef` = the head the orchestrator names at dispatch (OQ-2);
        * `inputs`: the declared standard-summary slot — `{name: "standard_summary", dataKind:
          "table", required: true, acceptsKinds: ["data-reference","analysis-output-artifact"],
          acceptedArtifactNames: ["standard_summary"], description: …}` — plus the butter-side
          analyte_summary slot if the entryScript consumes it (declared, same style);
        * `parameterSchema` with `additionalProperties:false` for the report knobs (e.g. a declared
          string label for each side's denominator basis); NO outcome enum in parameters;
        * `entryScript` per W3; `sdkVersion` 0.4.0; engineRef = the FAME-5 engine (read live,
          ENG-L1G-6a298b as used by ANREV-000017 — re-verify); `requiredCapabilities` omitted/[]
          (it detects and integrates nothing).
    (d) RESTART GATE: the schema change lands in the merged commit; the orchestrator restarts
    :3092 BEFORE this revision is created. A 400 on the new keys pre-restart is the gate.

W3. **Comparison entry script (DATA on the revision; zero product-code diff).** Consumes the
    declared inputs directly from their inline payloads (never `ctx.input(...).read_rows()` on an
    inline dict — ctx.py:64-70 trap, FAME-5 §7:219); publishes `comparison_report` as a declared
    `{columns, rows}` table with:
      * one row per analyte present on EITHER side, keyed by echoed `compound_ref` + `label`
        (never by a literal name in code);
      * `butter_area_percent` + `butter_denominator_ref` + `butter_denominator_basis` (echoed;
        `null` with the consumed `denominator_reason` word when the denominator is undefined);
      * `standard_area_percent` + `standard_denominator_ref` + `standard_denominator_basis`
        (echoed from the standard_summary payload — the two denominators are NEVER merged, never
        one number);
      * `delta_pp` ONLY when both denominators' declared basis strings are equal; otherwise
        `null` plus a row-level `denominator_basis_mismatch` warning (R4);
      * declared facts echoed verbatim (`expected_percent_of_total`, `expected_total`
        value/unit/basis, `source`, `basis`) — as their own columns/fields, not folded into a
        computed value;
      * a top-level `warnings` ARRAY (strings) carrying the standard's `excluded_buckets` summary,
        `denominator_reason`, `identity_note`, and the basis-mismatch note — this array is what
        the view's `warningsFrom` binding renders (FAME-6 OQ-3 convention
        `warningsFrom`/`warningTextField`);
      * a top-level `caption` string naming both denominators (what `captionFrom` renders);
      * provenance block: the bound artifact id + its `provenance` echo (producer run, params_digest,
        consumed artifacts) + this run's own params_digest — every id resolvable.
    Publishes views: `comparison_report_view` with `renderer: 'artifact-table'`,
    `artifact: 'comparison_report'`, `bindings: {columns:…, captionFrom:'caption',
    warningsFrom:'warnings'}` (FAME-6's shipped id + convention; do NOT invent bindings).
    RED-first dry run via the shipped CLI `python3 -m computable_lab_analysis run` with synthetic
    inline fixtures for: both sides numeric / butter null-denominator / basis mismatch — raw
    outputs into the receipts dir BEFORE minting.

W4. **Server: declared-input validation (named rejections).** New pure module
    `server/src/analysis/declaredInputs.ts` + `declaredInputs.test.ts`; called from
    `analysisService.createRun` (:226-248) AFTER resolving the revision (`ctx.store.get`) and
    BEFORE `store.create`. Rules, all driven by the revision's declaration — zero domain nouns:
      * input name not present in `revision.inputs` → `INPUT_UNDECLARED` (400), message names the
        undeclared key and the declared names;
      * declared `required:true` slot absent from the body → `INPUT_REQUIRED_MISSING` (400);
      * `ref.kind !== 'record'` → `INPUT_NOT_RECORD_REF` (400);
      * `ref.type` not in the slot's `acceptsKinds` (default: the two shipped input kinds) →
        `INPUT_KIND_NOT_ACCEPTED` (400);
      * the ref does not resolve (store.get null) → `INPUT_UNRESOLVABLE` (404);
      * the resolved artifact's `name` not in `acceptedArtifactNames` (when declared) →
        `INPUT_ARTIFACT_NAME_MISMATCH` (400);
      * the resolved artifact/DREF `dataKind` conflicts with the declared `dataKind` →
        `INPUT_DATAKIND_INCOMPATIBLE` (400).
    NO coercion, NO defaulting, NO "best effort": the rejection IS the behavior (GC-5
    `ENGINE_REF_UNRESOLVED` precedent, analysisService.ts:71-77). Revision with NO `inputs`
    declaration (legacy, e.g. ANREV-GC10A) → the OQ-3 ruling decides: skip validation vs
    `INPUT_CONTRACT_UNDECLARED`. A skip is allowed ONLY if the architect ratifies it, and it must
    be documented in the module comment (a NAMED, documented skip — never a silent one).

W5. **Page: declared-input controls + real createRun body.**
    (a) `RevPayload` gains a typed `inputs?: Array<{name:string; description?:string;
    dataKind?:string; required?:boolean; acceptsKinds?:string[]; acceptedArtifactNames?:string[]}>`
    (conditional-spread discipline: no `| undefined` assignments — exactOptionalPropertyTypes).
    (b) New pure module `app/src/analysis/declaredInputs.ts` (no React): `declaredInputsOf(rev)`,
    `boundInputs(decls, staged)` → the `inputs` object, `inputGate(decls, staged)` → `{blocked,
    reasons[]}` (named lines: "required input 'x' is not bound", "input 'y' accepts kinds …, got
    …"). Unit-tested; zero analyte literals.
    (c) Run-method card (`AnalysisPage.tsx:692-745`): one row per DECLARED input under the title
    field — the declared `name`, its `required` marker, its `dataKind`/accepted names, and a
    `Bind…`/`Clear` control; a staged ref renders its FROZEN IDENTITY visibly (artifact id, DREF
    id when present, producer run id + `meta.contentSha`, and the promoted artifact's
    `contentHash`) BEFORE submit — the "showing producer run/artifact/frozen identity before
    submit" requirement. Zero declarations ⇒ zero rows (no dead chrome).
    (d) `createRun` (:510-535) sends `inputs: boundInputs(...)` — the built object, never `{}`.
    When a required input is unbound, the button blocks with the named reason (the shipped
    `gate.blocked` block at AnalysisPage.tsx:741-743, Create button :744). `inputs:{}` must not
    survive anywhere in the file.
    (e) "Use result downstream" (:431-442) ROUTES TO THE SAME PATH: promote (idempotent server
    call), then stage the returned `{artifactRecordId, dataReferenceId}` into the matching declared
    slot — matching is DECLARED-DATA matching (`acceptedArtifactNames` ∋ the artifact's `name`
    from `artifactRefs`, and/or `dataKind`), never a hardcoded name. If ≥2 declared slots match,
    the user picks; if 0 match, the line says so (named, no silent drop). No auto-submit: the user
    still presses Create run with the identity visible.
    (f) Keep the page's existing run-list/execute/selectRun behaviour byte-identical; do not touch
    the GC-11 client-synthesis gates (AnalysisPage.tsx:600-647 at 01ca9005 — the comment block
    starts :602 and the block ends before the GC-11 D5 badge comment :648) or the FAME-6 renderer
    wiring.

W6. **Data legs (records only; :3092 + :5192).**
    (a) DREF leg (blocked on OQ-1): make a DREF exist for AOUT-000111 via
    `POST /api/analysis-artifacts/AOUT-000111/promote` ONCE — capture the pre-promote GET
    (meta.contentSha + payload keys) and the post-promote GET; the receipt states the EXACT
    additive key (`dataReferenceRef`) and proves the result CONTENT unchanged (sha256 over
    `JSON.stringify(inlineValue)` before/after must be identical) and ANR-000060's `meta.contentSha`
    unchanged. Record the minted DREF id (`DREF-0002xx`).
    (b) Butter comparison run: create the run against W2's revision with
    `inputs: {standard_summary: {kind:'record', id:'DREF-0002xx', type:'data-reference'}}` plus the
    butter-side declared slot, execute, capture the request body + the published
    `comparison_report` (AOUT id) + its persisted view.
    (c) Rejection legs (each a real request body + response): (i) undeclared input name →
    `INPUT_UNDECLARED`; (ii) required slot omitted → `INPUT_REQUIRED_MISSING`; (iii) bound artifact
    of the wrong `name`/`dataKind` (e.g. AOUT-000081 bound into the standard slot) →
    `INPUT_ARTIFACT_NAME_MISMATCH` / `INPUT_DATAKIND_INCOMPATIBLE`; (iv) a bogus id →
    `INPUT_UNRESOLVABLE`. Each is a declared rejection, never a created run (assert no ANR was
    minted — receipts show the id counter did not move).
    (d) Immutability leg: re-GET AOUT-000111 → `dataReferenceRef.id` stable, stored bytes re-hash
    equals the DREF `contentHash` (use `GET /api/analysis-artifacts/AOUT-000111/content`), and
    re-GET ANR-000060 → `meta.contentSha` byte-identical to the W6(a) pre-promote receipt.

W7. **Receipts (§ROUND-TRIP-GATE-1).** Under `~/.hermes/cl/receipts/FAME-7/<ts>/`: the
    revision-create body, each run-create request body (verbatim JSON), each rejection
    request+response pair, the promote request+response + pre/post GETs, the rendered comparison
    page screenshot paired with the request body that produced it, and the grep/R8 receipt. Zero
    `/api/ai/**` interception (this surface's round trip is the createRun/execute HTTP pair plus
    the rendered answer; if the browser gate runs a chat/analysis AI turn on this surface it must
    be a real stream).

---

## 5. Explicitly out of scope

- FAME-6's renderer internals: `app/src/analysis/ViewRenderer.tsx`, its compat pin,
  `schema/knowledge/view-spec.schema.yaml` — read-only consumption. Re-adding the
  enum/union/whitelist/dispatch (or a second new id) is an automatic reject.
- FAME-4/FAME-5 compute, artifacts, revisions, frozen record chains: append-only consumption, no
  edits, no re-execution of ANR-000056..000060.
- `server/src/analysis/analysisRunner.ts` `provisionInputs` (execute path already accepts both
  ref kinds). If a dispatch leg proves it does NOT, STOP → requires-rescope; do not fork it.
- `server/src/analysis/artifactPromotion.ts` semantics change (OQ-1; without an architect ruling,
  the shipped promote is used as-is with receipts).
- Any bespoke comparison component, any new renderer, any new schema kind, any compound/ontology
  vocabulary work (FAME-ONTO-1 shipped the terms; nothing here re-declares them).
- Records API writes other than create/promote: no `updateRecord` on analysis records.
- Restarting the lane stack, git operations, merging: orchestrator/coder-tooling only.

---

## 6. Acceptance criteria

### 6.1 Verbatim from the task block (task-list.md:11291-11294)
> In the browser: bind the real RES35077-5 standard-summary DREF into a new COUNTRYSIDE analysis;
> request body CONTAINS the DREF; rendered comparison rows match provenance; producer run digest
> unchanged. Missing/incompatible input => declared rejection, never silent. Round-trip receipts.

Task description, verbatim (:11280-11286):
> Declare accepted artifact inputs per revision in YAML; the Run-method card gains declared-input
> controls so createRun sends {inputs:{<name>: {dataReferenceRef ...}}} instead of the hardcoded
> inputs:{} (AnalysisPage); "Use result downstream" routes to the same path, showing producer
> run/artifact/frozen identity before submit. Butter report presents its area-% alongside the bound
> standard's measured % and declared facts, denominators separate, standard warnings carried;
> source run + artifact provably immutable.

### 6.2 ROUND-TRIP-GATE-1 (task-list.md:56-69, BRAD-BINDING — quoted for the gate)
> Every browser gate must include at least ONE full live round trip per changed surface: real
> stream, ZERO interception of /api/ai/**, a user-visible AI answer, AND the reviewer captures the
> outgoing REQUEST BODY as a receipt artifact, paired with the rendered-answer screenshot.
> "Mounted / visible DOM" alone is explicitly NOT accept evidence. … an ACCEPT is void without a
> request-body artifact + rendered-answer pair per changed surface.

Applied to FAME-7 (the changed surface is the Run-method card + the report pane):
- The "request body CONTAINS the DREF" leg is graded on the CAPTURED body file, not on a
  screenshot: the body must literally contain `"DREF-` inside `inputs.<declared name>`, and the
  reviewer greps that file.
- Rendered comparison rows are paired with a screenshot of the report pane AND with the
  provenance chain re-read live (AOUT → runRef → params_digest) so "match provenance" is checkable,
  not asserted.
- Each rejection leg is paired with its own request body + response body (a 400 screenshot alone is
  not evidence).

### 6.3 Standing gates carried into this item
- `cd app && npx tsc --noEmit` and `cd server && npx tsc --noEmit`: zero NEW errors vs the W1
  baseline.
- The R8 grep receipt (zero analyte/compound/RT literals in app/src + server/src for the touched
  files) and a `grep -n 'inputs: {}' app/src/analysis/AnalysisPage.tsx` = **0 hits** receipt.
- Tests: the new declared-input unit tests (app + server) plus the existing analysis test files
  green (§7).

---

## 7. First targeted check (run before anything else; early-proves the approach)

The sharpest early proof is the SERVER seam, because if `createRun` cannot reject a bound input,
the UI work is decoration:

```
cd server && npx vitest run src/analysis/declaredInputs.test.ts -t "rejects an undeclared input name"
```

Expected BEFORE the code lands: the file does not exist → non-zero exit (RED). After W4 lands with
one test per rule of §4-W4: `1 passed` for that filter, and the full file green. This one command
proves (a) the declaration is readable from a revision record, (b) the rejection is named and
typed, (c) nothing mints a run record on rejection.
Second, immediately after: the live probe against :3092 with a real body —
`POST /api/analysis-runs` `{title:"probe", revisionRef:ANREV-<comparison-rev>, inputs:{"__undeclared__":
{kind:"record",id:"AOUT-000111",type:"analysis-output-artifact"}}}` → **400 with
`error:"INPUT_UNDECLARED"`** and no new ANR id. (Run it against the NEW revision only, so a
pre-fix mistake cannot pollute a real leg.)

---

## 8. Verification commands + expected output

1. Server unit/integration (new + touched):
   `cd server && npx vitest run src/analysis/declaredInputs.test.ts src/analysis/analysisService.test.ts`
   expected: `2 passed` files, all tests pass (the existing file was 9 tests at baseline; append
   legs, never edit the existing assertions to fit).
2. App unit/integration (new + touched):
   `cd app && npx vitest run src/analysis/declaredInputs.test.ts
   src/analysis/AnalysisPage.declared-inputs.test.tsx src/analysis/AnalysisPage.reanalyze.test.tsx`
   expected: `3 passed` files; the reanalyze file still 6 tests (its `inputs:{}` fixtures are RUN
   payload fixtures — they must stay valid; the create-body assertion is the new file's job).
3. Typecheck:
   `cd app && npx tsc --noEmit` and `cd server && npx tsc --noEmit`
   expected: exit 0, no new diagnostics vs the W1 baseline capture.
4. Declaration round-trip (live):
   `curl -s http://localhost:3092/api/records/<comparison ANREV> | python3 -c "…"` → the record's
   `payload.inputs` shows the declared slot(s) with the new generic keys, `required:true`,
   `acceptedArtifactNames` present.
5. Request-body receipt:
   the captured body file greps `"inputs"` and `"DREF-` and NAMES the declared slot key exactly as
   declared (`grep -c '"standard_summary"' body.json` ≥ 1).
6. Rejection legs: four bodies → four distinct codes (see §4 W6c), each with `success:false` and
   no ANR minted (list runs before/after shows unchanged max id).
7. Immutability: `curl -s …/api/records/ANR-000060 | python3 -c "print(meta.contentSha)"` equals
   the pre-promote receipt value; stored bytes of AOUT-000111 re-hash equals the DREF `contentHash`;
   `GET /api/analysis-artifacts/AOUT-000111/content` 200 with the same `inlineValue` content digest.
8. R8 grep:
   `grep -rniE "palmitate|hexanoate|methyl-|FAME-LOCAL|RES35077|COUNTRYSIDE" app/src/analysis
   server/src/analysis --include=*.ts --include=*.tsx | grep -v test` → only pre-existing hits, ZERO
   new ones in the files this item adds (receipt the diff of the grep before/after).
9. Renderer sanity: `cd app && npx vitest run src/analysis/ViewRenderer.test.tsx
   src/analysis/ViewRenderer.compat.test.tsx` → green, unchanged by this item (proof FAME-7 did not
   touch the renderer).

---

## 9. Worker contract + file ownership

Branch/worktree: `wt/fame-7-lane1-l1t<dispatch-ts>` created off the cl/integration-1 tip AT
DISPATCH (it MUST contain FAME-6's merge and the post-merge restart). Commit shape: the schema +
server + app legs in coherent commits (the coder's defended split), no commit that leaves app/ or
server/ typechecking red. One commit per logical leg; the schema change and its consumers ship
together so the restart gate is meaningful.

Deliverables (unique paths):
- Worktree branch as above.
- Receipts: `~/.hermes/cl/receipts/FAME-7/l1t<dispatch-ts>/` (bodies, GETs, screenshots, grep
  receipts, `revisions/`, `runs/`, `rejections/`, `immutability/`).
- Report: `.hermes/plans/fame-7-report-l1t<dispatch-ts>.md` (what ran, actual ids, actual numbers,
  every rejection code exercised, the immutability receipts, and the honest null-denominator
  reading if that is what the data says).

Files IN scope:
- `schema/knowledge/analysis-revision.schema.yaml` (inputs item keys; comment block cites this
  spec + the ruling).
- `server/src/analysis/analysisService.ts` (CreateRevisionInput.inputs type; the createRun
  validation call).
- `server/src/analysis/declaredInputs.ts` + `declaredInputs.test.ts` (NEW).
- `server/src/analysis/analysisService.test.ts` (append-only legs).
- `app/src/analysis/AnalysisPage.tsx` (RevPayload.inputs; Run-method card declared-input rows;
  createRun body; useResult routing). **This file is FAME-7's to own** — FAME-6's ban on
  AnalysisPage hunks was scoped to FAME-6 only (OQ-2 ruling :49-51).
- `app/src/analysis/declaredInputs.ts` + `.test.ts` (NEW, pure).
- `app/src/analysis/AnalysisPage.declared-inputs.test.tsx` (NEW).
- `app/src/shared/api/client.ts` ONLY if an input type must widen (likely no diff).

Files OUT of scope (an edit is a reject): `app/src/analysis/ViewRenderer.tsx`,
`ViewRenderer.compat.test.tsx`, `schema/knowledge/view-spec.schema.yaml`,
`server/src/analysis/analysisRunner.ts`, `server/src/analysis/artifactPromotion.ts` (unless the
architect rules OQ-1 toward changing it), any FAME-4/5 revision/artifact record, the GC-11
calibration synthesis block in AnalysisPage (:600-647), `config/drafting/analysis-composition.yaml`
(unless OQ-4 sends the admissibility set there).

Records policy: records API READ + CREATE only (plus the one promote call of W6a if OQ-1 ratifies
it). No `updateRecord`, no delete, no re-execution of producer runs.

---

## 10. Reviewer bait (name them; pre-empt in the diff and the report)

1. **FAME-6 overlap.** Any hunk in ViewRenderer.tsx / view-spec.schema.yaml, a second new renderer
   id, or re-adding `artifact-table` to the whitelist = reject. FAME-7 CONSUMES it.
2. **`inputs: {}` survives.** A second create path, a default in `buildParameters`, or the
   :519-520 comment left stale. Grep receipt required (`grep -n 'inputs: {}' AnalysisPage.tsx` = 0).
3. **Wire-shape literalism.** The task text writes `{inputs:{<name>: {dataReferenceRef …}}}`; the
   REAL run-input value is a ref (`{kind:'record', id:'DREF-…', type:'data-reference'}`, schema
   analysis-run:44-48). Do not invent a `dataReferenceRef` key on the run record (the schema is
   `$ref` to ref.schema.yaml and `unevaluatedProperties:false` would 400 it). The grader greps the
   body for `"DREF-`; the coder must show the actual body and explain the mapping in one line.
4. **Promote mutates the artifact.** AOUT-000111 is inline-only; promote ADDS `dataReferenceRef`
   (artifactPromotion.ts:102-113). Do NOT claim "artifact byte-identical" after promote without
   scoping it to the RESULT CONTENT + the producer run. Receipts: pre/post payload key diff,
   `inlineValue` digest equal, ANR-000060 meta.contentSha equal, DREF contentHash re-hash. If the
   reviewer demands literal zero-mutation, that is OQ-1's ruling, not the coder's call.
5. **Schema `additionalProperties:false`.** New declaration keys not added to
   analysis-revision.schema.yaml items (and to `CreateRevisionInput.inputs`) ⇒ the revision create
   itself 400s. Ship them together; a "worked on my machine" pre-restart run proves nothing.
6. **exactOptionalPropertyTypes.** Every optional field via conditional spread; no `key: undefined`
   in `RevPayload.inputs`, no `acceptsKinds: undefined`, no `ref.type: undefined` in the built
   `inputs` object. `tsc --noEmit` is the gate, and it caught this class before.
7. **YAML reload trap.** Schema changes are startup-cached (server.ts:370-376,
   SchemaRegistry.ts:73). A revision-create 400 before the orchestrator's restart is the GATE; the
   coder must record the pre-restart 400 and the post-restart 201 as two receipts, not "fixed" by
   editing dist/ or restarting themselves.
8. **Silent fallback.** Any `?? {}`, `|| {}`, try/catch-return-empty, or "skip validation when the
   revision declares nothing" without the OQ-3 ruling = reject. Missing input is a NAMED code.
9. **Dead chrome.** Controls rendered for undeclared inputs, a Bind button that does nothing, a
   promote toast that still says "reference DREF manually", or a comparison pane showing an empty
   table where the honest reading is "denominator undefined — UNDEFINED_NO_ELIGIBLE_AREA".
10. **Invented numbers / silent arm switching.** The butter area-% is null-with-reason on the real
    leg; the report must say so. Do not fabricate a percentage, do not silently re-run with
    different parameters to get a nicer number; a numeric arm must be a SEPARATE declared run with
    its own params_digest, both reported.
11. **Denominator merging (R4).** A single "delta_pp" computed across two different bases, or a
    caption that says "of total" when the basis is an eligible subset. Two denominators, two
    labels, mismatch = named warning.
12. **Domain literals in TS (R8).** `standard_summary`, `analyte_summary`, `palmitate`… appearing as
    TS constants/logic. Names may appear ONLY in revision YAML / payloads (a test fixture string is
    acceptable only inside `*.test.*`, and even there prefer generic names).
13. **Immutability damage.** Re-executing ANR-000060, updating an AOUT record, or "fixing" a
    denominator by rewriting data. Append-only: new revision, new run, new artifacts.
14. **Receipt hygiene.** A screenshot without its request body, a body captured from a mocked
    client, or a rendered row asserted from a fixture instead of the live AOUT. ROUND-TRIP-GATE-1
    voids these.

---

## 11. Open questions (composer could not resolve locally — architect/orch decide, NEVER the coder)

**OQ-1 (architect) — how does the DREF exist without breaking "artifact immutability"?**
Checked: GET AOUT-000111/108/105/102 → all `inlineValue`-only, `dataReferenceRef: null`; no DREF in
the store references any AOUT-0001xx; `promoteArtifact` (artifactPromotion.ts:60-113) is the only
mint door and it UPDATES the artifact to add `dataReferenceRef`; the store's append-only wall does
not cover analysis-output-artifact (RecordStoreImpl.ts:273-278), so the prior bytes survive only in
the data-repo git commit. Options: (A) promote once, treat the additive `dataReferenceRef` link as
the declared, receipted freeze step (recommended — it then makes the artifact DREF-backed, gives a
`contentHash` to verify against, and every later bind is idempotent); (B) bind
`{type:'analysis-output-artifact', id:'AOUT-000111'}` with zero mutation, accepting that the request
body contains an AOUT id instead of a DREF and the verified-by's literal "CONTAINS the DREF" is not
met; (C) change promote to mint a DREF without updating the artifact (a platform change, largest
blast radius). The coder stops and asks if the ruling is absent at dispatch.

**OQ-2 (orchestrator) — which revision is the comparison revision's parent at dispatch?**
Checked: head today is ANREV-000017 (FAME-5 successor, parent ANREV-000016). FAME-6's door D mints a
report successor revision whose id does not exist yet. The spec must name the parent explicitly at
promotion: parent the FAME-6 report head (lineage continuity) or ANREV-000017 (the last compute
head). Recommendation: parent the FAME-6 report head, since FAME-7's report consumes what it
renders. The coder must not guess.

**OQ-3 (architect) — the exact declaration key names + whether a revision with NO `inputs`
declaration is validated or skipped.**
Checked: `inputs` items are `additionalProperties:false` (analysis-revision.schema.yaml:60-73);
`CreateRevisionInput.inputs` (:82-88) mirrors four keys. Proposed additions: `acceptsKinds`,
`acceptedArtifactNames`. And the legacy-revision question (ANREV-GC10A/GC10B/GC10C and the demo
revisions declare no inputs): reject with `INPUT_CONTRACT_UNDECLARED` or skip validation? Skipping
keeps every legacy run-creatable path working; rejecting is stricter but breaks shipped flows the
moment the server validates. Recommendation: skip validation for revisions with no `inputs`
declaration, and say so in the rejection module's comment (a NAMED, documented skip — not a silent
one). Architect ratifies the names and the skip.

**OQ-4 (architect) — where does the GLOBAL admissible-kind set live?**
Checked: `config/drafting/analysis-composition.yaml:30` already declares
`inputKinds: [data-reference, analysis-output-artifact]` as per-call-loaded policy DATA (:1-4
comment: never process-cached). The revision-record declaration keys (OQ-3) narrow per slot. Two
homes are therefore possible for the default admissible set the validator falls back to when a slot
declares no `acceptsKinds`: (A) hard-read that config file per call (the shipped precedent, no
restart, but a second source of truth next to the schema), or (B) a schema enum on the revision
input item (single source, restart-gated). Recommendation: (A) — it is already the shipped door,
it is loaded per call, and `analysisRunner.ts:96-98` (`RunInputs` shape) + the :143-150 comment
("may reference a `data-reference` directly OR an `analysis-output-artifact`") accept exactly those
two kinds. The architect ratifies; the coder must not pick a third option.

---

## 12. What the orchestrator should check before promoting this draft

1. That the dependency gate text matches live state at promotion time (FAME-6 merged + restarted).
2. That OQ-1/OQ-2/OQ-3 are ruled (or that their recommended defaults are ratified inline).
3. That the One-commit file list (§9) is enforced by the adversarial reviewer, especially the
   AnalysisPage ownership sentence (FAME-6's ban was FAME-6-only).
4. That the verified-by reading of "request body CONTAINS the DREF" is the literal grep, and that
   OQ-1's ruling makes that satisfiable.
