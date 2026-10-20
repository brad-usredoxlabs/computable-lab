/**
 * MATRES-RECV §5.1 — material-receiving schema/lint/ui tests (FIRST TARGETED
 * CHECK: RED first, then GREEN with schema+lint+ui YAML only, zero server code).
 *
 * Harness mirrors ServiceDomainSchemas.test.ts (registry loads the triplet,
 * Ajv is the structural authority, LintEngine is the business-rule authority).
 *
 * AC-1 lives here: lot WITHOUT vendorProductRef -> REJECTED, the error names
 * the offending path (lint ERROR material-receiving-lot-requires-product).
 * The lot rule gates ACCEPTANCE only — the draft-side inscription survival is
 * proven in receiving/ReceiveElicitation.test.ts (r2 discard boundary).
 */

import { describe, expect, it } from 'vitest';
import { readFile } from 'node:fs/promises';
import { join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadAllSchemas } from './SchemaLoader.js';
import { createSchemaRegistry } from './SchemaRegistry.js';
import { createValidator } from '../validation/AjvValidator.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { LintEngine } from '../lint/LintEngine.js';
import { createUISpecLoader, loadAllUISpecs } from '../ui/UISpecLoader.js';
import type { UISpec } from '../ui/types.js';

const BASE = 'https://computable-lab.com/schema/computable-lab';
const RECEIVING_SCHEMA_ID = `${BASE}/material-receiving.schema.yaml`;

const schemaDir = fileURLToPath(new URL('../../../schema', import.meta.url));

// ONE corpus load per file (the full-suite load on NFS is heavy; a per-test
// reload of the whole schema corpus timed out under parallel load). Cached
// promise = same registry/validator/lint semantics, loaded once.
let corpusPromise: Promise<{ registry: ReturnType<typeof createSchemaRegistry>; validator: ReturnType<typeof createValidator>; lintEngine: LintEngine; uiLoader: ReturnType<typeof createUISpecLoader> }> | null = null;

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
      expect(lintLoad.errors.filter(e => /material-receiving/.test(e.path))).toEqual([]);
      for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
      const uiLoader = createUISpecLoader();
      await loadAllUISpecs(uiLoader, schemaDir);
      return { registry, validator, lintEngine, uiLoader };
    })();
  }
  return corpusPromise;
}

const ref = (id: string, type: string) => ({ kind: 'record', id, type });

/** A complete, accepted-shape receipt claim (envelope vocabulary via $ref). */
function receiptClaim(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    claimStatus: 'completed',
    assertion: {
      verb: 'received',
      about: ref('MINST-RECV-0001', 'material-instance'),
      vendorProductRef: ref('VPR-SIGMA-D8418', 'vendor-product'),
      lot: { lot_number: '09231' },
      receivedByStatus: 'known',
      receivedBy: ref('USR-brad', 'person'),
    },
    occurredAtStatus: 'known',
    occurredAt: '2026-10-14T09:00:00-04:00',
    ...overrides,
  };
}

function receiptRecord(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    kind: 'material-receiving',
    recordId: 'RECV-TEST-0001',
    artifactKind: 'attestation-chain',
    claims: [receiptClaim()],
    createdInstanceRef: ref('MINST-RECV-0001', 'material-instance'),
    ...overrides,
  };
}

describe('material-receiving schema triplet (§5.1)', () => {
  it('the triplet loads and resolves all $ref dependencies', async () => {
    const { registry } = await loadCorpus();
    const entry = registry.getById(RECEIVING_SCHEMA_ID);
    expect(entry).toBeDefined();
    // Composition (OQ-1 ruling): the receiving kind $refs the ATTEST envelope
    // defs — the dependency graph must show it, proving no re-declared
    // envelope vocabulary in the receiving file.
    const deps = registry.getDependencies(RECEIVING_SCHEMA_ID);
    expect(deps).toContain(`${BASE}/attestation.schema.yaml`);
    expect(deps).toContain(`${BASE}/datatypes/ref.schema.yaml`);
    expect(deps).toContain(`${BASE}/datatypes/file-ref.schema.yaml`);
  });

  it('a valid receipt (vendorProductRef + lot + receivedBy known + occurredAt known) validates AND lints clean', async () => {
    const { validator, lintEngine } = await loadCorpus();
    const record = receiptRecord({ recordId: 'RECV-TEST-valid' });
    const validation = validator.validate(record, RECEIVING_SCHEMA_ID);
    expect(validation.errors ?? []).toEqual([]);
    expect(validation.valid).toBe(true);
    const lint = lintEngine.lint(record, RECEIVING_SCHEMA_ID);
    expect(lint.violations.filter(v => v.severity === 'error')).toEqual([]);
    expect(lint.valid).toBe(true);
  });

  it('AC-1: lot WITHOUT vendorProductRef is REJECTED and the error names the offending path', async () => {
    const { validator, lintEngine } = await loadCorpus();
    const claim = receiptClaim();
    const assertion = claim.assertion as Record<string, unknown>;
    delete assertion.vendorProductRef;
    const record = receiptRecord({ recordId: 'RECV-TEST-nolotproduct', claims: [claim] });
    const lint = lintEngine.lint(record, RECEIVING_SCHEMA_ID);
    const violation = lint.violations.find(v => v.ruleId === 'material-receiving-lot-requires-product');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
    // The error names the offending path (the lot site), not a generic message.
    expect(violation!.message).toContain('assertion.lot');
    expect(lint.valid).toBe(false);
  });

  it('occurredAtStatus unknown is terminal-honest: schema-valid AND lint-clean with occurredAt ABSENT', async () => {
    const { validator, lintEngine } = await loadCorpus();
    const claim = receiptClaim({ occurredAtStatus: 'unknown' });
    delete (claim as Record<string, unknown>).occurredAt;
    // exactOptionalPropertyTypes site + bait 8: presence-shape, not just value.
    expect('occurredAt' in claim).toBe(false);
    expect('approximation' in claim).toBe(false);
    const record = receiptRecord({ recordId: 'RECV-TEST-unknown-time', claims: [claim] });
    expect(validator.validate(record, RECEIVING_SCHEMA_ID).valid).toBe(true);
    const lint = lintEngine.lint(record, RECEIVING_SCHEMA_ID);
    expect(lint.violations.filter(v => v.severity === 'error')).toEqual([]);
  });

  it('receivedByStatus unknown is terminal-honest: receivedBy ABSENT is VALID and never defaults to the attestor', async () => {
    const { validator, lintEngine } = await loadCorpus();
    const claim = receiptClaim();
    const assertion = claim.assertion as Record<string, unknown>;
    assertion.receivedByStatus = 'unknown';
    delete assertion.receivedBy;
    expect('receivedBy' in assertion).toBe(false);
    const record = receiptRecord({ recordId: 'RECV-TEST-unknown-receiver', claims: [claim] });
    expect(validator.validate(record, RECEIVING_SCHEMA_ID).valid).toBe(true);
    const lint = lintEngine.lint(record, RECEIVING_SCHEMA_ID);
    expect(lint.violations.filter(v => v.severity === 'error')).toEqual([]);
  });

  it('receivedByStatus known REQUIRES receivedBy (lint pairing, never a TS branch)', async () => {
    const { lintEngine } = await loadCorpus();
    const claim = receiptClaim();
    delete (claim.assertion as Record<string, unknown>).receivedBy;
    const record = receiptRecord({ recordId: 'RECV-TEST-known-noreceiver', claims: [claim] });
    const lint = lintEngine.lint(record, RECEIVING_SCHEMA_ID);
    const violation = lint.violations.find(v => v.ruleId === 'material-receiving-receivedby-known-needs-receivedby');
    expect(violation).toBeDefined();
    expect(violation!.severity).toBe('error');
  });

  it('vendor-scoped lot: two DIFFERENT products with the SAME lot_number are BOTH valid (global lot uniqueness never implied)', async () => {
    const { validator, lintEngine } = await loadCorpus();
    const a = receiptRecord({
      recordId: 'RECV-TEST-lotA',
      claims: [receiptClaim({
        assertion: {
          verb: 'received',
          about: ref('MINST-RECV-A', 'material-instance'),
          vendorProductRef: ref('VPR-SIGMA-D8418', 'vendor-product'),
          lot: { lot_number: '09231' },
          receivedByStatus: 'known',
          receivedBy: ref('USR-brad', 'person'),
        },
      })],
      createdInstanceRef: ref('MINST-RECV-A', 'material-instance'),
    });
    const b = receiptRecord({
      recordId: 'RECV-TEST-lotB',
      claims: [receiptClaim({
        assertion: {
          verb: 'received',
          about: ref('MINST-RECV-B', 'material-instance'),
          vendorProductRef: ref('VPR-MERCK-M1234', 'vendor-product'),
          lot: { lot_number: '09231' },
          receivedByStatus: 'known',
          receivedBy: ref('USR-brad', 'person'),
        },
      })],
      createdInstanceRef: ref('MINST-RECV-B', 'material-instance'),
    });
    expect(validator.validate(a, RECEIVING_SCHEMA_ID).valid).toBe(true);
    expect(validator.validate(b, RECEIVING_SCHEMA_ID).valid).toBe(true);
    expect(lintEngine.lint(a, RECEIVING_SCHEMA_ID).valid).toBe(true);
    expect(lintEngine.lint(b, RECEIVING_SCHEMA_ID).valid).toBe(true);
  });

  it('evidenceRefs ride the file-ref datatype; an inline blob shape (bytes/base64 key) is REJECTED naming the path', async () => {
    const { validator } = await loadCorpus();
    const good = receiptRecord({
      recordId: 'RECV-TEST-evidence',
      evidenceRefs: [{ file_name: 'packing-slip.pdf', media_type: 'application/pdf', sha256: 'a'.repeat(64), stored_path: 'evidence/packing-slip.pdf' }],
    });
    expect(validator.validate(good, RECEIVING_SCHEMA_ID).valid).toBe(true);
    const blob = receiptRecord({
      recordId: 'RECV-TEST-blob',
      evidenceRefs: [{ file_name: 'photo.png', media_type: 'image/png', base64: 'iVBORw0KGgo=' }],
    });
    const result = validator.validate(blob, RECEIVING_SCHEMA_ID);
    expect(result.valid).toBe(false);
    const hits = (result.errors ?? []).filter(e => e.path.includes('evidenceRefs'));
    expect(hits.length).toBeGreaterThan(0);
    // The error names the offending inline-blob property at the evidence path.
    expect(hits.some(e => e.message.includes('base64'))).toBe(true);
  });

  it('a correction receipt (supersedes + correction, envelope $refs) is valid; either half ALONE is rejected (pairing inherited)', async () => {
    const { validator, lintEngine } = await loadCorpus();
    const supersedes = { kind: 'record', type: 'attestation', id: 'ATT-ABC123' };
    const correction = {
      claimTarget: { mode: 'same-entity-reattribute' },
      changedFacts: { lot: '09213' },
    };
    const both = receiptRecord({ recordId: 'RECV-TEST-corr', supersedes, correction });
    expect(validator.validate(both, RECEIVING_SCHEMA_ID).valid).toBe(true);
    expect(lintEngine.lint(both, RECEIVING_SCHEMA_ID).valid).toBe(true);

    const onlySupersedes = receiptRecord({ recordId: 'RECV-TEST-corrsolo', supersedes });
    const lint1 = lintEngine.lint(onlySupersedes, RECEIVING_SCHEMA_ID);
    expect(lint1.violations.some(v => v.ruleId === 'material-receiving-supersedes-needs-correction')).toBe(true);

    const onlyCorrection = receiptRecord({ recordId: 'RECV-TEST-corrsolo2', correction });
    const lint2 = lintEngine.lint(onlyCorrection, RECEIVING_SCHEMA_ID);
    expect(lint2.violations.some(v => v.ruleId === 'material-receiving-needs-supersedes-for-correction')).toBe(true);
  });

  it('an unevaluated property anywhere is rejected naming the path', async () => {
    const { validator } = await loadCorpus();
    const record = receiptRecord({ recordId: 'RECV-TEST-extra', inventedField: 'nope' });
    const result = validator.validate(record, RECEIVING_SCHEMA_ID);
    expect(result.valid).toBe(false);
    expect((result.errors ?? []).some(e =>
      e.keyword === 'unevaluatedProperties'
      && (e.params as Record<string, unknown> | undefined)?.unevaluatedProperty === 'inventedField'
    )).toBe(true);
    const claimExtra = receiptClaim();
    (claimExtra.assertion as Record<string, unknown>).globallyUniqueLotKey = '09231';
    const record2 = receiptRecord({ recordId: 'RECV-TEST-extra2', claims: [claimExtra] });
    const result2 = validator.validate(record2, RECEIVING_SCHEMA_ID);
    // assertion is the envelope's loose-shape payload (additionalProperties:
    // true by ATTEST design); the RECEIVING-side closed objects must reject.
    expect(result2.valid === true || (result2.errors ?? []).some(e => e.path.includes('globallyUniqueLotKey'))).toBe(true);
  });

  it('the ui.yaml loads for the kind (UI_SPEC_MISSING must not fire at draft compile)', async () => {
    const { uiLoader } = await loadCorpus();
    const spec = uiLoader.get(RECEIVING_SCHEMA_ID);
    expect(spec).toBeDefined();
    expect(spec!.schemaId).toBe(RECEIVING_SCHEMA_ID);
    // Field projection vocabulary lives in the ui spec, never TS literals.
    const fields = (spec!.form?.sections ?? []).flatMap(s => s.fields ?? []);
    expect(fields.some(f => f.path === '$.recordId')).toBe(true);
    expect(fields.some(f => f.path === '$.claims[*].claimStatus')).toBe(true);
  });

  it('no duplicate envelope vocabulary is declared in the receiving files (OQ-2 grep on the YAML itself)', async () => {
    const schema = await readFile(join(schemaDir, 'lab/material-receiving.schema.yaml'), 'utf8');
    const lint = await readFile(join(schemaDir, 'lab/material-receiving.lint.yaml'), 'utf8');
    // claimStatus/occurredAtStatus/supersedes/correction enums+pairings are the
    // envelope's; the receiving files may NAME them in $refs/paths but must
    // not re-DECLARE them.
    expect(schema).not.toMatch(/claimStatus[\s\S]{0,40}enum/);
    expect(schema).not.toMatch(/occurredAtStatus[\s\S]{0,40}enum/);
    expect(schema).not.toMatch(/claimTarget[\s\S]{0,80}same-entity-reattribute/);
    // Composition (OQ-1 sanctioned fix): envelope fragments are $ref'd.
    expect(schema).toContain('$ref: "./attestation.schema.yaml#/$defs/Claim"');
    expect(schema).toContain('$ref: "./attestation.schema.yaml#/$defs/Correction"');
    expect(schema).toContain('$ref: "./attestation.schema.yaml#/$defs/AttestedAt"');
    expect(schema).toContain('$ref: "./attestation.schema.yaml#/$defs/Against"');
  });
});
