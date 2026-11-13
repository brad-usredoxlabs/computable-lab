/**
 * Tests for LabShelfLookup — the /lab materials-category consumer of the
 * shipped read-only GET /api/inventory/shelf (MATRES-SHELF, item
 * L2-LAB-INVENTORY-CREATE-1 leg (c)).
 *
 * The network is stubbed with vi.stubGlobal('fetch', ...) — jsdom, no real
 * server. Five required legs: (a) one encoded request + rendered
 * concepts/entries with levels; (b) location rendered only when present,
 * honest placeholder otherwise; (c) 'unknown-provenance' rendered verbatim;
 * (d) non-ok renders an honest error, no results; (e) no fetch on mount and
 * none on an empty/whitespace submit.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { LabShelfLookup } from './LabShelfLookup'

type ShelfFixture = {
  concepts: { recordId: string; label: string; sourceKind?: string }[]
  groups: { vendor?: string; lot?: string; entries: Record<string, unknown>[] }[]
}

const reportBody = (fixture: ShelfFixture): Record<string, unknown> => ({
  term: 'dmem',
  concepts: fixture.concepts,
  groups: fixture.groups,
})

const FULL_REPORT: ShelfFixture = {
  concepts: [
    { recordId: 'MAT-D-1', label: 'DMEM (Dulbecco’s Modified Eagle Medium)' },
    { recordId: 'LW-TUBE-9', label: '15 mL polypropylene tube', sourceKind: 'labware-definition' },
  ],
  groups: [
    {
      vendor: 'VendorA',
      lot: 'LOT-1',
      entries: [
        {
          recordId: 'MIN-A',
          kind: 'material-instance',
          label: 'DMEM instance A',
          level: 'instance',
          vendor: 'VendorA',
          lot: 'LOT-1',
          location: 'Freezer F-2, Shelf A3',
          joinedVia: 'vendor-product',
        },
        {
          recordId: 'MIN-U',
          kind: 'material-instance',
          label: 'DMEM instance U',
          level: 'instance',
          joinedVia: 'unknown-provenance',
        },
        {
          recordId: 'ALQ-1',
          kind: 'aliquot',
          label: 'DMEM aliquot 1',
          level: 'aliquot',
          vendor: 'VendorA',
          lot: 'LOT-1',
          joinedVia: 'source-lot',
        },
      ],
    },
    {
      lot: 'LOT-2',
      entries: [
        {
          recordId: 'LOT-R',
          kind: 'material-lot',
          label: 'DMEM lot R',
          level: 'lot',
          lot: 'LOT-2',
          joinedVia: 'direct-material-ref',
        },
      ],
    },
  ],
}

afterEach(() => {
  vi.unstubAllGlobals()
})

function stubShelfFetch(body: Record<string, unknown>, status = 200): (url: string) => void {
  const stub = vi.fn().mockResolvedValue({
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Bad Request',
    json: async () => body,
  })
  vi.stubGlobal('fetch', stub)
  return (url: string) => {
    expect(stub).toHaveBeenCalledTimes(1)
    expect(stub.mock.calls[0][0]).toBe(url)
  }
}

describe('LabShelfLookup', () => {
  it('leg a: submit issues exactly ONE encoded request and renders concepts + entry labels with levels', async () => {
    const assertOneRequest = stubShelfFetch(reportBody(FULL_REPORT))

    render(<LabShelfLookup />)
    fireEvent.change(screen.getByTestId('lab-shelf-term'), { target: { value: 'DMEM' } })
    fireEvent.click(screen.getByTestId('lab-shelf-submit'))

    await waitFor(() => {
      expect(screen.queryByTestId('lab-shelf-entry-MIN-A')).not.toBeNull()
    })
    assertOneRequest('/api/inventory/shelf?term=DMEM')

    // Every concept the API returned is shown, each with its label.
    expect(screen.getAllByTestId('lab-shelf-concept')[0]).toHaveTextContent(
      'DMEM (Dulbecco’s Modified Eagle Medium)',
    )
    expect(screen.getAllByTestId('lab-shelf-concept')[1]).toHaveTextContent('15 mL polypropylene tube')
    // Every entry label renders with its level verbatim.
    expect(screen.getByTestId('lab-shelf-entry-MIN-A')).toHaveTextContent('DMEM instance A')
    expect(screen.getByTestId('lab-shelf-entry-MIN-A')).toHaveTextContent('instance')
    expect(screen.getByTestId('lab-shelf-entry-ALQ-1')).toHaveTextContent('aliquot')
    expect(screen.getByTestId('lab-shelf-entry-LOT-R')).toHaveTextContent('lot')
  })

  it('leg b: renders a present location; an entry without one gets the honest placeholder', async () => {
    stubShelfFetch(reportBody(FULL_REPORT))

    render(<LabShelfLookup />)
    fireEvent.change(screen.getByTestId('lab-shelf-term'), { target: { value: 'DMEM' } })
    fireEvent.click(screen.getByTestId('lab-shelf-submit'))

    await waitFor(() => {
      expect(screen.queryByTestId('lab-shelf-entry-MIN-A')).not.toBeNull()
    })
    expect(screen.getByTestId('lab-shelf-entry-MIN-A')).toHaveTextContent('Freezer F-2, Shelf A3')
    // MIN-U carries no location: the honest placeholder, never a fabricated one.
    const unlocated = screen.getByTestId('lab-shelf-entry-MIN-U')
    expect(unlocated).toHaveTextContent('location not recorded')
    expect(unlocated.textContent ?? '').not.toContain('Freezer')
  })

  it('leg c: joinedVia unknown-provenance renders verbatim and the line is never hidden', async () => {
    stubShelfFetch(reportBody(FULL_REPORT))

    render(<LabShelfLookup />)
    fireEvent.change(screen.getByTestId('lab-shelf-term'), { target: { value: 'DMEM' } })
    fireEvent.click(screen.getByTestId('lab-shelf-submit'))

    await waitFor(() => {
      expect(screen.queryByTestId('lab-shelf-entry-MIN-U')).not.toBeNull()
    })
    const unlocated = screen.getByTestId('lab-shelf-entry-MIN-U')
    expect(unlocated).toHaveTextContent('unknown-provenance')
    expect(screen.getByTestId('lab-shelf-entry-MIN-A')).toHaveTextContent('vendor-product')
    expect(screen.getByTestId('lab-shelf-entry-ALQ-1')).toHaveTextContent('source-lot')
  })

  it('leg d: a 400 response renders the honest error and NO results', async () => {
    const assertOneRequest = stubShelfFetch({ error: 'term query parameter is required' }, 400)

    render(<LabShelfLookup />)
    fireEvent.change(screen.getByTestId('lab-shelf-term'), { target: { value: 'DMEM' } })
    fireEvent.click(screen.getByTestId('lab-shelf-submit'))

    await waitFor(() => {
      expect(screen.queryByTestId('lab-shelf-error')).not.toBeNull()
    })
    expect(screen.getByTestId('lab-shelf-error').textContent).toMatch(/shelf lookup failed/i)
    assertOneRequest('/api/inventory/shelf?term=DMEM')
    expect(screen.queryByTestId('lab-shelf-concept')).toBeNull()
    expect(screen.queryByTestId('lab-shelf-entry-MIN-A')).toBeNull()
  })

  it('leg e: no fetch on mount; an empty or whitespace submit issues no request', async () => {
    const stub = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      statusText: 'OK',
      json: async () => reportBody(FULL_REPORT),
    })
    vi.stubGlobal('fetch', stub)

    render(<LabShelfLookup />)
    // Mounted with the box empty: no network traffic, ever.
    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(stub).not.toHaveBeenCalled()

    // Empty submit.
    fireEvent.click(screen.getByTestId('lab-shelf-submit'))
    // Whitespace submit.
    fireEvent.change(screen.getByTestId('lab-shelf-term'), { target: { value: '   ' } })
    fireEvent.click(screen.getByTestId('lab-shelf-submit'))

    await new Promise((resolve) => setTimeout(resolve, 0))
    expect(stub).not.toHaveBeenCalled()
    // No result, no error, no stale state — the honest idle panel.
    expect(screen.queryByTestId('lab-shelf-concept')).toBeNull()
    expect(screen.queryByTestId('lab-shelf-error')).toBeNull()
  })
})
