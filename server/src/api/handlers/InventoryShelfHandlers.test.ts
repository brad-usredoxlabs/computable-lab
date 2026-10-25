/**
 * MATRES-SHELF acceptance F — route-level tests for GET /inventory/shelf.
 *
 * Runs the REAL registration path (registerRoutes from server/src/api/routes.ts)
 * with the real InventoryShelfHandlers over the shelf fixture store, mirroring
 * the LabSettingsHandlers.routes.test.ts harness pattern (stub the mandatory
 * handler options, mount the optional handler under test).
 */

import { describe, expect, it } from 'vitest';
import Fastify from 'fastify';
import type { RecordEnvelope, RecordStore } from '../../store/types.js';
import { registerRoutes } from '../routes.js';
import { createInventoryShelfHandlers } from './InventoryShelfHandlers.js';

const SCHEMA = (name: string): string =>
  `https://computable-lab.com/schema/computable-lab/${name}.schema.yaml`;

function fixtureRecords(): RecordEnvelope[] {
  return [
    {
      recordId: 'mat-seed-dmso-anhydrous',
      schemaId: SCHEMA('material'),
      payload: {
        kind: 'material',
        id: 'mat-seed-dmso-anhydrous',
        name: 'Dimethyl sulfoxide (DMSO), anhydrous',
        synonyms: ['DMSO'],
      },
    },
    {
      recordId: 'VPR-SIGMA-D8642',
      schemaId: SCHEMA('vendor-product'),
      payload: {
        kind: 'vendor-product',
        id: 'VPR-SIGMA-D8642',
        name: 'Sigma D8642',
        vendor: 'Sigma-Aldrich',
        catalog_number: 'D8642',
        material_ref: { kind: 'record', type: 'material', id: 'mat-seed-dmso-anhydrous' },
      },
    },
    {
      recordId: 'MINST-SIGMA-D8642',
      schemaId: SCHEMA('material-instance'),
      payload: {
        kind: 'material-instance',
        id: 'MINST-SIGMA-D8642',
        name: 'Sigma D8642',
        vendor_product_ref: { kind: 'record', type: 'vendor-product', id: 'VPR-SIGMA-D8642' },
      },
    },
    {
      recordId: 'LOT-DMSO-20260217',
      schemaId: SCHEMA('material-lot'),
      payload: {
        kind: 'material-lot',
        id: 'LOT-DMSO-20260217',
        material_ref: { kind: 'record', type: 'material', id: 'mat-seed-dmso-anhydrous' },
        lot_number: 'LOT-20260217-01',
        supplier: { name: 'Sigma-Aldrich', vendor_lot: 'SLCM4455' },
      },
    },
  ];
}

function stubRouteOptions(store: RecordStore) {
  const noop = async () => ({})
  return {
    recordHandlers: {
      listRecords: noop, listRevisions: noop, draftCopy: noop, acceptGraph: noop,
      getRecord: noop, createRecord: noop, updateRecord: noop, deleteRecord: noop,
      listClaims: noop, checkClaimDuplicates: noop,
    } as never,
    schemaHandlers: { listSchemas: noop, getSchema: noop, getSchemaByPath: noop } as never,
    validationHandlers: { validate: noop, lint: noop, validateFull: noop } as never,
    schemaCount: () => 0,
    ruleCount: () => 0,
    inventoryShelfHandlers: createInventoryShelfHandlers(store),
  }
}

describe('GET /inventory/shelf (MATRES-SHELF route)', () => {
  it('F: 200 with grouped report for the seeded fixture', async () => {
    const app = Fastify()
    const records = fixtureRecords()
    const store = {
      list: async (filter?: { kind?: string }) =>
        filter?.kind ? records.filter((r) => (r.payload as { kind?: string }).kind === filter.kind) : [...records],
    } as unknown as RecordStore
    registerRoutes(app, stubRouteOptions(store))

    const res = await app.inject({ method: 'GET', url: '/inventory/shelf?term=DMSO' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.term).toBe('DMSO')
    expect(body.concepts.map((c: { recordId: string }) => c.recordId)).toContain('mat-seed-dmso-anhydrous')
    const allEntries = body.groups.flatMap((g: { entries: { recordId: string }[] }) => g.entries)
    expect(allEntries.map((e: { recordId: string }) => e.recordId)).toContain('MINST-SIGMA-D8642')
    expect(allEntries.map((e: { recordId: string }) => e.recordId)).toContain('LOT-DMSO-20260217')
    // Grouped by vendor/lot.
    expect(body.groups.some((g: { vendor?: string }) => g.vendor === 'Sigma-Aldrich')).toBe(true)
    await app.close()
  });

  it('F: empty-but-shaped report for a no-match term', async () => {
    const app = Fastify()
    const records = fixtureRecords()
    const store = {
      list: async (filter?: { kind?: string }) =>
        filter?.kind ? records.filter((r) => (r.payload as { kind?: string }).kind === filter.kind) : [...records],
    } as unknown as RecordStore
    registerRoutes(app, stubRouteOptions(store))

    const res = await app.inject({ method: 'GET', url: '/inventory/shelf?term=zzz-no-such-thing' })
    expect(res.statusCode).toBe(200)
    const body = res.json()
    expect(body.term).toBe('zzz-no-such-thing')
    expect(body.concepts).toEqual([])
    expect(body.groups).toEqual([])
    await app.close()
  });

  it('missing term query param is a 400, not a crash', async () => {
    const app = Fastify()
    const store = { list: async () => [] } as unknown as RecordStore
    registerRoutes(app, stubRouteOptions(store))
    const res = await app.inject({ method: 'GET', url: '/inventory/shelf' })
    expect(res.statusCode).toBe(400)
    await app.close()
  });
});
