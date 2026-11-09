# GC-4 — NAS attach: .D directory registered as pointer-only acquisition package

DRAFT by cl-spec-composer (lane 1, run l1t0310, 2026-10-26). NOT orchestrator-reviewed; not
dispatchable until promoted. Every [F] cite below was read first-hand this session against trunk
`/mnt/vast/home/brad/git/cl-integration-1` @ c59890af (GC-2 merged, GC-3 spec promoted 8552330e).

## Goal (one sentence)

Register an Agilent .D directory on the read-only `gc-fid-nas` local-mount as a new declarative
`acquisition-package` record — per-file `data-reference` records pinned by streaming sha256+size
(reusing the existing SingleFile acquisition machinery untouched), file-role declarations over
those refs, refusal of mid-acquisition/traversal/symlink/hash-mismatch cases with named error
tokens, and a manifest-level `signal-collection` data-reference — with zero bytes copied into
either git repo, so GC-3's `acquisitionPackageRef` forward-pin finally has a resolvable target.

## Status legend

- **[F]** = confirmed fact, cite read first-hand this session (file:line into trunk).
- **[I]** = inference / design decision derived from confirmed facts, flagged for orchestrator.

## Binding inputs (never re-litigated)

- WAVE gc-analysis-cycle header + GC-D1..D6 + lane-1 environment facts:
  `/home/brad/.hermes/cl/lanes/1/task-list.md:7458-7506`. Binding here: NAS `/mnt/vast/gc-fid` is
  READ-ONLY to CL, bytes never leave it and never enter either git repo (:7486); the
  `storageDevices[]` entry (id `gc-fid-nas`, mountPath `/mnt/vast/gc-fid`) is gitignored CONFIG
  data, declared not hardcoded (:7487-7488); ACQUIRING.TXT marks an in-progress acquisition
  (:7492); lane stack :3092/:5192 live, target exact PIDs (:7484-7485).
- GC-4 task block: task-list.md:7646-7669 (deps: GC-1, GC-3).
- **GC-3 promoted contract** (`.hermes/plans/2026-10-26_GC-3-instrument-sequence.md:240-248`):
  instrument-sequence-entry declares `acquisitionPackageRef` as
  `{ kind: record, type: const acquisition-package }`. **GC-4 MUST declare the kind name exactly
  `acquisition-package`** (ref `type` is free-string until then — GC-3 spec :242). GC-3 spec
  :244-247: GC-3's dangling-ref lint allowlist SKIPS acquisitionPackageRef "until GC-4 lands" —
  GC-4 landing the kind is what re-enables that check (allowlist lives in GC-3 test fixture data,
  not code). GC-3 orchestrator resolution 2 (GC-3 spec :529-530): ref-existence enforcement was
  **deferred to GC-4's resolver** — no repo-wide write-path ref gate exists on trunk.
- GC-1 spike report (`.hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md`): .D inventory
  table :11-28 (FID1A.CH signal / RUN.LOG / SAMPLE.XML / SAMPLE.MAC.bak / ACQ.M/ / DA.M/ /
  ACQRES.REG / SINGLE.B roles + confidences), partial-.D fact :9 (20201023-WEGMANS-BUTTER.D has NO
  ACQ.M/DA.M — "any .D handler must tolerate missing method dirs"), ACQUIRING.TXT presence
  history :9 + AS-L1T1935-GC1-7 :178 (marker rule stays in force regardless of current absence),
  opaque-file verdicts :145-150 (e): preserve bytes, no parsing beyond magic-number ID.

## Files IN scope

- `schema/knowledge/acquisition-package.schema.yaml` / `.lint.yaml` / `.ui.yaml`  [NEW triplet]
- `server/src/storage/acquisitionPackage.ts`  [NEW registration service]
- `server/src/storage/acquisitionPackage.test.ts`  [NEW test — registration + failure matrix]
- `server/src/schema/AcquisitionPackageSchemas.test.ts`  [NEW test — validator+lint over real schema/]
- `server/src/storage/acquisition.ts` — **NO EDIT (verified).** The local `DataKind` union
  (:18-25) ALREADY includes `'signal-collection'` (:21, first-hand read), matching the schema enum
  (`schema/knowledge/data-reference.schema.yaml:52`). Listed here ONLY so the coder does not
  "fix" a drift that does not exist, and knows the reuse path needs zero modification.
- `schema/registry/registry-kinds.registry.yaml` — add `- kind: acquisition-package` coverage row
  (precedent: gc-method row at :29 [F read this session]; GC-3 promotion resolution 1 approved the
  same treatment — schema declares lifecycleId/state enums exactly as gc-method does).
- `config.example.yaml` — a COMMENTED `storageDevices` local-mount example incl. the gc-fid-nas
  shape (the task's "config docs (storageDevices example)" deliverable; repo-root
  config.example.yaml exists [F file search]; note: grep for `storageDevices` currently finds ZERO
  hits in docs/ and config.example.yaml [F], so today the only in-repo shape doc is loader
  validation code — this closes that gap). Example is comment-annotated config DATA; the REAL
  entry goes only in the gitignored lane config.yaml (NOT in the diff).

## Files EXPLICITLY OUT of scope

- `server/src/analysis/analysisRunner.ts` / `analysisService.ts` — GC-5 territory (GC-1 report
  :121-123 assigns runner changes to GC-5). GC-4 does NOT wire package verification into the
  submit/execute routes (see §Open questions Q1 for the honest boundary).
- `server/src/storage/LocalMountStorageProvider.ts`, `StorageService.ts`, `types.ts` — the shared
  provider is read-only reuse; symlink hardening lives in the NEW registration service, not in the
  shared provider (see §Security rules S2).
- `schema/lab/instrument-sequence*` (GC-3's deliverable — in flight, NOT on trunk [F: `ls
  schema/lab/` shows only gc-method triplet at c59890af]).
- `schema/lab/gc-method.*` (GC-2, merged c59890af — read-only cite).
- app/** (any UI page/component code — triplet `.ui.yaml` DATA only), `schema/core/datatypes/**`
  (reuse as-is), `server/src/sequences/**`, `app/src/sequences/**`, `config/sequence-analysis/**`,
  `schema/bio/sequence*` — DNA subsystem, zero touches.
- .CH decoding, .M parsing, integration engines (GC-5+/GC-2). GC-4 PRESERVES bytes-by-reference
  only; GC-1(e) verdict binds: no vendor parsing beyond what registration needs (nothing — even
  ACQ.TXT method-name extraction is GC-3's entry field, already shipped by GC-3).
- Real NAS in tests (fixtures are synthetic tmp trees, §RED plan). The real
  `/mnt/vast/gc-fid/machine1/RES35077-4.D` is touched ONLY by an optional manual smoke note, never
  by vitest.

## Acceptance criteria (verbatim, task-list.md:7665-7668)

> Server tests: registering a fixture .D tree yields per-file DREFs (correct sha256/size) +
> valid package; traversal/symlink/hash-mismatch cases fail with named cause; a run submitted
> after source mutation is refused. No bytes in either git repo (check git status of both).

Description clauses that also bind (task-list.md:7652-7660): configured local-mount
`storageDevices[]` entry (id `gc-fid-nas`, mountPath `/mnt/vast/gc-fid` — gitignored config, not
code); per-file data-references, "stream+hash existing SingleFile acquisition reused"; new triplet
`acquisition-package` declaring file roles (signal_channel, sample_metadata, run_log,
method_assets...) over those refs; pinned package serializes to a storage-backed signal-collection
data-reference for the analysis-run input contract; raw bytes never leave the NAS, no zip/copy/git;
explicit failures for missing files, mid-acquisition (ACQUIRING.TXT), path traversal, escaping
symlinks, hash drift at execution time. `files` line (:7669): `server/src/storage/` (package
registration), `schema/knowledge/acquisition-package.*.yaml`, config docs (storageDevices
example), tests.

## Oriented facts (every cite read first-hand this session)

- **[F] SingleFile acquisition mechanism** — `server/src/storage/acquisition.ts`:
  `acquireDataReference(ctx, input)` (:84) stats the file (:90-98, NOT_FOUND names device+path),
  STREAMS it through `hashStream` (:60-71, sha256 hex + byte count, never buffers the whole file),
  mints `DREF-######` via `nextDataReferenceId` (:135-151, scans store, max+1), and
  `ctx.store.create` with `DATA_REFERENCE_SCHEMA_ID` (:15-16, :124-127). Payload shape
  `DataReferencePayload` (:39-54). Conditional-spread construction for optional fields
  (:117-120) — the exactOptionalPropertyTypes house style. Local `DataKind` union (:18-25)
  **already includes `'signal-collection'` (:21, first-hand read)** — the reuse path is complete,
  GC-4 edits NOTHING in this file.
- **[F] data-reference record schema** — `schema/knowledge/data-reference.schema.yaml`:
  `kind: const "data-reference"` (:19-20), id example `DREF-000123` (:22-24),
  `storageDeviceId` = config.storageDevices[].id (:30-32), `path` = key RELATIVE to device root
  (:34-38), `contentHash` `^[a-f0-9]{64}$` (:40-43), `sizeBytes` int >=0 (:45-48), `dataKind` enum
  incl. `signal` and `signal-collection` (:50-53), `acquisitionContext` object with
  `equipment_ref: $ref ./datatypes/ref.schema.yaml` (:63-76), `sourceRunRef` free-ish record-ref
  object (:78-89), `acquiredAt` date-time (:91-94), required
  `[kind, id, title, storageDeviceId, path, contentHash, sizeBytes, dataKind]` (:109).
  The header (:4-11) states the exact doctrine GC-4 extends: "git holds the reference, the device
  holds the data."
- **[F] Storage device config + service** — `server/src/storage/types.ts`:
  `StorageDeviceKind = 's3' | 'local-mount'` (:15), `StorageDeviceConfig.mountPath` absolute
  (:40-42), `StorageProvider` interface (list/stat/read/write/delete, stream-based, :72-79),
  `StorageErrorCode` union `NOT_FOUND | UNSUPPORTED_KIND | MISSING_CONFIG | ACCESS_DENIED |
  TRAVERSAL_BLOCKED | IO_ERROR` (:82-88) — GC-4 error-token naming below extends the REGISTRATION
  layer, not this union. `assertSafeRelativePath` blocks `.`/`..` segments (:101-111).
  `StorageService` (`StorageService.ts:24-78`) builds providers from `config.storageDevices[]` at
  app init (:28-36), `getProvider(id)` NOT_FOUND (:68-74).
  Config validation (`server/src/config/loader.ts:632-643`): `kind` must be s3|local-mount (:634),
  `mountPath` REQUIRED for local-mount (:637-639); devices default to `[]` (:790).
- **[F] LocalMountStorageProvider behavior** (`server/src/storage/LocalMountStorageProvider.ts`):
  containment is LEXICAL — `resolvePath` = `resolve(root, path)` + prefix check (:46-54);
  `list`/`stat`/`read` all use `stat` (FOLLOWS symlinks) at :71, :90, :106; `read` returns
  `createReadStream(abs)` (:113) which would fail on a DIRECTORY (EISDIR → surfaces as IO_ERROR via
  :111). **Consequence [F-by-read]: a symlink inside the mount pointing OUTSIDE the root passes the
  lexical check and is silently followed by read — GC-4 must add realpath/lstat hardening in the
  registration layer (S2), because the provider itself does not do it.**
  `list` skips unreadable entries silently (:80-82) — GC-4 registration must NOT rely on `list`
  alone for completeness (missing-required-file check is an explicit step, S4).
- **[F] Analysis-run input contract** — `server/src/analysis/analysisRunner.ts`:
  flow header (:2-12): "Stream each input's bytes from its storage device into a temp input dir
  (never into git)". `provisionInputs` (:107-179): each named input is a record ref whose
  `type` is `data-reference` (:150-161) or `analysis-output-artifact` (:122-149); unknown types →
  `BAD_INPUT` 400 (:162-163). For `data-reference`: store.get(ref.id) → payload must have
  `storageDeviceId` + `path` else `BAD_INPUT` (:156-158); provider.read + stream-to-temp-file
  (:166-172). **provisionInputs does NOT re-verify contentHash [F — no hashStream call anywhere in
  the provision path].** `schema/knowledge/analysis-run.schema.yaml:6` "binds ... data-reference
  records on storage devices"; :46 "name → data-reference record ref (frozen at submit)".
  Frozen-field drift at execute: analysisRunner.ts:432-435 `contentHash(frozen[field])` compare →
  `FROZEN_INPUT_CHANGED` 409 (mirrors GC-3 spec's [F] cite; re-read this session).
- **[F] Full-wire-up test harness for storage** — `server/src/storage/acquisition.test.ts:10-55`:
  tmp mount dir + tmp workspace, writes a config.yaml IN THE TEST including a `local-mount` device
  (test device id `usb0`, mountPath = tmpdir :43-47), `initializeApp(wsDir, {schemaDir:
  resolve(process.cwd(),'..','schema'), ...})` (:50-54); asserts sha256/size against an
  independently computed `createHash` (:70-75) AND walks the records dir to prove raw bytes never
  landed in git (:78-87). This is the harness GC-4's registration test copies (device id
  `gc-fid-nas`, mountPath = tmpdir — NEVER the real NAS path).
- **[F] Triplet + test-harness conventions** (GC-3 promoted spec §Oriented facts, plus this-session
  greps): triplet = `<kind>.schema.yaml + .lint.yaml + .ui.yaml`; validator+lint over real schema/
  = `server/src/schema/ControlledDocumentSchemas.test.ts` pattern; UI = explicit
  `editor.blocks`/`slots` (controlled-document.ui.yaml model), repeater = `kind: "repeater"` +
  path prefix (schema/workflow/budget.ui.yaml:20 — NOTE schema/WORKFLOW/, the schema/lab path is the
  GC-3 draft's documented slip); lint `schemaId` must equal the exact schema `$id`.
- **[F] Lint DSL hard limits**: record-scope only executes (LintEngine.ts:143-145, confirmed via
  GC-3 promotion audit cite); legal ops = exists, nonEmpty, regex, compare, equals, in, all, any,
  not, has_material_class, state_is, context_contains, lineage_includes, time_within,
  mention_kind_matches, allIn, everyItem, noneIn (GC-3 spec :91-93 promotion-cleared;
  everyItem/allIn/noneIn carry the cross-collection-within-one-payload semantics documented in
  schema/lint/lint-v1.schema.yaml:236-346 [F read this session]). No store access.
- **[F] Vocabulary audit (naming ground rule — done before naming anything)**:
  `acquisition-package` = ZERO hits repo-wide (schema/ server/src app/src config docs, this
  session's grep; files-only grep across whole repo incl. hidden dirs = 0 too). No record kind
  named `*package*` exists (only vendor-offer/product `package_size` STRING fields,
  schema/lab/vendor-offer.schema.yaml:53, vendor-product.schema.yaml:44 [F] — unrelated retail
  packaging). "collection" already means (a) dataKind `signal-collection`/`sequence-collection`/
  `alignment` on data-reference (:52 [F]) and (b) lint-scope `collection` (lint-v1:87 [F]) — GC-4
  REUSES (a) and never creates a record kind containing "collection". "acquisition" already appears
  as data-reference.acquisitionContext (:63), measurement-context.acquisition_context (:53),
  run-timeline acquisition_activity (:210-216), gc-method.acquisition section (:49) — all are
  metadata sections/activities, no acquisition RECORD kind collides. **Verdict:
  `acquisition-package` (record kind), `signal-collection` (existing dataKind), `data-reference`
  (existing kind) are three distinct non-overlapping terms; GC-4 introduces exactly ONE new term.**
- **[F] registry-kinds coverage**: `schema/registry/registry-kinds.registry.yaml` lists covered
  kinds (:9-29 read this session: person, equipment, equipment-class, training-record,
  competency-authorization, calibration-record, gc-method). gc-method row = the precedent.
- **[F] .D ground truth** (GC-1 report, carried as binding input, not re-derived): canonical
  members FID1A.CH (signal), SAMPLE.XML + SAMPLE.MAC.bak (sample metadata, UTF-16LE), RUN.LOG
  (run log, UTF-16LE), ACQ.M/ + DA.M/ (method snapshots: 8/7 entries incl. ACQ.TXT only in ACQ.M),
  ACQRES.REG + SINGLE.B (opaque binary REGISTER FILE); file sizes 22 B – 100,052 B; partial .D
  WITHOUT ACQ.M/DA.M exists; ACQUIRING.TXT = in-progress marker (present 2026-10-25, absent now —
  rule stays in force).

## Design decisions

- **[I] D1 — Triplet shape: file-role declarations over per-file data-references.**
  `acquisition-package` does NOT copy hashes inline as its source of truth; it declares
  `files: [...]` where each item is `{ role, dataReferenceRef: {kind: record, type: const
  data-reference, id}, relativePath }`. The DREF records remain the integrity anchors
  (schema-required contentHash/sizeBytes live there, [F data-reference.schema.yaml:109]); the
  package is the declarative manifest mapping ROLES to DREFs plus the directory identity. This is
  the task's "per-file data-references + a new triplet declaring file roles ... over those refs"
  read literally. Rejected alternative (embed per-file hashes in the package): duplicates the hash
  contract, breaks single-source-of-truth, and re-invents DREFs.
- **[I] D2 — Kind + id pattern.** kind `acquisition-package` (GC-3 contract, non-negotiable); id
  pattern `^ACQP-[A-Za-z0-9][A-Za-z0-9_-]*$` [I] (mirrors the per-schema id-pattern convention
  confirmed by GC-3 promotion resolution 5 — id patterns are per-schema only, no central mint).
  FAIRCommon mixin via `allOf: [$ref ./common.schema.yaml#/$defs/FAIRCommon]`,
  `unevaluatedProperties: false`, `kind: const`, refs via `./datatypes/ref.schema.yaml` — the
  house triplet pattern (GC-3 spec :63-67 [F-per-spec]).
- **[I] D3 — Property set (schema/knowledge/acquisition-package.schema.yaml).**
  Required: `kind, id, title, storageDeviceId, directoryKey, files, signalCollectionRef`.
  - `storageDeviceId` string — config device id (e.g. `gc-fid-nas`); mirrors data-reference :30-32;
    NEVER a mount path.
  - `directoryKey` string, `pattern: "^[^/\\\\][^\\\\]*$"`-style SAFE RELATIVE key (no leading
    `/`, no `..`/`.` segments, no backslashes) — the .D directory path relative to device root
    (e.g. `machine1/RES35077-4.D`). Document that this is a DIRECTORY key: no single-file DREF
    ever points at it directly (the single-file hash contract is honored by pinning its FILES).
  - `files` array (minItems 1), items: `{ relativePath (safe relative, within directoryKey),
    dataReferenceRef (record-ref host, type: const data-reference), role }`.
    `role` enum: `signal_channel | sample_metadata | run_log | method_asset | uninterpreted`.
    [I: `method_asset` singular (one DREF per file, the "method_assets..." ellipsis in the task
    means the set of them); `uninterpreted` added per the ground rule — unknown files (e.g.
    ACQRES.REG, SINGLE.B, rpthead.txt, anything a future .D carries) get PINNED with no semantics
    claimed, exactly GC-1(e) "preserve bytes, don't parse"; never silently skip.]
    `uniqueItems` on dataReferenceRef.id via lint (`acqp-dref-roles-unique`, D8).
    `signal_channel` may appear 0..n times — 0 is legal only for a partial .D?? NO — see D9.
  - `signalCollectionRef` — record-ref host `{kind: record, type: const data-reference}` pointing
    at the MANIFEST DREF (D5).
  - `sourceRunRef` / `sampleRef` — OPTIONAL record refs (link to instrument-sequence-entry /
    sample once resolvable; optional so a package can be registered standalone). [I]
  - `registeredAt` date-time; FAIRCommon createdAt/updatedAt/createdBy exposed read-only as
    data-reference.schema.yaml does (:96-107 [F]).
- **[I] D4 — File-role binding is declarative, role DISCOVERY is not.** The triplet declares the
  role VOCABULARY (enum) and requires each file item to carry one; nothing in YAML auto-assigns
  FID1A.CH→signal_channel. The registration service takes the role map as INPUT (caller/fixture
  supplies `{ 'FID1A.CH': 'signal_channel', 'SAMPLE.XML': 'sample_metadata', ... }` or defaults,
  see D10). No vendor filename semantics get invented beyond the GC-1-inventoried names — anything
  not in the caller's map lands in `uninterpreted`.
- **[I] D5 — The signal-collection manifest data-reference (the "serialize" step).**
  At registration the service creates ONE extra `data-reference` record:
  `dataKind: 'signal-collection'`, `storageDeviceId: 'gc-fid-nas'`, `path: <directoryKey>` (the
  directory as a key — legal string, the schema does not require readability), `contentHash:`
  sha256 of a CANONICAL MANIFEST STRING = files sorted by relativePath, each contributing
  `` `${relativePath}\n${file.contentHash}\n${file.sizeBytes}\n` `` — i.e. a Merkle-style pin of
  the whole .D computed WITHOUT zipping/copying anything, `sizeBytes:` = sum of member sizes,
  `format: 'agilent-chemstation-d'` [I label; free-string field :55-57 [F]], `readerVersion:
  'gc-4-registration/1'`, `title: '<dirName> acquisition package (signal collection)'`. It is
  created via `ctx.store.create` directly with `DATA_REFERENCE_SCHEMA_ID` (precedent: the runner
  builds DREF payloads directly the same way, analysisRunner.ts:260-270 [F]). This DREF is what
  "pinned package serializes to a storage-backed signal-collection data-reference" names, and it
  is what analysis inputs point at when the engine understands collections.
  **Honest boundary [F]: today `provisionInputs` streams a DREF with `provider.read(path)`
  (:166-167) — `createReadStream` on a directory FAILS (EISDIR). So the manifest DREF is
  NOT consumable by the current runner.** Resolution [I, OQ-1]: GC-4's input-contract deliverable
  is a `packageAnalysisInputs(ctx, packageRecordId)` pure helper that returns the
  `{ name → {kind:'record', id, type:'data-reference', dataKind} }` mapping an analysis-run's
  `inputs` record needs (analysis-run.schema.yaml:46 [F]), with `signal` → the FID1A.CH (or each
  `.CH`) FILE DREF — the per-file path the runner already provisions — plus the manifest DREF id
  under a `package` input name for provenance once GC-5 teaches the runner collections. GC-4 does
  NOT modify provisionInputs. The mutation-refusal acceptance (D7) is enforced at package-verify
  time, which the helper calls.
- **[I] D6 — Registration service API** (`server/src/storage/acquisitionPackage.ts`, mirrors
  acquisition.ts idioms — stream-hash, conditional spreads, typed errors):
  ```ts
  registerAcquisitionPackage(ctx, input: {
    deviceId: string;            // e.g. 'gc-fid-nas' — NEVER hardcode a mount path
    directoryKey: string;        // 'machine1/RES35077-4.D'
    roles?: Record<string, PackageFileRole>;   // default map D10 applied first
    sampleRef?: RecordRef; sourceRunRef?: RecordRef;
  }): Promise<{ packageRecordId: string; packagePayload: AcquisitionPackagePayload;
                fileDrefs: Array<{ relativePath: string; role: PackageFileRole; recordId: string }>;
                manifestDrefId: string }>
  verifyAcquisitionPackage(ctx, packageRecordId): Promise<void>  // throws PACKAGE_* codes
  packageAnalysisInputs(ctx, packageRecordId): Promise<RunInputs>  // calls verify first
  ```
  Plus new typed error class `AcquisitionPackageError` with code union
  `'PACKAGE_ACQUIRING' | 'PACKAGE_SYMLINK_ESCAPE' | 'PACKAGE_PATH_ESCAPE' |
  'PACKAGE_FILE_MISSING' | 'PACKAGE_NOT_A_FILE' | 'PACKAGE_HASH_MISMATCH' | 'PACKAGE_HASH_DRIFT' |
  'PACKAGE_DEVICE_MISSING'` — named causes, never silent skip. Do NOT widen the shared
  `StorageErrorCode` union [I: registration-level codes live at the registration layer so
  StorageProvider semantics stay untouched].
  Registration ORDER (each step's failure aborts atomically; any DREFs already created by a
  partially-failed run are orphaned — acceptable and DOCUMENTED [I]: DREFs are append-only audit
  records; the test asserts no package record exists on failure, and orphaned DREFs still pin real
  content, no integrity harm):
  1. resolve device via `ctx.storageService.getProvider(deviceId)` → missing → `PACKAGE_DEVICE_MISSING`
     (or reuse StorageError NOT_FOUND — DECISION: let StorageService's NOT_FOUND propagate, code it
     honestly as StorageError in the report; `PACKAGE_DEVICE_MISSING` only for a directory-level miss).
  2. walk the directory: `provider.list(directoryKey)` recursively (method subdirs ACQ.M/DA.M),
     reject any key failing `assertSafeRelativePath` → `PACKAGE_PATH_ESCAPE`.
  3. **S1 marker check FIRST** — if entry `ACQUIRING.TXT` exists anywhere in the tree →
     `PACKAGE_ACQUIRING` ("acquisition in progress; refuse to pin a mutable tree").
  4. **S2 symlink hardening** — for every entry, `lstat` the absolute path resolved from the
     CONFIG mountPath (read from `ctx.storageService` device config — `allDeviceConfigs()`
     :63-66 [F]) and `realpath` it; if lstat says symlink OR realpath escapes realpath(mountRoot)
     → `PACKAGE_SYMLINK_ESCAPE` naming the offender. The provider's lexical containment
     [F LocalMountStorageProvider.ts:46-54] does NOT catch this — this is the ONLY reason the
     service touches raw fs alongside the provider [I: additive hardening, provider untouched —
     see stop boundary B2].
  5. **S4 required-file check** — the caller's expected-members list (default D10) must all exist;
     missing → `PACKAGE_FILE_MISSING` naming each. Partial .D tolerance: method dirs are OPTIONAL
     (GC-1 :9 [F]); FID1A.CH-or-any-`.CH` and SAMPLE.XML are REQUIRED-by-default membership; RUN.LOG
     warn-not-required? DECISION [I]: required = ['FID1A.CH','SAMPLE.XML'], everything else is
     registered-as-found.
  6. per-file `acquireDataReference(...)` (UNCHANGED except the [F-verified] DataKind union line)
     with `dataKind: 'signal'` for `.CH` files, `'binary'` otherwise [I], path =
     `${directoryKey}/${relativePath}`, acquisitionContext `{ equipment_ref? optional, note:
     'acquisition-package member' }` — keep minimal; then re-hash check S5 below if caller passed
     expected hashes.
  7. build manifest string → create manifest DREF (D5) → create the acquisition-package record.
  `verifyAcquisitionPackage` = the execution-time gate: re-read every file via
  `provider.read` + `hashStream` (streaming, NAS-side compute only, bytes to /dev/null-equivalent
  digest — NEVER written anywhere), compare to the DREF's contentHash/sizeBytes; drift →
  `PACKAGE_HASH_DRIFT` naming file. Also re-runs S1/S2 (marker can appear later; a file can be
  swapped for a symlink) → `PACKAGE_ACQUIRING` / `PACKAGE_SYMLINK_ESCAPE`.
- **[I] D7 — "a run submitted after source mutation is refused" — discharge.** The mutation window
  is register→submit. Since GC-4 cannot modify the runner (out of scope), the honest trunk-side
  guarantee composes from TWO existing pieces + GC-4's verify: (a) GC-4's `packageAnalysisInputs`
  calls `verifyAcquisitionPackage` — mutation between registration and input-resolution is refused
  at resolve time (RED test mutates the fixture .CH after registration, expects PACKAGE_HASH_DRIFT);
  (b) inputs frozen at submit (analysis-run.schema.yaml:46 [F]) + frozen-field re-hash at execute
  (analysisRunner.ts:432-435 [F]) reject post-submit tampering of the RUN payload — and since the
  DREF records are append-only, what a run already froze cannot be rewritten by a later
  re-registration. The test asserts BOTH. The residual gap — bytes mutated on the NAS AFTER submit,
  hash re-check at EXECUTE inside provisionInputs — is runner-side and belongs to GC-5; GC-4
  documents it in code comment + report (reviewer bait #7). If the orchestrator wants (b)
  NAS-side at execute inside GC-4's scope, that IS a provisionInputs edit — OQ-1, do not assume it.
- **[I] D8 — Lint rules (record scope ONLY — LintEngine.ts:143-145 hard limit, GC-3 [F]).**
  `schema/knowledge/acquisition-package.lint.yaml`:
  - R1 `acqp-files-declared` — warning, `nonEmpty $.files[*].relativePath` (an empty package is
    suspicious; ops: nonEmpty).
  - R2 `acqp-dref-closure` — error, every role's dref must be one of the declared file drefs — but
    there IS no second collection (roles live ON the file items), so the real closure lint can do
    is uniqueness + shape: `everyItem` over `$.files` asserting `nonEmpty $.files[*].dataReferenceRef.id`
    AND `regex` id pattern `^DREF-` (the DREF mint pattern is code-verified `DREF-\d{6}`,
    acquisition.ts:141 [F]) — catches dangling-by-typo without store access, exactly GC-3's
    regex-prefix honesty pattern. Ops: everyItem/nonEmpty/regex.
  - R3 `acqp-role-vocabulary-closed` — NO lint needed: the role enum lives in the SCHEMA (a bad
    role is AJV-rejected [F pattern: data-reference.dataKind enum :50-53]). Declare roles in schema
    enum; do NOT fake a lint rule for it (GC-3 spec :296-299 "don't invent rules the DSL can't
    back").
  - R4 `acqp-directory-key-safe` — `regex` `$.directoryKey` `^[A-Za-z0-9][A-Za-z0-9._ /-]*$`-style
    safe-relative (no `..`, no `\`, no leading `/`) — belt for the code-level S-checks; ops: regex.
  DO NOT write a store-resolution rule (impossible [F]); existence of DREF targets = D6 verify +
  GC-3 orch-resolution-2 deferral note updated in the report.
- **[I] D9 — signal_channel cardinality.** schema: `files[*].role` is a plain enum, array minItems
  1; "exactly one signal_channel for a registrable package" is enforced in the SERVICE (default
  registration requires ≥1 `.CH` pinned as signal_channel; multiple `.CH` files → all get
  signal_channel, legal — multi-channel instruments exist but do NOT assume FID1A/B semantics —
  role map is caller-supplied). No lint rule (cardinality-across-items is expressible via
  everyItem/noneIn combos only in contorted ways; keep it in code with a named error
  `PACKAGE_FILE_MISSING` when zero .CH). State the boundary in the ui/description.
- **[I] D10 — Default role map (declarative data inside the service as an exported const, NOT a
  hardcode-boundary violation: it maps ONLY names GC-1 verified [F GC-1 report:13-28]):**
  `FID1A.CH→signal_channel`, `SAMPLE.XML→sample_metadata`, `SAMPLE.MAC.bak→sample_metadata`,
  `RUN.LOG→run_log`, `ACQ.M/*→method_asset`, `DA.M/*→method_asset`, `ACQRES.REG→uninterpreted`,
  `SINGLE.B→uninterpreted`. Anything else → `uninterpreted`. Unknown names are NEVER rejected and
  NEVER silently dropped.
- **[I] D11 — gc-fid-nas config shape.** Real config: gitignored lane config.yaml gains
  ```yaml
  storageDevices:
    - id: gc-fid-nas
      label: 'GC-FID NAS (read-only)'
      kind: local-mount
      mountPath: /mnt/vast/gc-fid
  ```
  (shape loader-validated [F loader.ts:632-643]). In-repo deliverable = COMMENTED example in
  config.example.yaml. Tests define their own `gc-fid-nas` device pointing at the tmp fixture mount
  (acquisition.test.ts:43-47 pattern [F]) — test config is written per-test, real mount never
  referenced. No code reads the string `/mnt/vast/gc-fid` EVER (grep-forbidden, reviewer bait #8).
- **[I] D12 — UI triplet** (`schema/knowledge/acquisition-package.ui.yaml`): pattern =
  controlled-document.ui.yaml — `display.titleField: $.title`, subtitle `$.storageDeviceId`;
  `editor.blocks` with EXPLICIT `slots` (EDITOR-1): identity block (id readonly, title),
  source block (storageDeviceId, directoryKey readonly), manifest block: repeater
  `kind: "repeater"` `path: "$.files"` [F budget.ui.yaml:20 model via GC-3 spec :140-143] with
  slots relativePath / role / dataReferenceRef (widget `ref`); signalCollectionRef slot widget
  `ref`. ALL LABELS FULL WORDS ("Storage Device Id", "Directory Key", "Relative Path", "File Role",
  "Data Reference Ref", "Signal Collection Ref") — no-truncated-labels convention.

## Security / failure rules (declarative where possible; imperative in the service)

| # | Case | Named token | Layer | Declarative? |
|---|---|---|---|---|
| S1 | ACQUIRING.TXT present anywhere in tree (mid-acquisition) | `PACKAGE_ACQUIRING` | service, registration step 3 + verify | No (fs fact) — but the RULE is data: exported const marker-name `'ACQUIRING.TXT'` [F wave :7492 semantics: in-progress marker] |
| S2 | symlink inside .D, or realpath escapes mount root | `PACKAGE_SYMLINK_ESCAPE` (names offender) | service lstat+realpath per entry (provider is symlink-blind [F]) | No |
| S3 | `..`/`.`/absolute/backslash paths in directoryKey or item paths | `PACKAGE_PATH_ESCAPE` (or StorageError TRAVERSAL_BLOCKED when provider raises it first) | service pre-check + `assertSafeRelativePath` [F types.ts:101-111] + schema regex lint R4 | Partially (schema/lint R4) |
| S4 | required member missing (FID1A.CH, SAMPLE.XML) | `PACKAGE_FILE_MISSING` (lists names) | service step 5 | role map = data (D10) |
| S5 | hash/size drift at verify (mutation after pin) | `PACKAGE_HASH_DRIFT` (names file) | service verify via hashStream [F] | No |
| S6 | wrong-kind ref (dataReferenceRef `type: run`) | AJV const rejection (validation 400) | schema `type: const data-reference` host [F ref free-string + report.schema.yaml host pattern via GC-3 :78-80] | YES (YAML) |
| S7 | unknown role value, bad id shape, unknown property | AJV rejection | schema enum + id pattern + `unevaluatedProperties: false` | YES |
| S8 | device id not configured | StorageError NOT_FOUND from getProvider [F StorageService.ts:68-74]; package-level directory miss = `PACKAGE_DEVICE_MISSING` | service | config data |
| S9 | entry is a directory where file expected / vice versa | `PACKAGE_NOT_A_FILE` | service (provider `stat` gives no isDirectory — list() does [F]) | No |
| — | NOTHING is ever silently skipped: provider.list's silent-unreadable-skip (:80-82 [F]) is compensated by S4's explicit required-membership + the package enumerating EVERY walked entry including `uninterpreted` | | | |

## Invariants (hard, test-enforced)

- **Raw bytes never leave the NAS**: reads are streaming-hash only (provider.read → hashStream);
  verify digests and discards; nothing under any tmp path PERSISTS (fixtures write nothing; the
  runner's temp-input provisioning is GC-5's, out of scope).
- **No zip / no copy / no git**: the diff may contain only the §Files IN scope; the manifest
  contentHash is computed from per-file hashes, NOT from an archive; test walks the records dir
  (acquisition.test.ts:78-87 precedent [F]) and both git repos' status are clean of .D content.
- **Control plane / data plane split** (data-reference.schema.yaml:4-11 [F] doctrine): git holds
  pointers + hashes; the device holds bytes. The mountPath lives in gitignored config only.
- **NAS read-only to CL**: registration code never calls provider.write/delete (test asserts a
  write attempt is structurally impossible — the service imports read/list/stat paths only; a
  lint-free convention pinned by report + reviewer grep).

## RED-first test plan (fixtures = synthetic .D tree under os.tmpdir, NEVER the real NAS)

Fixture tree builder in the test (mkdtemp mount; contents = tiny synthetic files, exact names from
GC-1's inventory — bytes are dummy, only NAMES+roles matter; FID1A.CH content can be 64 random-ish
bytes; sizes tiny so streaming-hash tests stay fast):
`machine1/SYNTH-001.D/{FID1A.CH, SAMPLE.XML, RUN.LOG, SAMPLE.MAC.bak, ACQ.M/{ACQ.TXT, INFO.MTH},
DA.M/{INFO.MTH}, ACQRES.REG, SINGLE.B}` + control trees: `.../SYNTH-BAD-ACQ.D/` with
ACQUIRING.TXT, `.../SYNTH-LINK.D/` with a `FID1A.CH` symlink → file OUTSIDE the mount root,
`.../SYNTH-PARTIAL.D/` (no ACQ.M/DA.M — the GC-1-tolerated partial [F :9]).
Harness = acquisition.test.ts wire-up [F :10-55] with device id `gc-fid-nas`, mountPath = tmpdir.

1. `server/src/storage/acquisitionPackage.test.ts` (write FIRST, expect module-not-found RED):
   - register SYNTH-001 → per-file DREFs each `contentHash === independently computed
     createHash(file)` AND `sizeBytes === fs stat size` (acceptance clause 1, same assertion style
     as acquisition.test.ts:70-72 [F]); package record validates via ctx's own validator; roles per
     D10 incl. ACQRES.REG/SINGLE.B → `uninterpreted`.
   - manifest DREF: dataKind `signal-collection`, path = directoryKey, contentHash = manifest
     recomputed in-test from the file DREFs (sorted-concat formula), sizeBytes = sum.
   - `PACKAGE_ACQUIRING` on SYNTH-BAD-ACQ (named cause in message).
   - `PACKAGE_SYMLINK_ESCAPE` on SYNTH-LINK.
   - `PACKAGE_PATH_ESCAPE` on directoryKey `machine1/../machine1/SYNTH-001.D` AND on
     `../../etc` (expect the token from either the service pre-check or TRAVERSAL_BLOCKED —
     assert the named cause, either spelling pinned in one test each).
   - `PACKAGE_FILE_MISSING` on a tree missing FID1A.CH; SYNTH-PARTIAL REGISTERS OK (tolerates
     missing method dirs [F GC-1 :9]) with method_assets absent, no error.
   - mutation → refusal (acceptance clause 3, D7): register, then rewrite the fixture FID1A.CH
     bytes → `verifyAcquisitionPackage` throws `PACKAGE_HASH_DRIFT`; `packageAnalysisInputs`
     throws the same (that IS the submit-side refusal at GC-4's boundary); plus store-level leg:
     create a run whose inputs came from an UNmutated package, assert frozen inputs byte-stable
     after a second mutation (analysis-run payload unchanged; the FROZEN_INPUT_CHANGED executor
     compare already ships [F :432-435] — do not re-test the runner, assert the composition).
   - no-bytes invariant: walk records dir for any fixture byte / any file >1KB; `git status`
     assertion lives in the worker's verification commands (both repos), not in vitest.
2. `server/src/schema/AcquisitionPackageSchemas.test.ts` (ControlledDocumentSchemas harness [F]):
   loadAllSchemas → valid package passes; wrong-kind dataReferenceRef (`type: const` violation)
   REJECTED; unknown role REJECTED (enum); `files: []` rejected (minItems); unknown top-level key
   REJECTED (unevaluatedProperties); directoryKey with `..` REJECTED at LINT (engine-driven R4) and
   shape-valid package lints clean; every new-kind-resolves-by-$id smoke assert.
3. registry-coverage: assert registry-kinds.registry.yaml loads and includes acquisition-package
   (whatever existing coverage test pins the list — coder greps `registry-kinds` at claim time and
   extends the existing pin, gc-method's row is the model [F]).

## First targeted check

After writing ONLY acquisition-package.schema.yaml + the schema test (before service/lint/ui):

    cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/schema/AcquisitionPackageSchemas.test.ts -t 'valid'

Expected RED naming the missing kind in loader terms (not a $ref-resolution stack-trace wall; if
`./common.schema.yaml` / `./datatypes/ref.schema.yaml` won't resolve, copy the exact $ref strings
from schema/knowledge/data-reference.schema.yaml:16,72 [F] — same directory, so the paths are
identical).

## Verification commands (complete)

    cd /mnt/vast/home/brad/git/cl-integration-1/server
    npx vitest run src/storage/acquisitionPackage.test.ts src/schema/AcquisitionPackageSchemas.test.ts
    # expected: all PASS, 0 failures
    npx vitest run          # full suite green (fresh baseline: trunk moved; capture fail-file baseline at claim)
    npm run typecheck       # tsc --noEmit exit 0, zero new errors
    git -c core.fileMode=false status --porcelain   # repo 1: ONLY §Files IN scope; NOTHING under app/, config/ (real config.yaml is gitignored — it must show NO config.yaml edit), server/src/analysis/, server/src/sequences/, schema/bio/
    git -c core.fileMode=false diff --stat          # same set, no binary blobs
    git -c core.fileMode=false status --porcelain   # repo 2 = the lane records workspace (workspaceDir data dir per test setup; the orchestrator's copy) — zero fixture/.D content, zero *.CH/SAMPLE.XML bytes
    grep -rn "mnt/vast/gc-fid" server/src schema            # ZERO hits in CODE/schema (the commented config.example.yaml example is the ONE sanctioned place for the path, as CONFIG DATA documentation)
    grep -rn "gc-fid-nas" server/src --include='*.ts'       # ZERO in prod .ts; test files MAY carry the id only inside test-written config.yaml strings (D11)

## Worker contract

- Branch `cl/lane1-gc-4-<ticket>` off `cl/integration-1` at CURRENT trunk HEAD at claim time
  (this draft cites c59890af; GC-3 merges AHEAD of you — deps GC-1, GC-3. If
  `schema/lab/instrument-sequence.schema.yaml` is NOT on trunk at claim → HARD STOP, report
  "GC-3 not landed", do not proceed).
- ALWAYS `git -c core.fileMode=false`; trunk worktree /mnt/vast/home/brad/git/cl-integration-1 is
  READ ONLY — commit nothing there; your work happens in your lane worktree.
- Deliverables = §Files IN scope exactly. Report:
  `.hermes/plans/handoffs/worker-reports/gc-4-report-<ticket>.md` (lane convention).
- End-marker for the launcher: `GC4 DONE <sha>`.
- Diff discipline: any hit under app/, server/src/analysis/, server/src/sequences/,
  config/sequence-analysis/, schema/bio/, schema/lab/instrument-sequence* = STOP + report.
- The kind string is `acquisition-package` VERBATIM everywhere (GC-3 :240-248 contract) — grep your
  own diff for `acq-package|AcquisitionPackage` in string/data positions before reporting (code
  symbol names may be PascalCase; DATA strings may not).
- Config hygiene: the REAL gc-fid-nas entry goes in the gitignored lane config only; your diff
  shows the commented example in config.example.yaml ONLY.
- YAML-restart: see reminder below (stack :3092/:5192, exact PIDs, never pkill patterns).

## Reviewer bait (expect these probes — answer them IN the report)

1. **Directory hash fakery.** "Is the signal-collection DREF's contentHash the hash of the .D?"
   NO — it is sha256 over the canonical per-file manifest string (D5); the single-FILE hash
   contract per file is untouched; `createReadStream` on the directory would EISDIR [F
   LocalMountStorageProvider.ts:113 + stat-follows-symlink :106] — which is exactly WHY roles sit
   on per-file DREFs. If a coder hashes directory listings via `provider.read(directoryKey)`,
   REJECT.
2. **Symlink checked with the wrong syscall.** `stat` FOLLOWS symlinks [F :71/:90/:106]; the check
   MUST be `lstat` + `realpath` containment against `realpath(mountPath)`, in the service. A test
   that points its symlink AT A FILE INSIDE the same tree to "pass" proves nothing — the fixture
   link target lives OUTSIDE the mount root.
3. **"Fixing" the DataKind union.** It already contains `signal-collection` [F
   acquisition.ts:21] — any edit to acquisition.ts types is scope creep (REJECT), and pulling the
   DNA-side schema enum values (`sequence`, `sequence-collection`, `alignment` —
   data-reference.schema.yaml:52) into any new TS union touches DNA vocabulary — out of scope.
4. **Hardcode boundary.** Any literal `/mnt/vast/gc-fid` or `gc-fid-nas` in server/src/**.ts
   (even tests? NO — tests declare their own device with their own tmp mountPath in TEST-WRITTEN
   config.yaml, which is config data: the id string `gc-fid-nas` MAY appear in test config YAML
   strings, the mount PATH may not — the tmp path is used instead; production code: neither).
   Verification grep above enforces.
5. **Silent-skip laundering.** Registration must pin EVERY file including `uninterpreted` ones
   (ACQRES.REG, SINGLE.B). Dropping them "because we don't parse them" violates both the task's
   explicit-failure clause and D10. Similarly method-dir ABSENCE is tolerated (GC-1 partial fact)
   but method-dir PRESENCE must pin all children.
6. **ACQUIRING.TXT over-confidence.** GC-1 observed it absent NOW (report :9, AS-7 :178); the wave
   header (:7492) still defines it as the in-progress marker. Absence in the current corpus is NOT
   evidence the marker rule is dead — rule stays, test fixture exists precisely because live NAS
   can't produce it.
7. **Overstating the execute-time gap.** Do NOT claim provisionInputs re-hashes — it does not [F
   :150-177]. GC-4 refuses at resolve/verify time; NAS-side post-submit drift at EXECUTE is GC-5's
   edit (OQ-1). Report states this in one sentence, not three paragraphs of hedging.
8. **Kind-name drift.** `acquisition-package` (hyphen, lowercase) is pinned by GC-3's already
   written `type: const`. `acquisition_package`/`acq-package`/`package` = contract break.
9. **exactOptionalPropertyTypes.** Build payloads with conditional spreads
   (`...(x ? {k: x} : {})`) exactly like acquisition.ts:117-120 [F]; no `field: undefined`.
10. **ontology terms**: none required — GC-4 claims zero chemistry semantics. If a reviewer asks
    for compound/sample identity: it lives on gc-method (GC-2) and instrument-sequence-entry
    (GC-3); `sampleRef` here is an optional plain record ref, no CHEBI minting.
11. **YAML-reload trap.** lint `schemaId` must equal the exact schema `$id`
    (`https://computable-lab.com/schema/computable-lab/acquisition-package.schema.yaml`); mismatch
    = rules silently never attach.

## Stop boundaries (hard stops — write report, exit)

- **B1** `schema/lab/instrument-sequence*` not on trunk at claim (GC-3 dep) → STOP "GC-3 not landed".
- **B2 SingleFile acquisition/hash mechanism must be REUSABLE UNMODIFIED — zero sanctioned edits
  to `acquisition.ts` (its DataKind union already carries `signal-collection` [F :21]).** If
  registration cannot work through `provider.list/stat/read` + `acquireDataReference` +
  `hashStream` + `store.create` as-is — e.g. streaming hash needs a seek, or store.create rejects
  directory-key paths, or DREF id minting collides — STOP with written evidence (failing test
  output). Do NOT rewrite acquisition.ts, LocalMountStorageProvider.ts, or StorageService.
  Same for provisionInputs/analysisRunner: any needed change there is a STOP (GC-5's turf), not a
  license to edit.
- **B3** Any need to touch app/, DNA subsystems (server/src/sequences, app/src/sequences,
  config/sequence-analysis, schema/bio/sequence*), schema/core/datatypes → STOP.
- **B4** Real NAS never mounted by tests; a test that needs `/mnt/vast/gc-fid` = design error →
  STOP and report rather than read-only-touching it either.
- **B5** Governance/lifecycle rebase conflict in registry-kinds.registry.yaml → stop per standing
  rule, orchestrator rebases.
- Standing rules of task-list.md apply (orchestrator-only done-marking; browser receipts N/A —
  no UI surface ships, data-only triplet).

## YAML-restart reminder

New schema/lint/ui YAML under schema/knowledge/ takes effect on the LIVE lane stack (:3092/:5192)
only after a server restart (schemas+lint load at boot — GC-3 spec :480-486 [F-per-spec]; target
exact PIDs, never pkill patterns [F wave :7484-7485]). Vitest needs no restart (loads schema/ from
disk). The GC-3 lint allowlist for acquisitionPackageRef flips when GC-3's suite re-runs after this
lands — no code change on GC-3's side is expected; if it is, STOP (B1-adjacent).

## Scout questions (bounded, existing-code only; screening, verify before citing)

- Q1: In `StorageHandlers.ts` / `MeasurementHandlers.ts` (server/src/api/handlers/), is there an
  existing HTTP route that calls `acquireDataReference`, and what request-shape/validation gate
  does it run? (Needed to decide whether GC-4 adds a route or service-only; I verified
  acquisition.ts + handlers exist in grep hits but did NOT read the handler bodies.)
- Q2: Does `analysisService.createRun` (server/src/analysis/analysisService.ts:96+) validate that
  each `inputs` record-ref TARGET exists at submit, or is existence only checked at execute in
  provisionInputs (:150-153 BAD_INPUT 404 leg)? — determines the exact wording of D7's submit-side
  refusal claim. I read provisionInputs and the freeze compare, NOT createRun's validator.
- Q3: Does config.example.yaml have a comment style/convention for device examples (any commented
  block precedent) and is config.example.yaml validated by config/loader.test.ts (so my example
  cannot break a snapshot test)? — I verified the file exists and contains no storageDevices
  currently; did not read its full shape.

## Open questions for orchestrator (max 3)

1. **Execute-time NAS-drift enforcement (the D7 residual).** Acceptance says "a run submitted after
   source mutation is refused" — GC-4 discharges: verify-at-resolve (PACKAGE_HASH_DRIFT) + existing
   freeze re-hash [F analysisRunner.ts:432-435]. The remaining uncovered window (NAS bytes mutate
   AFTER submit, before execute) needs a provisionInputs re-hash — a runner edit I've ruled out of
   scope (GC-1 report :123 assigns runner to GC-5). Options: (a) ship GC-4 with the boundary
   documented (my default), (b) pull the ~6-line re-hash into GC-4's scope. I checked:
   provisionInputs has zero hashing today [F :150-177]; (b) grows GC-4's diff into
   server/src/analysis/. Recommend (a).
2. **Route or service-only?** The task's `files` line names `server/src/storage/` + schema + config
   docs + tests — no api/handlers path. I propose SERVICE-ONLY (no HTTP route; UI attach flow is
   later-wave per GC-D1's run-workspace framing). If a route is wanted (attach via API now), it is
   StorageHandlers-adjacent scope growth. Scout Q1 informs; decision needed at promotion.
3. **manifest `format` label + readerVersion strings** are invented-convention strings
   (`'agilent-chemstation-d'`, `'gc-4-registration/1'`) on free-string fields [F
   data-reference.schema.yaml:55-61]. Zero vocabulary collision found (grep: no existing
   readerVersion values to clash with? — I did NOT enumerate existing readerVersion values; if the
   orchestrator knows the house convention, pin it at promotion). Harmless but it is data that will
   live in records forever.

## Orchestrator promotion notes (l1t0355 tick — cite-audit + resolutions; these BIND over the draft)

CITE-AUDIT (orch first-hand vs trunk @ e688084e, 2026-10-26 ~04:15):
- acquisition.ts DataKind includes 'signal-collection' — CONFIRMED (:18-25).
- data-reference.schema.yaml required list — CONFIRMED (:109 verbatim).
- provisionInputs does NOT re-hash contentHash — CONFIRMED (analysisRunner.ts contentHash refs
  are the RecordRevisionService import :15, an output write :266, and the frozen-RUN-PAYLOAD
  compare :435 — none in provisionInputs).
- LocalMountStorageProvider.resolvePath is lexical-only — CONFIRMED (:46-54).
- registry-kinds gc-method row — CONFIRMED (:29).
- budget.ui.yaml repeater is schema/WORKFLOW/:20 — CONFIRMED (draft honors the GC-3 path slip fix).

DEFECT FIXED AT PROMOTION (D12, learned from the GC-2 browser gate THIS tick):
- The draft's UI D12 repeater (`kind: repeater` + slots) CANNOT render: the frontend
  app/src/editor/taptab/documentMapper.ts:171 skips every block kind !== 'section', and
  non-section blocks with slot claims render nothing (GC-2 gate receipts
  /home/brad/.hermes/cl/receipts/GC-2/ORCH-GATE-20261026T035058/ — defects D1/D2).
  REPLACE D12's repeater with: a SECTION block claiming an ARRAY slot
  (`path: $.files`, `widget: array`, `properties:` sub-field list per documentMapper.ts:228 —
  name/widget/label/help/required; precedent $.lines slot in schema/workflow/budget.ui.yaml:88).
  All other D12 rules stand (full-word labels, explicit slots, all slots claimed exactly once).

OPEN-QUESTION RESOLUTIONS (orchestrator, per GC-2/GC-3 precedent):
- OQ1 (post-submit NAS drift re-hash inside provisionInputs): DECLINED for GC-4 — GC-5 territory,
  exactly as D7 writes it. The gc-method lint rule already blocks silent executable use without a
  binding; GC-5 owns runner-side re-verification. Do NOT edit provisionInputs.
- OQ2 (route-or-service-only): SERVICE-ONLY approved — no HTTP route in GC-4; the triplet is
  registered via the service in tests; a registration route/UI affordance is a later item.
- OQ3 (manifest format/readerVersion convention strings): PINNED as authored
  (`format: 'agilent-chemstation-d'`, `readerVersion: 'gc-4-registration/1'`) — they are
  free-string fields on data-reference (:55-57), zero repo hits means zero collision, and they are
  honest self-describing labels, not invented vendor semantics.
