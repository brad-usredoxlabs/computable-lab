/**
 * MATRES-FULFIL §10 AC-F1 + schema/lint contract tests (FIRST TARGETED CHECK).
 *
 * RED-first: written BEFORE the schema slots and lint rules exist. Harness
 * mirrors MaterialReceivingSchemas.test.ts / AttestationSchemas.test.ts (the
 * on-trunk triplet precedents): registry loads the schema set, Ajv is the
 * structural authority, LintEngine is the business-rule authority.
 *
 * Business rules live in lint YAML (bait 4): this file asserts the DATA
 * contract only — no TS-side policy branches.
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { parse as parseYaml } from 'yaml';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { LintEngine } from '../lint/LintEngine.js';

const BASE = 'https://computable-lab.com/schema/computable-lab';
const ADD_MATERIAL_SCHEMA_ID = `${BASE}/workflow/events/plate-event.add-material.schema.yaml`;
const ATTESTATION_SCHEMA_ID = `${BASE}/attestation.schema.yaml`;

const schemaDir = fileURLToPath(new URL('../../../schema', import.meta.url));

// ONE corpus load per file (NFS precedent: MaterialReceivingSchemas.test.ts:31-33).
let corpusPromise: Promise<{ registry: ReturnType<typeof createSchemaRegistry>; validator: ReturnType<typeof createValidator>; lintEngine: LintEngine }> | null = null;

function loadCorpus() {
  if (!corpusPromise) {
    corpusPromise = (async () => {
      const registry = createSchemaRegistry();
      const loaded = await loadAllSchemas({ basePath: schemaDir, recursive: true });
      expect(loaded.errors.map(e => `${e.path}: ${e.error}`)).toEqual([]);
      registry.addSchemas(loaded.entries);
      const validator = createValidator();
      for (const id of registry.getTopologicalOrder()) {
        const entry = registry.getById(id);
        if (entry) validator.addSchema(entry.schema, id);
      }
      const lintEngine = new LintEngine();
      const lintLoad = await loadAllLintSpecs({ basePath: schemaDir, recursive: true });
      expect(lintLoad.errors.filter(e => /add-material|attestation/.test(e.path))).toEqual([]);
      for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
      return { registry, validator, lintEngine };
    })();
  }
  return corpusPromise;
}

const ref = (id: string, type: string) => ({ kind: 'record', id, type });

/** An existing-shape add_material detail (no new slots) — must stay byte-valid. */
function legacyDetail(): Record<string, unknown> {
  return {
    wells: ['A1'],
    material_spec_ref: ref('MSP-FEN-1MM', 'material-spec'),
    material_source_requirement: {
      status: 'unresolved',
      material_spec_ref: ref('MSP-FEN-1MM', 'material-spec'),
      reason: 'No explicit material instance, aliquot, or source lot selected during drafting.',
    },
  };
}

/** A detail carrying the new slots (requirementId + requestedSource). */
function extendedDetail(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    wells: ['A1'],
    material_spec_ref: ref('MSP-FEN-1MM', 'material-spec'),
    material_source_requirement: {
      status: 'unresolved',
      material_spec_ref: ref('MSP-FEN-1MM', 'material-spec'),
      reason: 'Source lot not yet selected.',
      requirementId: 'REQE-evg-m3-event-1-9f3a',
      requestedSource: ref('ALQ-PROPOSED-1', 'aliquot'),
      ...overrides,
    },
  };
}

const REQUIREMENT_ID = 'REQE-evg-m3-event-1-9f3a';

/** A legal fulfillment claim envelope (pre-accept: no attestedAt). */
function fulfillmentEnvelope(claimOverrides: Record<string, unknown> = {}, envelopeOverrides: Record<string, unknown> = {}): Record<string, unknown> {
  const assertion = {
    verb: 'fulfills',
    about: { kind: 'record', type: 'event-requirement', id: REQUIREMENT_ID },
    fulfilledBy: 'derivation',
    evidence: ref('MDER-BATCH-7', 'material-derivation'),
    cites: 'MDER-BATCH-7',
    requirementIds: [REQUIREMENT_ID],
    componentRefs: ['MAT-GLU', 'MAT-NA'],
    evaluations: [{ requirementSlot: 'spec-identity', verdict: 'compatible', basis: ['spec-identity'] }],
    ...((claimOverrides.assertion as Record<string, unknown> | undefined) ?? {}),
  };
  // `assertion` is applied AFTER the overrides spread so a partial
  // claimOverrides.assertion MERGES into the base assertion instead of
  // replacing it wholesale.
  const claim = {
    claimStatus: 'completed',
    occurredAtStatus: 'unknown',
    ...claimOverrides,
    assertion,
  };
  return {
    kind: 'attestation',
    recordId: 'ATT-FULFIL-TEST-1',
    artifactKind: 'attestation-chain',
    claims: [claim],
    against: { eventGraphRef: ref('EVG-m3', 'event-graph'), graphRevision: 'sha-abc123' },
    ...envelopeOverrides,
  };
}

function ruleIds(violations: Array<{ ruleId: string }>): string[] {
  return violations.map(v => v.ruleId);
}

describe('AC-F1 audit pins (§6 (a)-(f), committed first)', () => {
  it('the requirement status enum stays the byte-set [unresolved, provided, linked] (D2/M1 enum-drift guard)', async () => {
    const raw = await readFile(`${schemaDir}/workflow/events/plate-event.add-material.schema.yaml`, 'utf8');
    const doc = parseYaml(raw) as { properties: { material_source_requirement: { properties: { status: { enum: string[] } } } } };
    expect(doc.properties.material_source_requirement.properties.status.enum).toEqual(['unresolved', 'provided', 'linked']);
  });

  it('requirementId and requestedSource are PRESENT and OPTIONAL on material_source_requirement', async () => {
    const raw = await readFile(`${schemaDir}/workflow/events/plate-event.add-material.schema.yaml`, 'utf8');
    const doc = parseYaml(raw) as { properties: { material_source_requirement: { properties: Record<string, unknown>; required: string[] } } };
    const msr = doc.properties.material_source_requirement;
    expect(msr.properties.requirementId).toBeDefined();
    expect(msr.properties.requestedSource).toBeDefined();
    expect(msr.required).toEqual(['status']);
  });

  it('every existing add_material fixture stays byte-valid (purely additive change)', async () => {
    const { validator } = await loadCorpus();
    const result = validator.validate(legacyDetail(), ADD_MATERIAL_SCHEMA_ID);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('requirementId ABSENT from schema/ and server/src/materials/ at audit time is superseded by the shipped slot (grep fence re-run in report)', async () => {
    const { registry } = await loadCorpus();
    expect(registry.getById(ADD_MATERIAL_SCHEMA_ID)).toBeDefined();
    expect(registry.getById(ATTESTATION_SCHEMA_ID)).toBeDefined();
  });
});

describe('add-material detail slots (D1/D3)', () => {
  it('requirementId + requestedSource validate on an unresolved requirement', async () => {
    const { validator } = await loadCorpus();
    const result = validator.validate(extendedDetail(), ADD_MATERIAL_SCHEMA_ID);
    expect(result.errors ?? []).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('the procurement REQ- family is REJECTED by the REQE- pattern (bait 3: one name, no two systems)', async () => {
    const { validator } = await loadCorpus();
    const result = validator.validate(extendedDetail({ requirementId: 'REQ-0001' }), ADD_MATERIAL_SCHEMA_ID);
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result.errors)).toContain('requirementId');
  });

  it('requestedSource rides the shared ref datatype (no new ref vocabulary)', async () => {
    const { validator } = await loadCorpus();
    const result = validator.validate(extendedDetail({ requestedSource: { kind: 'record', id: 'ALQ-1' } }), ADD_MATERIAL_SCHEMA_ID);
    // record refs require type (ref.schema.yaml allOf) — missing type must fail.
    expect(result.valid).toBe(false);
  });

  it('lint: requestedSource is legal under status unresolved|provided and ILLEGAL under linked (D2 legal-when table)', async () => {
    const { lintEngine } = await loadCorpus();
    const ok = lintEngine.lint(extendedDetail(), ADD_MATERIAL_SCHEMA_ID);
    expect(ruleIds(ok.violations.filter(v => v.severity === 'error'))).not.toContain('add-material-requested-source-status');
    const bad = extendedDetail({ status: 'linked' });
    const res = lintEngine.lint(bad, ADD_MATERIAL_SCHEMA_ID);
    expect(res.valid).toBe(false);
    expect(ruleIds(res.violations)).toContain('add-material-requested-source-status');
  });

  it('lint: a requirementId that violates the REQE- shape is named (belt over the schema pattern)', async () => {
    const { lintEngine } = await loadCorpus();
    const res = lintEngine.lint(extendedDetail({ requirementId: 'REQE-BAD ID!' }), ADD_MATERIAL_SCHEMA_ID);
    expect(res.valid).toBe(false);
    expect(ruleIds(res.violations)).toContain('add-material-requirement-id-shape');
  });
});

describe('fulfillment attestation-side rules (attestation.lint.yaml additions)', () => {
  it('a legal fulfilled-by-derivation attestation validates AND lints clean', async () => {
    const { validator, lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope();
    const validation = validator.validate(env, ATTESTATION_SCHEMA_ID);
    expect(validation.errors ?? []).toEqual([]);
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.violations.filter(v => v.severity === 'error').map(v => v.ruleId)).toEqual([]);
    expect(lint.valid).toBe(true);
  });

  it('existing attestation vocabulary is UNTOUCHED: a plain received-claim envelope carries ZERO fulfil-* violations', async () => {
    const { lintEngine } = await loadCorpus();
    const env = {
      kind: 'attestation', recordId: 'ATT-PLAIN-1', artifactKind: 'attestation-chain',
      claims: [{ claimStatus: 'completed', assertion: { verb: 'received', about: ref('MATI-1', 'material-instance') }, occurredAtStatus: 'known', occurredAt: '2026-10-19T08:00:00-04:00' }],
    };
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(ruleIds(lint.violations.filter(v => v.ruleId.startsWith('fulfil-')))).toEqual([]);
  });

  it('every fulfills claim requires the pinned plan (against.eventGraphRef OR against.plannedRunRef) — §7.4', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({}, { against: undefined });
    delete env.against;
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-claim-pin-required');
  });

  it('against.eventGraphRef pairs with graphRevision (reference-copy pinning, no live pointer)', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({}, { against: { eventGraphRef: ref('EVG-m3', 'event-graph') } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-pin-graph-revision');
  });

  it('about must name the requirement occurrence (kind record / type event-requirement / REQE- id) — bait 3 traceability', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ assertion: { about: ref('MINST-9', 'material-instance') } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-about-names-requirement');
  });

  it('about.id must equal the copied requirement.requirementId byte-for-byte (traceability pin)', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ assertion: { about: { kind: 'record', type: 'event-requirement', id: 'REQE-other-occurrence-0000' } } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-requirement-id-traceable');
  });

  it('fulfilledBy vocabulary is exactly [receipt, derivation, instance] (enum lives in lint data — D4 cost)', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ assertion: { fulfilledBy: 'custody' } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-fulfilledby-vocabulary');
  });

  it('FULFIL verbs are exactly [fulfills, re-evaluates-fulfillment] and never leak the scientist-intent union', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ assertion: { verb: 'fulfilled' } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-verb-vocabulary');
  });

  it('assertion.evidence is a ref-shaped object, never a bare string (§7.3)', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ assertion: { evidence: 'MDER-BATCH-7' } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-evidence-is-ref');
  });

  it('evaluation verdicts are declared vocabulary [compatible, mismatch, incomplete]', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ assertion: { evaluations: [{ verdict: 'probably-fine' }] } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-evaluations-declared');
  });

  it('componentRef (when present) must be a member of the copied requirement componentRefs (D3 anchor, F6 stance in report)', async () => {
    const { lintEngine } = await loadCorpus();
    const ok = fulfillmentEnvelope({ assertion: { componentRef: 'MAT-GLU' } });
    expect(lintEngine.lint(ok, ATTESTATION_SCHEMA_ID).valid).toBe(true);
    const bad = fulfillmentEnvelope({ assertion: { componentRef: 'MAT-NOT-IN-PLAN' } });
    const lint = lintEngine.lint(bad, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-componentref-in-requirement');
  });

  it('a re-evaluation MUST vary changedFacts: priorEvidenceRef + newEvidenceRef required (OQ-1 stance (a) protection)', async () => {
    const { lintEngine } = await loadCorpus();
    const reEval = fulfillmentEnvelope(
      { claimStatus: 'unknown', assertion: { verb: 're-evaluates-fulfillment', fulfilledBy: 'receipt', evaluations: [{ verdict: 'compatible', basis: ['vendor-product-identity'] }] } },
      { supersedes: { kind: 'record', type: 'attestation', id: 'ATT-PRIOR-1' }, correction: { claimTarget: { mode: 'same-entity-reattribute' }, changedFacts: { lot: 'LOT-2' } } },
    );
    const blocked = lintEngine.lint(reEval, ATTESTATION_SCHEMA_ID);
    expect(blocked.valid).toBe(false);
    expect(ruleIds(blocked.violations)).toContain('fulfil-reevaluation-changed-facts-must-vary');

    const varied = fulfillmentEnvelope(
      { claimStatus: 'unknown', assertion: { verb: 're-evaluates-fulfillment', fulfilledBy: 'receipt', evaluations: [{ verdict: 'compatible', basis: ['vendor-product-identity'] }] } },
      { supersedes: { kind: 'record', type: 'attestation', id: 'ATT-PRIOR-1' }, correction: { claimTarget: { mode: 'same-entity-reattribute' }, changedFacts: { lot: 'LOT-2', priorEvidenceRef: 'RECV-OLD', newEvidenceRef: 'RECV-NEW' } } },
    );
    const ok = lintEngine.lint(varied, ATTESTATION_SCHEMA_ID);
    expect(ok.violations.filter(v => v.severity === 'error').map(v => v.ruleId)).toEqual([]);
  });
});

describe('P8 trio (§10 5.12): INCOMPLETE is legal, mismatch blocks, never a silent pass', () => {
  it('completed claim + an incomplete verdict -> BLOCKED naming the rule', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ assertion: { evaluations: [{ verdict: 'incomplete', basis: ['vendor-product-identity'] }] } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-completed-needs-compatible-evaluations');
  });

  it('completed claim with NO evaluations declared -> BLOCKED (satisfaction must be declared, never assumed)', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ assertion: { evaluations: undefined } });
    delete (env.claims as Array<Record<string, unknown>>)[0].assertion.evaluations;
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.valid).toBe(false);
    expect(ruleIds(lint.violations)).toContain('fulfil-completed-needs-compatible-evaluations');
  });

  it('unknown claimStatus + incomplete verdict -> lint CLEAN (honest incompleteness is legal, Q5 analogue)', async () => {
    const { lintEngine } = await loadCorpus();
    const env = fulfillmentEnvelope({ claimStatus: 'unknown', assertion: { evaluations: [{ verdict: 'incomplete', basis: ['derivation-type'] }] } });
    const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
    expect(lint.violations.filter(v => v.severity === 'error').map(v => v.ruleId)).toEqual([]);
    expect(lint.valid).toBe(true);
  });

  it('ANY mismatch verdict blocks acceptance regardless of claimStatus (honest mismatch blocks, honest incompleteness does not)', async () => {
    const { lintEngine } = await loadCorpus();
    for (const claimStatus of ['completed', 'unknown']) {
      const env = fulfillmentEnvelope({ claimStatus, assertion: { evaluations: [{ verdict: 'mismatch', basis: ['vendor-product-identity'] }] } });
      const lint = lintEngine.lint(env, ATTESTATION_SCHEMA_ID);
      expect(lint.valid).toBe(false);
      expect(ruleIds(lint.violations)).toContain('fulfil-mismatch-blocks');
    }
  });
});
