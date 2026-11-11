// @vitest-environment jsdom
/**
 * L2-LAB-INVENTORY-CREATE-1 u1 — LabwareInstanceCreateModal tests.
 *
 * (i) submitting with no definition shows an inline error and calls nothing.
 * (ii) a valid submit calls createRecord with correct schemaId + payload.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent } from '@testing-library/react'

const createRecordSpy = vi.fn().mockResolvedValue({ success: true })

vi.mock('../shared/api/client', () => ({
  apiClient: {
    createRecord: (...args: unknown[]) => createRecordSpy(...args),
  },
}))

import { LabwareInstanceCreateModal } from './LabwareInstanceCreateModal'

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

const MOCK_DEFINITIONS = [
  { recordId: 'LW-PLATE-96', schemaId: '', payload: { name: '96-well plate' } },
  { recordId: 'LW-TROUGH-S', schemaId: '', payload: { name: 'Single trough reservoir' } },
]

describe('LabwareInstanceCreateModal', () => {
  it('(i) submitting with no definition selected shows error and calls nothing', () => {
    render(
      <LabwareInstanceCreateModal
        definitions={MOCK_DEFINITIONS}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
    // Do NOT select a definition — just click submit
    fireEvent.click(screen.getByTestId('labware-instance-create-submit'))
    // Inline error appears
    expect(screen.getByTestId('labware-instance-create-error')).toBeDefined()
    // createRecord was NOT called (vacuous pin — the negative leg calls nothing)
    expect(createRecordSpy).not.toHaveBeenCalled()
  })

  it('(ii) valid submit calls createRecord with correct schemaId + payload', () => {
    render(
      <LabwareInstanceCreateModal
        definitions={MOCK_DEFINITIONS}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
    // Select a definition
    fireEvent.change(screen.getByTestId('labware-instance-definition-select'), {
      target: { value: 'LW-TROUGH-S' },
    })
    // Enter a label
    fireEvent.change(screen.getByTestId('labware-instance-label-input'), {
      target: { value: 'Plate A (RUN-000041)' },
    })
    // Submit
    fireEvent.click(screen.getByTestId('labware-instance-create-submit'))

    expect(createRecordSpy).toHaveBeenCalledTimes(1)
    const [schemaId, payload] = createRecordSpy.mock.calls[0] as [string, Record<string, unknown>]

    // Schema ID is the literal from the approved schema
    expect(schemaId).toBe('https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml')

    // Payload shape
    expect(payload.kind).toBe('labware-instance')
    expect(payload.labwareId).toBe('LW-TROUGH-S')

    // Minted recordId
    expect(payload.recordId).toMatch(/^LBI-[0-9A-F]{8}$/)

    // NO geometry keys in the payload
    expect(payload.wells).toBeUndefined()
    expect(payload.dimensions).toBeUndefined()
    expect(payload.innerLength).toBeUndefined()
    expect(payload.innerWidth).toBeUndefined()
    expect(payload.troughLength).toBeUndefined()
    expect(payload.troughWidth).toBeUndefined()
    expect(payload.troughDepth).toBeUndefined()

    // Label carried through
    expect(payload.label).toBe('Plate A (RUN-000041)')
  })
})
