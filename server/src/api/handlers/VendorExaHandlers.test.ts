/**
 * GC-17 RED — the honest Exa capability contract on POST /vendor/exa/search.
 *
 * The server answers a CAPABILITY question (`is the Exa vendor tier actually
 * configured to answer?`) with a typed honest READ (HTTP 200), not an HTTP
 * failure. A genuine upstream outage behind a valid key STAYS a typed 502 —
 * only the credential-capability class goes quiet.
 *
 *  T1 (RED→GREEN inversion): key present but upstream REJECTS the credential
 *     (401 — and T1b 403). Detection MUST ride the upstream HTTP STATUS on a
 *     typed error out of integrations/exa.ts (ExaRequestError), never by
 *     string-matching "Invalid API key". → 200
 *     { configured: false, query, items: [], reason: 'key_rejected' }.
 *     The injected mock key literal must never appear in the response body.
 *  T2 (RED→GREEN inversion — was 503 EXA_NOT_CONFIGURED): config absent
 *     (no config block, no EXA_API_KEY) → 200
 *     { configured: false, query, items: [], reason: 'not_configured' }.
 *  T3 (anti-laundering pin): upstream 500 behind a valid key → STILL 502
 *     EXA_SEARCH_FAILED. T3b (forced real timeout) the same: a real outage
 *     behind a valid key must not be laundered into 200.
 *  T4: q < 2 chars → 400 BAD_REQUEST (unchanged pin).
 *  T5 (regression leg — mock evidence IS the gate per verified_by): valid key,
 *     upstream 200 with results[] → 200 { configured: true, query, items },
 *     byte-identical to today, `reason` ABSENT (exactOptionalPropertyTypes).
 *
 * RED at claim time: exaSearch throws a plain Error('Exa search failed: HTTP
 * 401: …') for EVERY non-ok response, so the handler's catch maps 401 and 500
 * identically to 502 (T1/T1b/T3 fail); T2 fails: the handler answers 503
 * EXA_NOT_CONFIGURED. T4/T5 are GREEN at claim (unchanged pins).
 *
 * Isolation: the REAL exa.ts runs end to end (resolveExaConfig + exaSearch);
 * the fake is a `fetch` — injected at the `fetchFn` parameter for the direct
 * ExaRequestError pin (spec: exa.ts:135) and via a global spy for the handler
 * path. No module mocks; no network.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createVendorExaHandlers } from './VendorExaHandlers.js';
import { exaSearch, ExaRequestError, resolveExaConfig } from '../../integrations/exa.js';
import type { ExaSearchRequest, ResolvedExaConfig } from '../../integrations/exa.js';
import type { AppConfig } from '../../config/types.js';
import type { RecordStore } from '../../store/types.js';

// A distinct mock credential so T1 can prove NO key material reaches the body.
const MOCK_KEY = 'exa-mock-key-GC17-0042';

/** Fake AppConfig: key present (the live-deployment shape: enabled, bad key). */
function appConfigWithKey(overrides: { timeoutMs?: number } = {}): AppConfig {
  return {
    integrations: { exa: { apiKey: MOCK_KEY, ...overrides } },
  } as unknown as AppConfig;
}

const RESOLVED: ResolvedExaConfig = {
  apiKey: MOCK_KEY,
  baseUrl: 'https://api.exa.ai',
  defaultSearchType: 'auto',
  defaultContentMode: 'highlights',
  defaultMaxCharacters: 4000,
  timeoutMs: 1000,
};

/** fetch stub answering with a fixed upstream status + body. */
function fetchResponding(status: number, body: string): typeof fetch {
  return (async () =>
    new Response(body, {
      status,
      headers: { 'Content-Type': 'application/json' },
    })) as unknown as typeof fetch;
}

/** fetch stub that rejects with a DOMException AbortError when its signal
 *  aborts — the real fetch's contract — so a forced timeout (config
 *  timeoutMs) drives the genuine abort path in exa.ts. */
function fetchAbortingOnSignal(): typeof fetch {
  return ((_url: string, init?: RequestInit) =>
    new Promise<never>((_resolve, reject) => {
      init?.signal?.addEventListener('abort', () => {
        reject(new DOMException('The operation was aborted.', 'AbortError'));
      });
    })) as unknown as typeof fetch;
}

function reply() {
  return { status: vi.fn() };
}

function store(overrides: Partial<RecordStore> = {}): RecordStore {
  return {
    get: vi.fn(async () => null),
    getByPath: vi.fn(),
    getWithValidation: vi.fn(),
    list: vi.fn(),
    create: vi.fn(async ({ envelope }) => ({ success: true, envelope })),
    update: vi.fn(),
    delete: vi.fn(),
    validate: vi.fn(),
    lint: vi.fn(),
    getHistory: vi.fn(),
    ...overrides,
  } as unknown as RecordStore;
}

function request(body: Record<string, unknown>) {
  return { body } as never;
}

const savedEnvKey = process.env.EXA_API_KEY;

beforeEach(() => {
  // T2 is the "no key / no env" leg: clear the env key so the REAL
  // resolveExaConfig sees exactly the config under test.
  delete process.env.EXA_API_KEY;
});

afterEach(() => {
  vi.restoreAllMocks();
  if (savedEnvKey === undefined) delete process.env.EXA_API_KEY;
  else process.env.EXA_API_KEY = savedEnvKey;
});

describe('VendorExaHandlers.searchExa — honest capability contract (GC-17)', () => {
  it('T1: upstream 401 (dead key) → 200 { configured: false, reason: "key_rejected", items: [] }; no key material in the body', async () => {
    const fetch401 = fetchResponding(401, JSON.stringify({ error: 'Invalid API key: x-api-key' }));
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetch401);

    // Direct fetchFn-parameter pin (exa.ts:135): the typed error carries the
    // upstream STATUS — this is what the handler's mapping may branch on.
    await expect(exaSearch(RESOLVED, { query: 'probe' }, fetch401)).rejects.toMatchObject({
      name: 'ExaRequestError',
      status: 401,
    });
    expect(ExaRequestError).toBeDefined();

    const handlers = createVendorExaHandlers({ getAppConfig: () => appConfigWithKey(), store: store() });
    const replyMock = reply();
    const out = await handlers.searchExa(request({ q: 'rot', category: 'catalog' }), replyMock as never);

    // 200 (Fastify default — no status set): the typed honest refusal.
    expect(replyMock.status).not.toHaveBeenCalled();
    expect(out).toEqual({ configured: false, query: 'rot', items: [], reason: 'key_rejected' });
    // Key-material pin: the injected mock key literal must never reach the
    // response body (nor upstream prose echo beyond the redacted level).
    expect(JSON.stringify(out)).not.toContain(MOCK_KEY);
    expect(JSON.stringify(out)).not.toContain('x-api-key');
  });

  it('T1b: upstream 403 (credential rejected, other status) → same honest refusal — status-driven, not prose-driven', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchResponding(403, 'forbidden'));

    const handlers = createVendorExaHandlers({ getAppConfig: () => appConfigWithKey(), store: store() });
    const replyMock = reply();
    const out = await handlers.searchExa(request({ q: 'rot' }), replyMock as never);

    expect(replyMock.status).not.toHaveBeenCalled();
    expect(out).toEqual({ configured: false, query: 'rot', items: [], reason: 'key_rejected' });
  });

  it('T2: no config (resolveExaConfig null) → 200 { configured: false, reason: "not_configured", items: [] } — INVERTS the legacy 503 EXA_NOT_CONFIGURED', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchResponding(200, '{}'));
    // Real resolveExaConfig: empty AppConfig + cleared env key → null.
    expect(resolveExaConfig({} as unknown as AppConfig)).toBeNull();

    const handlers = createVendorExaHandlers({ getAppConfig: () => ({} as unknown as AppConfig), store: store() });
    const replyMock = reply();
    const out = await handlers.searchExa(request({ q: 'rot' }), replyMock as never);

    expect(replyMock.status).not.toHaveBeenCalled();
    expect(out).toEqual({ configured: false, query: 'rot', items: [], reason: 'not_configured' });
    // The search never fires when there is no credential to send.
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('T3: upstream 500 behind a valid key → STILL 502 EXA_SEARCH_FAILED (anti-laundering pin: outages do not become 200)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchResponding(500, 'upstream exploded'));

    const handlers = createVendorExaHandlers({ getAppConfig: () => appConfigWithKey(), store: store() });
    const replyMock = reply();
    const out = await handlers.searchExa(request({ q: 'rot' }), replyMock as never);

    expect(replyMock.status).toHaveBeenCalledWith(502);
    expect(out).toMatchObject({ error: 'EXA_SEARCH_FAILED' });
  });

  it('T3b: forced real timeout behind a valid key → STILL 502 EXA_SEARCH_FAILED (anti-laundering pin)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(fetchAbortingOnSignal());

    const handlers = createVendorExaHandlers({
      getAppConfig: () => appConfigWithKey({ timeoutMs: 1 }),
      store: store(),
    });
    const replyMock = reply();
    const out = await handlers.searchExa(request({ q: 'rot' }), replyMock as never);

    expect(replyMock.status).toHaveBeenCalledWith(502);
    expect(out).toMatchObject({ error: 'EXA_SEARCH_FAILED' });
  });

  it('T4: q shorter than 2 chars → 400 BAD_REQUEST (unchanged)', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch').mockImplementation(fetchResponding(200, '{}'));
    const handlers = createVendorExaHandlers({ getAppConfig: () => appConfigWithKey(), store: store() });
    const replyMock = reply();
    const out = await handlers.searchExa(request({ q: 'r' }), replyMock as never);

    expect(replyMock.status).toHaveBeenCalledWith(400);
    expect(out).toMatchObject({ error: 'BAD_REQUEST' });
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('T5: valid key, upstream 200 with results[] → 200 { configured: true, query, items } — happy path byte-identical (configured-key regression leg; mock evidence IS the gate)', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(
      fetchResponding(
        200,
        JSON.stringify({
          results: [
            {
              id: 'exa-1',
              title: 'Cayman 1.0 mM DMSO solution',
              url: 'https://example.com/10506',
              highlights: ['Cayman Bio-Active Lipid Screening Library 1.0 mM in DMSO'],
              score: 0.9,
            },
          ],
        }),
      ),
    );

    const handlers = createVendorExaHandlers({ getAppConfig: () => appConfigWithKey(), store: store() });
    const replyMock = reply();
    const out = await handlers.searchExa(
      request({ q: 'cayman', category: 'catalog', limit: 3 }),
      replyMock as never,
    );

    expect(replyMock.status).not.toHaveBeenCalled();
    expect(out).toEqual({
      configured: true,
      query: 'cayman',
      items: [
        {
          id: 'exa-1',
          title: 'Cayman 1.0 mM DMSO solution',
          url: 'https://example.com/10506',
          category: 'catalog',
          source: 'exa',
          snippet: 'Cayman Bio-Active Lipid Screening Library 1.0 mM in DMSO',
          score: 0.9,
        },
      ],
    });
    // exactOptionalPropertyTypes bar: `reason` is ABSENT on the happy path,
    // not undefined — the refusal field only exists on the typed refusal.
    expect('reason' in (out as Record<string, unknown>)).toBe(false);
  });
});

describe('VendorExaHandlers.createFromExa — unchanged pins (GC-17 boundary)', () => {
  it('creates a vendor-product + material concept from an Exa catalog candidate', async () => {
    const create = vi.fn(async ({ envelope }) => ({ success: true, envelope }));
    const handlers = createVendorExaHandlers({ getAppConfig: () => ({}), store: store({ create } as Partial<RecordStore>) });

    const out = await handlers.createFromExa({
      body: {
        candidate: {
          title: 'Rotenone',
          url: 'https://example.com/rotenone',
          description: 'Rotenone mitochondrial complex I inhibitor',
          category: 'catalog',
          manufacturer: 'Cayman Chemical',
          catalogNumber: '13995',
        },
      },
    } as never, reply() as never);

    expect(out).toMatchObject({ success: true, label: 'Rotenone' });
    // material concept + vendor-product
    const created = create.mock.calls.map(([arg]) => arg.envelope as { schemaId: string; payload: Record<string, unknown> });
    expect(created).toHaveLength(2);
    const material = created.find((e) => e.schemaId.includes('material.schema.yaml'));
    expect(material!.payload).toMatchObject({ kind: 'material', name: 'Rotenone', domain: 'chemical' });
    const vpr = created.find((e) => e.schemaId.includes('vendor-product.schema.yaml'));
    expect(vpr!.payload).toMatchObject({
      kind: 'vendor-product',
      name: 'Rotenone',
      vendor: 'Cayman Chemical',
      catalog_number: '13995',
      product_url: 'https://example.com/rotenone',
    });
    expect(String(vpr!.payload.material_ref.id)).toBe(String(material!.payload.id));
  });

  it('creates a labware record from an Exa labware candidate', async () => {
    const create = vi.fn(async ({ envelope }) => ({ success: true, envelope }));
    const handlers = createVendorExaHandlers({ getAppConfig: () => ({}), store: store({ create } as Partial<RecordStore>) });

    const out = await handlers.createFromExa({
      body: {
        candidate: {
          title: 'Corning 96-Well Plate',
          url: 'https://example.com/corning96',
          category: 'labware',
        },
      },
    } as never, reply() as never);

    expect(out).toMatchObject({ success: true, label: 'Corning 96-Well Plate' });
    const envelope = create.mock.calls[0]![0].envelope;
    expect(envelope.schemaId).toBe('https://computable-lab.com/schema/computable-lab/labware.schema.yaml');
    expect(envelope.payload).toMatchObject({ kind: 'labware', name: 'Corning 96-Well Plate', labwareType: 'other' });
    expect(String(envelope.payload.recordId)).toMatch(/^LBW-/);
  });

  it('creates an equipment record from an Exa equipment candidate', async () => {
    const create = vi.fn(async ({ envelope }) => ({ success: true, envelope }));
    const handlers = createVendorExaHandlers({ getAppConfig: () => ({}), store: store({ create } as Partial<RecordStore>) });

    const out = await handlers.createFromExa({
      body: {
        candidate: {
          title: 'Bio-Rad CFX96 Real-Time PCR System',
          url: 'https://example.com/cfx96',
          category: 'equipment',
          manufacturer: 'Bio-Rad',
          model: 'CFX96',
        },
      },
    } as never, reply() as never);

    expect(out).toMatchObject({ success: true, label: 'Bio-Rad CFX96 Real-Time PCR System' });
    const envelope = create.mock.calls[0]![0].envelope;
    expect(envelope.schemaId).toBe('https://computable-lab.com/schema/computable-lab/equipment.schema.yaml');
    expect(envelope.payload).toMatchObject({
      kind: 'equipment',
      name: 'Bio-Rad CFX96 Real-Time PCR System',
      manufacturer: 'Bio-Rad',
      model: 'CFX96',
    });
    expect(String(envelope.payload.id)).toMatch(/^EQP-[A-Z0-9][A-Z0-9_-]*$/);
  });

  it('creates an equipment record whose id survives real schema validation (uppercase EQP-)', async () => {
    // Regression: slugTitle previously lowercased → `EQP-eppendorf-…` which the
    // equipment schema (`^EQP-[A-Z0-9][A-Z0-9_-]*$`) rejects on a REAL store.
    // The mock store above skips validation, so assert the pattern directly and
    // that the slug portion is uppercased.
    const create = vi.fn(async ({ envelope }) => ({ success: true, envelope }));
    const handlers = createVendorExaHandlers({ getAppConfig: () => ({}), store: store({ create } as Partial<RecordStore>) });

    await handlers.createFromExa({
      body: { candidate: { title: 'eppendorf thermomixer c', url: 'https://eppendorf.com/tc', category: 'equipment' } },
    } as never, reply() as never);

    const envelope = create.mock.calls[0]![0].envelope;
    const id = String(envelope.payload.id);
    expect(id).toMatch(/^EQP-[A-Z0-9][A-Z0-9_-]*$/);
    // first segment after the prefix is uppercased (no lowercase letters in id)
    expect(id).not.toMatch(/[a-z]/);
  });

  it('400 when candidate lacks title/url (unchanged)', async () => {
    const handlers = createVendorExaHandlers({ getAppConfig: () => appConfigWithKey(), store: store() });
    const out = await handlers.createFromExa(
      request({ candidate: { title: 'no url' } }),
      reply() as never,
    );
    expect(out).toMatchObject({ error: 'BAD_REQUEST' });
  });
});
