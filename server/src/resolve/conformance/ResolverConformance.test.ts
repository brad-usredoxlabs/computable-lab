import { afterEach, describe, expect, it } from 'vitest';
import { createResolveSpine } from '../ResolveSpine.js';
import { createCompileOntologyResolver } from '../compileResolver.js';
import type { ProviderHit } from '../types.js';

const realFetch = globalThis.fetch;

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

/**
 * CONFORMANCE — "one resolution path, one answer".
 *
 * The compiler's ontology tier (via createCompileOntologyResolver) must resolve
 * a given term to the SAME CURIE the UI/agent resolve() spine produces, so the
 * compiler, agent, and UI never disagree on what a term means. In particular,
 * the compiler must see:
 *   - tier-1 LOCAL RECORDS (a term the lab already saved) — the top priority,
 *   - tier-3 REMOTE OLS4 terms (when no local record exists),
 * both of which a legacy OAK-only compile spine silently dropped.
 */
describe('compiler ontology resolver conformance', () => {
  it('resolves a tier-1 local record to its local: CURIE (single answer)', async () => {
    stubFetch({ ols4: [{ curie: 'CHEBI:16236', label: 'ethanol', namespace: 'CHEBI' }] });
    // The lab already saved an ethanol working stock — the spine must prefer it.
    const spine = createResolveSpine({
      recordProvider: async () => [
        { curie: 'local:MAT-ETH-01', label: 'ethanol working stock', namespace: 'local' } as ProviderHit,
      ],
    });
    const resolver = createCompileOntologyResolver(spine);
    const hits = await resolver('ethanol');
    expect(hits.length).toBeGreaterThan(0);
    // Tier dominance guarantees the local substring outranks the remote exact.
    expect(hits[0]!.id).toBe('local:MAT-ETH-01');
    expect(hits[0]!.source).toBe('local');
  });

  it('resolves an OLS4-only term to its ontology CURIE (no local shadown)', async () => {
    stubFetch({
      ols4: [{ curie: 'CHEBI:4593', label: 'fenofibrate', namespace: 'CHEBI' }],
    });
    // No local record named fenofibrate — falls through to remote OLS4.
    const spine = createResolveSpine({
      recordProvider: async () => [],
    });
    const resolver = createCompileOntologyResolver(spine);
    const hits = await resolver('fenofibrate');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.id).toBe('CHEBI:4593');
  });

  it('never emits the tier-5 mint affordance as a concrete hit', async () => {
    stubFetch({});
    const spine = createResolveSpine({ recordProvider: async () => [] });
    const resolver = createCompileOntologyResolver(spine);
    const hits = await resolver('totally-unknown-term-xyz');
    // An UNRESOLVED term yields no concrete CURIE hit — mint is a caller
    // decision, never auto-materialized by the compiler ontology tier.
    expect(hits).toEqual([]);
  });

  it('localOnly:true still surfaces local records (keep the fast path correct)', async () => {
    stubFetch({
      ols4: [{ curie: 'CHEBI:16236', label: 'ethanol', namespace: 'CHEBI' }],
    });
    const spine = createResolveSpine({
      recordProvider: async () => [
        { curie: 'local:MAT-ETH-01', label: 'ethanol working stock', namespace: 'local' } as ProviderHit,
      ],
    });
    const resolver = createCompileOntologyResolver(spine, { localOnly: true });
    const hits = await resolver('ethanol');
    expect(hits.length).toBeGreaterThan(0);
    expect(hits[0]!.id).toBe('local:MAT-ETH-01');
  });
});
