import { describe, it, expect, vi, afterEach } from 'vitest'
import { render, screen, cleanup } from '@testing-library/react'
import { apiClient } from '../../shared/api/client'
import type { RecordEnvelope } from '../../types/kernel'
import { LabInventoryPanel } from './LabInventoryPanel'

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listRecordsByKind: vi.fn(),
  },
}))

afterEach(() => {
  cleanup()
  vi.clearAllMocks()
})

function equipmentEnv(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return { recordId, schemaId: 'equipment', meta: { kind: 'equipment' }, payload }
}

function materialEnv(recordId: string, payload: Record<string, unknown>): RecordEnvelope {
  return { recordId, schemaId: 'material-spec', meta: { kind: 'material-spec' }, payload }
}

describe('LabInventoryPanel', () => {
  it('renders instruments and materials from the API', async () => {
    vi.mocked(apiClient.listRecordsByKind)
      .mockResolvedValueOnce({ records: [equipmentEnv('EQP-1', { id: 'EQP-1', name: 'QuantStudio 5', model: 'QS5' })], total: 1 })
      .mockResolvedValueOnce({ records: [materialEnv('MSP-1', { title: 'Clofibrate 1mM DMSO' })], total: 1 })

    render(<LabInventoryPanel />)
    expect(await screen.findByText('QuantStudio 5')).toBeDefined()
    expect(screen.getByText('QS5')).toBeDefined()
    expect(screen.getByText('Clofibrate 1mM DMSO')).toBeDefined()
  })

  it('shows empty-state hints when no records exist', async () => {
    vi.mocked(apiClient.listRecordsByKind)
      .mockResolvedValueOnce({ records: [], total: 0 })
      .mockResolvedValueOnce({ records: [], total: 0 })

    render(<LabInventoryPanel />)
    expect(await screen.findByText('No equipment records.')).toBeDefined()
    expect(screen.getByText('No material records.')).toBeDefined()
  })

  it('degrades gracefully to empty inventory when the API fails', async () => {
    vi.mocked(apiClient.listRecordsByKind).mockRejectedValue(new Error('boom'))

    render(<LabInventoryPanel />)
    expect(await screen.findByText('No equipment records.')).toBeDefined()
  })
})
