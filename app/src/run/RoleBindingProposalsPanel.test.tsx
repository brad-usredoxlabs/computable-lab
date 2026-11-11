import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, cleanup, render, screen, waitFor } from '@testing-library/react'
import { ApiError } from '../shared/api/errors'
import { RoleBindingProposalsPanel } from './RoleBindingProposalsPanel'

const mocks = vi.hoisted(() => ({
  getRoleBindingProposals: vi.fn(),
  updatePlannedRunBindings: vi.fn(),
}))

vi.mock('../shared/api/client', () => ({
  apiClient: {
    getRoleBindingProposals: mocks.getRoleBindingProposals,
    updatePlannedRunBindings: mocks.updatePlannedRunBindings,
  },
}))

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})
beforeEach(() => {
  mocks.getRoleBindingProposals.mockReset()
  mocks.updatePlannedRunBindings.mockReset()
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

  it('treats a NOT_A_PLANNED_RUN refusal (400) as nothing to show — not a red alert', async () => {
    mocks.getRoleBindingProposals.mockRejectedValue(
      new ApiError({ status: 400, code: 'HTTP_400', message: "NOT_A_PLANNED_RUN: Record 'RUN-x' is not a planned-run" }),
    )
    const { container } = render(<RoleBindingProposalsPanel runId="run-1" />)
    await settle()
    expect(container.firstChild).toBeNull()
    expect(screen.queryByRole('alert')).toBeNull()
  })

  it('still renders an alert for a 400 with a different error token (not silenced)', async () => {
    mocks.getRoleBindingProposals.mockRejectedValue(
      new ApiError({ status: 400, code: 'HTTP_400', message: 'NO_PROTOCOL_ATTACHED: no protocol' }),
    )
    render(<RoleBindingProposalsPanel runId="run-1" />)
    await settle()
    expect(screen.queryByRole('alert')).not.toBeNull()
  })

  it('renders protocolNotFound marker and reason for a missing protocol', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [
        {
          protocolId: 'MISSING-PROTO',
          roles: [],
          protocolNotFound: true,
          reason: "protocol 'MISSING-PROTO' referenced by this run does not exist in the store",
        },
      ],
    })
    const { container } = render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => {
      const marker = container.querySelector('[data-protocol-not-found]')
      expect(marker).not.toBeNull()
    })
    expect(screen.getByText("protocol 'MISSING-PROTO' referenced by this run does not exist in the store")).toBeTruthy()
    expect(screen.getByText('MISSING-PROTO')).toBeTruthy()
  })

  it('renders protocol-level reason when present alongside the protocol id', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [
        {
          protocolId: 'PROTO-WITH-REASON',
          roles: [],
          reason: 'custom reason for this protocol',
        },
      ],
    })
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => {
      expect(screen.getByText('PROTO-WITH-REASON')).toBeTruthy()
      expect(screen.getByText('custom reason for this protocol')).toBeTruthy()
    })
  })

  it('clicking Bind for an ambiguous material candidate posts materials binding', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue(threeRoles)
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText('Collagenase')).toBeTruthy())
    const bindBtns = screen.getAllByTestId('bind-candidate')
    const bindBtn = bindBtns.find(btn => btn.dataset.candidateId === 'MAT-3')
    expect(bindBtn).toBeTruthy()
    await act(async () => { bindBtn!.click() })

    expect(mocks.updatePlannedRunBindings).toHaveBeenCalledWith('run-1', {
      materials: [{ roleId: 'enzyme', materialInstanceRef: 'MAT-3' }],
    })
  })

  it('clicking Bind for a labware candidate posts labware binding', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [{
          roleId: 'plate',
          roleKind: 'labware' as const,
          state: 'ambiguous' as const,
          candidates: [
            { recordId: 'LAB-1', recordKind: 'labware-instance', label: 'Plate A' },
            { recordId: 'LAB-2', recordKind: 'labware-instance', label: 'Plate B' },
          ],
        }],
      }],
    })
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText('Plate B')).toBeTruthy())
    const bindBtns = screen.getAllByTestId('bind-candidate')
    const bindBtn = bindBtns.find(btn => btn.dataset.candidateId === 'LAB-2')
    expect(bindBtn).toBeTruthy()
    await act(async () => { bindBtn!.click() })

    expect(mocks.updatePlannedRunBindings).toHaveBeenCalledWith('run-1', {
      labware: [{ roleId: 'plate', labwareInstanceRef: 'LAB-2' }],
    })
  })

  it('after a successful bind the panel re-reads proposals', async () => {
    const boundResponse = {
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [{
          roleId: 'enzyme',
          roleKind: 'material' as const,
          state: 'bound' as const,
          bound: { recordId: 'MAT-3', recordKind: 'material', label: 'Collagenase' },
          candidates: [],
        }, {
          roleId: 'medium',
          roleKind: 'material' as const,
          state: 'proposed' as const,
          candidates: [{ recordId: 'MAT-1', recordKind: 'vendor-product', label: 'DMEM High Glucose' }],
        }, {
          roleId: 'plate',
          roleKind: 'labware' as const,
          state: 'unbound' as const,
          candidates: [],
          reason: 'No labware record matches the declared kind',
        }],
      }],
      clarificationRequests: [],
    }
    mocks.getRoleBindingProposals
      .mockResolvedValueOnce(threeRoles)
      .mockResolvedValueOnce(boundResponse)
    mocks.updatePlannedRunBindings.mockResolvedValueOnce({ success: true })

    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText('Collagenase')).toBeTruthy())
    const bindBtns = screen.getAllByTestId('bind-candidate')
    const bindBtn = bindBtns.find(btn => btn.dataset.candidateId === 'MAT-3')
    expect(bindBtn).toBeTruthy()
    await act(async () => { bindBtn!.click() })

    await waitFor(() => expect(mocks.getRoleBindingProposals).toHaveBeenCalledTimes(2))
  })

  it('on a rejected bind the panel shows the error in an alert and does not claim bound', async () => {
    const err = new ApiError({ status: 400, code: 'HTTP_400', message: 'Role already bound' })
    mocks.getRoleBindingProposals.mockResolvedValue(threeRoles)
    mocks.updatePlannedRunBindings.mockRejectedValueOnce(err)

    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText('Collagenase')).toBeTruthy())
    const bindBtns = screen.getAllByTestId('bind-candidate')
    const bindBtn = bindBtns.find(btn => btn.dataset.candidateId === 'MAT-2')
    expect(bindBtn).toBeTruthy()
    await act(async () => { bindBtn!.click() })

    await waitFor(() => {
      const alert = screen.queryByRole('alert')
      expect(alert).not.toBeNull()
      expect(alert?.textContent).toContain('Role already bound')
    })
  })
})
