// @vitest-environment node
/** Domain filter set semantics (unit 6).
 *  A candidate is eligible when ANY declared tag admits it.
 *  A positive claim outside the whole set is still rejected.
 *  A claim-less candidate stays eligible under any declaration. */
import { describe, expect, it } from 'vitest';
import { filterCandidatesByDeclaredDomain } from './adapters.js';
import type { RankedCandidate } from '../../resolve/types.js';

function makeCandidate(overrides: Partial<RankedCandidate>): RankedCandidate {
  return {
    curie: 'local:TERM-TEST',
    label: 'test',
    namespace: 'local',
    tier: 0,
    level: 'unknown',
    score: 1.0,
    source: 'canonical-term',
    ...overrides,
  };
}

describe('domainSetFilter', () => {
  it('set membership: material candidate is eligible under [labware, material]', () => {
    const candidates = [makeCandidate({ termKind: 'material' })];
    const result = filterCandidatesByDeclaredDomain(candidates, ['labware', 'material']);
    expect(result.eligible.length).toBe(1);
    expect(result.rejected.length).toBe(0);
  });

  it('set membership: material candidate is rejected under labware alone', () => {
    const candidates = [makeCandidate({ termKind: 'material' })];
    const result = filterCandidatesByDeclaredDomain(candidates, 'labware');
    expect(result.eligible.length).toBe(0);
    expect(result.rejected.length).toBe(1);
  });

  it('conflict arm: instrument candidate is rejected under [labware, material]', () => {
    const candidates = [makeCandidate({ termKind: 'instrument' })];
    const result = filterCandidatesByDeclaredDomain(candidates, ['labware', 'material']);
    expect(result.eligible.length).toBe(0);
    expect(result.rejected.length).toBe(1);
  });

  it('no-claim arm: candidate without termKind is eligible under [labware, material]', () => {
    const candidates = [makeCandidate()]; // no termKind
    const result = filterCandidatesByDeclaredDomain(candidates, ['labware', 'material']);
    expect(result.eligible.length).toBe(1);
    expect(result.rejected.length).toBe(0);
  });

  it('no-claim arm: candidate without termKind is eligible under single tag', () => {
    const candidates = [makeCandidate()]; // no termKind
    const result = filterCandidatesByDeclaredDomain(candidates, 'labware');
    expect(result.eligible.length).toBe(1);
    expect(result.rejected.length).toBe(0);
  });

  it('empty array behaves like undefined (all eligible)', () => {
    const candidates = [makeCandidate({ termKind: 'material' })];
    const result = filterCandidatesByDeclaredDomain(candidates, [] as readonly string[]);
    expect(result.eligible.length).toBe(1);
    expect(result.rejected.length).toBe(0);
  });

  it('cellType domain admits CL-namespace candidates via namespace filter (advc DEFECT 1)', () => {
    // declaredDomains lowercases tags; ONTOLOGY_DOMAINS keys are camelCase.
    // A CL-namespace candidate must be admitted under 'cellType' because CL
    // is the primary namespace. It should NOT fall through to the conflict
    // landing-zone check — the namespace filter owns admission.
    const candidates = [makeCandidate({ namespace: 'CL', termKind: 'material' })];
    const result = filterCandidatesByDeclaredDomain(candidates, 'cellType');
    expect(result.eligible.length).toBe(1);
    expect(result.rejected.length).toBe(0);
  });
});
