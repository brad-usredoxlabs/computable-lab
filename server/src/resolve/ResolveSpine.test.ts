import { afterEach, describe, expect, it } from 'vitest';
import { createResolveSpine } from './ResolveSpine.js';
import type { ProviderHit, ResolveProvider } from './types.js';

const realFetch = globalThis.fetch;

function staticProvider(hits: ProviderHit[]): ResolveProvider {
  return async () => hits;
}

/** Route fetch by URL: OLS4 vs the OAK service. */
function stubFetch(opts: { ols4?: ProviderHit[]; oak?: ProviderHit[]; oakThrows?: boolean }) {
  globalThis.fetch = (async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes('ols4')) {
      const docs = (opts.ols4 ?? []).map((h) => ({
        obo_id: h.curie,
        label: h.label,
        iri: h.uri ?? '',
        ontology_name: (h.namespace ?? '').toLowerCase(),
      }));
      return new Response(JSON.stringify({ response: { docs } }), { status: 200 });
    }
    if (url.includes('/ontologies/')) {
      if (opts.oakThrows) throw new Error('oak down');
      const results = (opts.oak ?? []).map((h) => ({ id: h.curie, label: h.label }));
      return new Response(JSON.stringify({ q: 'x', results }), { status: 200 });
    }
    return new Response('not found', { status: 404 });
  }) as typeof fetch;
}

afterEach(() => {
  globalThis.fetch = realFetch;
  delete process.env.CLA_ONTOLOGY_SERVICE_URL;
});

describe('resolve() spine', () => {
  it('always appends a tier-5 mint affordance carrying the free text', async () => {
    stubFetch({});
    const spine = createResolveSpine();
    const out = await spine.resolve('weirdterm');
    const mint = out[out.length - 1];
    expect(mint?.tier).toBe(5);
    expect(mint?.source).toBe('mint');
    expect(mint?.mint?.label).toBe('weirdterm');
    expect(mint?.curie).toBe('');
  });

  it('ranks a local substring hit above a remote exact hit (tier dominates)', async () => {
    stubFetch({ ols4: [{ curie: 'CHEBI:4593', label: 'fenofibrate', namespace: 'CHEBI' }] });
    const spine = createResolveSpine({
      recordProvider: staticProvider([
        { curie: 'local:MAT-1', label: 'fenofibrate working stock', namespace: 'local' },
      ]),
    });
    const out = await spine.resolve('fenofibrate');
    expect(out[0]?.source).toBe('local-record'); // tier 1 substring beats tier 3 exact
    expect(out[0]?.curie).toBe('local:MAT-1');
    expect(out.some((c) => c.curie === 'CHEBI:4593' && c.tier === 3)).toBe(true);
  });

  it('uses the OAK tier when a service URL is configured, outranking OLS4 on the same CURIE', async () => {
    stubFetch({
      oak: [{ curie: 'CHEBI:4593', label: 'fenofibrate' }],
      ols4: [{ curie: 'CHEBI:4593', label: 'fenofibrate', namespace: 'CHEBI' }],
    });
    const spine = createResolveSpine({
      ontology: { serviceUrl: 'http://127.0.0.1:8766', localOntologies: ['chebi'] },
    });
    const out = await spine.resolve('fenofibrate');
    const hit = out.find((c) => c.curie === 'CHEBI:4593');
    expect(hit?.tier).toBe(2); // deduped to the local OAK instance, not OLS4
    expect(hit?.source).toBe('oak');
  });

  it('skips the OAK tier when no service URL is configured', async () => {
    stubFetch({ oak: [{ curie: 'CHEBI:4593', label: 'fenofibrate' }] });
    const spine = createResolveSpine(); // no ontology config, no env
    const out = await spine.resolve('fenofibrate');
    expect(out.some((c) => c.source === 'oak')).toBe(false);
  });

  it('isolates a remote/OAK failure — local hits and the mint affordance survive', async () => {
    stubFetch({ oakThrows: true });
    const spine = createResolveSpine({
      ontology: { serviceUrl: 'http://127.0.0.1:8766' },
      recordProvider: staticProvider([{ curie: 'local:MAT-2', label: 'HepG2', namespace: 'local' }]),
    });
    const out = await spine.resolve('HepG2');
    expect(out[0]?.curie).toBe('local:MAT-2');
    expect(out[out.length - 1]?.source).toBe('mint');
  });
});
