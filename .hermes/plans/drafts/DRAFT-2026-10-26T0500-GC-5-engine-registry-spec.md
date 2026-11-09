# DRAFT — GC-5 spec: Engine registry records + enforced engine provenance in analysis execution

Composer: cl-spec-composer, 2026-10-26T05:00 draft. STATUS: DRAFT — orchestrator review/promotion
required before dispatch. Canonical target path per task list: .hermes/plans/2026-10-27_GC-5-engine-registry.md.

## Goal (one sentence)

Make the analysis engine a declared registry record (schema/knowledge/analysis-engine triplet) that an
analysis-revision pins and the AnalysisRunner resolves, probes, dispatches, and records — so the ACTUAL
engine + interpreter + package versions become machine-readable execution provenance, and any absent /
version-mismatched / capability-unsupported engine is a NAMED declared failure with NO silent substitution.

## Authority (read in this order; scope is theirs, not mine)

1. Task block GC-5, /home/brad/.hermes/cl/lanes/1/task-list.md:7716-7739 — description + verified-by are binding.
2. Wave intake: ~/.hermes/specs/intake/2026-10-25_gc-chemstation-analysis-cycle/intake-packet.md — GC-D3
   ruling C: "the library/engine actually used becomes part of the EVIDENCE bundle (provenance) … declared
   engine registry (data), revision pins engine" + wave header rule GC-D3 (task-list.md:7473-7475):
   "data-declared engine registry … No silent fallback."
3. Shipped reality: trunk cl/integration-1 @ 7f9288d3 (contains merged GC-2 c59890af; GC-1 promoted report
   .hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md).
4. Recent handoffs (.hermes/plans/handoffs/ 79th-83rd) — coverage-pin fence, rendering rule, OQ folds.

## Verified anchors [F] — every line opened first-hand against trunk cl/integration-1 @ 7f9288d3

- [F1] server/src/analysis/analysisRunner.ts:27 — `const DEFAULT_PYTHON = '/usr/bin/python3'` (the hardcoded
  interpreter GC-5 replaces with declared resolution). :94-98 constructor `private readonly python =
  DEFAULT_PYTHON` (already injectable — existing tests use this channel; keep it). :193 `spawn(this.python, …)`.
- [F2] analysisRunner.ts:32-53 `analysisSdkDir()` — env-first resolution precedent: `CLA_ANALYSIS_SDK_DIR`
  override at :33. GC-1's `CLA_ANALYSIS_PYTHON` mirrors this pattern.
- [F3] analysisRunner.ts:107-179 `provisionInputs` — streams provider bytes to temp files (:166-172); it does
  NOT re-hash against the data-reference contentHash. This is the execute-time drift window the GC-4 spec
  explicitly assigned to GC-5 (.hermes/plans/2026-10-26_GC-4-nas-package-registration.md:586-591; 83rd handoff
  OQ1 fold "provisionInputs declined=GC-5").
- [F4] analysisRunner.ts:452-460 — TODAY's dispatch point: `revPayload.sequenceMethod ? executeSequenceMethod(...)
  : this.runPython(...)`. Two-way hardcoded branch. Registry-data dispatch EXTENDS this site; it does not
  replace sequence dispatch.
- [F5] analysisRunner.ts:432-436 — frozen-execution model: `frozenExecutionRef` snapshot fields re-checked via
  `(await sequenceConfig('capabilities')).frozenRunFields` → `FROZEN_INPUT_CHANGED` 409.
  config/sequence-analysis/capabilities.yaml `frozenRunFields: [revisionRef, frozenRevisionRef, inputs,
  parameters]` — this file belongs to the DNA/sequence lane; GC-5 does NOT edit it (bait #5, below).
- [F6] analysisRunner.ts:437-438 — idempotent-success early-return (`status==='succeeded' && outputManifest`
  returns the STORED manifest) and `RUN_ALREADY_STARTED`. "Old runs unchanged" rides this: provenance is
  written once at completion, never re-probed.
- [F7] analysisRunner.ts:443-445 — revision payload resolved from `frozenRevisionRef` REV- snapshot when
  present (else live record head); `entryScript` required. Anything the revision declares (incl. the NEW
  engineRef) is automatically frozen by the existing snapshot mechanism — zero new framework.
- [F8] analysisRunner.ts:476-481 — the completion write: `persistedManifest` built from stored artifacts, then
  `store.update({ status:'succeeded', completedAt, outputManifest, outputArtifactRefs })`. The run-record
  provenance block lands in THIS payload write (:480).
- [F9] schema/knowledge/analysis-revision.schema.yaml — 92 lines; `sequenceMethod` (:39-47, op enum
  virtual-pcr|mafft|blastn), `entryScript`/`sdkVersion` (:48-54), `required: [kind,id,title,entryScript,sdkVersion]`
  (:93), `unevaluatedProperties: false` (:12). NO engineRef today. No analysis-revision.lint/.ui siblings.
- [F10] schema/knowledge/analysis-run.schema.yaml — frozen refs :55-59, `outputManifest` free object
  (:67-70), `required: [kind,id,title,revisionRef,status]` (:101). New typed provenance property goes in `properties`.
- [F11] server/src/analysis/analysisService.ts:48-57 `CreateRevisionInput`; :71-94 `createRevision` builds the
  payload FIELD-BY-FIELD (:76-87) — an engineRef present in the HTTP body is silently DROPPED unless the service
  forwards it. This is the revision-creation validation gate site. Error tokens: BAD_REQUEST (:73),
  CREATE_FAILED (:93). server/src/api/handlers/AnalysisHandlers.ts:31-42 passes request.body straight through;
  executeRun handler :169-185 constructs `new AnalysisRunner(ctx)` and returns `{error: err.code, message}`.
  Second construction site: server/src/sequences/SequenceService.ts:156.
- [F12] The EXISTING stub-adapter analogue the GC-1 decision shipped: server/src/sequences/sequenceRuntime.ts —
  `sequenceConfig('capabilities')` (:14-16) reads config/sequence-analysis/capabilities.yaml as the ENGINE MENU
  (data: engine ids, runtimes, versionArgs, version); `inspectEndpoint` (:63-77) declares-vs-actual version check
  (`Configured version … does not match executable`, :74) — the house precedent for declared-constraint vs
  ACTUAL probing; engine+version reported in manifest logs (:161). `virtual-pcr` runtime `builtin` is the shipped
  stub-class adapter (pure TS, real contract, computational not instrument-scientific — sequenceRuntime.ts:104-116).
  GC-5's second adapter is the analysis-side sibling of this pattern.
- [F13] Ref datatype: REAL path is schema/core/datatypes/ref.schema.yaml ($id …/datatypes/ref.schema.yaml;
  schema/knowledge/analysis-revision.schema.yaml:46 refs "./datatypes/ref.schema.yaml" — loader resolves by
  $id/base-path, NOT by relative dir; there is NO schema/knowledge/datatypes/ — do not create one).
  `revisionRef.id` pattern `^REV-[A-F0-9]+$`.
- [F14] GC-2 pin convention to mirror: schema/lab/gc-method.schema.yaml:25-27 id `pattern: "^GCM-[A-Za-z0-9_-]+$"`;
  the pinned-ref shape shipped in GC-3 (worktree wt/gc-3-lane1-l1t0310 schema/lab/instrument-sequence-entry.schema.yaml:84-94):
  `allOf: [$ref ref.schema.yaml] + properties { kind: {const: record}, type: {const: gc-method} }`.
- [F15] gc-method.schema.yaml:222-230 — `analysis.executable_binding.engine_ref` is a free-typed record ref
  (`$ref: ./datatypes/ref.schema.yaml`, required with declared_at). GC-5's analysis-engine kind is what that ref
  will resolve to (GC-2 shipped it type-free deliberately; GC-5 does NOT retro-pin it — see out-of-scope).
- [F16] Lifecycle/coverage fence (GC-2 commit 2c8b8864 pattern): schema/registry/registry-kinds.registry.yaml
  (`registryVersion: 1 / lifecycleId: registry-ops / defaultState: draft`, kinds list ends `- kind: gc-method` :29);
  the kind's schema must declare matching enums — gc-method.schema.yaml:275-283 `lifecycleId: enum [registry-ops]`,
  `state: enum [draft, active, archived]`. The fence's four pin sites (verified current):
  server/src/governance/registryOpsLifecycle.test.ts:53-61 COVERED_KINDS; server/src/registry/KindLifecycleRegistry.test.ts:44
  KINDS (+ `expect(registry.size).toBe(7)` :53); server/src/schema/InstrumentKindRetirement.test.ts:~160-171 covered list;
  server/src/scripts/migrateRecordLifecycles.test.ts:100-103 knownKinds. The coverage loader gates kinds on the
  schema-declared kind const — adding the registry row BEFORE the schema exists fails "Unknown kind" (2c8b8864
  commit message, first-hand read). Commit schema+row together (or row second).
- [F17] Rendering rule: app/src/editor/taptab/documentMapper.ts:171 `if (block.kind !== 'section') continue;`
  (blocks are section-only); leaf scalars only (GC-2 gate defect D1 = '[object Object]' from object-bound textarea);
  arrays use `widget: array` WITH `slot.properties` (documentMapper.ts builds arraySchema from slot.properties,
  ~:228); NEVER `kind: repeater`. Reference triplet: schema/lab/gc-method.ui.yaml (post-fix-1, section blocks +
  explicit `slots:` claims).
- [F18] Provisioned interpreter — GC-1's decision, verbatim home: .hermes/plans/2026-10-26_GC-1-gc-feasibility-
  spike-report.md:107-123. Facts: /usr/bin/python3 = 3.14.7, numpy/scipy ABSENT there; venv+ensurepip works;
  pins numpy==2.5.4 scipy==1.18.1 (+ pybaselines==1.2.1 if adopted). Provisioning recipe (:113-117):
  `/usr/bin/python3 -m venv /home/brad/.computable-lab-lane1/analysis-venv` + ensurepip + pinned pip install.
  Resolution order GC-1 assigns to GC-5 (:122): config-declared `analysis.python` in gitignored config.yaml →
  env `CLA_ANALYSIS_PYTHON` → `/usr/bin/python3` last-resort fallback. Config env-var substitution exists
  (server/src/config/loader.ts ENV_VAR_PATTERN, ~:71-93, `${VAR:-default}`); AppConfig has NO analysis section yet
  (server/src/config/types.ts:13-28) — add `analysis?: { python?: string }`.
- [F19] GC-1 capability matrix (the vocabulary this spec declares as data): report:125-143. Controls: Baseline
  control, Width/slope sensitivity, Area/height reject, Timed ON/OFF integration windows, Peak detection,
  Deconvolution — with per-candidate S/A/U/NV ratings (scipy core: S peak detection, A for the rest; pybaselines
  1.2.1: S baseline only; deconvolution U everywhere). No capability vocabulary exists in shipped schema data
  (verified: schema/registry/ontology-terms/ = chebi/go/taxon/cell/exact/manual/fame-local compound terms only;
  grep 'capabilit' under schema/ hits DNA/equipment/pipette artifacts, nothing analysis-side).
- [F20] exactOptionalPropertyTypes: true at server/tsconfig.json:13. House conditional-spread pattern for
  optional payload fields: `...(x ? { k: v } : {})` (analysisRunner.ts:335-342, analysisService.ts:80-86).
- [F21] Failure-token house style: AnalysisServiceError(code, message, statusCode) (analysisService.ts:19-28);
  handlers surface `{error: TOKEN, message}` with NO code field (AnalysisHandlers.ts:178-181); existing runner
  tokens: NOT_FOUND / BAD_RUN / BAD_REVISION / BAD_INPUT / RUN_ALREADY_STARTED / FROZEN_INPUT_CHANGED /
  RUN_FAILED / SAVE_FAILED / ARTIFACT_FAILED / ARTIFACT_PERSIST_FAILED.
- [F22] YAML-reload trap (task-list env facts, line 59): `tsx --watch does NOT reload YAML — restart the lane
  stack after schema/lint/ui YAML edits`. Lane stack: cl-lane-stack.sh 1 (:3092/:5192). NEVER :3001/:5174.

## Acceptance criteria — verbatim from the task list (task-list.md:7735-7738)

  verified by:
    Tests: run executes pinned engine and records actual version; engine absent/unsupported
    capability fails per policy with no fallback; switching engines = new revision, old runs
    unchanged; second adapter dispatches purely from registry data.

## Files IN scope

- schema/knowledge/analysis-engine.schema.yaml / .lint.yaml / .ui.yaml            (NEW triplet — placement per
  task block `files:` and sibling knowledge triplets, e.g. assertion.{schema,lint,ui}.yaml in schema/knowledge/)
- schema/registry/registry-kinds.registry.yaml                                     (+1 coverage row)
- schema/knowledge/analysis-revision.schema.yaml                                   (+ engineRef, + requiredCapabilities)
- schema/knowledge/analysis-run.schema.yaml                                        (+ engineProvenance)
- server/src/analysis/analysisService.ts                                           (engineRef forwarding + resolve/availability gate)
- server/src/analysis/analysisRunner.ts                                            (interpreter resolution, engine gate,
  dispatch table, provenance write, execute-time re-hash)
- server/src/config/types.ts (+ config validation in server/src/config/loader.ts if its section-validator pattern
  requires it)                                                                     (analysis.python)
- server/src/analysis/engineAdapters.ts                                            (NEW: shipped-adapter registry, §D)
- server/src/governance/registryOpsLifecycle.test.ts, server/src/registry/KindLifecycleRegistry.test.ts,
  server/src/schema/InstrumentKindRetirement.test.ts, server/src/scripts/migrateRecordLifecycles.test.ts
                                                                                   (coverage-pin mirror, minimal +1 each)
- server/src/analysis/AnalysisEngineSchemas.test.ts (NEW) + analysisService.test.ts / analysisRunner.test.ts
  additions; optional lane-only DEMO engine fixture via API (data repo, not git).

## Explicitly OUT of scope

- app/ beyond the .ui.yaml triplet (no AnalysisPage/projection/mapper edits; no registry-tab row — that is the
  GC-2 follow-up adjudication, not this item).
- config/sequence-analysis/capabilities.yaml and server/src/sequences/** (DNA lane's frozen-field config and
  sequence dispatch stay untouched; GC-5 rides F4's existing branch).
- schema/lab/gc-method.schema.yaml executable_binding.engine_ref stays free-typed (F15). Retro-pinning it to
  `type: const analysis-engine` is a GC-7-era decision with live-fixture blast radius; flag, don't do.
- server/python-executor-service/** (SDK/reader provenance is GC-6's; see OQ3).
- Evidence-bundle wiring of engine provenance (GC-8+/knowledge-layer tasks consume it; GC-5 stops at
  run-record + manifest provenance — "provenance must START at execution").
- No new HTTP routes (the contract does not force one: createRevision/executeRun already exist, F11).
- No invented scientific semantics; no vendor .M parsing; no instrument control.

## Design

### (a) analysis-engine record triplet — schema/knowledge/analysis-engine.{schema,lint,ui}.yaml

Kind const `analysis-engine`; id pattern `^ENG-[A-Za-z0-9_-]+$` (house prefix style, F14; see OQ2).
Required: [kind, id, title, implementation, version_constraints, capabilities, availability, runtime_requirements]
plus FAIRCommon via `$ref: ./common.schema.yaml#/$defs/FAIRCommon`, `unevaluatedProperties: false` (mirror
F9/gc-method structure). Properties:

- identity: `title`, `description`, `engine_family` (string, e.g. "scipy-integration-core"), `engine_version`
  (string — the version THIS record describes; free string, NOT semver-constrained: GC-1's honest unknown rule).
- implementation (module/entry — the dispatch data): object, additionalProperties:false,
  required [adapter, entry], `adapter: enum [python-entry-script, stub-echo]` (the shipped-adapter ids, §D —
  closed enum = schema refuses unshipped adapters declaratively), `entry: string` (for python-entry-script:
  the SDK module invocation is fixed by the runner contract; entry documents it; for stub-echo: "stub"),
  optional `module: string` (importable module name, e.g. computable_lab_analysis / a future pybaselines
  backend selector). NO file paths with host absolutes required here.
- version_constraints (declared, machine-checkable): object required [python, packages]:
  `python: { type: string, minLength: 1 }` (free constraint string, e.g. ">=3.14,<3.15" — V1 checks are the
  named-failure cases below, not a general semver engine), `packages: array of { name, constraint }` — for the
  scipy-core record: numpy==2.5.4, scipy==1.18.1 (F18 pins; pybaselines==1.2.1 ONLY if a record declares the
  baseline-backend capability, F19). Unknown constraint syntax = ENGINE_VERSION_CHECK_UNSUPPORTED declared
  failure at probe time, never a guess.
- capabilities: object required [declared]: `declared: array` of `{ capability: enum <VOCAB>, support:
  enum [supported, approximate, unsupported, unverified] }` — VOCAB = the GC-1 matrix control ids F19
  (`baseline_control`, `width_slope_sensitivity`, `area_height_reject`, `timed_integration_windows`,
  `peak_detection`, `deconvolution`) as a schema-declared enum (OQ1 for the vocabulary's final home).
  Ontology terms NOT minted for capabilities — the FAME precedent (schema/registry/ontology-terms/fame-local-
  yaml header) is compounds only; capability semantics are ours, so a closed enum is the honest data form.
  support mirrors GC-1's S/A/U/NV legend verbatim in meaning.
- availability: object required [available]: `available: boolean`, `note: string` (declared, human-facing).
  Distinct from lifecycle `state` (draft/active/archived = operational; available = "an operator declares this
  engine installable/runnable here"). The registryOpsLifecycle fence vocabulary applies: declare
  `lifecycleId: enum [registry-ops]` + `state: enum [draft, active, archived]` EXACTLY as gc-method.schema.yaml
  :275-283 declares them (F16).
- runtime_requirements: object — `interpreter: enum [provisioned-venv, system]` (provisioned-venv means: the
  engine is only runnable via the GC-1 resolution order F18, and the last-resort /usr/bin fallback must NOT
  satisfy it when packages are declared — §C), `min_timeout_seconds`, `max_input_bytes` optional ints;
  absent = unknown, never a default (GC-1 unknown-is-unknown convention).
- lint (analysis-engine.lint.yaml, gc-method.lint.yaml style, F16 reference): rule "available engines must
  carry version constraints for every declared supported capability's host package" expressed ONLY if the v1
  DSL covers it; the honest V1 rule set is: id pattern + required are SCHEMA jobs (do it there); ONE lint rule
  `engine-declared-supported-requires-packages`: when `$.capabilities.declared[*]` contains
  peak_detection-as-supported the DSL cannot express it (no filter-by-value operator — gc-method.lint.yaml:9-14
  documents the DSL's limits verbatim) → declare NO fake rule; state the INTENT in the lint header comment
  (gc-method precedent: "INTENT (not expressible in the v1 DSL — recorded, not faked)"). Keep the lint file
  real, even if it carries zero enforced rules + documented intent — OR omit .lint.yaml if house convention
  allows two-file sibling (assertion triplet HAS lint; check at claim — reviewer bait #6).
- ui (analysis-engine.ui.yaml): RENDERING RULE BINDS (F17): every block `kind: section` with explicit `slots:`
  claims (list order = field order); leaf-scalar slots only; `capabilities.declared` is a
  `widget: array` slot WITH `properties: [capability, support]`; availability.available is a checkbox/select
  leaf; `version_constraints.packages` array slot WITH `properties: [name, constraint]`; lifecycle `state`
  non-editable (identity block, lifecycle chrome only); NEVER kind: repeater; every slot claimed exactly once.

Registry-kinds row (F16): append `- kind: analysis-engine` under the kinds list with a GC-5 comment (GC-2
comment style at registry-kinds.registry.yaml:25-28), NO stripDomainStatus (there is no domain status).
Mirror the four pin-test lists minimally (+1 each, 2c8b8864 pattern) — including KindLifecycleRegistry size
7→8 and migrateRecordLifecycles knownKinds. Commit order: triplet schema FIRST or same commit as the row —
the coverage loader fails "Unknown kind" otherwise (F16, 2c8b8864 message).

### (b) analysis-revision gains a pinned engine-record ref

schema/knowledge/analysis-revision.schema.yaml adds (F9 file):

  engineRef:
    allOf:
    - $ref: "./datatypes/ref.schema.yaml"
    - type: object
      properties:
        kind: { const: record }
        type: { const: analysis-engine }
        id: { type: string, pattern: '^ENG-[A-Za-z0-9_-]+$' }

— exactly the GC-3 gcMethodRef shape (F14), including the optional `revisionRef: ^REV-[A-F0-9]+$` pin that the
ref datatype already carries (F13). Plus `requiredCapabilities: { type: array, items: { enum <VOCAB> } }`.
engineRef stays OPTIONAL in the schema: existing revisions (DNA sequenceMethod revisions, demo revisions, the
AI-drafting surface analysisAuthoring.ts) stay valid with zero backfill; required-ness would break F11's other
construction sites (reviewer bait #2).

Gate at revision creation (AnalysisService.createRevision, F11 — where payload fields are enumerated):
forward `engineRef`/`requiredCapabilities`; when engineRef present: store.get must resolve it (or its
engineRef.revisionRef REV- snapshot via RecordRevisionService), the resolved payload's kind must be
analysis-engine, and its state must not be 'archived' — else DECLARED FAILURE
`ENGINE_REF_UNRESOLVED` (400/404 class per token style F21), message naming the id. No fallback, no strip-
and-create: the rejection IS the behavior. createRun is unchanged (the run pins the revision; the revision
pins the engine — F7's frozen snapshot carries engineRef into execute without any new mechanism).

### (c) AnalysisRunner records ACTUAL engine/package versions (manifest + run record)

Interpreter resolution (implements GC-1 F18 order; the "no /usr/bin assumption" spine):
1. `ctx.appConfig?.analysis?.python` (new optional AppConfig section, F18),
2. `process.env.CLA_ANALYSIS_PYTHON` (mirrors F2's SDK-dir precedent),
3. `DEFAULT_PYTHON` constant ONLY for revisions WITHOUT a provisioned-venv engine requirement (legacy/DNA
   paths keep byte-identical behavior; constructor injection :94-98 untouched so existing tests stand).
When the pinned engine record declares `runtime_requirements.interpreter: provisioned-venv` (or declares
packages), resolution that lands on step 3 with declared packages present = `ENGINE_UNAVAILABLE` (§E), not a
silent /usr/bin run.

Engine gate + probe, inside executeLocked between the frozen-field check (F5) and status='running' (runner
:448): if the (possibly frozen-snapshot, F7) revision payload carries engineRef → resolve engine record →
availability/versions → dispatch. Probe = one cheap interpreter call through the SAME resolved interpreter:
`python -c 'import json,platform,importlib.metadata as m; print(json.dumps({"python":platform.python_version(),
"packages":{name: m.version(name) for declared}}))'` (declared package names come from the engine record — no
package literal in TS, bait #3). Actual-vs-declared: interpreter version and each package version must satisfy
version_constraints → mismatch `ENGINE_VERSION_MISMATCH` with observed-vs-required in the message (precedent:
inspectEndpoint F12 :74). Probe failure / interpreter missing = `ENGINE_UNAVAILABLE`. Capability check:
every name in revision.requiredCapabilities must appear in engine.capabilities.declared with support
'supported' or 'approximate' → else `ENGINE_CAPABILITY_UNSUPPORTED` (naming the capability). 'approximate'
emits a manifest log line (level warning) — approximation is reported, never hidden.

Provenance write (machine-readable, rides F8 — NO new framework): new typed analysis-run.schema.yaml property
`engineProvenance` (F10):
  engineRef (ref, pinned), engineRecordId, engineVersion (from record), adapter (id), interpreterPath,
  interpreterVersion, packages: [{name, required, actual}], probedAt (date-time), capabilitiesReported:
  [{capability, support}]. Written in the SAME completion update at :480. Echo a compact copy into
  persistedManifest as `engine` (TS OutputManifest gains optional `engine` + TS type). The idempotent re-read
  path F6 returns the stored manifest + record untouched — old runs keep byte-stable provenance (acceptance
  clause "old runs unchanged" is proven by asserting the stored run payload before/after a new-revision run).

Execute-time re-hash (the folded GC-4 OQ1, F3): in provisionInputs, when the source data-reference payload
carries contentHash, hash the streamed bytes while writing (:166-172 already buffers them) and mismatch →
`DATA_HASH_MISMATCH` (named, 409 class). ~6 lines, closes the window GC-4 spec :586-591 explicitly assigned here.

### (d) Registry-data-driven dispatch; second adapter is a DECLARED STUB

New server/src/analysis/engineAdapters.ts: a shipped-implementation table keyed by the record's
`implementation.adapter` id (closed enum in the schema, §A):
- `python-entry-script` — wraps the EXISTING runPython behavior (F1 :182-225) unchanged;
- `stub-echo` — the SECOND adapter, dispatched purely from registry data, EXPLICITLY A DECLARED STUB, NOT a
  scientific engine: it emits a manifest with exactly one artifact `stub_echo` (dataKind: metric,
  value: the run's parameter count + a fixed literal "stub adapter — performs no scientific computation"),
  zero views, and a manifest log line level 'warning' naming itself as the pluggability probe. It must NOT
  produce peak/signal/calibration artifacts, must NOT name any analyte, and its record's title/label carries
  "STUB" so no test or UI can mistake it for science. This is the analysis sibling of the sequence lane's
  builtin virtual-pcr stub pattern (F12), honest about what it is.
- Unknown/absent adapter id in a resolvable record → `ENGINE_ADAPTER_UNREGISTERED` (the closed enum + table
  agree; no TS engine-name literal dispatch — the branch reads data).

Dispatch replaces F4's hardcoded `sequenceMethod ? … : runPython` with: sequenceMethod → sequence path
untouched; else engineRef → table[implementation.adapter]; else (no engineRef) legacy runPython path verbatim.
Switching engines = create a NEW analysis-revision pinning the other engine (revisions are immutable, F9
header); old runs keep their frozen snapshot + stored provenance (F6/F7/F8) — proven by test, not asserted.

### (e) Failure matrix — each a NAMED declared failure, no silent fallback, contract-tested

| Case | Token (AnalysisServiceError, F21 style) | Enforced at | HTTP shape |
|---|---|---|---|
| engine ref does not resolve / wrong kind | ENGINE_REF_UNRESOLVED | createRevision (b) | {error:token,message} 400 |
| engine record archived at create | ENGINE_REF_UNRESOLVED (state leg in message) | createRevision | 409 |
| engine absent/unavailable at execute (available:false, interpreter missing, venv-fallback trap) | ENGINE_UNAVAILABLE | executeLocked engine gate (c) | 409 |
| interpreter/package actual ≠ record constraint (incl. unparseable constraint) | ENGINE_VERSION_MISMATCH / ENGINE_VERSION_CHECK_UNSUPPORTED | probe (c) | 409 |
| revision.requiredCapabilities ⊄ engine.capabilities.declared | ENGINE_CAPABILITY_UNSUPPORTED | engine gate (c) | 409 |
| adapter id not in shipped table | ENGINE_ADAPTER_UNREGISTERED | dispatch (d) | 409 |
| NAS bytes drifted between submit and execute | DATA_HASH_MISMATCH | provisionInputs (c) | 409 |

Every failure happens BEFORE status flips to 'running' where the gate precedes :448 — the run stays 'queued'
or fails visibly per the existing pattern (:461-463 keeps failed-leg behavior); NEVER auto-swap interpreter,
engine, or drop capabilities.

## First targeted check (run this before writing any runner code)

After committing the triplet + registry row + the four coverage-pin list bumps (minimal +1 each):

  cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/governance/registryOpsLifecycle.test.ts src/registry/KindLifecycleRegistry.test.ts src/schema/InstrumentKindRetirement.test.ts src/scripts/migrateRecordLifecycles.test.ts

Expected: all green with the analysis-engine rows present (size 8). If "Unknown kind analysis-engine" appears,
commit order violated F16 (row before schema). This is the fence that has bitten every GC item; clearing it
first de-risks the whole item.

## Verification (complete, with expected output)

RED first: write AnalysisEngineSchemas.test.ts + the runner/service contract tests (§below) BEFORE the schema
edits land; show them failing; note the inversion in the commit message (EDITOR-1 precedent).

1. `cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/schema/AnalysisEngineSchemas.test.ts src/analysis/analysisService.test.ts src/analysis/analysisRunner.test.ts src/analysis/analysisSchema.test.ts src/analysis/analysisAuthoring.test.ts src/governance/registryOpsLifecycle.test.ts src/registry/KindLifecycleRegistry.test.ts src/schema/InstrumentKindRetirement.test.ts src/scripts/migrateRecordLifecycles.test.ts`
   Expected: all pass; acceptance legs: (i) run with pinned stub engine → engineProvenance carries ACTUAL
   interpreter/package versions from the probe (assert against a probe injected via constructor/env, not /usr/bin
   literals); (ii) unavailable + mismatch + unsupported-capability cases each fail with their EXACT token and
   the run record shows no engineProvenance on the legacy path; (iii) engine switch = new revision: old run's
   stored payload byte-identical before/after; (iv) stub-echo engine dispatches with zero TS changes beyond the
   adapter table entry and its manifest carries the stub warning.
2. `cd /mnt/vast/home/brad/git/cl-integration-1 && npm run typecheck` — house rule: NO new tsc errors in touched
   files; pre-existing baseline (24-line materialization class on lane worktrees, GC-2 verify precedent) compared
   by line count, exit 0 NOT expected app-wide. exactOptionalPropertyTypes sites use the `...(x ? {k:v} : {})`
   spread (F20).
3. YAML restart + live proof on the LANE stack only (:3092/:5192, never :3001/:5174):
   `cl-lane-stack.sh 1 restart` then server log shows schema/lint loads clean (GC-2 precedent: 200 schemas /
   N lint rules, zero load errors); `curl -s localhost:3092/api/analysis-revisions -X POST -H 'content-type: application/json'
   -d '{"title":"x","entryScript":"x","sdkVersion":"1","engineRef":{"kind":"record","id":"ENG-MISSING","type":"analysis-engine"}}'`
   → 4xx body `{"error":"ENGINE_REF_UNRESOLVED", …}`; create a lane-only STUB engine + revision via the records
   API, submit + execute a run → `GET /api/analysis-runs/:id` payload shows engineProvenance with actual
   versions; re-execute returns stored manifest (F6).
4. `git -c core.fileMode=false status` in BOTH the code repo and the lane data dir's embedded git: no bytes
   from NAS, no fixtures in git.

## Worker contract

- Worktree/branch off lane trunk: /mnt/vast/home/brad/git/wt/gc-5-lane1-<stamp>, branch `wt/gc-5-lane1-<stamp>`
  off cl/integration-1 (all git `-c core.fileMode=false`).
- Deliverables: commits on that branch; report at /home/brad/.hermes/cl/lanes/1/gc-5-report-<unit>.md;
  end-marker `GC5 DONE <sha>` / `GC5 BLOCKED <reason>`; log lanes/1/logs/coder-GC5-<unit>.log.
- Commit-after-every-step mandate (two context-deaths this wave, 83rd handoff §3). Small commits with the
  GC-n(letter) message style of 2c8b8864.
- Lane stack restarts via cl-lane-stack.sh 1 only; :3001/:5174 untouched; fixtures via API into the lane data
  dir only (all records are TEST data).
- Stop boundary: return requires-rescope to the architect for — lint DSL expressiveness you'd have to fake
  (§A), any app/ rendering need beyond F17, any evidence-bundle wiring pressure, any need to touch the SDK
  (python-executor-service), any SequenceService.ts:156 behavioral change.

## Reviewer bait (edge errors expected for THIS item — pre-empt in the diff itself)

1. Coverage-pin fence: all FOUR pin lists (+KindLifecycleRegistry size 7→8) must move minimally, and the
   registry row must not precede the schema commit (F16, "Unknown kind" loader gate). lifecycleId/state enums
   copied EXACTLY from gc-method.schema.yaml:275-283 — a drifted enum trips registryOpsLifecycle.
2. Don't make engineRef required in analysis-revision.schema.yaml — it detonates DNA/demo/AI revision-creation
   surfaces (F11 SequenceService:156, analysisAuthoring). Required-ness lives in GC-7 authoring practice, not
   the schema; the ACCEPTANCE spine is "an invalid pinned ref is declared-dead", not "every revision must pin".
3. Hardcode boundary: no `/home/brad/.computable-lab-lane1/analysis-venv` path literal in code (config data,
   gitignored, F18); no `scipy`/`numpy` string in runner TS (package names arrive from the engine record); no
   `ENG-*` id literal in runner TS dispatch (dispatch keys off implementation.adapter from the record); the
   legacy `/usr/bin/python3` constant survives ONLY as the declared last-resort for no-engine revisions.
4. No faked lint rule: if the v1 DSL can't express an intent, record INTENT in the lint header like
   gc-method.lint.yaml:9-14 does — inventing a vacuous `exists` rule is a defect. If a zero-rule lint file is
   odd, check whether the triplet convention tolerates schema+ui only (assertion triplet has lint; verify
   whether any knowledge sibling lacks one — analysis-revision RUNS without a lint/ui sibling today, F9).
5. config/sequence-analysis/capabilities.yaml + frozenRunFields: DO NOT add engineRef there — that file drives
   the DNA frozen-field check (F5); engineRef is already frozen via the revision snapshot (F7). A "harmless
   +1" there changes sequence-run semantics.
6. exactOptionalPropertyTypes (F20) at every new optional field in service/runner payload builds; and keep the
   constructor signature `python = DEFAULT_PYTHON` intact — analysisRunner.test.ts drives it.
7. YAML-reload trap (F22): every schema/ui change needs a lane stack restart before curl proofs; a "live
   rejection" curl against an un-restarted server proves nothing.
8. The stub adapter pretending to be science: reviewer must grep its manifest literals — one metric artifact,
   warning log, no signal/peak dataKinds, "STUB" in the fixture title.
9. ui.yaml: section-only blocks, leaf scalars, array-widget-with-properties, every slot claimed once
   (F17 + EDITOR-1 loader validation errors on unknown/double/unclaimed).

## Open questions (for the orchestrator to fold before dispatch)

- OQ1 — Home of the capability vocabulary. GC-1's matrix (F19) lives in a report, not shipped data; no
  capability ontology/CURIEs exist (verified: ontology-terms dir contents, grep across schema/). Recommended
  default: closed `capability` enum inside analysis-engine.schema.yaml (6 control ids from the GC-1 matrix),
  with a one-line pointer comment to the GC-1 report section; a sibling registry vocabulary file
  (readout-definition-style) only if GC-7 needs per-term metadata. Checked: schema/registry/ontology-terms/*,
  'capabilit' greps under schema/ + server/src/analysis, GC-1 report :125-143.
- OQ2 — Id prefix. ^ENG- has no production owner (verified: only hits are test-local fake ids ENG-standards in
  server/src/compiler/resolution/spine4Registration.test.ts:294,319 — mock record lists, not real kinds).
  Recommended default: ^ENG-[A-Za-z0-9_-]+$ (shortest house-consistent prefix); fall back to ^AENG- only if the
  orchestrator rules the mock collision material. Checked: grep across schema/ + server/src.
- OQ3 — Where ACTUAL versions are PROBED: runner-side pre-exec probe (my §C default — one -c call through the
  resolved interpreter, zero SDK change, probe costs ~0.5s per run) vs SDK-side emission in the manifest
  (needs python-executor-service change = GC-6's file territory and its reader-version provenance story).
  Recommended default: runner-side probe now; GC-6 adds reader identity separately and the two merge cleanly
  into engineProvenance. Checked: SDK dir F2, GC-6 task block file list (task-list.md:7762).

DRAFT-STATUS: reviewed-by: pending-orchestrator; dispatch only after promotion to .hermes/plans/2026-10-27_GC-5-engine-registry.md.
draft-complete
