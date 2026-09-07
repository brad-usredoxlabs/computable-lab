import { describe, expect, it, vi, beforeEach } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import { useRecordVisibilities } from './useRecordVisibility'
import { apiClient } from '../api/client'

vi.mock('../api/client', () => ({
  apiClient: {
    getAccessPolicy: vi.fn(),
  },
}))

function Probe({ ids }: { ids: string[] }) {
  const vis = useRecordVisibilities(ids)
  return (
    <div data-testid="probe">
      {ids.map((id) => (
        <span key={id} data-testid={`vis-${id}`}>{String(vis[id])}</span>
      ))}
    </div>
  )
}

beforeEach(() => { vi.clearAllMocks() })

describe('useRecordVisibilities', () => {
  it('resolves private/shared/public visibility per record', async () => {
    vi.mocked(apiClient.getAccessPolicy).mockImplementation(
      async (id: string) => ({
        recordId: id,
        kind: 'protocol',
        isPolicyRoot: true,
        canAdmin: true,
        canWrite: true,
        direct: { recordId: `ACL-${id}`, visibility: id === 'PRT-A' ? 'private' : 'shared', ownerUserId: 'USR-1', grants: [] },
        effective: null,
        inherited: false,
      }),
    )
    render(<Probe ids={['PRT-A', 'PRT-B']} />)
    await waitFor(() => expect(screen.getByTestId('vis-PRT-A').textContent).toBe('private'))
    expect(screen.getByTestId('vis-PRT-B').textContent).toBe('shared')
  })

  it('falls back to null (open) when the policy fetch fails', async () => {
    vi.mocked(apiClient.getAccessPolicy).mockRejectedValue(new Error('x'))
    render(<Probe ids={['PRT-A']} />)
    await waitFor(() => expect(screen.getByTestId('vis-PRT-A').textContent).toBe('null'))
  })
})