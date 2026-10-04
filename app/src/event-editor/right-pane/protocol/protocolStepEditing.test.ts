import { describe, expect, it } from 'vitest'
import { deleteProtocolStep, insertProtocolStep, protocolResourceSummaries } from './protocolStepEditing'

const original = {
  kind: 'protocol', steps: [
    { stepId: 's1', ordinal: 1, phaseId: 'lysis', label: 'Lyse', subGraphRef: { id: 'EVG-1' } },
    { stepId: 's2', ordinal: 2, label: 'Wash', subGraphRef: { id: 'EVG-2' } },
  ],
  variants: [{ variantId: 'soil', stepIds: ['s1', 's2'] }],
  branch_axes: [{ axisId: 'sample', shared_stepIds: ['s2'], conditions: [
    { id: 'soil', then_stepIds: ['s1'], else_stepIds: ['s2'] },
  ] }],
  source: { ingestion: { stepIds: ['s1', 's2'] } },
}

describe('protocol step ordering', () => {
  it('inserts within the same phase and branches, preserving existing IDs and graph links', () => {
    const result = insertProtocolStep(original, 's1', 'before', { stepId: 's-new', label: 'Prepare', kind: 'other' })
    expect(result.steps).toEqual([
      { stepId: 's-new', label: 'Prepare', kind: 'other', phaseId: 'lysis', ordinal: 1 },
      { ...original.steps[0], ordinal: 2 }, { ...original.steps[1], ordinal: 3 },
    ])
    expect(result.variants).toEqual([{ variantId: 'soil', stepIds: ['s-new', 's1', 's2'] }])
    expect(result.branch_axes).toEqual([{ ...original.branch_axes[0], conditions: [
      { id: 'soil', then_stepIds: ['s-new', 's1'], else_stepIds: ['s2'] },
    ] }])
    expect(original.steps).toHaveLength(2)
  })

  it('deletes branch membership and renumbers without changing remaining IDs or provenance', () => {
    const result = deleteProtocolStep(original, 's1')
    expect(result.steps).toEqual([{ ...original.steps[1], ordinal: 1 }])
    expect(result.variants).toEqual([{ variantId: 'soil', stepIds: ['s2'] }])
    expect(result.branch_axes).toEqual([{ ...original.branch_axes[0], conditions: [
      { id: 'soil', then_stepIds: [], else_stepIds: ['s2'] },
    ] }])
    expect(result.source).toEqual(original.source)
    expect(original.steps).toHaveLength(2)
  })

  it('rejects stale anchors, duplicate IDs, the last step, and executed steps', () => {
    expect(() => insertProtocolStep(original, 'missing', 'after', { stepId: 'new' })).toThrow('no longer exists')
    expect(() => insertProtocolStep(original, 's1', 'after', { stepId: 's2' })).toThrow('already exists')
    expect(() => deleteProtocolStep({ ...original, steps: [original.steps[0]] }, 's1')).toThrow('at least one')
    expect(() => deleteProtocolStep({ ...original, steps: [{ ...original.steps[0], executionMeta: { startedAt: 'today' } }, original.steps[1]] }, 's1')).toThrow('already been executed')
  })

  it('respects the controlled-document content lock', () => {
    const controlled = { ...original, lifecycleId: 'document-controlled-signing', state: 'effective' }
    expect(() => insertProtocolStep(controlled, 's1', 'after', { stepId: 'new' })).toThrow('locked')
    expect(() => deleteProtocolStep(controlled, 's1')).toThrow('locked')
  })
})

describe('protocol declared resources (rail sections)', () => {
  it('reads declared labware and instrument roles into rail summaries', () => {
    const payload = {
      kind: 'protocol',
      roles: {
        labwareRoles: [
          { roleId: 'deep-well-block', description: 'deep-well block' },
          { roleId: 'bashingbead-lysis-rack' },
        ],
        instrumentRoles: [{ roleId: 'bead-beater', description: 'bead beater' }],
        materialRoles: [{ roleId: 'lysis-buffer', description: 'not a resource section' }],
      },
    }
    expect(protocolResourceSummaries(payload)).toEqual({
      labwares: [
        { roleId: 'deep-well-block', description: 'deep-well block' },
        { roleId: 'bashingbead-lysis-rack' },
      ],
      equipment: [{ roleId: 'bead-beater', description: 'bead beater' }],
    })
  })

  it('drops unnamed declarations and tolerates a protocol with no roles', () => {
    expect(protocolResourceSummaries({ kind: 'protocol' })).toEqual({ labwares: [], equipment: [] })
    expect(protocolResourceSummaries({ roles: {} })).toEqual({ labwares: [], equipment: [] })
    expect(
      protocolResourceSummaries({ roles: { labwareRoles: [{ description: 'no id' }, {}, null] } }).labwares,
    ).toEqual([])
  })

  it('reads roles on an inherited/locked protocol (unlike step edits, which throw)', () => {
    const inherited = {
      kind: 'local-protocol',
      lifecycleId: 'document-controlled-signing',
      state: 'effective',
      roles: { labwareRoles: [{ roleId: 'plate' }] },
    }
    expect(() => deleteProtocolStep(inherited, 's1')).toThrow()
    expect(protocolResourceSummaries(inherited).labwares).toEqual([{ roleId: 'plate' }])
  })
})
