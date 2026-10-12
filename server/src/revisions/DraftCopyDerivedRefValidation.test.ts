/**
 * QMS-6C — `derivedFromRevisionRef` must be declared on BOTH draft-copyable
 * leaf schemas and typed against the revision-ref datatype (architect decision
 * B: .hermes/plans/2026-10-04_lane1-draftcopy-derivedFromRevisionRef-decision.md).
 *
 * Why this test exists: `POST /api/records/:id/draft-copy` (RecordHandlers.ts
 * draftCopy) injects `derivedFromRevisionRef: revisionRef(...)` into the new
 * payload and creates it through the REAL store, which validates against
 * schema/ with `unevaluatedProperties: false` on the leaves. The existing
 * revision-route tests use the in-memory `memoryStore()` fixture, which skips
 * AJV entirely — that is exactly how this defect passed two gates. This test
 * therefore wires the REAL validation path the same way `server.ts` does:
 * loadAllSchemas(schema/) → SchemaRegistry (topological order) → AjvValidator
 * → createRecordStore(...). No `skipValidation` anywhere.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { join } from 'node:path';
import { mkdir, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { randomUUID } from 'node:crypto';

import { loadAllSchemas } from '../schema/SchemaLoader.js';
import { createSchemaRegistry } from '../schema/SchemaRegistry.js';
import { createValidator, AjvValidator } from '../validation/AjvValidator.js';
import { createLintEngine } from '../lint/LintEngine.js';
import { loadAllLintSpecs } from '../lint/LintSpecLoader.js';
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore, RecordStoreImpl } from '../store/RecordStoreImpl.js';
import { revisionRef, REVISION_SCHEMA } from './RecordRevisionService.js';

// Repo root from server/src/revisions/ (same convention as localProtocolSchema.fixtures.ts).
const REPO_ROOT = join(new URL('.', import.meta.url).pathname, '..', '..', '..');
const SCHEMA_DIR = join(REPO_ROOT, 'schema');

const CONTROLLED_DOCUMENT_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/controlled-document.schema.yaml';
const PROTOCOL_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/protocol.schema.yaml';

/** A well-formed revision ref, exactly as RecordRevisionService.revisionRef() emits. */
const GOOD_REF = revisionRef(`REV-${'A1B2C3D4E5F6A7B8C9D0E1F2A3B4C5D6'}`);

function controlledDocumentPayload(derivedFromRevisionRef?: unknown): Record<string, unknown> {
  return {
    kind: 'controlled-document',
    id: 'DOC-QMS6C-VALIDATE',
    title: 'QMS-6C validation SOP',
    state: 'draft',
    lifecycleId: 'document-controlled-signing',
    docType: 'sop',
    ...(derivedFromRevisionRef !== undefined ? { derivedFromRevisionRef } : {}),
  };
}

function protocolPayload(derivedFromRevisionRef?: unknown): Record<string, unknown> {
  return {
    kind: 'protocol',
    recordId: 'PRT-QMS6C-VALIDATE',
    title: 'QMS-6C validation protocol',
    state: 'draft',
    steps: [{ stepId: 'record-observation', label: 'Record observation', ordinal: 1, kind: 'other', description: 'Observation step for the validation fixture.' }],
    ...(derivedFromRevisionRef !== undefined ? { derivedFromRevisionRef } : {}),
  };
}

describe('draft-copy lineage: derivedFromRevisionRef on the real AJV validation path (QMS-6C)', () => {
  let store: RecordStoreImpl;
  let validator: AjvValidator;
  let testDir: string;

  beforeAll(async () => {
    // Same registry/validator wiring as server.ts bootstrap: schemas loaded
    // from schema/, added in dependency (topological) order.
    const loadResult = await loadAllSchemas({ basePath: SCHEMA_DIR, recursive: true });
    const registry = createSchemaRegistry();
    registry.addSchemas(loadResult.entries);

    validator = createValidator();
    for (const id of registry.getTopologicalOrder()) {
      const entry = registry.getById(id);
      if (entry) validator.addSchema(entry.schema, entry.id);
    }

    // Real lint specs (both kinds' specs declare zero rules; loading them keeps
    // the wiring faithful to the server bootstrap).
    const lintEngine = createLintEngine();
    const lintLoadResult = await loadAllLintSpecs({ basePath: SCHEMA_DIR, recursive: true });
    for (const { name, spec } of lintLoadResult.specs) {
      if (spec.rules.length > 0) lintEngine.addSpec(name, spec);
    }

    testDir = join(tmpdir(), `qms6c-${randomUUID()}`);
    await mkdir(testDir, { recursive: true });
    const repo = createLocalRepoAdapter({ basePath: testDir });
    store = createRecordStore(repo, validator, lintEngine);
  });

  afterAll(async () => {
    await rm(testDir, { recursive: true, force: true });
  });

  it('sanity: the schemas and the revision-ref datatype are loaded from schema/', () => {
    expect(validator.hasSchema(CONTROLLED_DOCUMENT_SCHEMA_ID)).toBe(true);
    expect(validator.hasSchema(PROTOCOL_SCHEMA_ID)).toBe(true);
    expect(validator.hasSchema('https://computable-lab.com/schema/computable-lab/datatypes/revision-ref.schema.yaml')).toBe(true);
    expect(validator.hasSchema(REVISION_SCHEMA)).toBe(true);
  });

  it('controlled-document: validate() accepts a well-formed derivedFromRevisionRef', async () => {
    const result = await store.validate({
      recordId: 'DOC-QMS6C-VALIDATE',
      schemaId: CONTROLLED_DOCUMENT_SCHEMA_ID,
      payload: controlledDocumentPayload(GOOD_REF),
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('protocol: validate() accepts a well-formed derivedFromRevisionRef', async () => {
    const result = await store.validate({
      recordId: 'PRT-QMS6C-VALIDATE',
      schemaId: PROTOCOL_SCHEMA_ID,
      payload: protocolPayload(GOOD_REF),
    });
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
  });

  it('controlled-document: store.create() (no skipValidation) accepts the lineage ref', async () => {
    const result = await store.create({
      envelope: {
        recordId: 'DOC-QMS6C-VALIDATE',
        schemaId: CONTROLLED_DOCUMENT_SCHEMA_ID,
        payload: controlledDocumentPayload(GOOD_REF),
      },
      message: 'QMS-6C draft-copy lineage probe',
    });
    expect(result.error ?? '').toBe('');
    expect(result.success).toBe(true);
    expect((result.envelope?.payload as Record<string, unknown>).derivedFromRevisionRef).toEqual(GOOD_REF);
  });

  it('protocol: store.create() (no skipValidation) accepts the lineage ref', async () => {
    const result = await store.create({
      envelope: {
        recordId: 'PRT-QMS6C-VALIDATE',
        schemaId: PROTOCOL_SCHEMA_ID,
        payload: protocolPayload(GOOD_REF),
      },
      message: 'QMS-6C draft-copy lineage probe',
    });
    expect(result.error ?? '').toBe('');
    expect(result.success).toBe(true);
    expect((result.envelope?.payload as Record<string, unknown>).derivedFromRevisionRef).toEqual(GOOD_REF);
  });

  it('controlled-document: a MALFORMED ref (id violates ^REV-[A-F0-9]+$) is REJECTED — the declaration is typed, not a free pass', async () => {
    const result = await store.validate({
      recordId: 'DOC-QMS6C-VALIDATE',
      schemaId: CONTROLLED_DOCUMENT_SCHEMA_ID,
      payload: controlledDocumentPayload({ kind: 'record', type: 'record-revision', id: 'rev-not-a-revision-id' }),
    });
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result.errors)).toContain('REV-');
  });

  it('protocol: a MALFORMED ref (id violates ^REV-[A-F0-9]+$) is REJECTED', async () => {
    const result = await store.validate({
      recordId: 'PRT-QMS6C-VALIDATE',
      schemaId: PROTOCOL_SCHEMA_ID,
      payload: protocolPayload({ kind: 'record', type: 'record-revision', id: 'rev-not-a-revision-id' }),
    });
    expect(result.valid).toBe(false);
    expect(JSON.stringify(result.errors)).toContain('REV-');
  });

  it('protocol: a ref with the wrong type discriminator is REJECTED (revision-ref datatype is enforced)', async () => {
    const result = await store.validate({
      recordId: 'PRT-QMS6C-VALIDATE',
      schemaId: PROTOCOL_SCHEMA_ID,
      payload: protocolPayload({ kind: 'record', type: 'protocol', id: GOOD_REF.id }),
    });
    expect(result.valid).toBe(false);
  });

  it('normal creates stay valid WITHOUT the optional ref (declaration did not move it into required:)', async () => {
    const withRef = await store.validate({
      recordId: 'DOC-QMS6C-NO-REF',
      schemaId: CONTROLLED_DOCUMENT_SCHEMA_ID,
      payload: controlledDocumentPayload(),
    });
    expect(withRef.valid).toBe(true);
  });
});
