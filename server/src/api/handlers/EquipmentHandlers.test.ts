import { beforeEach, describe, expect, it, vi } from 'vitest';
import { createEquipmentHandlers } from './EquipmentHandlers.js';
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

describe('EquipmentHandlers', () => {
  beforeEach(() => {
    vi.mocked(resolveExaConfig).mockReset();
    vi.mocked(exaSearch).mockReset();
  });

  it('normalizes Exa equipment search results', async () => {
    vi.mocked(resolveExaConfig).mockReturnValue({
      apiKey: 'key',
      baseUrl: 'https://api.exa.ai',
      defaultSearchType: 'auto',
      defaultContentMode: 'highlights',
      defaultMaxCharacters: 4000,
      timeoutMs: 1000,
    });
    vi.mocked(exaSearch).mockResolvedValue({
      results: [{
        id: 'exa-1',
        title: 'Eppendorf 5424R centrifuge',
        url: 'https://example.com/5424r',
        highlights: ['Eppendorf model 5424R laboratory centrifuge'],
        score: 0.91,
      }],
    });

    const handlers = createEquipmentHandlers({ getAppConfig: () => ({}), store: store() });
    const out = await handlers.searchExa({ query: { q: 'centrifuge', limit: '3' } } as never, reply() as never);

    expect(out).toMatchObject({
      configured: true,
      query: 'centrifuge',
      items: [{
        id: 'exa-1',
        title: 'Eppendorf 5424R centrifuge',
        url: 'https://example.com/5424r',
        manufacturer: 'Eppendorf',
        model: '5424R',
        source: 'exa',
      }],
    });
  });

  it('creates a minimal equipment record from an Exa candidate', async () => {
    const create = vi.fn(async ({ envelope }) => ({ success: true, envelope }));
    const handlers = createEquipmentHandlers({ getAppConfig: () => ({}), store: store({ create } as Partial<RecordStore>) });

    const out = await handlers.createFromExa({
      body: {
        candidate: {
          title: 'Bio-Rad CFX96 Real-Time PCR System',
          url: 'https://example.com/cfx96',
          snippet: 'Bio-Rad model CFX96 qPCR instrument',
          manufacturer: 'Bio-Rad',
          model: 'CFX96',
        },
      },
    } as never, reply() as never);

    expect(out).toMatchObject({ success: true, label: 'Bio-Rad CFX96 Real-Time PCR System' });
    expect(create).toHaveBeenCalledTimes(1);
    const envelope = create.mock.calls[0]![0].envelope;
    expect(envelope.schemaId).toBe('https://computable-lab.com/schema/computable-lab/equipment.schema.yaml');
    expect(envelope.payload).toMatchObject({
      kind: 'equipment',
      name: 'Bio-Rad CFX96 Real-Time PCR System',
      status: 'active',
      manufacturer: 'Bio-Rad',
      model: 'CFX96',
    });
    expect(String(envelope.payload.id)).toMatch(/^EQP-/);
    expect(String(envelope.payload.notes)).toContain('https://example.com/cfx96');
  });
});
