import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createVendorExaHandlers } from './VendorExaHandlers.js';
import { exaSearch, resolveExaConfig } from '../../integrations/exa.js';
import type { RecordStore } from '../../store/types.js';

vi.mock('../../integrations/exa.js', () => ({
  resolveExaConfig: vi.fn(),
  exaSearch: vi.fn(),
}));

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

describe('VendorExaHandlers', () => {
  beforeEach(() => {
    vi.mocked(resolveExaConfig).mockReset();
    vi.mocked(exaSearch).mockReset();
  });

  it('normalizes Exa vendor-product search results with category', async () => {
    vi.mocked(resolveExaConfig).mockReturnValue({
      apiKey: 'exa-test-key',
      baseUrl: 'https://api.exa.ai',
      defaultSearchType: 'auto',
      defaultContentMode: 'highlights',
      defaultMaxCharacters: 4000,
      timeoutMs: 1000,
    });
    vi.mocked(exaSearch).mockResolvedValue({
      results: [{
        id: 'exa-1',
        title: 'Cayman 1.0 mM DMSO solution',
        url: 'https://example.com/10506',
        highlights: ['Cayman Bio-Active Lipid Screening Library 1.0 mM in DMSO'],
        score: 0.9,
      }],
    });

    const handlers = createVendorExaHandlers({ getAppConfig: () => ({}), store: store() });
    const out = await handlers.searchExa({ body: { q: 'cayman', category: 'catalog', limit: 3 } } as never, reply() as never);

    expect(out).toMatchObject({
      configured: true,
      query: 'cayman',
      items: [{
        id: 'exa-1',
        title: 'Cayman 1.0 mM DMSO solution',
        url: 'https://example.com/10506',
        category: 'catalog',
        source: 'exa',
      }],
    });
    expect(exaSearch).toHaveBeenCalledTimes(1);
    const [config, request] = exaSearch.mock.calls[0] as [unknown, { query?: string; numResults?: number }];
    expect(config).toBeTruthy();
    expect(request.query).toContain('cayman');
    expect(request.numResults).toBe(6);
  });

  it('returns 503 when Exa is not configured', async () => {
    vi.mocked(resolveExaConfig).mockReturnValue(null);
    const handlers = createVendorExaHandlers({ getAppConfig: () => ({}), store: store() });
    const replyMock = reply();
    const out = await handlers.searchExa({ body: { q: 'dy6000' } } as never, replyMock as never);
    expect(replyMock.status).toHaveBeenCalledWith(503);
    expect(out).toMatchObject({ error: 'EXA_NOT_CONFIGURED' });
  });

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

  it('returns 400 when candidate lacks title/url', async () => {
    const handlers = createVendorExaHandlers({ getAppConfig: () => ({}), store: store() });
    const out = await handlers.createFromExa({ body: { candidate: { title: 'no url' } } } as never, reply() as never);
    expect(out).toMatchObject({ error: 'BAD_REQUEST' });
  });
});