import { describe, expect, it, vi } from 'vitest'
import type { DraftOntologyBinding } from '../../types/ai'
import type { PlateEvent } from '../../types/events'
import {
  inferDomainFromCurie,
  localMaterialIdForCurie,
  materializeAcceptedOntologyBindings,
  rewriteAcceptedOntologyRefs,
} from './acceptedOntologyBindings'

const binding = (curie: string, label: string): DraftOntologyBinding => ({
  curie,
  recordId: curie,
  label,
  minted: false,
  via: 'class-ref',
  draftOnly: true,
})

describe('accepted ontology bindings', () => {
  it('derives stable local material IDs and domains from CURIEs', () => {
    expect(localMaterialIdForCurie('CHEBI:5001')).toBe('MAT-CHEBI-5001')
    expect(inferDomainFromCurie('CHEBI:5001')).toBe('chemical')
    expect(inferDomainFromCurie('CL:0000182')).toBe('cell_line')
    expect(inferDomainFromCurie('NCBITAXON:9606')).toBe('organism')
  })

  it('creates proposed material records for unique draft-only bindings', async () => {
    const createRecord = vi.fn().mockResolvedValue({ success: true })
    const out = await materializeAcceptedOntologyBindings([
      binding('CHEBI:5001', 'fenofibrate'),
      binding('CHEBI:5001', 'fenofibrate'),
      { ...binding('MAT-EXISTING', 'existing'), draftOnly: false },
    ], createRecord)

    expect(out).toEqual([{ curie: 'CHEBI:5001', recordId: 'MAT-CHEBI-5001', label: 'fenofibrate' }])
    expect(createRecord).toHaveBeenCalledTimes(1)
    expect(createRecord.mock.calls[0]![1]).toMatchObject({
      kind: 'material',
      id: 'MAT-CHEBI-5001',
      name: 'fenofibrate',
      domain: 'chemical',
      status: 'proposed',
      lifecycleId: 'lab-vocabulary-control',
      class: [{ kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate' }],
      provenance: expect.objectContaining({
        source: 'ai_mention',
        sourceCurie: 'CHEBI:5001',
        createdBy: 'human_accept',
      }),
    })
  })

  it('rewrites accepted ontology refs in preview event details to local material refs', () => {
    const events: PlateEvent[] = [{
      eventId: 'evt-1',
      event_type: 'add_material',
      details: {
        material_ref: { kind: 'ontology', id: 'CHEBI:5001', namespace: 'CHEBI', label: 'fenofibrate' },
        recordId: 'CHEBI:5001',
        nested: { source_material_ref: 'CHEBI:5001' },
      } as PlateEvent['details'],
    }]

    const rewritten = rewriteAcceptedOntologyRefs(events, [{
      curie: 'CHEBI:5001',
      recordId: 'MAT-CHEBI-5001',
      label: 'fenofibrate',
    }])

    expect(rewritten).not.toBe(events)
    expect(rewritten[0]!.details).toMatchObject({
      material_ref: { kind: 'record', id: 'MAT-CHEBI-5001', type: 'material', label: 'fenofibrate' },
      recordId: 'MAT-CHEBI-5001',
      nested: {
        source_material_ref: { kind: 'record', id: 'MAT-CHEBI-5001', type: 'material', label: 'fenofibrate' },
      },
    })
  })

  it('materializes a replaced binding under the user-chosen CURIE, not the AI pick', async () => {
    const createRecord = vi.fn().mockResolvedValue({ success: true })
    const out = await materializeAcceptedOntologyBindings(
      [binding('CHEBI:5001', 'fenofibrate')],
      createRecord,
      { 'CHEBI:5001': { status: 'replaced', curie: 'CHEBI:6001', label: 'clofibrate' } },
    )

    expect(out).toEqual([{ curie: 'CHEBI:6001', recordId: 'MAT-CHEBI-6001', label: 'clofibrate' }])
    expect(createRecord).toHaveBeenCalledTimes(1)
    const [, payload] = createRecord.mock.calls[0]!
    expect(payload).toMatchObject({
      id: 'MAT-CHEBI-6001',
      name: 'clofibrate',
      class: [{ kind: 'ontology', id: 'CHEBI:6001', namespace: 'CHEBI', label: 'clofibrate' }],
    })
  })

  it('reuses an existing local record when the replacement resolves to one (no mint)', async () => {
    const createRecord = vi.fn()
    const out = await materializeAcceptedOntologyBindings(
      [binding('CHEBI:5001', 'fenofibrate')],
      createRecord,
      { 'CHEBI:5001': { status: 'replaced', curie: 'MAT-LOCAL-FENO', label: 'fenofibrate', recordId: 'MAT-LOCAL-FENO' } },
    )

    expect(out).toEqual([{ curie: 'MAT-LOCAL-FENO', recordId: 'MAT-LOCAL-FENO', label: 'fenofibrate' }])
    expect(createRecord).not.toHaveBeenCalled()
  })
})
