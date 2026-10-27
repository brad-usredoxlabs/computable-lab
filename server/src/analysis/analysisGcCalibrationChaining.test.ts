/**
 * GC-8 — runner-backed chaining for the calibration + quantification
 * revisions (spec T2 — THE SPINE): CAL run → promote the model artifact →
 * QUANT run consumes the promoted dref + a DIFFERENT run's peak table.
 *
 * Harness = analysisRunner.test.ts verbatim pattern [F :11-65] (unique
 * mkdtemp dirs; TEST-WRITTEN config with tmp mount `usb0`;
 * `new AnalysisRunner(ctx, '/usr/bin/python3', <sdk src>)`). Entry scripts
 * are read from the fixture reference copies (fixtures/gc-calibration/
 * {cal,quant}-entry-reference.py) — the authoritative copies live in the
 * revision records (data, minted via the service below; never git files).
 *
 * GC-7 is merged at this base — the spine does NOT depend on GC-7's math:
 * the two upstream peak tables are minted by a MINIMAL test revision
 * (the leg's own entry script publishing a §A1-shaped table — the spec
 * T2-1 sanctioned form; the assertion is on GC-8's consumption, never on
 * GC-7's math).
 *
 * NO real NAS bytes (spec B2) — the real-standards leg is the lane-only
 * read-only smoke script (T3, .hermes/plans/scripts/).
 *
 * NOTE (serialization): this file SPAWNS python (every run + the
 * unittest wrapper) — run it in its OWN `npx vitest run <file>` process,
 * never in a parallel invocation with the other python-spawn suites.
 */
import { beforeAll, afterAll, describe, expect, it } from 'vitest';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
import { promisify } from 'node:util';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { readFileSync as readFileSyncSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import { AnalysisService, AnalysisServiceError } from './analysisService.js';
import { AnalysisRunner } from './analysisRunner.js';
import { promoteArtifact } from './artifactPromotion.js';

const pExecFile = promisify(execFile);

const ENGINE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/analysis-engine.schema.yaml';
const SDK_VERSION = '0.4.0'; // GC-8 OQ4 fold (shipped __init__.py at this base)

// ---------------------------------------------------------------------------
// CAPABILITY TERMS (ruling: 2026-10-27_GC-8-D1-capability-enum-ruling.md).
// The B1 re-pin (orchestrator, first-hand) declares ['curve_fitting',
// 'weighted_regression'] — the spec's §A7 :462 names. Adversarial cycle 1
// (D1 BLOCKER) found the ORIGINAL run's silent substitution of
// `peak_detection` for the whole spine and its T2-0 gap-encoding test.
// The orchestrator ruling REJECTED the substitution and RATIFIED widening the
// two closed schema enums (analysis-engine + analysis-revision) with EXACTLY
// the two spec-mandated terms — nothing else in those files. The spine
// THEREFORE declares the spec's real terms: the engine record declares them,
// the CAL and QUANT revisions pin them, and leg T2-0 (below) proves the store
// and the execute-time capability gate ACCEPT the real terms — if either
// still rejected them after the widening, that would be a real platform gap
// and the fix run would STOP with evidence (ruling step 3), never substitute.
// ---------------------------------------------------------------------------
const B1_CAPABILITIES = ['curve_fitting', 'weighted_regression'];

/** The minimal §A1-shaped peak-table publisher (spec T2-1 sanctioned form:
 * a minimal test revision publishing a GC-7-shaped table — the assertion is
 * on GC-8's consumption, never on GC-7's math). */
const MINIMAL_PEAK_TABLE_ENTRY = [
  'def run(ctx):',
  "    spec = ctx.parameters['rows']",
  '    rows = [{',
  "        'peak': i + 1, 'rt_min': r['rt'], 'height_pa': r['area'] / 0.05,",
  "        'area_pa_min': r['area'], 'width_min': 0.05,",
  "        'area_percent': r['area'] / sum(s['area'] for s in spec) * 100.0,",
  "        'symmetry': 1.0, 'saturated': False, 'flags': [],",
  '    } for i, r in enumerate(spec)]',
  '    ctx.publish("peak_table", {"columns": ["peak", "rt_min", "height_pa", "area_pa_min",',
  '                               "width_min", "area_percent", "symmetry", "saturated", "flags"],',
  '                               "rows": rows}, kind="table")',
].join('\n');

const CAL_PARAMS_SCHEMA = {
  type: 'object',
  required: ['model', 'weighting', 'origin_constraint', 'correlation_statistic', 'amount_unit',
    'istd', 'extrapolation', 'fail_on_out_of_range', 'levels'],
  properties: {
    model: { type: 'string', enum: ['linear', 'linear_through_origin', 'quadratic'] },
    weighting: { type: 'string', enum: ['none', '1/x', '1/x^2', '1/y^2'] },
    origin_constraint: { type: 'boolean' },
    correlation_statistic: { type: 'string', enum: ['none', 'weighted_r_squared', 'plain_r_squared', 'spearman'] },
    amount_unit: { type: 'string' },
    istd: { type: 'object' },
    extrapolation: { type: 'string', enum: ['reject', 'allow_within_declared_extension'] },
    fail_on_out_of_range: { type: 'boolean' },
    allow_inline_inputs: { type: 'boolean' },
    calibration_run_id: { type: ['string', 'null'] },
    levels: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['level', 'compound_label', 'amount', 'rt_target_min', 'rt_window_min', 'fit', 'required'],
        properties: {
          level: { type: 'integer' },
          compound_label: { type: 'string' },
          compound_ref: { type: ['object', 'string', 'null'] },
          amount: { type: 'number' },
          rt_target_min: { type: 'number' },
          rt_window_min: { type: 'number', exclusiveMinimum: 0 },
          fit: { type: 'boolean' },
          required: { type: 'boolean' },
          input_names: { type: 'array' },
          weight: { type: 'number' },
        },
      },
    },
  },
};

const QUANT_PARAMS_SCHEMA = {
  type: 'object',
  required: ['istd', 'targets', 'extrapolation', 'fail_on_out_of_range', 'amount_semantics'],
  properties: {
    istd: { type: 'object' },
    targets: {
      type: 'array',
      minItems: 1,
      items: {
        type: 'object',
        required: ['compound_label', 'rt_target_min', 'rt_window_min'],
        properties: {
          compound_label: { type: 'string' },
          compound_ref: { type: ['object', 'string', 'null'] },
          rt_target_min: { type: 'number' },
          rt_window_min: { type: 'number', exclusiveMinimum: 0 },
        },
      },
    },
    extrapolation: { type: 'string', enum: ['reject', 'allow_within_declared_extension'] },
    fail_on_out_of_range: { type: 'boolean' },
    amount_semantics: { type: 'string', enum: ['model_amount_as_reported', 'apply_multipliers'] },
    allow_inline_inputs: { type: 'boolean' },
    sample: { type: 'object' },
    quant_tolerance_percent: { type: 'number' },
    extension_low: { type: 'number' },
    extension_high: { type: 'number' },
  },
};

/** C1 fixture data (spec fixtures table): x = 1..5, y = 2x + 1 exact.
 * Declared amounts + rts are DATA (test literals, never a path/vendor
 * literal). */
const LEVELS = [1, 2, 3, 4, 5].map((i) => ({
  level: i,
  compound_label: `TEST-CMPD-${String.fromCharCode(64 + i)}`,
  compound_ref: { id: `LC-CMPD-${i}` },
  amount: i,
  rt_target_min: i,
  rt_window_min: 0.25,
  fit: true,
  required: true,
  input_names: [`level_${i}`],
}));
const C1_ROWS = [1, 2, 3, 4, 5].map((i) => ({ rt: i, area: 2 * i + 1 }));
const QUANT_TARGETS = LEVELS.map((lv) => ({
  compound_label: lv.compound_label,
  compound_ref: lv.compound_ref,
  rt_target_min: lv.rt_target_min,
  rt_window_min: lv.rt_window_min,
}));
const CAL_PARAMS = {
  model: 'linear',
  weighting: 'none',
  origin_constraint: false,
  correlation_statistic: 'weighted_r_squared',
  amount_unit: 'ng/uL',
  istd: { role: 'none' },
  extrapolation: 'reject',
  fail_on_out_of_range: true,
  allow_inline_inputs: true, // the declared A5 gate (accept branch — dict-inline levels)
  levels: LEVELS,
};
const QUANT_PARAMS = {
  istd: { role: 'none' },
  targets: QUANT_TARGETS,
  extrapolation: 'reject',
  fail_on_out_of_range: true,
  amount_semantics: 'model_amount_as_reported',
  // the A5 gate, DECLARED true on the spine: the model arrives as a PROMOTED
  // dref (file-backed — the gate is inert for it) but the lane's minimal
  // publisher's small peak_table arrives dict-inline (the spec T2-1 accept
  // branch — the declared parameter earning its keep; T2-2 proves the
  // ABSENT side fails INPUT_NOT_PROMOTED).
  allow_inline_inputs: true,
  // the declared tolerance — defaults NOWHERE (the test declares it)
  quant_tolerance_percent: 1.0,
};

describe('AnalysisRunner + calibration/quantification chaining (GC-8 spine)', () => {
  let mountDir = '';
  let wsDir = '';
  let ctx: Awaited<ReturnType<typeof initializeApp>>;
  let runner: AnalysisRunner;
  let service: AnalysisService;

  let engId: string;
  let minimalRev: string;

  const sha256hex = (s: string): string => createHash('sha256').update(s, 'utf8').digest('hex');
  const shaOf = (id: string): Promise<string> =>
    service.getRun(id).then((e) => sha256hex(JSON.stringify(e!.payload)));

  /** Mint a schema-valid engine record (TEST data, tmp store). */
  async function createEngine(id: string, caps: string[], title: string): Promise<string> {
    const payload: Record<string, unknown> = {
      kind: 'analysis-engine',
      id,
      title,
      implementation: { adapter: 'python-entry-script', entry: 'run(ctx)', module: 'computable_lab_analysis' },
      version_constraints: { python: '>=3.13', packages: [{ name: 'pyyaml', constraint: '>=6' }] },
      capabilities: { declared: caps.map((c) => ({ capability: c, support: 'supported' })) },
      availability: { available: true },
      runtime_requirements: { interpreter: 'system' },
    };
    const result = await ctx.store.create({
      envelope: { recordId: id, schemaId: ENGINE_SCHEMA_ID, payload },
      message: `GC-8 test: create engine ${id}`,
    });
    if (!result.success) throw new Error(`engine create failed: ${result.error ?? 'unknown'}`);
    return id;
  }

  beforeAll(async () => {
    mountDir = await mkdtemp(join(tmpdir(), 'cl-gc8-mount-'));
    wsDir = await mkdtemp(join(tmpdir(), 'cl-gc8-ws-'));
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

    engId = await createEngine('ENG-GC8CAL001', B1_CAPABILITIES,
      'GC-8 calibration/quantification engine (stdlib, system interpreter)');

    // The minimal §A1 peak-table publisher revision (T2-1). It publishes the
    // GC-7-shaped tables the spine consumes — it does NOT do curve fitting, so
    // it pins NO GC-8 capability (no engineRef → the shipped runner takes the
    // legacy no-gate path, analysisRunner.ts :697). Pinning a capability here
    // would be a second substitution of the D1 class — never.
    const { recordId } = await service.createRevision({
      title: 'GC-8 minimal peak-table publisher (test data)',
      entryScript: MINIMAL_PEAK_TABLE_ENTRY,
      sdkVersion: SDK_VERSION,
      inputs: [{ name: 'rows', dataKind: 'table', required: true, description: 'declared synthetic rows (test data)' }],
      parameterSchema: { type: 'object', required: ['rows'], properties: { rows: { type: 'array' } } },
    });
    minimalRev = recordId;
  }, 90000);

  afterAll(async () => {
    await rm(mountDir, { recursive: true, force: true });
    await rm(wsDir, { recursive: true, force: true });
  });

  it('T2-0 capability terms ACCEPTED: the store mints the engine declaring the spec terms, and the CAL spine PASSES the execute-time capability gate on them', async () => {
    // Ruling step 3 (2026-10-27_GC-8-D1-capability-enum-ruling.md): the spine
    // declares the spec's REAL terms; if store validation or the
    // engine-capability gate STILL rejected them after the enum widening,
    // THAT is a real platform gap — STOP with evidence, do not substitute.
    // (a) Store validation: the SAME engine payload (ENG-GC8CAL001) that
    // beforeAll minted with B1_CAPABILITIES re-validated against the schema —
    // if either spec term were still outside the closed enum, the store would
    // refuse it. (beforeAll would have thrown first, so its success is the
    // primary proof; the re-check makes the assertion local + explicit.)
    const engEnv = await ctx.store.get('ENG-GC8CAL001');
    expect(engEnv).toBeDefined();
    const declared = (engEnv!.payload as { capabilities?: { declared?: Array<{ capability: string; support: string }> } })
      .capabilities!.declared!;
    expect(declared.map((c) => c.capability)).toEqual(B1_CAPABILITIES);
    // (b) Execute-time gate: a real CAL run whose revision pins the spec
    // terms (see createCalRevision) reaches executeLocked's engineGate
    // (analysisRunner.ts :598-610: every requiredCapability must be declared
    // supported/approximate on the pinned engine or the run hard-fails
    // ENGINE_CAPABILITY_UNSUPPORTED). A succeeded status therefore PROVES the
    // gate accepted the real terms — the capability gate proves what it
    // claims (the exact failure D1 punished).
    const calRev = await createCalRevision('TEST GC-8 cal-rev-capability-gate');
    const stdA = await publishPeakTable('gc8-std-caps-A', C1_ROWS);
    const capRun = await runCal(calRev, stdA, CAL_PARAMS);
    const capRes = await runner.executeRun(capRun);
    expect(capRes.status).toBe('succeeded');
    expect(capRes.status).not.toBe('failed'); // no ENGINE_CAPABILITY_UNSUPPORTED
  }, 180000);

  /** Mint the CAL revision (entry = the fixture reference copy). */
  async function createCalRevision(title: string) {
    const { recordId } = await service.createRevision({
      title,
      description: 'Reusable calibration-fit revision — declared settings, zero hardcoded domain truth.',
      entryScript: readFileSyncSync(resolve(process.cwd(), 'python-executor-service', 'fixtures', 'gc-calibration', 'cal-entry-reference.py'), 'utf8'),
      sdkVersion: SDK_VERSION,
      inputs: LEVELS.map((lv) => ({
        name: `level_${lv.level}`,
        dataKind: 'table',
        required: true,
        description: `peak table for standard level ${lv.level} (GC-7 artifact ref or promoted dref)`,
      })),
      parameterSchema: CAL_PARAMS_SCHEMA,
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
      // The spec's REAL capability terms (§A7 — the D1 ruling rejects any
      // substitution; the spine proves the gate on these, not on peak_detection).
      requiredCapabilities: [...B1_CAPABILITIES],
    });
    return recordId;
  }

  /** Mint the QUANT revision (entry = the fixture reference copy). */
  async function createQuantRevision(title: string) {
    const { recordId } = await service.createRevision({
      title,
      description: 'Reusable quantification revision — cross-run consumer of the PROMOTED model.',
      entryScript: readFileSyncSync(resolve(process.cwd(), 'python-executor-service', 'fixtures', 'gc-calibration', 'quant-entry-reference.py'), 'utf8'),
      sdkVersion: SDK_VERSION,
      inputs: [
        { name: 'calibration_model', dataKind: 'table', required: true, description: 'PROMOTED calibration_model artifact (dref)' },
        { name: 'peak_table', dataKind: 'table', required: true, description: 'a DIFFERENT run GC-7 peak_table artifact' },
      ],
      parameterSchema: QUANT_PARAMS_SCHEMA,
      engineRef: { kind: 'record', type: 'analysis-engine', id: engId },
      // The spec's REAL capability terms (§A7) — the quantification leg of the
      // curve-fitting/weighted-regression revision pair (D1 ruling: no substitution).
      requiredCapabilities: [...B1_CAPABILITIES],
    });
    return recordId;
  }

  /** Run the minimal publisher with declared rows → its peak_table artifact id. */
  async function publishPeakTable(title: string, rows: Array<{ rt: number; area: number }>): Promise<string> {
    const { recordId: runId } = await service.createRun({
      title,
      revisionRef: { kind: 'record', id: minimalRev, type: 'analysis-revision' },
      inputs: {},
      parameters: { rows },
    });
    const res = await runner.executeRun(runId);
    expect(res.status).toBe('succeeded');
    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const art = artifacts.find(
      (a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === 'peak_table' &&
        (a.payload as { runRef?: { id?: string } }).runRef?.id === runId,
    );
    expect(art).toBeDefined();
    expect((art!.payload as { inlineValue?: unknown }).inlineValue).toBeDefined(); // inline (small)
    return art!.recordId;
  }

  const artifactOf = async (name: string, runId: string) => {
    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const art = artifacts.find(
      (a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === name &&
        (a.payload as { runRef?: { id?: string } }).runRef?.id === runId,
    );
    if (!art) throw new Error(`artifact ${name} not found for run ${runId}`);
    return art;
  };

  /** A fresh CAL run (declared params + the level artifact refs). */
  async function runCal(calRev: string, stdTable: string, params: Record<string, unknown>): Promise<string> {
    const calInputs: Record<string, { kind: 'record'; id: string; type: string }> = {};
    for (const lv of LEVELS) calInputs[`level_${lv.level}`] = { kind: 'record', id: stdTable, type: 'analysis-output-artifact' };
    const { recordId } = await service.createRun({
      title: `TEST gc8-cal ${params.allow_inline_inputs ? 'inline' : 'file'}`,
      revisionRef: { kind: 'record', id: calRev, type: 'analysis-revision' },
      inputs: calInputs,
      parameters: params,
    });
    return recordId;
  }

  it('T2-1 full chain: CAL run (A5 accept branch) → promote model → QUANT consumes promoted dref + a DIFFERENT run peak_table', async () => {
    // (a) TWO upstream runs with DIFFERENT synthetic tables (different
    // synthetic values ⇒ different runs — the spec spine).
    const runStdA = await publishPeakTable('gc8-std-A', C1_ROWS); // CAL's level inputs
    const runStdB = await publishPeakTable('gc8-std-B', C1_ROWS); // QUANT's sample table (different run)
    expect(runStdA).not.toBe(runStdB);

    // (b) CAL run — level_<k> inputs = the run-A peak-table artifact refs
    // (inline dict provisioning — exercised with the declared
    // allow_inline_inputs: true; the A5 accept branch earning its keep).
    const calRev = await createCalRevision('TEST GC-8 calibration revision');
    const calRun = await runCal(calRev, runStdA, CAL_PARAMS);
    const calRes = await runner.executeRun(calRun);
    expect(calRes.status).toBe('succeeded');

    // (c) the calibration_model inline artifact carries the A6 payload:
    // coefficients == C1 within 1e-12, the equation string, the statistic,
    // fit_points with source_point_refs present.
    const calModelArt = await artifactOf('calibration_model', calRun);
    const calModel = (calModelArt.payload as { inlineValue: Record<string, unknown> }).inlineValue;
    const coefs = calModel.coefficients as Record<string, number>;
    expect(Math.abs(coefs.slope - 2.0)).toBeLessThan(1e-12);
    expect(Math.abs(coefs.intercept - 1.0)).toBeLessThan(1e-12);
    expect(String(calModel.equation)).toBe('raw_area_pa_min = 2.0 * amount_ng_uL + 1.0');
    expect(calModel.statistic_name).toBe('weighted_r_squared');
    expect(calModel.amount_unit).toBe('ng/uL');
    expect(calModel.calibration_scope).toBe('analytical');
    expect(Array.isArray(calModel.fit_points)).toBe(true);
    expect((calModel.fit_points as Array<Record<string, unknown>>).length).toBe(5);
    for (const fp of calModel.fit_points as Array<Record<string, unknown>>) {
      expect(fp.source_point_ref).toBeDefined();
      const ref = fp.source_point_ref as Record<string, unknown>;
      expect(ref.input_name).toMatch(/^level_\d+$/);
      expect(ref.peak_row_index).toBeDefined();
      // D4: the identity slot is an _id field — a filesystem PATH may never sit
      // under it (the original run carried meta.sourcePath there). The spine's
      // level inputs are UNPROMOTED inline artifacts: no declared ref id exists
      // for them, so the key must be OMITTED (the module carries a declared id
      // only when one is available via the input meta — proven in the python
      // unit tests against a synthetic meta).
      expect('artifact_or_dref_id' in ref).toBe(false);
    }
    // the calibration_table A1 payload
    const calTable = (await artifactOf('calibration_table', calRun)).payload as { inlineValue: Record<string, unknown> };
    const calTableV = calTable.inlineValue;
    expect(calTableV.amount_unit).toBe('ng/uL');
    expect(calTableV.calibration_scope).toBe('analytical');
    expect((calTableV.rows as Array<Record<string, unknown>>).length).toBe(5);
    expect(calModel.params_digest).toMatch(/^[a-f0-9]{64}$/);

    // (c-2) PROMOTE the model artifact via the shipped service (F :38-116).
    const promoted = await promoteArtifact(ctx, calModelArt.recordId);
    expect(promoted.created).toBe(true);
    expect(promoted.dataReferenceId).toMatch(/^DREF-/);
    const updatedModel = (await ctx.store.get(calModelArt.recordId))!;
    expect((updatedModel.payload as { dataReferenceRef?: { id?: string } }).dataReferenceRef?.id)
      .toBe(promoted.dataReferenceId);
    // the promoted dref's path layout names the ARTIFACT id (A5 identity echo)
    const drefPath = ((await ctx.store.get(promoted.dataReferenceId))!.payload as { path: string }).path;
    expect(drefPath).toBe(`analysis-artifacts/promoted/${calModelArt.recordId}/calibration_model.json`);
    // idempotent: a second promote returns the SAME dref, created=false
    const rePromoted = await promoteArtifact(ctx, calModelArt.recordId);
    expect(rePromoted.created).toBe(false);
    expect(rePromoted.dataReferenceId).toBe(promoted.dataReferenceId);

    // (d) QUANT run — inputs {calibration_model: the PROMOTED DREF (the
    // acceptance spine — the promoted data-reference the model now IS),
    // peak_table: run B's artifact (DIFFERENT run)}; parameters = declared
    // targets/istd/policy. The model identity (A6) surfaces from the dref's
    // OWN storage path layout (the runner's data-reference branch passes the
    // DREF's pinned meta.sourcePath — analysisRunner.ts :446-450).
    const quantRev = await createQuantRevision('TEST GC-8 quantification revision');
    const { recordId: quantRun } = await service.createRun({
      title: 'TEST gc8-quant-run',
      revisionRef: { kind: 'record', id: quantRev, type: 'analysis-revision' },
      inputs: {
        calibration_model: { kind: 'record', id: promoted.dataReferenceId, type: 'data-reference' },
        peak_table: { kind: 'record', id: runStdB, type: 'analysis-output-artifact' },
      },
      parameters: QUANT_PARAMS,
    });
    const quantRes = await runner.executeRun(quantRun);
    expect(quantRes.status).toBe('succeeded');

    const quantArt = await artifactOf('quantified_peak_table', quantRun);
    const qPayload = (quantArt.payload as { inlineValue: Record<string, unknown> }).inlineValue;
    const qRows = qPayload.rows as Array<Record<string, unknown>>;
    expect(qRows.length).toBe(5);
    // concentrations match the declared synthetic amounts within the
    // declared tolerance (the exact round-trip: y = 2x+1 → x = (y-1)/2)
    const qCols = qPayload.columns as string[];
    const amtCol = qCols.find((c) => c.startsWith('amount_'))!;
    const repCol = qCols.find((c) => c.startsWith('amount_reported_'))!;
    expect(amtCol).toBe('amount_ng_uL');
    expect(repCol).toBe('amount_reported_ng_uL');
    const tol = QUANT_PARAMS.quant_tolerance_percent! / 100.0; // the DECLARED tolerance
    for (let i = 0; i < 5; i++) {
      expect(Math.abs((qRows[i][amtCol] as number) - (i + 1))).toBeLessThan(tol * (i + 1));
      expect(Math.abs((qRows[i][repCol] as number) - (i + 1))).toBeLessThan(tol * (i + 1));
      expect((qRows[i].flags as string[]).length).toBe(0);
      expect(qRows[i].compound_label).toBe(LEVELS[i].compound_label);
    }
    // the model identity + digest echo (A6): the promoted artifact id from
    // the dref path layout + the CAL run's params_digest verbatim
    expect(qPayload.model_artifact_id).toBe(calModelArt.recordId);
    expect(qPayload.model_params_digest).toBe(calModel.params_digest);
    // cross-run lineage (F :469): sourceRelations contains the model's
    // promoted dref + run B's peak table (the run's declared inputs, frozen)
    expect((quantArt.payload as { sourceRelations?: Array<{ kind: string; id: string; type: string }> })
      .sourceRelations).toEqual(expect.arrayContaining([
      { kind: 'record', id: promoted.dataReferenceId, type: 'data-reference' },
      { kind: 'record', id: runStdB, type: 'analysis-output-artifact' },
    ]));
    // the run payload freezes the model input ref (immutable after submit)
    const quantRunEnv = (await service.getRun(quantRun))!;
    expect((quantRunEnv.payload as { inputs: Record<string, { id: string }> }).inputs.calibration_model.id)
      .toBe(promoted.dataReferenceId);
    // the published schema carries the AREA% honesty sentence verbatim
    const quantSchema = (quantArt.payload as { schema?: { columns?: Record<string, unknown> } }).schema;
    expect(quantSchema?.columns?.area_percent).toBe(
      'area_percent is a peak-area fraction of the reported table total; ' +
      'it is NOT a mass fraction, NOT a concentration, and is not derived ' +
      'from the calibration model.',
    );
  }, 180000);

  it('T2-2 A5 reject branch: QUANT run WITHOUT promotion + allow_inline_inputs absent → failed naming INPUT_NOT_PROMOTED (never FileNotFoundError)', async () => {
    // a fresh CAL run whose model is NEVER promoted (inline dict provisioning)
    const calRev = await createCalRevision('TEST GC-8 cal-rev-reject');
    const stdA = await publishPeakTable('gc8-std-reject-A', C1_ROWS);
    const calRun = await runCal(calRev, stdA, CAL_PARAMS);
    expect((await runner.executeRun(calRun)).status).toBe('succeeded');
    const modelArt = await artifactOf('calibration_model', calRun);
    expect((modelArt.payload as { dataReferenceRef?: unknown }).dataReferenceRef).toBeUndefined(); // NOT promoted

    const quantRev = await createQuantRevision('TEST GC-8 quant-rev-reject');
    const stdB = await publishPeakTable('gc8-std-reject-B', C1_ROWS);
    const { recordId: quantRun } = await service.createRun({
      title: 'TEST gc8-quant-run-reject',
      revisionRef: { kind: 'record', id: quantRev, type: 'analysis-revision' },
      inputs: {
        calibration_model: { kind: 'record', id: modelArt.recordId, type: 'analysis-output-artifact' },
        peak_table: { kind: 'record', id: stdB, type: 'analysis-output-artifact' },
      },
      parameters: {
        istd: { role: 'none' },
        targets: [{ compound_label: 'TEST-CMPD-A', rt_target_min: 1.0, rt_window_min: 0.25 }],
        extrapolation: 'reject',
        fail_on_out_of_range: true,
        amount_semantics: 'model_amount_as_reported',
        // allow_inline_inputs ABSENT — the fail-closed gate (spec :539)
      },
    });
    let thrown: unknown;
    try {
      await runner.executeRun(quantRun);
    } catch (e) {
      thrown = e;
    }
    expect(thrown).toBeInstanceOf(AnalysisServiceError);
    expect((thrown as AnalysisServiceError).code).toBe('RUN_FAILED');
    expect((thrown as AnalysisServiceError).message).toContain('INPUT_NOT_PROMOTED');
    // never the shipped FileNotFoundError CRASH CLASS (the Python traceback
    // shape `FileNotFoundError: [Errno 2] ...`) — the DECLARED code instead.
    expect((thrown as AnalysisServiceError).message).not.toContain('FileNotFoundError: [Errno');
    const failedRun = await service.getRun(quantRun);
    expect((failedRun!.payload as { status: string }).status).toBe('failed');
  }, 180000);

  it('T2-3 named failure legs (via real runs): ISTD_DOUBLE_APPLICATION + OUT_OF_RANGE (fail-mode) + DUPLICATE_LEVEL (CAL)', async () => {
    // ---- ISTD_DOUBLE_APPLICATION: an istd-mode CAL model (ratio) consumed
    // with istd.role='none' → the bidirectional A3 gate (real QUANT run).
    const istdRev = await createCalRevision('TEST GC-8 cal-rev-istd');
    // the per-level tables carry the ISTD peak at rt 5.5 (area 100.0) + the
    // analyte peaks (the SAME table's declared ISTD peak — A3).
    const { recordId: istdRun } = await service.createRun({
      title: 'gc8-std-istd-A',
      revisionRef: { kind: 'record', id: minimalRev, type: 'analysis-revision' },
      inputs: {},
      parameters: {
        rows: [
          ...C1_ROWS,
          { rt: 5.5, area: 100.0 },
        ],
      },
    });
    expect((await runner.executeRun(istdRun)).status).toBe('succeeded');
    const istdArtifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const istdTableArt = istdArtifacts.find(
      (a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === 'peak_table' &&
        (a.payload as { runRef?: { id?: string } }).runRef?.id === istdRun,
    )!;
    const istdRunB = await publishPeakTable('gc8-std-istd-B', [
      ...C1_ROWS,
      { rt: 5.5, area: 100.0 },
    ]);
    const { recordId: istdCalRun } = await service.createRun({
      title: 'TEST gc8-cal-run-istd',
      revisionRef: { kind: 'record', id: istdRev, type: 'analysis-revision' },
      inputs: Object.fromEntries(LEVELS.map((lv) => [`level_${lv.level}`, { kind: 'record', id: istdTableArt.recordId, type: 'analysis-output-artifact' }])),
      parameters: {
        ...CAL_PARAMS,
        istd: { role: 'internal_standard', compound_label: 'ISTD-STD-B', rt_target_min: 5.5, rt_window_min: 0.25 },
      },
    });
    const istdCalRes = await runner.executeRun(istdCalRun);
    expect(istdCalRes.status).toBe('succeeded');
    const istdModelArt = await artifactOf('calibration_model', istdCalRun);
    const istdModel = (istdModelArt.payload as { inlineValue: Record<string, unknown> }).inlineValue;
    expect(istdModel.response_quantity).toBe('area_ratio'); // the ratio curve

    const istdQuantRev = await createQuantRevision('TEST GC-8 quant-rev-istd-mismatch');
    const { recordId: istdQuantRun } = await service.createRun({
      title: 'TEST gc8-quant-run-istd-mismatch',
      revisionRef: { kind: 'record', id: istdQuantRev, type: 'analysis-revision' },
      inputs: {
        calibration_model: { kind: 'record', id: istdModelArt.recordId, type: 'analysis-output-artifact' },
        peak_table: { kind: 'record', id: istdRunB, type: 'analysis-output-artifact' },
      },
      parameters: {
        istd: { role: 'none' }, // the MISMATCH against the ratio model
        targets: [{ compound_label: 'TEST-CMPD-A', rt_target_min: 1.0, rt_window_min: 0.25 }],
        extrapolation: 'reject',
        fail_on_out_of_range: true,
        amount_semantics: 'model_amount_as_reported',
        // the A5 gate declared true (orthogonal to the leg — this run proves
        // the module's ISTD_DOUBLE_APPLICATION, not the gate): both inputs
        // are small dict-inline artifacts in the lane
        allow_inline_inputs: true,
      },
    });
    let istdThrown: unknown;
    try {
      await runner.executeRun(istdQuantRun);
    } catch (e) {
      istdThrown = e;
    }
    expect(istdThrown).toBeInstanceOf(AnalysisServiceError);
    expect((istdThrown as AnalysisServiceError).code).toBe('RUN_FAILED');
    expect((istdThrown as AnalysisServiceError).message).toContain('ISTD_DOUBLE_APPLICATION');
    expect((istdThrown as AnalysisServiceError).message).toContain('area_ratio'); // names both sides
    expect((istdThrown as AnalysisServiceError).message).toContain('none');

    // ---- OUT_OF_RANGE (fail-mode): a response beyond the model's declared
    // range + fail_on_out_of_range=true → hard failure naming the compound
    // and the value (bait-#7: the loudness is data).
    const oorRev = await createCalRevision('TEST GC-8 cal-rev-oor');
    const oorA = await publishPeakTable('gc8-std-oor-A', C1_ROWS);
    const oorCalRun = await runCal(oorRev, oorA, CAL_PARAMS);
    expect((await runner.executeRun(oorCalRun)).status).toBe('succeeded');
    const oorModelArt = await artifactOf('calibration_model', oorCalRun);
    const oorQuantRev = await createQuantRevision('TEST GC-8 quant-rev-oor');
    // the sample table has ONE peak at rt 1.0 with area 99.0 (response 99.0
    // >> the model's declared response range [3, 11]) → OUT_OF_RANGE hard.
    const oorRunB = await publishPeakTable('gc8-std-oor-B', [{ rt: 1.0, area: 99.0 }]);
    const { recordId: oorQuantRun } = await service.createRun({
      title: 'TEST gc8-quant-run-oor',
      revisionRef: { kind: 'record', id: oorQuantRev, type: 'analysis-revision' },
      inputs: {
        calibration_model: { kind: 'record', id: oorModelArt.recordId, type: 'analysis-output-artifact' },
        peak_table: { kind: 'record', id: oorRunB, type: 'analysis-output-artifact' },
      },
      parameters: {
        istd: { role: 'none' },
        targets: [{ compound_label: 'TEST-CMPD-A', rt_target_min: 1.0, rt_window_min: 0.25 }],
        extrapolation: 'reject',
        fail_on_out_of_range: true, // the LOUD mode
        amount_semantics: 'model_amount_as_reported',
        // the A5 gate declared true (orthogonal to the leg — this run proves
        // the module's OUT_OF_RANGE, not the gate)
        allow_inline_inputs: true,
      },
    });
    let oorThrown: unknown;
    try {
      await runner.executeRun(oorQuantRun);
    } catch (e) {
      oorThrown = e;
    }
    expect(oorThrown).toBeInstanceOf(AnalysisServiceError);
    expect((oorThrown as AnalysisServiceError).code).toBe('RUN_FAILED');
    expect((oorThrown as AnalysisServiceError).message).toContain('OUT_OF_RANGE');
    expect((oorThrown as AnalysisServiceError).message).toContain('TEST-CMPD-A'); // names the compound
    expect((oorThrown as AnalysisServiceError).message).toContain('99'); // names the value

    // ---- DUPLICATE_LEVEL (CAL): two levels with the same label+amount.
    const dupRev = await createCalRevision('TEST GC-8 cal-rev-dup');
    const dupA = await publishPeakTable('gc8-std-dup-A', C1_ROWS);
    const dupLevels = [
      { ...LEVELS[0] },
      { ...LEVELS[1] },
      { ...LEVELS[2] },
      { ...LEVELS[3] },
      // level 5 re-declares TEST-CMPD-A at amount 1 — the SAME label+amount
      // as level 1 → DUPLICATE_LEVEL (the (label, amount) slot is declared
      // twice; distinct rt windows do not legalize it).
      { ...LEVELS[4], compound_label: LEVELS[0].compound_label,
        compound_ref: LEVELS[0].compound_ref, amount: LEVELS[0].amount },
    ];
    const { recordId: dupRun } = await service.createRun({
      title: 'TEST gc8-cal-run-dup',
      revisionRef: { kind: 'record', id: dupRev, type: 'analysis-revision' },
      inputs: Object.fromEntries(LEVELS.map((lv) => [`level_${lv.level}`, { kind: 'record', id: dupA, type: 'analysis-output-artifact' }])),
      parameters: { ...CAL_PARAMS, levels: dupLevels },
    });
    let dupThrown: unknown;
    try {
      await runner.executeRun(dupRun);
    } catch (e) {
      dupThrown = e;
    }
    expect(dupThrown).toBeInstanceOf(AnalysisServiceError);
    expect((dupThrown as AnalysisServiceError).code).toBe('RUN_FAILED');
    expect((dupThrown as AnalysisServiceError).message).toContain('DUPLICATE_LEVEL');
    const dupRunEnv = await service.getRun(dupRun);
    expect((dupRunEnv!.payload as { status: string }).status).toBe('failed');
  }, 240000);

  it('T2-4 immutability leg (chain variant): re-execute run B → stored payload verbatim; a NEW quant run with one changed parameter → new id + different digest, first run UNTOUCHED (anti-vacuity)', async () => {
    // Build the chain once more (fresh artifacts so the shas are load-bearing
    // — the shas cover the GC-8 QUANT artifact bytes; with the GC-8 code
    // deleted the first run could not succeed at all (GC-7 bait #5 同款)).
    const calRev = await createCalRevision('TEST GC-8 cal-rev-immutable');
    const stdA = await publishPeakTable('gc8-std-immutable-A', C1_ROWS);
    const calRun = await runCal(calRev, stdA, CAL_PARAMS);
    expect((await runner.executeRun(calRun)).status).toBe('succeeded');
    const modelArt = await artifactOf('calibration_model', calRun);
    await promoteArtifact(ctx, modelArt.recordId);

    const quantRev = await createQuantRevision('TEST GC-8 quant-rev-immutable');
    const stdB = await publishPeakTable('gc8-std-immutable-B', C1_ROWS);
    const { recordId: quantRun } = await service.createRun({
      title: 'TEST gc8-quant-run-immutable-B',
      revisionRef: { kind: 'record', id: quantRev, type: 'analysis-revision' },
      inputs: {
        calibration_model: { kind: 'record', id: modelArt.recordId, type: 'analysis-output-artifact' },
        peak_table: { kind: 'record', id: stdB, type: 'analysis-output-artifact' },
      },
      parameters: QUANT_PARAMS,
    });
    const first = await runner.executeRun(quantRun);
    expect(first.status).toBe('succeeded');
    const before = await shaOf(quantRun);

    // Re-execute the SAME run → idempotent success; the STORED payload is
    // byte-identical (the manifest was returned verbatim — F :437).
    const again = await runner.executeRun(quantRun);
    expect(again.status).toBe('succeeded');
    expect(await shaOf(quantRun)).toBe(before);

    // A NEW quant run with ONE parameter changed → new id + a DIFFERENT
    // params_digest; the FIRST run's stored payload is still byte-identical
    // (append-only store).
    const { recordId: quantRun2 } = await service.createRun({
      title: 'TEST gc8-quant-run-immutable-B2',
      revisionRef: { kind: 'record', id: quantRev, type: 'analysis-revision' },
      inputs: {
        calibration_model: { kind: 'record', id: modelArt.recordId, type: 'analysis-output-artifact' },
        peak_table: { kind: 'record', id: stdB, type: 'analysis-output-artifact' },
      },
      parameters: { ...QUANT_PARAMS, quant_tolerance_percent: 2.0 }, // the ONE changed parameter
    });
    expect(quantRun2).not.toBe(quantRun);
    expect((await runner.executeRun(quantRun2)).status).toBe('succeeded');

    const artifacts = await ctx.store.list({ kind: 'analysis-output-artifact' });
    const effDigestOf = (runId: string): Promise<string> =>
      Promise.resolve(artifacts.find(
        (a) => (a.payload as { name?: string; runRef?: { id?: string } }).name === 'effective_parameters' &&
          (a.payload as { runRef?: { id?: string } }).runRef?.id === runId,
      )).then((a) => {
        expect(a).toBeDefined();
        return (a!.payload as { inlineValue: { params_digest?: string } }).inlineValue.params_digest as string;
      });
    expect(await effDigestOf(quantRun)).not.toBe(await effDigestOf(quantRun2));
    expect(await shaOf(quantRun)).toBe(before); // the first run is UNTOUCHED
  }, 240000);

  it('T2-5 vitest→unittest spawn wrapper: the single-command python gate is green', async () => {
    const sdkRoot = resolve(process.cwd(), 'python-executor-service');
    const { stdout, stderr } = await pExecFile('/usr/bin/python3', ['-m', 'unittest', 'discover', '-s', 'tests'], {
      cwd: sdkRoot,
      env: { ...process.env, PYTHONPATH: 'src' },
      timeout: 180000,
      maxBuffer: 1024 * 1024 * 8,
    });
    expect(/Ran \d+ tests/.test(stderr) || /Ran \d+ tests/.test(stdout)).toBe(true);
    expect(`${stdout}${stderr}`).toMatch(/OK/);
  }, 200000);
});
