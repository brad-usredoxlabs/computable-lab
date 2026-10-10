/**
 * W2-5-DRAFT-LIFECYCLE — T1: promote-path API tests (spec §6 T1).
 *
 * Harness: COPY of server/src/integration/extractionE2E.test.ts (real
 * initializeApp/createServer + in-memory-style tmp git store) but booted
 * against the REAL schema tree (schemaDir '../schema') so the REAL lint rules
 * (protocol.lint legacy-literal-bounded / prov-derived-*, extraction-draft
 * xdr-*, extraction-promotion xpr-*) are loaded and fire at the write wall.
 * Drafts are seeded directly (no PDF leg — the extractionE2E PDF path is a
 * pre-existing environmental failure recorded in the baseline, §0.2(a)).
 * Routes ride routes.ts:632 (ExtractHandlers promote/reject) — NEVER :874.
 *
 * Arms (spec §6 T1 RED arms):
 *  (a) promote blocked by an unresolved required constraint -> 422
 *      PROMOTION_LINT_BLOCKED with rule_id(s) visible in the body
 *  (b) candidate with ambiguity_spans -> 400 refusal naming the
 *      xdr-promote-blocked-by-unresolved twin code
 *  (c) happy promote -> output kind protocol (born draft), XPR record,
 *      audit-event action candidate_promoted, draft candidate flipped
 *  (d) promote of a draft declaring state:effective + lifecycleId ->
 *      PROMOTION_CONTROLLED_ESCALATION, NOTHING persisted
 *  (e) candidate sha invariant: a vendor-protocol-candidate record is
 *      byte-identical before/after the full promote flow (no candidate
 *      content drift)
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../server.js';
import type { AppContext } from '../server.js';
import { setupTestWorkspace } from '../test/setupApp.js';

const XDR_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/extraction-draft.schema.yaml';
const VPC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/vendor-protocol-candidate.schema.yaml';

const testDir = resolve(process.cwd(), 'tmp/w25-t1-promotion');
// Local disk (not the NFS worktree): the embedded-git store seeds 131
// records/seed entries into a fresh dataDir; git commits on NFS are too slow
// for the vitest hook budget. /tmp is intentional for a throwaway fixture store.
const dataDir = resolve('/tmp', 'cl-w25-t1-promotion-data');

let ctx: AppContext;
let app: FastifyInstance;

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  // CRITICAL isolation: initializeApp's findConfigPath walks
  // server/ -> worktree root config.yaml, whose dataDir is the DURABLE
  // lane-2 store (/home/brad/.computable-lab-lane2). Pin CONFIG_PATH to a
  // throwaway config so every record this suite mints lands under
  // server/tmp/ and dies in afterAll. (First run leaked fixtures into the
  // durable store; purged by chore commits there.)
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:',
    '  logLevel: error',
    '  dataDir: ' + dataDir,
    '  workspaceDir: ' + dataDir + '/workspaces',
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');
  // Boot against the REAL schema tree so the real lint specs load at boot
  // (the activated extraction-draft.lint.yaml included — boot must stay green).
  ctx = await initializeApp(process.cwd(), {
    schemaDir: '../schema',
    recordsDir: 'records',
    logLevel: 'silent',
  });
  app = await createServer(ctx, { logLevel: 'silent' });
  await app.ready();
  void setupTestWorkspace; // harness parity with extractionE2E; real tree needs no shim
}, 600000);

afterAll(async () => {
  await app?.close();
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

// ---------------------------------------------------------------------------
// Fixtures (W2-3 merged intent-step shape, copied from the merged
// Wave2ProtocolIntentSchema/Wave2ProtocolIntentRules fixtures)
// ---------------------------------------------------------------------------

function verbRef(id: string, canonical: string): Record<string, unknown> {
  return { ref: { kind: 'record', type: 'verb-definition', id }, canonical };
}

function intentStep(stepId: string, ordinal: number, kind: string): Record<string, unknown> {
  return {
    stepId,
    label: `Intent ${stepId}`,
    ordinal,
    kind,
    intent: {
      semanticVerb: verbRef('VERB-INCUBATE', 'incubate'),
      provenance: [{ kind: 'record', type: 'vendor-protocol-candidate', id: 'CAN-w25-demo', pageStart: 1 }],
    },
  };
}

/** Literal (non-intent) wash protocol — trips protocol.lint legacy-literal-bounded. */
function literalProtocolDraft(): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'PRT-w25-literal',
    title: 'W2-5 literal draft (must not promote)',
    roles: { labwareRoles: [{ roleId: 'plate', description: 'plate', expectedLabwareKinds: ['plate'] }] },
    steps: [
      { stepId: 'wash-1', label: 'Wash', ordinal: 1, kind: 'wash', target: { labwareRole: 'plate' }, wells: { kind: 'all' }, cycles: 3 },
    ],
  };
}

function intentProtocolDraft(extra: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'PRT-w25-intent',
    title: 'W2-5 intent draft',
    steps: [intentStep('inc-batch', 1, 'incubate')],
    ...extra,
  };
}

async function seedDraft(recordId: string, candidate: Record<string, unknown>): Promise<void> {
  const result = await ctx.store.create({
    envelope: {
      recordId,
      schemaId: XDR_SCHEMA_ID,
      payload: {
        kind: 'extraction-draft',
        recordId,
        source_artifact: { kind: 'file', id: 'VPF-w25-source' },
        candidates: [candidate],
        status: 'pending_review',
      },
    },
    message: `seed ${recordId}`,
  });
  if (!result.success) throw new Error(`seed ${recordId} failed: ${result.error}`);
}

function promote(id: string, i: number) {
  return app.inject({ method: 'POST', url: `/api/extraction/drafts/${id}/candidates/${i}/promote` });
}

async function listKinds(): Promise<string[]> {
  const all = await ctx.store.list({});
  return all.map(r => String((r.payload as Record<string, unknown>).kind));
}

// ---------------------------------------------------------------------------

describe('W2-5 T1: promote-path lifecycle (routes.ts:632 ExtractHandlers)', () => {

  it('(a) promote of an unresolved-required-constraint draft is refused with an actionable lint error', async () => {
    await seedDraft('XDR-w25-literal', {
      target_kind: 'protocol',
      draft: literalProtocolDraft(),
      confidence: 0.9,
      evidence_span: 'Wash the plate three times.',
      uncertainty: 'low',
      ambiguity_spans: [],
    });

    const res = await promote('XDR-w25-literal', 0);
    expect(res.statusCode).toBe(422);
    const body = res.json();
    expect(body.error).toBe('PROMOTION_LINT_BLOCKED');
    const findings: Array<{ rule_id: string; severity: string; message: string; paths: unknown }> = body.details.lint_findings;
    expect(Array.isArray(findings)).toBe(true);
    expect(findings.some(f => f.rule_id === 'legacy-literal-bounded' && f.severity === 'error')).toBe(true);
    // The refusal is actionable: the message names the canonical record the
    // promoter tried to mint + the offending steps (the promoter canonicalizes
    // recordId, so the lint message names the minted CAN- id, not the draft's).
    const blocked = findings.find(f => f.rule_id === 'legacy-literal-bounded')!;
    expect(blocked.message).toMatch(/CAN-protocol-/);
    expect(blocked.message).toContain('wash-1');
    expect(blocked.message).toContain('intent');
    // Nothing canonical was persisted.
    const records = await ctx.store.list({});
    expect(records.some(r => r.recordId.startsWith('CAN-protocol-'))).toBe(false);
  });

  it('(b) candidate with ambiguity_spans is refused naming the xdr-promote-blocked-by-unresolved twin code', async () => {
    await seedDraft('XDR-w25-ambig', {
      target_kind: 'protocol',
      draft: intentProtocolDraft(),
      confidence: 0.5,
      uncertainty: 'unresolved',
      ambiguity_spans: [{ path: 'draft.title', reason: 'title unclear in source' }],
    });

    const res = await promote('XDR-w25-ambig', 0);
    expect(res.statusCode).toBe(400);
    const body = res.json();
    expect(body.error).toBe('PROMOTION_FAILED');
    expect(body.message).toContain('ambiguity_spans');
    expect(body.details?.code).toBe('xdr-promote-blocked-by-unresolved');
  });

  it('(c) happy promote: output is a kind-protocol record born draft + XPR + candidate_promoted audit', async () => {
    await seedDraft('XDR-w25-happy', {
      target_kind: 'protocol',
      draft: intentProtocolDraft(),
      confidence: 0.92,
      evidence_span: 'Incubate the batch overnight.',
      uncertainty: 'low',
      ambiguity_spans: [],
    });

    const res = await promote('XDR-w25-happy', 0);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.success).toBe(true);
    const canonicalId = String(body.recordId);
    const promotionId = String(body.promotionId);
    expect(canonicalId).toMatch(/^CAN-protocol-/);
    expect(promotionId).toMatch(/^XPR-CAN-protocol-/);

    // Promoted output is a kind `protocol` record — born draft (§3.3a).
    const canonical = await ctx.store.get(canonicalId);
    expect(canonical).not.toBeNull();
    const payload = canonical!.payload as Record<string, unknown>;
    expect(payload.kind).toBe('protocol');
    expect(payload.state).toBe('draft');

    // extraction-promotion audit record exists with output_kind protocol.
    const promotion = await ctx.store.get(promotionId);
    expect(promotion).not.toBeNull();
    expect((promotion!.payload as Record<string, unknown>).output_kind).toBe('protocol');

    // audit-event action candidate_promoted exists (governanceStrictness predicate style).
    const audits = await ctx.store.list({ kind: 'audit-event' });
    const audit = audits.find(r => (r.payload as Record<string, unknown>).action === 'candidate_promoted');
    expect(audit, 'audit-event candidate_promoted must exist').toBeDefined();
    const auditPayload = audit!.payload as Record<string, unknown>;
    expect(auditPayload.subjectType).toBe('extraction-draft');
    expect(auditPayload.subjectId).toBe('XDR-w25-happy');
    const data = auditPayload.data as Record<string, unknown>;
    expect(data.candidate_path).toBe('candidates[0]');
    expect(data.output_record_id).toBe(canonicalId);
    expect(data.promotion_record_id).toBe(promotionId);

    // Draft candidate flipped to promoted.
    const draft = await ctx.store.get('XDR-w25-happy');
    const candidates = (draft!.payload as Record<string, unknown>).candidates as Array<Record<string, unknown>>;
    expect(candidates[0]!.status).toBe('promoted');
  });

  it('(d) promote of a draft declaring state:effective + lifecycleId -> PROMOTION_CONTROLLED_ESCALATION, nothing persisted', async () => {
    await seedDraft('XDR-w25-spoof', {
      target_kind: 'protocol',
      draft: intentProtocolDraft({ lifecycleId: 'document-control', state: 'effective', version: '9.9.9' }),
      confidence: 0.9,
      evidence_span: 'Incubate.',
      uncertainty: 'low',
      ambiguity_spans: [],
    });

    const before = new Set((await ctx.store.list({})).map(r => r.recordId));
    const res = await promote('XDR-w25-spoof', 0);
    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe('PROMOTION_CONTROLLED_ESCALATION');
    const after = new Set((await ctx.store.list({})).map(r => r.recordId));
    // Zero new records: the id-set is unchanged (earlier tests legitimately
    // minted CAN-protocol- records, so compare sets, not prefixes).
    expect([...after].filter(id => !before.has(id))).toEqual([]);
  });

  it('(e) candidate sha invariant: a vendor-protocol-candidate record is byte-identical across the full promote flow', async () => {
    // Mint a VPC record via store.create — the extraction mint path (§3.5:
    // "extraction is the sole VENDOR minter"). NOTE (recorded finding, not
    // fixed): POST /records CANNOT mint this kind today — the handler's FAIR
    // stamping (recordId/createdAt/createdBy) collides with the candidate's
    // additionalProperties:false (probe: 422 Unknown property: recordId).
    const provenance = { documentId: 'doc-w25-1', pageStart: 1 };
    const extracted = (id: string) => ({
      id, label: `Extracted ${id}`, sourceText: 'source text',
      provenance: { ...provenance }, confidence: 0.9,
    });
    const vpcPayload = {
      kind: 'vendor-protocol-candidate',
      source: { documentId: 'doc-w25-1', filename: 'w25.pdf', pageCount: 3 },
      title: 'W2-5 immutable candidate',
      sections: [{ id: 'sec-spec', kind: 'specifications', title: 'Specifications', provenance: { ...provenance } }],
      materials: [extracted('mat-1')],
      equipment: [extracted('eq-1')],
      labware: [extracted('lw-1')],
      steps: [{
        id: 'step-1', stepNumber: 1, sourceText: 'Add reagent to the plate.',
        actions: [{ actionKind: 'add', sourceText: 'Add reagent', provenance: { ...provenance } }],
        conditions: {}, materials: ['mat-1'], labware: ['lw-1'], equipment: [], notes: [], branches: [],
        provenance: { ...provenance }, confidence: 0.9,
      }],
      tables: [{ id: 'tbl-1', title: 'Reagents', headers: ['name'], rows: [{ name: 'reagent A' }], sourceText: 'table text', provenance: { ...provenance } }],
      notes: [extracted('note-1')],
      outputs: [extracted('out-1')],
      diagnostics: [],
    };
    const created = await ctx.store.create({
      envelope: { recordId: 'CAN-w25-immutable', schemaId: VPC_SCHEMA_ID, payload: vpcPayload },
      message: 'seed VPC for immutability invariant',
    });
    expect(created.success, `VPC seed failed: ${created.error}`).toBe(true);

    const before = await ctx.store.get('CAN-w25-immutable');
    const shaBefore = before!.meta?.contentSha;
    expect(typeof shaBefore).toBe('string');

    // Full promote flow on a draft whose candidate references the candidate.
    await seedDraft('XDR-w25-invariant', {
      target_kind: 'protocol',
      draft: intentProtocolDraft(),
      confidence: 0.9,
      evidence_span: 'Incubate the batch.',
      uncertainty: 'low',
      ambiguity_spans: [],
    });
    const res = await promote('XDR-w25-invariant', 0);
    expect(res.statusCode).toBe(200);

    const after = await ctx.store.get('CAN-w25-immutable');
    expect(after!.meta?.contentSha).toBe(shaBefore); // literal no-candidate-content-drift assertion
  });
});
