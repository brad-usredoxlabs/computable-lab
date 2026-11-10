import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, render, screen, waitFor } from '@testing-library/react'
import { RoleBindingProposalsPanel } from './RoleBindingProposalsPanel'

const mocks = vi.hoisted(() => ({ getRoleBindingProposals: vi.fn() }))

vi.mock('../shared/api/client', () => ({
  apiClient: { getRoleBindingProposals: mocks.getRoleBindingProposals },
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  mocks.getRoleBindingProposals.mockReset()
})

describe('RoleBindingProposalsPanel bound state', () => {
  it('P1: renders bound label and lot, does not render "no candidate"', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [{
          roleId: 'reservoir',
          roleKind: 'labware' as const,
          state: 'bound' as const,
          candidates: [{ recordId: 'LAB-1', recordKind: 'labware-instance', label: 'Reservoir A' }],
          bound: { recordId: 'LAB-1', recordKind: 'labware-instance', label: 'Reservoir A', lotNumber: 'L-77' },
        }],
      }],
    })
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText(/Reservoir A/)).toBeTruthy())
    expect(screen.getByText(/lot L-77/)).toBeTruthy()
    expect(screen.queryByText('no candidate')).toBeNull()
  })

  it('P2: bound role offers no candidate list and no selection/accept control', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [{
          roleId: 'reservoir',
          roleKind: 'labware' as const,
          state: 'bound' as const,
          candidates: [],
          bound: { recordId: 'LAB-1', recordKind: 'labware-instance', label: 'Reservoir A', lotNumber: 'L-77' },
        }],
      }],
    })
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText(/Reservoir A/)).toBeTruthy())
    const row = screen.getByTestId('role-binding-proposals')
      .querySelector('[data-role-id="reservoir"]')
    expect(row).not.toBeNull()
    const buttons = row?.querySelectorAll('button') || []
    expect(buttons.length).toBe(0)
  })

  it('P3: unbound role with stray bound payload still renders reason (state decides)', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [{
          roleId: 'plate',
          roleKind: 'labware' as const,
          state: 'unbound' as const,
          candidates: [],
          reason: 'No matching labware record found',
          bound: { recordId: 'LAB-1', recordKind: 'labware-instance', label: 'Reservoir A', lotNumber: 'L-77' },
        }],
      }],
    })
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText('No matching labware record found')).toBeTruthy())
    expect(screen.queryByText('Reservoir A')).toBeNull()
  })

  it('P4: bound state without bound payload renders fallback "bound" text', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [{
          roleId: 'probe',
          roleKind: 'labware' as const,
          state: 'bound' as const,
          candidates: [],
        }],
      }],
    })
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText('bound')).toBeTruthy())
    expect(screen.queryByText('no candidate')).toBeNull()
  })
})
