/**
 * MATRES-ATTEST §5.4 — the append-only wall over the `attestation` kind.
 *
 * Proves the wall is the GENERIC DATA KNOB (DEFAULT_CONFIG.server.appendOnlyKinds
 * + the existing generic wall at RecordStoreImpl.ts:273/:957), NOT a new
 * mechanism: a NON-attestation control record still updates in the same store.
 * Mirrors the append-only arms in RecordStore.test.ts / W25CandidateImmutability.test.ts.
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
import { createLocalRepoAdapter } from '../repo/LocalRepoAdapter.js';
import { createRecordStore } from '../store/RecordStoreImpl.js';
import { DEFAULT_CONFIG } from '../config/types.js';
import { token } from '../revisions/RecordRevisionService.js';
import { ATTESTATION_SCHEMA_ID } from '../attestation/AttestationAcceptService.js';
import type { RecordStore } from '../store/types.js';

let store: RecordStore;
let root: string;

beforeAll(async () => {
  root = await mkdtemp(join(tmpdir(), 'cl-attest-wall-'));
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
  expect(lintLoad.errors.filter(e => /attestation/.test(e.path))).toEqual([]);
  for (const { name, spec } of lintLoad.specs) lintEngine.addSpec(name, spec);
  // Same injection server.ts:532 performs: the knob value comes from DEFAULT_CONFIG.
  store = createRecordStore(createLocalRepoAdapter({ basePath: root }), validator, lintEngine, {
    appendOnlyKinds: DEFAULT_CONFIG.server.appendOnlyKinds ?? [],
  });
}, 30000);

afterAll(async () => { if (root) await rm(root, { recursive: true, force: true }); });

const attestationPayload = () => ({
  kind: 'attestation',
  recordId: 'ATT-WALL-0001',
  artifactKind: 'attestation-chain',
  attestedAt: '2026-10-19T14:00:00Z',
  claims: [{
    claimStatus: 'completed',
    assertion: { verb: 'received', about: { kind: 'record', type: 'material-instance', id: 'MATI-000123' } },
    occurredAtStatus: 'known',
    occurredAt: '2026-10-19T08:00:00-04:00',
  }],
});

describe('append-only wall over attestation records (§2b data knob)', () => {
  it('the knob names attestation (data entry, not a TS branch)', () => {
    expect(DEFAULT_CONFIG.server.appendOnlyKinds).toContain('attestation');
  });

  it('update on a stored attestation is refused with the generic APPEND_ONLY error', async () => {
    const created = await store.create({
      envelope: { recordId: 'ATT-WALL-0001', schemaId: ATTESTATION_SCHEMA_ID, payload: attestationPayload() },
    });
    expect(created.success).toBe(true);
    const stored = (await store.get('ATT-WALL-0001'))!;

    const tampered = { ...attestationPayload(), claims: [{ ...(attestationPayload().claims[0]!), claimStatus: 'unknown' }] };
    const result = await store.update({
      envelope: { ...stored, payload: tampered },
      ...(token(stored) !== undefined ? { expectedSha: token(stored)! } : {}),
    });
    expect(result.success).toBe(false);
    expect(result.error).toBe('APPEND_ONLY: immutable records cannot be updated');
  });

  it('delete on a stored attestation is refused with the generic APPEND_ONLY error', async () => {
    const result = await store.delete({ recordId: 'ATT-WALL-0001' });
    expect(result.success).toBe(false);
    expect(result.error).toBe('APPEND_ONLY: immutable records cannot be deleted');
    // Still there, byte-intact.
    expect(await store.get('ATT-WALL-0001')).not.toBeNull();
  });

  it('a NON-attestation control record still updates (proves the wall is the generic knob, not a new mechanism)', async () => {
    const control = {
      kind: 'labware',
      recordId: 'LBW-WALL-0001',
      name: 'Control plate',
      labwareType: 'plate',
    };
    const created = await store.create({
      envelope: { recordId: 'LBW-WALL-0001', schemaId: 'https://computable-lab.com/schema/computable-lab/labware.schema.yaml', payload: control },
    });
    expect(created.success).toBe(true);
    const stored = (await store.get('LBW-WALL-0001'))!;
    const result = await store.update({
      envelope: { ...stored, payload: { ...control, name: 'Control plate (edited)' } },
      ...(token(stored) !== undefined ? { expectedSha: token(stored)! } : {}),
    });
    expect(result.success).toBe(true);
    const deleted = await store.delete({ recordId: 'LBW-WALL-0001' });
    expect(deleted.success).toBe(true);
  });
});
