import { describe, expect, it } from 'vitest'
import { protocolDisplayName, protocolMetaRows } from './ProtocolIdentity'

/**
 * The right-pane Protocol tab leads with the ATTACHED protocol's name and
 * reveals its record metadata on hover (ID, parent artifact, created date…).
 * The row/name derivation is pure so it can be asserted without a DOM; the
 * component only positions and shows the tooltip.
 *
 * Rule: never invent a value. A field the record does not carry produces NO
 * row — a hand-authored protocol has no `source`, so it shows no parent
 * artifact rather than a fabricated one.
 */

describe('protocolDisplayName', () => {
  it('prefers the record title', () => {
    expect(protocolDisplayName({ recordId: 'PRT-1', payload: { title: 'PureLink' } }, 'ref label')).toBe('PureLink')
  })

  it('falls back to name, then the ref label, then the record id', () => {
    expect(protocolDisplayName({ recordId: 'PRT-1', payload: { name: 'CellROX' } }, 'ref label')).toBe('CellROX')
    expect(protocolDisplayName({ recordId: 'PRT-1', payload: {} }, 'ref label')).toBe('ref label')
    expect(protocolDisplayName(null, null, 'PRT-1')).toBe('PRT-1')
  })
})

describe('protocolMetaRows', () => {
  it('always carries the canonical record id first', () => {
    const rows = protocolMetaRows({ recordId: 'PRT-4iaey2', payload: { kind: 'protocol' } })
    expect(rows[0]).toEqual({ label: 'ID', value: 'PRT-4iaey2' })
  })

  it('reads the parent artifact from source.ref (the vendor document the protocol came from)', () => {
    const rows = protocolMetaRows({
      recordId: 'CAN-protocol-1',
      payload: {
        kind: 'protocol',
        source: {
          type: 'vendor',
          ref: { kind: 'record', type: 'vendor-pdf', id: 'VPDF-6711E1FA89E9', label: 'June 2023 quick reference' },
        },
      },
    })
    expect(rows).toContainEqual({ label: 'Source', value: 'vendor' })
    expect(rows).toContainEqual({
      label: 'Parent artifact',
      value: 'vendor-pdf June 2023 quick reference (VPDF-6711E1FA89E9)',
    })
  })

  it('reads the parent artifact from inherits_from for a local protocol', () => {
    const rows = protocolMetaRows({
      recordId: 'LPR-1',
      payload: {
        kind: 'local-protocol',
        inherits_from: {
          kind: 'record',
          id: 'prt-seed-biological-transfer',
          type: 'protocol',
          label: 'Biological Material Transfer',
        },
      },
    })
    expect(rows).toContainEqual({
      label: 'Parent artifact',
      value: 'protocol Biological Material Transfer (prt-seed-biological-transfer)',
    })
    // No `source` on this record → no Source row (never invented).
    expect(rows.find((r) => r.label === 'Source')).toBeUndefined()
  })

  it('shows provenance timestamps + author and formats them as UTC, not a locale string', () => {
    const rows = protocolMetaRows({
      recordId: 'PRT-4iaey2',
      payload: {
        kind: 'protocol',
        state: 'approved',
        version: '1.0',
        createdAt: '2026-09-12T20:30:05.113Z',
        createdBy: 'USR-BRAD',
        updatedAt: '2026-09-13T08:05:00.000Z',
      },
      meta: { path: 'records/protocol/PRT-4iaey2__purelink.yaml' },
    })
    expect(rows).toContainEqual({ label: 'State', value: 'approved' })
    expect(rows).toContainEqual({ label: 'Version', value: '1.0' })
    expect(rows).toContainEqual({ label: 'Created', value: '2026-09-12 20:30 UTC' })
    expect(rows).toContainEqual({ label: 'Created by', value: 'USR-BRAD' })
    expect(rows).toContainEqual({ label: 'Updated', value: '2026-09-13 08:05 UTC' })
    expect(rows).toContainEqual({ label: 'Path', value: 'records/protocol/PRT-4iaey2__purelink.yaml' })
  })

  it('falls back to envelope meta timestamps and emits no empty rows', () => {
    const rows = protocolMetaRows({
      recordId: 'PRT-x',
      payload: { kind: 'protocol', title: 'X' },
      meta: { createdAt: '2026-01-02T03:04:05Z', createdBy: 'USR-BRAD' },
    })
    expect(rows).toContainEqual({ label: 'Created', value: '2026-01-02 03:04 UTC' })
    expect(rows).toContainEqual({ label: 'Created by', value: 'USR-BRAD' })
    expect(rows.every((r) => r.value.trim().length > 0)).toBe(true)
    expect(rows.map((r) => r.label)).not.toContain('Parent artifact')
    expect(rows.map((r) => r.label)).not.toContain('State')
  })
})
