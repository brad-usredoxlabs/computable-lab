/**
 * W2-9 T4 — SemanticPassModelSection (spec §3 R4 under the OQ3 ruling: the
 * section binds the MERGED ai.semanticPass block keys ONLY).
 *
 * Pins:
 *  - MISSING block = the named fallback label (shadowRouter kill-switch
 *    semantics: nothing defaults ON);
 *  - the PATCH body is the semanticPass subtree ONLY — no activeProfile, no
 *    inference, no profiles (the activate route is never called: unrelated
 *    model settings stay untouched);
 *  - an existing block round-trips its stored values; a blank API key over a
 *    stored key sends the REDACTED placeholder (the secret survives);
 *  - the persisted state renders from the PATCH response (GET /api/config
 *    shape), and the disclosure names the single-knob truth.
 */
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const getConfigMock = vi.fn()
const patchConfigMock = vi.fn()
const activateMock = vi.fn()
const listProfilesMock = vi.fn()

vi.mock('../../shared/api/client', () => ({
  apiClient: {
    getConfig: (...args: unknown[]) => getConfigMock(...args),
    patchConfig: (...args: unknown[]) => patchConfigMock(...args),
    activateAiProfile: (...args: unknown[]) => activateMock(...args),
    listAiProfiles: (...args: unknown[]) => listProfilesMock(...args),
  },
}))

import { SemanticPassModelSection } from './SemanticPassModelSection'
import { REDACTED } from '../../types/config'

function configResponse(aiOverrides?: Record<string, unknown>) {
  return {
    repositories: [{ id: 'lab', default: true }],
    ai: {
      activeProfile: 'architect-q38',
      profiles: {
        'architect-q38': { inference: { baseUrl: 'http://thunderbeast:8080/v1', model: 'qwen3.8-flash-next' }, agent: {} },
    },
      inference: { baseUrl: 'http://thunderbeast:8080/v1', model: 'qwen3.8-flash-next' },
      agent: {},
      ...(aiOverrides ? { semanticPass: aiOverrides } : {}),
    },
    aiProfiles: ['architect-q38'],
    aiActiveProfile: 'architect-q38',
    aiStatus: { available: true, inferenceUrl: 'http://thunderbeast:8080/v1', model: 'qwen3.8-flash-next' },
  } as never
}

beforeEach(() => {
  cleanup()
  getConfigMock.mockReset()
  patchConfigMock.mockReset()
  activateMock.mockReset()
  listProfilesMock.mockReset()
  getConfigMock.mockResolvedValue(configResponse())
  patchConfigMock.mockResolvedValue({
    success: true,
    message: 'Configuration updated.',
    restartRequired: false,
    config: configResponse({ baseUrl: 'http://appliance-2:18080/v1', model: 'qwen3.8-flash-next-iq3' }),
  })
})

describe('SemanticPassModelSection (W2-9 T4)', () => {
  it('with NO semanticPass block it names the fallback (MISSING = follows the active profile)', async () => {
    render(<SemanticPassModelSection />)
    const arm = await screen.findByTestId('semantic-pass-fallback')
    expect(arm.textContent).toContain('No override set')
    expect(arm.textContent).toContain('active profile')
    // The disclosure states the honest scope: the pass ONLY.
    const disclosure = screen.getByTestId('semantic-pass-disclosure')
    expect(disclosure.textContent).toContain('semantic pass ONLY')
  })

  it('saves an override through PATCH /api/config whose body is the semanticPass subtree ONLY (never the activate route)', async () => {
    render(<SemanticPassModelSection />)
    fireEvent.click(await screen.findByTestId('semantic-pass-edit'))

    // Model + endpoint are keys the merged block declares.
    const inputs = screen.getAllByRole('textbox')
    fireEvent.change(inputs[0], { target: { value: 'http://appliance-2:18080/v1' } })
    fireEvent.change(inputs[1], { target: { value: 'qwen3.8-flash-next-iq3' } })

    fireEvent.click(screen.getByTestId('semantic-pass-save'))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalledTimes(1))

    const [body] = patchConfigMock.mock.calls[0]
    expect(body).toEqual({
      ai: { semanticPass: { baseUrl: 'http://appliance-2:18080/v1', model: 'qwen3.8-flash-next-iq3' } },
    })
    // Unrelated model settings are NOT in the body and the activate route is
    // never touched (activeProfile / inference / profiles ride untouched).
    expect(body.ai.activeProfile).toBeUndefined()
    expect(body.ai.inference).toBeUndefined()
    expect(body.ai.profiles).toBeUndefined()
    expect(activateMock).not.toHaveBeenCalled()
    expect(listProfilesMock).not.toHaveBeenCalled()

    // The persisted state renders from the response.
    await waitFor(() => expect(screen.getByTestId('semantic-pass-current')).toBeTruthy())
    expect(screen.getByTestId('semantic-pass-current-model').textContent).toContain('qwen3.8-flash-next-iq3')
  })

  it('round-trips an existing block (values pre-fill; a blank key over a stored key preserves the secret)', async () => {
    getConfigMock.mockResolvedValue(
      configResponse({ baseUrl: 'http://appliance-2:18080/v1', model: 'qwen3.8-flash-next-iq3', apiKey: REDACTED, maxTokens: 4096 }),
    )
    patchConfigMock.mockResolvedValue({
      success: true,
      message: 'Configuration updated.',
      restartRequired: false,
      config: configResponse({ baseUrl: 'http://appliance-2:18080/v1', model: 'qwen3.8-flash-next-iq3', apiKey: REDACTED, maxTokens: 4096 }),
    })
    render(<SemanticPassModelSection />)
    expect((await screen.findByTestId('semantic-pass-current-model')).textContent).toContain('qwen3.8-flash-next-iq3')

    fireEvent.click(screen.getByTestId('semantic-pass-edit'))
    fireEvent.click(screen.getByTestId('semantic-pass-save'))
    await waitFor(() => expect(patchConfigMock).toHaveBeenCalledTimes(1))

    const [body] = patchConfigMock.mock.calls[0]
    expect(body.ai.semanticPass).toEqual({
      baseUrl: 'http://appliance-2:18080/v1',
      model: 'qwen3.8-flash-next-iq3',
      apiKey: REDACTED,
      maxTokens: 4096,
    })
  })

  it('a rejected PATCH shows the server error verbatim and keeps the stored state', async () => {
    patchConfigMock.mockRejectedValue(new Error('Validation failed: semanticPass.maxTokens must be a number'))
    render(<SemanticPassModelSection />)
    fireEvent.click(await screen.findByTestId('semantic-pass-edit'))
    const numberInputs = screen.getAllByRole('spinbutton')
    fireEvent.change(numberInputs[0], { target: { value: 'not-a-number' } })
    fireEvent.click(screen.getByTestId('semantic-pass-save'))
    const error = await screen.findByTestId('semantic-pass-error')
    expect(error.textContent).toContain('semanticPass.maxTokens must be a number')
    expect(screen.getByTestId('semantic-pass-fallback')).toBeTruthy()
  })
})
