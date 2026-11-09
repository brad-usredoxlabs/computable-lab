/**
 * Reachability + honesty — GET /api/analysis-runs (route level).
 *
 * The live defect (measured on the lane stack): the default page returns the
 * OLDEST 50 runs (scan order) and misreports `total = runs.length`, so newer
 * runs are unreachable from the UI and the cap is invisible to every
 * consumer. Obligations pinned here (RED-first):
 *   1. `limit`/`offset` query params are honoured (the TreeHandlers.listRuns
 *      parse pattern; RecordFilter supports both) and the page is
 *      NEWEST-FIRST (numeric id suffix desc — nextId mints max+1
 *      monotonically, so the suffix IS creation order).
 *   2. `total` is the TRUE count of analysis-run records, never the page
 *      length.
 *
 * Harness mirrors ProtocolIdeHandlers.routes.test.ts: a real Fastify app,
 * the REAL createAnalysisHandlers wired to the REAL AnalysisService, a
 * mock store that honours the RecordStoreImpl list contract (kind filter +
 * scan-order offset/limit), seeded with DYNAMICALLY COUNTED records (no
 * pinned 50/65, no live run ids).
 */

import { describe, it, expect, vi } from 'vitest';
import Fastify from 'fastify';
import type { RecordStore } from '../../store/types.js';
import type { RecordEnvelope } from '../../types/RecordEnvelope.js';
import { createAnalysisHandlers } from './AnalysisHandlers.js';

const RUN_SCHEMA = 'https://computable-lab.com/schema/computable-lab/analysis-run.schema.yaml';
const SEED_COUNT = 57; // arbitrary > default page (50); computed, never asserted literally as 50/65

/** Seed ids in the real family shape (nextId: ANR- + 6-digit numeric) but in
 * a SYNTHETIC range (900001+) that no live store record occupies — generic
 * fixtures, dynamically counted, never a live run id. */
function seedId(n: number): string {
  return `ANR-9${String(n).padStart(5, '0')}`;
}

function makeSeedRecords(count: number): RecordEnvelope[] {
  const out: RecordEnvelope[] = [];
  for (let n = 1; n <= count; n += 1) {
    out.push({
      recordId: seedId(n),
      schemaId: RUN_SCHEMA,
      payload: { kind: 'analysis-run', id: seedId(n), title: `run ${n}`, status: 'succeeded' },
      meta: { kind: 'analysis-run' },
    } as unknown as RecordEnvelope);
  }
  return out;
}

/**
 * Mock store honouring the RecordStoreImpl.list contract
 * (server/src/store/RecordStoreImpl.ts:453-521): kind filter, then SCAN
 * order (recordId asc), then offset drop, then limit truncation.
 */
function makeSeededStore(seeds: RecordEnvelope[]): RecordStore {
  const list = vi.fn(async (filter?: { kind?: string; schemaId?: string; limit?: number; offset?: number }) => {
    let all = seeds
      .filter((e) => (filter?.kind ? e.meta?.kind === filter.kind : true))
      .sort((a, b) => a.recordId.localeCompare(b.recordId));
    if (filter?.schemaId) all = all.filter((e) => e.schemaId === filter.schemaId);
    if (filter?.offset && filter.offset > 0) all = all.slice(filter.offset);
    if (filter?.limit) all = all.slice(0, filter.limit);
    return all;
  });
  return {
    create: vi.fn().mockResolvedValue({ success: true }),
    get: vi.fn(async (id: string) => seeds.find((r) => r.recordId === id) ?? null),
    getByPath: vi.fn().mockResolvedValue(null),
    getWithValidation: vi.fn().mockResolvedValue({ success: true }),
    list,
    update: vi.fn().mockResolvedValue({ success: true }),
    delete: vi.fn().mockResolvedValue({ success: true }),
    validate: vi.fn().mockResolvedValue({ valid: true }),
    lint: vi.fn().mockResolvedValue({ valid: true }),
    exists: vi.fn().mockResolvedValue(true),
  } as unknown as RecordStore;
}

async function buildApp(store: RecordStore) {
  const handlers = createAnalysisHandlers({ store } as unknown as Parameters<typeof createAnalysisHandlers>[0]);
  const app = Fastify();
  await app.register(async (instance) => {
    // mirrors server/src/api/routes.ts:1281
    instance.get('/analysis-runs', handlers.listRuns.bind(handlers));
  }, { prefix: '/api' });
  return app;
}

describe('GET /api/analysis-runs is reachable and honest', () => {
  const seeds = makeSeedRecords(SEED_COUNT);

  it('default page: newest-first, total is the TRUE count (not the page length)', async () => {
    const app = await buildApp(makeSeededStore(seeds));
    const res = await app.inject({ method: 'GET', url: '/api/analysis-runs' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { runs: Array<{ recordId: string }>; total: number };
    // The newest run lands in the default page (acceptance A).
    expect(body.runs[0]?.recordId).toBe(seedId(SEED_COUNT));
    expect(body.runs[1]?.recordId).toBe(seedId(SEED_COUNT - 1));
    // Newest-first throughout (the tail is the OLDEST surviving records).
    const ids = body.runs.map((r) => r.recordId);
    const numeric = (id: string) => Number(id.replace(/\D/g, ''));
    for (let i = 1; i < ids.length; i += 1) {
      expect(numeric(ids[i - 1]!)).toBeGreaterThan(numeric(ids[i]!));
    }
    // Honest total: the true seeded count, NOT runs.length.
    expect(body.total).toBe(SEED_COUNT);
    expect(body.total).toBeGreaterThan(body.runs.length);
    await app.close();
  });

  it('?limit=2&offset=0: exactly 2 runs, newest-first, total unchanged', async () => {
    const app = await buildApp(makeSeededStore(seeds));
    const res = await app.inject({ method: 'GET', url: '/api/analysis-runs?limit=2&offset=0' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { runs: Array<{ recordId: string }>; total: number };
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0]?.recordId).toBe(seedId(SEED_COUNT));
    expect(body.runs[1]?.recordId).toBe(seedId(SEED_COUNT - 1));
    expect(body.total).toBe(SEED_COUNT);
    await app.close();
  });

  it('?offset=2: a disjoint page, total stable across pages (acceptance B)', async () => {
    const store = makeSeededStore(seeds);
    const app = await buildApp(store);
    const page0 = (await app.inject({ method: 'GET', url: '/api/analysis-runs?limit=2&offset=0' })).json() as {
      runs: Array<{ recordId: string }>; total: number;
    };
    const page2 = (await app.inject({ method: 'GET', url: '/api/analysis-runs?limit=2&offset=2' })).json() as {
      runs: Array<{ recordId: string }>; total: number;
    };
    expect(page2.runs).toHaveLength(2);
    expect(page2.runs[0]?.recordId).toBe(seedId(SEED_COUNT - 2));
    expect(page2.runs[1]?.recordId).toBe(seedId(SEED_COUNT - 3));
    // Disjoint from page 0.
    const page0Ids = new Set(page0.runs.map((r) => r.recordId));
    for (const r of page2.runs) expect(page0Ids.has(r.recordId)).toBe(false);
    // Total stable across pages.
    expect(page2.total).toBe(page0.total);
    expect(page2.total).toBe(SEED_COUNT);
    await app.close();
  });

  it('offset beyond the end: empty page, total still truthful', async () => {
    const app = await buildApp(makeSeededStore(seeds));
    const res = await app.inject({ method: 'GET', url: `/api/analysis-runs?limit=5&offset=${SEED_COUNT - 2}` });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { runs: Array<{ recordId: string }>; total: number };
    expect(body.runs).toHaveLength(2);
    expect(body.runs[0]?.recordId).toBe(seedId(2));
    expect(body.runs[1]?.recordId).toBe(seedId(1));
    expect(body.total).toBe(SEED_COUNT);
    await app.close();
  });

  it('a non-minted id carrying big trailing digits never outranks a minted id', async () => {
    // D1: a hand-made id whose trailing digits exceed the minted counter must
    // sort on the OLDEST side, not the top of the page. Synthetic fixture
    // (never a live id), created before the minted seeds.
    const nonMinted = {
      recordId: 'ANR-TEST-BIG-999999',
      schemaId: RUN_SCHEMA,
      payload: { kind: 'analysis-run', id: 'ANR-TEST-BIG-999999', title: 'old fixture run', status: 'succeeded' },
      meta: { kind: 'analysis-run', createdAt: '2026-10-29T12:00:00.000Z' },
    } as unknown as RecordEnvelope;
    const app = await buildApp(makeSeededStore([...seeds, nonMinted]));
    const res = await app.inject({ method: 'GET', url: '/api/analysis-runs?limit=60' });
    expect(res.statusCode).toBe(200);
    const body = res.json() as { runs: Array<{ recordId: string }>; total: number };
    // The minted id sorts FIRST — the top of the page is the newest run.
    expect(body.runs[0]?.recordId).toBe(seedId(SEED_COUNT));
    // ...and the non-minted id sorts BELOW all minted ids (oldest side).
    expect(body.runs[body.runs.length - 1]?.recordId).toBe('ANR-TEST-BIG-999999');
    // Total stays truthful (the fixture is a real record, counted).
    expect(body.total).toBe(SEED_COUNT + 1);
    await app.close();
  });
});
