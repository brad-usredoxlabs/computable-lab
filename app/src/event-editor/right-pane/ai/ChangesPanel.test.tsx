import { describe, it, expect, vi } from 'vitest'
import { render, screen, fireEvent, cleanup } from '@testing-library/react'
import { ChangesPanel, protocolEditDiffFrom } from './ChangesPanel'
import type { ProtocolEditDiff } from './sidebarState'

describe('ChangesPanel', () => {
  it('renders changes with + prefix for additions', () => {
    render(
      <ChangesPanel
        changes={[
          { op: 'add', description: 'Dispense complete DMEM into A1-H12' },
          { op: 'add', description: 'Agitate at 600 rpm for 5 min' },
        ]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/Dispense complete DMEM/)).toBeDefined()
    expect(screen.getByText(/Agitate at 600 rpm/)).toBeDefined()
    expect(screen.getByText('Apply to run')).toBeDefined()
  })

  it('shows warnings', () => {
    render(
      <ChangesPanel
        changes={[]}
        warnings={[{ code: 'cap-gap', message: 'No shaker supports 1500 rpm', severity: 'warning' }]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText(/No shaker supports 1500 rpm/)).toBeDefined()
  })

  it('fires onApply when button clicked', () => {
    const onApply = vi.fn()
    render(
      <ChangesPanel
        changes={[{ op: 'add', description: 'test' }]}
        warnings={[]}
        onApply={onApply}
        onDiscard={vi.fn()}
      />,
    )
    fireEvent.click(screen.getByText('Apply to run'))
    expect(onApply).toHaveBeenCalledOnce()
  })

  it('fires onDiscard when discard clicked', () => {
    const onDiscard = vi.fn()
    render(
      <ChangesPanel
        changes={[{ op: 'add', description: 'test' }]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={onDiscard}
      />,
    )
    fireEvent.click(screen.getByText('Discard'))
    expect(onDiscard).toHaveBeenCalledOnce()
  })

  it('shows - prefix for removals and ~ for modifications', () => {
    render(
      <ChangesPanel
        changes={[
          { op: 'remove', description: 'Old step' },
          { op: 'modify', description: 'Changed step' },
        ]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByText('-')).toBeDefined()
    expect(screen.getByText('~')).toBeDefined()
  })

  // ------------------------------------------------------------- protocol edit
  // A `protocol_edit` proposal rendered inside THIS review surface (D1: no new
  // approval rail). Event-graph rows must stay byte-unchanged; everything under
  // `changes-panel__protocol` only exists when `protocolDiff` is supplied.
  const protocolDiff: ProtocolEditDiff = {
    protocol: { recordId: 'PROT-000123', title: 'Hep G2 ROS assay' },
    ops: [
      {
        op: 'add',
        target: { type: 'step', stepId: '' },
        after: { label: 'Wash', kind: 'wash', description: 'Wash the cells twice with 200 uL PBS' },
        position: { anchorStepId: 'step-read', relative: 'after' },
      },
      {
        op: 'remove',
        target: { type: 'step', stepId: 'step-centrifuge' },
        before: { label: 'Centrifuge', kind: 'other', description: 'Centrifuge at 300 g for 5 min' },
      },
      {
        op: 'modify',
        target: { type: 'step', stepId: 'step-incubate' },
        before: {
          label: 'Incubate',
          kind: 'incubate',
          description: 'Incubate 30 min at 37 C',
          settings: [{ settingId: 'duration', label: 'Duration', type: 'duration', defaultValue: 'PT30M' }],
        },
        after: {
          label: 'Incubate',
          kind: 'incubate',
          description: 'Incubate 45 min at 37 C',
          settings: [{ settingId: 'duration', label: 'Duration', type: 'duration', defaultValue: 'PT45M' }],
        },
      },
      {
        op: 'add',
        target: { type: 'role', roleKind: 'labwareRoles', roleId: 'labware_dark_reader' },
        after: {
          roleId: 'labware_dark_reader',
          description: 'Black opaque 96-well plate',
          expectedLabwareKinds: ['lab-plate-96-black'],
        },
      },
      {
        op: 'remove',
        target: { type: 'role', roleKind: 'instrumentRoles', roleId: 'equipment_water_bath' },
        before: { roleId: 'equipment_water_bath', description: '37 C water bath' },
      },
    ],
  }

  function renderProtocol(props?: Partial<Parameters<typeof ChangesPanel>[0]>) {
    return render(
      <ChangesPanel
        changes={[]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
        protocolDiff={protocolDiff}
        {...props}
      />,
    )
  }

  it('renders the protocol diff with the target protocol named', () => {
    renderProtocol()
    const target = screen.getByTestId('protocol-diff-target')
    expect(target.textContent).toContain('Hep G2 ROS assay')
    expect(target.textContent).toContain('PROT-000123')
  })

  it('renders step add/update/remove with + / ~ / - prefixes, text, kind, settings, position', () => {
    renderProtocol()
    const rows = screen.getAllByTestId('protocol-edit-row')
    expect(rows).toHaveLength(5)
    // prefixes: +, -, ~, +, -
    expect(rows.map((r) => r.querySelector('.changes-panel__change-prefix')?.textContent)).toEqual([
      '+', '-', '~', '+', '-',
    ])
    // step add: new label, kind, step text, and the anchor position
    expect(rows[0]!.textContent).toContain('Wash')
    expect(rows[0]!.textContent).toContain('Wash the cells twice with 200 uL PBS')
    expect(rows[0]!.textContent).toContain('wash')
    expect(rows[0]!.textContent).toContain('after step-read')
    // step remove: the step being deleted, with its text
    expect(rows[1]!.textContent).toContain('step-centrifuge')
    expect(rows[1]!.textContent).toContain('Centrifuge at 300 g for 5 min')
    // step modify: before AND after text, kind, and setting values on both sides
    expect(rows[2]!.textContent).toContain('Incubate 30 min at 37 C')
    expect(rows[2]!.textContent).toContain('Incubate 45 min at 37 C')
    expect(rows[2]!.textContent).toContain('PT30M')
    expect(rows[2]!.textContent).toContain('PT45M')
    // role add incl. expectedLabwareKinds; role remove
    expect(rows[3]!.textContent).toContain('labware_dark_reader')
    expect(rows[3]!.textContent).toContain('Black opaque 96-well plate')
    expect(rows[3]!.textContent).toContain('lab-plate-96-black')
    expect(rows[4]!.textContent).toContain('equipment_water_bath')
  })

  it('labels the actions Accept / Reject when a protocol diff is shown, and leaves event-graph labels alone', () => {
    renderProtocol()
    expect(screen.getByTestId('changes-apply').textContent).toBe('Accept')
    expect(screen.getByText('Reject')).toBeDefined()
    cleanup()
    render(
      <ChangesPanel
        changes={[{ op: 'add', description: 'x' }]}
        warnings={[]}
        onApply={vi.fn()}
        onDiscard={vi.fn()}
      />,
    )
    expect(screen.getByTestId('changes-apply').textContent).toBe('Apply to run')
    expect(screen.getByText('Discard')).toBeDefined()
  })

  it('disables Accept while applying and on a conflict, and shows the conflict message verbatim', () => {
    const onApply = vi.fn()
    renderProtocol({
      onApply,
      applying: true,
      applyError: 'Someone changed this protocol - reload and try again.',
    })
    const btn = screen.getByTestId('changes-apply') as HTMLButtonElement
    expect(btn.disabled).toBe(true)
    fireEvent.click(btn)
    expect(onApply).not.toHaveBeenCalled()
    expect(screen.getByRole('alert').textContent).toBe(
      'Someone changed this protocol - reload and try again.',
    )
    expect(screen.getByRole('status').textContent).toContain('Applying')
  })

  it('fires onApply/onDiscard from Accept/Reject in protocol mode', () => {
    const onApply = vi.fn()
    const onDiscard = vi.fn()
    renderProtocol({ onApply, onDiscard })
    fireEvent.click(screen.getByTestId('changes-apply'))
    fireEvent.click(screen.getByText('Reject'))
    expect(onApply).toHaveBeenCalledOnce()
    expect(onDiscard).toHaveBeenCalledOnce()
  })
})

describe('protocolEditDiffFrom', () => {
  const context = {
    steps: [
      { stepId: 'step-seed', label: 'Seed cells', kind: 'add_material', description: 'Seed 10k cells per well', ordinal: 1 },
      { stepId: 'step-read', label: 'Read plate', kind: 'read', description: 'Read fluorescence', ordinal: 2 },
      { stepId: 'step-centrifuge', label: 'Centrifuge', kind: 'other', description: 'Centrifuge at 300 g', ordinal: 3 },
    ],
    labwareRoles: [
      { roleId: 'labware_plate', description: 'Culture plate', expectedLabwareKinds: ['lab-plate-96'] },
    ],
    instrumentRoles: [
      { roleId: 'equipment_bath', description: 'Water bath' },
    ],
  }

  it('maps envelope step ops to display ops with before hydrated from the attached protocol', () => {
    const diff = protocolEditDiffFrom(
      {
        ops: [
          { op: 'step_insert', afterStepId: 'step-read', label: 'Wash', kind: 'wash', description: 'Wash twice' },
          { op: 'step_delete', stepId: 'step-centrifuge' },
          {
            op: 'step_update',
            stepId: 'step-seed',
            description: 'Seed 20k cells per well',
            settings: [{ settingId: 'density', label: 'Density', type: 'number', defaultValue: 20000 }],
          },
        ],
      },
      { recordId: 'PROT-1', title: 'Assay' },
      context,
    )
    expect(diff).not.toBeNull()
    const ops = diff!.ops
    expect(ops[0]).toEqual({
      op: 'add',
      target: { type: 'step', stepId: '' },
      after: { label: 'Wash', kind: 'wash', description: 'Wash twice' },
      position: { anchorStepId: 'step-read', relative: 'after' },
    })
    expect(ops[1]).toEqual({
      op: 'remove',
      target: { type: 'step', stepId: 'step-centrifuge' },
      before: { label: 'Centrifuge', kind: 'other', description: 'Centrifuge at 300 g' },
    })
    expect(ops[2]!.op).toBe('modify')
    expect(ops[2]!.before).toEqual({
      label: 'Seed cells',
      kind: 'add_material',
      description: 'Seed 10k cells per well',
    })
    expect(ops[2]!.after).toEqual({
      label: 'Seed cells',
      description: 'Seed 20k cells per well',
      settings: [{ settingId: 'density', label: 'Density', type: 'number', defaultValue: 20000 }],
    })
    expect(diff!.protocol).toEqual({ recordId: 'PROT-1', title: 'Assay' })
  })

  it('maps labware/equipment role ops to role targets incl. expectedLabwareKinds', () => {
    const diff = protocolEditDiffFrom(
      {
        ops: [
          { op: 'labware_add', roleId: 'labware_dark_reader', description: 'Black plate', expectedLabwareKinds: ['lab-plate-96-black'] },
          { op: 'labware_update', roleId: 'labware_plate', expectedLabwareKinds: ['lab-plate-96-black'] },
          { op: 'equipment_delete', roleId: 'equipment_bath' },
        ],
      },
      { recordId: 'PROT-1' },
      context,
    )
    expect(diff).not.toBeNull()
    const ops = diff!.ops
    expect(ops[0]!.op).toBe('add')
    expect(ops[0]!.target).toEqual({ type: 'role', roleKind: 'labwareRoles', roleId: 'labware_dark_reader' })
    expect(ops[0]!.after).toEqual({
      roleId: 'labware_dark_reader',
      description: 'Black plate',
      expectedLabwareKinds: ['lab-plate-96-black'],
    })
    expect(ops[1]!.op).toBe('modify')
    expect(ops[1]!.before).toEqual({
      roleId: 'labware_plate',
      description: 'Culture plate',
      expectedLabwareKinds: ['lab-plate-96'],
    })
    expect(ops[2]!.target).toEqual({ type: 'role', roleKind: 'instrumentRoles', roleId: 'equipment_bath' })
    expect(ops[2]!.before).toEqual({ roleId: 'equipment_bath', description: 'Water bath' })
  })

  it('returns null when nothing maps (falls through to the event-graph path)', () => {
    expect(protocolEditDiffFrom({ ops: [] }, { recordId: 'PROT-1' }, context)).toBeNull()
    expect(
      protocolEditDiffFrom({ ops: [{ somethingElse: true }] }, { recordId: 'PROT-1' }, context),
    ).toBeNull()
  })

  it('carries position before/after and survives a missing context snapshot', () => {
    const diff = protocolEditDiffFrom(
      { ops: [{ op: 'step_insert', beforeStepId: 'step-seed', label: 'Wash', kind: 'wash' }] },
      { recordId: 'PROT-1' },
    )
    expect(diff!.ops[0]!.position).toEqual({ anchorStepId: 'step-seed', relative: 'before' })
    // No context: before/after still describe the proposal itself.
    expect(diff!.ops[0]!.before).toBeUndefined()
    expect(diff!.ops[0]!.after).toEqual({ label: 'Wash', kind: 'wash' })
  })
})
