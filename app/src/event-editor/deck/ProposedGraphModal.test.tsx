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