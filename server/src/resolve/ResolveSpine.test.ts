import { afterEach, describe, expect, it } from 'vitest';
import { createResolveSpine, createResolveSpineFromContext, localOboTierEnabled } from './ResolveSpine.js';
import { createLocalOboProvider } from './providers/localObo.js';
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

  it('ranks shipped .obo hits at tier 2 as source local-obo (visible under localOnly)', async () => {
    stubFetch({});
    const spine = createResolveSpine({
      localOboProvider: staticProvider([
        { curie: 'LWO:0000100', label: 'well plate 96', namespace: 'LWO', level: 'concept' },
      ]),
    });
    const out = await spine.resolve('plate');
    const hit = out.find((c) => c.curie === 'LWO:0000100');
    expect(hit).toBeDefined();
    expect(hit?.source).toBe('local-obo');
    expect(hit?.tier).toBe(2);
    const localOnly = await spine.resolve('plate', { localOnly: true });
    expect(localOnly.some((c) => c.curie === 'LWO:0000100')).toBe(true);
  });

  it('skips the OAK tier when no service URL is configured', async () => {
    stubFetch({ oak: [{ curie: 'CHEBI:4593', label: 'fenofibrate' }] });
    const spine = createResolveSpine(); // no ontology config, no env
    const out = await spine.resolve('fenofibrate');
    expect(out.some((c) => c.source === 'oak')).toBe(false);
  });

  it('drops ontology hits that have no lexical support for the searched term', async () => {
    stubFetch({ oak: [{ curie: 'NCBITaxon:10275', label: 'Suipoxvirus', namespace: 'NCBITaxon' }] });
    const spine = createResolveSpine({
      ontology: { serviceUrl: 'http://127.0.0.1:8766', localOntologies: ['ncbitaxon'] },
    });

    const out = await spine.resolve('HepG2 cells');
    expect(out.some((candidate) => candidate.curie === 'NCBITaxon:10275')).toBe(false);
    expect(out[0]?.source).toBe('mint');
    expect(out[0]?.mint?.label).toBe('HepG2 cells');
  });

  it('keeps acronym-supported ontology hits for media components', async () => {
    stubFetch({
      oak: [
        { curie: 'XCO:0000988', label: "Dulbecco's Modified Eagle's Medium", namespace: 'XCO' },
        { curie: 'MSIO:0000017', label: 'fetal bovine serum', namespace: 'MSIO' },
      ],
    });
    const spine = createResolveSpine({
      ontology: { serviceUrl: 'http://127.0.0.1:8766', localOntologies: ['xco', 'msio'] },
    });

    expect((await spine.resolve('DMEM'))[0]?.curie).toBe('XCO:0000988');
    expect((await spine.resolve('FBS'))[0]?.curie).toBe('MSIO:0000017');
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

  it('surfaces vendor hits with source vendor when a vendor provider is wired', async () => {
    stubFetch({});
    const spine = createResolveSpine({
      vendorProvider: staticProvider([{ curie: 'local:vendor-catalog-abc1', label: 'Cayman Rotenone 1 mM', namespace: 'local', uri: 'https://example.com/rotenone' }]),
    });
    const out = await spine.resolve('rotenone');
    const vendor = out.find((c) => c.source === 'vendor');
    expect(vendor).toBeDefined();
    expect(vendor?.tier).toBe(4);
    expect(vendor?.uri).toBe('https://example.com/rotenone');
  });

  it('carries formulationDeclared into RankedCandidate when the hit provides it', async () => {
    stubFetch({});
    const spine = createResolveSpine({
      recordProvider: staticProvider([
        { curie: 'local:MAT-9', label: 'formulated record', namespace: 'local', formulationDeclared: true },
      ]),
    });
    const out = await spine.resolve('formulated');
    expect(out.find((c) => c.curie === 'local:MAT-9')?.formulationDeclared).toBe(true);
  });

  it('omits formulationDeclared from RankedCandidate when the hit does not carry it', async () => {
    stubFetch({});
    const spine = createResolveSpine({
      recordProvider: staticProvider([
        { curie: 'local:MAT-10', label: 'plain record', namespace: 'local' },
      ]),
    });
    const out = await spine.resolve('plain');
    expect('formulationDeclared' in (out.find((c) => c.curie === 'local:MAT-10') ?? {})).toBe(false);
  });

  it('D2 consumer pin: a single-token generic noun ("sample") adds no local-obo candidates (tier additive)', async () => {
    stubFetch({});
    const withTier = createResolveSpine({ localOboProvider: createLocalOboProvider() });
    const out = await withTier.resolve('sample');
    expect(out.filter((c) => c.source === 'local-obo')).toEqual([]);
    // Base-equality: the single-token noun resolves identically with the tier off.
    const base = await createResolveSpine({}).resolve('sample');
    expect(out.filter((c) => c.tier < 5).map((c) => c.curie)).toEqual(
      base.filter((c) => c.tier < 5).map((c) => c.curie),
    );
  });
});

describe('local-obo tier conditional mount', () => {
  const scratchDir = '/home/brad/.ontocond-scratch';
  const shippedRegistryPath = undefined; // defaults to server/config/ontology-sources.yaml

  it('localOboTierEnabled returns true when shipped registry has enabled local-obo sources', () => {
    expect(localOboTierEnabled(shippedRegistryPath)).toBe(true);
  });

  it('localOboTierEnabled returns false when all sources are disabled', () => {
    expect(localOboTierEnabled(`${scratchDir}/test-disabled-registry.yaml`)).toBe(false);
  });

  it('localOboTierEnabled returns false when registry path does not exist', () => {
    expect(localOboTierEnabled('/nonexistent/path.yaml')).toBe(false);
  });

  it('spine respects disabled registry: no candidates from source local-obo', async () => {
    stubFetch({});
    const disabledSpine = createResolveSpineFromContext({
      store: {} as any,
      localOboRegistryPath: `${scratchDir}/test-disabled-registry.yaml`,
    });
    const out = await disabledSpine.resolve('plate');
    expect(out.filter((c) => c.source === 'local-obo')).toEqual([]);
  });

  it('spine accepts custom registry path via context.factory override', async () => {
    stubFetch({});
    const disabledSpine = createResolveSpineFromContext({
      store: {} as any,
      localOboRegistryPath: `${scratchDir}/test-disabled-registry.yaml`,
    });
    const localOnlyOut = await disabledSpine.resolve('plate', { localOnly: true });
    expect(localOnlyOut.filter((c) => c.source === 'local-obo')).toEqual([]);
    expect(localOnlyOut[localOnlyOut.length - 1]?.source).toBe('mint');
  });
});
