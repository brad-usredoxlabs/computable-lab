# GC-3 — Instrument-sequence records: run-sheet linking runs, samples, methods, data

PROMOTED 2026-10-26T03:00 by the orchestrator (tick l1t0245) — spec composed by cl-spec-composer
(r2 recovery run l1t0150, 2026-10-26), supersedes the dead run l1t2355 (recon dump:
`/home/brad/.hermes/cl/lanes/1/drafts/gc3-composer-recon-dump-l1t0145.txt`).
ORCH PROMOTION AUDIT (AS-L1T0145-1 clearance, every cite re-read first-hand vs trunk):
LintEngine.ts:143-145 record-scope-skip OK; run.schema.yaml kind const + free-string recordId +
executedBy OK; services/sample kind + ^SMP- :30 OK; ref.schema.yaml REV- pattern :36 + type
free-string :52-55 OK; quantity dimension-collapse OK; analysisRunner FROZEN_INPUT_CHANGED :435 +
capabilities.yaml frozenRunFields OK; analysis-run kind const :18 OK; protocol.lint.yaml:19
step-role-closure OK; analysisCompile.ts UNKNOWN_RECORD :236 OK; RecordHandlers.ts
collectRecordRefIds :226 OK; RecordRevisionService.freezeProtocol :83 OK; oligo-spec
widget:ref :16 OK. TWO cite defects FIXED at promotion: budget.ui.yaml is at
schema/WORKFLOW/ (was cited schema/lab/); lab-sync-event.lint.yaml is at schema/integration/.
Coder must re-base onto trunk at claim time (GC-2 merges ahead; line numbers in trunk files drift).

## Goal (one sentence)

Model the ChemStation run-table as two new declarative record kinds — `instrument-sequence` +
`instrument-sequence-entry` — whose entries link study RUN records, services/sample records, a
gc-method revision, a (future) GC-4 acquisition package, and produced analysis-runs, with lint
rejecting dangling refs and invalid quantity/unit combos, and with the existing analysis-run
freeze mechanism guaranteeing that editing a sequence never rewrites submitted-analysis provenance.

## Status legend
- **[F]** = confirmed fact, cite read first-hand (dump tool msg or this-run spot-check).
- **[I]** = inference / design decision derived from confirmed facts, flagged for reviewer.

## Binding inputs (never re-litigated)
- WAVE gc-analysis-cycle header + GC-D1..D6: task-list.md:7458-7506
- GC-3 task block: task-list.md:7590-7613
- GC-2 canonical spec (gc-method shape GC-3 refs): .hermes/plans/2026-10-26_GC-2-gc-method-records.md (+ CAS-anchor correction 23a8b071)
- GC-1 spike report (SAMPLE.XML run-table semantics): .hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md

## Files IN scope
- schema/lab/instrument-sequence.schema.yaml / .lint.yaml / .ui.yaml  [NEW]
- schema/lab/instrument-sequence-entry.schema.yaml / .lint.yaml / .ui.yaml  [NEW]
- server/src/schema/InstrumentSequenceSchemas.test.ts  [NEW test]
- server/src/lint/InstrumentSequenceRules.test.ts  [NEW test]
- schema/registry/registry-kinds.registry.yaml — add `- kind: instrument-sequence` and
  `- kind: instrument-sequence-entry` (DECISION, flagged: GC-2 precedent — the promoted GC-2
  spec §E adds `- kind: gc-method` to this same coverage list for the same minimal
  registry-ops lifecycle treatment, GC-2 spec lines 144-146, spot-checked). If the
  orchestrator rejects lifecycle coverage for these kinds, drop this line and say so in
  the report; do NOT declare a lifecycleId const in the schema (GC-2 spec :108 stop boundary).

## Files EXPLICITLY OUT of scope
- schema/lab/gc-method.* (GC-2's deliverable; in flight, NOT yet on trunk [F])
- schema/knowledge/analysis-revision|analysis-run|analysis-output-artifact (read-only cites)
- server/src/sequences/**, app/src/sequences/**, schema/bio/sequence*, config/sequence-analysis/** — DNA sequences; naming hazard, zero touches
- GC-4 acquisition-package kind + NAS registration service
- Any UI page/component work in app/ (triplet .ui.yaml data ONLY)
- schema/core/datatypes/quantity.schema.yaml (reuse as-is)
- schema/registry/registry-kinds.registry.yaml lifecycle coverage (see §Open questions)

## Acceptance criteria (verbatim, task-list.md:7609-7612)
> Schema/lint tests: valid sequence passes; dangling sample/method refs + bad units rejected;
> a submitted analysis keeps frozen refs after sequence edit. UI triplet renders field names
> in full (no truncated headers).

## Oriented facts (all cites read first-hand — recon dump l1t0145 or this-run spot-check)

- **[F] Triplet convention** = `schema/lab/<kind>.schema.yaml` + `.lint.yaml` + `.ui.yaml`;
  schema pattern = JSON Schema 2020-12, `unevaluatedProperties: false`,
  `allOf: [$ref ./common.schema.yaml#/$defs/FAIRCommon]`, `kind: const`, id `pattern`,
  refs via `./datatypes/ref.schema.yaml` (assay-definition.schema.yaml model; GC-2 spec
  oriented-facts 1; FAIRCommon at schema/core/common.schema.yaml `$defs.FAIRCommon`, dump msg 84).
- **[F] `instrument-sequence*` does NOT exist yet** — trunk grep for `instrument-sequence`
  over schema/ + server/ returns 0 non-hidden hits (spot-check; hidden hits are only
  lane handoffs). Confirmed greenfield.
- **[F] RUN kind**: `schema/studies/run.schema.yaml` — `kind: const "run"` (:21),
  `recordId` "Stable local identifier (e.g., RUN-000041)" (:23-25, NOTE: free string,
  NO `^RUN-` pattern constraint), `studyId` `^STU-` (:40-42), `projectIds` `^STU-` (:45),
  `executedBy` `^USR-` (:108-111). Run lint: `schema/studies/run.lint.yaml`
  (run-has-parent-link, any[exists studyId, nonEmpty projectIds], warning).
- **[F] services/sample kind**: `schema/services/sample.schema.yaml` — `kind: const "sample"` (:25),
  recordId `^SMP-[A-Za-z0-9][A-Za-z0-9_-]*$` (:30). Provenance-hierarchy root per its
  description (:4-10). Ref-to-sample precedent: `schema/services/report.schema.yaml:40-48`
  and `schema/services/request.schema.yaml:110-119` both host sample refs as
  `{ kind: record, type: const sample }` allOf ref.schema.yaml — copy this shape verbatim.
- **[F] ref datatype**: `schema/core/datatypes/ref.schema.yaml` — `kind: enum [record, ontology]`
  (:12-14), optional `revisionRef` pinning an immutable `^REV-[A-F0-9]+$` revision (:29-37),
  record-specific `type` (:52). NOTE: leaf schemas ref it as `./datatypes/ref.schema.yaml`;
  the file lives at `schema/core/datatypes/` and the loader resolves by registry — follow
  the existing lab files verbatim (GC-2 spec oriented-facts 1; schema/lab/datatypes/ does
  NOT exist, dump msg 24).
- **[F] gc-method (GC-2, IN FLIGHT, not yet on trunk [F — spot-check: no schema/lab/gc-method*
  on disk])**: per the promoted GC-2 spec §A (`.hermes/plans/2026-10-26_GC-2-gc-method-records.md:74-77`):
  kind `gc-method`, id pattern `^GCM-[A-Za-z0-9_-]+$`, `method_version` integer >= 1,
  record-level versioning. GC-3 cites are "per GC-2 spec" for anything inside gc-method.
- **[F] Lint DSL ops**: `server/src/lint/types.ts:21-39` — `exists, nonEmpty, regex, compare,
  equals, in, all, any, not, has_material_class, state_is, context_contains,
  lineage_includes, time_within, mention_kind_matches, allIn, everyItem, noneIn`.
- **[F] HARD LintEngine limitation**: `server/src/lint/LintEngine.ts:143-145` —
  `if (scope !== 'record') { ... skipped: true }` — ONLY record scope executes; a
  collection/repo rule is silently skipped. Every GC-3 lint rule MUST be record-scoped
  (operating on one payload, with `[*]` projections within it — PathResolver supports
  wildcards, dump msg 129 eval + lint-v1.schema.yaml:174-177).
- **[F] Real ref-integrity lint precedent (intra-record)**: `schema/workflow/protocol.lint.yaml:19-40+`
  rule `step-role-closure` — per-branch `any[ not(nonEmpty refs), allIn(refs, declared) ]`:
  vacuous pass when no refs, else every ref must resolve to a declared in-record collection.
  This is the ONLY thing lint can express for refs: closure WITHIN one payload. It cannot
  query the store.
- **[F] Cross-record ref enforcement precedents (server code, not lint YAML)**:
  (a) shape/kind rejection at AJV validation — `schema/services/report.schema.yaml:44-48`
  style `type: const` + `server/src/schema/AcquisitionContextContract.test.ts:119-195`
  proves wrong-kind refs are REJECTED by schema alone;
  (b) existence at resolution time — `server/src/drafts/analysisCompile.ts:232-241`
  `bindRecordId` returns `UNKNOWN_RECORD` naming the id ("an invented record id is never
  projected");
  (c) new-ref-to-terminal-target guard — `server/src/api/handlers/RecordHandlers.ts:220-277`
  `collectRecordRefIds` generic walk + archive guard (historical refs stay legal, only
  NEWLY-changed refs to terminal covered kinds fire).
- **[F] Runs freeze refs — the mechanism GC-3 must not fight**:
  `schema/knowledge/analysis-run.schema.yaml:4-9` "A run is immutable once created —
  inputs + parameters are frozen at submit time"; `frozenExecutionRef`/`frozenRevisionRef`
  fields (:55-59). Server: `server/src/analysis/analysisRunner.ts:432-435` — before
  executing, re-reads the frozen snapshot via RecordRevisionService and compares every
  field in `frozenRunFields` (declared in `config/sequence-analysis/capabilities.yaml`:
  `[revisionRef, frozenRevisionRef, inputs, parameters]`); any drift throws
  `FROZEN_INPUT_CHANGED` (409) — "Create a new run." Also `analysisRunner.ts:438`:
  a non-queued frozen run can't restart. `RecordRevisionService.freezeProtocol`
  (`server/src/revisions/RecordRevisionService.ts:83`) is the freeze primitive.
  **Implication for GC-3**: a submitted analysis-run's payload is self-contained; a
  sequence edit that mutates an entry ref NEVER touches the analysis-run record, and if
  anything tried to, the runner's contentHash comparison refuses. GC-3 adds ZERO write
  paths into analysis-run/analysis-revision records.
- **[F] ChemStation run-table ground truth** (GC-1 spike report):
  SAMPLE.XML (:15, UTF-16LE): `<Sample><Name>RES35077-4</Name><Amount>0</Amount>
  <Multiplier>1</Multiplier><Dilution>1</Dilution><ISTD Num="1">0</ISTD></Sample>` —
  read in full; SAMPLE.MAC.bak (:16) confirms `SAMPLECALISTD 1,0 / SAMPLECALAMT 0,1,1`;
  RUN.LOG (:14) "Instrument running sample Vial 101 (front)" — vial position;
  ACQ.M/ACQ.TXT (:18) "Data File: Z:\GC-FID\MACHINE1\RES35077-4.D" +
  "Acq. Method: AOAC_FAME_NO_INJECTION.M" — data-file name + acquisition-method name.
- **[F] Quantity datatype for unit-safe fields**: `schema/core/datatypes/quantity.schema.yaml`
  — value+unit+dimension with JSON-Schema if/then unit-per-dimension enforcement
  ("dimension count with unit 'uL' FAILS validation", :6-11);
  `quantity-ratio.schema.yaml` for quantity-per-quantity. Wrong combos are rejected by
  SCHEMA, not lint — that is where "bad units rejected" lives.
- **[F] UI triplet conventions**: `schema/lab/controlled-document.ui.yaml` —
  `display.titleField/subtitleField`, `editor.blocks` with explicit `slots:[...]`,
  `editor.slots` with `{id, path, label, widget}`; `schema/workflow/budget.ui.yaml:20`
  `kind: "repeater"` with `path: "$.lines"` (repeaters keep the path prefix — EDITOR-1).
- **[F] Test harness pattern**: `server/src/schema/ControlledDocumentSchemas.test.ts:14-19,
  47-54, 170-177` — loadAllSchemas → createValidator, loadAllLintSpecs → createLintEngine
  against the REAL schema/ dir; and for store-backed validation the full wire-up in
  `server/src/revisions/DraftCopyDerivedRefValidation.test.ts:1-30` (loadAllSchemas →
  SchemaRegistry → AjvValidator → createRecordStore, no skipValidation).
- **[F] Scripts**: server/package.json — `test:run` = `vitest run`, `typecheck` =
  `tsc --noEmit` (:12-15).
- **[F] Naming hazard**: `server/src/sequences/` + `config/sequence-analysis/` are the DNA
  virtual-PCR/MAFFT/BLAST subsystem (dump msg 53, 82). Record kinds are
  `instrument-sequence` / `instrument-sequence-entry` EVERYWHERE — no file, symbol, or
  branch may reuse the bare word `sequence`.

## Design decisions (inferences derived from the facts above)

- **[I] Two kinds, header + entries as separate records** (task-list names both triplets):
  `instrument-sequence` = the run-sheet header (study/run link, instrument, operator,
  sequence-level notes, ordered `entryRefs`); `instrument-sequence-entry` = one injection
  row. Each entry is separately lintable and GC-4 can attach one acquisition package per
  entry without rewriting the sheet.
- **[I] The entry is the ref-dense record; the header carries only intra-record closure.**
  All cross-record targets (RUN, sample, gc-method, GC-4 package, analysis-runs) hang on
  the ENTRY, constrained by `type: const` ref shapes (schema-rejected at validation,
  precedent above). Existence-of-target ("dangling" proper) cannot live in lint YAML
  [F LintEngine.ts:143]; see §Lint rule R5 for the enforcement plan + open question #1.
## Triplet layout — `instrument-sequence` (schema/lab/instrument-sequence.schema.yaml)

kind: const `instrument-sequence`; id pattern `^ISEQ-[A-Za-z0-9][A-Za-z0-9_-]*$`
([I] pattern choice mirrors calibration-record `^CAL-...`,
schema/lab/calibration-record.schema.yaml:25 [F]; ISEQ is also the established lane-1
prefix for this work — branches ISEQ-1/ISEQ-2 exist). FAIRCommon mixin,
`unevaluatedProperties: false`. Required: kind, id, title, entryRefs.

Fields (all [I] from run-table semantics unless marked [F]):
- `title` (FAIRCommon), `description`.
- `studyRef` / `runRef` — record refs, `type: const run` for runRef
  (RUN header link; run.schema.yaml recordId is unconstrained [F], so the lint id-check
  cannot pattern-guess RUN ids — see reviewer bait).
- `operatorRef` — record ref (run.schema.yaml uses `executedBy ^USR-` [F]; mirror with
  `type: const user` only if a user kind ref precedent exists — scout question Q2).
- `instrumentRef` — record ref `type: const equipment` (INSTR-COLLAPSE ruling retired the
  `instrument` kind; equipment is the asset [F — AcquisitionContextContract.test.ts:119
  "measurement.equipmentRef accepts an equipment-typed record ref", :129 rejects
  instrument-typed]).
- `entries` — inline array of entry objects OR `entryRefs` array of entry record refs.
  DECISION: inline `entries[]` is NOT chosen; entries are separate records
  (`instrument-sequence-entry`) referenced from the header via
  `entryRefs: array of {kind: record, type: const instrument-sequence-entry}` — GC-4,
  UI, and per-entry lint all want entry records addressable by id. The header's lint then
  does intra-record closure on entryRefs (uniqueItems, nonEmpty).

## Triplet layout — `instrument-sequence-entry` (schema/lab/instrument-sequence-entry.schema.yaml)

kind: const `instrument-sequence-entry`; id pattern `^ISEN-[A-Za-z0-9][A-Za-z0-9_-]*$` [I].
Required: kind, id, position. `unevaluatedProperties: false`, FAIRCommon.
Fields = the run-table declarative data, next section.
## Run-table fields as declarative data (fields of instrument-sequence-entry)

Observed facts [F] come from the GC-1 spike report's first-hand reads (report lines 14-18:
RUN.LOG, SAMPLE.XML, SAMPLE.MAC.bak, ACQ.M/ACQ.TXT). Everything is declarative data on the
entry record; NOTHING is parsed at runtime by GC-3 (no vendor parser here).

| Field | Type | Observed basis [F] | Interpretation |
|---|---|---|---|
| `position` | object `{ vial: string, tray?: string }` or plain string | RUN.LOG "Vial 101 (front)" (report:14) | DECISION [I]: `{ vial: "^\\d+$"`-ish string + optional slot label }; keep it a string vial id — do not model tray geometry (labware-geometry kind exists but is out of scope). |
| `dateTime` | `acquisitionStartedAt` string (date-time) + `dateTimeRaw` string preserved verbatim | RUN.LOG "Method started 10:08:18 10/23/26" | vendor ambiguity = timezone/format loss → keep the raw string next to the normalized one (never invent a zone). |
| `dataFileName` | string | ACQ.TXT "Data File: Z:\GC-FID\MACHINE1\RES35077-4.D" (report:18) | vendor absolute path preserved verbatim; the NAS-side pointer is GC-4's job, this is just the observed name. |
| `sampleName` | string | SAMPLE.XML `<Name>RES35077-4</Name>` | free-text run-table label; the SAMPLE ref below is the machine link. |
| `amount` | `$ref ./datatypes/quantity.schema.yaml` | SAMPLE.XML `<Amount>0</Amount>` | dimensioned per quantity datatype — bad unit combos are schema-rejected [F quantity.schema.yaml:6-11]. Unit is NOT inferred from the vendor XML (bare number, unit unknown): when unit is unknown the field stays `amountUninterpreted: number` [I — two fields, never fake a unit]. |
| `multiplier` | number (positive) | SAMPLE.XML `<Multiplier>1</Multiplier>`, MAC `SAMPLECALAMT 0,1,1` | plain number — vendor semantics (dilution-factor multiplier) documented in the description, no unit. |
| `dilution` | number (positive) | SAMPLE.XML `<Dilution>1</Dilution>` | same honesty rule. |
| `istdAmount` | quantity OR `istdAmountUninterpreted: number` + `istdNum: integer` | SAMPLE.XML `<ISTD Num="1">0</ISTD>`, MAC `SAMPLECALISTD 1,0` | ISTD semantics (which internal standard, units) belong to the gc-method record (GC-2 spec's ISTD section, per GC-2 spec :74+); the entry only carries the per-run number observed. |
| `manualInjection` | boolean | task-list field list ("manual flag"); run-table column exists in ChemStation UI screenshots per wave header :7465 | [I] default false. |
| `vendorMethodLabel` | string | ACQ.TXT "Acq. Method: AOAC_FAME_NO_INJECTION.M" (report:18) | the observed vendor method NAME (string), separate from the gc-method record ref below — imported evidence, not a claim of resolution. |
| `uninterpreted` | object `{ key: string }` (open map, string values) | run-table columns CL has not verified semantics for (e.g. "ECM" named in task-list :7599) | VENDOR-AMBIGUOUS FIELDS LIVE HERE VERBATIM, stringly, with no semantics claimed. NEVER invent meanings (GC-1 unknown-is-unknown rule; GC-2 spec's imported-vs-unknown stance). ECM goes here, not into a fake field. |

Anti-invention rule for the coder: if a field's unit or meaning is not directly evidenced in
the GC-1 report or a Brad decision, it is `*Uninterpreted` or sits in `uninterpreted{}`.
Reviewer bait names the tempting inventions.

## Ref targets (fields of instrument-sequence-entry)

All refs use `allOf: [./datatypes/ref.schema.yaml, {type-object pinning kind: record +
type: const <target>}]` — the exact host pattern of report.schema.yaml:40-48 /
request.schema.yaml:110-119 [F].

- `runRef` — `{ kind: record, type: const run }` — the study RUN record this injection
  belongs to (schema/studies/run.schema.yaml, kind const "run" :21 [F]).
- `sampleRef` — `{ kind: record, type: const sample }` — schema/services/sample.schema.yaml
  [F]; material provenance hierarchy stays intact because CL never copies sample fields —
  only the ref + the observed free-text sampleName/dataFile label are carried.
- `gcMethodRef` — `{ kind: record, type: const gc-method }` with `revisionRef` OPTIONAL
  pin (ref.schema.yaml revisionRef `^REV-[A-F0-9]+$` [F]) — entries REFERENCE a gc-method,
  they do not copy its fields (brief; shape per GC-2 spec §A: kind gc-method, id
  `^GCM-[A-Za-z0-9_-]+$` [F-per-GC-2-spec]). GC-2 is in flight; if gc-method is not on
  trunk when GC-3 is claimed, this is a hard STOP (see stop boundaries), not a local
  re-declaration.
- `acquisitionPackageRef` — DECLARED-EXTENSION POINT, forward-compatible [I]: declare it in
  the schema NOW as `{ kind: record, type: const acquisition-package }` ONLY IF the
  `type` field on a ref is free-string (it is, ref.schema.yaml:52-55 [F] — type is a plain
  string, not an enum), so the ref validates today against no existing kind and GC-4's
  triplet lands the target later. FLAG: the dangling-existence lint rule (R5) must SKIP
  acquisitionPackageRef until GC-4 lands (allowlist of checked kinds lives in the test
  fixture data, not in code). Alternative (hold the field out entirely) rejected: editing
  schema later churns every entry; an open `type` ref is exactly the trunk's forward-pin
  mechanism.
- `analysisRunRefs` — array of `{ kind: record, type: const analysis-run }` — produced
  analysis-runs (schema/knowledge/analysis-run.schema.yaml kind const :18 [F]). These are
  the links the freeze guarantee talks about: the analysis-run points back at ITS frozen
  inputs; this array is informational provenance from the run-sheet side and is append-only
  by convention (lint cannot enforce append-only [F — no history in record scope]; state it
  as a documented convention, reviewer bait names the temptation to fake a rule).
## Lint rules (existing-DSL ops only) — schema/lab/instrument-sequence.lint.yaml + instrument-sequence-entry.lint.yaml

HARD CONSTRAINT [F]: `server/src/lint/LintEngine.ts:143-145` skips any rule whose scope is
not `record`. ALL rules below are `scope: record`, operating on one payload with `[*]`
projections. The real-DSL citation for ref-integrity style is
`schema/workflow/protocol.lint.yaml:19` `step-role-closure`
(`any[ not(nonEmpty refs), allIn(refs, declared-collection) ]`) — but that pattern only
closes refs AGAINST AN IN-RECORD COLLECTION; the lint engine has no store access
[LintEngine.ts:143 + evaluateRule reads only `ctx.data`, dump msgs 100/94]. Therefore:

instrument-sequence.lint.yaml:
- R1 `iseq-entry-refs-declared-unique` — warning: `nonEmpty $.entryRefs` (an empty
  run-sheet is suspicious, not fatal). Ops: nonEmpty.
- R2 `iseq-run-link-present` — warning, mirrors run.lint.yaml's spirit
  (schema/studies/run.lint.yaml:5-18 [F]): `any[ exists $.runRef, exists $.studyRef ]` —
  a sequence bound to nothing has no home in the study graph. Ops: any/exists.

instrument-sequence-entry.lint.yaml:
- R3 `isen-ref-shape-closed` — the step-role-closure analogue for the ONE closure lint can
  actually do here: `all[ any[not(nonEmpty $.analysisRunRefs), ... ], ... ]` is NOT needed
  (there is no in-record collection to close against). Keep this spec HONEST: lint does
  SHAPE-adjacent checks only — `equals`/`regex` on the ref id prefix:
  `regex` `$.sampleRef.id` pattern `^SMP-` (pattern is the sample kind's own id pattern,
  schema/services/sample.schema.yaml:30 [F]); `regex` `$.gcMethodRef.id` `^GCM-`
  (per GC-2 spec §A [F-per-spec]). These catch the most common dangling-by-typo class
  WITHOUT store access. Ops: regex (+ `any[not(nonEmpty)]` guard so absent refs pass
  vacuously, exactly step-role-closure's branch shape).
- R4 `isen-multiplier-dilution-sane` — warning: multiplier and dilution `compare` > 0
  when present (a zero dilution factor is almost certainly a data-entry error;
  `when: not(equals ...)` guard). Ops: compare/equals/not.
- R5 DO NOT write a store-resolution lint rule — it is IMPOSSIBLE in this DSL [F].
  "Dangling sample/method refs rejected" is discharged at TWO real layers instead:
  (a) WRONG-KIND refs rejected by AJV via `type: const` (precedent proven by
  AcquisitionContextContract.test.ts:119-195 [F]);
  (b) NONEXISTENT-target refs rejected by the record-store validation path at write time —
  scout question Q1 asks whether ANY existing server write path resolves every record-ref
  on create/update (RecordHandlers.ts archive guard WALKS refs but only for covered
  kinds, :220-277 [F]); if none does, the RED test asserts AJV-shape rejection + the
  orchestrator decides whether GC-3 adds a resolution gate or defers to GC-4's resolver.
  The coder must NOT fake (b) with a lint rule; reviewer bait names this exact trap.

BAD UNITS: enforced by the quantity datatype itself (if/then per-dimension unit control,
quantity.schema.yaml:6-11 [F]) — a test asserts `{value: 5, unit: 'uL', dimension: 'count'}`
REJECTS, and an entry carrying `amountUninterpreted` passes. No lint rule involved; do not
invent one (the GC-2 spec :140-142 says the same: don't fake a rule the DSL can't back).
## Runs-freeze-refs guarantee — what GC-3 must NOT fight

Mechanism already on trunk [F, all cites read]:
1. `schema/knowledge/analysis-run.schema.yaml:4-9` — "A run is immutable once created —
   inputs + parameters are frozen at submit time." `frozenExecutionRef` +
   `frozenRevisionRef` ref fields (:55-59).
2. `server/src/analysis/analysisRunner.ts:432-435` — at execution the runner re-reads the
   frozen snapshot (`RecordRevisionService.read(frozenExecutionRef)`) and compares each
   field listed in `frozenRunFields` (`config/sequence-analysis/capabilities.yaml`:
   `[revisionRef, frozenRevisionRef, inputs, parameters]`); hash drift throws
   `FROZEN_INPUT_CHANGED` 409 "Create a new run." Line :438 blocks restarting a started
   frozen run.
3. `RecordRevisionService.freezeProtocol` (`server/src/revisions/RecordRevisionService.ts:83`)
   — the freeze primitive the revision routes use.
4. Generic ref-walk guard on writes: `server/src/api/handlers/RecordHandlers.ts:220-277` —
   refs already present are historical and stay legal; only NEW refs to terminal covered
   targets fire. Editing a sequence's old refs therefore cannot be blocked *as history*,
   and equally cannot rewrite anyone's snapshot.

GC-3's contract [I from the above]:
- The freeze boundary lives ENTIRELY inside analysis-run's own payload — it snapshots
  revisionRef/inputs/parameters BY VALUE at freeze time. An instrument-sequence-entry edit
  changes ONLY the entry record. There is no code path by which a sequence edit reaches a
  submitted analysis-run. **GC-3 therefore adds: (a) no writes to analysis-run /
  analysis-revision records, (b) no server code at all (schema+lint+ui data + tests),
  (c) no back-rename or id-reuse of an entry that any analysisRunRefs names — ids are
  stable by FAIRCommon convention.**
- The RED test ("a submitted analysis keeps frozen refs after sequence edit",
  task-list :7611) is a store-level test: create entry + analysis-run fixture with
  frozenExecutionRef (harness: DraftCopyDerivedRefValidation.test.ts full wire-up [F]),
  freeze, UPDATE the entry (change sampleRef), re-read the analysis-run: payload
  byte-identical; and if the fixture mutated the frozen snapshot itself,
  `AnalysisRunner.execute` throws FROZEN_INPUT_CHANGED (assert the error code, reusing
  the analysisRunner.ts:432-435 path).

## RED-first test plan

Write tests FIRST (red), then the YAMLs (green). Files + cases:

1. `server/src/schema/InstrumentSequenceSchemas.test.ts` — harness copied from
   ControlledDocumentSchemas.test.ts:14-19,47-54,170-177 [F] (loadAllSchemas →
   createValidator; loadAllLintSpecs → createLintEngine over the real schema/ dir).
   - valid instrument-sequence + entry fixtures PASS validation (fixture data from the
     real observed values: vial 101, RES35077-4, AOAC_FAME_NO_INJECTION.M,
     multiplier 1, dilution 1, ISTD Num 1 amount 0 [F GC-1 report:15-18]).
   - wrong-kind ref REJECTED: sampleRef with `type: run` (AJV const, shape per
     report.schema.yaml:40-48 host [F]).
   - bad unit combo REJECTED: entry.amount `{value:5,unit:'uL',dimension:'count'}`
     (quantity.schema.yaml if/then [F]).
   - unknown top-level key REJECTED (`unevaluatedProperties: false` — Wave2QuantitySchema
     .test.ts:241 analogue [F]).
   - `uninterpreted: { ECM: "..." }` PASSES as a string map (the honesty field).
2. `server/src/lint/InstrumentSequenceRules.test.ts` — engine-driven lint over the two new
   specs: R1-R4 fire/clean per fixture; a `sampleRef.id: 'SMP-MISSING'`-shaped id passes
   R3 (shape rule, existence is NOT lint's job — assert THAT, honesty of the boundary);
   a `sampleRef.id: 'RUN-000041'`-shaped id FAILS R3 regex.
3. Freeze test (in whichever file the orchestrator prefers, name it
   `InstrumentSequenceFreeze.test.ts` or fold into 1): the sequence-edit-keeps-frozen-refs
   scenario in §Runs-freeze-refs above, real store, no skipValidation [F harness cite].
4. Registry-load smoke is implicit: loadAllSchemas in every harness above already proves
   SchemaRegistry compiles the new files; add an assertion that both new kinds resolve by
   `$id` (SchemaRegistry.test.ts:68-style [F dump msg 37]).
5. UI: assert `loadAllUISpecs` loads both .ui.yaml and every editor block names slots that
   exist (the controlled-document pattern is loader-validated, ui-v1.schema.yaml:100 [F
   dump msg 30]); assert every slot label is a full word string (no-truncated-headers
   criterion is verified by explicit label strings in the ui files — the criterion is
   about the ui.yaml data, not a rendered page).
## UI triplet (data only — no app/ page work)

`schema/lab/instrument-sequence.ui.yaml` + `schema/lab/instrument-sequence-entry.ui.yaml`,
pattern = controlled-document.ui.yaml [F]: `display.titleField: $.title`,
`editor.blocks` sections with EXPLICIT `slots: [...]` claims (EDITOR-1 rule: the generic
projection renders only blocks with claimed slots), `editor.slots` entries
`{id, path, label, widget}` — widget `ref` for every ref field (precedent:
schema/bio/oligo-spec.ui.yaml:16 `{path: $.sequenceRef, widget: ref}` [F dump msg 67]),
`readonly` for id. The entries list on the header uses `kind: "repeater"` with
`path: "$.entryRefs"` (budget.ui.yaml:20 precedent [F], repeaters keep the path prefix).
LABELS ARE FULL WORDS — "Vial Position", "Data File Name", "Sample Name", "Method
Reference", "Manual Injection", "Internal Standard Amount", "Multiplier", "Dilution",
"Uninterpreted Vendor Fields" — the verified-by clause "renders field names in full (no
truncated headers)" is discharged by these literal strings; NO abbreviations anywhere in
.ui.yaml.

## First targeted check (the one command that proves the approach early)

After writing ONLY the two .schema.yaml files and the schemas test (step 1 of the RED plan,
before lint/ui exist):

    cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/schema/InstrumentSequenceSchemas.test.ts -t 'valid'

Expected first run: RED with a clean loader error naming the missing schema (proves the
harness sees schema/ and the $id wiring is the only gap) — NOT a zod/compile stack-trace
wall. If instead you see a $ref resolution failure for `./datatypes/ref.schema.yaml`, the
ref-path convention is wrong — re-read how schema/lab/calibration-record.schema.yaml refs
datatypes and copy THAT verbatim.

## Verification commands (complete)

    cd /mnt/vast/home/brad/git/cl-integration-1/server
    npx vitest run src/schema/InstrumentSequenceSchemas.test.ts src/lint/InstrumentSequenceRules.test.ts
    # expected: all PASS (after green), N tests, 0 failures
    npx vitest run            # full suite green, nothing pinned-around
    npm run typecheck         # tsc --noEmit, exit 0, zero new errors
    # whole-repo (schema+server both): npm run test:run && npm run typecheck per root package.json if present
    git -c core.fileMode=false status --porcelain   # ONLY the spec-listed files touched; zero in app/, server/src/sequences/, schema/bio/, config/sequence-analysis/

## Worker contract

- Worktree branch off the lane trunk: `cl/lane1-gc-3-<ticket>` from `cl/integration-1` at
  the CURRENT trunk head at claim time (trunk moved past 23155f04 when GC-2 merged —
  re-base, do not assume this draft's line numbers for trunk files).
- ALWAYS `git -c core.fileMode=false` for every git command; trunk worktree
  /mnt/vast/home/brad/git/cl-integration-1 is READ ONLY — commit nothing there.
- Deliverable paths: exactly §Files IN scope. Report path pattern:
  `.hermes/plans/handoffs/worker-reports/gc-3-report-<ticket>.md` (lane convention, dump
  msg 54 shows the worker-reports dir).
- End-marker for the launcher: `GC3 DONE <sha>`.
- Diff discipline: `git -c core.fileMode=false diff --stat` must show ONLY in-scope files;
  any hit under app/, schema/bio/, server/src/sequences/, config/sequence-analysis/,
  schema/knowledge/ = stop, report, do not proceed.
- NO lifecycle/governance edits beyond the single flagged registry-kinds.registry.yaml
  coverage lines (2 lines max); NO readout-definition edits (GC-2's turf).

## Reviewer bait (likely edge errors for THIS item — pre-empt them)

1. **Fake store-resolution lint rule.** The DSL cannot open the store [F LintEngine.ts:143];
   any rule claiming "dangling ref rejected" in YAML is either a tautology or a lie. The
   honest split is §Lint R5's (a)/(b). A reviewer WILL probe: "which rule rejects
   SMP-DOESNOTEXIST?" — the answer must be "shape+prefix lint + schema type-const;
   existence is resolution-time (bindRecordId precedent) — documented boundary", not a
   hand-wave.
2. **Invented vendor semantics.** Temptations: ECM → "event count per minute" (unverified —
   goes in `uninterpreted`), Amount → mg (unit unknown — `amountUninterpreted`),
   Dilution 0 vs 1 semantics, timezone on dateTime (keep raw). Every invention is a
   GC-1 unknown-is-unknown violation.
3. **`sequences` name collision.** A coder reaching for `sequence.schema.yaml`, `SequenceService`,
   `sequenceConfig`, or `SEQUENCE_SCHEMA` is in DNA-land [F dump msgs 53/82]. Even the ui
   file's repeater `path` and slot ids must say `entryRefs`/`entries`, never `sequences`.
4. **YAML-reload trap**: lint `schemaId` must be the EXACT `$id` string of the schema file
   (`https://computable-lab.com/schema/computable-lab/instrument-sequence.schema.yaml`) —
   loadAllLintSpecs keys by schemaId; a mismatch = rules silently never attach (the
   schema/integration/lab-sync-event.lint.yaml:3 line is the model [F]). Restart/reload: new YAML under
   schema/ requires a server restart to pick up — tests load from disk directly, the
   live :3092 stack does not hot-reload.
5. **exactOptionalPropertyTypes sites** in any new test helper that builds entry fixtures
   conditionally (`...(cond ? { amount } : {})` shape, NOT `amount: undefined`); the repo's
   strict tsconfig bites here — mirror how ControlledDocumentSchemas.test.ts builds
   envelopes.
6. **Copied gc-method FIELDS** into the entry (brief forbids: entries REFERENCE, never
   copy). Presence of `timed_events`/`compound_assignments`-shaped keys on the entry
   schema = instant reject; `unevaluatedProperties: false` makes this structural, keep it.
7. **Required-vs-optional on refs**: runRef/sampleRef/gcMethodRef must be REQUIRED for real
   rows but a planned empty sequence must stay valid — resolve by: header optional refs,
   entry refs required EXCEPT allow a `planned: true` entry? DECISION [I]: entry refs
   runRef+sampleRef+gcMethodRef REQUIRED (a row with no sample is not a row); header
   refs optional (build-up state). Tests cover both empty-header-valid and
   missing-entry-ref-invalid.
8. **Ontology terms**: none needed for GC-3 (no compound chemistry here — that's GC-2's
   ontology work); do NOT mint CHEBI CURIEs on entries. If a reviewer asks for compound
   identity on rows: it lives on the gc-method's compound assignments, per GC-2 spec.

## Stop boundaries (hard stops — stop, write report, exit)

- gc-method kind NOT on trunk at claim time (GC-2 must merge first — deps: GC-2). Do not
  stub or duplicate a gc-method schema; STOP and report "GC-2 not landed".
- Any pressure to touch DNA-sequences code (app/src/sequences/, server/src/sequences/,
  schema/bio/sequence*, config/sequence-analysis/) — the ONLY sanctioned interaction with
  config/sequence-analysis/capabilities.yaml is READ (frozenRunFields cite); editing it is
  OUT of scope (GC-5 territory).
- No UI page/component work in app/ — .ui.yaml data files only.
- No GC-4 registration service, no acquisition-package schema, no NAS-touching code, no
  data-reference creation. The extension-point ref is data-only.
- No server CODE (handlers/services) beyond what a test needs to import; if the honest
  discharge of "dangling refs" needs a write-time resolution gate, that is a NEW service —
  STOP and report rather than build it.
- Governance/lifecycle rebase conflict in registry-kinds.registry.yaml (GC-2's line
  landing simultaneously) → stop per standing rule, orchestrator rebases.
- Standing rules of task-list.md apply (orchestrator-only done-marking, browser receipts
  N/A here — no UI surface shipped).

## YAML-restart reminder

Every schema/lint/ui YAML added here only takes effect on the live lane stack after a
server restart (lint specs + schemas load at boot: server.ts load sequence, dump msg 105).
The lane stack :3092/:5174 is live — target exact PIDs, never pkill patterns (wave header
:7484-7485). Tests need no restart (they read schema/ from disk); the browser/acceptance
pass does.

## Scout questions (for anything not locally verifiable — cl-scout, bounded, screening-only)

- Q1: Does any existing server write path (RecordStoreImpl.create/update or a route
  middleware) RESOLVE the target of every record-ref on create/update (existence check),
  or is target existence only checked at consumption time (bindRecordId,
  analysisCompile.ts:232)? — I read RecordHandlers.ts:220-277 (walks ids but only for
  archive-guard coverage); confirm nothing else validates ref targets repo-wide.
- Q2: What `type:` string do existing refs to user/person records use (`user` vs `person`)?
  run.schema.yaml:108-111 uses `executedBy: ^USR-` as a plain string, not a ref — I could
  not find a `{type: const user}` ref precedent in the dump.
- Q3: Is there an existing id-mint convention/registry for new record-id prefixes (where
  ISEQ-/ISEN- would be declared, if anywhere), or are id patterns declared per-schema only?
- Q4: Does SchemaRegistry enforce `$id` uniqueness/coverage anywhere that a NEW kind needs
  registration beyond dropping the file in schema/lab/ (i.e., is there a kinds manifest
  besides registry-kinds.registry.yaml lifecycle coverage)?

## Open questions for orchestrator (max 3, with what I checked)

1. **Lifecycle coverage for the two new kinds** — I propose adding both to
   registry-kinds.registry.yaml per the GC-2 §E precedent (GC-2 spec:144-146, spot-checked;
   coverage file at schema/registry/registry-kinds.registry.yaml:8-24 [F dump msg 57]).
   Alternative: leave uncovered (like `run`). Check needed: does anything in the editor
   flow require registry-ops state for schema-less generic forms? I could not find the
   generic-form rendering gate in the dump.
2. **Existence-of-ref enforcement placement (lint R5(b))** — Q1 scout decides whether a
   trunk write path already rejects dangling targets. If NONE does: options (a) ship GC-3
   with shape/kind/prefix checks only and a documented boundary (my default), (b) pull a
   resolution gate into GC-3 as a small service (scope growth), (c) defer to GC-4. I
   recommend (a) now, revisit at GC-4; verified lint cannot do it (LintEngine.ts:143) and
   the only resolution-time precedent is drafts-side (analysisCompile.ts:232-241).
3. **Entry refs vs inline entries** — I chose separate entry records + `entryRefs`
   ([I], §Triplet). If the orchestrator prefers inline `entries[]` (one record per sheet,
   simpler UI repeater), the lint/freeze story is unchanged but GC-4 attaches packages to
   sheet-level index — weaker addressing. Cheap to flip at review; costly after merge.


## Orchestrator resolutions (promotion, 2026-10-26)

1. LIFECYCLE COVERAGE: APPROVED — add both kinds to registry-kinds.registry.yaml per the GC-2 E
   precedent (minimal treatment; the schema declares the matching lifecycleId/state enums exactly
   as GC-2's gc-method does post-merge).
2. REF EXISTENCE (R5(b)): APPROVED option (a) — ship shape/kind/prefix checks only, documented
   boundary; resolution-time enforcement deferred to GC-4's resolver. No new service in GC-3.
   (Scout Q1 answered by orch inspection: no repo-wide write-path ref-existence gate exists —
   collectRecordRefIds serves only the archive guard.)
3. SEPARATE ENTRY RECORDS: APPROVED as drafted (entryRefs on the header; entry refs
   runRef+sampleRef+gcMethodRef required; header refs optional).
4. Scout Q2 (user ref type): declare NO `type: const user` pin for operatorRef unless a
   {type: const user} ref precedent is found in-tree at claim time; otherwise keep operatorRef as
   a plain record ref with an ^USR- id-pattern lint regex (run.schema.yaml executedBy ^USR- is the
   closest vocabulary). Do not invent the pin.
5. Scout Q3: id patterns are declared per-schema only (no central mint registry) — ISEQ-/ISEN-
   per-schema is correct.
