/**
 * trunk-journeys — SEED (fixture mints via the REAL API).
 *
 * Mints the journeys' fixtures against the harness's OWN backend (real
 * transport, bootstrap system admin) on a FRESH throwaway dir. The journeys
 * seed fresh per run; nothing here touches ~/.computable-lab or the lane store.
 *
 * Fixtures (J1): a gc-method (schema-valid minimal), the analysis-engine
 * (python-entry-script adapter, system interpreter, pyyaml) + the
 * analysis-revision (entryScript = the REAL fixtures/gc-peaks/entry-reference.py
 * from the repo — never invented; parameterSchema = the declared-settings RUN
 * PARAMS the peak-integration engine consumes, with defaults so the Analyze
 * handler's collectDefaults seeds them), and a .D acquisition tree written to
 * the throwaway mount. (J2): a claim + a context (the WHY arm's context
 * record, knowledge-layer canonical shape) + an assertion (scoped to the
 * context via context_refs — the full context graph the bundle targets).
 *
 * The record payloads are DATA-shaped (schema-driven, Ajv-validated on create);
 * the engine/revision parameter names are the GC-7 declared-settings contract
 * (peak_integration's §A2) — transcribed, not re-invented.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { createRecord, getRecord, createAnalysisRevision } from './api.js';

const S = 'https://computable-lab.com/schema/computable-lab/';
export const SCHEMA = {
  gcMethod: `${S}gc-method.schema.yaml`,
  engine: `${S}analysis-engine.schema.yaml`,
  revision: `${S}analysis-revision.schema.yaml`,
  claim: `${S}claim.schema.yaml`,
  context: 'https://computable-lab.com/schema/computable-lab/context.schema.yaml',
  assertion: `${S}assertion.schema.yaml`,
  evidence: `${S}evidence.schema.yaml`,
};

/** The GC-7 declared-settings run parameters (§A2). Every scientific value is
 *  DATA (the module applies zero defaults); the schema carries defaults so the
 *  Analyze handler's collectDefaults seeds the created run's parameters. */
export const RUN_PARAMS_DEFAULTS: Record<string, unknown> = {
  baseline_correction: 'vertical_drop',
  baseline_window_s: 12.0,
  peak_width_s: 12.0,
  slope_sensitivity: 0.001,
  min_width_factor: 0.2,
  max_width_factor: 3.0,
  saturated_top_fraction_of_max: 0.005,
  saturated_min_plateau_points: 250,
  backend: 'stdlib',
  method_label: 'TRUNK-JOURNEYS-DECLARED',
};

export const RUN_PARAM_REQUIRED = [
  'baseline_correction',
  'baseline_window_s',
  'peak_width_s',
  'slope_sensitivity',
  'min_width_factor',
  'max_width_factor',
  'saturated_top_fraction_of_max',
  'backend',
];

export const RUN_PARAM_PROPS: Record<string, Record<string, unknown>> = {
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
};

function parameterSchema(): Record<string, unknown> {
  const properties: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(RUN_PARAM_PROPS)) {
    const def = RUN_PARAMS_DEFAULTS[k];
    properties[k] = def !== undefined ? { ...v, default: def } : v;
  }
  return {
    type: 'object',
    required: RUN_PARAM_REQUIRED,
    properties,
  };
}

export interface SeedIds {
  gcMethod: string;
  engine: string;
  revision: string;
  claim: string;
  context: string;
  assertion: string;
}

/** Read the REAL reference entry script from the repo (fixture data, not a
 *  git revision record) — the authoritative copy the revision record carries. */
export function referenceEntryScript(worktree: string): string {
  return readFileSync(join(worktree, 'server/python-executor-service/fixtures/gc-peaks/entry-reference.py'), 'utf8');
}

/** Mint the GC fixtures (J1) + the knowledge-layer fixtures (J2). */
export async function seedJourneyFixtures(
  backend: string,
  worktree: string,
  rand: string,
): Promise<SeedIds> {
  // --- J1: gc-method (manual-entry provenance arms, schema-valid minimal) ---
  const gcMethod = `GCM-TJ-${rand}`;
  await createRecord(backend, SCHEMA.gcMethod, {
    kind: 'gc-method',
    id: gcMethod,
    name: `trunk-journeys GC method ${rand}`,
    method_name: 'TRUNK-JOURNEYS.M',
    method_version: 1,
    provenance_capture: {
      entered_by: { kind: 'ontology', id: 'CHEBI:24431', namespace: 'CHEBI', label: 'person (local admin)' },
    },
    lifecycleId: 'registry-ops',
    state: 'active',
  }, `trunk-journeys seed: gc-method ${gcMethod}`);

  // --- J1: analysis-engine (python-entry-script, system interpreter, pyyaml) ---
  const engine = `ENG-TJ-${rand}`;
  await createRecord(backend, SCHEMA.engine, {
    kind: 'analysis-engine',
    id: engine,
    title: `trunk-journeys engine (stdlib, system interpreter) ${rand}`,
    implementation: {
      adapter: 'python-entry-script',
      entry: 'run(ctx)',
      module: 'computable_lab_analysis',
    },
    version_constraints: {
      python: '>=3.13',
      packages: [{ name: 'pyyaml', constraint: '>=6' }],
    },
    capabilities: {
      declared: [{ capability: 'peak_detection', support: 'supported' }],
    },
    availability: { available: true },
    runtime_requirements: { interpreter: 'system' },
  }, `trunk-journeys seed: analysis-engine ${engine}`);

  // --- J1: analysis-revision (entryScript = the REAL reference copy). The
  //  service mints the recordId; the declared input name is `signal` — the
  //  name the Analyze handler pins the FILE-level DREF to (the runner
  //  provisions the run's actual input names; d_reader.attach walks
  //  ctx.input_names() by ROLE, so the name is metadata + the signal channel
  //  is selected by its .CH role, never by the name literal). ---
  const revRes = await createAnalysisRevision(backend, {
    title: `trunk-journeys peak-integration revision ${rand}`,
    description: 'Reusable peak-integration revision — declared settings, zero hardcoded domain truth.',
    entryScript: referenceEntryScript(worktree),
    sdkVersion: '0.4.0',
    methodNotes:
      'Baseline/detect/reject pipeline per the GC-7 spec §A3. Parameters are the ' +
      'declared-settings contract (peak_integration §A2), transcribed 1:1.',
    inputs: [
      { name: 'signal', dataKind: 'signal', required: true, description: 'channel .CH bytes (per-file DREF)' },
    ],
    parameterSchema: parameterSchema(),
    engineRef: { kind: 'record', type: 'analysis-engine', id: engine },
    requiredCapabilities: ['peak_detection'],
  });
  const revision = revRes.recordId;

  // --- J2: claim (atomic, global) ---
  const claim = `CLM-TJ-${rand}`;
  await createRecord(backend, SCHEMA.claim, {
    kind: 'claim',
    id: claim,
    title: `trunk-journeys GC peak claim ${rand}`,
    statement: 'The GC-FID signal over this run shows the expected analyte peak(s).',
    subject: { kind: 'ontology', id: 'CHEBI:15990', namespace: 'CHEBI', label: 'organic compound' },
    predicate: { kind: 'ontology', id: 'RO:0002200', namespace: 'RO', label: 'part of' },
    object: { kind: 'ontology', id: 'GO:0035004', namespace: 'GO', label: 'chromatographic peak (illustrative)' },
    status: 'active',
  }, `trunk-journeys seed: claim ${claim}`);

  // --- J2: context (the WHY arm's context record; canonical knowledge-layer
  //  shape — subject_ref is the GC sample the run analyzed). The subject is a
  //  generic record ref; the context is the biological/measurement state the
  //  evidence bundle explains over the complete context graph. ---
  const context = `CTX-TJ-${rand}`;
  await createRecord(backend, SCHEMA.context, {
    id: context,
    subject_ref: { kind: 'record', id: `SMP-TJ-${rand}`, type: 'sample' },
    notes: 'trunk-journeys context — the GC sample state the evidence bundle explains over.',
    layer_provenance: {
      event_derived: [],
      observed: ['notes'],
    },
  }, `trunk-journeys seed: context ${context}`);

  // --- J2: assertion (scoped to the context — the full context graph target;
  //  scoped assertions REQUIRE context_refs per assertion.lint.yaml) ---
  const assertion = `ASN-TJ-${rand}`;
  await createRecord(backend, SCHEMA.assertion, {
    kind: 'assertion',
    id: assertion,
    title: `trunk-journeys assertion ${rand}`,
    claim_ref: { kind: 'record', id: claim, type: 'claim' },
    statement: 'In this context, the GC run shows the expected analyte peak(s).',
    scope: 'single_context',
    context_refs: [{ kind: 'record', id: context, type: 'context' }],
    outcome: {
      measure: 'peak_presence',
      detection: 'detected',
      direction: 'increased',
      layer: 'model_derived',
    },
    confidence: 3,
  }, `trunk-journeys seed: assertion ${assertion}`);

  // Read-back confirmation: every fixture must resolve (a dangling ref is a
  // fail-closed stop, mirroring qms-demo-seed's reference gate).
  for (const [label, id] of Object.entries({ gcMethod, engine, revision, claim, context, assertion })) {
    const env = await getRecord(backend, id);
    if (!env || (env as Record<string, unknown>).recordId !== id && !env.payload) {
      throw new Error(`seed read-back failed for ${label} ${id}: ${JSON.stringify(env ?? null)}`);
    }
  }

  return { gcMethod, engine, revision, claim, context, assertion };
}
