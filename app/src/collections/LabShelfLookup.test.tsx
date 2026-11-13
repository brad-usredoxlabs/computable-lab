/**
 * Tests for LabShelfLookup — the /lab consumer of GET /api/inventory/shelf
 * (MATRES-SHELF, L2-LAB-INVENTORY-CREATE-1 leg (c)). fetch is stubbed with
 * vi.stubGlobal (jsdom, no real server). Five legs: (a) ONE encoded request
 * + rendered concepts/entries with levels; (b) location only when present,
 * honest placeholder otherwise; (c) 'unknown-provenance' verbatim; (d)
 * non-ok => honest error, NO results; (e) no fetch on mount / empty submit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LabShelfLookup } from './LabShelfLookup'

const FULL = {
  term: 'dmem',
  concepts: [
    { recordId: 'MAT-D-1', label: 'DMEM (Dulbecco’s Modified Eagle Medium)' },
    { recordId: 'LW-TUBE-9', label: '15 mL polypropylene tube', sourceKind: 'labware-definition' },
  ],
  groups: [
    {
      vendor: 'VendorA',
      lot: 'LOT-1',
      entries: [
        { recordId: 'MIN-A', kind: 'material-instance', label: 'DMEM instance A', level: 'instance', vendor: 'VendorA', lot: 'LOT-1', location: 'Freezer F-2, Shelf A3', joinedVia: 'vendor-product' },
        { recordId: 'MIN-U', kind: 'material-instance', label: 'DMEM instance U', level: 'instance', joinedVia: 'unknown-provenance' },
        { recordId: 'ALQ-1', kind: 'aliquot', label: 'DMEM aliquot 1', level: 'aliquot', vendor: 'VendorA', lot: 'LOT-1', joinedVia: 'source-lot' },
      ],
    },
    {
      lot: 'LOT-2',
      entries: [
        { recordId: 'LOT-R', kind: 'material-lot', label: 'DMEM lot R', level: 'lot', lot: 'LOT-2', joinedVia: 'direct-material-ref' },
      ],
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubFetch(body: unknown, status = 200) {
  const stub = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    json: async () => body,
  })
  vi.stubGlobal('fetch', stub)
  return stub
}

async function submit() {
  fireEvent.change(screen.getByTestId('lab-shelf-term'), { target: { value: 'DMEM' } })
  fireEvent.click(screen.getByTestId('lab-shelf-submit'))
  await waitFor(() => {
    expect(screen.queryByTestId('lab-shelf-entry-MIN-A') ?? screen.queryByTestId('lab-shelf-error')).not.toBeNull()
  })
}

describe('LabShelfLookup', () => {
  it('leg a: submit issues exactly ONE encoded request and renders concepts + entry labels with levels', async () => {
    const stub = stubFetch(FULL)
    render(<LabShelfLookup />)
    await submit()
    expect(stub).toHaveBeenCalledTimes(1)
    expect(stub.mock.calls[0][0]).toBe('/api/inventory/shelf?term=DMEM')
    expect(screen.getAllByTestId('lab-shelf-concept')[0]).toHaveTextContent('DMEM (Dulbecco’s Modified Eagle Medium)')
    expect(screen.getAllByTestId('lab-shelf-concept')[1]).toHaveTextContent('15 mL polypropylene tube')
    expect(screen.getByTestId('lab-shelf-entry-MIN-A')).toHaveTextContent('DMEM instance A')
    expect(screen.getByTestId('lab-shelf-entry-MIN-A')).toHaveTextContent('instance')
    expect(screen.getByTestId('lab-shelf-entry-ALQ-1')).toHaveTextContent('aliquot')
    expect(screen.getByTestId('lab-shelf-entry-LOT-R')).toHaveTextContent('lot')
  })

  it('leg b: a present location renders; an entry without one gets the honest placeholder', async () => {
    stubFetch(FULL)
    render(<LabShelfLookup />)
    await submit()
    expect(screen.getByTestId('lab-shelf-entry-MIN-A')).toHaveTextContent('Freezer F-2, Shelf A3')
    const unlocated = screen.getByTestId('lab-shelf-entry-MIN-U')
    expect(unlocated).toHaveTextContent('location not recorded')
    expect(unlocated.textContent ?? '').not.toContain('Freezer')
  })

  it('leg c: joinedVia unknown-provenance renders verbatim and the line is never hidden', async () => {
    stubFetch(FULL)
    render(<LabShelfLookup />)
    await submit()
    expect(screen.getByTestId('lab-shelf-entry-MIN-U')).toHaveTextContent('unknown-provenance')
    expect(screen.getByTestId('lab-shelf-entry-MIN-A')).toHaveTextContent('vendor-product')
    expect(screen.getByTestId('lab-shelf-entry-ALQ-1')).toHaveTextContent('source-lot')
  })

  it('leg d: a 400 response renders the honest error and NO results', async () => {
    const stub = stubFetch({ error: 'term query parameter is required' }, 400)
    render(<LabShelfLookup />)
    await submit()
    expect(stub).toHaveBeenCalledTimes(1)
    expect(stub.mock.calls[0][0]).toBe('/api/inventory/shelf?term=DMEM')
    expect(screen.getByTestId('lab-shelf-error').textContent).toMatch(/shelf lookup failed/i)
    expect(screen.queryByTestId('lab-shelf-concept')).toBeNull()
    expect(screen.queryByTestId('lab-shelf-entry-MIN-A')).toBeNull()
  })

  it('leg e: no fetch on mount; an empty or whitespace submit issues no request', async () => {
    const stub = stubFetch(FULL)
    render(<LabShelfLookup />)
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(stub).not.toHaveBeenCalled()
    fireEvent.click(screen.getByTestId('lab-shelf-submit'))
    fireEvent.change(screen.getByTestId('lab-shelf-term'), { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('lab-shelf-submit'))
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(stub).not.toHaveBeenCalled()
    expect(screen.queryByTestId('lab-shelf-concept')).toBeNull()
    expect(screen.queryByTestId('lab-shelf-error')).toBeNull()
  })
})
