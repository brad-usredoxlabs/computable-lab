import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { BuildCompoundForm } from './BuildCompoundForm'
import { apiClient } from '../../../shared/api/client'

vi.mock('../../../shared/api/client', () => ({
  apiClient: {
    createRecord: vi.fn(),
    createFormulation: vi.fn(),
  },
}))

vi.mock('../useOntologyConfig', () => ({
  useOntologyConfig: () => ({ ontologies: ['chebi'], isDefault: true }),
}))

describe('BuildCompoundForm', () => {
  beforeEach(() => {
    vi.mocked(apiClient.createRecord).mockReset()
    vi.mocked(apiClient.createFormulation).mockReset()
    vi.mocked(apiClient.createRecord).mockResolvedValue({ success: true } as never)
    vi.mocked(apiClient.createFormulation).mockResolvedValue({
      success: true,
      materialId: 'MAT-FENOFIBRATE',
      materialSpecId: 'MSP-FENOFIBRATE-1MM',
      recipeId: 'RCP-FENOFIBRATE-1MM',
    } as never)
  })

  it('saves a formulation with an active input role', async () => {
    render(
      <BuildCompoundForm
        onSaved={() => {}}
        onCancel={() => {}}
        onError={() => {}}
      />,
    )

    fireEvent.change(screen.getByLabelText(/Compound name/i), { target: { value: 'Fenofibrate' } })
    await waitFor(() => expect(screen.getByDisplayValue('1 mM Fenofibrate')).toBeTruthy())
    fireEvent.click(screen.getByRole('button', { name: /Save formulation/i }))

    await waitFor(() => expect(apiClient.createFormulation).toHaveBeenCalled())
    const body = vi.mocked(apiClient.createFormulation).mock.calls[0]?.[0] as {
      recipe?: { inputRoles?: Array<{ roleId?: string; roleType?: string; materialRefId?: string }> }
      outputSpec?: { materialRefId?: string; formulationKind?: string }
    }
    expect(body.recipe?.inputRoles).toEqual(expect.arrayContaining([
      expect.objectContaining({
        roleId: 'active',
        roleType: 'solute',
        materialRefId: expect.stringMatching(/^MAT-/),
      }),
    ]))
    expect(body.outputSpec).toMatchObject({
      materialRefId: expect.stringMatching(/^MAT-/),
      formulationKind: 'single_active',
    })
  })
})
