import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { EventEditorPreview } from '../EventEditorContext'
import type { PlateEvent } from '../../types/events'
import { ProposedGraphModal } from './ProposedGraphModal'
import type { TermDecision } from './acceptedOntologyBindings'

function makePreview(bindings: NonNullable<EventEditorPreview['ontologyBindings']>): EventEditorPreview {
  return {
    previewLabwares: {},
    previewPlacements: [],
    previewEvents: [{ eventId: 'e1', event_type: 'add_material', details: {} } as PlateEvent],
    ontologyBindings: bindings,
  }
}

const minted = { curie: 'CHEBI:5001', recordId: 'CHEBI:5001', label: 'fenofibrate', minted: true, via: 'class-ref' as const }
const draftOnly = { curie: 'NCIT:8765', recordId: 'NCIT:8765', label: 'ethanol', minted: false, via: 'name' as const, draftOnly: true }
const trusted = { curie: 'CHEBI:16236', recordId: 'MAT-ETHANOL', label: 'ethanol', minted: false, via: 'class-ref' as const }

function renderModal(preview: EventEditorPreview, decisions = {} as Record<string, TermDecision>, onChange = vi.fn()) {
  render(
    <ProposedGraphModal preview={preview} onClose={() => undefined} termDecisions={decisions} onDecisionsChange={onChange} />,
  )
  return onChange
}

afterEach(() => cleanup())

describe('ProposedGraphModal ontology term review', () => {
  it('shows only decision-needed bindings in the active list and trusted ones read-only', () => {
    renderModal(makePreview([minted, draftOnly, trusted]))
    expect(screen.getByTestId('term-review-section')).toBeTruthy()
    expect(screen.getByTestId('term-row-CHEBI:5001')).toBeTruthy()
    expect(screen.getByTestId('term-row-NCIT:8765')).toBeTruthy()
    // trusted binding grouped under the read-only "already local" section
    expect(screen.getByTestId('term-context-section')).toBeTruthy()
    expect(screen.getByText('CHEBI:16236')).toBeTruthy()
  })

  it('marks an approved term with a badge and reports the decision', () => {
    const onChange = renderModal(makePreview([minted]))
    fireEvent.click(screen.getByTestId('term-approve-CHEBI:5001'))
    expect(onChange).toHaveBeenCalledWith({ 'CHEBI:5001': { status: 'approved' } })
  })

  it('approve-all signs off every pending term at once', () => {
    const onChange = renderModal(makePreview([minted, draftOnly]))
    fireEvent.click(screen.getByTestId('term-approve-all'))
    expect(onChange).toHaveBeenCalledWith({
      'CHEBI:5001': { status: 'approved' },
      'NCIT:8765': { status: 'approved' },
    })
  })

  it('shows a needs-decision badge for pending terms and a decided progress count', () => {
    renderModal(makePreview([minted, draftOnly]), { 'CHEBI:5001': { status: 'approved' } })
    expect(screen.getByTestId('term-badge-CHEBI:5001').textContent).toBe('approved')
    expect(screen.getByTestId('term-badge-NCIT:8765').textContent).toBe('needs decision')
    expect(screen.getByTestId('term-review-progress').textContent).toContain('1/2 decided')
  })

  it('opens the replace picker and reports a replacement', () => {
    const onChange = renderModal(makePreview([minted]))
    fireEvent.click(screen.getByTestId('term-replace-CHEBI:5001'))
    // resolver results are async (no network in this env → likely empty), so
    // use the mint-local fallback path which is synchronous.
    fireEvent.click(screen.getByTestId('term-replace-mint'))
    expect(onChange).toHaveBeenCalledWith({
      'CHEBI:5001': expect.objectContaining({ status: 'replaced' }),
    })
  })
})

describe('ProposedGraphModal — the draft term manifest lives here (not the AI chat pane)', () => {
  it('renders a collapsible term panel fed by the preview termManifest', () => {
    const preview: EventEditorPreview = {
      previewLabwares: {},
      previewPlacements: [],
      previewEvents: [{ eventId: 'e1', event_type: 'add_material', details: {} } as PlateEvent],
      termManifest: [
        { label: 'DMEM', source: 'minted', id: 'mint:DMEM', kind: 'material' },
        { label: '95 well plate', source: 'ontology', id: 'CL:96_well_plate', kind: 'labware' },
        { label: 'bath 55', source: 'local-record', id: 'EQP-bath-1', kind: 'equipment' },
      ],
    }
    render(<ProposedGraphModal preview={preview} onClose={() => undefined} />)
    // The panel is collapsed by default; the header counts the terms.
    expect(screen.getByTestId('term-panel-toggle')).toBeTruthy()
    expect(screen.getByTestId('term-panel-toggle').textContent).toContain('Terms (3)')
    // expand → the kind sections render
    fireEvent.click(screen.getByTestId('term-panel-toggle'))
    expect(screen.getByText('Materials')).toBeTruthy()
    expect(screen.getByText('Labware')).toBeTruthy()
    expect(screen.getByText('Equipment')).toBeTruthy()
    expect(screen.getByText('DMEM')).toBeTruthy()
  })

  it('reports a term confirm for the redraft through onTermConfirm', () => {
    const onConfirm = vi.fn()
    const preview: EventEditorPreview = {
      previewLabwares: {},
      previewPlacements: [],
      previewEvents: [],
      termManifest: [{ label: 'DMEM', source: 'minted', id: 'mint:DMEM', kind: 'material' }],
    }
    render(<ProposedGraphModal preview={preview} onClose={() => undefined} onTermConfirm={onConfirm} />)
    fireEvent.click(screen.getByTestId('term-panel-toggle'))
    fireEvent.click(screen.getByTestId('term-accept-0'))
    expect(onConfirm).toHaveBeenCalledWith(expect.objectContaining({ label: 'DMEM', existingTermId: 'mint:DMEM' }))
  })
})