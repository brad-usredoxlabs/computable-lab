import { describe, expect, it } from 'vitest'
import {
  addInstrumentRole,
  addLabwareRole,
  deleteInstrumentRole,
  deleteLabwareRole,
  deleteProtocolStep,
  insertProtocolStep,
  protocolResourceSummaries,
  updateInstrumentRole,
  updateLabwareRole,
} from './protocolStepEditing'

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

describe('declared-role editing (labware + equipment)', () => {
  const withRoles = () => ({
    kind: 'protocol',
    state: 'draft',
    steps: [{ stepId: 's1', ordinal: 1, label: 'Lyse' }],
    roles: {
      labwareRoles: [{ roleId: 'plate', description: '96-well plate' }],
      instrumentRoles: [{ roleId: 'plate_reader' }],
      materialRoles: [{ roleId: 'lysis-buffer' }],
    },
  })

  const roleLists = (payload: Record<string, unknown>) => (payload.roles ?? {}) as Record<string, Array<Record<string, unknown>>>

  it('adds, updates (listed fields only), and deletes labware roles without touching siblings', () => {
    const original = withRoles()
    const added = addLabwareRole(original, { roleId: 'reservoir', description: 'reservoir', expectedLabwareKinds: ['trough'] })
    expect(roleLists(added).labwareRoles).toEqual([
      { roleId: 'plate', description: '96-well plate' },
      { roleId: 'reservoir', description: 'reservoir', expectedLabwareKinds: ['trough'] },
    ])
    expect(roleLists(added).materialRoles).toEqual(original.roles.materialRoles)
    const updated = updateLabwareRole(added, 'plate', { description: 'deep-well plate' })
    expect(roleLists(updated).labwareRoles[0]).toEqual({ roleId: 'plate', description: 'deep-well plate' })
    const deleted = deleteLabwareRole(updated, 'reservoir')
    expect(roleLists(deleted).labwareRoles).toEqual([{ roleId: 'plate', description: 'deep-well plate' }])
    expect(roleLists(deleted).materialRoles).toEqual(original.roles.materialRoles)
    expect(original.roles.labwareRoles).toHaveLength(1) // pure: input untouched
  })

  it('mirrors the same discipline for instrument roles', () => {
    const original = withRoles()
    const added = addInstrumentRole(original, { roleId: 'bead_beater', allowedInstrumentIds: ['bead-beater-1'] })
    expect(roleLists(added).instrumentRoles).toEqual([
      { roleId: 'plate_reader' },
      { roleId: 'bead_beater', allowedInstrumentIds: ['bead-beater-1'] },
    ])
    expect(roleLists(updateInstrumentRole(added, 'plate_reader', { description: 'plate reader' })).instrumentRoles[0])
      .toEqual({ roleId: 'plate_reader', description: 'plate reader' })
    expect(roleLists(deleteLabwareRole(deleteInstrumentRole(added, 'bead_beater'), 'plate'))).toEqual({
      instrumentRoles: [{ roleId: 'plate_reader' }],
      materialRoles: [{ roleId: 'lysis-buffer' }],
    })
  })

  it('pops an emptied role list cleanly, and an emptied roles object with it', () => {
    const onlyLabware = { kind: 'protocol', state: 'draft', roles: { labwareRoles: [{ roleId: 'plate' }] } }
    const emptied = deleteLabwareRole(onlyLabware, 'plate')
    expect(emptied.roles).toBeUndefined()
    expect(Object.keys(emptied)).toEqual(['kind', 'state'])
    // Only the emptied list pops; sibling lists stay.
    const emptiedAmongst = roleLists(deleteLabwareRole(withRoles(), 'plate'))
    expect('labwareRoles' in emptiedAmongst).toBe(false)
    expect(emptiedAmongst.instrumentRoles).toEqual([{ roleId: 'plate_reader' }])
  })

  it('adding to a protocol that never declared the list creates just that list', () => {
    const bare = { kind: 'protocol', state: 'draft' }
    const result = addInstrumentRole(bare, { roleId: 'plate_reader' })
    expect(result.roles).toEqual({ instrumentRoles: [{ roleId: 'plate_reader' }] })
  })

  it('rejects a duplicate roleId on add and an undeclared roleId on update/delete', () => {
    expect(() => addLabwareRole(withRoles(), { roleId: 'plate' })).toThrow('already exists')
    expect(() => addInstrumentRole(withRoles(), { roleId: 'plate_reader' })).toThrow('already exists')
    expect(() => updateLabwareRole(withRoles(), 'ghost', { description: 'x' })).toThrow('not a declared labware role')
    expect(() => deleteInstrumentRole(withRoles(), 'ghost')).toThrow('not a declared equipment role')
  })

  it('respects the inherited and content-lock gates on role edits', () => {
    const inherited = { ...withRoles(), kind: 'local-protocol' }
    expect(() => addLabwareRole(inherited, { roleId: 'x' })).toThrow('inherited')
    const controlled = { ...withRoles(), lifecycleId: 'document-controlled-signing', state: 'effective' }
    expect(() => addLabwareRole(controlled, { roleId: 'x' })).toThrow('locked')
    expect(() => deleteInstrumentRole(controlled, 'plate_reader')).toThrow('locked')
  })
})
