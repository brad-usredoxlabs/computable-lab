import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '../shared/api/errors'
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

/** Flush the effect's promise chain without asserting on the (initially empty) DOM. */
async function settle() {
  await act(async () => {
    await Promise.resolve()
    await Promise.resolve()
  })
}

const threeRoles = {
  protocols: [
    {
      protocolId: 'PROTO-1',
      roles: [
        {
          roleId: 'medium',
          roleKind: 'material' as const,
          state: 'proposed' as const,
          candidates: [
            { recordId: 'MAT-1', recordKind: 'vendor-product', label: 'DMEM High Glucose' },
          ],
        },
        {
          roleId: 'enzyme',
          roleKind: 'material' as const,
          state: 'ambiguous' as const,
          candidates: [
            { recordId: 'MAT-2', recordKind: 'material', label: 'Trypsin' },
            { recordId: 'MAT-3', recordKind: 'material', label: 'Collagenase' },
          ],
        },
        {
          roleId: 'plate',
          roleKind: 'labware' as const,
          state: 'unbound' as const,
          candidates: [],
          reason: 'No labware record matches the declared kind',
        },
      ],
    },
  ],
  // Optional u3clarify cards are TOP-LEVEL siblings of `protocols` on the wire
  // (server: { ...proposals, ...{ clarificationRequests: cards } }). Absent-tolerant;
  // when present the server prompt wins over the panel fallback.
  clarificationRequests: [{ roleId: 'enzyme', prompt: 'Which enzyme should this run use?' }],
}

describe('RoleBindingProposalsPanel', () => {
  it('renders each declared role proposal: proposed label, ambiguous candidates + prompt, unbound reason', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue(threeRoles)
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText(/DMEM High Glucose/)).toBeTruthy())
    expect(screen.getByText('PROTO-1')).toBeTruthy()
    expect(screen.getByText('medium')).toBeTruthy()
    expect(screen.getByText('Trypsin')).toBeTruthy()
    expect(screen.getByText('Collagenase')).toBeTruthy()
    expect(screen.getByText('Which enzyme should this run use?')).toBeTruthy()
    expect(screen.getByText('No labware record matches the declared kind')).toBeTruthy()
    expect(mocks.getRoleBindingProposals).toHaveBeenCalledWith('run-1')
  })

  it('marks a single candidate as proposed (read-only preselection, never bound)', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue(threeRoles)
    const { container } = render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText(/DMEM High Glucose/)).toBeTruthy())
    const proposed = container.querySelector('[data-proposal-state="proposed"]')
    expect(proposed).not.toBeNull()
    expect(proposed?.textContent).toContain('DMEM High Glucose')
    expect(proposed?.textContent?.toLowerCase()).toContain('proposed')
    expect(proposed?.textContent?.toLowerCase()).not.toContain('bound')
    expect(proposed?.textContent?.toLowerCase()).not.toContain('applied')
  })

  it('renders nothing for an empty projection — no empty-state card', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue({ protocols: [] })
    const { container } = render(<RoleBindingProposalsPanel runId="run-1" />)
    await settle()
    expect(container.firstChild).toBeNull()
    expect(screen.queryByText(/no role/i)).toBeNull()
  })

  it('treats a 404 (run without an attached protocol) as nothing to show, not an error', async () => {
    mocks.getRoleBindingProposals.mockRejectedValue(
      new ApiError({ status: 404, code: 'PLANNED_RUN_NOT_FOUND', message: 'Planned-run not found' }),
    )
    const { container } = render(<RoleBindingProposalsPanel runId="run-1" />)
    await settle()
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })
})
