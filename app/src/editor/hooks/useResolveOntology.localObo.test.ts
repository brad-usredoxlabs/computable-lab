// @vitest-environment jsdom
/**
 * L2-ONTOLOGY-ANCHOR-SOURCES-1 (o3uispec) — client pin for the
 * useResolveOntology local-obo opt-in.
 *
 * The resolve spine (server/src/resolve/ResolveSpine.ts:174) serves the
 * in-house `local-obo` tier, but the shared hook every ref combobox uses
 * filtered candidates to canonical-term | oak | ols4 — so the LWO rows a
 * labware-definition anchor needs never reached a ref field (LEG 2).
 *
 * The fix is a per-field opt-in: the hook keeps `local-obo` candidates ONLY
 * when the caller passes includeLocalObo: true. The combobox derives that
 * flag from the field's own declared sources (same data-driven shape as the
 * existing 'ols' switch) — never a global default flip, so every field that
 * does not declare 'local-obo' stays decoy-free (AC2: claim $.subject typing
 * "plate" returns NO LWO rows).
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { renderHook, waitFor, cleanup } from '@testing-library/react'
import type { ResolveCandidate } from '../../shared/api/client'

const LWO_CANDIDATE: ResolveCandidate = {
  curie: 'LWO:0000100',
  label: 'labware',
  namespace: 'LWO',
  tier: 2,
  level: 'concept',
  score: 0.9,
  source: 'local-obo',
}
const OLS4_CANDIDATE: ResolveCandidate = {
  curie: 'UBERON:0000001',
  label: 'multicellular organism',
  namespace: 'UBERON',
  tier: 3,
  level: 'concept',
  score: 0.5,
  source: 'ols4',
}

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    resolve: vi.fn(async () => ({ candidates: [LWO_CANDIDATE, OLS4_CANDIDATE] })),
  },
}))

import { useResolveOntology } from './useResolveOntology'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

describe('useResolveOntology local-obo opt-in', () => {
  it('keeps local-obo candidates when includeLocalObo is set (alongside the other ontology tiers)', async () => {
    const { result } = renderHook(() =>
      useResolveOntology({ query: 'plate', debounceMs: 1, includeLocalObo: true }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    const curies = result.current.results.map((c) => c.curie)
    expect(curies).toContain('LWO:0000100')
    expect(curies).toContain('UBERON:0000001')
  })

  it('still drops local-obo candidates without the option (today behavior — keeps other ref fields decoy-free)', async () => {
    const { result } = renderHook(() =>
      useResolveOntology({ query: 'plate', debounceMs: 1 }),
    )
    await waitFor(() => expect(result.current.loading).toBe(false))
    const curies = result.current.results.map((c) => c.curie)
    expect(curies).not.toContain('LWO:0000100')
    // the non-local-obo spine tiers are untouched
    expect(curies).toContain('UBERON:0000001')
  })
})
