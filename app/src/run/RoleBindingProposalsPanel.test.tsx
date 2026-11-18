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
            { recordId: 'MAT-1', recordKind: 'material-instance', label: 'DMEM High Glucose' },
          ],
        },
        {
          roleId: 'enzyme',
          roleKind: 'material' as const,
          state: 'ambiguous' as const,
          candidates: [
            { recordId: 'MAT-2', recordKind: 'material-instance', label: 'Trypsin' },
            { recordId: 'MAT-3', recordKind: 'material-instance', label: 'Collagenase' },
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

  it('a proposed row renders the single candidate with a Bind affordance', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue(threeRoles)
    const { container } = render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText(/DMEM High Glucose/)).toBeTruthy())
    const proposed = container.querySelector('[data-proposal-state="proposed"]')
    expect(proposed).not.toBeNull()
    expect(proposed?.textContent).toContain('DMEM High Glucose')
    expect(proposed?.textContent?.toLowerCase()).toContain('proposed')
    expect(proposed?.textContent?.toLowerCase()).not.toContain('bound')
    expect(proposed?.textContent?.toLowerCase()).not.toContain('applied')
    // DEFECT-2 fix: the fixture candidate is material-instance, so assert the Bind button
    expect(proposed?.querySelector('[data-testid="bind-candidate"]')).not.toBeNull()
  })

  it('a proposed definition candidate renders no Bind button and shows the hint', async () => {
    // DEFECT-1: a single-candidate proposed role whose recordKind is 'material' (definition)
    // must render the hint text and no bind button
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [{
          roleId: 'medium',
          roleKind: 'material' as const,
          state: 'proposed' as const,
          candidates: [
            { recordId: 'MAT-DEF-1', recordKind: 'material', label: 'DMEM' },
          ],
        }],
      }],
    })
    const { container } = render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => {
      const proposed = container.querySelector('[data-proposal-state="proposed"]')
      expect(proposed).not.toBeNull()
      // No bind button for a definition candidate
      expect(proposed?.querySelector('[data-testid="bind-candidate"]')).toBeNull()
      // Hint text is present
      expect(proposed?.textContent).toContain('definition, bind an instance instead')
    })
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
          candidates: [{ recordId: 'MAT-1', recordKind: 'material-instance', label: 'DMEM High Glucose' }],
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

  it('clicking Bind on a proposed role posts the correct body', async () => {
    mocks.getRoleBindingProposals.mockResolvedValue(threeRoles)
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText(/DMEM High Glucose/)).toBeTruthy())
    // Find the Bind button for the proposed candidate MAT-1
    const bindBtns = screen.getAllByTestId('bind-candidate')
    const bindBtn = bindBtns.find(btn => btn.dataset.candidateId === 'MAT-1')
    expect(bindBtn).toBeTruthy()

    await act(async () => { bindBtn!.click() })

    expect(mocks.updatePlannedRunBindings).toHaveBeenCalledWith('run-1', {
      materials: [{ roleId: 'medium', materialInstanceRef: 'MAT-1' }],
    })
  })

  it('bound and unbound states render no Bind button and issue no POST', async () => {
    const boundUnbound = {
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [
          {
            roleId: 'enzyme',
            roleKind: 'material' as const,
            state: 'bound' as const,
            bound: { recordId: 'MAT-B', recordKind: 'material', label: 'Bound Enzyme' },
            candidates: [],
          },
          {
            roleId: 'plate',
            roleKind: 'labware' as const,
            state: 'unbound' as const,
            candidates: [],
            reason: 'No labware record matches the declared kind',
          },
        ],
      }],
    }
    mocks.getRoleBindingProposals.mockResolvedValue(boundUnbound)
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText('enzyme')).toBeTruthy())
    // No Bind buttons at all
    expect(screen.queryByTestId('bind-candidate')).toBeNull()
    // No POST was issued
    expect(mocks.updatePlannedRunBindings).not.toHaveBeenCalled()
  })

  it('DEFECT-2: definition candidate renders no Bind button; instance candidate does', async () => {
    // A projection with an ambiguous role listing both a definition ('material')
    // and an instance ('material-instance'). Only the instance should offer Bind.
    mocks.getRoleBindingProposals.mockResolvedValue({
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [{
          roleId: 'reagent',
          roleKind: 'material' as const,
          state: 'ambiguous' as const,
          candidates: [
            { recordId: 'DEF-MAT-1', recordKind: 'material', label: 'PBTG' },
            { recordId: 'INST-MAT-1', recordKind: 'material-instance', label: 'PBTG · Lot 42', lotNumber: '42' },
          ],
        }],
      }],
    })
    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText(/Lot 42/)).toBeTruthy())

    // Both labels visible
    expect(screen.getAllByText(/PBTG/).length).toBe(2)
    expect(screen.getByText(/PBTG · Lot 42/)).toBeTruthy()

    // The instance candidate must have a Bind button
    const instanceBindBtn = screen.queryByTestId('bind-candidate')
    expect(instanceBindBtn).not.toBeNull()
    expect(instanceBindBtn?.dataset.candidateId).toBe('INST-MAT-1')

    // Only ONE bind button (the instance), not for the definition
    expect(screen.getAllByTestId('bind-candidate').length).toBe(1)

    // Clicking Bind posts the instance ref
    await act(async () => { instanceBindBtn!.click() })
    expect(mocks.updatePlannedRunBindings).toHaveBeenCalledWith('run-1', {
      materials: [{ roleId: 'reagent', materialInstanceRef: 'INST-MAT-1' }],
    })
  })

  it('disables ALL Bind buttons while any bind is in-flight (in-flight guard)', async () => {
    const twoAmbiguousRoles = {
      protocols: [{
        protocolId: 'PROTO-1',
        roles: [
          {
            roleId: 'enzyme',
            roleKind: 'material' as const,
            state: 'ambiguous' as const,
            candidates: [
              { recordId: 'MAT-2', recordKind: 'material-instance', label: 'Trypsin' },
              { recordId: 'MAT-3', recordKind: 'material-instance', label: 'Collagenase' },
            ],
          },
          {
            roleId: 'medium',
            roleKind: 'material' as const,
            state: 'ambiguous' as const,
            candidates: [
              { recordId: 'MAT-1', recordKind: 'material-instance', label: 'DMEM' },
            ],
          },
        ],
      }],
    }

    let resolveBind: () => void
    const bindPromise = new Promise<void>(resolve => { resolveBind = resolve })

    mocks.getRoleBindingProposals.mockResolvedValue(twoAmbiguousRoles)
    mocks.updatePlannedRunBindings.mockReturnValue(bindPromise)

    render(<RoleBindingProposalsPanel runId="run-1" />)

    await waitFor(() => expect(screen.getByText('Trypsin')).toBeTruthy())

    const allBindBtns = screen.getAllByTestId('bind-candidate')
    const buttonA = allBindBtns.find(btn => btn.dataset.candidateId === 'MAT-2')!
    const buttonB = allBindBtns.find(btn => btn.dataset.candidateId === 'MAT-1')!

    // Click Bind on role A
    await act(async () => { buttonA.click() })

    // While the API call is pending, ALL bind buttons must be disabled
    expect(buttonA).toBeDisabled()
    expect(buttonB).toBeDisabled()

    // Resolve the pending bind
    await act(async () => { resolveBind() })

    // After resolution, buttons are re-enabled
    expect(buttonA).not.toBeDisabled()
    expect(buttonB).not.toBeDisabled()
  })
})
