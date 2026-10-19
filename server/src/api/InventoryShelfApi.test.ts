/**
 * MATRES-SHELF — boot-level proof that GET /api/inventory/shelf exists in the
 * REAL server (advc-MATRESSHELF-c1 Defect 1).
 *
 * The route-level suite (InventoryShelfHandlers.test.ts) injects the handler
 * itself into registerRoutes, so it cannot catch a missing routeOpts wiring
 * in server.ts. This suite boots the real factory path — initializeApp +
 * createServer (the same code startServer runs, including the routeOpts
 * assembly) — over a throwaway embedded-git fixture store, and injects
 * GET /api/inventory/shelf?term=DMSO. If server.ts's routeOpts does not pass
 * inventoryShelfHandlers, the route 404s and this suite fails.
 *
 * Harness copied from integration/W25DraftLifecyclePromotion.test.ts (the
 * green boot-style pattern at base): CONFIG_PATH pinned to a throwaway config
 * (dataDir on local /tmp, never the durable lane store), the REAL schema tree
 * via schemaDir '../schema', fixtures created through the REAL store (Ajv
 * validation + lint fire at the write wall), app.inject for the HTTP leg.
 *
 * P7 leak bait (advc c1 Defect 2, HTTP level): the seeded instance carries
 * status:'available' and the lot status:'reserved' — real enum values from
 * schema/lab/material-instance.schema.yaml:86-88 and
 * schema/lab/material-lot.schema.yaml:64-66. The serialized response must
 * contain neither word: proof the mounted route never passes payload through.
 */

import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { resolve } from 'node:path';
import { mkdir, writeFile, rm } from 'node:fs/promises';
import type { FastifyInstance } from 'fastify';
import { initializeApp, createServer } from '../server.js';
import type { AppContext } from '../server.js';

const SCHEMA = (name: string): string =>
  `https://computable-lab.com/schema/computable-lab/${name}.schema.yaml`;

const testDir = resolve(process.cwd(), 'tmp/inventory-shelf-api');
// Local disk (not the NFS worktree): the embedded-git store seeds records and
// git commits on NFS are too slow for the hook budget (same reason as
// W25DraftLifecyclePromotion). /tmp is intentional for a throwaway store.
const dataDir = resolve('/tmp', 'cl-inventory-shelf-api-data');

let ctx: AppContext;
let app: FastifyInstance;

beforeAll(async () => {
  await rm(testDir, { recursive: true, force: true });
  await rm(dataDir, { recursive: true, force: true });
  // CRITICAL isolation: pin CONFIG_PATH to a throwaway config so the boot
  // never touches the durable lane-2 data store and every fixture record
  // lands under the tmp embedded-git worktree, dying in afterAll.
  await mkdir(testDir, { recursive: true });
  await writeFile(resolve(testDir, 'config.yaml'), [
    'server:',
    '  logLevel: error',
    '  dataDir: ' + dataDir,
    '  workspaceDir: ' + dataDir + '/workspaces',
    'repositories: []',
    'logging: { level: error }',
    'extraction: { enabled: false, runner: { enabled: false } }',
  ].join('\n') + '\n');
  process.env.CONFIG_PATH = resolve(testDir, 'config.yaml');
  // Boot against the REAL schema tree (real registry + lint specs load).
  ctx = await initializeApp(process.cwd(), {
    schemaDir: '../schema',
    recordsDir: 'records',
    logLevel: 'silent',
  });
  app = await createServer(ctx, { logLevel: 'silent' });
  await app.ready();

  // Seed the join legs through the REAL store (validation + lint run).
  // NOTE: the repo's DMSO seed lives under the PLURAL records/seed/materials,
  // which the store does NOT auto-merge (RecordStoreImpl.ts:525 joins
  // seedDir + singular filter.kind; seedProtocols.ts:5-7 documents that only
  // singular kind dirs auto-merge). So the concept leg is created here too.
  const created = await Promise.all([
    ctx.store.create({
      envelope: {
        recordId: 'MAT-SHELF-DMSO-BOOT',
        schemaId: SCHEMA('material'),
        payload: {
          kind: 'material',
          id: 'MAT-SHELF-DMSO-BOOT',
          name: 'Dimethyl sulfoxide (DMSO), anhydrous',
          domain: 'chemical',
          synonyms: ['DMSO', 'dimethyl sulfoxide'],
        },
      },
      message: 'MATRES-SHELF boot fixture material concept',
    }),
    ctx.store.create({
      envelope: {
        recordId: 'VPR-SIGMA-D8642',
        schemaId: SCHEMA('vendor-product'),
        payload: {
          kind: 'vendor-product',
          id: 'VPR-SIGMA-D8642',
          name: 'Sigma D8642',
          vendor: 'Sigma-Aldrich',
          catalog_number: 'D8642',
          material_ref: { kind: 'record', type: 'material', id: 'MAT-SHELF-DMSO-BOOT' },
        },
      },
      message: 'MATRES-SHELF boot fixture vendor-product',
    }),
    ctx.store.create({
      envelope: {
        recordId: 'MINST-SIGMA-D8642',
        schemaId: SCHEMA('material-instance'),
        payload: {
          kind: 'material-instance',
          id: 'MINST-SIGMA-D8642',
          // No 'DMSO' anywhere in this payload: it can only surface through
          // the vendor_product_ref -> vendor-product -> material_ref join.
          name: 'Sigma D8642',
          vendor_product_ref: { kind: 'record', type: 'vendor-product', id: 'VPR-SIGMA-D8642' },
          // Schema-real status enum value (material-instance.schema.yaml:86-88).
          // P7 leak bait: must never surface in the shelf response.
          status: 'available',
        },
      },
      message: 'MATRES-SHELF boot fixture material-instance',
    }),
    ctx.store.create({
      envelope: {
        recordId: 'LOT-SHELF-DMSO-20260217',
        schemaId: SCHEMA('material-lot'),
        payload: {
          kind: 'material-lot',
          id: 'LOT-SHELF-DMSO-20260217',
          material_ref: { kind: 'record', type: 'material', id: 'MAT-SHELF-DMSO-BOOT' },
          lot_number: 'LOT-20260217-01',
          supplier: { name: 'Sigma-Aldrich', catalog_number: 'D8642', vendor_lot: 'SLCM4455' },
          // Schema-real status enum value (material-lot.schema.yaml:64-66).
          status: 'reserved',
        },
      },
      message: 'MATRES-SHELF boot fixture material-lot',
    }),
  ]);
  for (const r of created) {
    if (!r.success) {
      throw new Error(
        `shelf boot fixture create failed: ${r.error ?? 'unknown'} ` +
        JSON.stringify(r.validation?.errors ?? r.lint?.violations ?? ''),
      );
    }
  }
}, 600000);

afterAll(async () => {
  await app?.close();
  await rm(testDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  await rm(dataDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 500 });
  delete process.env.CONFIG_PATH;
});

describe('GET /api/inventory/shelf — real server boot (MATRES-SHELF Defect 1 proof)', () => {
  it('serves 200 with the grouped shelf report through the real routeOpts wiring', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/inventory/shelf?term=DMSO' });
    // 404 here means the route is registered in routes.ts but NOT mounted by
    // server.ts's routeOpts assembly — exactly the Defect 1 failure mode.
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.term).toBe('DMSO');
    // The concept leg resolved the fixture concept through the real store.
    expect(body.concepts.map((c: { recordId: string }) => c.recordId)).toContain('MAT-SHELF-DMSO-BOOT');
    const entries = body.groups.flatMap((g: { entries: unknown[] }) => g.entries) as {
      recordId: string; joinedVia: string; level: string; vendor?: string; lot?: string;
    }[];
    const bottle = entries.find((e) => e.recordId === 'MINST-SIGMA-D8642');
    expect(bottle).toBeDefined();
    expect(bottle!.joinedVia).toBe('vendor-product');
    expect(bottle!.level).toBe('instance');
    expect(bottle!.vendor).toBe('Sigma-Aldrich');
    const lot = entries.find((e) => e.recordId === 'LOT-SHELF-DMSO-20260217');
    expect(lot).toBeDefined();
    expect(lot!.joinedVia).toBe('direct-material-ref');
    expect(lot!.lot).toBe('SLCM4455');
    // Grouped by vendor/lot.
    expect(body.groups.some((g: { vendor?: string }) => g.vendor === 'Sigma-Aldrich')).toBe(true);
  }, 30000);

  it('P7: the serialized HTTP payload never leaks the seeded status enum values', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/inventory/shelf?term=DMSO' });
    expect(res.statusCode).toBe(200);
    const serialized = res.payload.toLowerCase();
    for (const banned of ['available', 'availability', 'reserved', 'sufficient']) {
      expect(serialized).not.toContain(banned);
    }
  }, 30000);

  it('no-match term returns 200 with an empty-but-shaped report', async () => {
    const res = await app.inject({ method: 'GET', url: '/api/inventory/shelf?term=zzz-no-such-thing' });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.term).toBe('zzz-no-such-thing');
    expect(body.concepts).toEqual([]);
    expect(body.groups).toEqual([]);
  }, 30000);
});
