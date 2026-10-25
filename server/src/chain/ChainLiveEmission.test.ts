/**
 * MATRES-CHAIN fix-run 4 D2(c) — the BARE LIVE emission end-to-end (gate g1d).
 *
 * The live model emission for the canonical case-3' sentence omits the fields
 * the rich ChainAccept fixture supplies: prepared carries {name, volume} with
 * NO sourceSpecRef, and every occurrence is occurredAtStatus 'approximate' +
 * an approximation token ('today'/'yesterday') with NO occurredAt. The shape
 * here is the verbatim normalizedIntent.payload of the refused live compile
 * (receipts/MATRES-CHAIN/g1d-2026-10-24_122545/compile-response-A1.json).
 *
 * Pinned outcomes (the honest pair):
 *  A. RESOLVABLE arm — the lab HAS exactly one material-spec the declared prep
 *     name names: the compile binds it through the SHIPPED name->record
 *     mechanism (the resolve spine's tier-1 record provider,
 *     server/src/resolve/providers/records.ts — the same provider
 *     createResolveSpine composes for every name->record binding), the time
 *     pairing is satisfied (the compiler never emits approximate-without-
 *     occurredAt: an approximate claim with no stated time downgrades to the
 *     terminal 'unknown' and the human approximation note is retained for the
 *     card only), and the draft is reviewable (canAccept:true).
 *  B. UNRESOLVABLE arm — no material-spec names the prep: the compile stays
 *     LEGITIMATELY BLOCKED with a NAMED diagnostic (chain.prepared.sourceSpecRef)
 *     and the time pairing is NOT violated (no
 *     attestation-occurred-approximate-needs-approximation diagnostic — the
 *     compiler downgrades instead of emitting the illegal pairing). Never a
 *     guess.
 *  C. AMBIGUOUS arm — two distinct material-specs match: NOT resolvable
 *     (named diagnostic, blocked), the compiler never fuzzy-guesses across
 *     distinct records.
 *  D. The refused compile still BUILDS the card document (compile output
 *     `card`): its claims render the downgraded 'unknown' status with the
 *     retained approximation note — the review wall's data.
 *
 * The existing green fixture tests (ChainAccept.test.ts) are byte-untouched.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createValidator } from '../validation/AjvValidator.js';
import { LintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { PolicyBundleService } from '../policy/PolicyBundleService.js';
import { AuthorizationService } from '../security/AuthorizationService.js';
import { object } from '../revisions/RecordRevisionService.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { FormDraftService } from '../drafts/FormDraftService.js';
import type { CompiledDraft } from '../drafts/FormDraftService.js';
import { compileExecuteChainIntent, chainDepsFromContext } from './ExecuteChainDraft.js';
import type { AppContext } from '../server.js';
import type { RecordEnvelope } from '../store/types.js';

let ctx: AppContext;
let root: string;
let service: FormDraftService;

const LIVE_SPEC_ID = 'SPEC-LIVE-CELLSUSPENSION';
const LIVE_SPEC_ID_2 = 'SPEC-LIVE-CELLSUSPENSION-B';
const MATERIAL_SPEC_SCHEMA_ID = 'https://computable-lab.com/schema/computable-lab/material-spec.schema.yaml';

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-chain-live-'));
  const schemaDir = fileURLToPath(new URL('../../../schema', import.meta.url));
  const registry = createSchemaRegistry();
  const loaded = await loadAllSchemas({ basePath: schemaDir, recursive: true });
  expect(loaded.errors).toEqual([]);
  registry.addSchemas(loaded.entries);
  const validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, id);
  }
  const lintEngine = new LintEngine();
  const lintLoad = await loadAllLintSpecs({ basePath: schemaDir, recursive: true });
  expect(lintLoad.errors.filter(e => /chain-draft/.test(e.path))).toEqual([]);
  for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
  const uiSpecLoader = createUISpecLoader();
  await loadAllUISpecs(uiSpecLoader, schemaDir);
  const repoAdapter = createLocalRepoAdapter({ basePath: root });
  const store = createRecordStore(repoAdapter, validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
  const policyBundleService = new PolicyBundleService();
  policyBundleService.loadFromDir(join(schemaDir, 'core/policy-bundles'));
  const authorizationService = new AuthorizationService(store);
  ctx = { store, validator, lintEngine, schemaRegistry: registry, policyBundleService, repoAdapter, uiSpecLoader, authorizationService, workspaceRoot: root, recordsDir: root, schemaDir } as unknown as AppContext;
  service = new FormDraftService(ctx, 'USR-CHAIN-LIVE');
}, 60000);

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

/** The verbatim live emission (compile-response-A1.json normalizedIntent.payload
 *  minus the compiler-injected requestId): prepared {name, volume} with NO
 *  sourceSpecRef; 1 consumed + 9 stored aliquots each occurredAtStatus
 *  'approximate' + approximation 'today' with NO occurredAt; attested posture
 *  occurredAtStatus 'approximate' + approximation 'yesterday' with NO occurredAt. */
function liveEmission(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    operation: 'compose-execute-chain',
    artifactKind: 'attestation-chain',
    prepared: { name: 'cell suspension', volume: { value: 1, unit: 'mL' } },
    aliquotCount: 10,
    aliquots: [
      { disposition: 'consumed', volume: { value: 100, unit: 'uL' }, occurredAtStatus: 'approximate', approximation: 'today' },
      ...Array.from({ length: 9 }, () => ({
        disposition: 'stored',
        volume: { value: 100, unit: 'uL' },
        storage: { temperature_C: -20, location: 'freezer' },
        occurredAtStatus: 'approximate',
        approximation: 'today',
      })),
    ],
    attested: { claimStatus: 'completed', occurredAtStatus: 'approximate', approximation: 'yesterday' },
    ...overrides,
  };
}

function diagnosticsText(draft: CompiledDraft): string {
  return draft.diagnostics.map(d => `${d.code ?? ''} ${d.message}`).join('\n');
}

async function seedSpec(recordId: string, name: string): Promise<void> {
  const envelope: RecordEnvelope = {
    recordId,
    schemaId: MATERIAL_SPEC_SCHEMA_ID,
    payload: {
      kind: 'material-spec', id: recordId, name,
      material_ref: { kind: 'ontology', id: 'CHEBI:48430', label: 'cell suspension medium', namespace: 'CHEBI' },
      formulation_kind: 'single_active',
    },
  };
  const created = await ctx.store.create({ envelope, skipValidation: true, skipLint: true });
  if (!created.success) throw new Error(`fixture seed failed (${recordId}): ${created.error}`);
}

describe('MATRES-CHAIN fix-run 4 D2 — the bare live emission compiles honestly (no fixture-only green)', () => {

  it('arm B (verbatim live payload, no matching spec): LEGITIMATELY BLOCKED with the named material gap, and the time pairing is NOT violated', async () => {
    const draft = await service.compile({ adapter: 'chain', intent: liveEmission() });
    const text = diagnosticsText(draft);
    expect(draft.canAccept).toBe(false);
    // The material gap is NAMED (the blocked wall must be diagnostic, g1d D3):
    expect(text).toContain('chain.prepared.sourceSpecRef');
    // The compiler never emits approximate-without-occurredAt, so the shipped
    // pairing wall never fires on the built envelope:
    expect(text).not.toContain('attestation-occurred-approximate-needs-approximation');
    // Nothing was staged:
    expect(draft.writes.length).toBe(0);
  }, 60000);

  it('arm A (exactly one material-spec names the prep): the compile BINDS it through the shipped tier-1 record provider and the draft is reviewable', async () => {
    await seedSpec(LIVE_SPEC_ID, 'cell suspension');
    const draft = await service.compile({ adapter: 'chain', intent: liveEmission() });
    const text = diagnosticsText(draft);
    expect(text).not.toContain('attestation-occurred-approximate-needs-approximation');
    expect(draft.canAccept).toBe(true);
    // The bound spec pins the read set (the pinned-source 409 rail):
    expect(Object.keys(draft.reads)).toContain(LIVE_SPEC_ID);
    // The staged instance carries the bound material_spec_ref:
    const instance = draft.writes.find(w => (object(w.payload).kind) === 'material-instance');
    expect(instance).toBeDefined();
    expect(refId(object(instance!.payload).material_spec_ref)).toBe(LIVE_SPEC_ID);
    // The stored envelope claims are terminal-clean: no claim carries
    // occurredAtStatus 'approximate' and no claim carries an approximation
    // field (the unknown-is-terminal wall).
    const envelope = object(object(draft.result).envelope);
    const claims = Array.isArray(envelope.claims) ? (envelope.claims as Record<string, unknown>[]) : [];
    expect(claims.length).toBe(11);
    for (const claim of claims) {
      expect(claim.occurredAtStatus).toBe('unknown');
      expect(claim.approximation).toBeUndefined();
      expect(claim.occurredAt).toBeUndefined();
    }
    // The card document retains the human approximation NOTES (display only):
    const card = object(object(draft.result).card);
    const cardClaims = Array.isArray(card.claims) ? (card.claims as Record<string, unknown>[]) : [];
    expect(cardClaims[0]?.occurredAtStatus).toBe('unknown');
    expect(cardClaims[0]?.approximation).toBe('yesterday');
    expect(cardClaims[1]?.approximation).toBe('today');
  }, 60000);

  it('arm C (two distinct material-specs match): AMBIGUOUS is NOT resolvable — named diagnostic, blocked, never a guess', async () => {
    await seedSpec(LIVE_SPEC_ID_2, 'cell suspension buffer');
    const draft = await service.compile({ adapter: 'chain', intent: liveEmission({ prepared: { name: 'cell suspension', volume: { value: 1, unit: 'mL' } } }) });
    const text = diagnosticsText(draft);
    expect(draft.canAccept).toBe(false);
    expect(text).toContain('chain.prepared.sourceSpecRef');
    expect(text).toContain('ambiguous');
    expect(text).not.toContain('attestation-occurred-approximate-needs-approximation');
  }, 60000);

  it('arm D (direct compile of the refused emission): the card document is BUILT and its claims render the downgraded unknown with the retained note', async () => {
    const compiled = await compileExecuteChainIntent(liveEmission({ prepared: { name: 'unresolvable mystery prep', volume: { value: 1, unit: 'mL' } } }), chainDepsFromContext(ctx));
    expect(compiled.ok).toBe(false);
    expect(compiled.diagnostics.some(d => d.includes('chain.prepared.sourceSpecRef'))).toBe(true);
    expect(compiled.diagnostics.some(d => d.includes('attestation-occurred-approximate-needs-approximation'))).toBe(false);
    const card = compiled.card!;
    expect(card.artifactKind).toBe('attestation-chain');
    expect(card.claims[0]!.occurredAtStatus).toBe('unknown');
    expect(card.claims[0]!.approximation).toBe('yesterday');
    expect(card.claims[1]!.approximation).toBe('today');
    // The stored claims (the linted envelope) stay terminal-clean:
    const envelopeClaims = Array.isArray(object(compiled.envelope).claims) ? (object(compiled.envelope).claims as Record<string, unknown>[]) : [];
    for (const claim of envelopeClaims) {
      expect(claim.occurredAtStatus).toBe('unknown');
      expect(claim.approximation).toBeUndefined();
    }
  }, 60000);
});

function refId(ref: unknown): string {
  const r = object(ref);
  return typeof r.id === 'string' ? r.id : '';
}
