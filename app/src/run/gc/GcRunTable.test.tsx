/**
 * GC-12 (deliverable B) — GcRunTable: the readable FULL-COLUMN run table.
 *
 * Pins bait #9 (full-column: every payload column incl. the *Uninterpreted /
 * uninterpreted honesty arms renders; unknown columns are NEVER dropped) and
 * the data-driven column union (a sheet with heterogeneous entries shows the
 * UNION of columns, in first-appearance order — no hardcoded whitelist).
 *
 * Presentational: no apiClient mock needed — the table takes entries as props
 * and renders the model's entryDisplayColumns projection.
 */
import { describe, expect, it } from 'vitest'
import { render, screen } from '@testing-library/react'
import { GcRunTable, type GcRunTableEntry } from './GcRunTable'
import type { EntryPayload } from './gcRunSheetModel'

const E1: GcRunTableEntry = {
  recordId: 'ISEN-T-001',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-T-001',
    position: { vial: '101', tray: 'front' },
    sampleName: 'RES35077-4',
    amountUninterpreted: 10,
    uninterpreted: { ECM: '3.41' },
    acquisitionPackageRef: { kind: 'record', id: 'ACQP-000042', type: 'acquisition-package' },
  } as EntryPayload,
}

const E2: GcRunTableEntry = {
  recordId: 'ISEN-T-002',
  payload: {
    kind: 'instrument-sequence-entry',
    id: 'ISEN-T-002',
    position: { vial: '102' },
    sampleName: 'RES35077-5',
    amount: { value: 5, unit: 'uL' },
    analysisRunRefs: [
      { kind: 'record', id: 'ANR-1', type: 'analysis-run' },
      { kind: 'record', id: 'ANR-2', type: 'analysis-run' },
    ],
  } as EntryPayload,
}

describe('GcRunTable — full-column rendering (bait #9)', () => {
  it('renders EVERY column the payloads carry, incl. the uninterpreted honesty arms', () => {
    render(<GcRunTable entries={[E1, E2]} />)
    expect(screen.getByTestId('gc-run-table')).toBeDefined()
    // Both rows present (entry order).
    expect(screen.getByTestId('gc-row-ISEN-T-001')).toBeDefined()
    expect(screen.getByTestId('gc-row-ISEN-T-002')).toBeDefined()
    // The honesty arms (bait #9): the uninterpreted vendor column survives
    // VERBATIM (the value is the raw payload value — never dropped/renamed).
    expect(screen.getByTestId('gc-cell-ISEN-T-001-uninterpreted.ECM')).toHaveTextContent('3.41')
    // The unknown-unit amount reads the number with the unit EXPLICITLY
    // unknown (a faked unit would falsify the *Uninterpreted arm).
    expect(screen.getByTestId('gc-cell-ISEN-T-001-amountUninterpreted')).toHaveTextContent('10 (unit unknown)')
    // The dimensioned amount reads "value unit".
    expect(screen.getByTestId('gc-cell-ISEN-T-002-amount')).toHaveTextContent('5 uL')
    // position renders readable (vial + tray / vial only).
    expect(screen.getByTestId('gc-cell-ISEN-T-001-position')).toHaveTextContent('Vial 101 (front)')
    expect(screen.getByTestId('gc-cell-ISEN-T-002-position')).toHaveTextContent('Vial 102')
    // Machine links project to their id (the record is the link, not a copy).
    expect(screen.getByTestId('gc-cell-ISEN-T-001-acquisitionPackageRef')).toHaveTextContent('ACQP-000042')
    // The append-only analysis-run history lists EVERY ref (rerun keeps history, bait #8).
    expect(screen.getByTestId('gc-cell-ISEN-T-002-analysisRunRefs')).toHaveTextContent('ANR-1, ANR-2')
  })

  it('the column set is the UNION across heterogeneous entries (no hardcoded whitelist)', () => {
    render(<GcRunTable entries={[E1, E2]} />)
    // A column carried by ONLY the second entry (amount) still appears as a
    // header — the union, not per-row.
    const headers = Array.from(
      screen.getByTestId('gc-run-table').querySelectorAll('thead th'),
    ).map((th) => th.textContent)
    expect(headers).toContain('amount')
    expect(headers).toContain('uninterpreted.ECM')
    expect(headers).toContain('analysisRunRefs')
    expect(headers).toContain('position')
    // The cell the first entry does NOT carry renders its absent arm (—) —
    // never a fabricated value, never a dropped cell.
    expect(screen.getByTestId('gc-cell-ISEN-T-001-amount')).toHaveTextContent('—')
  })

  it('renders nothing extra for zero entries (the DNA case stays byte-identical)', () => {
    render(<GcRunTable entries={[]} />)
    const table = screen.getByTestId('gc-run-table')
    expect(table.querySelectorAll('tbody tr')).toHaveLength(0)
  })
})
