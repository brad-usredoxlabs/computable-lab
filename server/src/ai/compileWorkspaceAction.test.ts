/**
 * PB-CH-1 — the workspace-action compiler (RED-first suite).
 *
 * Contract under test (the task's acceptance criteria, verbatim):
 *  - resolvable term -> ok:true with a REAL REF (target.id = the resolved
 *    record id / CURIE — never the term);
 *  - unresolved term -> UNRESOLVED_TERM diagnostic, ok:false;
 *  - ambiguous term (two same-tier exact hits) -> AMBIGUOUS_TERM;
 *  - invented record id -> UNKNOWN_RECORD (Ajv-validity is NOT resolution:
 *    the schema permits `protocolId: "PRT-made-up"`; the store check kills it);
 *  - unsupported surface id -> UNSUPPORTED_SURFACE (registry membership only,
 *    no TS allow-list — surfaces.ts:64 convention);
 *  - malformed envelope -> MALFORMED_ENVELOPE naming the offending path
 *    (validated through the repo's OWN registration pipeline against the
 *    REGISTERED agent-action $id, per the protocolEditValidation precedent);
 *  - THE MINT-AFFORDANCE LEAK: ResolveSpine ALWAYS appends a tier-5 curie:''
 *    mint candidate (ResolveSpine.ts:218). A spine that returns ONLY the mint
 *    is NOT a resolution -> UNRESOLVED_TERM.
 *
 * Harness: fake spine + stub store (mutation tripwires — the compiler reads,
 * it never writes) + the REAL SurfacesRegistry loaded from the repo schema dir.
 */
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it, vi } from 'vitest';
import {
  AGENT_ACTION_SCHEMA_ID,
  compileWorkspaceAction,
  type WorkspaceActionCompilerDeps,
} from './compileWorkspaceAction.js';
import type { RankedCandidate } from '../resolve/types.js';
import { loadDefaultSurfacesRegistry } from '../surfaces/surfaces.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const SCHEMA_DIR = resolve(__dirname, '../../../schema');

/** A spine stub returning fixed candidates (always with the real spine's
 *  tier-5 mint affordance appended — the leak this suite pins). */
function fakeSpine(candidates: RankedCandidate[]) {
  const resolveFn = vi.fn(async () => [
    ...candidates,
    // Exactly what ResolveSpine.mintAffordance appends on EVERY call.
    {
      curie: '',
      label: 'Create local term',
      namespace: 'local',
      tier: 5 as const,
      level: 'concept' as const,
      score: 0.05,
      source: 'mint' as const,
      mint: { label: 'x' },
    },
  ]);
  return { resolve: resolveFn };
}

/** A store whose every write side is a tripwire (compile reads, never writes). */
function stubStore(records: Record<string, { kind: string; payload: Record<string, unknown> }> = {}) {
  return {
    get: vi.fn(async (id: string) => {
      const hit = records[id];
      if (!hit) return null;
      return { recordId: id, schemaId: `schema/${hit.kind}`, payload: hit.payload };
    }),
    list: vi.fn(async () => []),
    exists: vi.fn(async () => false),
    create: vi.fn(async () => {
      throw new Error('compileWorkspaceAction must NEVER reach store.create');
    }),
    update: vi.fn(async () => {
      throw new Error('compileWorkspaceAction must NEVER reach store.update');
    }),
    delete: vi.fn(async () => {
      throw new Error('compileWorkspaceAction must NEVER reach store.delete');
    }),
    validate: vi.fn(),
    lint: vi.fn(),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
  };
}

function deps(overrides: Partial<WorkspaceActionCompilerDeps> = {}): WorkspaceActionCompilerDeps {
  return {
    resolveSpine: fakeSpine([]) as never,
    surfaces: loadDefaultSurfacesRegistry(SCHEMA_DIR),
    store: stubStore() as never,
    ...overrides,
  };
}

const hepG2Record = {
  kind: 'material',
  payload: { recordId: 'MAT-000001', kind: 'material', name: 'HepG2 Cell' },
};

describe('compileWorkspaceAction — term resolution', () => {
  it('a resolvable term compiles to ok:true with a REAL REF, not the term', async () => {
    const store = stubStore({ 'MAT-000001': hepG2Record });
    const spine = fakeSpine([
      {
        curie: 'local:MAT-000001',
        label: 'HepG2 Cell',
        namespace: 'local',
        tier: 1,
        level: 'concept',
        score: 1.15,
        source: 'local-record',
      },
    ]);
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', label: 'HepG2 cells' } },
      deps({ resolveSpine: spine as never, store: store as never }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // The gate: target.id is the RESOLVED record id — a ref, never the term.
    expect(result.action.target).toMatchObject({
      kind: 'record',
      id: 'MAT-000001',
      type: 'material',
      label: 'HepG2 Cell',
    });
    // Compile never writes.
    expect(store.create).not.toHaveBeenCalled();
    expect(store.update).not.toHaveBeenCalled();
    expect(store.delete).not.toHaveBeenCalled();
  });

  it('a canonical tier-0 term binds an ONTOLOGY ref (CURIE, namespace, label)', async () => {
    const spine = fakeSpine([
      {
        curie: 'CL:0001860',
        label: 'HepG2 cell line',
        namespace: 'CL',
        tier: 0,
        level: 'concept',
        score: 1.35,
        source: 'canonical-term',
      },
    ]);
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'ontology', label: 'HepG2' } },
      deps({ resolveSpine: spine as never }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.target).toMatchObject({
      kind: 'ontology',
      id: 'CL:0001860',
      namespace: 'CL',
      label: 'HepG2 cell line',
    });
  });

  it('an unresolved term -> UNRESOLVED_TERM, ok:false', async () => {
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', label: 'unobtainium' } },
      deps({ resolveSpine: fakeSpine([]) as never }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('UNRESOLVED_TERM');
    expect(result.diagnostics[0]!.term).toBe('unobtainium');
  });

  it('THE MINT-AFFORDANCE LEAK: a spine returning ONLY the tier-5 mint is NOT a resolution', async () => {
    // fakeSpine always appends the mint; with no real candidates the ONLY
    // candidate is tier-5 curie:'' — a naive candidates[0] would "resolve" it.
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', label: 'brand-new-thing' } },
      deps({ resolveSpine: fakeSpine([]) as never }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('UNRESOLVED_TERM');
    // And defensively: nothing with an empty id ever compiles ok.
    expect(JSON.stringify(result)).not.toContain('"id":""');
  });

  it('ambiguous term (two same-tier exact hits at the top) -> AMBIGUOUS_TERM naming the candidates', async () => {
    const spine = fakeSpine([
      { curie: 'local:MAT-000001', label: 'DMEM', namespace: 'local', tier: 1, level: 'concept', score: 1.15, source: 'local-record' },
      { curie: 'local:MAT-000002', label: 'DMEM', namespace: 'local', tier: 1, level: 'concept', score: 1.15, source: 'local-record' },
    ]);
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', label: 'DMEM' } },
      deps({ resolveSpine: spine as never }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('AMBIGUOUS_TERM');
    expect(result.diagnostics[0]!.message).toContain('DMEM');
  });

  it('remote-tier candidates (2-4) are not bound — local tiers [0,1] only', async () => {
    const spine = fakeSpine([
      { curie: 'CHEBI:16236', label: 'DMEM', namespace: 'CHEBI', tier: 3, level: 'concept', score: 0.75, source: 'ols4' },
    ]);
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', label: 'DMEM' } },
      deps({ resolveSpine: spine as never }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('UNRESOLVED_TERM');
  });
});

describe('compileWorkspaceAction — store-verified targets (the schema-valid shortcut dies here)', () => {
  it('an invented record id is REJECTED (UNKNOWN_RECORD) even though the envelope is Ajv-valid', async () => {
    const store = stubStore();
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', id: 'MAT-made-up', type: 'material', label: 'Invented' } },
      deps({ store: store as never }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('UNKNOWN_RECORD');
    expect(store.create).not.toHaveBeenCalled();
  });

  it('a real record id compiles with the AUTHORITATIVE label from the record (the model label is overwritten)', async () => {
    const store = stubStore({ 'MAT-000001': hepG2Record });
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', id: 'MAT-000001', type: 'material', label: 'the green cells lol' } },
      deps({ store: store as never }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.target).toMatchObject({ kind: 'record', id: 'MAT-000001', type: 'material', label: 'HepG2 Cell' });
  });

  it('protocol-step target: store-verified, resolved label = the record step label', async () => {
    const store = stubStore({
      'PRT-000042': {
        kind: 'protocol',
        payload: {
          recordId: 'PRT-000042',
          kind: 'protocol',
          title: 'CellROX assay',
          steps: [
            { stepId: 'step-1', label: 'Seed cells', ordinal: 1, kind: 'add_material' },
            { stepId: 'step-3', label: 'Read plate', ordinal: 3, kind: 'read' },
          ],
        },
      },
    });
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'protocol-step', protocolId: 'PRT-000042', stepId: 'step-3', label: 'the read' } },
      deps({ store: store as never }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action.target).toMatchObject({
      kind: 'protocol-step',
      protocolId: 'PRT-000042',
      stepId: 'step-3',
      label: 'Read plate',
    });
  });

  it('protocol-step with an unknown protocolId -> UNKNOWN_RECORD (invented protocol never passes)', async () => {
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'protocol-step', protocolId: 'PRT-made-up', stepId: 'step-3' } },
      deps({ store: stubStore() as never }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('UNKNOWN_RECORD');
  });

  it('protocol-step with a stepId not in the record -> UNKNOWN_STEP', async () => {
    const store = stubStore({
      'PRT-000042': {
        kind: 'protocol',
        payload: {
          recordId: 'PRT-000042',
          kind: 'protocol',
          title: 'CellROX assay',
          steps: [{ stepId: 'step-1', label: 'Seed cells', ordinal: 1, kind: 'add_material' }],
        },
      },
    });
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'protocol-step', protocolId: 'PRT-000042', stepId: 'step-99' } },
      deps({ store: store as never }),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('UNKNOWN_STEP');
  });
});

describe('compileWorkspaceAction — surface check (registry membership only)', () => {
  it('an unregistered surface id -> UNSUPPORTED_SURFACE', async () => {
    const result = await compileWorkspaceAction(
      { action: 'open-surface', surface: 'dashboard' },
      deps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('UNSUPPORTED_SURFACE');
  });

  it('a registered surface id compiles open-surface with no target', async () => {
    const result = await compileWorkspaceAction(
      { action: 'open-surface', surface: 'analysis', contextNote: 'open the analysis surface' },
      deps(),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.action).toMatchObject({ action: 'open-surface', surface: 'analysis' });
    expect(result.action.contextNote).toBe('open the analysis surface');
  });

  it('open-surface with NO surface -> diagnostic, not an action', async () => {
    const result = await compileWorkspaceAction({ action: 'open-surface' }, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('UNSUPPORTED_SURFACE');
  });

  it('focus with NO target -> MISSING_TARGET', async () => {
    const result = await compileWorkspaceAction({ action: 'focus' }, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('MISSING_TARGET');
  });
});

describe('compileWorkspaceAction — envelope validation through the REGISTERED schema', () => {
  it('a missing action verb -> MALFORMED_ENVELOPE naming the offending path', async () => {
    const result = await compileWorkspaceAction({ target: { kind: 'record', id: 'MAT-000001', type: 'material' } }, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('MALFORMED_ENVELOPE');
    expect(result.diagnostics[0]!.message).toContain('action');
  });

  it('an unknown verb -> MALFORMED_ENVELOPE (the schema enum is the verb authority)', async () => {
    const result = await compileWorkspaceAction({ action: 'teleport', target: 'anything' }, deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('MALFORMED_ENVELOPE');
    expect(result.diagnostics[0]!.message).toContain('action');
  });

  it('a non-object proposal -> MALFORMED_ENVELOPE', async () => {
    const result = await compileWorkspaceAction('focus on step 3', deps());
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('MALFORMED_ENVELOPE');
  });

  it('a forbidden extra property -> MALFORMED_ENVELOPE naming the path', async () => {
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', id: 'MAT-000001', type: 'material' }, tier: 1 },
      deps(),
    );
    expect(result.ok).toBe(false);
    if (result.ok) return;
    expect(result.diagnostics[0]!.code).toBe('MALFORMED_ENVELOPE');
    expect(result.diagnostics[0]!.message).toContain('tier');
  });

  it('the RESOLVED action re-validates against the same registered $id', async () => {
    const store = stubStore({ 'MAT-000001': hepG2Record });
    const spine = fakeSpine([
      { curie: 'local:MAT-000001', label: 'HepG2 Cell', namespace: 'local', tier: 1, level: 'concept', score: 1.15, source: 'local-record' },
    ]);
    const result = await compileWorkspaceAction(
      { action: 'focus', target: { kind: 'record', label: 'HepG2 cells' }, supportedBy: [{ kind: 'record', id: 'MAT-000001', type: 'material' }] },
      deps({ resolveSpine: spine as never, store: store as never }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    // Import the validator the same way the schema contract test builds it.
    const { loadSchemasFromContent } = await import('../schema/SchemaLoader.js');
    const { createSchemaRegistry } = await import('../schema/SchemaRegistry.js');
    const { createValidator } = await import('../validation/AjvValidator.js');
    const { readFile } = await import('node:fs/promises');
    const { join } = await import('node:path');
    const contents = new Map<string, string>();
    for (const p of ['core/datatypes/ref.schema.yaml', 'workflow/agent-action.schema.yaml']) {
      contents.set(p, await readFile(join(SCHEMA_DIR, p), 'utf8'));
    }
    const loaded = loadSchemasFromContent(contents);
    const registry = createSchemaRegistry();
    registry.addSchemas(loaded.entries);
    const validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema as never, entry.id);
    }
    const out = validator.validate(result.action, AGENT_ACTION_SCHEMA_ID);
    expect(out.valid).toBe(true);
  });
});
