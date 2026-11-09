/**
 * analysisService — CRUD orchestration for analysis records
 * (analysis-revision, analysis-run).
 *
 * Records are stored as YAML in the git-backed records tree. Applied schema
 * validation is delegated to the store (skipValidation NOT set). Each analysis
 * record family uses a stable id prefix (ANREV-/ANR-).
 */
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../types/RecordEnvelope.js';
import { RecordRevisionService } from '../revisions/RecordRevisionService.js';
import { validateDeclaredInputs } from './declaredInputs.js';
import type { EngineRecord } from './engineAdapters.js';

const SCHEMAS = {
  rev: 'https://computable-lab.com/schema/computable-lab/analysis-revision.schema.yaml',
  run: 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml',
  out: 'https://computable-lab.com/schema/computable-lab/analysis-output-artifact.schema.yaml',
  view: 'https://computable-lab.com/schema/computable-lab/view-spec.schema.yaml',
};

export class AnalysisServiceError extends Error {
  constructor(
    public readonly code: string,
    message: string,
    public readonly statusCode = 400,
  ) {
    super(message);
    this.name = 'AnalysisServiceError';
  }
}

async function nextId(ctx: AppContext, kind: 'analysis-revision' | 'analysis-run'): Promise<string> {
  const prefix = kind === 'analysis-revision' ? 'ANREV-' : 'ANR-';
  let max = 0;
  try {
    const envelopes = await ctx.store.list({ kind, limit: 5000 });
    for (const env of envelopes) {
      const m = new RegExp(`^${prefix}(\\d+)$`).exec(env.recordId);
      if (m) {
        const n = Number.parseInt(m[1] ?? '0', 10);
        if (n > max) max = n;
      }
    }
  } catch {
    // ignore — fresh store
  }
  return `${prefix}${String(max + 1).padStart(6, '0')}`;
}

/**
 * Minted id shape (nextId, :47): uppercase prefix + '-' + zero-padded
 * 6-digit counter — the ONLY id shape whose trailing digits carry
 * creation-order meaning.
 */
const MINTED_ID_RE = /^[A-Z]+-\d{6}$/;

/**
 * Numeric suffix of a MINTED record id, or null for any other id.
 * A minted suffix is a creation-order certificate (nextId mints max+1
 * monotonically); arbitrary trailing digits in a hand-made id are NOT —
 * so non-minted ids must never compete on the minted counter (D1).
 */
function mintedSuffix(recordId: string): number | null {
  if (!MINTED_ID_RE.test(recordId)) return null;
  return Number.parseInt(recordId.slice(-6) ?? '0', 10);
}

export interface CreateRevisionInput {
  title: string;
  description?: string;
  parentRevisionRef?: { kind: 'record'; id: string; type: 'analysis-revision'; label?: string };
  entryScript: string;
  sdkVersion: string;
  methodNotes?: string;
  inputs?: Array<{
    name: string;
    description?: string;
    dataKind?: string;
    required?: boolean;
    /** FAME-7 (OQ-3, ratified 2026-11-02_fame-7-oq1234-decision.md): the record
     *  `type` strings this slot admits (analysis-revision.schema.yaml items).
     *  Absent ⇒ the global config `inputKinds` gate (OQ-4). */
    acceptsKinds?: string[];
    /** FAME-7 (OQ-3): the producer artifact payload's own `name` values this
     *  slot accepts. Absent ⇒ no name gate. */
    acceptedArtifactNames?: string[];
  }>;
  parameterSchema?: Record<string, unknown>;
  /**
   * GC-5: the pinned analysis-engine record. OPTIONAL in the schema (bait #2),
   * but when present it MUST resolve at creation (or its REV- snapshot pin
   * must): the resolved payload's kind must be analysis-engine and its state
   * must not be 'archived' — else ENGINE_REF_UNRESOLVED, a NAMED declared
   * failure. No fallback, no strip-and-create: the rejection IS the behavior.
   */
  engineRef?: { kind: 'record'; type: 'analysis-engine'; id: string; label?: string; revisionRef?: { kind: 'record'; type: 'record-revision'; id: string } };
  /** GC-5: capabilities this method needs (checked against the engine at execute time). */
  requiredCapabilities?: string[];
}

export interface CreateRunInput {
  title: string;
  description?: string;
  revisionRef: { kind: 'record'; id: string; type: 'analysis-revision' };
  inputs: Record<string, { kind: 'record'; id: string; type: string }>;
  parameters?: Record<string, unknown>;
  initiator?: string;
}

const ENGINE_KIND = 'analysis-engine' as const;

/**
 * GC-5 — the SHARED engineRef resolver (the spec's §b create-time gate and
 * §c execute-time gate both resolve through this — one resolver, not two,
 * CL Way). Resolves the revision-pinned engineRef:
 *  - engineRef.revisionRef (REV- snapshot pin) → the pinned IMMUTABLE engine
 *    snapshot (record-revision record's payload.snapshot); the run then runs
 *    against exactly the pinned bytes (F7 snapshot semantics).
 *  - else the CURRENT engine record head (store.get by id).
 * Declared failures only (bait #5, §e matrix): absent / wrong-kind /
 * unresolvable snapshot → ENGINE_REF_UNRESOLVED (400); archived engine →
 * ENGINE_REF_UNRESOLVED (409, state leg named in the message). The pinned
 * engineRef.id is validated against the resolved record: a snapshot whose
 * sourceRecordId is another record (cross-engine ref) or a payload whose id
 * differs from the pinned id is ENGINE_REF_UNRESOLVED (400) — an invalid
 * pinned ref is declared-dead, never silently substituted (l1t2245 defect 1).
 * No fallback, no strip-and-create — the rejection IS the behavior.
 */
export async function resolveEngineRef(
  store: import('../store/types.js').RecordStore,
  engineRef: { id: string; revisionRef?: { id?: string } },
): Promise<RecordEnvelope> {
  let payload: Record<string, unknown>;
  if (engineRef.revisionRef?.id) {
    // The revision pins an IMMUTABLE engine snapshot (REV- record-revision).
    // RRS.read verifies the snapshot's contentHash (F7 snapshot semantics —
    // the run runs against exactly the pinned bytes) AND — with the pinned
    // engine id passed as sourceRecordId — that the snapshot's sourceRecordId
    // IS the pinned engine (a cross-engine snapshot of another record is an
    // INVALID_REVISION here, a NAMED declared failure below; no silent
    // substitution of one engine for another, l1t2245 defect 1).
    try {
      const snap = (await new RecordRevisionService(store).read({ id: engineRef.revisionRef.id }, engineRef.id)).payload.snapshot;
      payload = snap as Record<string, unknown>;
    } catch (err) {
      throw new AnalysisServiceError(
        'ENGINE_REF_UNRESOLVED',
        `engine ${engineRef.id} pinned via snapshot ${engineRef.revisionRef.id} does not resolve: ${err instanceof Error ? err.message : String(err)}`,
        400,
      );
    }
  } else {
    const env = await store.get(engineRef.id);
    if (!env) {
      throw new AnalysisServiceError(
        'ENGINE_REF_UNRESOLVED',
        `engine ${engineRef.id} does not resolve (no analysis-engine record with that id)`,
        400,
      );
    }
    payload = env.payload as Record<string, unknown>;
  }
  // The resolved payload's record id must BE the pinned engine id. The
  // sourceRecordId check above covers the snapshot branch structurally; this
  // comparison is the defense for any path that reaches here (l1t2245
  // defect 1: an envelope labelled with the pinned id must not carry another
  // engine's payload).
  if (payload.id !== engineRef.id) {
    throw new AnalysisServiceError(
      'ENGINE_REF_UNRESOLVED',
      `engine ${engineRef.id} resolves to record '${String(payload.id)}' — the pinned engineRef.id and the resolved record id must match; no engine is substituted`,
      400,
    );
  }
  if (payload.kind !== ENGINE_KIND) {
    throw new AnalysisServiceError(
      'ENGINE_REF_UNRESOLVED',
      `engine ${engineRef.id} resolves to kind '${String(payload.kind)}', not analysis-engine`,
      400,
    );
  }
  if (payload.state === 'archived') {
    throw new AnalysisServiceError(
      'ENGINE_REF_UNRESOLVED',
      `engine ${engineRef.id} has lifecycle state 'archived' — a pinned engine must be live (draft or active)`,
      409,
    );
  }
  return { recordId: engineRef.id, schemaId: '', payload };
}

export class AnalysisService {
  constructor(private readonly ctx: AppContext) {}

  /**
   * GC-5 — resolve the pinned engine (delegates to the shared
   * resolveEngineRef — one resolver, not two). Returns the resolved engine
   * record payload. Used by the createRevision gate; the runner's
   * execute-time gate calls resolveEngineRef directly.
   */
  async resolveEngineRecord(engineRef: { id: string; revisionRef?: { id?: string } }): Promise<EngineRecord> {
    const env = await resolveEngineRef(this.ctx.store, engineRef);
    return env.payload as unknown as EngineRecord;
  }

  async createRevision(input: CreateRevisionInput): Promise<{ recordId: string; payload: Record<string, unknown> }> {
    if (!input.title?.trim() || !input.entryScript?.trim() || !input.sdkVersion?.trim()) {
      throw new AnalysisServiceError('BAD_REQUEST', 'title, entryScript, and sdkVersion are required');
    }
    // GC-5 gate: a present engineRef MUST resolve (or its snapshot pin) — a
    // NAMED declared failure, the rejection IS the behavior.
    if (input.engineRef) {
      await this.resolveEngineRecord(input.engineRef);
    }
    const recordId = await nextId(this.ctx, 'analysis-revision');
    const payload: Record<string, unknown> = {
      kind: 'analysis-revision',
      id: recordId,
      title: input.title.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      ...(input.parentRevisionRef ? { parentRevisionRef: input.parentRevisionRef } : {}),
      entryScript: input.entryScript,
      sdkVersion: input.sdkVersion.trim(),
      ...(input.methodNotes?.trim() ? { methodNotes: input.methodNotes.trim() } : {}),
      // D14 (fix run 2): preserve `inputs: []` through createRevision — the
      // OQ-3 binding semantics say ABSENT vs EMPTY-ARRAY is a real semantic
      // distinction in the record (absent ⇒ no contract, the named skip;
      // empty PRESENT ⇒ the contract IS "no inputs", any body input is
      // INPUT_UNDECLARED). The pre-fix `length > 0` guard collapsed an empty
      // array to ABSENT at create time, making the validator's empty-array
      // branch unreachable through the create path. Conditional spread on
      // `!== undefined` (exactOptionalPropertyTypes): a declared EMPTY array
      // is written as `inputs: []` (the contract marker is the KEY), an
      // ABSENT key is still absent (legacy revisions byte-identical).
      ...(input.inputs !== undefined ? { inputs: input.inputs } : {}),
      ...(input.parameterSchema ? { parameterSchema: input.parameterSchema } : {}),
      ...(input.engineRef ? { engineRef: input.engineRef } : {}),
      ...(input.requiredCapabilities && input.requiredCapabilities.length > 0 ? { requiredCapabilities: input.requiredCapabilities } : {}),
    };
    const result = await this.ctx.store.create({
      envelope: { recordId, schemaId: SCHEMAS.rev, payload },
      message: `Create analysis revision ${recordId}`,
    });
    if (!result.success) throw new AnalysisServiceError('CREATE_FAILED', result.error ?? 'failed', 400);
    return { recordId, payload };
  }

  async createRun(input: CreateRunInput): Promise<{ recordId: string; payload: Record<string, unknown> }> {
    if (!input.title?.trim() || !input.revisionRef?.id) {
      throw new AnalysisServiceError('BAD_REQUEST', 'title and revisionRef are required');
    }
    // FAME-7 (W4): declared-input validation — resolve the revision FIRST and
    // validate the body against its declared contract BEFORE minting anything
    // (a rejected run mints no record — the rejection IS the behavior, the
    // GC-5 precedent). A revision with NO `inputs` declaration skips validation
    // entirely (OQ-3 named skip, documented in declaredInputs.ts).
    const revisionEnv = await this.ctx.store.get(input.revisionRef.id);
    if (!revisionEnv) {
      // D8 (fix cycle 1): a revisionRef that does not resolve is a NAMED
      // rejection BEFORE any mint — the pre-fix `if (revisionEnv)` guard
      // silently skipped ALL validation and still minted a run (the silent-
      // fallback class the spec bans). The ENGINE_REF_UNRESOLVED precedent
      // (a pinned ref that does not resolve is rejected before mint, not
      // stripped-and-created) applies to the run's own revisionRef.
      throw new AnalysisServiceError(
        'REVISION_REF_UNRESOLVED',
        `revisionRef ${input.revisionRef.id} does not resolve (no analysis-revision record with that id) — the run is rejected before any record is minted`,
        400,
      );
    }
    {
      // `inputs` is REQUIRED on the wire type; a runtime body missing the key
      // is normalized to an EMPTY body so the NAMED behavior fires (INPUT_REQUIRED_MISSING
      // for a declaring revision, the OQ-3 skip for a legacy one) — never a
      // crash, never a silent pass.
      const bodyInputs = input.inputs === undefined || input.inputs === null ? {} : input.inputs;
      await validateDeclaredInputs(
        this.ctx.store,
        revisionEnv.payload as Record<string, unknown>,
        bodyInputs,
      );
    }
    const recordId = await nextId(this.ctx, 'analysis-run');
    const payload: Record<string, unknown> = {
      kind: 'analysis-run',
      id: recordId,
      title: input.title.trim(),
      ...(input.description?.trim() ? { description: input.description.trim() } : {}),
      revisionRef: input.revisionRef,
      status: 'queued',
      inputs: input.inputs ?? {},
      ...(input.parameters ? { parameters: input.parameters } : {}),
      ...(input.initiator ? { initiator: input.initiator } : {}),
    };
    const result = await this.ctx.store.create({
      envelope: { recordId, schemaId: SCHEMAS.run, payload },
      message: `Create analysis run ${recordId}`,
    });
    if (!result.success) throw new AnalysisServiceError('CREATE_FAILED', result.error ?? 'failed', 400);
    return { recordId, payload };
  }

  async getRevision(id: string): Promise<RecordEnvelope | null> {
    return this.ctx.store.get(id);
  }

  async getRun(id: string): Promise<RecordEnvelope | null> {
    return this.ctx.store.get(id);
  }

  async list(kind: 'analysis-revision' | 'analysis-run', limit = 50): Promise<RecordEnvelope[]> {
    return this.ctx.store.list({ kind, limit });
  }

  /**
   * List runs reachable + honest: fetch the WHOLE kind (the store truncates
   * in scan order when a limit is set, so a limited fetch would silently drop
   * the newest records), sort NEWEST-FIRST — minted ids (nextId: PREFIX +
   * zero-padded 6-digit counter) by their numeric suffix desc (the suffix IS
   * creation order); non-minted ids (hand-made ids whose arbitrary trailing
   * digits carry no creation-order meaning, D1) sort BELOW all minted ids and
   * among themselves by meta.createdAt desc when present, else stable scan
   * order (oldest side) — and report the TRUE total (all matches), never the
   * page length.
   */
  async listRuns(limit = 50, offset = 0): Promise<{ runs: RecordEnvelope[]; total: number }> {
    const all = await this.ctx.store.list({ kind: 'analysis-run' });
    const stamped = all.map((env, index) => ({ env, index }));
    const newestFirst = stamped.sort((a, b) => {
      const sa = mintedSuffix(a.env.recordId);
      const sb = mintedSuffix(b.env.recordId);
      if (sa !== null && sb !== null) return sb - sa;
      if (sa !== null) return -1;
      if (sb !== null) return 1;
      // Both non-minted: createdAt desc when present, else stable scan order.
      const ca = a.env.meta?.createdAt;
      const cb = b.env.meta?.createdAt;
      if (ca && cb) return ca < cb ? 1 : ca > cb ? -1 : a.index - b.index;
      if (ca) return -1;
      if (cb) return 1;
      return a.index - b.index;
    }).map((s) => s.env);
    const runs = newestFirst.slice(offset, offset + limit);
    return { runs, total: all.length };
  }

  async setRunStatus(recordId: string, status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled'): Promise<void> {
    const env = await this.ctx.store.get(recordId);
    if (!env) throw new AnalysisServiceError('NOT_FOUND', `analysis-run not found: ${recordId}`, 404);
    const payload = { ...(env.payload as Record<string, unknown>), status } as Record<string, unknown>;
    const result = await this.ctx.store.update({
      envelope: { recordId, schemaId: SCHEMAS.run, payload },
      message: `Update analysis run ${recordId} → ${status}`,
    });
    if (!result.success) throw new AnalysisServiceError('UPDATE_FAILED', result.error ?? 'failed', 400);
  }
}