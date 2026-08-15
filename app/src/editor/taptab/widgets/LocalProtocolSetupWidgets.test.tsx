import { render, screen, fireEvent } from '@testing-library/react'
import { describe, it, expect, vi, beforeEach } from 'vitest'
import {
  SetupSectionWidget,
  LocalProtocolStepsWidget,
  mentionToSetupRef,
  toRefBadgeRef,
  type SetupRow,
} from './LocalProtocolSetupWidgets'

// ProtocolMentionEditor pulls in the full TipTap + slash-menu stack. The
// widget under test only needs its contract: value/placeholder/defaultSlashCommand
// in, onCommit(text, mentions) out. Mock the module so the render tests stay
// focused on row management (the same isolation the pure-function tests in
// ProtocolAuthoringWidgets.test.ts use for the editor-adjacent helpers).
vi.mock('./ProtocolAuthoringWidgets', async () => {
  const React = await import('react')
  const actual = await vi.importActual<typeof import('./ProtocolAuthoringWidgets')>(
    './ProtocolAuthoringWidgets',
  )
  return {
    ...actual,
    removeSlashMenuRoots: () => {},
    ProtocolMentionEditor: ({
      placeholder,
      onCommit,
      defaultSlashCommand,
      defaultSlashQuery,
    }: {
      value: string
      placeholder: string
      className: string
      serialize: 'wire' | 'readable'
      defaultSlashCommand?: string
      defaultSlashQuery?: string
      onCommit: (text: string, mentions: Array<Record<string, unknown>>) => void
      onMentionSelected?: (mention: unknown) => void
    }) =>
      React.createElement('input', {
        'data-testid': 'mock-mention-editor',
        'data-slash-command': defaultSlashCommand ?? '',
        'data-slash-query': defaultSlashQuery ?? '',
        placeholder,
        onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
          onCommit(e.target.value, e.target.value ? [{ type: 'material', entityKind: 'material', id: e.target.value, label: e.target.value }] : []),
      }),
  }
})

const onCommitSpy = () => vi.fn()

describe('SetupSectionWidget', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders a section header plus rows: bound rows show ref label, unbound rows are editable lines', () => {
    const rows: SetupRow[] = [
      { role: 'Sample plate', description: '96-well', ref: { kind: 'record', id: 'LBW-0001', type: 'labware', label: '96-well PCR plate' } },
      { role: 'Reservoir' },
    ]
    render(<SetupSectionWidget kind="labware" value={rows} readOnly={false} onCommit={onCommitSpy()} />)
    // per-section header
    expect(screen.getByText('Labwares')).toBeDefined()
    // bound row renders its role + the concrete ref label
    expect(screen.getByText('Sample plate')).toBeDefined()
    expect(screen.getByText('96-well PCR plate')).toBeDefined()
    // unbound row is an editable rich-text line (slash-combobox placeholder present)
    expect(screen.getAllByTestId('mock-mention-editor').length).toBe(1)
    expect(screen.getByPlaceholderText(/pick labware/i)).toBeDefined()
  })

  it('primes the slash-combobox with the ghosted label as the section query on unbound rows', () => {
    const rows: SetupRow[] = [
      { role: 'material_proteinase_k', description: 'Proteinase K' },
      { role: 'material_pbs', description: 'PBS' },
    ]
    render(<SetupSectionWidget kind="material" value={rows} readOnly={false} onCommit={onCommitSpy()} suggestionRows={[0, 1]} />)
    const editors = screen.getAllByTestId('mock-mention-editor')
    // material section → /m command; query = the ghosted label (the search term)
    expect(editors).toHaveLength(2)
    expect(editors[0].getAttribute('data-slash-command')).toBe('m')
    expect(editors[0].getAttribute('data-slash-query')).toBe('Proteinase K')
    expect(editors[1].getAttribute('data-slash-command')).toBe('m')
    expect(editors[1].getAttribute('data-slash-query')).toBe('PBS')
  })

  it('commits an edited line with a picked mention to a bound ref', () => {
    const onCommit = onCommitSpy()
    render(<SetupSectionWidget kind="material" value={[{ role: 'material_lysis_buffer', description: 'Lysis Buffer' }]} readOnly={false} onCommit={onCommit} />)
    // the suggested/unbound row is an editable line; picking a term binds it
    fireEvent.change(screen.getByTestId('mock-mention-editor'), { target: { value: 'MAT-9999' } })
    expect(onCommit).toHaveBeenCalledWith([
      { role: 'material_lysis_buffer', description: 'MAT-9999', ref: { kind: 'record', id: 'MAT-9999', type: 'material', label: 'MAT-9999' } },
    ])
  })

  it('commits a new row with a picked ref', () => {
    const onCommit = onCommitSpy()
    render(<SetupSectionWidget kind="material" value={[]} readOnly={false} onCommit={onCommit} />)
    fireEvent.click(screen.getByRole('button', { name: /add material/i }))
    fireEvent.change(screen.getByPlaceholderText(/what is it for/i), { target: { value: 'Treatment' } })
    // Simulate the combobox picking a workspace material:
    fireEvent.change(screen.getByTestId('mock-mention-editor'), { target: { value: 'MAT-0001' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onCommit).toHaveBeenCalledWith([
      { role: 'Treatment', ref: { kind: 'record', id: 'MAT-0001', type: 'material', label: 'MAT-0001' } },
    ])
  })

  it('commits a pending row when nothing was picked', () => {
    const onCommit = onCommitSpy()
    render(<SetupSectionWidget kind="material" value={[]} readOnly={false} onCommit={onCommit} />)
    fireEvent.click(screen.getByRole('button', { name: /add material/i }))
    fireEvent.change(screen.getByPlaceholderText(/what is it for/i), { target: { value: 'Reservoir' } })
    fireEvent.click(screen.getByRole('button', { name: /^add$/i }))
    expect(onCommit).toHaveBeenCalledWith([{ role: 'Reservoir' }])
  })

  it('removes a row on x click', () => {
    const onCommit = onCommitSpy()
    render(
      <SetupSectionWidget
        kind="equipment"
        value={[{ role: 'Reader', ref: { kind: 'record', id: 'EQ-1', type: 'equipment' } }]}
        readOnly={false}
        onCommit={onCommit}
      />,
    )
    fireEvent.click(screen.getByRole('button', { name: /remove equipment row/i }))
    expect(onCommit).toHaveBeenCalledWith([])
  })

  it('renders read-only: no add/remove controls, labels only', () => {
    render(
      <SetupSectionWidget
        kind="material"
        value={[{ role: 'Dye', ref: { kind: 'ontology', id: 'CHEBI:1', namespace: 'CHEBI', label: 'dextran sulfate' } }]}
        readOnly
        onCommit={onCommitSpy()}
      />
    )
    expect(screen.queryByRole('button', { name: /add material/i })).toBeNull()
    expect(screen.queryByRole('button', { name: /remove/i })).toBeNull()
    expect(screen.getByText('dextran sulfate')).toBeDefined()
  })

  it('renders a "suggested" ghost for unbound rows in suggestionRows', () => {
    const rows: SetupRow[] = [
      { role: 'labware_96_well_plate', description: '96-well plate' },
      { role: 'Sample plate', ref: { kind: 'record', id: 'LBW-0001', type: 'labware', label: 'PCR plate' } },
      { role: 'Reservoir' },
    ]
    render(<SetupSectionWidget kind="labware" value={rows} readOnly={false} onCommit={onCommitSpy()} suggestionRows={[0]} />)
    // ghosted suggestion badge on the seeded row
    expect(screen.getByTestId('setup-row-suggested-1')).toBeDefined()
    expect(screen.getByTestId('setup-row-suggested-1').textContent).toBe('suggested')
    // bound row is NOT a suggestion
    expect(screen.queryByTestId('setup-row-suggested-2')).toBeNull()
    // user-added unbound row is an editable line but NOT ghosted as a suggestion
    expect(screen.queryByTestId('setup-row-suggested-3')).toBeNull()
    // editable line present for the two unbound rows (suggestion + user-added)
    expect(screen.getAllByTestId('mock-mention-editor').length).toBe(2)
    // still fully editable (one remove control per row)
    expect(screen.getAllByRole('button', { name: /remove labware row/i })).toHaveLength(3)
  })

  it('without suggestionRows, unbound rows are editable lines with no ghost tag (back-compat)', () => {
    const rows: SetupRow[] = [{ role: 'Reservoir' }]
    render(<SetupSectionWidget kind="labware" value={rows} readOnly={false} onCommit={onCommitSpy()} />)
    expect(screen.getByTestId('mock-mention-editor')).toBeDefined()
    expect(screen.queryByTestId('setup-row-suggested-1')).toBeNull()
  })

  it('removing a suggested row commits the remaining rows', () => {
    const onCommit = onCommitSpy()
    const rows: SetupRow[] = [
      { role: 'labware_96_well_plate' },
      { role: 'Sample plate', ref: { kind: 'record', id: 'LBW-0001', type: 'labware', label: 'PCR plate' } },
    ]
    render(<SetupSectionWidget kind="labware" value={rows} readOnly={false} onCommit={onCommit} suggestionRows={[0]} />)
    // Remove the FIRST row (the suggested one)
    fireEvent.click(screen.getAllByRole('button', { name: /remove labware row/i })[0])
    expect(onCommit).toHaveBeenCalledWith([
      { role: 'Sample plate', ref: { kind: 'record', id: 'LBW-0001', type: 'labware', label: 'PCR plate' } },
    ])
  })
})

describe('LocalProtocolStepsWidget', () => {
  const originalFetch = global.fetch

  beforeEach(() => {
    vi.clearAllMocks()
  })

  it('renders inherited steps read-only', async () => {
    global.fetch = vi.fn(async () => ({
      ok: true,
      json: async () => ({
        steps: [
          { stepId: 'step-1', label: 'Add cells' },
          { stepId: 'step-2', label: 'Read' },
        ],
      }),
    })) as never
    render(<LocalProtocolStepsWidget value="PRT-1" readOnly onCommit={vi.fn()} />)
    expect(await screen.findByText(/1\. Add cells/)).toBeDefined()
    expect(screen.getByText(/2\. Read/)).toBeDefined()
    expect(screen.queryByRole('textbox')).toBeNull() // read-only
    global.fetch = originalFetch
  })

  it('shows an empty state when no protocol is linked', () => {
    global.fetch = vi.fn() as never
    render(<LocalProtocolStepsWidget value="" readOnly onCommit={vi.fn()} />)
    expect(screen.getByText(/no inherited protocol linked/i)).toBeDefined()
    expect(global.fetch).not.toHaveBeenCalled()
    global.fetch = originalFetch
  })
})

describe('mentionToSetupRef', () => {
  it('maps record material mentions to record refs with entityKind as type', () => {
    expect(
      mentionToSetupRef({ type: 'material', entityKind: 'material-spec', id: 'MAT-0009', label: 'Master mix' }, 'material'),
    ).toEqual({ kind: 'record', id: 'MAT-0009', type: 'material-spec', label: 'Master mix' })
  })

  it('maps CURIE material mentions to ontology refs (namespace derived from the CURIE prefix)', () => {
    expect(
      mentionToSetupRef({ type: 'material', entityKind: 'material', id: 'CHEBI:16236', label: 'dextran sulfate' }, 'material'),
    ).toEqual({ kind: 'ontology', id: 'CHEBI:16236', namespace: 'CHEBI', label: 'dextran sulfate' })
  })

  it('maps labware mentions to labware record refs', () => {
    expect(
      mentionToSetupRef({ type: 'labware', id: 'LBW-0001', label: '96-well plate' }, 'labware'),
    ).toEqual({ kind: 'record', id: 'LBW-0001', type: 'labware', label: '96-well plate' })
  })

  it('maps tube mentions to size-literal refs', () => {
    expect(
      mentionToSetupRef({ type: 'tube', sizeLabel: '15 mL', maxVolume_uL: 15000, label: '15 mL tube' }, 'labware'),
    ).toEqual({ kind: 'record', id: '15 mL', type: 'tube', label: '15 mL tube' })
  })

  it('maps equipment mentions to equipment record refs', () => {
    expect(
      mentionToSetupRef({ type: 'equipment', id: 'EQP-CENTRIFUGE', label: 'Benchtop centrifuge' }, 'equipment'),
    ).toEqual({ kind: 'record', id: 'EQP-CENTRIFUGE', type: 'equipment', label: 'Benchtop centrifuge' })
  })
})

describe('toRefBadgeRef', () => {
  it('keeps ontology refs ontology-shaped', () => {
    expect(toRefBadgeRef({ kind: 'ontology', id: 'CHEBI:1', namespace: 'CHEBI', label: 'dextran sulfate' })).toEqual({
      kind: 'ontology',
      id: 'CHEBI:1',
      namespace: 'CHEBI',
      label: 'dextran sulfate',
    })
  })

  it('keeps record refs record-shaped (label falls back to id)', () => {
    expect(toRefBadgeRef({ kind: 'record', id: 'LBW-0001', type: 'labware' })).toEqual({
      kind: 'record',
      id: 'LBW-0001',
      type: 'labware',
      label: 'LBW-0001',
    })
  })
})
