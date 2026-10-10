/**
 * W2-8 T3 — SaidFactsPane (spec §3 W3, §5 A1).
 *
 * The SAID is document truth: sections/steps/tables/materials/equipment/labware
 * with their page anchors, rendered READ-ONLY. ZERO mutating controls — a page
 * anchor is a jump (onGotoPage), never a mutation. Degrades honestly when the
 * candidate join finds nothing (§0.8).
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { SaidFactsPane } from './SaidFactsPane'

const candidate = {
  recordId: 'CAN-w28-demo',
  schemaId: 'vpc',
  payload: {
    kind: 'vendor-protocol-candidate',
    title: 'ZymoBIOMICS 96 MagBead DNA Kit',
    source: { documentId: 'VPDF-ABCDEF012345', filename: 'zymo.pdf', pageCount: 31 },
    sections: [
      { id: 'section-protocol', kind: 'protocol', title: 'Protocol', provenance: { documentId: 'VPDF-ABCDEF012345', pageStart: 3 } },
    ],
    materials: [
      { id: 'mat-1', label: 'MagBead Beads', sourceText: 'MagBead Beads', provenance: { documentId: 'VPDF-ABCDEF012345', pageStart: 2 }, confidence: 1 },
    ],
    equipment: [
      { id: 'eq-1', label: 'Magnetic rack', sourceText: 'magnetic rack', provenance: { documentId: 'VPDF-ABCDEF012345', pageStart: 5 }, confidence: 1 },
    ],
    labware: [
      { id: 'lw-1', label: '96-well deep well plate', sourceText: '96-well deep well plate', provenance: { documentId: 'VPDF-ABCDEF012345', pageStart: 6 }, confidence: 1 },
    ],
    steps: [
      {
        id: 'step-1', stepNumber: 1, sourceText: 'Add 200 uL sample.', actions: [], conditions: [],
        materials: [], labware: [], equipment: [], notes: [], branches: [],
        provenance: { documentId: 'VPDF-ABCDEF012345', pageStart: 3 }, confidence: 1,
      },
    ],
    tables: [
      { id: 'table-1', title: 'Volumes', headers: ['Sample', 'Volume'], rows: [['Blood', '200 uL']], sourceText: 'table', provenance: { documentId: 'VPDF-ABCDEF012345', pageStart: 4 } },
    ],
    notes: [], outputs: [], diagnostics: [],
  },
}

function renderPane(overrides: Record<string, unknown> = {}) {
  const onGotoPage = vi.fn()
  render(
    <SaidFactsPane
      candidate={candidate as never}
      candidateRecordId="CAN-w28-demo"
      onGotoPage={onGotoPage}
      {...overrides}
    />,
  )
  return { onGotoPage }
}

afterEach(() => cleanup())

describe('SaidFactsPane — read-only SAID truth (A1)', () => {
  it('renders the candidate facts with their page anchors', () => {
    renderPane()
    expect(screen.getByTestId('said-facts')).toBeTruthy()
    expect(screen.getByText('ZymoBIOMICS 96 MagBead DNA Kit')).toBeTruthy()
    expect(screen.getByText('MagBead Beads')).toBeTruthy()
    expect(screen.getByText('Magnetic rack')).toBeTruthy()
    expect(screen.getByText('96-well deep well plate')).toBeTruthy()
    expect(screen.getByText('Add 200 uL sample.')).toBeTruthy()
    expect(screen.getByText('Volumes')).toBeTruthy()
    expect(screen.getByText('Protocol')).toBeTruthy()
  })

  it('contains ZERO mutating controls: no inputs, selects, textareas, checkboxes, or forms', () => {
    renderPane()
    const root = screen.getByTestId('said-facts')
    expect(root.querySelectorAll('input').length).toBe(0)
    expect(root.querySelectorAll('select').length).toBe(0)
    expect(root.querySelectorAll('textarea').length).toBe(0)
    expect(root.querySelectorAll('form').length).toBe(0)
    expect(root.querySelectorAll('[contenteditable="true"]').length).toBe(0)
  })

  it('the only buttons are page-anchor jumps (a jump is not a mutation)', () => {
    const { onGotoPage } = renderPane()
    const buttons = Array.from(screen.getByTestId('said-facts').querySelectorAll('button'))
    expect(buttons.length).toBeGreaterThan(0)
    for (const button of buttons) {
      expect(button.getAttribute('data-testid')).toMatch(/^said-anchor-/)
      fireEvent.click(button)
    }
    // Anchors jumped; nothing else happened.
    expect(onGotoPage.mock.calls.length).toBe(buttons.length)
    expect(onGotoPage.mock.calls.map((c) => c[0])).toEqual(
      expect.arrayContaining([3, 2, 5, 6, 4]),
    )
  })

  it('degrades honestly when no candidate resolves for this document (§0.8 join)', () => {
    renderPane({ candidate: null })
    expect(screen.getByTestId('said-facts-gap').textContent).toContain('No vendor-protocol-candidate record')
    expect(screen.queryByTestId('said-facts')).toBeNull()
  })
})
