/**
 * QMS7-7 FIX-2 (architect RULING OPTION A) — the record-drafting staged
 * create is a HUMAN-REVIEWED create, not an auto-create action.
 *
 * Defect: FormDraftService's evaluate_draft pass built every staged write's
 * candidate binding with the hardcoded `resolution:'new-record'`, so
 * CompilerKernel.inferredActions (CompilerKernel.ts:53-54) emitted an
 * `auto-create` PolicyActionRequest for the record-drafting adapter's single
 * staged create. Under POL-REGULATED (regulated.policy-bundle.yaml:7
 * allowAutoCreate: deny) that decision is `blocked` → POLICY_BLOCKED →
 * canAccept:false → the proposal card renders Reject-only, permanently.
 *
 * RULING: `auto-create` means the MACHINE deposits a record without a human
 * review act. In this flow a human reads the card and clicks Accept, and the
 * write rides the FormDraftService accept loop (reviewHash re-check, FULL
 * policy re-evaluation, owner-policy, audit). The exemption is DATA: the
 * record-drafting block in config/drafting/adapters.yaml declares
 * `humanReviewedCreate: true`; the staged-authoring compile pass reads that
 * block per call (the landing.tabKind precedent, QMS7-7 FIX1) and binds the
 * staged create as a human-confirmed create — the kernel's inferredActions
 * default (`new-record` → auto-create) is UNTOUCHED, and every other policy
 * setting (allowPlaceholders, allowSubstitutions, ...) still runs.
 *
 * Pinned here (RED first):
 *  1. the flag is DECLARED in the shipped adapters.yaml record-drafting block
 *     (data switch present) and is adapter-scoped: ONLY that block carries it;
 *  2. compile under POL-REGULATED yields NO `auto-create` decision, NO
 *     POLICY_BLOCKED diagnostic, canAccept:true (card-compilable);
 *  3. an unflagged adapter (doctored adapters.yaml without the flag) under
 *     POL-REGULATED still yields the auto-create decision + POLICY_BLOCKED +
 *     canAccept:false (default preserved);
 *  4. kernel-level default pin: a plain `new-record` binding (no flag — the
 *     MaterialCompiler/protocol shape) still infers auto-create under a deny
 *     setting — CompilerKernel.inferredActions default behavior UNTOUCHED;
 *  5. the accept loop still runs the FULL policy re-evaluation for a flagged
 *     draft: the accept-side recompile re-evaluates the bundle (the kernel
 *     runs again with the POL-REGULATED settings) and the write lands only
 *     after that re-evaluation passes — accept is never skipped "because the
 *     compile passed";
 *  6. source-pin: FormDraftService.ts reads the declared flag from the
 *     adapter block (per-call adapters.yaml load) and carries NO adapter-name
 *     classification branch.
 */
import { beforeAll, beforeEach, afterEach, describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'node:fs';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { parse } from 'yaml';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { AuthorizationService } from '../security/AuthorizationService.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import { object } from '../revisions/RecordRevisionService.js';
import type { RecordEnvelope } from '../store/types.js';
import type { AppContext } from '../server.js';
import { FormDraftService } from './FormDraftService.js';
import { CompilerKernel } from '../compiler/CompilerKernel.js';
import type { CandidateBinding } from '../compiler/types.js';

const mocks = vi.hoisted(() => ({
  /** When set, the mocked readFileSync serves this text for adapters.yaml only
   *  (the recordDraftCompile.landing.test.ts harness precedent — every other
   *  fs read rides the real module, so the harness stays faithful). */
  doctoredAdaptersYaml: null as string | null,
}));

vi.mock('node:fs', async (importOriginal) => {
  const actual = await importOriginal<typeof import('node:fs')>();
  const adaptersPath = new URL('../../../config/drafting/adapters.yaml', import.meta.url);
  return {
    ...actual,
    readFileSync: ((p: Parameters<typeof actual.readFileSync>[0], ...rest: unknown[]) =>
      String(p) === String(adaptersPath) && mocks.doctoredAdaptersYaml !== null
        ? mocks.doctoredAdaptersYaml
        : (actual.readFileSync as (...args: unknown[]) => unknown)(p, ...rest)) as never,
  };
});

const schemaRoot = fileURLToPath(new URL('../../../schema', import.meta.url));
const adaptersPath = fileURLToPath(new URL('../../../config/drafting/adapters.yaml', import.meta.url));
const formDraftServicePath = fileURLToPath(new URL('./FormDraftService.ts', import.meta.url));

// Immutable corpus shared by every harness (schema + ui + Ajv compile) — the
// RecordDraftAdapter.test.ts precedent.
let registry: ReturnType<typeof createSchemaRegistry>;
let validator: ReturnType<typeof createValidator>;
let uiSpecLoader: ReturnType<typeof createUISpecLoader>;

beforeAll(async () => {
  registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaRoot, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema as never, id);
  }
  uiSpecLoader = createUISpecLoader();
  await loadAllUISpecs(uiSpecLoader, schemaRoot);
}, 60000);

// Per-test fresh workspace + POL-REGULATED bundle (the defect regime).
let root: string;
let ctx: AppContext;
let service: FormDraftService;

beforeEach(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-record-draft-regulated-'));
  const repoAdapter = createLocalRepoAdapter({ basePath: root });
  const store = createRecordStore(repoAdapter, validator, new LintEngine());
  const policyBundleService = new PolicyBundleService();
  policyBundleService.loadFromDir(join(schemaRoot, 'core/policy-bundles'));
  ctx = {
    store, validator, schemaRegistry: registry, policyBundleService, repoAdapter,
    uiSpecLoader,
    authorizationService: new AuthorizationService(store),
    workspaceRoot: root, recordsDir: root, schemaDir: schemaRoot,
    // THE DEFECT REGIME: the flagship regulated bundle (allowAutoCreate: deny).
    appConfig: { lab: { policyBundleId: 'POL-REGULATED' } },
  } as unknown as AppContext;
  service = new FormDraftService(ctx, 'USR-QMS-REG');
}, 60000);
afterEach(async () => {
  mocks.doctoredAdaptersYaml = null;
  if (root) await rm(root, { recursive: true, force: true });
});

const INTENT = {
  operation: 'compose-record',
  kind: 'training-material',
  fields: { title: 'Pipetting safety basics', materialType: 'slide_deck' },
};
const proposal = (intent: Record<string, unknown>): Record<string, unknown> => ({ adapter: 'record-drafting', intent });

const canonicalRecords = async (): Promise<RecordEnvelope[]> =>
  (await ctx.store.list()).filter((r) => {
    const kind = object(r.payload).kind;
    return kind !== 'form-draft' && kind !== 'access-policy';
  });

describe('record-drafting humanReviewedCreate — DATA switch (QMS7-7 FIX-2, RULING OPTION A)', () => {
  it('the flag is DECLARED data: the shipped adapters.yaml record-drafting block carries humanReviewedCreate', async () => {
    const raw = parse(await readFile(adaptersPath, 'utf8')) as {
      adapters: Record<string, { humanReviewedCreate?: unknown }>;
    };
    expect(raw.adapters['record-drafting']?.humanReviewedCreate).toBe(true);
  });

  it('the flag is adapter-scoped: the shipped config flags ONLY the human-reviewed blocks (record-drafting, receiving)', async () => {
    const raw = parse(await readFile(adaptersPath, 'utf8')) as {
      adapters: Record<string, { humanReviewedCreate?: unknown }>;
    };
    const flagged = Object.entries(raw.adapters)
      .filter(([, block]) => block.humanReviewedCreate === true)
      .map(([name]) => name);
    // MATRES-RECV (spec §2c, DELIBERATE golden diff): the `receiving` adapter
    // joins the human-reviewed set — a staged receipt create is HUMAN-REVIEWED
    // at the draft card, never auto-created (same semantics as record-drafting).
    // MATRES-CHAIN (spec §7.1, DELIBERATE golden diff): the `chain` adapter
    // joins the same set — a staged chain create (derivation + instance +
    // aliquots + attestation) is HUMAN-REVIEWED at the draft card, never
    // auto-created. Adapter-scoped means: only blocks that DECLARE the flag,
    // never a global.
    expect(flagged).toEqual(['record-drafting', 'receiving', 'chain']);
  });

  it('T1: a flagged adapter compiles under POL-REGULATED with NO auto-create decision, NO POLICY_BLOCKED, canAccept:true', async () => {
    const compiled = await service.compile(proposal(INTENT));
    const diagText = compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join(' | ');
    // The machine-deposition class is NOT requested for a human-gated staged create.
    expect(
      compiled.policy.decisions.some((d) => d.action === 'auto-create'),
      `auto-create decision leaked into a human-reviewed compile: ${diagText}`,
    ).toBe(false);
    expect(
      compiled.diagnostics.some((d) => d.code === 'POLICY_BLOCKED'),
      `POLICY_BLOCKED under a permitted compile: ${diagText}`,
    ).toBe(false);
    // The card is compilable: Accept mounts (useWorkstateProposalFlow.ts:119
    // gates the phase on canAccept).
    expect(compiled.canAccept, diagText).toBe(true);
    // The compile still ran the real gates: exactly one staged write, nothing durable.
    expect(compiled.writes.length).toBe(1);
    expect((await canonicalRecords()).length).toBe(0);
  });

  it('T2: an UNFLAGGED adapter (block without humanReviewedCreate) under POL-REGULATED still yields auto-create + POLICY_BLOCKED + canAccept:false', async () => {
    // Doctored adapters.yaml: the record-drafting block WITHOUT the flag.
    // Only the adapters.yaml read is intercepted; every other fs read rides
    // the real module.
    mocks.doctoredAdaptersYaml = `adapters:
  record-drafting:
    domain: registry-records
    operations: [compose-record]
    projection: {}
    landing:
      tabKind: registry
`;
    const compiled = await service.compile(proposal(INTENT));
    const diagText = compiled.diagnostics.map((d) => `${d.code} ${d.message}`).join(' | ');
    // Default behavior preserved: new-record still maps to auto-create.
    expect(
      compiled.policy.decisions.some((d) => d.action === 'auto-create' && d.disposition === 'blocked'),
      `unflagged compile lost the auto-create decision: ${diagText}`,
    ).toBe(true);
    expect(compiled.diagnostics.some((d) => d.code === 'POLICY_BLOCKED')).toBe(true);
    expect(compiled.canAccept).toBe(false);
    // A blocked draft has no accept path and writes nothing canonical.
    await expect(
      service.accept({ draftId: compiled.draftId, revision: compiled.revision, reviewHash: compiled.reviewHash }),
    ).rejects.toThrow(/blocked/i);
    expect((await canonicalRecords()).length).toBe(0);
  });

  it('T3 (kernel default pin): an unflagged new-record binding STILL infers auto-create + POLICY_BLOCKED under a deny setting', () => {
    // CompilerKernel.inferredActions default behavior UNTOUCHED: without the
    // declared flag (the MaterialCompiler/protocol machine-deposition shape),
    // new-record still maps to auto-create exactly as today.
    const binding: CandidateBinding = {
      bindingId: 'b-1',
      slot: 'MAT-new',
      candidateType: 'material',
      candidateId: 'MAT-new',
      resolution: 'new-record',
      payload: {},
      provenance: [{ kind: 'user-input', id: 'intent-1' }],
    };
    const result = new CompilerKernel().evaluateRequest({
      normalizedIntent: { domain: 'materials', intentId: 'intent-1', version: '1', summary: 'Depose a new material', payload: {}, requiredFacts: [] },
      candidateBindings: [binding],
      plan: { planId: 'p-1', steps: [] },
      policyProfiles: [{ id: 'POL-REGULATED', scope: 'organization', scopeId: 'POL-REGULATED', settings: { allowAutoCreate: 'deny' } }],
      activeScope: { organizationId: 'POL-REGULATED' },
    });
    expect(result.policy.decisions.some((d) => d.action === 'auto-create' && d.disposition === 'blocked')).toBe(true);
    expect(result.diagnostics.some((d) => d.code === 'POLICY_BLOCKED')).toBe(true);
  });

  it('T4: the accept loop still runs the FULL policy re-evaluation for a flagged draft under POL-REGULATED', async () => {
    const compiled = await service.compile(proposal(INTENT));
    expect(compiled.canAccept).toBe(true);
    // The accept-side recompile (FormDraftService.ts:166) re-runs the kernel
    // against the POL-REGULATED bundle before ANY durable write. Instrument
    // the kernel so the re-evaluation is provable, not assumed.
    const original = CompilerKernel.prototype.evaluateRequest;
    let kernelCalls = 0;
    let regulatedSettingsSeen = false;
    CompilerKernel.prototype.evaluateRequest = function (input: Parameters<typeof original>[0]) {
      kernelCalls += 1;
      const bundle = input.policyProfiles.find((p) => p.id === 'POL-REGULATED');
      if (bundle?.settings.allowAutoCreate === 'deny') regulatedSettingsSeen = true;
      return original.call(this, input);
    } as typeof original;
    try {
      const body = await service.accept({ draftId: compiled.draftId, revision: compiled.revision, reviewHash: compiled.reviewHash });
      expect(body).toEqual(compiled.result);
      // Accept ran its OWN policy evaluation with the regulated settings —
      // never skipped "because the compile passed".
      expect(kernelCalls).toBeGreaterThan(0);
      expect(regulatedSettingsSeen).toBe(true);
      // Exactly one governed record landed after the re-evaluation.
      const trms = (await canonicalRecords()).filter((r) => object(r.payload).kind === 'training-material');
      expect(trms.length).toBe(1);
      expect(object(trms[0]!.payload).title).toBe('Pipetting safety basics');
    } finally {
      CompilerKernel.prototype.evaluateRequest = original;
    }
  });

  it('source-pin: the classification reads the DECLARED adapter block — no adapter-name branch, kernel default intact', () => {
    const source = readFileSync(formDraftServicePath, 'utf8');
    // The decision reads the declared flag from the adapters.yaml block
    // (per-call load — the landing.tabKind precedent shape).
    expect(source).toContain('humanReviewedCreate');
    // No adapter-name branch decides the class (repo rule: generic gate, not
    // an adapter-name branch).
    expect(source).not.toMatch(/'record-drafting'/);
    // The kernel default mapping is intact: the staged resolution FALLS BACK
    // to 'new-record' (-> auto-create) for every unflagged adapter; only a
    // block declaring humanReviewedCreate:true switches it.
    expect(source).toMatch(/:\s*'new-record'\s+as const/);
    expect(source).toMatch(/resolution:\s*stagedResolution/);
  });
});
