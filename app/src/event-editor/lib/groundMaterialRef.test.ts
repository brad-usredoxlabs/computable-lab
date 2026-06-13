import { afterEach, describe, expect, it, vi } from 'vitest'
import type { Ref } from '../../types/ref'

const groundOntologyMaterial = vi.fn()
vi.mock('../../shared/api/client', () => ({
  apiClient: { groundOntologyMaterial: (...args: unknown[]) => groundOntologyMaterial(...args) },
}))

import { groundMaterialRef } from './groundMaterialRef'

afterEach(() => { groundOntologyMaterial.mockReset() })

describe('groundMaterialRef', () => {
  it('passes a record ref through without calling the API', async () => {
    const ref: Ref = { kind: 'record', id: 'MAT-1', type: 'material', label: 'Tris' }
    expect(await groundMaterialRef(ref)).toBe(ref)
    expect(groundOntologyMaterial).not.toHaveBeenCalled()
  })

  it('grounds an ontology ref to the returned local material record', async () => {
    groundOntologyMaterial.mockResolvedValue({
      materialRef: { kind: 'record', id: 'MAT-CHEBI-3750', type: 'material', label: 'clofibrate' },
      profileId: 'chemical',
    })
    const ref: Ref = { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' }
    const out = await groundMaterialRef(ref)
    expect(out).toEqual({ kind: 'record', id: 'MAT-CHEBI-3750', type: 'material', label: 'clofibrate' })
    expect(groundOntologyMaterial).toHaveBeenCalledWith({
      ontologyRef: ref,
      sourceLabel: 'clofibrate',
    })
  })

  it('falls back to the original ref if grounding fails (accept-time is the net)', async () => {
    groundOntologyMaterial.mockRejectedValue(new Error('offline'))
    const ref: Ref = { kind: 'ontology', id: 'CHEBI:3750', namespace: 'CHEBI', label: 'clofibrate' }
    expect(await groundMaterialRef(ref)).toBe(ref)
  })
})
