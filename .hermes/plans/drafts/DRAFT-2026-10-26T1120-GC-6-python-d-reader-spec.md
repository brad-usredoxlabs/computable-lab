# GC-6 spec: Python .D reader in the SDK — real channel → signal, UTF-16 metadata → structured

DRAFT by cl-spec-composer (lane 1, run 2026-10-26T1120, trunk cl/integration-1 @ 48340a98). NOT
orchestrator-reviewed; not dispatchable until promoted. Every [F] cite below was opened FIRST-HAND
this session against the trunk worktree /mnt/vast/home/brad/git/cl-integration-1 (git -c
core.fileMode=false) and, where marked [F-fixture], against the real NAS bytes of
/mnt/vast/gc-fid/machine1/RES35077-4.D (read-only, zero writes).

## Goal (one sentence)

Ship a reader module inside the shipped Python SDK (`server/python-executor-service/src/computable_lab_analysis/`)
that turns an acquisition-package's provisioned `.CH` bytes into a `{axis, values}` signal with GC-1's
verified v181 decode (channel identity, pA units, scale/intercept, exact point count) and its UTF-16LE
`SAMPLE.XML` + `RUN.LOG` into lossless structured records with unrecognized lines kept accessible —
failing explicitly on corrupt/truncated files, emitting reader identity+version into the run manifest
for GC-5's `engineProvenance`, and routing large signals out as data-reference-backed artifacts, never inline.

## Status legend

- **[F]** = confirmed fact, cite opened first-hand this session (path:line into trunk @ 48340a98).
- **[F-fixture]** = confirmed fact read from the real NAS bytes this session (read-only commands).
- **[G1]** = binding from the GC-1 promoted report `.hermes/plans/2026-10-26_GC-1-gc-feasibility-spike-report.md`
  (cited by its own line numbers; NOT re-derived here, NOT re-litigated).
- **[GC4]** / **[GC5]** = shape inherited from the promoted GC-4 / GC-5 specs (cited by their line numbers).
- **[I]** = inference / design decision of this spec, flagged for the orchestrator.

## Authority (read in this order; scope is theirs, not mine)

1. Task block GC-6, `/home/brad/.hermes/cl/lanes/1/task-list.md:7766-7788` — description (:7772-7779)
   and `verified by` (:7783-7786) are BINDING. `files:` (:7787-7788) = "server/python-executor-service/src/
   (reader module + tests), runner input provisioning touch".
2. Wave intake `~/.hermes/specs/intake/2026-10-25_gc-chemstation-analysis-cycle/intake-packet.md`:
   GC-D ruling — bytes never enter TS, the reader lives behind the SDK contract (intake :27 SDK
   DatasetHandle facts, :35 NAS ground truth, :39 "bytes never in git").
3. GC-1 promoted report — decode decision, tolerances, unknowns (the reader's output contract).
4. GC-4 promoted spec `.hermes/plans/2026-10-26_GC-4-nas-package-registration.md` (package triplet,
   per-file DREFs, signal-collection manifest — the reader's CONSUMED upstream).
5. GC-5 promoted spec `.hermes/plans/2026-10-27_GC-5-engine-registry.md` (engineProvenance shape the
   reader version folds into).
6. Handoffs 79th–85th `.hermes/plans/handoffs/` — house conventions (commit-after-every-step 83rd §3,
   OQ-fold precedent 85th, end-markers, lane-stack rules).

## Authority-boundary NOTE (verified this session — do not skip)

GC-4 and GC-5 are **specs promoted, code NOT yet on trunk**: `grep -rn "registerAcquisitionPackage|
engineProvenance|acquisitionPackage" server/src schema` = ZERO hits at 48340a98 [F]. GC-3 r3 was live
at the 85th handoff. Therefore GC-6 codes against the **shipped names pinned by the promoted specs**
(`acquisition-package`, role enum values, `engineProvenance` property name, `packages: [{name, required,
actual}]` shape) and MUST NOT redefine, rename, or re-lint any of them. See OQ1 for the claim-order
ruling this creates.

## Oriented facts — shipped reality [F], every line opened first-hand

- [F] **SDK package layout** — `server/python-executor-service/src/computable_lab_analysis/` contains
  exactly `__init__.py`, `__main__.py`, `ctx.py` (3 files; `find` this session). The sibling package
  `python_executor_service/` (claim_loop, runners/) is the execution-task daemon — a DIFFERENT
  subsystem; the analysis SDK is `computable_lab_analysis`.
- [F] `computable_lab_analysis/__init__.py:22-23` — `__version__ = "0.1.0"`, `__all__` exports
  `run, Context, OutputManifest, DatasetHandle, RuntimeContext`. Reader identity/version extends HERE.
- [F] `ctx.py:30-72` — `DatasetHandle(name, data_kind, path, inline, meta)`; `read_signal()` returns
  `{"axis","values"}`: inline dict passthrough (:46-47), else CSV text parse (:48-52) — the header
  comment at :50 literally says **"robust parsing belongs to the runner/readers"** — this is the
  extension seam the reader plugs into. `read_rows()` :54-60, `file_bytes()` :62-68, `source_path`
  :70-72.
- [F] `ctx.py:136-196` — `Artifact` carries an optional `blob` dict `{path, sha256, sizeBytes, format}`
  (:143-145); `OutputManifest.to_dict()` spreads it into the manifest (:174).
- [F] `ctx.py:251-288` — `Context.publish_file(name, path, kind, format, units, schema)`: hashes the
  file in-stream, raises on missing/non-file (:269-272), sets `blob` (path/sha256/sizeBytes/format)
  (:280-285). THE existing file-emission path → the data-reference-backed large-signal route.
- [F] `ctx.py:219-236` — `Context.input(name)` resolves `spec["path"]`, else
  `input_dir/<name>.csv` (:227), and copies `spec["meta"]` onto the handle (:235) — the carrier slot
  for reader-relevant input metadata.
- [F] `ctx.py:319-327` — `ctx.log(message, level, code)` and `ctx.progress` append manifest logs;
  the failure-reporting surface on the Python side.
- [F] `ctx.py:336-361` — `run(entry_path, ctx)` imports the entry module, calls `run(ctx)` once.
- [F] `__main__.py:21-73` — CLI `python -m computable_lab_analysis run <entry> --inputs <json>
  --parameters <json> --input-dir <dir>`; any exception → `{"ok": false, "error":
  "TypeName: msg"}` on stderr, exit 1 (:67-69). Reader failures ride this channel.
- [F] `pyproject.toml:5-9` — project `python-executor-service` 0.1.0, `requires-python >=3.10`,
  **[project] has NO dependencies key** — zero runtime deps is the shipped fact. The reader must run
  stdlib-only (see D1).
- [F] `analysisRunner.ts:27` `DEFAULT_PYTHON='/usr/bin/python3'`; :32-53 `analysisSdkDir()` (env
  `CLA_ANALYSIS_SDK_DIR` first, module-relative fallback, `__init__.py` existsSync probe :41) — any
  module added under `computable_lab_analysis/` is importable automatically; zero runner change needed
  for discovery.
- [F] `analysisRunner.ts:55-60` `InputSpec {dataKind, path, inline?}` — the TS→SDK input contract.
- [F] `analysisRunner.ts:107-179` `provisionInputs`: each named input resolves a `data-reference`
  (:150-161) or `analysis-output-artifact` → its dref (:122-149); streamed to
  `<inputDir>/<name>.bin` (:166-172); dataKind propagated (:161). **A `signal-collection` manifest
  DREF read here would EISDIR** (GC-4 spec's [F] at LocalMountStorageProvider :113; provisionInputs
  calls `provider.read(path)` :167 on the raw path).
- [F] `analysisRunner.ts:182-225` `runPython` — spawns `python -m computable_lab_analysis run` with
  `PYTHONPATH=sdkDir` (:198); non-zero exit → `RUN_FAILED` naming stderr (:210).
- [F] `analysisRunner.ts:314-327` — **large-value routing already exists**: blob artifacts and JSON
  values ≥ 50,000 chars go to `persistToStorage` → storage bytes + minted `data-reference`
  (:232-283); small values stay `inlineValue` (:340). The "never inline" acceptance clause is
  DISCHARGED by `publish_file` + this existing routing — no TS delta.
- [F] `analysisRunner.ts:452-460` dispatch site (`sequenceMethod ? … : runPython` — GC-5's turf);
  :432-436 frozen-field re-check; :437-438 idempotent success return; :476-481 completion write — the
  site GC-5's `engineProvenance` occupies. GC-6 does not touch it.
- [F] `analysisRunner.ts:469` — every artifact gets
  `sourceRelations = Object.values(runPayload.inputs)`: provenance to input DREFs is ALREADY recorded
  by the runner; source file hashes ride the DREF records themselves (GC-4 pins contentHash).
- [F] Test harness: `analysisRunner.test.ts:19-59` — tmp mount dir + tmp workspace, TEST-WRITTEN
  config.yaml with local-mount device `usb0` (:45-49),
  `new AnalysisRunner(ctx, '/usr/bin/python3', resolve(process.cwd(), 'python-executor-service', 'src'))`
  (:58). This is the runner-backed integration harness GC-6's vitest leg copies.
- [F] Python test suite runs today: `cd server/python-executor-service && PYTHONPATH=src
  /usr/bin/python3 -m unittest discover -s tests` → "Ran 18 tests … OK" (executed this session; plain
  discover WITHOUT PYTHONPATH fails ImportError — the env var is part of the command, 6 pre-existing
  files in tests/, unittest style, no pytest installed on /usr/bin/python3 [F: `No module named pytest`]).
- [F] Schema carriers the reader fills (no edits): `schema/knowledge/data-reference.schema.yaml` has
  free-string `format` (:55) and `readerVersion` (:59) fields; `analysis-output-artifact` /
  `view-spec` payloads are built by the runner verbatim from manifest fields (:329-343, :377-382).
- [F] Trunk @ 48340a98 = 85th handoff + GC-2R merge. GC-3 r3 live, GC-4/GC-5 coders NOT dispatched.

### Real-fixture ground truth [F-fixture] (RES35077-4.D, read-only this session)

- [F-fixture] `/mnt/vast/gc-fid/RES35077-4.D` does NOT exist; the fixture lives at
  `/mnt/vast/gc-fid/machine1/RES35077-4.D` (`ls /mnt/vast/gc-fid/` = `machine1` only).
- [F-fixture] Contents confirmed = GC-1's inventory: `FID1A.CH` 75,846 B · `RUN.LOG` 4,786 B ·
  `SAMPLE.XML` 548 B · `SAMPLE.MAC.bak` 300 B · `SINGLE.B` 1,675 B · `ACQRES.REG` 3,750 B · `ACQ.M/`
  (8 entries incl. ACQ.TXT 1,932 B, rpthead.txt 2,808 B) · `DA.M/` (7 entries, = ACQ.M minus ACQ.TXT).
  No ACQUIRING.TXT.
- [F-fixture] Fresh sha256 pins (for the manual smoke script; identical file sizes to GC-1's table):
  FID1A.CH `a13bcd0e0f409fec1d81e6fd273c467df00f0c647d3892a20cad7803f21300` ·
  SAMPLE.XML `d38cefcc2ab44116f9a8c2ba235203cd3e8fb726ab1d445575b97575815cb876` ·
  RUN.LOG `d07a4cd771c32ae96075f91c9daf6eced10da651c8b6cb6acfb3ff46f8827409`.
- [F-fixture] **Both metadata files carry a UTF-16LE BOM `FF FE`** (decoded first-hand). SAMPLE.XML
  decodes to `\ufeff<?xml version="1.0"?>\r\n<Sample>…` with fields beyond GC-1's abbreviated quote:
  `<Version>0</Version>`, `<Description></Description>` (empty), `<TargetMasses />` (empty),
  CRLF line endings, `<ISTDs><ISTD Num="1">0</ISTD></ISTDs>`. RUN.LOG = 46 lines, mixed shapes —
  recognizable lines ("Method       Method started … 10:08:18 10/23/26") ALTERNATE with opaque hex
  event-code lines ("  67 41e2 6adb7862    0") → the "unrecognized lines stay accessible" clause is
  load-bearing on the REAL file, ~half its lines.
- [F-fixture] Decode pins verified this session by re-running the **canonical GC-1 decoder D
  semantics** (/tmp/gc1-decD.py:21-50, promoted artifact of the GC-1 spike) against the real bytes:
  RES35077-4.D = `n=28812, slots=34851, escapes=2013, escape_tag_nonzero=0, offset=6144,
  scale=1.302083401242271e-4, intercept=0.0, first5 pA=[10.671, 10.758, 10.805, 10.964, 10.872],
  max=400112.8313 pA @ 4.6074 min` — EXACT agreement with GC-1 :40/:52. Cross-file agreement re-run:
  RES35077-5.D (n=52216, esc=2185, max 155916.5549 @ 8.1247) and 20201023-KERRYGOLD.D (n=48757,
  esc=858, **esc_tag_nonzero=400**, max 585602.8158 @ 4.5556) — the KERRY tag≠0 count [G1:99]
  REPRODUCED first-hand (RES4/RES5 = 0): the reader's escape-tag audit has a real nonzero case in
  the corpus, and these three triples (n, esc, esc_tag, max, RT) are the manual-smoke expectations.
  **WARNING the composer hit live:** a simplified variant accumulator (`b2=(b2+slot)&0xFFFF …`)
  reproduces n/max on RES4 but corrupts the tail (my throwaway run's last5 disagreed with decD's)
  and mis-decodes RES5/KERRY entirely (wrong n, esc=14/24 vs 2185/858). The reader MUST implement
  decD's exact loop (reviewer bait #10).

### Binding decode contract [G1] (from the promoted GC-1 report; cited, not re-derived)

- Format v181 [G1:33, AS-1 @ :172]: header 6,144 B; body start `page = u32BE@264` → `offset =
  (page-1)*512`; version marker `b[326]==3` AND `b[327:331]=="1\x008\x00"` → version 181; time axis
  `t0=f32BE@282`, `t_end=f32BE@286`, LINEAR over n points; scaling `intercept=f64BE@4724`,
  `scale=f64BE@4724+8` → `signal(pA) = raw*scale + intercept`.
  **ERRATA vs the report's own promoted decoders (verified first-hand this session against
  /tmp/gc1-decA.py / decB / decD — the CODE is authority, the prose is abbreviated):** (i) t0/t_end
  raw f32 values are NOT minutes — all three decoders divide by 60000; (ii) slots are BIG-endian
  int16 (report prose says "little-endian"; LE mis-decodes every corpus file); (iii) the body
  accumulators are unbounded Python ints, not int16-wrapped. D2 encodes the corrected reading.
  (OQ3 asks the orch to accept this errata fold rather than re-litigating [G1] prose.)
- Body [G1:35 as prose — corrected by the errata above]: double-difference `b1 += slot; b2 += b1;
  raw = b2`; 4-slot escape: slot0==32767, `level = slot1*2**32 + u32BE(slots 2..3)`, `b1 = 0`,
  4 slots consumed [G1:35, AS-2 @ :173].
- Units pA; scale `1.302083401242271e-4` pA/count constant across the corpus [G1:45, AS-3 @ :174].
- RES35077-4 expected decode [G1:40]: n=28,812, escapes=2,013, t0=0.000214, t_end=9.604214,
  dt=20.001 ms (50.0 Hz).
- **Tolerances [G1:86-94, :152-158]:** point count / escape count / body offset / scale / intercept:
  EXACT. t0/t_end: |Δ| ≤ 2e-7 min. Per-point values: three-decimal pA agreement across decoders.
  Peak-level comparison tolerances (RT ≤ 0.02 min, height ≤ 5%, area ≤ 10%, per-point |Δ| ≤
  max(1%, 5 pA)) bind GC-7/GC-10, not the reader — the reader itself must be EXACT.
- Escape-tag honesty [G1:99, :189]: "Any production parser must audit this flag distribution" —
  KERRY-style slot1≠0 escapes must be counted and reported, never silently absorbed or rejected.
  (85th handoff carries "KERRY escape-tag audit → GC-6" as an open assumption — this spec discharges it.)
- Unknowns stay UNKNOWN [G1:96-104]: no vendor spec exists; the version-marker rule (below) is the
  honest boundary, not a claim of vendor confirmation.
- `.M` method assets stay referenceable-but-opaque [G1:145-150]; no `.M`/`.REG`/`.B` parsing in GC-6.
- Python environment [G1:105-123]: numpy/scipy absent on /usr/bin/python3; venv provisioning is
  GC-5's job; the reader must not assume numpy exists (D1).

### Upstream shapes consumed (cited, NOT restated, NOT redefined)

- [GC4:221-228] package `files[]` items `{relativePath, dataReferenceRef, role}`; role enum
  `signal_channel | sample_metadata | run_log | method_asset | uninterpreted`. [GC4:242-254] the
  `signal-collection` manifest DREF (`dataKind: 'signal-collection'`, `path = directoryKey`,
  `format: 'agilent-chemstation-d'`, `readerVersion: 'gc-4-registration/1'`). [GC4:256-264]
  `packageAnalysisInputs` yields PER-FILE `name → data-reference` inputs — the reader's actual
  upstream. **The reader must never assume `packageAnalysisInputs`'s input naming** — it discovers by
  extension/encoding (D3), so any naming the GC-4 coder chose works.
- [GC5:280-287] `engineProvenance` = engineRef, engineRecordId, engineVersion, adapter,
  interpreterPath, interpreterVersion, `packages: [{name, required, actual}]`, probedAt,
  capabilitiesReported. GC-5's OQ3 fold (spec :17-18): "GC-6's reader-version provenance merges into
  engineProvenance later without touching this shape." GC-6's emission = manifest
  `reader: {name, version}` [I], consumed downstream as `engineProvenance.packages` entry
  `{name: 'computable_lab_analysis', required: <revision sdkVersion>, actual: __version__}` +
  `{name: 'computable_lab_d_reader', required: <READER_VERSION>, actual: READER_VERSION}` [I].
  Zero GC-5 file edits.

## Files IN scope

- `server/python-executor-service/src/computable_lab_analysis/d_reader.py` (NEW — the whole reader)
- `server/python-executor-service/src/computable_lab_analysis/__init__.py` (EDIT: export
  `attach_package_inputs` + `READER_NAME`/`READER_VERSION`; `__version__` bump 0.1.0→0.2.0 per OQ4)
- `server/python-executor-service/src/computable_lab_analysis/ctx.py` (EDIT, small + additive: D3)
- `server/python-executor-service/src/computable_lab_analysis/__main__.py` (EDIT only if a
  manifest-level `reader` key needs a line; prefer zero — see D4)
- `server/python-executor-service/tests/test_d_reader.py` (NEW — decode/metadata/corruption unit tests)
- `server/python-executor-service/fixtures/gc-d/` (NEW dir: synthetic .D tree + v181 `make_d_fixture.py`
  generator; generator + tiny synthetic bytes only, NO real NAS bytes in git — the precedent is
  `fixtures/gc-area/` [F: exists on trunk])
- `server/src/analysis/analysisDReader.test.ts` (NEW vitest: runner-backed integration on the
  synthetic .D tree, harness = analysisRunner.test.ts pattern [F])
- `.hermes/plans/scripts/gc6-nas-smoke.sh` (NEW, lane-only runbook script, read-only NAS)

## Files EXPLICITLY OUT of scope

- `schema/**` — every record shape the reader touches already exists (`format`/`readerVersion` are
  free strings [F: data-reference.schema.yaml:55,:59]; manifest is data). Zero schema/triplet edits.
- GC-4's deliverables: `server/src/storage/acquisitionPackage.ts`, `schema/knowledge/
  acquisition-package.*.yaml`, `schema/registry/registry-kinds.registry.yaml` — REFERENCE the shipped
  role-enum strings; do not define, rename, or extend them. Any gap found = STOP (B2).
- GC-5's deliverables: `server/src/analysis/analysisService.ts`, engine triplet, coverage-pin test
  lists, the `engineProvenance` write site (analysisRunner.ts:476-481) — the reader emits INTO the
  manifest; folding into `engineProvenance` is GC-5's shipped loop (or GC-7's revision). No GC-6 edit.
- `server/src/analysis/analysisRunner.ts` beyond the sanctioned D5 touch: dispatch (452-460),
  engine gate/provenance, provisionInputs' existing behavior, the 50k routing (314-327) — all stay.
- `server/src/sequences/**`, `config/sequence-analysis/**`, `app/**`, DNA subsystems — zero.
- `python_executor_service/` (the daemon package — unrelated), `pylabrobot`/`pyalab` glue.
- `.M`/`.REG`/`.B`/`rpthead.txt` parsing (GC-1(e) verdict [G1:145-150]); ACQ.TXT method-name
  extraction (GC-3's shipped entry field per GC-4 spec :39-40).
- Integration engines, peak detection, baselines (GC-7+); renderer/UI (GC-10+); evidence wiring (GC-8+).

## Stop boundaries (hard stops — write report with evidence, exit)

- **B1** Claim with GC-4 or GC-5 code not yet merged → STOP "GC-4/GC-5 not landed" UNLESS the launch
  brief overrides (OQ1 ruling decides the default; see §Open questions).
- **B2** Any need to change GC-4/GC-5 shipped names (role strings, engineProvenance keys, manifest
  DREF format label) → STOP, report the mismatch; do NOT edit their files.
- **B3** Any .CH case that GC-1's v181 rules cannot decode but the vendor spec might cover (e.g.
  non-v181 marker, version field ≠ 3) → this is the declared `CH_UNSUPPORTED_VERSION` failure path,
  NOT an invitation to reverse-engineer new header layouts. Stay inside [G1].
- **B4** Any need for numpy/scipy inside the reader → design error; the reader is stdlib-only (D1).
- **B5** Real NAS bytes needed by any vitest/unittest case → STOP; real-NAS proof is the manual
  read-only smoke script only (same doctrine as GC-4 B4, 85th-handoff conventions).
- **B6** Anything requiring new schema, new record kind, new HTTP route → STOP (requires-rescope).

## Acceptance criteria (verbatim, task-list.md:7783-7786)

> Python tests + runner-backed integration test on a fixture .D tree AND the real registered
> RES35077-4.D: signal matches GC-1 tolerance; metadata fields exact; reader version recorded;
> corrupt-file cases named. Vitest gate via runner integration.

Description clauses that also bind (task-list.md:7772-7779): consumed by analysis revisions **through
DatasetHandle**; acquisition-package signal-collection → axis/values with correct channel identity,
units, scaling, point count; SAMPLE.XML + RUN.LOG UTF-16LE decoded **losslessly** into structured
values **with source provenance retained (unrecognized log lines stay accessible)**; method assets
stay referenceable-but-opaque unless GC-1 mandated a parser (it did not, [G1:145-150]); **reader
identity + version emitted in run provenance**; truncated/corrupt files **fail explicitly**; large
normalized signals go out as **data-reference-backed artifacts, never inline**. The "real registered
RES35077-4.D" leg runs only through the manual read-only smoke (§Test plan T4) — B5 keeps the real
NAS out of vitest, same split GC-4's promotion kept for its own fixture doctrine.

## Design

### D1 — stdlib-only reader module; NO numpy dependency

`pyproject.toml` declares zero runtime deps [F]; the production interpreter at dispatch time may be
`/usr/bin/python3` for revisions without a provisioned-venv engine (GC-5 spec §(c) legacy leg) — the
reader must work there. 28,812 points through a sequential int loop is milliseconds of CPython; the
GC-1 decoders themselves were sequential [G1:87]. numpy is FASTER but OPTIONAL only in entry
scripts, never inside `d_reader.py`. Stop boundary B4.

### D2 — module layout + public API (`computable_lab_analysis/d_reader.py`)

- `READER_NAME = "computable_lab_d_reader"`; `READER_VERSION = "1.0.0"` [I; OQ4].
- Exceptions, one per failure class (§Failure table): `ReaderError(code, detail)` base + codes
  `CH_UNSUPPORTED_VERSION, CH_TRUNCATED, CH_AXIS_INVALID, CH_NO_POINTS, METADATA_DECODE_FAILED,
  METADATA_XML_INVALID`. Message strings ALWAYS name input name + byte offset where applicable.
- `read_ch_bytes(data: bytes, *, source: str | None = None) -> dict` — pure bytes in, dict out:
  `{"axis": [float…], "values": [float…], "channel": str|None, "axis_units": "min",
  `value_units": "pA", "meta": {...}}` where `meta` carries `reader {name,version}`,
  `format "agilent-chemstation-ch-v181"` [I label; same spirit as GC-4's promotion-pinned format
  strings, GC-4 spec :633-636],
  `n_points, escape_count, escape_tag_nonzero, header {page, t0, t_end, dt, scale, intercept},
  source`. Decode = **the canonical GC-1 decoder CODE verbatim** [F-fixture @ /tmp/gc1-decD.py:21-50;
  the report's prose [G1:33-35] is abbreviated and WRONG on three points — see the [G1] ERRATA note
  and reviewer bait #1]:
  `page = u32BE@264`, `offset = (page-1)*512`; marker check `b[326]==3 and
  b[327:331]==b"1\x008\x00"` else `CH_UNSUPPORTED_VERSION`; `t0 = f32BE@282/60000`,
  `t_end = f32BE@286/60000` **minutes** (the raw f32 is NOT minutes — the /60000 divisor is in all
  three promoted decoders [G1-decA:77-78, decB:29-30, decD:25-26]); `intercept=f64BE@4724,
  scale=f64BE@4732`; **slots = BIG-endian signed int16** (`struct.unpack_from('>{n}h', …)`) —
  GC-1's prose "little-endian" is wrong; the big-endian reading is what produces round-Hz axes on
  every corpus file; body loop with **UNBOUNDED Python ints, NO int16 wrap**:
  `b1 += slot; b2 += b1; raw = b2`; 4-slot escape `slot==32767 → b1=0;
  b2 = slot[i+1]*4294967296 + u32BE(pack('>hh', slot[i+2], slot[i+3])); raw.append(b2); i += 4`.
  **Axis = linspace(t0, t_end, n)**: `dt = (t_end - t0)/(n-1)`, `axis[-1] == t_end` EXACTLY
  (decD :47; this is decoder A's endpoint convention GC-1 measured at [G1:91]).
  Values = `raw*scale + intercept` (pA, applied). Structural invariants asserted after decode:
  `n == n_slots - 3*escape_count` (decD :46) else `CH_TRUNCATED`.
- `decode_sample_xml(data: bytes) -> dict` — strict UTF-16 (BOM `FF FE` present on real files
  [F-fixture]; decode via `data.decode("utf-16")` which consumes the BOM, no-BOM → explicit utf-16-le
  fallback). `xml.etree.ElementTree` over the text. Returns structured fields (`name, amount,
  multiplier, dilution, version, description, isstds: [{num, value}], target_masses`) PLUS
  `extras` capturing ANY element not in the known set (lossless: nothing dropped) and `raw_text`
  (the exact decoded string) — provenance retained. Parse failure → `METADATA_XML_INVALID`; decode
  failure (odd length, lone surrogate) → `METADATA_DECODE_FAILED`. Note `<ISTD Num="1">` attribute
  and `<TargetMasses />` self-closed empties are real shapes [F-fixture] — handle, don't guess more.
- `decode_run_log(data: bytes) -> dict` — same strict decode; returns `{"lines": [{"line_no", "raw",
  "parsed": {...}|None}], "recognized_count", "unrecognized_count"}`. Recognizer: the two-column
  ChemStation shape `^(\S.*?)\s{2,}(.+?)\s+(\d{2}:\d{2}:\d{2})\s+(\d{2}/\d{2}/\d{2})$` →
  `{category, message, time, date}` (matches the real lines [F-fixture]); hex event-code lines and
  anything else stay with `parsed: None` and `raw` verbatim — **every line survives, recognized or
  not** (lossless clause). Zero recognized lines on a non-empty file → `ctx.log` warning (not a
  failure — the format is vendor-undocumented beyond what GC-1 verified).
- `attach(ctx) -> dict[str, dict]` — the package-level convenience the entry scripts call:
  classifies every ctx input (D3), decodes signal/metadata inputs, sets the manifest `reader` block
  (D4), returns `{name: decoded}` and logs one summary line per decoded input. Inputs classified
  `method_asset`/`opaque` → SKIPPED with a `ctx.log` line naming them (GC-1(e) opaque-preservation:
  referenceable, never parsed) — never silently dropped (the log IS the record).
- Escape-tag audit [G1:99] discharges here: `meta.escape_tag_nonzero` counted during decode;
  `attach()`/readers emit `ctx.log("… N escape slots carry tag≠0", level="warning")` when N>0 — the
  KERRY distribution question stays OPEN and REPORTED per run, exactly as GC-1 demanded. Never a
  failure, never silent.

### D3 — DatasetHandle seam + classification (the small ctx.py edit)

The shipped comment says robust parsing belongs to the readers [F ctx.py:50]. Additive edits only:
1. `DatasetHandle.read_signal()`: BEFORE the CSV path [F :48-52], if `self.path` and
   `file_bytes()` starts with the v181 CH marker (bytes check :326/:327 — cheap slice), delegate to
   `d_reader.read_ch_bytes` and return `{"axis","values"}` with the richer dict keys present too.
   Non-CH files keep the existing CSV behavior BYTE-IDENTICAL (all 18 existing python tests + the CSV
   vitest flows must stay green — reviewer bait #5).
2. `Context.input_names() -> list[str]` (sorted keys of `_inputs`) — needed by `attach()`.
3. `DatasetHandle.meta` already flows from the runner input spec [F :235] — classification reads
   `meta.sourcePath` when present (D5's runner touch) but NEVER requires it: fallback classification
   is pure content sniff — CH marker bytes → signal_channel; `FF FE 3C 00 78 00 6D 00 6C` (BOM+xml)
   → sample_metadata; BOM-decodable UTF-16 text, not XML → run_log; else opaque. This keeps the
   reader correct under GC-4's `packageAnalysisInputs` naming whatever the TS coder chose [GC4:256-264]
   and under plain per-file DREF inputs hand-wired in tests. Channel identity: `FID1A.CH` stem from
   `meta.sourcePath` when available, else `handle.name`, else `None` — never invented.

### D4 — reader identity + version into run provenance (zero GC-5 file edits)

`OutputManifest` gains `reader: Optional[dict]`, serialized in `to_dict()` only when set (additive,
existing manifest JSON byte-stable when absent — reviewer bait #5 again). `attach()` sets
`{"name": READER_NAME, "version": READER_VERSION, "sdk_version": computable_lab_analysis.__version__}`.
Runner persistence: the completion write spreads `{ ...manifest, artifacts: … }` [F :476-479] — the
extra `reader` key flows into the stored `outputManifest` with ZERO TS change, i.e. machine-readable
in the run record TODAY, and GC-5's `engineProvenance` folds it per its OQ3 ruling: as
`packages: [{name: 'computable_lab_analysis', …}, {name: READER_NAME, required: READER_VERSION,
actual: READER_VERSION}]` [GC5:280-287, GC5:17-18]. "Reader version recorded" is therefore provable
in vitest from the stored run payload, independent of GC-5's merge order.

### D5 — the sanctioned runner input-provisioning touch (task `files:` line :7788)

Exactly ONE additive touch: in `provisionInputs`' data-reference branch [F :150-161], pass provenance
through to the SDK — `InputSpec` gains optional `meta`, populated with
`{ sourcePath: payload.path, ...("contentHash" in payload ? {contentHash} : {}) }` (conditional
spread — exactOptionalPropertyTypes, GC-5 F20 pattern). ~4 lines. Purpose: the reader's
`meta.source` + channel identity + hash-provenance ("source provenance retained" clause) ride the
DREF's own pinned values [GC4:214-235] — no re-hash (GC-5's re-hash leg [GC5:289-291] is untouched;
serialization risk of two edits in the SAME function = OQ2). Artifact-level source provenance to the
input DREFs is ALREADY shipped (`sourceRelations` [F :469]) — do not duplicate it in the reader.

### D6 — channel → signal contract (what "correct" means, pinned by GC-1)

| Property | Contract | Authority |
|---|---|---|
| axis | minutes, linear linspace(t0, t_end, n): axis[0]=t0, axis[-1]=t_end EXACTLY; dt = (t_end-t0)/(n-1) → RES4 50.0 Hz [G1:40]; RES4 t0=0.00021353334, t_end=9.604213541666667 [F-fixture] | [G1:33, :40, :91; decD :47] |
| values | pA float64 = `raw*scale + intercept`, scale/intercept FROM HEADER, never a constant | [G1:33] |
| point count | exact; RES35077-4 = 28,812; a mismatch against the generator/expected vector = test failure, tolerance EXACT | [G1:88] |
| escape handling | 4-slot absolute escapes decoded; RES35077-4 escape_count = 2,013 EXACT | [G1:35, :40] |
| channel identity | `FID1A` (file stem), None if unknowable; multi-`.CH` package = multiple signal inputs, no FID1A/B semantics assumed (GC-4 D9 [GC4:349-355]) | [GC4:349-355] |
| tolerance vs decoders | per-point 3-decimal pA agreement; axis-endpoint delta ≤ 2e-7 min; scale/intercept/offset/n/escapes EXACT | [G1:88-91] |
| saturated plateau | reader does NOT flag peaks (GC-10's rule); it only guarantees lossless values | [G1:159] |

### D7 — metadata contract (lossless + provenance retained)

Structured dict per D2 (fields pinned by the real bytes [F-fixture]) + `raw_text` + per-line `raw`
for the log + `source` (meta.sourcePath / handle name) + input DREF `contentHash` when D5 supplied
it. Unrecognized RUN.LOG lines are NOT a lossy path: they occupy `lines[]` with `parsed: None`.
`SAMPLE.MAC.bak` / `ACQ.TXT` / `.MTH` / `.REG` / `SINGLE.B`: skipped-as-opaque by `attach()` with a
named log line [G1:145-150]; method assets stay referenceable via their DREFs (GC-4 already pinned
them) — GC-6 adds zero parsing.

### D8 — large signals: data-reference-backed artifacts, never inline

Two shipped layers, both exercised by the integration test: (1) entry-script pattern — decode →
`tempfile.mkstemp(suffix='.json')` → write `{"axis":…,"values":…}` → `ctx.publish_file(name, path,
kind='signal', format='json')` → blob [F ctx.py:251-288] → runner ALWAYS routes blobs to storage +
mints a DREF [F :314-327, :232-283]; (2) even a plain inline `publish(kind='signal')` of a real
trace (≥ ~50k chars at 28k points) trips the existing 50,000-char large-value routing [F :316-321].
The 28,812-point RES4 payload never lands in a record payload either way. Blob lifetime: the file
must exist until the runner persists it (before `rm(inputDir)` [F :503]) — tempfile under the
process tmp dir, not inside the entry script's cwd, documented in the fixture entry script.

## Failure table (corrupt/truncated → explicit, named; each row is a test)

| # | Case | Code / token | Layer + check |
|---|---|---|---|
| X1 | size < 4732+16 or < header page offset → body can't exist | `CH_TRUNCATED` (names size, needed offset) | `read_ch_bytes` entry |
| X2 | version marker ≠ (b[326]==3 AND b[327:331]==bytes "1 0 8 0" with 0x00 separators, i.e. UTF-16 "18") | `CH_UNSUPPORTED_VERSION` (names observed marker bytes) | unknowns stay UNKNOWN [G1:96]; NO speculative layout guessing (B3) |
| X3 | odd body length / slots end mid-escape (<4 slots after 32767) | `CH_TRUNCATED` (names byte offset of broken escape) | body loop |
| X4 | t0/t_end f32 NaN/≤0/t_end<t0 → dt invalid | `CH_AXIS_INVALID` (names t0,t_end) | header |
| X5 | n_points == 0 | `CH_NO_POINTS` (explicit, not an empty success) | post-decode |
| X6 | SAMPLE.XML/RUN.LOG byte count not valid UTF-16 (odd length, lone surrogate, decode error) | `METADATA_DECODE_FAILED` (names input) | strict `.decode()`, NO `errors='ignore'` ANYWHERE (bait #3) |
| X7 | SAMPLE.XML decodes but is not well-formed XML | `METADATA_XML_INVALID` (line/col from ElementTree) | ElementTree |
| X8 | RUN.LOG zero recognized lines (non-empty) | NOT a failure: `ctx.log` level=warning + full `lines[]` | honesty: recognizer covers only GC-1-verified shapes |
| X9 | escape slot1≠0 present | NOT a failure: `ctx.log` warning with count | audit demand [G1:99] |
| X10 | unknown binary input handed to `attach()` | skipped opaque + named log line | GC-1(e) [G1:145-150] |
| X11 | any reader exception reaching the CLI | surfaces as `{"ok":false,"error":"ReaderError: CODE …"}` stderr exit 1 [F __main__.py:67-69] → runner `RUN_FAILED` naming it [F :210] → run status `failed` | end-to-end, proven by the vitest corrupt case |

Every code is a STRING CODE inside the exception message — no new TS error tokens, no schema
vocabulary (B6). The vitest corrupt-case asserts the run FAILED and the stored failure names the code.

## Test plan

### T1 — Python unit tests (`tests/test_d_reader.py`, unittest, stdlib-only, PYTHONPATH=src)

Fixture strategy: `fixtures/gc-d/make_d_fixture.py` generates a SYNTHETIC .D tree in a tmpdir at
test time (never committed bytes): a v181-shaped header (marker bytes at 326/327, page=13 @264,
f32 ticks @282/286 via *60000, f64 scale/intercept @4724/4732) + a body ENCODER that is the exact
inverse of decD's loop (choose raw levels; emit deltas; force >=1 4-slot escape; optionally emit an
escape with slot1≠0). Tree = `SYNTH-001.D/{FID1A.CH, SAMPLE.XML, RUN.LOG, SAMPLE.MAC.bak,
ACQ.M/INFO.MTH, ACQRES.REG}` with SAMPLE.XML/RUN.LOG written as real UTF-16LE+BOM files mirroring
the [F-fixture] shapes (incl. `<ISTD Num=…>`, `<TargetMasses />`, hex event-code lines).
Tests (each maps to a design row):
1. round-trip: encode → `read_ch_bytes` → n, escape_count, axis endpoints, values EXACT vs encoder
   inputs; axis_units/value_units/reader meta present.
2. classification via `attach()` on a fake Context: signal/metadata/run_log/opaque each take the
   right path; opaque inputs get named skip-log lines (X10).
3. SAMPLE.XML: fields exact (Name/Amount/Multiplier/Dilution/Version/Description empty-string/
   ISTDs[{num:'1',value:'0'}]); unknown element lands in `extras`; `raw_text` round-trips losslessly.
4. RUN.LOG: recognized lines parse {category,message,time,date}; hex-code lines `parsed: None` with
   `raw` verbatim; recognized+unrecognized == total lines (lossless assertion).
5. Corruption matrix X1-X7 each raises its exact code with a named-detail message (truncated header,
   bad marker, mid-escape truncation at a KNOWN offset asserted in the message, NaN t_end, empty
   body, odd-length UTF-16, malformed XML).
6. Escape-tag audit: synthetic file with 2 tag≠0 escapes → `meta.escape_tag_nonzero == 2` + warning
   log line via attach() (X9); zero-tag file → no warning.
7. Regression: existing 18 tests still OK; `read_signal` on CSV bytes unchanged (byte-identical
   behavior leg — assert existing ContextTests pass untouched).
8. Large-signal helper leg: entry-side pattern writes JSON file + `publish_file` → blob dict has
   sha256/sizeBytes/format=json (the D8 contract, python-side).

### T2 — Runner-backed integration (vitest, `server/src/analysis/analysisDReader.test.ts`)

Harness = analysisRunner.test.ts [F:19-59] verbatim pattern (tmp mount `usb0`, TEST-WRITTEN config,
`new AnalysisRunner(ctx, '/usr/bin/python3', resolve(process.cwd(),'python-executor-service','src'))`).
Inputs are PER-FILE data-references acquired with `acquireDataReference` (the exact shape GC-4's
`packageAnalysisInputs` yields [GC4:256-264]; naming `signal1`/`sampleMeta`/`runLog` — reader must
classify by CONTENT [D3], proving naming-independence). Entry script (inline in the test, the
GC-7-style consumer): `from computable_lab_analysis.d_reader import attach; decoded = attach(ctx)` →
publish decoded signal via `publish_file` (blob → DREF-backed [D8]) + publish small structured
metadata table. Assertions (the acceptance clauses):
- run succeeded; signal artifact record has `dataReferenceRef` and NO `inlineValue` — never-inline
  clause proven against the 28k-equivalent-size synthetic trace (synthesize ~30k points so the
  50k-char routing also fires on the non-blob leg as a second test);
- read the persisted DREF bytes back off the tmp device, parse JSON, assert n/axis/values against
  the python-side expected vectors (GC-1 EXACT tolerances, D6);
- metadata artifact values exact (Name, Amount, …);
- stored run payload `outputManifest.reader == {name, version, sdk_version}` — "reader version
  recorded" leg, provable independent of GC-5's merge (D4);
- corrupt leg: second run whose .CH input is truncated after registration → executeRun rejects with
  RUN_FAILED naming `CH_TRUNCATED`, run status `failed` (X11);
- provenance: artifact `sourceRelations` include the input DREF refs [F:469]; input spec meta
  carried sourcePath+contentHash (D5 leg — assert via a tiny echo entry script that dumps
  `ctx.input('signal1').meta`).

### T3 — Python-suite vitest wrapper (single command gate)

`analysisDReader.test.ts` additionally spawns `python3 -m unittest discover -s tests`
(PYTHONPATH=src, cwd=python-executor-service) in ONE test and asserts exit 0 + "Ran N" in stderr
[doctrine: py tests exist only under python-executor-service and vitest is the repo gate; the
composer ran them this session: 18 OK]. If spawning python in CI is contested, OQ5.

### T4 — Real-NAS manual smoke (LANE-ONLY, read-only; `.hermes/plans/scripts/gc6-nas-smoke.sh`)

Not vitest (B5). Script: copies NOTHING; runs the SDK against the mounted tree in-process:
`PYTHONPATH=server/python-executor-service/src python3 -c` snippet decoding
`/mnt/vast/gc-fid/machine1/RES35077-4.D/{FID1A.CH, SAMPLE.XML, RUN.LOG}` and asserting the
[F-fixture] pins (n=28812, esc=2013, esc_tag=0, max 400112.8313 @ 4.6074, first5 as listed, SAMPLE
name RES35077-4, RUN.LOG recognized-count > 0 with hex lines preserved); exits 0 + prints
`GC6 NAS SMOKE OK <n> <esc>`. The "real registered RES35077-4.D" acceptance leg = this script's
receipt in the worker report PLUS (once GC-4 is merged and the lane config has `gc-fid-nas`) one
live-server run through the registered package per the launch brief. Full end-to-end registration +
run against the live stack happens at GC-7's integration leg; GC-6 proves the reader, GC-4 proves
registration — the composition is proven by GC-7. [I — flagged OQ1: if the orch wants a live-stack
GC-4→GC-6 run INSIDE GC-6, it must land after GC-4 merges.]

## First targeted check

After writing `d_reader.py` + `make_d_fixture.py` + T1 tests 1-2 ONLY (before ctx.py/runner touches):

    cd /mnt/vast/home/brad/git/cl-integration-1/server/python-executor-service && PYTHONPATH=src /usr/bin/python3 -m unittest tests.test_d_reader -v

Expected first run RED with module-not-found (write tests first, note the inversion in the commit —
EDITOR-1 precedent), then GREEN. This proves the encoder/decoder inverse + the synthetic-header
construction — the riskiest assumption — before any TS is touched.

## Verification (complete, coder-executable)

1. `cd /mnt/vast/home/brad/git/cl-integration-1/server/python-executor-service && PYTHONPATH=src /usr/bin/python3 -m unittest discover -s tests -v`
   → `Ran >=26 tests ... OK` (18 existing + new d_reader suite).
2. `cd /mnt/vast/home/brad/git/cl-integration-1/server && npx vitest run src/analysis/analysisDReader.test.ts src/analysis/analysisRunner.test.ts src/analysis/analysisService.test.ts`
   → all pass, 0 failures (the CSV runner suites prove zero regression from the ctx.py/D5 edits).
3. `npx vitest run` full suite green (capture the fail-file baseline at claim; report both).
4. Typecheck: house comparator — `npm run typecheck` delta vs trunk baseline EMPTY in touched files
   (GC-2/GC-5 precedent: pre-existing baseline exists app-wide; no NEW errors, `git stash`-compare
   or the comparator script the 85th handoff's orch verify used).
5. `bash .hermes/plans/scripts/gc6-nas-smoke.sh` (only if /mnt/vast mounted; read-only) →
   `GC6 NAS SMOKE OK 28812 2013`.
6. `git -c core.fileMode=false status --porcelain` / `diff --stat` in the code repo → ONLY §Files IN
   scope; ZERO binary files, ZERO .CH/.XML/.LOG payloads in git (fixtures are generator scripts +
   tests); lane records repo shows only run/artifact records from test runs if any (tests use tmp
   workspaces — expect zero).
7. Hardcode greps (must be ZERO in production code):
   `grep -rn "mnt/vast" server/python-executor-service/src server/src/analysis/analysisDReader.test.ts` → 0 hits
   (the NAS smoke SCRIPT may name the path — it is lane runbook data, not product code; keep it under .hermes/, not server/).
   `grep -rn "numpy\|scipy" server/python-executor-service/src/computable_lab_analysis/` → 0 hits (B4).
   `grep -rn "errors=.ignore\|errors='ignore'\|errors=\"ignore\"" server/python-executor-service/src/computable_lab_analysis/` → 0 hits (bait #3).

## Worker contract

- Worktree/branch off lane trunk: `/mnt/vast/home/brad/git/wt/gc-6-lane1-<stamp>`, branch
  `wt/gc-6-lane1-<stamp>` off CURRENT `cl/integration-1` tip at claim time (this draft @ 48340a98;
  GC-3/GC-4/GC-5 merge AHEAD of you — rebase note per 85th handoff). All git `-c core.fileMode=false`;
  trunk worktree READ ONLY, commit nothing there.
- Deliverables = §Files IN scope exactly. Report `/home/brad/.hermes/cl/lanes/1/gc-6-report-<unit>.md`;
  commits AFTER every step (83rd handoff §3 — two context-deaths this wave); end-marker
  `GC6 DONE <sha>` / `GC6 BLOCKED <reason>`; log `lanes/1/logs/coder-GC6-<unit>.log`.
- Diff discipline: any hit under app/, schema/, config/sequence-analysis/, server/src/sequences/,
  server/src/storage/, server/python-executor-service/src/python_executor_service/ → STOP + report
  (B2/B6).
- Lane stack via `cl-lane-stack.sh 1` only, exact PIDs, never :3001/:5174; no `pkill` patterns.
  (ctx.py/py changes need NO stack restart for vitest; a LIVE server picks up SDK changes on next
  spawn since PYTHONPATH points at the worktree only for that process — live-stack proofs stay with
  the orchestrator's gate, same as GC-4/GC-5.)
- NAS strictly read-only, only via the T4 smoke script; any test touching /mnt/vast = design error (B5).

## Reviewer bait (expect these probes — the diff itself must answer them)

1. **The decoder loop is the ONE place a plausible bug hides.** Authority is decD's CODE
   (/tmp/gc1-decD.py:21-50), not the report's prose: BIG-endian slots, `/60000` on the f32 time
   pair, UNBOUNDED accumulator ints. A "cleaner" numpy-style vectorization or int16 wrap is WRONG —
   the composer's own simplified variant corrupted the RES4 tail and mis-decoded RES5/KERRY
   ([F-fixture] warning). The `n == n_slots - 3*esc` invariant assert is mandatory (decD :46).
2. **Expected-vector fabrication.** Every RES35077-4 pin in this spec was re-run first-hand; the
   python tests must not hardcode a value the generator didn't encode, and the NAS smoke must not
   "adjust" a pin to pass. If a pin mismatches, the reader is wrong (or the pin transcription is —
   check against decD, then STOP).
3. **Silent UTF-16 loss.** `errors='ignore'`/`errors='replace'` anywhere = REJECT (grep #7.3).
   Half the real RUN.LOG is unrecognized lines — dropping or rewriting any line violates the
   lossless clause; assert line-count round-trip in tests.
4. **Inline signal laundering.** If the integration test's signal artifact has `inlineValue` at
   ~28k points, the blob/large routing was bypassed (publish_file skipped, or a tiny synthetic trace
   made the test vacuous). The synthetic fixture MUST carry >= 25k points so the 50k-char floor
   [F:316-321] is genuinely exercised on the non-blob leg too.
5. **Regression on the CSV path.** `read_signal`'s new CH branch keys ONLY on the v181 marker
   bytes; existing CSV/inline behavior and all 18 shipped python tests byte-identical; manifest JSON
   byte-identical when `reader` unset (additive `to_dict` key only).
6. **Time-axis endpoint claim.** axis[-1] == header t_end/60000 EXACTLY (linspace convention) — a
   `t0 + i*dt` recomputation that leaves the endpoint 1e-9 short is within GC-1's 2e-7 tolerance but
   DIFFERENT from decoder A convention the pins were measured under; match decD, state the
   convention in code comment.
7. **exactOptionalPropertyTypes** [GC5 F20]: the D5 `meta` addition uses conditional spread
   (`...(payload.contentHash ? { contentHash: payload.contentHash } : {})`); no `field: undefined`
   in InputSpec/artifact payload builds. tsconfig strictness will catch it; the typecheck delta
   must be EMPTY.
8. **Hardcode boundary**: no `/mnt/vast` path in server/ code (grep #7.1), no numpy/scipy in the
   SDK (grep #7.2), no `FID1A` string special-casing (channel identity is file-stem sniff — GC-4
   D9 multi-channel neutrality [GC4:349-355]).
9. **Ontology terms**: none required (same ruling posture as GC-4 bait #10 — the reader claims zero
   chemistry semantics; channel/sample identity strings are DATA decoded from the files, not
   vocabulary minted by us).
10. **YAML-reload trap**: GC-6 ships NO schema/lint/ui YAML — if the coder finds themselves
    editing schema/ they've drifted out of scope (STOP B6); a "live proof" needing a stack restart
    is GC-7's story, not this item's.
11. **GC-4/GC-5 name drift**: role strings (`signal_channel`, `sample_metadata`, `run_log`) appear
    in the reader ONLY as classification vocabulary constants with a comment citing the GC-4 spec —
    the reader must NOT import, re-declare in TS, or rename them; `engineProvenance` is never
    written by GC-6 code (that key belongs to GC-5's runner write [GC5:280-287]).

## YAML-restart reminder

No YAML ships with GC-6. Python/TS changes are picked up by vitest directly; the live lane stack
(:3092/:5192) re-imports the SDK per spawn [F: analysisRunner.ts:196-201], so even live runs need no
restart — but live-stack verification is NOT this item's gate (T4 doctrine).

## Open questions for orchestrator (max 3 + 2 minor)

1. **Claim-order vs deps (BINDING-adjacent).** Deps GC-4+GC-5 are SPEC-promoted, code unmerged
   [F: zero hits this session]. GC-6's diff has ZERO overlap with their files EXCEPT the ~4-line
   `provisionInputs` touch (D5) — mergeable-after-both with trivial conflict risk. Recommended
   default: allow GC-6 to CODE now (tests green on its own branch) and sequence the merge AFTER
   GC-4/GC-5 land, re-running T2 against their shipped `packageAnalysisInputs` naming if it differs
   from the test's hand-wired names. Checked: grep for their symbols on trunk @ 48340a98, task-list
   spec paths, 85th handoff live-worker checkpoint. Alternative: defer dispatch entirely (slowest).
2. **D5 runner touch vs GC-5's provisionInputs re-hash [GC5:289-291].** Two items editing the same
   function serially. Recommended: GC-6's meta-pass-through is 4 additive lines in the
   data-reference branch; if GC-5 lands first the re-hash sits alongside — trivially rebasable;
   if the orch prefers ZERO GC-6 edits to analysisRunner.ts, the fallback is classification by pure
   content sniff (D3 already works without meta) at the cost of sourcePath/contentHash provenance
   in `meta` (the acceptance clause "source provenance retained" then rides `sourceRelations` +
   the DREF records alone — defensible). Recommend KEEPING the touch (the task's `files:` line
   :7788 explicitly names "runner input provisioning touch").
3. **GC-1 report errata fold.** The report's decode prose contradicts its own promoted decoders on
   endianness, the /60000 time divisor, and int16 wrap (see [G1] ERRATA + bait #1) — first-hand
   reproduced this session. Recommended: promotion of THIS spec carries a one-line note appended to
   the GC-1 report pointing at the decoders as normative (the report file is data in .hermes/plans/,
   not product code), so GC-7/GC-10 don't re-trip the prose. I did NOT edit the report.
4. (minor) **READER_VERSION '1.0.0' + `__version__` bump 0.1.0→0.2.0** — house convention for the
   SDK version bump is unpinned; recommended: ship 1.0.0/0.2.0 as authored, fold at promotion.
5. (minor) **T3's vitest→unittest spawn** (python inside a vitest test as the repo gate) vs CI
   hygiene — recommended: keep (single-command gate, matches "Python tests + … vitest gate"
   wording); drop the wrapper if CI lacks python, keeping §Verification command 1 as the coder gate.
