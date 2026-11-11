// @vitest-environment jsdom
/**
 * L2-LAB-INVENTORY-CREATE-1 u1 — LabwareInstanceCreateModal tests.
 *
 * (i) submitting with no definition shows an inline error and calls nothing.
 * (ii) a valid submit calls createRecord with correct schemaId + payload.
 * (iii) location is omitted when label is typed without a kind selection.
 * (iv) location carries the chosen kind when selected from the dropdown.
 * (v) location is kind-only when label is empty.
 * (vi) rendered options reflect the served schema enum (non-canonical).
 * (vii) when schema exposes no location.kind.enum, select renders no real kind options.
 */
import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup, fireEvent, waitFor } from '@testing-library/react'

const createRecordSpy = vi.fn().mockResolvedValue({ success: true })

/*
 * NON-CANONICAL enum — this tests that the modal reads the enum from the
 * schema at runtime, rather than hardcoding values. The real schema enum
 * is ['bench', 'incubator', 'freezer', 'instrument', 'rack', 'other'].
 */
const getSchemaSpy = vi.fn().mockResolvedValue({
  id: 'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml',
  title: 'LabwareInstance',
  schema: {
    properties: {
      location: {
        properties: {
          kind: {
            enum: ['workbench', 'cold-room'],
          },
        },
      },
    },
  },
})

vi.mock('../shared/api/client', () => ({
  apiClient: {
    createRecord: (...args: unknown[]) => createRecordSpy(...args),
    getSchema: (...args: unknown[]) => getSchemaSpy(...args),
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

  it('(iii) location is omitted when label is typed without a kind selection', async () => {
    render(
      <LabwareInstanceCreateModal
        definitions={MOCK_DEFINITIONS}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
    // Wait for schema to load and options to populate
    await waitFor(() => {
      const kindSelect = screen.queryByTestId('labware-instance-location-kind')
      expect(kindSelect).toBeDefined()
      expect((kindSelect as HTMLSelectElement).options.length).toBeGreaterThan(1)
    }, { timeout: 3000 })

    // Select a definition
    fireEvent.change(screen.getByTestId('labware-instance-definition-select'), {
      target: { value: 'LW-TROUGH-S' },
    })
    // Enter a label
    fireEvent.change(screen.getByTestId('labware-instance-label-input'), {
      target: { value: 'Test plate' },
    })
    // Type a location label WITHOUT selecting a kind
    fireEvent.change(screen.getByTestId('labware-instance-location-input'), {
      target: { value: 'Bench 3' },
    })
    // Submit
    fireEvent.click(screen.getByTestId('labware-instance-create-submit'))

    await waitFor(() => {
      expect(createRecordSpy).toHaveBeenCalledTimes(1)
    }, { timeout: 3000 })

    const [, payload] = createRecordSpy.mock.calls[0] as [string, Record<string, unknown>]

    // Location must NOT be present when no kind is chosen
    expect(payload).not.toHaveProperty('location')
  })

  it('(iv) location carries the chosen kind when selected from the dropdown', async () => {
    render(
      <LabwareInstanceCreateModal
        definitions={MOCK_DEFINITIONS}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
    // Wait for schema to load and options to populate
    await waitFor(() => {
      const kindSelect = screen.queryByTestId('labware-instance-location-kind')
      expect(kindSelect).toBeDefined()
      expect((kindSelect as HTMLSelectElement).options.length).toBeGreaterThan(1)
    }, { timeout: 3000 })

    fireEvent.change(screen.getByTestId('labware-instance-definition-select'), {
      target: { value: 'LW-TROUGH-S' },
    })
    fireEvent.change(screen.getByTestId('labware-instance-label-input'), {
      target: { value: 'Test plate' },
    })
    // Select a kind (use non-canonical 'workbench' from the mock)
    fireEvent.change(screen.getByTestId('labware-instance-location-kind'), {
      target: { value: 'workbench' },
    })
    // Type a label
    fireEvent.change(screen.getByTestId('labware-instance-location-input'), {
      target: { value: 'Bench 3' },
    })
    fireEvent.click(screen.getByTestId('labware-instance-create-submit'))

    await waitFor(() => {
      expect(createRecordSpy).toHaveBeenCalledTimes(1)
    }, { timeout: 3000 })

    const [, payload] = createRecordSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.location).toBeDefined()
    const loc = payload.location as Record<string, unknown>
    expect(loc.kind).toBe('workbench')
    expect(loc.label).toBe('Bench 3')
  })

  it('(v) location is kind-only (no label key) when label input is empty', async () => {
    render(
      <LabwareInstanceCreateModal
        definitions={MOCK_DEFINITIONS}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )
    // Wait for schema to load and options to populate
    await waitFor(() => {
      const kindSelect = screen.queryByTestId('labware-instance-location-kind')
      expect(kindSelect).toBeDefined()
      expect((kindSelect as HTMLSelectElement).options.length).toBeGreaterThan(1)
    }, { timeout: 3000 })

    fireEvent.change(screen.getByTestId('labware-instance-definition-select'), {
      target: { value: 'LW-TROUGH-S' },
    })
    fireEvent.change(screen.getByTestId('labware-instance-label-input'), {
      target: { value: 'Test plate' },
    })
    // Select a kind but leave the location label EMPTY
    fireEvent.change(screen.getByTestId('labware-instance-location-kind'), {
      target: { value: 'workbench' },
    })
    // Do NOT fill the location label input
    fireEvent.click(screen.getByTestId('labware-instance-create-submit'))

    await waitFor(() => {
      expect(createRecordSpy).toHaveBeenCalledTimes(1)
    }, { timeout: 3000 })

    const [, payload] = createRecordSpy.mock.calls[0] as [string, Record<string, unknown>]
    expect(payload.location).toEqual({ kind: 'workbench' })
    // Explicitly: no 'label' key should exist
    expect((payload.location as Record<string, unknown>)).not.toHaveProperty('label')
  })

  it('(vi) rendered option values match the served schema enum exactly', async () => {
    render(
      <LabwareInstanceCreateModal
        definitions={MOCK_DEFINITIONS}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    // Verify getSchemaSpy was called with the labware-instance schema id
    expect(getSchemaSpy).toHaveBeenCalledWith(
      'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml'
    )

    // Wait for schema to load and kind options to populate
    await waitFor(() => {
      const kindSelect = screen.queryByTestId('labware-instance-location-kind')
      expect(kindSelect).toBeDefined()
      expect((kindSelect as HTMLSelectElement).options.length).toBeGreaterThan(1)
    }, { timeout: 3000 })

    // Extract option values from the KIND select only (not the definition select)
    const kindSelect = screen.getByTestId('labware-instance-location-kind') as HTMLSelectElement
    const values = Array.from(kindSelect.options).map((o) => o.value)
    expect(values).toEqual(['', 'workbench', 'cold-room'])
  })

  it('(vii) when schema exposes no location.kind.enum, select renders no real kind options', async () => {
    // Override the mock to return a schema with NO kind enum
    getSchemaSpy.mockResolvedValueOnce({
      id: 'https://computable-lab.com/schema/computable-lab/labware-instance.schema.yaml',
      title: 'LabwareInstance',
      schema: {
        properties: {
          location: {
            properties: {
              kind: {
                type: 'string',
                // no enum key — modal should render only the placeholder
              },
            },
          },
        },
      },
    })

    render(
      <LabwareInstanceCreateModal
        definitions={MOCK_DEFINITIONS}
        isOpen={true}
        onClose={vi.fn()}
        onSuccess={vi.fn()}
      />
    )

    // Wait for schema to load
    await waitFor(() => {
      const kindSelect = screen.queryByTestId('labware-instance-location-kind')
      expect(kindSelect).toBeDefined()
    }, { timeout: 3000 })

    // Only the placeholder option should exist (no real kind options)
    const kindSelect = screen.getByTestId('labware-instance-location-kind') as HTMLSelectElement
    const values = Array.from(kindSelect.options).map((o) => o.value)
    expect(values).toEqual([''])
  })
})
