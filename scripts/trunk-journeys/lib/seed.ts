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
 * the throwaway mount.
 * (J2): the subject chain (party -> request -> sample —
 * real schema-valid service records, so the context's subject_ref RESOLVES),
 * a claim (a real MEASUREMENT relationship — the GC peak-integration
 * measurement CL:measures the analyte-peak-presence quantity: a documented
 * cf: local-term pair, schema/registry/ cf: precedent, with the registry's
 * "Measurement & Assay" predicate), a context (the WHY
 * arm's context record, knowledge-layer canonical shape, subject_ref = the
 * minted sample), and an assertion (scoped to the context via context_refs).
 *
 * The record payloads are DATA-shaped (schema-driven, Ajv-validated on create).
 * Ontology integrity (adversarial gate D8 + FIX RUN 2 defect 1): the ONLY
 * external ontology refs are the registry-legal claim predicate (CL:measures,
 * the predicate registry's "Measurement & Assay" predicate) and the cf: LOCAL
 * TERM PAIR it relates (cf:gc-peak-analysis / cf:analyte-peak-presence — the
 * repo's cf: local-CURIE precedent; a cf: term is a documented local
 * quantity/measurement concept, never a mislabeled or invented external
 * CURIE). The claim is about WHAT THE RUN MEASURED (a real
 * measurement-entity -> measured-quantity relationship), and its
 * title / statement / triple / the citing assertion carry ONE single meaning
 * the GC-sample context describes — the knowledge artifact is coherent.
 * `entered_by` is a record ref to the harness actor — provenance
 * actors are records, never ontology CURIEs. The engine/revision
 * parameter names are the GC-7 declared-settings contract
 * (peak_integration's §A2) — transcribed, not re-invented.
 */
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { apiCall, ApiError, createRecord, getRecord, createAnalysisRevision, SYSTEM_ADMIN_USER } from './api.js';

const S = 'https://computable-lab.com/schema/computable-lab/';
export const SCHEMA = {
  gcMethod: `${S}gc-method.schema.yaml`,
  engine: `${S}analysis-engine.schema.yaml`,
  revision: `${S}analysis-revision.schema.yaml`,
  claim: `${S}claim.schema.yaml`,
  context: 'computable-lab/context',
  assertion: `${S}assertion.schema.yaml`,
  evidence: `${S}evidence.schema.yaml`,
  // D9: the context's subject chain (schema/services/*) — real records so the
  // subject_ref resolves (a dangling ref is a fail-closed stop).
  party: `${S}party.schema.yaml`,
  request: `${S}request.schema.yaml`,
  sample: `${S}sample.schema.yaml`,
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
  party: string;
  request: string;
  sample: string;
  claim: string;
  context: string;
  assertion: string;
}

/** Read the REAL reference entry script from the repo (fixture data, not a
 *  git revision record) — the authoritative copy the revision record carries. */
export function referenceEntryScript(worktree: string): string {
  return readFileSync(join(worktree, 'server/python-executor-service/fixtures/gc-peaks/entry-reference.py'), 'utf8');
}

/** The harness's own actor user, minted via the SUPPORTED first-run path.
 *
 * Why this exists: on a FRESH data dir, the server's startup bootstrap
 * (`upsertAdminRecord`, LocalIdentityService.ts:61) creates the USR-LOCAL-ADMIN
 * record WITHOUT an `email`, but user.schema.yaml REQUIRES email since
 * a43c5601 ("user creation requires email"). The admin record therefore fails
 * Ajv validation on every fresh dir ("Failed to bootstrap local admin user:
 * Validation failed"), so no active user exists and the `x-user-id:
 * USR-LOCAL-ADMIN` bootstrap window is dead on fresh dirs.
 *
 * The product's own reference seed documents the supported first-run path
 * (scripts/qms-demo-seed.mjs:57): create the actor with
 * POST /api/users { username, email, password } — a schema-valid user with a
 * persisted credential verifier. That route carries NO identity pre-check
 * (IdentityHandlers.createUser resolves no request user), so it is reachable
 * on an empty dir.
 *
 * Identity consequence (LocalIdentityService.resolveRequestUser
 * :116-141): with an active NON-admin user present, `x-user-id:
 * USR-LOCAL-ADMIN` falls through to ensureLocalAdminUser(), which returns the
 * FIRST active non-admin user — so EVERY harness call (the api client's
 * USR-LOCAL-ADMIN header AND the browser's stored cl.currentUserId) resolves
 * to this actor. This is a harness-side seeding step, NOT a product change.
 */
export const ACTOR_USERNAME = 'trunk-journeys-admin';
export const ACTOR_ID = 'USR-TRUNK-JOURNEYS-ADMIN';
const ACTOR_EMAIL = 'trunk-journeys-admin@local.lane1';
const ACTOR_PASSWORD = 'trunk-journeys-local-only';

/** Transition a lifecycle-covered record to `toState` via the REAL supported
 *  mechanism: PUT /records/:id with the FULL stamped payload (the handler
 *  replaces the payload wholesale — RecordHandlers.updateRecord) with only
 *  `state` changed. checkLifecycleTransition gates it (lifecycleMiddleware:
 *  the registry-ops draft->active transition needs role `author`;
 *  enforceTransitionRoles defaults to 'allow' — policy/types.ts:137 — so the
 *  role is not enforced on this path, but the transition shape + state flow
 *  are exactly the declared ones). Read-back proves the state landed. */
export async function transitionLifecycleState(
  backend: string,
  recordId: string,
  toState: string,
): Promise<void> {
  const { json } = await apiCall(backend, `/api/records/${encodeURIComponent(recordId)}`);
  const rec = json && typeof json === 'object' ? (json as Record<string, unknown>).record : json;
  const payload = rec && typeof rec === 'object' ? (rec as Record<string, unknown>).payload : undefined;
  if (!payload || typeof payload !== 'object') {
    throw new Error(`transitionLifecycleState: no payload for ${recordId} (read-back: ${JSON.stringify(json ?? null)})`);
  }
  const next = { ...(payload as Record<string, unknown>), state: toState };
  await apiCall(backend, `/api/records/${encodeURIComponent(recordId)}`, {
    method: 'PUT',
    body: { payload: next, message: `trunk-journeys seed: transition ${recordId} -> ${toState}` },
  });
  // Read-back: the state must have landed (fail closed — a silent no-op
  // transition would leave the fixture draft and break the flow later).
  const after = await apiCall(backend, `/api/records/${encodeURIComponent(recordId)}`);
  const afterRec = after.json && typeof after.json === 'object' ? (after.json as Record<string, unknown>).record : after.json;
  const afterPayload = afterRec && typeof afterRec === 'object' ? (afterRec as Record<string, unknown>).payload : undefined;
  const landed = afterPayload && typeof afterPayload === 'object' ? (afterPayload as Record<string, unknown>).state : undefined;
  if (landed !== toState) {
    throw new Error(`transitionLifecycleState: ${recordId} state is ${JSON.stringify(landed)} after PUT (expected ${toState})`);
  }
}

/** Mint the harness actor user.
 *
 * D12 (adversarial gate): IDEMPOTENT — the doc always claimed 409 tolerance
 * but the code had no try/catch, so a re-invocation against a populated dir
 * aborted on the 409 CONFLICT. Now: on 409 the actor already exists — read it
 * back via GET /api/users and SELECT IT by username (or, as a fallback, by its
 * recordId). The list is UNFILTERED (it includes the bootstrap
 * USR-LOCAL-ADMIN first on a populated dir), so the FIRST-entry-with-any-id
 * the old code took aborted whenever the actor was not first (FIX RUN 2 /
 * defect 2). The actor resolves iff a listed user matches
 * username === ACTOR_USERNAME or recordId === ACTOR_ID; ONLY when neither
 * resolves does the idempotent path error (fail closed). The returned id is
 * always ACTOR_ID (the selection PROVES the 409 was the actor's, not a
 * different user's). */
export async function ensureActorUser(backend: string): Promise<string> {
  let recordId: string | undefined;
  try {
    const { json } = await apiCall(backend, '/api/users', {
      method: 'POST',
      body: {
        displayName: 'trunk-journeys harness admin',
        username: ACTOR_USERNAME,
        email: ACTOR_EMAIL,
        password: ACTOR_PASSWORD,
      },
      user: SYSTEM_ADMIN_USER,
    });
    recordId = json && typeof json === 'object' && typeof (json as Record<string, unknown>).recordId === 'string'
      ? (json as Record<string, unknown>).recordId as string
      : undefined;
  } catch (e) {
    if (e instanceof ApiError && e.status === 409) {
      // Already minted (idempotent re-run on a populated dir): read it back.
      const { json } = await apiCall(backend, '/api/users');
      const users = json && typeof json === 'object' && Array.isArray((json as Record<string, unknown>).users)
        ? ((json as Record<string, unknown>).users as unknown[])
        : [];
      // D12/defect 2: SELECT the actor by username (or recordId) from the
      // unfiltered list — never the first entry. The bootstrap USR-LOCAL-ADMIN
      // is first on a populated dir, so first-entry is the wrong user.
      const matches = users
        .map((u) => (u && typeof u === 'object' ? (u as Record<string, unknown>) : undefined))
        .filter(
          (u) =>
            u !== undefined &&
            (u.username === ACTOR_USERNAME || u.recordId === ACTOR_ID),
        );
      if (matches.length === 0) {
        throw new Error(
          `actor user exists (409) but could not be resolved from GET /api/users ` +
            `(no user with username '${ACTOR_USERNAME}' or recordId '${ACTOR_ID}'): ${JSON.stringify(json ?? null)}`,
        );
      }
      const actor = matches[0] as Record<string, unknown>;
      const actorRecordId = typeof actor.recordId === 'string' ? actor.recordId : undefined;
      // The selection proves this is the actor; the id must be the canonical
      // one (a username match with a different id = a colliding/dirty record).
      if (actorRecordId !== ACTOR_ID) {
        throw new Error(
          `existing actor user resolved (username '${ACTOR_USERNAME}' or recordId '${ACTOR_ID}') but has unexpected id ${JSON.stringify(actorRecordId)} (expected ${ACTOR_ID})`,
        );
      }
      return actorRecordId;
    }
    throw e;
  }
  if (recordId === undefined) {
    throw new Error('actor user minted but the create response carried no recordId');
  }
  if (recordId !== ACTOR_ID) {
    throw new Error(`actor user minted with unexpected id ${recordId} (expected ${ACTOR_ID})`);
  }
  return recordId;
}

/** Mint the GC fixtures (J1) + the knowledge-layer fixtures (J2). */
export async function seedJourneyFixtures(
  backend: string,
  worktree: string,
  rand: string,
): Promise<SeedIds> {
  // --- Identity first: the harness actor (see ensureActorUser note). This is
  //  the ONLY user on the fresh dir; every later call resolves to it. ---
  try {
    const actorId = await ensureActorUser(backend);
    // Read-back: the actor must resolve (a 401 here = the seed identity is
    // broken and every later step would 401 in a confusing way).
    const env = await getRecord(backend, actorId);
    const rec = env && typeof env === 'object' && 'record' in env ? (env as Record<string, unknown>).record : env;
    const recPayload = rec && typeof rec === 'object' ? (rec as Record<string, unknown>).payload : undefined;
    if (!recPayload || typeof recPayload !== 'object') {
      throw new Error(`actor read-back failed for ${actorId}: ${JSON.stringify(env ?? null)}`);
    }
  } catch (e) {
    throw new Error(
      `seed identity bootstrap failed (fresh-dir admin record lacks the schema-required 'email' — ` +
        `the harness must mint its actor via POST /api/users): ${e instanceof Error ? e.message : String(e)}`,
    );
  }
  // --- J1: gc-method (manual-entry provenance arms, schema-valid minimal).
  //  LIFECYCLE: gc-method is registry-ops coverage (schema/registry/
  //  registry-kinds.registry.yaml) — the server stamps lifecycleId + the
  //  coverage's defaultState ('draft') at create (QMS7-3, RecordHandlers
  //  stamp-at-create). Declaring state:'active' directly is refused
  //  (INITIAL_STATE_REQUIRED). The supported flow — and what this seed does —
  //  is create-as-draft, then the draft->active transition the registry-ops
  //  lifecycle declares (the real mechanism is PUT /records/:id with the
  //  stamped payload's state flipped; the app's advanceRecordState helper is
  //  dead code pointing at an unregistered route). ---
  const gcMethod = `GCM-TJ-${rand}`;
  await createRecord(backend, SCHEMA.gcMethod, {
    kind: 'gc-method',
    id: gcMethod,
    name: `trunk-journeys GC method ${rand}`,
    method_name: 'TRUNK-JOURNEYS.M',
    method_version: 1,
    provenance_capture: {
      // D8: entered_by is a RECORD REF to the harness actor — provenance
      // actors are records (users/parties), never ontology CURIEs. (The old
      // value used a CHEBI "chemical entity" term, mislabeled as a person.)
      entered_by: { kind: 'record', id: ACTOR_ID, type: 'user', label: 'trunk-journeys harness admin' },
    },
  }, `trunk-journeys seed: gc-method ${gcMethod}`);
  await transitionLifecycleState(backend, gcMethod, 'active');

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
  // analysis-engine is ALSO registry-ops coverage — the same stamp-at-create +
  // transition flow (create-as-draft, then draft->active). The analyze gate
  // only refuses 'archived', but active is the honest operational state.
  await transitionLifecycleState(backend, engine, 'active');

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

  // --- J2: subject chain (D9): party -> request -> sample. REAL schema-
  //  valid service records (schema/services/*), minted in dependency order,
  //  so the context's subject_ref RESOLVES — a dangling ref is a fail-closed
  //  stop (the old seed pointed subject_ref at SMP-TJ-<rand> which was never
  //  created, leaving a green suite over an unresolvable graph edge). ---
  const party = `PARTY-TJ-${rand}`;
  await createRecord(backend, SCHEMA.party, {
    kind: 'party',
    recordId: party,
    name: 'trunk-journeys requester',
    partyType: 'organization',
    status: 'active',
    notes: 'trunk-journeys fixture — the requestor of the journey sample.',
  }, `trunk-journeys seed: party ${party}`);
  const request = `REQ-TJ-${rand}`;
  await createRecord(backend, SCHEMA.request, {
    kind: 'request',
    recordId: request,
    requesterRef: { kind: 'record', id: party, type: 'party' },
    status: 'submitted',
    notes: 'trunk-journeys fixture — the GC analysis request the sample answers.',
  }, `trunk-journeys seed: request ${request}`);
  const sample = `SMP-TJ-${rand}`;
  await createRecord(backend, SCHEMA.sample, {
    kind: 'sample',
    recordId: sample,
    requestRef: { kind: 'record', id: request, type: 'request' },
    partyRef: { kind: 'record', id: party, type: 'party' },
    status: 'registered',
    labDescription: 'trunk-journeys synthetic GC sample (the analyzed subject of the journey).',
    notes: 'trunk-journeys fixture — the physical sample the GC run analyzed.',
  }, `trunk-journeys seed: sample ${sample}`);

  // --- J2: claim (atomic, global). FIX RUN 2 / defect 1 (adversarial
  //  gate cycle-2): the D8 repair had swapped in the canonical
  //  knowledge-layer EXAMPLE's biology triple (beta-oxidation ->
  //  oxidative-stress) WITHOUT re-scoping the claim's title or the
  //  assertion that cites it — the live record wrote a claim TITLE saying
  //  "GC peak claim" + a STMT/TRIPLE about an unrelated biological
  //  mechanism, cited by an assertion saying "the GC run shows the analyte
  //  peak(s)" whose context's subject is the GC sample. The claim now is
  //  about WHAT THE RUN MEASURED: the GC peak-integration MEASUREMENT and
  //  the analyte-peak-presence QUANTITY it measures. The triple is
  //  (measurement --CL:measures--> quantity): a documented cf: LOCAL TERM
  //  PAIR (the repo's cf: local-CURIE precedent, schema/registry/ — cf:
  //  terms document a local quantity/measurement concept; no external
  //  ontology CURIE is mislabeled or invented) with a REGISTRY-LEGAL
  //  predicate: CL:measures, the predicate registry's "Measurement &
  //  Assay" predicate, whose subject_kinds include 'measurement' and
  //  object_kinds include 'quantity' (schema/registry/
  //  predicates.registry.yaml). title / statement / triple / the citing
  //  assertion are now a SINGLE meaning (the measurement relationship)
  //  that the GC-sample context genuinely describes. (The old incoherent
  //  shape: title "GC peak claim" + a beta-oxidation->oxidative-stress
  //  biology statement/triple a GC-sample context does not describe.) ---
  const claim = `CLM-TJ-${rand}`;
  await createRecord(backend, SCHEMA.claim, {
    kind: 'claim',
    id: claim,
    title: `trunk-journeys GC peak-integration measurement claim ${rand}`,
    statement:
      'The GC peak-integration measurement measures the presence of the analyte peak(s) in the chromatogram signal.',
    subject: { kind: 'ontology', id: 'cf:gc-peak-analysis', namespace: 'cf', label: 'GC peak-integration measurement' },
    predicate: { kind: 'ontology', id: 'CL:measures', namespace: 'CL', label: 'measures' },
    object: { kind: 'ontology', id: 'cf:analyte-peak-presence', namespace: 'cf', label: 'analyte peak presence' },
    status: 'active',
  }, `trunk-journeys seed: claim ${claim}`);

  // --- J2: context (the WHY arm's context record; canonical knowledge-layer
  //  shape). subject_ref = the MINTED sample above (D9 — it resolves). The
  //  context is the biological/measurement state the evidence bundle explains
  //  over the complete context graph. ---
  const context = `CTX-TJ-${rand}`;
  await createRecord(backend, SCHEMA.context, {
    kind: 'context',
    id: context,
    subject_ref: { kind: 'record', id: sample, type: 'sample' },
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
  // fail-closed stop, mirroring qms-demo-seed's reference gate). GET /api/
  // records/:id returns { record: { recordId, schemaId, payload, meta } } —
  // unwrap the .record envelope before asserting.
  for (const [label, id] of Object.entries({ party, request, sample, gcMethod, engine, revision, claim, context, assertion })) {
    const env = await getRecord(backend, id);
    const rec = env && typeof env === 'object' && 'record' in env ? (env as Record<string, unknown>).record : env;
    const recId = rec && typeof rec === 'object' ? (rec as Record<string, unknown>).recordId : undefined;
    const recPayload = rec && typeof rec === 'object' ? (rec as Record<string, unknown>).payload : undefined;
    if (recId !== id || !recPayload || typeof recPayload !== 'object') {
      throw new Error(`seed read-back failed for ${label} ${id} (got recordId=${JSON.stringify(recId)}, payload=${recPayload ? 'present' : 'MISSING'}): ${JSON.stringify(env ?? null)}`);
    }
  }
  // D9: the context's subject_ref must RESOLVE — read the context back and
  // follow the ref to the (minted) sample record. A dangling graph edge is a
  // fail-closed stop, not a silent green.
  const ctxEnv = await getRecord(backend, context);
  const ctxRec = ctxEnv && typeof ctxEnv === 'object' && 'record' in ctxEnv ? (ctxEnv as Record<string, unknown>).record : ctxEnv;
  const ctxPayload = ctxRec && typeof ctxRec === 'object' ? (ctxRec as Record<string, unknown>).payload : undefined;
  const subjectRef = ctxPayload && typeof ctxPayload === 'object' ? (ctxPayload as Record<string, unknown>).subject_ref : undefined;
  const subjectId = subjectRef && typeof subjectRef === 'object' ? (subjectRef as Record<string, unknown>).id : undefined;
  if (typeof subjectId !== 'string' || subjectId !== sample) {
    throw new Error(`seed read-back failed: context ${context} subject_ref is ${JSON.stringify(subjectId)} (expected the minted sample ${sample})`);
  }
  await getRecord(backend, sample); // resolves -> 2xx; a dangling ref 404s and throws

  return { gcMethod, engine, revision, party, request, sample, claim, context, assertion };
}
