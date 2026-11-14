/**
 * L2-ANALYSIS-ENGINE-DECLARATIONS-1 / u1enginerecords — declaration pins for
 * the three seed analysis-engine records (records/seed/analysis-engine/).
 *
 * Drift doctrine: a capability declared `supported` must be backed by a NAMED
 * code path in the engine's module source (one table below: capability ->
 * {module, marker}); a record can therefore never drift into an invention.
 * `packages: []` is the honest value for stdlib-only modules — the honesty pin
 * fails the moment a host package is named that the module does not import.
 *
 * Store-visibility doctrine: the store's seed walker keys off the SEED DIRECTORY
 * NAME as the record's kind (RecordStoreImpl.ts: `join(seedDir, filter.kind)`),
 * so `records/seed/analysis-engine/` (singular) is the load-bearing name.
 */
// @vitest-environment node
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { parse as parseYaml } from 'yaml';
import { initializeApp } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';

const REPO_ROOT = resolve(process.cwd(), '..');
const SEED_DIR = join(REPO_ROOT, 'records', 'seed', 'analysis-engine');
const SDK_SRC = join(REPO_ROOT, 'server', 'python-executor-service', 'src');
const ENGINE_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/analysis-engine.schema.yaml';

const ENGINE_FILES = {
  'ENG-PEAKINTEG-1.yaml': 'ENG-PEAKINTEG-1',
  'ENG-CALIBFIT-1.yaml': 'ENG-CALIBFIT-1',
  'ENG-QUANT-1.yaml': 'ENG-QUANT-1',
} as const;
type EngineId = (typeof ENGINE_FILES)[keyof typeof ENGINE_FILES];
const EXPECTED_IDS: readonly string[] = ['ENG-PEAKINTEG-1', 'ENG-CALIBFIT-1', 'ENG-QUANT-1'];

/**
 * The drift table — every `supported` capability pinned to a NAMED marker the
 * coder read in the module source (file:line at the base commit). A `supported`
 * declaration with no matching marker in the live module source FAILS.
 *
 *  ENG-PEAKINTEG-1 -> peak_integration.py (GC-7):
 *   - baseline_control            _build_baseline: 'none' = raw y=0 line, 'vertical_drop' /
 *                                 'tangent_skim' (the DECLARED baseline interpretations, OQ4)
 *   - width_slope_sensitivity     detection floor = "slope_sensitivity × the segment's robust
 *                                 range"; width via min/max_width_factor
 *   - area_height_reject          OPTIONAL_PARAMS "area_reject_pa_min" / "height_reject_pa"
 *   - timed_integration_windows   REQUIRED_PARAM "timed_events" + "TIMED_OFF_WINDOW"
 *   - peak_detection              _peak_windows: prominence-floor-bounded window per maximum
 *  (deconvolution: intentionally ABSENT from this table — the module has no
 *   deconvolution path; the record declares it `unsupported`, and the honesty
 *   pin asserts no record declares it `supported`.)
 *
 *  ENG-CALIBFIT-1 -> calibration_fit.py (GC-8):
 *   - curve_fitting               "The fit is weighted least squares via the normal equations on"
 *   - weighted_regression         WEIGHTING_ENUM ("none", "1/x", "1/x^2", "1/y^2")
 *  (no peak/detection terms: this module consumes GC-7 tables, it does not
 *   detect or integrate peaks.)
 *
 *  ENG-QUANT-1 -> quantification.py (GC-8): declared: [] — no term in the
 *   closed capability enum names cross-run model consumption / ISTD
 *   application (stated in the record's description).
 */
const DRIFT: Record<string, { file: string; marker: string }> = {
  baseline_control: { file: 'peak_integration.py', marker: "'none': y = 0 line" },
  width_slope_sensitivity: { file: 'peak_integration.py', marker: "slope_sensitivity × the segment's robust range" },
  area_height_reject: { file: 'peak_integration.py', marker: '"area_reject_pa_min"' },
  timed_integration_windows: { file: 'peak_integration.py', marker: 'TIMED_OFF_WINDOW' },
  peak_detection: { file: 'peak_integration.py', marker: '_peak_windows' },
  curve_fitting: { file: 'calibration_fit.py', marker: 'The fit is weighted least squares via the normal equations on' },
  weighted_regression: { file: 'calibration_fit.py', marker: 'WEIGHTING_ENUM' },
};

/** Packages the python-entry-script harness may legitimately declare.
 *  All three declared engines are stdlib-only, so the honest value is [];
 *  nothing outside this allow-list may appear in any record's
 *  version_constraints.packages (bait (b) of the unit). */
const PACKAGE_ALLOWLIST: readonly string[] = [];

type Declared = { capability: string; support: string };
type EnginePayload = {
  kind: string;
  id: string;
  title: string;
  implementation: { adapter: string; entry: string; module?: string };
  version_constraints: { python: string; packages: Array<{ name: string }> };
  capabilities: { declared: Declared[] };
  availability: { available: boolean; note?: string };
  runtime_requirements: { interpreter: string };
  lifecycleId?: string;
  state?: string;
};

describe('analysis-engine seed declarations (u1enginerecords)', () => {
  let ctx: Awaited<ReturnType<typeof initializeApp>>;
  let validator: ReturnType<typeof createValidator>;
  let wsDir = '';
  let moduleSources: Record<string, string> = {};
  const payloads = new Map<string, EnginePayload>();

  beforeAll(async () => {
    wsDir = await mkdtemp(join(tmpdir(), 'cl-engdecl-ws-'));
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
      ].join('\n'),
    );
    // Same store + schema wiring as the GC-5 engine suite (analysisRunner.engine.test.ts:
    // initializeApp with recordsDir: 'records', schemaDir: resolve(cwd, '..', 'schema')).
    ctx = await initializeApp(wsDir, {
      schemaDir: resolve(process.cwd(), '..', 'schema'),
      recordsDir: 'records',
      logLevel: 'silent',
    });
    for (const [file, id] of Object.entries(ENGINE_FILES)) {
      payloads.set(id, parseYaml(await readFile(join(SEED_DIR, file), 'utf8')) as EnginePayload);
    }
    for (const f of new Set(Object.values(DRIFT).map((d) => d.file))) {
      moduleSources[f] = await readFile(join(SDK_SRC, 'computable_lab_analysis', f), 'utf8');
    }
    // Schema pin wiring — the repo's own idiom (createSchemaRegistry +
    // loadAllSchemas + createValidator; precedent: FulfillmentAccept.test.ts:75-85,
    // DerivationSeedRecords.test.ts:28-52). The seed read path (store.list /
    // parseRecord) NEVER validates, so this leg is the only Ajv gate on seeds.
    const registry = createSchemaRegistry();
    const loaded = await loadAllSchemas({ basePath: join(REPO_ROOT, 'schema'), recursive: true });
    expect(loaded.errors).toEqual([]);
    registry.addSchemas(loaded.entries);
    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, id);
    }
  }, 60000);

  afterAll(async () => {
    await rm(wsDir, { recursive: true, force: true });
  });

  describe('drift pin — declared `supported` requires a NAMED code path', () => {
    it('every record file parses; every `supported` capability has a real marker in its module source', () => {
      for (const [file, id] of Object.entries(ENGINE_FILES)) {
        const p = payloads.get(id)!;
        expect(p.id).toBe(id);
        expect(p.kind).toBe('analysis-engine');
        const supported = p.capabilities.declared.filter((d) => d.support === 'supported');
        for (const d of supported) {
          const spec = DRIFT[d.capability];
          expect(spec, `drift table has no pin for '${id}' capability '${d.capability}'`).toBeDefined();
          const source = moduleSources[spec.file];
          expect(source, `module source ${spec.file} unreadable`).toBeDefined();
          expect(
            source.includes(spec.marker),
            `${id} declares ${d.capability} supported, but ${spec.file} no longer contains the marker ${JSON.stringify(spec.marker)}`,
          ).toBe(true);
        }
        // ENG-PEAKINTEG-1 must declare exactly the five supported terms (the
        // GC-7 pipeline) — a new `supported` term fails here by missing pin.
        if (id === 'ENG-PEAKINTEG-1') {
          expect(supported.map((d) => d.capability).sort()).toEqual([
            'area_height_reject',
            'baseline_control',
            'peak_detection',
            'timed_integration_windows',
            'width_slope_sensitivity',
          ]);
        }
        if (id === 'ENG-CALIBFIT-1') {
          expect(supported.map((d) => d.capability).sort()).toEqual(['curve_fitting', 'weighted_regression']);
        }
        // No record may declare a peak/detection term it does not implement.
        if (id !== 'ENG-PEAKINTEG-1') {
          for (const d of supported) {
            expect(['baseline_control', 'peak_detection', 'timed_integration_windows', 'area_height_reject', 'width_slope_sensitivity'], `${id} borrows a GC-7 term`)
              .not.toContain(d.capability);
          }
        }
      }
    });
  });

  describe('store-visibility pin — directory name == kind', () => {
    it('the store lists exactly the three seed engine ids under kind: analysis-engine', async () => {
      const listed = await ctx.store.list({ kind: 'analysis-engine' });
      const ids = listed.map((r) => r.recordId).sort();
      expect(ids).toEqual([...EXPECTED_IDS].sort());
      for (const id of EXPECTED_IDS) {
        const env = listed.find((r) => r.recordId === id)!;
        const p = env.payload as EnginePayload;
        expect(p.id).toBe(id);
        expect(p.kind).toBe('analysis-engine');
        expect(p.implementation.adapter).toBe('python-entry-script');
        expect(p.state).toBe('draft');
        expect(p.availability.available).toBe(true);
      }
    });
  });

  describe('honesty pin — no invented completeness', () => {
    it('no record declares deconvolution supported; every adapter is python-entry-script; no package outside the allow-list', () => {
      for (const p of payloads.values()) {
        const deconv = p.capabilities.declared.filter((d) => d.capability === 'deconvolution');
        expect(deconv.every((d) => d.support !== 'supported'), `${p.id} declares deconvolution supported`).toBe(true);
        expect(p.implementation.adapter).toBe('python-entry-script');
        expect(JSON.stringify(p).includes('stub-echo'), `${p.id} carries the stub-echo literal`).toBe(false);
        for (const pkg of p.version_constraints.packages) {
          expect(PACKAGE_ALLOWLIST, `${p.id} names a host package the stdlib-only module does not import: ${pkg.name}`)
            .toContain(pkg.name);
        }
      }
      // The stdlib-only honesty: an empty packages list is the ONLY honest value.
      for (const p of payloads.values()) {
        expect(p.version_constraints.packages, `${p.id} must declare zero host packages`).toEqual([]);
      }
      // ENG-QUANT-1: declared empty rather than stretched.
      const quant = payloads.get('ENG-QUANT-1')!;
      expect(quant.capabilities.declared).toEqual([]);
      expect(quant.description ?? '').toMatch(/no term in the closed capability enum/i);
      // ENG-PEAKINTEG-1's deconvolution is declared (as unsupported), not omitted by invention.
      const peak = payloads.get('ENG-PEAKINTEG-1')!;
      expect(peak.capabilities.declared.find((d) => d.capability === 'deconvolution')?.support).toBe('unsupported');
      // Availability is a declaration backed by the probe, never optimism:
      // a note stating the probe context must accompany available: true.
      for (const p of payloads.values()) {
        if (p.availability.available) {
          expect(p.availability.note ?? '').toMatch(/probed/i);
        }
        expect(p.runtime_requirements.interpreter).toBe('system');
        expect(p.version_constraints.python).toBe('>=3.13');
      }
    });
  });

  describe('schema pin — every seed record is Ajv-valid (never-invent gate)', () => {
    it('all three seed payloads validate against analysis-engine.schema.yaml ($schema stripped, as RecordParser.ts:113 does); a NEGATIVE probe with an invented capability term is rejected', async () => {
      // POSITIVE: each record must pass the repo's real Ajv pipeline. The seed
      // read path (store.list -> parseRecord) never validates, so this is the
      // only schema gate on these records.
      for (const [file, id] of Object.entries(ENGINE_FILES)) {
        // Fresh parse so this leg reads the FILE, not the beforeAll map.
        const parsed = parseYaml(await readFile(join(SEED_DIR, file), 'utf8')) as Record<string, unknown>;
        // RecordParser.ts:113 strips $schema before validation — the schema
        // (additionalProperties: false) must never see it.
        const { $schema: _schema, ...record } = parsed;
        const result = validator.validate(record, ENGINE_SCHEMA_ID);
        expect(result.valid, `${id} invalid: ${JSON.stringify(result.errors)}`).toBe(true);
      }
      // NEGATIVE probe (the leg must not be vacuous): ENG-QUANT-1 declares no
      // term (declared: [] — the honesty pin), so the probe injects ONE entry
      // whose capability id is the INVENTED term — a capability id outside the
      // closed enum must be REJECTED, not shipped.
      const quant = parseYaml(await readFile(join(SEED_DIR, 'ENG-QUANT-1.yaml'), 'utf8')) as Record<string, unknown>;
      const { $schema: _q, ...quantRecord } = quant;
      const mutated = structuredClone(quantRecord) as { capabilities: { declared: Array<{ capability: string; support: string }> } };
      mutated.capabilities.declared = [{ capability: 'invented_vendor_term', support: 'supported' }];
      const negative = validator.validate(mutated, ENGINE_SCHEMA_ID);
      console.error('u1fix1 NEGATIVE PROBE: invented_vendor_term -> valid =', negative.valid, 'errors =', JSON.stringify(negative.errors));
      expect(negative.valid).toBe(false);
      expect(
        negative.errors.some((e) => e.keyword === 'enum' && e.path.includes('/capabilities/declared/0/capability')),
      ).toBe(true);
    });
  });
});
