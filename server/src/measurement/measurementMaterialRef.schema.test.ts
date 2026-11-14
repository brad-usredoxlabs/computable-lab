/**
 * L2-RUN-ATTACH-CAPABILITY-1 / u1schemafield — declare the OPTIONAL materialRef
 * property on the TWO carriers (measurement + acquisition-package) + UI triplets.
 *
 * RUN-IS-THE-PROVENANCE-RECORD: "a run records biological truth; acquisitions
 * attach to it" — the door must bind "the measurement record ... AND the named
 * material". The two later legs (u1matbind, u1acqmaterial) BLOCKED solely
 * because `materialRef` is undeclared while `unevaluatedProperties: false`
 * closes the payload. This unit removes exactly that blocker: ONE YAML seam per
 * carrier + a schema-shape test. NO TypeScript behavior change.
 *
 * Harness: real initializeApp booted against the REAL schema tree
 * (schemaDir '../schema') so the REAL measurement.schema.yaml /
 * acquisition-package.schema.yaml — the files that declare (or, RED, do NOT
 * declare) materialRef — are the schemas the interpreter reads. A reduced tmp
 * schema would prove only the call site, not the declared contract.
 * CONFIG_PATH is pinned to a throwaway /tmp dataDir (W25 precedent) so nothing
 * durable is minted: assertions are on validity / error SHAPE, never minted ids.
 *
 * THREE pinned cases:
 *   (a) minimal measurement payload + materialRef {kind:'record',
 *       type:'material'} -> store create VALID (success:true, validation.valid).
 *   (b) same payload + materialRef pinned type:'equipment' -> REJECTED: the
 *       enum is REAL (an enum error at /materialRef/type), not a free ref.
 *   (c) an acquisition-package payload (the committed valid package shape) +
 *       materialRef plain record ref -> VALID at the validator level, exactly
 *       as acquisitionPackage.test.ts validates the package payload
 *       (ctx.validator.validate(payload, ACQP_SCHEMA)). The store harness for a
 *       package is too heavy (it needs a real NAS .D mount + the registration
 *       service), so (c) pins at the validator per the brief's fallback.
 *
 * RED posture (before the YAML edits): the schema lacks materialRef, so
 * `unevaluatedProperties: false` rejects (a) and (c) (success:false / valid:
 * false) and (b) rejects with a UNEVALUATED error rather than an enum error —
 * all three assertions fail. GREEN flips only when the YAML declares the field.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { mkdir, rm, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import { initializeApp } from '../server.js';
import type { AppContext } from '../server.js';

const MEASUREMENT_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/measurement.schema.yaml';
const ACQP_SCHEMA_ID =
  'https://computable-lab.com/schema/computable-lab/acquisition-package.schema.yaml';

const testDir = resolve(process.cwd(), 'tmp/measurement-materialref-schema');
// Local disk (not the NFS worktree): the embedded-git store seeds records/seed
// into a fresh dataDir; git commits on NFS are too slow for the hook budget.
const dataDir = resolve('/tmp', 'cl-rac1u1-matref-data');

let ctx: AppContext;

/** The minimal shape-valid measurement payload (required: kind/recordId/title/assayType). */
function measurementPayload(recordId: string): Record<string, unknown> {
  return {
    kind: 'measurement',
    recordId,
    title: 'materialRef probe',
    assayType: 'other',
  };
}

/** The committed valid acquisition-package shape (AcquisitionPackageSchemas.test.ts). */
const validPackage: Record<string, unknown> = {
  kind: 'acquisition-package',
  id: 'ACQP-2026-RES35077-4',
  title: 'RES35077-4 acquisition package (signal collection)',
  storageDeviceId: 'nas0',
  directoryKey: 'machine1/RES35077-4.D',
  files: [
    {
      relativePath: 'FID1A.CH',
      dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000001' },
      role: 'signal_channel',
    },
    {
      relativePath: 'SAMPLE.XML',
      dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000002' },
      role: 'sample_metadata',
    },
    {
      relativePath: 'RUN.LOG',
      dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000003' },
      role: 'run_log',
    },
    {
      relativePath: 'ACQRES.REG',
      dataReferenceRef: { kind: 'record', type: 'data-reference', id: 'DREF-000004' },
      role: 'uninterpreted',
    },
  ],
  signalCollectionRef: { kind: 'record', type: 'data-reference', id: 'DREF-000009' },
  lifecycleId: 'registry-ops',
  state: 'draft',
};

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  // Isolation: pin CONFIG_PATH to a throwaway config so every minted record
  // lands under /tmp and dies in afterAll (no durable-counter drift).
  await mkdir(testDir, { recursive: true });
  await writeFile(
    resolve(testDir, 'config.yaml'),
    [
      'server:',
      '  logLevel: error',
      '  dataDir: ' + dataDir,
      '  workspaceDir: ' + dataDir + '/workspaces',
      'repositories: []',
      'logging: { level: error }',
      'extraction: { enabled: false, runner: { enabled: false } }',
    ].join('\n') + '\n',
  );
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');

  // Boot against the REAL schema tree: the REAL measurement.schema.yaml and
  // acquisition-package.schema.yaml are the schemas the validator reads.
  ctx = await initializeApp(process.cwd(), {
    schemaDir: '../schema',
    recordsDir: 'records',
    logLevel: 'silent',
  });
}, 600000);

afterAll(async () => {
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

describe('L2-RUN-ATTACH-CAPABILITY-1 u1schemafield: materialRef declared on both carriers', () => {
  it('(a) a measurement carrying materialRef {kind:record, type:material} is store-create VALID (the field is declared, not closed by unevaluatedProperties)', async () => {
    const payload = {
      ...measurementPayload('MSR-MATREF-A'),
      materialRef: { kind: 'record', id: 'MAT-TEST-1', type: 'material' },
    };
    const result = await ctx.store.create({
      envelope: { recordId: 'MSR-MATREF-A', schemaId: MEASUREMENT_SCHEMA_ID, payload },
      message: 'u1schemafield materialRef probe (a)',
    });
    expect(result.success, `materialRef {type:material} must validate: ${result.error ?? ''} ${JSON.stringify(result.validation?.errors ?? [])}`).toBe(true);
    expect(result.validation?.valid).toBe(true);
    // Read back: the store persists the declared slot verbatim.
    const envelope = await ctx.store.get('MSR-MATREF-A');
    expect(envelope).not.toBeNull();
    expect((envelope!.payload as { materialRef?: { id?: string; type?: string } }).materialRef?.id).toBe('MAT-TEST-1');
    expect((envelope!.payload as { materialRef?: { id?: string; type?: string } }).materialRef?.type).toBe('material');
  });

  it('(b) the same slot pinned to type:equipment is REJECTED with a real enum error at /materialRef/type (not a free ref)', async () => {
    const payload = {
      ...measurementPayload('MSR-MATREF-B'),
      materialRef: { kind: 'record', id: 'MAT-TEST-1', type: 'equipment' },
    };
    const result = await ctx.store.create({
      envelope: { recordId: 'MSR-MATREF-B', schemaId: MEASUREMENT_SCHEMA_ID, payload },
      message: 'u1schemafield materialRef probe (b)',
    });
    expect(result.success, 'materialRef pinned type:equipment must be rejected').toBe(false);
    // The rejection is the ENUM, not the closed payload: a free ref would accept any type.
    const enumError = result.validation?.errors?.find(
      (e) => e.keyword === 'enum' && e.path === '/materialRef/type',
    );
    expect(enumError, `expected an enum rejection at /materialRef/type, got: ${JSON.stringify(result.validation?.errors ?? [])}`).toBeDefined();
  });

  it('(c) an acquisition-package carrying a plain record materialRef is VALID at the validator level (package-level ref stays a plain record ref)', () => {
    const payload = {
      ...validPackage,
      materialRef: { kind: 'record', id: 'MAT-ACQP-1', type: 'material' },
    };
    // The store harness for a package needs a real NAS .D mount + the
    // registration service; pin at the validator level exactly as
    // acquisitionPackage.test.ts validates the package payload.
    const ok = ctx.validator.validate(payload, ACQP_SCHEMA_ID);
    expect(ok.valid, `package materialRef must validate: ${JSON.stringify(ok.errors ?? [])}`).toBe(true);
    expect(ok.errors ?? []).toEqual([]);
  });
});
