import { describe, expect, it } from 'vitest';
import { createResolveSpine } from '../ResolveSpine.js';
import { createTermProvider } from './terms.js';
import type { RecordEnvelope, RecordFilter, StoreResult } from '../../store/types.js';
import { TERM_SCHEMA_ID } from '../../terms/EnsureTerm.js';

const realFetch = globalThis.fetch;

/** Route fetch by URL: OLS4 vs the OAK service. */
function stubFetch(opts: { ols4?: Array<{ curie: string; label: string; namespace?: string }> }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('ols4')) {
      const docs = (opts.ols4 ?? []).map((h) => ({
        obo_id: h.curie,
        label: h.label,
        iri: '',
        ontology_name: (h.namespace ?? '').toLowerCase(),
      }));
      return new Response(JSON.stringify({ response: { docs } }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CLA_ONTOLOGY_SERVICE_URL;
});

class TermStore {
  terms: RecordEnvelope[] = [];
  seed(label: string, aliases: string[], kind = 'organism') {
    this.terms.push({
      recordId: `TERM-${label.replace(/\W+/g, '-').toLowerCase()}-0000`,
      schemaId: TERM_SCHEMA_ID,
      payload: { kind, id: `TERM-${label}-0000`, preferredLabel: label, aliases },
      meta: { kind: 'term' },
    });
  }
  async list(filter?: RecordFilter): Promise<RecordEnvelope[]> {
    if (filter?.schemaId === TERM_SCHEMA_ID) return this.terms;
    return [];
  }
  async get(): Promise<RecordEnvelope | null> {
    return null;
  }
  async getByPath(): Promise<RecordEnvelope | null> {
    return null;
  }
  async create(opts: { envelope: RecordEnvelope }): Promise<StoreResult> {
    this.terms.push(opts.envelope);
    return { success: true, envelope: opts.envelope };
  }
  async update(): Promise<StoreResult> {
    return { success: true };
  }
  async delete(): Promise<StoreResult> {
    return { success: true };
  }
  async exists(): Promise<boolean> {
    return false;
  }
  async validate(): { valid: true } {
    return { valid: true };
  }
}

describe('term provider (tier 0 — alias-first)', () => {
  it('matches a spelling-variant alias to the canonical term', async () => {
    const store = new TermStore();
    store.seed('Faecalibacterium prausnitzii', ['F praus', 'FPRAUS', 'F pruas']);

    const provider = createTermProvider(store);
    const hits = await provider('F praus');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.curie).toBe('local:TERM-faecalibacterium-prausnitzii-0000');
    expect(hits[0]!.label).toBe('Faecalibacterium prausnitzii');
  });

  it('returns no hit for a term with no lexical/alias support', async () => {
    const store = new TermStore();
    store.seed('ethanol', ['ethanol', 'EtOH'], 'material');
    const provider = createTermProvider(store);
    const hits = await provider('HepG2 cells');
    expect(hits).toEqual([]);
  });

  it('ranks exact alias above prefix and substring', async () => {
    const store = new TermStore();
    store.seed('F prausnitzii', ['F prausnitzii', 'FPRAUS']);
    store.seed('F praus', ['F praus']);
    const provider = createTermProvider(store);
    const hits = await provider('F praus');
    // exact alias for "F praus" term outranks the prefix-only "F prausnitzii" term
    expect(hits[0]!.label).toBe('F praus');
  });

  it('does not drop an all-caps no-space alias (FPRAUS) via the spine lexical re-filter', async () => {
    // Regression: hasLexicalSupport tokenizes the matched alias and strips the
    // single-char "F" from "F praus", so the generic re-filter loses a query of
    // "FPRAUS" even though the alias normalized-match is exact. Tier-0 hits are
    // authoritative and must bypass that filter.
    stubFetch({ ols4: [{ curie: 'NCBITaxon:853', label: 'Faecalibacterium prausnitzii', namespace: 'NCBITaxon' }] });
    const store = new TermStore();
    store.seed('Faecalibacterium prausnitzii', ['F praus', 'FPRAUS', 'F pruas'], 'organism');
    const spine = createResolveSpine({ termProvider: createTermProvider(store) });
    const out = await spine.resolve('FPRAUS');
    expect(out[0]!.source).toBe('canonical-term');
    expect(out[0]!.curie).toBe('local:TERM-faecalibacterium-prausnitzii-0000');
  });
});

describe('resolve() spine tier 0 (canonical-first)', () => {
  it('a canonical-term alias hit outranks a remote OLS4 exact hit', async () => {
    stubFetch({ ols4: [{ curie: 'NCBITaxon:853', label: 'Faecalibacterium prausnitzii', namespace: 'NCBITaxon' }] });
    const store = new TermStore();
    store.seed('Faecalibacterium prausnitzii', ['F praus', 'FPRAUS']);

    const spine = createResolveSpine({ termProvider: createTermProvider(store) });
    const out = await spine.resolve('F praus');
    expect(out[0]!.source).toBe('canonical-term'); // tier 0 beats tier 3 exact
    expect(out[0]!.curie).toBe('local:TERM-faecalibacterium-prausnitzii-0000');
  });

  it('emits the tier-5 mint affordance for unknown terms', async () => {
    stubFetch({});
    const spine = createResolveSpine({ termProvider: async () => [] });
    const out = await spine.resolve('totally-unknown');
    expect(out[out.length - 1]!.source).toBe('mint');
  });

  it('term tier 0 is wired through createResolveSpineFromContext', async () => {
    stubFetch({});
    // structural context mirror — the real factory is exercised in server.ts
    const { createResolveSpineFromContext } = await import('../ResolveSpine.js');
    const spine = createResolveSpineFromContext({ store: new TermStore() });
    expect(spine).toBeTruthy();
    const out = await spine.resolve('F praus', { limit: 1 });
    expect(Array.isArray(out)).toBe(true);
  });
});