/**
 * GC-6 — runner-backed integration for the Python .D reader (spec T2 + T3).
 *
 * Harness = analysisRunner.test.ts verbatim pattern (tmp mount `usb0`,
 * TEST-WRITTEN config, `new AnalysisRunner(ctx, '/usr/bin/python3', …)`).
 * The synthetic .D tree is built HERE in TS (`buildSyntheticCh` — the exact
 * byte layout of the python generator `fixtures/gc-d/make_d_fixture.py`; the
 * reader is byte-level, the test asserts the PERSISTED output, not the bytes).
 *
 * NO real NAS bytes (spec B5): the "real registered RES35077-4.D" leg is the
 * manual read-only smoke script (T4) only.
 *
 * NOTE (serialization): this file SPAWNS python (the T3 gate + every run) —
 * the Python-spawn suites must run SERIALIZED, never in one parallel vitest
 * invocation (dispatch ruling; NFS flake). Run each suite in its own
 * `npx vitest run <file>` process.
 *
 * NOTE (ADV-1 defect 7): the mount/workspace dirs are UNIQUE mkdtemp dirs
 * per suite run — the previous fixed shared paths let two vitest processes
 * (an orch gate and a lane run) share, and `rm -rf`, each other's workspace.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import { AnalysisService, AnalysisServiceError } from './analysisService.js';
import { AnalysisRunner } from './analysisRunner.js';
import { acquireDataReference } from '../storage/acquisition.js';

const pExecFile = promisify(execFile);

// ---------------------------------------------------------------------------
// The synthetic v181 .CH builder — the TS mirror of
// fixtures/gc-d/make_d_fixture.py (v181 header + the exact inverse of the
// canonical decD loop: BE int16 slots, unbounded accumulators, 4-slot escape
// at index ESC_INDEX with tag 0). Plateau raw[i] = 1000 + i keeps every slot
// delta tiny. The escape LEVEL equals the plateau value at its index (1010),
// so the decoded values are EXACTLY raw[i]*scale + intercept for all i.
// ---------------------------------------------------------------------------
const N_POINTS = 30_000; // bait #4: >= 25k points so the 50k-char floor is genuinely exercised
const ESC_INDEX = 10;
const SCALE = 1.302083401242271e-4; // corpus scale (GC-1 [G1:45/AS-3])
const T0_TICKS = 3000.0; // f32-exact → t0 = 0.05 min
const T_END_TICKS = 576000.0; // f32-exact → t_end = 9.6 min

function buildSyntheticCh(n: number): { bytes: Uint8Array; t0: number; tEnd: number; scale: number } {
  const header = new Uint8Array(6144);
  const dv = new DataView(header.buffer);
  dv.setUint32(264, 13, false); // page → body offset (13-1)*512 = 6144
  header[326] = 3;
  header.set([0x31, 0x00, 0x38, 0x00], 327); // UTF-16 "18" marker
  dv.setFloat32(282, T0_TICKS, false);
  dv.setFloat32(286, T_END_TICKS, false);
  dv.setFloat64(4724, 0.0, false); // intercept
  dv.setFloat64(4732, SCALE, false); // scale

  const nSlots = n + 3; // one 4-slot escape replaces one 1-slot point
  const body = new Uint8Array(nSlots * 2);
  const bdv = new DataView(body.buffer);
  let prevB1 = 0;
  let prevRaw = 0;
  let si = 0;
  for (let i = 0; i < n; i++) {
    const raw = 1000 + i;
    if (i === ESC_INDEX) {
      const level = raw; // 1010 — lo16 1010 ≠ 32767 sentinel
      bdv.setInt16(si++ * 2, 32767, false); // sentinel
      bdv.setInt16(si++ * 2, 0, false); // tag (zero-tag escape)
      bdv.setInt16(si++ * 2, (level >>> 16) & 0xffff, false); // hi16 (0)
      bdv.setInt16(si++ * 2, level & 0xffff, false); // lo16
      prevB1 = 0;
      prevRaw = level;
    } else {
      const b1 = raw - prevRaw;
      const s = b1 - prevB1;
      bdv.setInt16(si++ * 2, s, false);
      prevB1 = b1;
      prevRaw = raw;
    }
  }
  const bytes = new Uint8Array(header.length + body.length);
  bytes.set(header, 0);
  bytes.set(body, header.length);
  // Read the header back the way the reader does: f32 ticks / 60000.
  const t0 = dv.getFloat32(282, false) / 60000.0;
  const tEnd = dv.getFloat32(286, false) / 60000.0;
  return { bytes, t0, tEnd, scale: SCALE };
}

/** The expected decoded vectors (identical float64 arithmetic to the reader). */
function expectedSignal(n: number, t0: number, tEnd: number, scale: number) {
  const axis: number[] = [];
  const values: number[] = [];
  const dt = (tEnd - t0) / (n - 1); // dt computed ONCE, exactly as the reader
  for (let i = 0; i < n; i++) {
    axis.push(t0 + i * dt); // axis[-1] === tEnd EXACTLY (decoder A convention)
    values.push((1000 + i) * scale + 0.0);
  }
  return { axis, values };
}

/** SAMPLE.XML / RUN.LOG as real UTF-16LE+BOM bytes (the [F-fixture] shapes). */
const SAMPLE_XML_TEXT =
  '<?xml version="1.0"?>\r\n' +
  '<Sample>\r\n' +
  '  <Version>0</Version>\r\n' +
  '  <Name>SYNTH-001</Name>\r\n' +
  '  <Amount>0</Amount>\r\n' +
  '  <Multiplier>1</Multiplier>\r\n' +
  '  <Dilution>1</Dilution>\r\n' +
  '  <Description></Description>\r\n' +
  '  <ISTDs>\r\n' +
  '    <ISTD Num="1">0</ISTD>\r\n' +
  '  </ISTDs>\r\n' +
  '  <TargetMasses />\r\n' +
  '</Sample>';
const RUN_LOG_TEXT =
  '  67 41e2 6adb7862    0\r\n' +
  'Method       Method started                                 10:08:18 10/23/26\r\n' +
  '  67 41e2 6adb7862    0\r\n' +
  'Method       Instrument running sample Vial 101 (front)     10:08:18 10/23/26\r\n' +
  '6890       1 Not ready:F inlet flow 19.3 at runtime 6.37    10:18:19 10/23/26\r\n';

function utf16leBom(text: string): Buffer {
  const enc = Buffer.from(text, 'utf16le');
  return Buffer.concat([Buffer.from([0xff, 0xfe]), enc]);
}

const SYNTH_DIR = 'synth-d';

// The GC-7-style consumer entry script: attach() → publish_file the signal
// (blob → DREF-backed) + small structured metadata + the input-meta echo
// (the D5 provenance leg).
const CONSUMER_ENTRY = [
  'import json, os, tempfile',
  'from computable_lab_analysis.d_reader import attach',
  '',
  'def run(ctx):',
  '    decoded = attach(ctx)',
  "    sig = decoded['signal1']",
  "    payload = {'axis': sig['axis'], 'values': sig['values'], 'channel': sig['channel']}",
  "    fd, path = tempfile.mkstemp(suffix='.json', prefix='gc6-signal-')",
  '    with os.fdopen(fd, "w") as f:',
  '        json.dump(payload, f)',
  "    ctx.publish_file('signal', path, kind='signal', format='json')",
  "    meta = decoded['sampleMeta']",
  "    ctx.publish('sample_meta', {",
  "        'name': meta['name'], 'amount': meta['amount'], 'multiplier': meta['multiplier'],",
  "        'dilution': meta['dilution'], 'version': meta['version'], 'description': meta['description'],",
  "        'isstds': meta['isstds'], 'target_masses': meta['target_masses'], 'extras': meta['extras'],",
  '    }, kind=\'table\')',
  "    rl = decoded['runLog']",
  "    ctx.publish('runlog_summary', {'lines': len(rl['lines']), 'recognized': rl['recognized_count'], 'unrecognized': rl['unrecognized_count']}, kind='table')",
  "    # D5 provenance echo: what the runner passed in input spec meta",
  "    h = ctx.input('signal1')",
  "    ctx.publish('input_meta_echo', {'meta': h.meta}, kind='table')",
].join('\n');

// The non-blob large-value leg: publish the SAME signal as an inline JSON
// STRING (>= 50k chars at 30k points) — the existing 50k-char routing must
// carry it to storage, no blob involved.
const INLINE_SIGNAL_ENTRY = [
  'import json',
  'from computable_lab_analysis.d_reader import attach',
  '',
  'def run(ctx):',
  '    decoded = attach(ctx)',
  "    sig = decoded['signal1']",
  "    blob = json.dumps({'axis': sig['axis'], 'values': sig['values']})",
  "    ctx.publish('signal_inline', blob, kind='signal')",
].join('\n');

describe('AnalysisRunner + d_reader (GC-6 integration)', () => {
  // ADV-1 defect 7 — unique mkdtemp dirs per suite run (the previous fixed
  // shared paths let two vitest processes share and rm -rf each other).
  let mountDir = '';
  let wsDir = '';

  let ctx: Awaited<ReturnType<typeof initializeApp>>;
  let runner: AnalysisRunner;
  let service: AnalysisService;

  beforeAll(async () => {
    mountDir = await mkdtemp(join(tmpdir(), 'cl-dreader-mount-'));
    wsDir = await mkdtemp(join(tmpdir(), 'cl-dreader-ws-'));
    await mkdir(mountDir, { recursive: true });
    await mkdir(join(mountDir, SYNTH_DIR), { recursive: true });
    const { bytes } = buildSyntheticCh(N_POINTS);
    await writeFile(join(mountDir, SYNTH_DIR, 'FID1A.CH'), bytes);
    await writeFile(join(mountDir, SYNTH_DIR, 'SAMPLE.XML'), utf16leBom(SAMPLE_XML_TEXT));
    await writeFile(join(mountDir, SYNTH_DIR, 'RUN.LOG'), utf16leBom(RUN_LOG_TEXT));

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
  }, 30000);

  afterAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
  });

  it('decodes the synthetic .D end-to-end: signal as DREF-backed artifact, metadata exact, reader version recorded', async () => {
    // PER-FILE data-references — the exact shape GC-4's packageAnalysisInputs
    // yields ([GC4:256-264]); naming is arbitrary (signal1/sampleMeta/runLog)
    // because the reader classifies by CONTENT (D3).
    const drefSignal = await acquireDataReference(ctx, { deviceId: 'usb0', path: `${SYNTH_DIR}/FID1A.CH`, dataKind: 'signal', format: 'ch' });
    const drefXml = await acquireDataReference(ctx, { deviceId: 'usb0', path: `${SYNTH_DIR}/SAMPLE.XML`, dataKind: 'binary', format: 'xml' });
    const drefLog = await acquireDataReference(ctx, { deviceId: 'usb0', path: `${SYNTH_DIR}/RUN.LOG`, dataKind: 'binary', format: 'log' });

    const { recordId: revId } = await service.createRevision({ title: 'GC-6 decode', entryScript: CONSUMER_ENTRY, sdkVersion: '0.2.0' });
    const { recordId: runId } = await service.createRun({
      title: 'gc6-decode',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: {
        signal1: { kind: 'record', id: drefSignal.recordId, type: 'data-reference' },
        sampleMeta: { kind: 'record', id: drefXml.recordId, type: 'data-reference' },
        runLog: { kind: 'record', id: drefLog.recordId, type: 'data-reference' },
      },
    });

    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');

    // (1) the signal artifact is DREF-backed and has NO inlineValue (never-inline)
    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const sigArt = artifacts.find((a) => (a.payload as { name?: string }).name === 'signal');
    expect(sigArt).toBeDefined();
    const sigPayload = sigArt!.payload as {
      dataReferenceRef?: { id?: string };
      inlineValue?: unknown;
      dataKind?: string;
      sourceRelations?: Array<{ kind: string; id: string; type: string }>;
    };
    expect(sigPayload.dataKind).toBe('signal');
    expect(sigPayload.dataReferenceRef?.id).toMatch(/^DREF-/);
    expect(sigPayload.inlineValue).toBeUndefined();

    // (2) read the persisted DREF bytes back off the tmp device and assert the
    // decoded vectors against the TS-computed expectations (GC-1 EXACT, D6)
    const drefs = await ctx.store.list({ kind: 'data-reference' });
    const sigDrefEnv = drefs.find((d) => d.recordId === sigPayload.dataReferenceRef?.id);
    expect(sigDrefEnv).toBeDefined();
    const sigDref = sigDrefEnv!.payload as { path: string; storageDeviceId: string };
    const raw = await readFile(join(mountDir, sigDref.path));
    const decoded = JSON.parse(raw.toString('utf8')) as { axis: number[]; values: number[]; channel: string };
    const { t0, tEnd, scale } = buildSyntheticCh(0); // header math only (bytes unused)
    const exp = expectedSignal(N_POINTS, t0, tEnd, scale);
    expect(decoded.channel).toBe('FID1A'); // stem of the DREF's sourcePath — data, not a hardcoded literal
    expect(decoded.axis.length).toBe(N_POINTS);
    expect(decoded.values.length).toBe(N_POINTS);
    expect(decoded.axis[0]).toBe(t0);
    expect(decoded.axis[N_POINTS - 1]).toBe(tEnd); // axis[-1] === t_end EXACTLY
    for (let i = 0; i < N_POINTS; i++) {
      expect(decoded.axis[i]).toBe(exp.axis[i]);
      expect(decoded.values[i]).toBe(exp.values[i]);
    }

    // (3) metadata exact
    const metaArt = artifacts.find((a) => (a.payload as { name?: string }).name === 'sample_meta');
    expect((metaArt!.payload as { inlineValue: Record<string, unknown> }).inlineValue).toEqual({
      name: 'SYNTH-001',
      amount: '0',
      multiplier: '1',
      dilution: '1',
      version: '0',
      description: '',
      isstds: [{ num: '1', value: '0' }],
      target_masses: [],
      extras: {},
    });
    const rlArt = artifacts.find((a) => (a.payload as { name?: string }).name === 'runlog_summary');
    expect((rlArt!.payload as { inlineValue: Record<string, number> }).inlineValue).toEqual({
      lines: 5,
      recognized: 3,
      unrecognized: 2,
    });

    // (4) reader version recorded — the STORED run payload's outputManifest
    // (D4: provable independent of GC-5's merge order)
    const runEnv = await service.getRun(runId);
    expect((runEnv!.payload as { status: string }).status).toBe('succeeded');
    const storedManifest = (runEnv!.payload as { outputManifest: Record<string, unknown> }).outputManifest;
    expect(storedManifest.reader).toEqual({
      name: 'computable_lab_d_reader',
      version: '1.0.0',
      sdk_version: '0.4.0', // GC-8 (OQ4 fold): the SDK __version__ bump 0.3.0 -> 0.4.0 (leg-0); the reader block echoes the LIVE __init__.py __version__ — same class as the test_d_reader.py:383 and analysisGcIntegration.test.ts pins (legitimate expected-value update, test data only)
    });

    // (5) provenance: the artifact's sourceRelations include the input DREFs
    // (shipped behavior, analysisRunner sourceRelations — the reader adds none)
    expect(sigPayload.sourceRelations).toEqual(
      expect.arrayContaining([
        expect.objectContaining({ kind: 'record', id: drefSignal.recordId, type: 'data-reference' }),
        expect.objectContaining({ kind: 'record', id: drefXml.recordId, type: 'data-reference' }),
        expect.objectContaining({ kind: 'record', id: drefLog.recordId, type: 'data-reference' }),
      ]),
    );

    // (6) D5 leg: the input spec meta carried the DREF's pinned sourcePath +
    // contentHash (the echo entry script dumped ctx.input('signal1').meta)
    const echoArt = artifacts.find((a) => (a.payload as { name?: string }).name === 'input_meta_echo');
    const echoMeta = (echoArt!.payload as { inlineValue: { meta: { sourcePath: string; contentHash: string } } }).inlineValue.meta;
    expect(echoMeta.sourcePath).toBe(`${SYNTH_DIR}/FID1A.CH`);
    expect(echoMeta.contentHash).toBe((drefSignal.payload as { contentHash: string }).contentHash);
  }, 120000);

  it('routes a large inline signal (non-blob leg, >= 50k chars) to storage, never inline', async () => {
    const drefSignal = await acquireDataReference(ctx, { deviceId: 'usb0', path: `${SYNTH_DIR}/FID1A.CH`, dataKind: 'signal', format: 'ch' });
    const { recordId: revId } = await service.createRevision({ title: 'GC-6 inline leg', entryScript: INLINE_SIGNAL_ENTRY, sdkVersion: '0.2.0' });
    const { recordId: runId } = await service.createRun({
      title: 'gc6-inline',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefSignal.recordId, type: 'data-reference' } },
    });
    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');

    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const art = artifacts.find(
      (a) => (a.payload as { name?: string }).name === 'signal_inline' && (a.payload as { runRef?: { id?: string } }).runRef?.id === runId,
    );
    expect(art).toBeDefined();
    const p = art!.payload as { dataReferenceRef?: { id?: string }; inlineValue?: unknown };
    // 30k points → >= 50k chars → the existing large-value routing fires:
    // dataReferenceRef present, inlineValue absent (bait #4)
    expect(p.dataReferenceRef?.id).toMatch(/^DREF-/);
    expect(p.inlineValue).toBeUndefined();
  }, 120000);

  it('fails a run with the NAMED CH_TRUNCATED code on a corrupt .CH input (X11)', async () => {
    // Corrupt file: valid v181 marker but the header page places the body past
    // EOF (the CH_TRUNCATED row, spec X1/X2).
    const { bytes } = buildSyntheticCh(N_POINTS);
    const dv = new DataView(bytes.buffer);
    dv.setUint32(264, 200, false); // page 200 → offset 101632 > file size
    await writeFile(join(mountDir, SYNTH_DIR, 'CORRUPT.CH'), bytes);
    const drefCorrupt = await acquireDataReference(ctx, { deviceId: 'usb0', path: `${SYNTH_DIR}/CORRUPT.CH`, dataKind: 'signal', format: 'ch' });

    const { recordId: revId } = await service.createRevision({ title: 'GC-6 corrupt', entryScript: CONSUMER_ENTRY, sdkVersion: '0.2.0' });
    const { recordId: runId } = await service.createRun({
      title: 'gc6-corrupt',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefCorrupt.recordId, type: 'data-reference' } },
    });

    // X11 end-to-end: ReaderError → CLI {"ok":false,"error":"ReaderError:
    // CH_TRUNCATED …"} exit 1 → runner RUN_FAILED naming it → run status failed.
    // The token RUN_FAILED is the AnalysisServiceError CODE; the ReaderError
    // string (with CH_TRUNCATED) rides the message via stderr.
    let thrown: unknown;
    try {
      await runner.executeRun(runId);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AnalysisServiceError);
    expect((thrown as AnalysisServiceError).code).toBe('RUN_FAILED');
    expect((thrown as AnalysisServiceError).message).toContain('CH_TRUNCATED');
    const runEnv = await service.getRun(runId);
    expect((runEnv!.payload as { status: string }).status).toBe('failed');
  }, 120000);

  it('post-registration drift is refused by the GC-5 hash guard BEFORE the reader (DATA_HASH_MISMATCH)', async () => {
    // Honest boundary: truncating the file AFTER registration means the
    // declared contentHash no longer matches the live bytes — GC-5's shipped
    // execute-time re-hash (untouched by GC-6) refuses first with its NAMED
    // token. The reader's CH_TRUNCATED path is proven by the case above
    // (corrupt-at-registration). This case proves the D5 edit did not weaken
    // the GC-5 guard sitting in the same function.
    await writeFile(join(mountDir, SYNTH_DIR, 'DRIFT.CH'), (await readFile(join(mountDir, SYNTH_DIR, 'FID1A.CH'))).subarray(0, 7000));
    const drefDrift = await acquireDataReference(ctx, { deviceId: 'usb0', path: `${SYNTH_DIR}/DRIFT.CH`, dataKind: 'signal', format: 'ch' });
    const driftBytes = (await readFile(join(mountDir, SYNTH_DIR, 'FID1A.CH'))).subarray(0, 5000);
    await writeFile(join(mountDir, SYNTH_DIR, 'DRIFT.CH'), driftBytes); // truncate AFTER acquisition

    const { recordId: revId } = await service.createRevision({ title: 'GC-6 drift', entryScript: CONSUMER_ENTRY, sdkVersion: '0.2.0' });
    const { recordId: runId } = await service.createRun({
      title: 'gc6-drift',
      revisionRef: { kind: 'record', id: revId, type: 'analysis-revision' },
      inputs: { signal1: { kind: 'record', id: drefDrift.recordId, type: 'data-reference' } },
    });
    // GC-5's guard throws with code DATA_HASH_MISMATCH and a message that
    // names the drift — assert both (the token rides the code, not the message).
    let thrown: unknown;
    try {
      await runner.executeRun(runId);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AnalysisServiceError);
    expect((thrown as AnalysisServiceError).code).toBe('DATA_HASH_MISMATCH');
    expect((thrown as AnalysisServiceError).message).toContain('bytes drifted');
    const runEnv = await service.getRun(runId);
    expect((runEnv!.payload as { status: string }).status).toBe('failed');
  }, 120000);

  it('T3 gate: spawns the python unittest suite (single-command repo gate)', async () => {
    const sdkRoot = resolve(process.cwd(), 'python-executor-service');
    const { stdout, stderr } = await pExecFile('/usr/bin/python3', ['-m', 'unittest', 'discover', '-s', 'tests'], {
      cwd: sdkRoot,
      env: { ...process.env, PYTHONPATH: 'src' },
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 8,
    });
    // unittest reports on stderr
    expect(/Ran \d+ tests/.test(stderr) || /Ran \d+ tests/.test(stdout)).toBe(true);
    expect(`${stdout}${stderr}`).toMatch(/OK/);
  }, 150000);
});
