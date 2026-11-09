/**
 * GC-7 — runner-backed integration for the declared-settings peak-integration
 * revision (spec T2).
 *
 * Harness = analysisRunner.test.ts / analysisDReader.test.ts verbatim pattern
 * (unique mkdtemp dirs — ADV-1 defect 7; TEST-WRITTEN config with tmp mount
 * `usb0`; `new AnalysisRunner(ctx, '/usr/bin/python3', <sdk src>)`).
 *
 * The synthetic .CH is built HERE in TS — the exact byte layout of the python
 * generator doctrine (v181 header + the canonical decD inverse loop: BE int16
 * slots, unbounded second-difference accumulators, one 4-slot zero-tag escape
 * at ESC_INDEX). N = 30000 points so the signal artifact is GENUINELY
 * ≥ 50k chars → the never-inline / dref-backed routing is proven, not assumed
 * (spec T2.1).
 *
 * The reference entry script (spec A0/A4) is read from
 * fixtures/gc-peaks/entry-reference.py — the authoritative copy lives in the
 * REVISION RECORD (data repo, minted via the API); this file ships the
 * identical reference copy as fixture data (NEVER a git revision record).
 *
 * Engine: a pinned analysis-engine record (GC-5 machinery — merged on this
 * branch) with the `python-entry-script` adapter, `runtime_requirements:
 * interpreter: system`, and ONE declared package (`pyyaml` — a REAL dist on
 * /usr/bin/python3, so the engineProvenance `packages[].actual` assertion is
 * honest: the test probes the ACTUAL version with the same interpreter, never
 * a literal — the GC-5 "assert against the probe, not /usr/bin literals" rule).
 *
 * NO real NAS bytes (spec B2): the "real RES35077-4.D" leg is the lane-only
 * read-only smoke script (T3, .hermes/plans/scripts/) only.
 *
 * NOTE (serialization): this file SPAWNS python (every run + the T2.5
 * unittest wrapper) — run it in its OWN `npx vitest run <file>` process, never
 * in a parallel invocation with the other python-spawn suites (GC-6 note;
 * NFS flake).
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { execFile, spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { readFileSync as readFileSyncSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import { AnalysisService, AnalysisServiceError } from './analysisService.js';
import { AnalysisRunner } from './analysisRunner.js';
import { acquireDataReference } from '../storage/acquisition.js';

const pExecFile = promisify(execFile);

// ---------------------------------------------------------------------------
// Synthetic v181 .CH builder (TS mirror of the python generator doctrine).
// The body is the exact inverse of the canonical decD loop
// (d_reader.read_ch_bytes / gc1-decD.py):
//   b1 += s; b2 += b1            (non-escape slot: s = slot value)
//   escape (4 slots): b1 = 0; b2 = tag*2^32 + (hi16<<16)|lo16
// Raw values are the second differences of the target signal, so every
// non-escape slot s = Δ²raw fits int16 (asserted in the builder) and the
// decoded values are EXACTLY raw[i]*scale + intercept for all i.
// ---------------------------------------------------------------------------
const N_POINTS = 30_000; // >= 25k → the 50k-char floor is genuinely exercised
const ESC_INDEX = 10;
const SCALE = 1.302083401242271e-4; // corpus scale (GC-1 [G1:45/AS-3])
const T0_TICKS = 3000.0; // f32-exact → t0 = 0.05 min
const T_END_TICKS = 300_000.0; // f32-exact → t_end = 5.0 min
const BASE_PA = 1.302083401242271; // 10000 raw * SCALE — the flat baseline
const P1 = { rt: 1.0, width: 0.1, rawAmp: 20_000 }; // → 2.6042 pA peak
const P2 = { rt: 3.0, width: 0.15, rawAmp: 12_000 }; // → 1.5625 pA peak
const DT = (T_END_TICKS / 60_000 - T0_TICKS / 60_000) / (N_POINTS - 1);

function rawAt(i: number): number {
  const t = T0_TICKS / 60_000 + i * DT;
  const g1 = P1.rawAmp * Math.exp(-0.5 * ((t - P1.rt) / P1.width) ** 2);
  const g2 = P2.rawAmp * Math.exp(-0.5 * ((t - P2.rt) / P2.width) ** 2);
  return Math.round(10_000 + g1 + g2);
}

function buildSyntheticCh(): { bytes: Buffer; t0: number; tEnd: number; scale: number } {
  const header = new Uint8Array(6144);
  const dv = new DataView(header.buffer);
  dv.setUint32(264, 13, false); // page → body offset (13-1)*512 = 6144
  header[326] = 3;
  header.set([0x31, 0x00, 0x38, 0x00], 327); // UTF-16 "18" marker
  dv.setFloat32(282, T0_TICKS, false);
  dv.setFloat32(286, T_END_TICKS, false);
  dv.setFloat64(4724, 0.0, false); // intercept
  dv.setFloat64(4732, SCALE, false); // scale

  const nSlots = N_POINTS + 3; // one 4-slot escape replaces one 1-slot point
  const body = new Uint8Array(nSlots * 2);
  const bdv = new DataView(body.buffer);
  let prevB1 = 0;
  let prevRaw = 0;
  let si = 0;
  for (let i = 0; i < N_POINTS; i++) {
    const raw = rawAt(i);
    if (i === ESC_INDEX) {
      const level = raw;
      bdv.setInt16(si++ * 2, 32767, false); // sentinel
      bdv.setInt16(si++ * 2, 0, false); // tag (zero-tag escape)
      bdv.setInt16(si++ * 2, (level >>> 16) & 0xffff, false); // hi16 (0)
      bdv.setInt16(si++ * 2, level & 0xffff, false); // lo16
      prevB1 = 0;
      prevRaw = level;
    } else {
      const b1 = raw - prevRaw;
      const s = b1 - prevB1;
      if (s < -32768 || s > 32767) throw new Error(`slot ${s} at i=${i} does not fit int16`);
      bdv.setInt16(si++ * 2, s, false);
      prevB1 = b1;
      prevRaw = raw;
    }
  }
  const t0 = dv.getFloat32(282, false) / 60_000.0;
  const tEnd = dv.getFloat32(286, false) / 60_000.0;
  return { bytes: Buffer.concat([Buffer.from(header), Buffer.from(body)]), t0, tEnd, scale: SCALE };
}

/** The expected decoded vectors — identical float64 arithmetic to the reader. */
function expectedSignal(n: number, t0: number, tEnd: number, scale: number) {
  const axis: number[] = [];
  const values: number[] = [];
  const dt = (tEnd - t0) / (n - 1); // dt computed ONCE, exactly as the reader
  for (let i = 0; i < n; i++) {
    axis.push(t0 + i * dt);
    values.push(rawAt(i) * scale + 0.0);
  }
  axis[n - 1] = tEnd; // endpoint pinning (decoder A / _linspace)
  return { axis, values };
}

const SYNTH_DIR = 'synth-peaks';

// The declared-settings run parameters (spec §A2 — every scientific value is
// DATA, the module applies ZERO defaults; T1-10 proves the other side).
// saturated_min_plateau_points = 250 is the DECLARED value for this 6000 Hz
// grid: the two synthetic Gaussians' tops each span ~60-90 samples within
// 0.5 % of their max (a smooth top is nearly flat at this grid), so the
// grid-scaled declaration keeps the analytic peaks UNFLAGGED — the rule is
// data, never a code constant (T1-8's 1000 Hz leg declares its own N = 10).
const RUN_PARAMS = {
  baseline_correction: 'vertical_drop',
  baseline_window_s: 12.0,
  peak_width_s: 12.0,
  slope_sensitivity: 0.001,
  min_width_factor: 0.2,
  max_width_factor: 3.0,
  saturated_top_fraction_of_max: 0.005,
  saturated_min_plateau_points: 250,
  backend: 'stdlib',
  method_label: 'TEST-DECLARED-LABEL',
};

const REVISION_METHOD_NOTES =
  'Baseline/detect/reject pipeline per the GC-7 spec §A3. baseline_correction ' +
  'semantics are DECLARED interpretations of vendor-undocumented concepts ' +
  '(GC-1 IQ1.MTH note); tangent skim ordering: detect -> baseline -> skim -> ' +
  're-measure. Saturated-plateau columns are DECLARED-null (GC-1 honesty ' +
  'clause). Parameters transcribed from a gc-method record analysis section ' +
  '1:1 per the spec §A2 mapping; timed_events capture is executable only under ' +
  "the method's declared executable_binding.";

const ENGINE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/analysis-engine.schema.yaml';

describe('AnalysisRunner + peak_integration (GC-7 integration)', () => {
  let mountDir = '';
  let wsDir = '';

  let ctx: Awaited<ReturnType<typeof initializeApp>>;
  let runner: AnalysisRunner;
  let service: AnalysisService;

  // ACTUAL interpreter facts (assert against the probe, never literals).
  let actualPython: string;
  let actualPythonVersion: string;
  let actualYamlVersion: string;

  let ch: { bytes: Buffer; t0: number; tEnd: number; scale: number };
  let exp: { axis: number[]; values: number[] };

  beforeAll(async () => {
    mountDir = await mkdtemp(join(tmpdir(), 'cl-gc7-mount-'));
    wsDir = await mkdtemp(join(tmpdir(), 'cl-gc7-ws-'));
    await mkdir(join(mountDir, SYNTH_DIR), { recursive: true });
    ch = buildSyntheticCh();
    exp = expectedSignal(N_POINTS, ch.t0, ch.tEnd, ch.scale);
    await writeFile(join(mountDir, SYNTH_DIR, 'TEST.CH'), ch.bytes);
    // A corrupt copy for the CH_TRUNCATED leg (X11): the header page is
    // PATCHED to 200 → body offset (200-1)*512 = 101,632 > file size → the
    // reader's named CH_TRUNCATED code (a valid v181 marker with the body
    // placed past EOF — the exact corruption shape GC-6 X1/X2 defines).
    const corrupt = Buffer.from(ch.bytes);
    corrupt.writeUInt32BE(200, 264);
    await writeFile(join(mountDir, SYNTH_DIR, 'CORRUPT.CH'), corrupt);

    await mkdir(wsDir, { recursive: true });
    await setupTestWorkspace(wsDir);
    await writeFile(
      join(wsDir, 'config.yaml'),
      [
        'server:',
        '  port: 3001',
        "  logLevel: 'info'",
        `  dataDir: '${join(wsDir, 'data')}'`,
        `  workspaceDir: '${join(wsDir, 'workspaces')}'`,
        "  cors: { enabled: true, origins: ['*'] }",
        "schemas: { source: 'bundled', bundledDir: './schema' }",
        'repositories:',
        '  - id: main',
        '    default: true',
        "    mode: 'embedded-git'",
        "    git: { url: '', branch: 'main', auth: { type: 'none' } }",
        "    namespace: { baseUri: 'http://localhost:3001/records/', prefix: 'local' }",
        "    jsonld: { context: 'default' }",
        "    sync: { mode: 'manual', autoCommit: true, autoPush: false }",
        "    records: { directory: 'records' }",
        'storageDevices:',
        '  - id: usb0',
        "    label: 'USB'",
        "    kind: 'local-mount'",
        `    mountPath: '${mountDir}'`,
      ].join('\n'),
    );
    ctx = await initializeApp(wsDir, {
      schemaDir: resolve(process.cwd(), '..', 'schema'),
      recordsDir: 'records',
      logLevel: 'silent',
    });
    service = new AnalysisService(ctx);
    runner = new AnalysisRunner(ctx, '/usr/bin/python3', resolve(process.cwd(), 'python-executor-service', 'src'));

    actualPython = '/usr/bin/python3';
    const pyv = spawnSync(actualPython, ['-c', 'import platform; print(platform.python_version())'], { encoding: 'utf8' });
    actualPythonVersion = pyv.stdout.trim();
    const yaml = spawnSync(actualPython, ['-c', 'import importlib.metadata as m; print(m.version("pyyaml"))'], { encoding: 'utf8' });
    actualYamlVersion = yaml.stdout.trim();
    expect(actualPythonVersion.length).toBeGreaterThan(0);
    expect(actualYamlVersion.length).toBeGreaterThan(0); // a REAL dist — the packages[].actual leg

    // Mint the engine + the per-file DREF + the GC-7 revision (TEST data in
    // the tmp store) — one atomic setup so every leg shares the same app.
    engId = await createEngine();
    const acquired = await acquireDataReference(ctx, {
      deviceId: 'usb0',
      path: `${SYNTH_DIR}/TEST.CH`,
      dataKind: 'signal',
      format: 'ch',
    });
    const env = (await ctx.store.get(acquired.recordId))!;
    drefSignal = { recordId: acquired.recordId, payload: env.payload as Record<string, unknown> };
    revId = await createGc7Revision(engId, 'TEST GC-7 peak integration revision');
  }, 90000);

  afterAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
  });

  /** The reference entry script (A0/A4): read the FIXTURE copy — the
   * authoritative copy lives in the revision record (data, minted via the
   * API below). Never a path literal into NAS. */
  function referenceEntry(): string {
    return readFileSyncSync(resolve(process.cwd(), 'python-executor-service', 'fixtures', 'gc-peaks', 'entry-reference.py'), 'utf8');
  }

  /** Mint a schema-valid analysis-engine record (TEST data, tmp store): the
   * python-entry-script adapter, system interpreter, ONE declared package
   * (pyyaml) whose ACTUAL version the probe must report. */
  async function createEngine(): Promise<string> {
    const id = 'ENG-GC7RUN001';
    const payload: Record<string, unknown> = {
      kind: 'analysis-engine',
      id,
      title: 'GC-7 test engine (stdlib, system interpreter)',
      implementation: { adapter: 'python-entry-script', entry: 'run(ctx)', module: 'computable_lab_analysis' },
      version_constraints: { python: '>=3.13', packages: [{ name: 'pyyaml', constraint: '>=6' }] },
      capabilities: {
        declared: [
          { capability: 'peak_detection', support: 'supported' },
          { capability: 'baseline_control', support: 'supported' },
          { capability: 'timed_integration_windows', support: 'supported' },
          { capability: 'area_height_reject', support: 'supported' },
          { capability: 'width_slope_sensitivity', support: 'supported' },
        ],
      },
      availability: { available: true },
      runtime_requirements: { interpreter: 'system' },
    };
    const result = await ctx.store.create({
      envelope: { recordId: id, schemaId: ENGINE_SCHEMA_ID, payload },
      message: 'GC-7 test: create engine ENG-GC7RUN001',
    });
    if (!result.success) throw new Error(`engine create failed: ${result.error ?? 'unknown'}`);
    return id;
  }

  /** Mint the GC-7 revision (entryScript = the reference copy; engineRef
   * pinned; §A2 parameterSchema; methodNotes transcription contract). */
  async function createGc7Revision(engId: string, title: string) {
    const { recordId } = await service.createRevision({
      title,
      description: 'Reusable peak-integration revision — declared settings, zero hardcoded domain truth.',
      entryScript: referenceEntry(),
      sdkVersion: '0.4.0',  // GC-8 OQ4 fold: __version__ 0.3.0 -> 0.4.0 (shipped at this base's __init__.py)
      methodNotes: REVISION_METHOD_NOTES,
      inputs: [
        { name: 'signal1', dataKind: 'signal', required: true, description: 'channel .CH bytes (per-file DREF)' },
      ],
      parameterSchema: {
        type: 'object',
        required: [
          'baseline_correction',
          'baseline_window_s',
          'peak_width_s',
          'slope_sensitivity',
          'min_width_factor',
          'max_width_factor',
          'saturated_top_fraction_of_max',
          'saturated_min_plateau_points',
          'backend',
        ],
        properties: {
          baseline_correction: { type: 'string', enum: ['none', 'tangent_skim', 'vertical_drop', 'other'] },
          baseline_window_s: { type: 'number' },
          peak_width_s: { type: 'number' },
          slope_sensitivity: { type: 'number' },
          min_width_factor: { type: 'number' },
          max_width_factor: { type: 'number' },
          saturated_top_fraction_of_max: { type: 'number' },
          saturated_min_plateau_points: { type: 'integer', minimum: 2 },
          backend: { type: 'string', enum: ['stdlib', 'scipy'] },
          method_label: { type: 'string' },
          method_revision_ref: { type: 'string' },
        },
      },
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
      requiredCapabilities: ['peak_detection'],
    });
    return recordId;
  }

  let engId: string;
  let drefSignal: { recordId: string; payload: Record<string, unknown> };
  let revId: string;

  it('T2.1 mints the revision via the service, executes to succeeded, and lands the peak table inline + the signal as a never-inline DREF', async () => {
    const { recordId: runId } = await service.createRun({
      title: 'TEST gc7-run-1',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefSignal.recordId, type: 'data-reference' } },
      parameters: RUN_PARAMS,
    });

    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');

    // The peak_table artifact is INLINE with the §A1 columns/units payload.
    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const table = artifacts.find(
      (a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === 'peak_table' &&
        (a.payload as { runRef?: { id?: string } }).runRef?.id === runId,
    );
    expect(table).toBeDefined();
    const tablePayload = table!.payload as {
      inlineValue: { columns: Array<{ name: string }>; rows: Array<Record<string, unknown>> };
      units: Record<string, string>;
      schema: { columns: Record<string, { definition: string; units: string }> };
      dataKind: string;
      dataReferenceRef?: unknown;
    };
    expect(tablePayload.dataKind).toBe('table');
    expect(tablePayload.dataReferenceRef).toBeUndefined();
    expect(tablePayload.inlineValue.rows.length).toBe(2); // the two synthetic peaks
    const colNames = tablePayload.inlineValue.columns.map((c) => c.name);
    expect(colNames).toEqual(['peak', 'rt_min', 'height_pa', 'area_pa_min', 'width_min', 'area_percent', 'symmetry', 'saturated', 'flags']);
    // §A1 column definitions + units are explicit (the artifact contract).
    expect(tablePayload.units.rt_min).toBe('min');
    expect(tablePayload.units.height_pa).toBe('pA');
    expect(tablePayload.units.area_pa_min).toBe('pA*min');
    expect(tablePayload.schema.columns.area_pa_min.definition).toBeTruthy();
    const rows = tablePayload.inlineValue.rows as Array<Record<string, unknown>>;
    expect(rows[0].rt_min).toBeCloseTo(P1.rt, 3);
    expect(rows[1].rt_min).toBeCloseTo(P2.rt, 3);
    expect(rows[0].saturated).toBe(false);
    // area_percent sums to 100 over the complete table.
    const pctTotal = (rows[0].area_percent as number) + (rows[1].area_percent as number);
    expect(pctTotal).toBeCloseTo(100.0, 6);

    // The signal artifact is DREF-backed and has NO inlineValue (never-inline,
    // ≥ 50k chars at 30k points — genuinely exercised).
    const sigArt = artifacts.find(
      (a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === 'signal_plus_baseline' &&
        (a.payload as { runRef?: { id?: string } }).runRef?.id === runId,
    );
    expect(sigArt).toBeDefined();
    const sigPayload = sigArt!.payload as { dataReferenceRef?: { id?: string }; inlineValue?: unknown };
    expect(sigPayload.dataReferenceRef?.id).toMatch(/^DREF-/);
    expect(sigPayload.inlineValue).toBeUndefined();

    // Read the persisted bytes off the tmp device and assert the DECODED
    // vectors match the generator EXACTLY (GC-6 EXACT-decode doctrine) + the
    // baseline column exists with full length.
    const drefs = await ctx.store.list({ kind: 'data-reference' });
    const sigDrefEnv = drefs.find((d) => d.recordId === sigPayload.dataReferenceRef?.id);
    expect(sigDrefEnv).toBeDefined();
    const sigDref = sigDrefEnv!.payload as { path: string };
    const raw = await readFile(join(mountDir, sigDref.path));
    const decoded = JSON.parse(raw.toString('utf8')) as {
      axis: number[];
      values: number[];
      baseline: number[];
      axis_units: string;
      value_units: string;
      integration_windows: Array<Record<string, unknown>>;
    };
    expect(decoded.axis.length).toBe(N_POINTS);
    expect(decoded.values.length).toBe(N_POINTS);
    expect(decoded.baseline.length).toBe(N_POINTS);
    expect(decoded.axis_units).toBe('min');
    expect(decoded.value_units).toBe('pA');
    expect(decoded.axis[0]).toBe(exp.axis[0]);
    expect(decoded.axis[N_POINTS - 1]).toBe(exp.axis[N_POINTS - 1]); // endpoint pinned
    for (let i = 0; i < N_POINTS; i++) {
      expect(decoded.values[i]).toBe(exp.values[i]);
    }
    // integration_windows cover the trace (a single ON segment here).
    expect(decoded.integration_windows.length).toBeGreaterThan(0);
  }, 120000);

  it('T2.2 provenance is machine-readable in the run (reader, actual engine, effective params, source hash, method echo)', async () => {
    // A fresh run so this leg owns its artifact refs.
    const { recordId: runId } = await service.createRun({
      title: 'TEST gc7-run-provenance',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefSignal.recordId, type: 'data-reference' } },
      parameters: RUN_PARAMS,
    });
    await runner.executeRun(runId);

    const runEnv = (await service.getRun(runId))!;
    const runPayload = runEnv.payload as {
      status: string;
      parameters: Record<string, unknown>;
      outputManifest: { reader?: Record<string, unknown> };
      engineProvenance?: Record<string, unknown>;
    };
    expect(runPayload.status).toBe('succeeded');

    // (a) reader version recorded — outputManifest.reader (GC-6 D4 leg).
    expect(runPayload.outputManifest.reader).toEqual({
      name: 'computable_lab_d_reader',
      version: '1.0.0',
      sdk_version: '0.4.0',  // echoes the LIVE __init__.py __version__ (OQ4 bump 0.3.0 -> 0.4.0)
    });

    // (b) the ACTUAL engine — engineProvenance with ACTUAL probed versions
    // (assert against the probe, not /usr/bin literals — GC-5 rule).
    const prov = runPayload.engineProvenance;
    expect(prov).toBeDefined();
    expect(prov!.engineRecordId).toBe(engId);
    expect(prov!.adapter).toBe('python-entry-script');
    expect(prov!.interpreterVersion).toBe(actualPythonVersion);
    // packages[].actual: the ACTUAL pyyaml version on the probed interpreter.
    const pkgs = prov!.packages as Array<{ name: string; required: string; actual: string }>;
    expect(pkgs.length).toBe(1);
    expect(pkgs[0].name).toBe('pyyaml');
    expect(pkgs[0].actual).toBe(actualYamlVersion);
    expect(prov!.probedAt).toBeTruthy();

    // (c) effective_parameters artifact == run.parameters EXACTLY + digest +
    //     source hash echo (== the minted DREF's contentHash, never re-hashed)
    //     + method_label echo (the "method revision" clause's honest data form).
    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const eff = artifacts.find(
      (a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === 'effective_parameters' &&
        (a.payload as { runRef?: { id?: string } }).runRef?.id === runId,
    );
    expect(eff).toBeDefined();
    const effPayload = (eff!.payload as { inlineValue: Record<string, unknown> }).inlineValue;
    expect(effPayload.parameters).toEqual(RUN_PARAMS);
    // params_digest == sha256 of the canonicalized params (EXACT mirror of
    // the module's _params_digest: sort_keys=True, separators (",", ":")).
    const canonical = JSON.stringify(sortKeys(RUN_PARAMS)).replace(/\s+/g, '');
    expect(effPayload.params_digest).toBe(sha256hex(canonical));
    expect((effPayload.params_digest as string).length).toBe(64);
    // source hash echo == the DREF's contentHash (echoed, never re-hashed).
    expect(effPayload.source_content_sha256).toBe((drefSignal.payload as { contentHash: string }).contentHash);
    expect(effPayload.method_label).toBe('TEST-DECLARED-LABEL');
    // reader block copy rides the artifact too (A3.6).
    expect((effPayload.reader as { sdk_version: string }).sdk_version).toBe('0.4.0');
  }, 120000);

  it('T2.3 rerun = new immutable run (idempotent re-read + byte-identical old payload + differing digest)', async () => {
    const { recordId: runA } = await service.createRun({
      title: 'TEST gc7-run-immutable-A',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefSignal.recordId, type: 'data-reference' } },
      parameters: RUN_PARAMS,
    });
    await runner.executeRun(runA);

    // sha of the OLD run's stored payload — the LOAD-BEARING assertion.
    const shaOf = (id: string): Promise<string> =>
      service.getRun(id).then((e) => sha256hex(JSON.stringify(e!.payload)));
    const before = await shaOf(runA);

    // Re-execute the SAME run → idempotent success, the STORED manifest is
    // returned verbatim (F6 idempotent leg) and the payload is UNTOUCHED.
    const again = await runner.executeRun(runA);
    expect(again.status).toBe('succeeded');
    const afterReexec = await shaOf(runA);
    expect(afterReexec).toBe(before);

    // A NEW run on the same revision with ONE parameter changed → new ANR id,
    // a DIFFERENT params_digest, and the FIRST run's stored payload still
    // byte-identical (append-only store).
    const changed = { ...RUN_PARAMS, slope_sensitivity: 0.02 };
    const { recordId: runB } = await service.createRun({
      title: 'TEST gc7-run-immutable-B',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefSignal.recordId, type: 'data-reference' } },
      parameters: changed,
    });
    expect(runB).not.toBe(runA);
    await runner.executeRun(runB);

    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const digestOf = async (run: string): Promise<string> => {
      const eff = artifacts.find(
        (a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === 'effective_parameters' &&
          (a.payload as { runRef?: { id?: string } }).runRef?.id === run,
      );
      expect(eff).toBeDefined();
      return (eff!.payload as { inlineValue: { params_digest: string } }).inlineValue.params_digest;
    };
    const digestA = await digestOf(runA);
    const digestB = await digestOf(runB);
    expect(digestA).not.toBe(digestB); // the provenance key is LIVE, not decorative
    const afterNewRun = await shaOf(runA);
    expect(afterNewRun).toBe(before); // the OLD run is byte-identical
  }, 120000);

  it('T2.4 failure legs are named (empty signal → succeeded zero rows; corrupt .CH → CH_TRUNCATED; missing param → PARAM_MISSING)', async () => {
    // (a) corrupt .CH → the NAMED CH_TRUNCATED token propagates end-to-end
    //     (GC-6 X11 channel — the reader's named code rides the RUN_FAILED
    //     message; the module never sees the bytes). The empty-signal
    //     SUCCEEDED-zero-rows behavior is proven at unit level (T1-9) — the
    //     runner path for a valid-but-empty trace is the same dref → decode →
    //     module flow already covered by T2.1.
    const drefCorrupt = await acquireDataReference(ctx, {
      deviceId: 'usb0',
      path: `${SYNTH_DIR}/CORRUPT.CH`,
      dataKind: 'signal',
      format: 'ch',
    });
    const revCorrupt = await createGc7Revision(engId, 'TEST GC-7 corrupt revision');
    const { recordId: runCorrupt } = await service.createRun({
      title: 'TEST gc7-run-corrupt',
      revisionRef: { kind: 'record', id: revCorrupt, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefCorrupt.recordId, type: 'data-reference' } },
      parameters: RUN_PARAMS,
    });
    let thrown: unknown;
    try {
      await runner.executeRun(runCorrupt);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AnalysisServiceError);
    expect((thrown as AnalysisServiceError).code).toBe('RUN_FAILED');
    expect((thrown as AnalysisServiceError).message).toContain('CH_TRUNCATED');
    const corruptRun = await service.getRun(runCorrupt);
    expect((corruptRun!.payload as { status: string }).status).toBe('failed');

    // (b) missing required parameter → the MODULE is the validator (the runner
    //     does not validate params); the run fails naming PARAM_MISSING.
    const revMissing = await createGc7Revision(engId, 'TEST GC-7 missing-param revision');
    const missingParams = { ...RUN_PARAMS };
    delete (missingParams as Record<string, unknown>).peak_width_s;
    const { recordId: runMissing } = await service.createRun({
      title: 'TEST gc7-run-missing',
      revisionRef: { kind: 'record', id: revMissing, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefSignal.recordId, type: 'data-reference' } },
      parameters: missingParams,
    });
    let thrown2: unknown;
    try {
      await runner.executeRun(runMissing);
    } catch (e) {
      thrown2 = e;
    }
    expect(thrown2).toBeInstanceOf(AnalysisServiceError);
    expect((thrown2 as AnalysisServiceError).code).toBe('RUN_FAILED');
    expect((thrown2 as AnalysisServiceError).message).toContain('PARAM_MISSING');
    expect((thrown2 as AnalysisServiceError).message).toContain('peak_width_s');
    const missingRun = await service.getRun(runMissing);
    expect((missingRun!.payload as { status: string }).status).toBe('failed');
  }, 120000);

  it('T2.5 vitest→unittest spawn wrapper: the single-command python gate is green', async () => {
    const sdkRoot = resolve(process.cwd(), 'python-executor-service');
    const { stdout, stderr } = await pExecFile('/usr/bin/python3', ['-m', 'unittest', 'discover', '-s', 'tests'], {
      cwd: sdkRoot,
      env: { ...process.env, PYTHONPATH: 'src' },
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 8,
    });
    expect(/Ran \d+ tests/.test(stderr) || /Ran \d+ tests/.test(stdout)).toBe(true);
    expect(`${stdout}${stderr}`).toMatch(/OK/);
  }, 150000);
});

// ---------------------------------------------------------------------------
// Helpers — EXACT mirrors of the module's canonicalization (peak_integration
// _params_digest: json.dumps(params, sort_keys=True, separators=(",", ":"))).
// ---------------------------------------------------------------------------
function sortKeys(v: unknown): unknown {
  if (Array.isArray(v)) return v.map(sortKeys);
  if (v !== null && typeof v === 'object') {
    const out: Record<string, unknown> = {};
    for (const k of Object.keys(v as Record<string, unknown>).sort()) out[k] = sortKeys((v as Record<string, unknown>)[k]);
    return out;
  }
  return v;
}
function sha256hex(s: string): string {
  return createHash('sha256').update(s, 'utf8').digest('hex');
}
