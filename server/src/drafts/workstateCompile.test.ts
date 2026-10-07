/**
 * PB-CH-2 — pure workstate compilation module tests (RED-FIRST).
 *
 * No adapter registration, no HTTP: a FAKE spine that appends a REAL tier-5
 * `curie:''` mint candidate on EVERY resolve call (the real ResolveSpine always
 * does — a spine stub that never mints proves nothing), the REAL
 * loadDefaultSurfacesRegistry, a stub canonical store, and a repo-schema Ajv
 * validator built through the same SchemaLoader -> SchemaRegistry ->
 * AjvValidator pipeline the boot uses.
 *
 * The compiler injects `requestId` into the intent before staging
 * (FormDraftService.evaluate); this harness injects it too, exactly like the
 * real pipeline, so the envelope schema's requestId tolerance is exercised.
 */
import { beforeAll, afterAll, describe, it, expect } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadDefaultSurfacesRegistry } from '../surfaces/surfaces.js';
import { CompilerKernel } from '../compiler/CompilerKernel.js';
import type { RecordEnvelope, RecordStore } from '../store/types.js';
import type { ValidationResult } from '../types/common.js';
import type { ActionCandidate, ActionSpineLike } from '../ai/compileWorkspaceAction.js';
import { compileWorkstateIntent, type WorkstateDeps } from './workstateCompile.js';

const LAB_SESSION_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/workflow/lab-session.schema.yaml';
const schemaRoot = fileURLToPath(new URL('../../../schema', import.meta.url));

let root: string;
let validate: (doc: unknown, id: string) => ValidationResult;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-workstate-pure-'));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
  validate = (doc, id) => validator.validate(doc, id);
}, 30000);
afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

// ---------------------------------------------------------------- fixtures --
const envelopes: Record<string, RecordEnvelope> = {
  'PLR-TEST1': { recordId: 'PLR-TEST1', schemaId: 'https://computable-lab.com/schema/computable-lab/planned-run.schema.yaml', payload: { kind: 'planned-run', recordId: 'PLR-TEST1', title: 'Zymo DNA extraction run' } },
  'PRT-TEST1': { recordId: 'PRT-TEST1', schemaId: 'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml', payload: { kind: 'protocol', recordId: 'PRT-TEST1', title: 'ZymoBIOMICS extraction protocol', steps: [{ stepId: 'lysis', label: 'Lysis', ordinal: 1, kind: 'other' }] } },
  'STU-TEST1': { recordId: 'STU-TEST1', schemaId: 'https://computable-lab.com/schema/computable-lab/study.schema.yaml', payload: { kind: 'study', recordId: 'STU-TEST1', title: 'Microbiome study', shortSlug: 'microbiome-study' } },
  'VPDF-TEST1': { recordId: 'VPDF-TEST1', schemaId: 'https://computable-lab.com/schema/computable-lab/vendor-pdf.schema.yaml', payload: { kind: 'vendor-pdf', recordId: 'VPDF-TEST1', title: 'ZymoBIOMICS kit manual' } },
  // A real record kind with NO entry in config/drafting/workstate-tab-kinds.yaml.
  'BUD-TEST1': { recordId: 'BUD-TEST1', schemaId: 'https://computable-lab.com/schema/computable-lab/budget.schema.yaml', payload: { kind: 'budget', recordId: 'BUD-TEST1', title: 'Q4 reagent budget' } },
};

const stubStore = {
  get: async (id: string) => envelopes[id] ?? null,
  list: async () => Object.values(envelopes),
} as unknown as RecordStore;

/** THE MINT LEAK IS EXERCISED: every resolve call appends the tier-5 mint the
 *  real spine appends (ResolveSpine.ts mintAffordance). */
function fakeSpine(table: Record<string, ActionCandidate[]>): ActionSpineLike {
  return {
    async resolve(term: string): Promise<readonly ActionCandidate[]> {
      const hits = table[term] ?? [];
      return [...hits, { curie: '', label: `Create local term “${term}”`, tier: 5, source: 'mint', namespace: 'local', score: 0.05 }];
    },
  };
}

const spine = fakeSpine({
  'Zymo DNA extraction run': [{ curie: 'local:PLR-TEST1', label: 'Zymo DNA extraction run', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  'ZymoBIOMICS extraction protocol': [{ curie: 'local:PRT-TEST1', label: 'ZymoBIOMICS extraction protocol', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  'Microbiome study': [{ curie: 'local:STU-TEST1', label: 'Microbiome study', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  'ZymoBIOMICS kit manual': [{ curie: 'local:VPDF-TEST1', label: 'ZymoBIOMICS kit manual', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  'Q4 reagent budget': [{ curie: 'local:BUD-TEST1', label: 'Q4 reagent budget', tier: 1, source: 'local-record', namespace: 'local', score: 1.15 }],
  cell: [{ curie: 'CL:0000182', label: 'cell', tier: 0, source: 'oak', namespace: 'CL', score: 1.2 }],
});

const depsFor = (): WorkstateDeps => ({
  resolveSpine: spine,
  surfaces: loadDefaultSurfacesRegistry(schemaRoot),
  store: stubStore,
  validate: (doc: unknown, id: string) => validate(doc, id),
});
const deps = depsFor();

/** The draft compiler injects requestId before staging; the harness does too. */
const intent = (tabs: unknown[], activeTab?: unknown): Record<string, unknown> => ({
  operation: 'compose-workstate',
  requestId: 'DRAFT-pure-1',
  tabs,
  ...(activeTab !== undefined ? { activeTab } : {}),
});
const runTab = { surface: 'run-plan', target: { term: 'Zymo DNA extraction run' } };
const protoTab = { surface: 'protocol-review', target: { term: 'ZymoBIOMICS extraction protocol' } };

// ------------------------------------------------------------------- tests --
describe('workstate proposal compilation (pure module)', () => {
  it('compiles a proposal to a schema-valid version:1 session document with server-derived ids', async () => {
    const compiled = await compileWorkstateIntent(intent([runTab, protoTab], { index: 0 }), deps);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    const doc = compiled.result.sessionDocument;
    expect(validate(doc, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
    expect(doc.version).toBe(1);
    expect(doc.tabs).toHaveLength(2);
    // REAL record ids, not the proposed terms.
    expect(doc.tabs[0]).toMatchObject({ kind: 'run', runId: 'PLR-TEST1' });
    expect(doc.tabs[1]).toMatchObject({ kind: 'record-edit', recordId: 'PRT-TEST1' });
    expect(doc.activeTabId).toBe('run:PLR-TEST1');
    expect(compiled.result.resolvedTerms.map((t) => t.curieOrRecordId)).toEqual(['PLR-TEST1', 'PRT-TEST1']);
    expect(typeof compiled.result.summary).toBe('string');
  });

  it('unresolvable tab term yields UNRESOLVED_TERM with ok:false', async () => {
    const compiled = await compileWorkstateIntent(intent([{ surface: 'run-plan', target: { term: 'unobtanium flux capacitor' } }]), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNRESOLVED_TERM' && d.path.includes('/tabs/0'))).toBe(true);
  });

  it('mint-only candidate never binds (tier-5 leak guard exercised every call)', async () => {
    // The fake spine appended the tier-5 mint above; with no tier-[0,1] hit the
    // mint alone must NOT produce a tab.
    const compiled = await compileWorkstateIntent(intent([{ surface: 'run-plan', target: { term: 'brand new widget nobody authored' } }]), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNRESOLVED_TERM')).toBe(true);
  });

  it('surface not in the registry yields UNSUPPORTED_SURFACE (registry membership only)', async () => {
    const compiled = await compileWorkstateIntent(intent([{ surface: 'totally-unregistered-surface', target: { term: 'Zymo DNA extraction run' } }]), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNSUPPORTED_SURFACE')).toBe(true);
  });

  it('invented recordId target yields UNKNOWN_RECORD', async () => {
    const compiled = await compileWorkstateIntent(intent([{ surface: 'run-plan', target: { recordId: 'PLR-made-up-999' } }]), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNKNOWN_RECORD')).toBe(true);
  });

  it('recordId target resolves against the store', async () => {
    const compiled = await compileWorkstateIntent(intent([{ surface: 'run-plan', target: { recordId: 'PLR-TEST1' } }], { index: 0 }), deps);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.result.sessionDocument.tabs[0]).toMatchObject({ kind: 'run', runId: 'PLR-TEST1' });
  });

  it('unmappable record kind produces a diagnostic, never a TS kind branch', async () => {
    const compiled = await compileWorkstateIntent(intent([{ surface: 'knowledge', target: { term: 'Q4 reagent budget' } }]), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNMAPPABLE_RECORD_KIND' && d.message.includes('budget'))).toBe(true);
  });

  it('ontology-resolved term (non-local CURIE, no workspace record) yields a diagnostic', async () => {
    const compiled = await compileWorkstateIntent(intent([{ surface: 'knowledge', target: { term: 'cell' } }]), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNMAPPABLE_RECORD_KIND')).toBe(true);
  });

  it('activeTab target absent from tabs yields ACTIVE_TAB_UNRESOLVED', async () => {
    // 'Microbiome study' resolves to a REAL record but is not a proposed tab.
    const compiled = await compileWorkstateIntent(intent([runTab], { term: 'Microbiome study' }), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'ACTIVE_TAB_UNRESOLVED')).toBe(true);
  });

  it('activeTab index out of range yields ACTIVE_TAB_UNRESOLVED', async () => {
    const compiled = await compileWorkstateIntent(intent([runTab], { index: 5 }), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'ACTIVE_TAB_UNRESOLVED')).toBe(true);
  });

  it('invented activeTab recordId yields UNKNOWN_RECORD', async () => {
    const compiled = await compileWorkstateIntent(intent([runTab], { recordId: 'STU-invented-42' }), deps);
    expect(compiled.ok).toBe(false);
    if (compiled.ok) return;
    expect(compiled.diagnostics.some((d) => d.code === 'UNKNOWN_RECORD')).toBe(true);
  });

  it('projected activeTabId always equals a server-derived tab id', async () => {
    const compiled = await compileWorkstateIntent(intent([runTab, protoTab], { term: 'ZymoBIOMICS extraction protocol' }), deps);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.result.sessionDocument.activeTabId).toBe('record:PRT-TEST1');
    // No activeTab at all => null (schema-legal), never undefined.
    const none = await compileWorkstateIntent(intent([runTab]), deps);
    expect(none.ok).toBe(true);
    if (!none.ok) return;
    expect(none.result.sessionDocument.activeTabId).toBeNull();
    expect(validate(none.result.sessionDocument, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
  });

  it('intent schema tolerates the compiler-injected requestId; malformed envelopes are MALFORMED_ENVELOPE', async () => {
    const good = await compileWorkstateIntent(intent([runTab], { index: 0 }), deps);
    expect(good.ok).toBe(true);
    const missingTabs = await compileWorkstateIntent({ operation: 'compose-workstate', requestId: 'DRAFT-pure-2' }, deps);
    expect(missingTabs.ok).toBe(false);
    if (missingTabs.ok) return;
    expect(missingTabs.diagnostics.some((d) => d.code === 'MALFORMED_ENVELOPE' && d.message.includes('tabs'))).toBe(true);
    const smuggled = await compileWorkstateIntent({ operation: 'compose-workstate', tabs: [runTab], sessionDocument: { version: 1, tabs: [] } }, deps);
    expect(smuggled.ok).toBe(false);
  });

  it('tab title: proposed title is honored, resolved label is the fallback', async () => {
    const compiled = await compileWorkstateIntent(intent([{ ...runTab, title: 'Extraction run' }], { index: 0 }), deps);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.result.sessionDocument.tabs[0].title).toBe('Extraction run');
    const fallback = await compileWorkstateIntent(intent([runTab], { index: 0 }), deps);
    expect(fallback.ok).toBe(true);
    if (!fallback.ok) return;
    expect(fallback.result.sessionDocument.tabs[0].title).toBe('Zymo DNA extraction run');
  });

  it('project tab ids are project:<studyId> (client tabId.ts consistency pin)', async () => {
    const compiled = await compileWorkstateIntent(intent([{ surface: 'project', target: { term: 'Microbiome study' } }], { index: 0 }), deps);
    expect(compiled.ok).toBe(true);
    if (!compiled.ok) return;
    expect(compiled.result.sessionDocument.tabs[0]).toMatchObject({ kind: 'project', studyId: 'STU-TEST1' });
    expect(compiled.result.sessionDocument.activeTabId).toBe('project:STU-TEST1');
    expect(validate(compiled.result.sessionDocument, LAB_SESSION_SCHEMA_ID).valid).toBe(true);
  });

  it('kernel assumption: an empty plan compiles with zero error diagnostics and all-allowed policy decisions', () => {
    // The projection-only adapter stages NOTHING, so evaluate_draft runs the
    // kernel with zero candidateBindings and zero plan steps. If empty plans
    // failed the kernel, projection-only could never canAccept — STOP condition.
    const compilation = new CompilerKernel().evaluateRequest({
      normalizedIntent: { domain: 'workstate', intentId: 'DRAFT-empty-plan', version: '1', summary: 'Review workstate proposal', payload: {}, requiredFacts: [] },
      candidateBindings: [],
      plan: { planId: 'DRAFT-empty-plan-1', steps: [], requiresOperator: true },
      policyProfiles: [],
      activeScope: { organizationId: 'POL-SANDBOX' },
      diagnostics: [],
      provenance: { actor: 'USR-test', sources: [] },
    });
    expect(compilation.diagnostics.every((d) => d.severity !== 'error' && !['policy-blocked', 'execution-blocked', 'needs-missing-fact'].includes(d.outcome))).toBe(true);
    expect(compilation.policy.decisions.every((d) => d.disposition === 'allowed')).toBe(true);
  });
});
