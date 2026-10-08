/**
 * generateAssertionsAndEvidence must emit payloads the record store will
 * actually accept. Assertions produced by the literature claim-extraction
 * pipeline previously carried `scope: {}`, which fails assertion.schema.yaml
 * (scope is a string enum) — so every assertion was silently rejected at
 * POST /records while its claim and evidence still saved, leaving dangling
 * evidence_refs. This test pins the emitted shape against the real schemas.
 */

import { describe, expect, it, beforeAll } from 'vitest';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from '../../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../../schema/SchemaRegistry.js';
import { createValidator } from '../../validation/AjvValidator.js';
import { generateAssertionsAndEvidence } from './KnowledgeAIHandlers.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(__dirname, '..', '..', '..', '..');

const ASSERTION_SCHEMA = 'https://computable-lab.com/schema/computable-lab/assertion.schema.yaml';
const EVIDENCE_SCHEMA = 'https://computable-lab.com/schema/computable-lab/evidence.schema.yaml';

let validator: ReturnType<typeof createValidator>;

beforeAll(async () => {
  const loadResult = await loadAllSchemas({
    basePath: join(REPO_ROOT, 'schema'),
    recursive: true,
  });
  const registry = createSchemaRegistry();
  registry.addSchemas(loadResult.entries);
  validator = createValidator();
  for (const id of registry.getTopologicalOrder()) {
    const entry = registry.getById(id);
    if (entry) validator.addSchema(entry.schema, entry.id);
  }
});

const claim = {
  kind: 'claim' as const,
  id: 'CLM-clofibrate-ppara-agonist-b3c4',
  statement: 'Clofibrate is a synthetic agonist of PPARα.',
  subject: { kind: 'ontology', id: 'CHEBI:4444', namespace: 'CHEBI', label: 'clofibrate' },
  predicate: { kind: 'ontology', id: 'RO:0000057', namespace: 'RO', label: 'is agonist of' },
  object: { kind: 'ontology', id: 'UniProt:P25909', namespace: 'UniProt', label: 'PPARα' },
};

describe('generateAssertionsAndEvidence', () => {
  it('emits a claim-only assertion with scope "global"', () => {
    const { assertions } = generateAssertionsAndEvidence([claim], 'pubmed', '25888880', {
      title: 'Treatment of lactating sows with clofibrate',
    });

    expect(assertions).toHaveLength(1);
    expect((assertions[0] as Record<string, unknown>).scope).toBe('global');
  });

  it('emits assertions and evidence that validate against their schemas', () => {
    const { assertions, evidence } = generateAssertionsAndEvidence([claim], 'pubmed', '25888880', {
      title: 'Treatment of lactating sows with clofibrate',
    });

    const assertionResult = validator.validate(assertions[0], ASSERTION_SCHEMA);
    expect(assertionResult.errors).toEqual([]);
    expect(assertionResult.valid).toBe(true);

    const evidenceResult = validator.validate(evidence[0], EVIDENCE_SCHEMA);
    expect(evidenceResult.errors).toEqual([]);
    expect(evidenceResult.valid).toBe(true);
  });
});
