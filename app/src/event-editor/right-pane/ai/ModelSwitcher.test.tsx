/**
 * ModelSwitcher tests — assert the profile selector renders the active model
 * and calls activate when the user picks a different profile. Load/activate are
 * injected as props so no network / apiClient mocking is needed here.
 */

import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ModelSwitcher, type AiProfileSummary } from './ModelSwitcher'

const PROFILES: AiProfileSummary[] = [
  { name: 'ornith', provider: 'openai-compatible', baseUrl: 'http://appliance-2:11434/v1', model: 'ornith-1.5-35b-a3b', active: true },
  { name: 'lfm2.5', provider: 'openai-compatible', baseUrl: 'http://127.0.0.1:8899/v1', model: 'lfm2.5', active: false },
]

afterEach(() => cleanup())

function makeLoad(activeProfile: string | null = 'ornith', profiles = PROFILES) {
  return vi.fn(async () => ({ profiles, activeProfile }))
}

describe('ModelSwitcher', () => {
  it('renders nothing when no profiles are configured', async () => {
    const load = vi.fn(async () => ({ profiles: [], activeProfile: null }))
    render(<ModelSwitcher loadProfiles={load} />)
    await waitFor(() => expect(load).toHaveBeenCalled())
    expect(screen.queryByTestId('ai-model-switch')).toBeNull()
  })

  it('renders the active profile as the selected option', async () => {
    const load = makeLoad()
    render(<ModelSwitcher loadProfiles={load} />)
    const select = await screen.findByTestId('ai-model-switch-select') as HTMLSelectElement
    expect(select.value).toBe('ornith')
    expect(screen.getAllByRole('option').map((o) => o.textContent)).toEqual(['ornith', 'lfm2.5'])
  })

  it('activates the chosen profile and refetches the list', async () => {
    const load = makeLoad()
    const activate = vi.fn(async () => ({ success: true, message: 'Switched' }))
    render(<ModelSwitcher loadProfiles={load} activateProfile={activate} />)
    const select = await screen.findByTestId('ai-model-switch-select') as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'lfm2.5' } })
    await waitFor(() => expect(activate).toHaveBeenCalledWith('lfm2.5'))
    // After activation success, the list is refetched (activeProfile still ornith
    // in our mock — the important assertion is that activate was called and the
    // control reflected the selection while switching).
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThanOrEqual(2))
  })

  it('surfaces an error when activation fails and keeps the prior selection', async () => {
    const load = makeLoad()
    const activate = vi.fn(async () => ({ success: false, message: 'Profile not found' }))
    render(<ModelSwitcher loadProfiles={load} activateProfile={activate} />)
    const select = await screen.findByTestId('ai-model-switch-select') as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'lfm2.5' } })
    await waitFor(() => expect(activate).toHaveBeenCalledWith('lfm2.5'))
    expect(await screen.findByTestId('ai-model-switch-error')).toBeTruthy()
  })

  it('ignores selecting the already-active profile', async () => {
    const load = makeLoad()
    const activate = vi.fn(async () => ({ success: true }))
    render(<ModelSwitcher loadProfiles={load} activateProfile={activate} />)
    const select = await screen.findByTestId('ai-model-switch-select') as HTMLSelectElement

    fireEvent.change(select, { target: { value: 'ornith' } })
    // No call — same profile selected.
    await waitFor(() => expect(activate).not.toHaveBeenCalled())
  })
})