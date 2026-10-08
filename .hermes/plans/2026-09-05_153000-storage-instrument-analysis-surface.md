# Storage Devices + Instrument Coordination + Analysis Surface

> **For Hermes:** IMPLEMENTATION IS DIRECT-CODING (SOUL.md ACTIVE: DIRECT CODING
> since 2026-09-05). The subagent-driven-execution handoff is NOT used — I code
> each task myself, TDD, one commit per task.

**Goal:** Establish the storage + instrumentation foundation for computable-lab,
then build the analysis work surface on top of it. Raw instrument data lives on
external storage (S3 bucket / NAS, or a mounted USB/local stick), NEVER in git.
CL keeps a *reference* + hash to that data. The plan produces the platemap, the
vendor instrument returns a file, CL reads it back from storage, ties it to the
event-graph plate layout, and analysis consumes the event graph + the referenced
file. Settings connects CL to an **arbitrary number of storage devices**.

**Architecture:** Split the repo into a **control plane** (git-backed: schemas,
scripts, manifests, platemap CSVs, parameters, data *references*, derived
summaries) and a **data plane** (raw instrument outputs, large arrays, images —
on S3 or a local mount). A `StorageProvider` abstraction (`s3` | `local-mount`)
is registered in config (gitignored; secrets via env like repositories). A
`data-reference` record points to a file on a device. Instrument coordination =
event graph → platemap CSV export (already exists: `PlateMapExporter`) +
return-data acquisition (browse storage, register output file as a dataset,
link to run/plate). The analysis surface is the third leg and consumes
storage-referenced datasets.

**Tech Stack:** TypeScript (server Fastify, app React+Vite), YAML JSON-Schema
2020-12 (Ajv), Python 3.12 (/usr/bin/python3) for the analysis SDK/runner,
@aws-sdk/client-s3 (s3 provider — MUST be a runtime-optional dep; local-mount
needs no SDK), existing `PlateMapExporter` / `InstrumentRunFile` / `QuantStudioEmitter`,
existing `SurfaceContext` + corpus seam, vitest / python unittest.

---

## Locked design decisions (from Brad, 2026-09-05 — do not reopen)

1. **Large binary NEVER in git.** Raw instrument data, big arrays, images, and
   membership masks live on a storage device. Git holds schemas, code, small
   manifests, platemap CSVs, and `data-reference` POINTERS (device id + path +
   content hash). Reproducibility bundles stream/download from storage, not git.
2. **Two acquisition modes, both supported.** (a) Preferred: lab S3 bucket or NAS
   (`type: s3`). (b) Dis-preferred but must work: user brings data on a USB stick
   plugged into the CL appliance (`type: local-mount`, e.g. a mounted path). A
   provider abstraction makes both first-class.
3. **Settings connects to an ARBITRARY NUMBER of storage devices.** Reuse the
   `repositories[]` config precedent: config.yaml (gitignored) array +
   Settings UI editor. Secrets (S3 keys) referenced from env vars, never baked in.
4. **The CL run keeps a REFERENCE to the raw data** — even in the near-future
   world where CL drives the instrument directly (Gemini already demonstrated),
   the raw output lands on a storage device and the run references it. Determined
   by a `data-reference` record + optional `sourceRunRef` link.
5. **Instrument coordination is first-class, not an afterthought.** The round-trip
   is: event graph → platemap CSV (vendor import) → instrument output file →
   save to storage → CL browses storage, registers it, maps to plate layout →
   analysis uses event graph + file. Direct instrument control is a NEAR-FUTURE
   extension of the existing execution/compiler emitter seam, not a blocker for
   this plan.

---

## Grounded facts (from inspection, 2026-09-05)

- **A real NAS is available NOW.** Lab NAS `vast` (Tailscale mesh; direct conn).
  NFS share `vast:/mnt/BigPool/shared` is currently mounted on the dev host at
  `/mnt/vast` (the `/mnt/BigPool/shared` path is the SERVER-side path, NOT the
  local mount; local mount point is `/mnt/vast`). It is NFS4 rw and writable by
  `brad`. This is the natural default `local-mount`/`s3` device for the lab's
  raw instrument data. Caveat: the share currently holds a `home/brad/`
  homedir tree; choose a dedicated data subdir for CL (e.g. a `computable-lab-data/`
  root) rather than the NFS root.
- **Chosen CL data root (created 2026-09-05):** `/mnt/vast/computable-lab-data/`
  (owned by uid 3000, mode `drwx------`, writable by `brad`). This is the
  dedicated device root the raw-data device will point at.
- `PlateMapExporter` (server/src/execution/PlateMapExporter.ts) already exports an
  event graph → CSV/TSV platemap with inferred per-well material/volume. Wired
  into compiler + MCP tools (`server/src/mcp/tools/executionTools.ts`). Tested
  (`PlateMapExporter.test.ts`).
- `InstrumentRunFile` (server/src/compiler/artifacts/InstrumentRunFile.ts) +
  `QuantStudioEmitter.ts` emit vendor run files (wells/channelMap/target) via an
  emitter registry pattern.
- `ArtifactBlobStore` (server/src/ingestion/ArtifactBlobStore.ts) writes base64
  blobs INTO the git workspace (sha256). This is the binary-in-git antipattern to
  REPLACE for raw instrument data.
- `config.example.yaml` declares `repositories[]` (git, secrets via `${GITHUB_TOKEN}`).
  This is the template for `storageDevices[]`.
- Settings sections follow a `Section` pattern (RepositorySection, LabProfileSection,
  NamespaceSection) under app/src/shell/settings/ — a `StorageDevicesSection` slots in.
- `SurfaceContext` + `surface: 'analysis'` (already registered, schema/registry/surfaces)
  + corpus seam (server/src/corpus/surfaceContextCorpus.ts, opt-in local JSONL via
  `CLA_CORPUS_LOCAL_PATH`) all present.
- No S3 SDK in server/package.json yet — must be added as runtime-optional.
- `app/src/App.tsx` has no `/analysis` route (find at ~172, settings at ~173).

---

## Phases

### Phase 1 — Storage device foundation

#### Task 1.1: Storage device config schema + provider abstraction (TDD)

**Files:**
- Create `server/src/storage/types.ts` — `StorageDevice` config, `StorageProvider`
  interface (`list(path)`, `stat(path)`, `read(path)`, `write(path, stream)`,
  `delete(path)`), `StorageConstError`s.
- Modify `server/src/storage/S3StorageProvider.ts` (Create) + `server/src/storage/LocalMountStorageProvider.ts` (Create).
- Modify `server/src/storage/createStorageProvider.ts` — factory from a device config; lazy-import S3 SDK only for `type: 's3'` so local-mount works without it.
- Modify `server/src/server.ts` — read `config.storageDevices[]`, build a `StorageService` (registry of devices → providers).

```ts
export type StorageDeviceKind = 's3' | 'local-mount'
export interface StorageDevice {
  id: string
  label: string
  kind: StorageDeviceKind
  default?: boolean
  // s3:
  endpoint?: string; region?: string; bucket: string; pathPrefix?: string
  // secrets by env ref, never literal:
  accessKeyEnv?: string; secretKeyEnv?: string
  // local-mount:
  mountPath?: string
}
export interface StorageProvider {
  list(path: string): Promise<string[]>
  stat(path: string): Promise<{ sizeBytes: number; contentType?: string; modifiedAt?: string }>
  read(path: string): Promise<NodeJS.ReadableStream>
  write(path: string, stream: NodeJS.ReadableStream): Promise<void>
  delete(path: string): Promise<void>
}
```

`geo-` rules: no hardcoded buckets; unknown device → error. config.yaml is
gitignored; `@aws-sdk/client-s3` added to server/package.json deps.

**Step 1:** failing test `server/src/storage/StorageService.test.ts` — factory
returns a LocalMount provider from a `{kind:'local-mount', mountPath}` config and
lists/writes/reads a temp file; unknown kind throws.
**Step 2:** FAIL. **Step 3:** implement types + factory + LocalMount (pure fs,
no SDK) + StorageService. **Step 4:** PASS.
**Step 5:** Commit `feat(storage): storage device config + local-mount provider + service`.

#### Task 1.2: S3 provider (runtime-optional) + MinIO/mock test

**Files:**
- Create `server/src/storage/S3StorageProvider.ts` — lazy `import('@aws-sdk/client-s3')`
  inside the class (no top-level import → no startup cost / no SDK requirement for local-only).
- Add `@aws-sdk/client-s3` to server/package.json.

**Step 1:** failing test `server/src/storage/S3StorageProvider.test.ts` — register a
mock provider that returns a fixed listing; assert `list/stat/read` calls flow.
**Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
**Step 5:** Commit `feat(storage): s3 provider (lazy SDK)`.

#### Task 1.3: Serve storage devices + browse API

**Files:**
- Modify `server/src/storage/StorageService.ts` — add `listDevices()`, `browse(deviceId, path)`.
- Modify `server/src/api/handlers/StorageHandlers.ts` (Create) + `server/src/api/routes.ts`.
  Routes: `GET /api/storage/devices`, `GET /api/storage/devices/:id/browse?path=`.
- Modify `app/src/shared/api/client.ts` — `listStorageDevices()`, `browseStorage(id, path)`.

**Step 1:** failing test (handler) — browse a local-mount temp dir returns file names.
**Step 2:** FAIL. **Step 3:** implement. **Step 4:** PASS.
**Step 5:** Commit `feat(storage): browse API + client`.

#### Task 1.4: Settings — Storage Devices section (arbitrary count)

**Files:**
- Create `app/src/shell/settings/StorageDevicesSection.tsx` — list devices, add/remove,
  edit kind + endpoint/bucket/mount path + env-ref for credentials.
- Modify `app/src/shell/settings/index.ts` — export it; wire into SettingsPage.
- Reuse `apiClient.getConfig()` / config save (like RepositorySection).
- TDD `app/src/shell/settings/StorageDevicesSection.test.tsx` — renders devices from
  a mocked `getConfig`, allows adding a second device.
- **Live-verify (SOUL):** Settings → Storage Devices → add a `local-mount` device
  pointing at a temp dir; it appears in the list. (Do NOT require live S3 to pass —
  credential config is optional.)
- Commit `feat(storage): Settings Storage Devices section`.

### Phase 2 — Data-reference model + acquisition

#### Task 2.1: `data-reference` schema (pointer, never the bytes)

**Files:**
- Create `schema/knowledge/data-reference.schema.yaml` (FAIRCommon mixin) — required:
  `storageDeviceId`, `path` (or key), `contentHash` (sha256), `sizeBytes`, `kind`
  (`table`|`signal`|`image`|`binary`), `format` (`csv`,`fcs`,`txt`,`xlsx`…), optional
  `sourceRunRef`, `acquisitionContext`, `readerVersion`.
- TDD `server/src/storage/dataReference.test.ts` — a valid reference validates; missing
  `contentHash` fails (load ALL schemas into Ajv — the unevaluatedProperties pitfall).
- Commit `feat(storage): data-reference pointer schema`.

#### Task 2.2: Register an instrument output file from storage (acquire)

**Files:**
- Create `server/src/storage/acquisition.ts` — given a device + path, `stat`+`read` to
  stream, compute sha256 (do NOT store bytes), create a `data-reference` record,
  optional link to an event-graph run (`sourceRunRef`).
- Modify `server/src/api/handlers/StorageHandlers.ts` + `routes.ts`:
  `POST /api/storage/acquire { deviceId, path, sourceRunId?, kind, format }`.
- TDD — acquire a temp CSV → returns a data-reference with matching sha256; the raw
  bytes are NOT written to `records/` (unit-test the pure hash+record builder, mock the
  provider read).
- Commit `feat(storage): acquire instrument output → data-reference`.

### Phase 3 — Instrument coordination (round-trip)

#### Task 3.1: Expose platemap CSV export endpoint (finish the existing leg)

**Files:**
- `PlateMapExporter` exists; add an HTTP endpoint so the UI can produce the CSV the
  vendor software imports. Modify `server/src/api/handlers/MeasurementHandlers.ts` (or
  a new `PlateMapHandlers.ts`) + `routes.ts`:
  `POST /api/run/:runId/platemap/export { format: 'csv'|'tsv', labwareId? }` → returns CSV content.
- Add `apiClient.exportPlateMap(runId)` client method.
- TDD `server/src/execution/PlateMapExporter.test.ts` already covers CSV shape; add a
  handler test (route returns 200 + CSV header).
- Commit `feat(platemap): HTTP endpoint for vendor platemap export`.

#### Task 3.2: Return-data → plate-layout mapping (browse → acquire → tie to event graph)

**Files:**
- Create `server/src/storage/plateMapping.ts` — given a data-reference (instrument output)
  + an event-graph run's plate snapshot, map well/barcode IDs in the file to plate rows/cols
  (reuse PlateMapExporter's well-state knowledge or labware well identity). Ambiguous
  identity → requires user mapping (spec §6), never guess by filename.
- Modify `app/src/graph/run-workspace/RunChatPanel.tsx` or a new acquisition surface — a
  "Link instrument output" control: browse storage → pick file → acquire → map to plate.
- TDD `server/src/storage/plateMapping.test.ts` — a CSV with well column maps rows to the
  plate layout; ambiguous → returns a mapping-required error.
- Commit `feat(storage): return-data → plate-layout mapping`.

**Near-future (NOT this plan):** direct instrument control (Gemini) extends the existing
execution/compiler emitter seam; the run still writes raw output to a storage device and
records a `data-reference`. Note as a follow-up, do not build.

### Phase 4 — Analysis surface on storage-referenced datasets

> Builds on the prior Slice A plan, but inputs are storage-referenced
> data-reference records + the event graph, NOT git files. Raw output lives on
> the storage device; git holds the manifest + references.

#### Task 4.1: Analysis record schemas + CRUD (same as earlier Slice A, adjusted)

- `analysis-revision`, `analysis-run`, `analysis-output-artifact`, `view-spec` schemas
  (schema/knowledge/), `analysisService.ts`, handlers + routes
  (POST/GET /api/analysis-revisions, /api/analysis-runs, GET run status).
- Input contract entries now reference `data-reference` by id (not a git file path).
- TDD as earlier (all-schemas Ajv load). Commit.

#### Task 4.2: Python SDK `computable_lab_analysis` — ctx reads storage-referenced inputs

**Files:**
- Create `server/python-executor-service/src/computable_lab_analysis/` (ctx.py + runner.py).
- `ctx.input(name)` returns a handle whose bytes thread from the runner (which streamed
  from the provider), NOT paths the script hardcodes. Support `kind: table/signal/static-figure/metric`.
- TDD py tests (python -m unittest). Commit.

#### Task 4.3: Runner — mount storage, execute, commit manifest (never raw bytes)

**Files:**
- Modify `server/src/analysis/analysisRunner.ts` — resolve data-reference inputs via
  `StorageService` (stream reads into a temp working dir), spawn the python subprocess,
  capture the output manifest; write SMALL outputs (manifest JSON) as a git record;
  WRITE LARGE artifacts to the analysis run's configured storage device and record a
  `data-reference`. Failure → failed run with stderr; never partial.
- TDD `analysisRunner.test.ts` (fixture script publishes a table + metric; raw input is a
  temp local-mount file, manifest record created, large output goes to a temp local-mount
  device). Commit.

#### Task 4.4: ViewSpec → React renderer + `/analysis` route + page

- `ViewRenderer` (table/metric/signal SVG/static-figure) — no chart lib.
- `app/src/analysis/AnalysisPage.tsx` + route in App.tsx (near :173).
- Add `apiClient.listAnalysisRuns()/getAnalysisRun()/getAnalysisArtifact()`.
- TDD app tests. **Live-verify (SOUL):** /analysis renders, run succeeds, table+signal
  shown against a temp local-mount dataset. Commit.

#### Task 4.5: Corpus capture SurfaceContext(analysis) → accepted result

- Server-side on successful run commit: `buildSurfaceContextCorpusEntry({ surfaceContext,
  goal, acceptedGraph: manifest })` + `captureSurfaceContextPairToLocal` (respects
  `CLA_CORPUS_LOCAL_PATH` opt-in).
- TDD `analysisCorpus.test.ts` — env toggle set → JSONL line with
  `prompt.surfaceContext.surface === 'analysis'`, acceptedGraph non-empty. Commit.

#### Task 4.6: Headless reproducibility (A03/A15) on the storage device

- Author a manual GC-trace analysis (Slice B) reading a `data-reference` (time/intensity)
  → area under stated window → peak table. Bundle = entry.py + manifest + data-reference
  + inputs manifest (raw data pulled from storage, not embedded).
- Headless command: `python -m computable_lab_analysis run ./bundle --inputs .
  --storage <device>` reproduces the fixture area within tolerance. Commit.

---

## Deferred (park — do not build)

- **Direct instrument control** (Gemini) — follow-up to the existing execution/compiler
  emitter seam; raw data still → storage device + reference.
- **AI authoring of analysis scripts** — reuse the Foundry loop shape after Slice A.
- **Container-level isolation** (§11) — subprocess runner only for now.
- **FCS/gating, plate-reader calibration** — later slices.
- **Adding a chart lib** — not needed (SVG + table for Slice A).

## Risks / tradeoffs

- **S3 SDK dependency** — runtime-optional (lazy import); local-mount works with zero deps.
  S3 correctness must be verified against a real/MinIO bucket before claiming A01.
- **Secret handling** — no keys in git; env-ref via config (matches repositories).
- **Filename vs identity** — cross-instrument joins by resolved well/sample id, never
  filename similarity (§6 + locked #5); ambiguous → user mapping.
- **Reproducibility with data on storage** — A03/A15 require the device/bundle be
  reconstructible; raw data streamed, not embedded.
- **ArtifactBlobStore** — keep for small ingestion blobs; do not route raw instrument
  output through it.

## Validation checklist

- [ ] typecheck app + server clean
- [ ] vitest server: storage, data-reference, analysis, corpus green
- [ ] vitest app: StorageDevicesSection, ViewRenderer, AnalysisPage green
- [ ] python unittest: SDK + fixture green
- [ ] no regression: surfaceContext, corpus, PlateMapExporter, existing tests pass
- [ ] Live: Settings → Storage Devices (add N devices); /analysis run against a temp
      local-mount dataset renders table+signal; corpus JSONL written on accept
- [ ] Round-trip smoke: event graph → platemap CSV fixture reproduces known well
      state (PlateMapExporter test extends); a temp "instrument output" file registered
      via acquire maps to the plate layout
- [ ] Headless replay reproduces fixture area within tolerance from a storage device