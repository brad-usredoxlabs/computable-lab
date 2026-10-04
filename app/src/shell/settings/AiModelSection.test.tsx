/**
 * AiModelSection — the one place the model is chosen, and the only one that can
 * TEST it. The failure this replaces: a chat switched profiles while ingestion
 * used another, and a thinking level the configured model never offered.
 */
import { afterEach, describe, expect, it, vi } from 'vitest'
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'

const { listMock, testMock, activateMock, saveMock, deleteMock } = vi.hoisted(() => ({
  listMock: vi.fn(),
  testMock: vi.fn(),
  activateMock: vi.fn(),
  saveMock: vi.fn(),
  deleteMock: vi.fn(),
}))
vi.mock('../../shared/api/client', () => ({
  apiClient: {
    listAiProfiles: listMock,
    testAiConfig: testMock,
    activateAiProfile: activateMock,
    saveAiProfile: saveMock,
    deleteAiProfile: deleteMock,
  },
}))

import { AiModelSection } from './AiModelSection'

afterEach(() => {
  cleanup()
  listMock.mockReset()
  testMock.mockReset()
  activateMock.mockReset()
  saveMock.mockReset()
  deleteMock.mockReset()
})

const PROFILES = {
  activeProfile: 'architect-q38',
  profiles: [
    { name: 'architect-q38', provider: 'openai-compatible', baseUrl: 'http://thunderbeast:8080/v1', model: 'qwen3.8-flash-next', active: true },
    { name: 'qwen36-35b', provider: 'openai-compatible', baseUrl: 'http://appliance-2:11434/v1', model: 'qwen3.6-35b-a3b', active: false },
  ],
}

/** A profile as the server now returns it: secret redacted, block round-tripped. */
const PROFILES_WITH_INFERENCE = {
  activeProfile: 'local-box',
  profiles: [
    {
      name: 'local-box',
      provider: 'openai-compatible',
      baseUrl: 'http://thunderbeast:8080/v1',
      model: 'qwen3.8-flash-next',
      active: true,
      hasApiKey: true,
      inference: { provider: 'openai-compatible', baseUrl: 'http://thunderbeast:8080/v1', model: 'qwen3.8-flash-next', apiKey: '***', timeoutMs: 60000, maxTokens: 8192 },
    },
  ],
}

describe('AiModelSection', () => {
  it('shows the active profile and its endpoint', async () => {
    listMock.mockResolvedValue(PROFILES)
    render(<AiModelSection />)

    await waitFor(() => expect(screen.getByTestId('settings-ai-details').textContent).toContain('qwen3.8-flash-next'))
    expect(screen.getByTestId('settings-ai-details').textContent).toContain('http://thunderbeast:8080/v1')
    expect(screen.getByTestId('settings-ai-activate').textContent).toBe('In use')
  })

  it('tests the selected profile against ITS endpoint and reports what it serves', async () => {
    listMock.mockResolvedValue(PROFILES)
    testMock.mockResolvedValue({
      success: true,
      available: true,
      provider: 'openai-compatible',
      baseUrl: 'http://appliance-2:11434/v1',
      model: 'qwen3.6-35b-a3b',
      modelKnown: true,
      models: ['qwen3.6-35b-a3b'],
    })
    render(<AiModelSection />)
    await waitFor(() => expect(screen.getByTestId('settings-ai-profile')).toBeTruthy())

    fireEvent.change(screen.getByTestId('settings-ai-profile'), { target: { value: 'qwen36-35b' } })
    fireEvent.click(screen.getByTestId('settings-ai-test'))

    await waitFor(() =>
      expect(testMock).toHaveBeenCalledWith({
        provider: 'openai-compatible',
        baseUrl: 'http://appliance-2:11434/v1',
        model: 'qwen3.6-35b-a3b',
      }),
    )
    expect(screen.getByTestId('settings-ai-test-result').textContent).toContain('serves qwen3.6-35b-a3b')
  })

  it('says so when the endpoint cannot be reached (never a silent success)', async () => {
    listMock.mockResolvedValue(PROFILES)
    testMock.mockResolvedValue({
      success: false,
      available: false,
      provider: 'openai-compatible',
      baseUrl: 'http://appliance-2:11434/v1',
      model: 'qwen3.6-35b-a3b',
      modelKnown: false,
      models: [],
      error: 'connect ECONNREFUSED',
    })
    render(<AiModelSection />)
    await waitFor(() => expect(screen.getByTestId('settings-ai-profile')).toBeTruthy())

    fireEvent.change(screen.getByTestId('settings-ai-profile'), { target: { value: 'qwen36-35b' } })
    fireEvent.click(screen.getByTestId('settings-ai-test'))

    await waitFor(() => {
      const alert = screen.getByTestId('settings-ai-test-result')
      expect(alert.textContent).toContain('Cannot reach')
      expect(alert.textContent).toContain('ECONNREFUSED')
    })
  })

  it('activates the picked profile so every surface follows it', async () => {
    listMock.mockResolvedValue(PROFILES)
    activateMock.mockResolvedValue({ success: true })
    render(<AiModelSection />)
    await waitFor(() => expect(screen.getByTestId('settings-ai-profile')).toBeTruthy())

    fireEvent.change(screen.getByTestId('settings-ai-profile'), { target: { value: 'qwen36-35b' } })
    fireEvent.click(screen.getByTestId('settings-ai-activate'))

    await waitFor(() => expect(activateMock).toHaveBeenCalledWith('qwen36-35b'))
    await waitFor(() => expect(screen.getByTestId('settings-ai-note').textContent).toContain('every surface uses'))
  })

  // ---- Profile editor: pointing the deployment at a hosted router ---------

  it('creates a profile for a hosted router (OpenRouter) and never invents a key', async () => {
    listMock.mockResolvedValue({ activeProfile: null, profiles: [] })
    saveMock.mockResolvedValue({ success: true })
    render(<AiModelSection />)

    // A fresh install has no profiles — the way in must still be reachable.
    await waitFor(() => expect(screen.getByTestId('settings-ai-empty')).toBeTruthy())
    fireEvent.click(screen.getByTestId('settings-ai-new-profile'))

    // OpenRouter is the default endpoint: the URL is a constant, not typed.
    expect(screen.getByDisplayValue(`OpenRouter (https://openrouter.ai/api/v1)`)).toBeTruthy()

    fireEvent.change(screen.getByPlaceholderText('openrouter'), { target: { value: 'openrouter' } })
    fireEvent.change(screen.getByPlaceholderText('openai/gpt-4o-mini'), {
      target: { value: 'anthropic/claude-sonnet-4.5' },
    })
    fireEvent.click(screen.getByTestId('settings-ai-save-profile'))

    await waitFor(() =>
      expect(saveMock).toHaveBeenCalledWith('openrouter', {
        inference: {
          provider: 'openai-compatible',
          baseUrl: 'https://openrouter.ai/api/v1',
          model: 'anthropic/claude-sonnet-4.5',
        },
      }),
    )
    // No key typed ⇒ no apiKey field at all (an empty string would be stored as a key).
    const [, body] = saveMock.mock.calls[0]!
    expect('apiKey' in (body as { inference: Record<string, unknown> }).inference).toBe(false)
  })

  it('round-trips the stored key and unexposed fields when editing a profile', async () => {
    listMock.mockResolvedValue(PROFILES_WITH_INFERENCE)
    saveMock.mockResolvedValue({ success: true })
    render(<AiModelSection />)

    await waitFor(() => expect(screen.getByTestId('settings-ai-profile')).toBeTruthy())
    expect(screen.getByTestId('settings-ai-details').textContent).toContain('stored')

    fireEvent.click(screen.getByTestId('settings-ai-edit-profile'))
    fireEvent.change(screen.getByPlaceholderText('openai/gpt-4o-mini'), {
      target: { value: 'anthropic/claude-sonnet-4.5' },
    })
    fireEvent.click(screen.getByTestId('settings-ai-save-profile'))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    const [savedName, body] = saveMock.mock.calls[0]!
    expect(savedName).toBe('local-box')
    expect((body as { inference: Record<string, unknown> }).inference).toEqual({
      // untouched fields survive the write (PUT replaces the whole object)
      timeoutMs: 60000,
      maxTokens: 8192,
      // blank key field keeps the stored one, still redacted
      apiKey: '***',
      provider: 'openai-compatible',
      baseUrl: 'http://thunderbeast:8080/v1',
      model: 'anthropic/claude-sonnet-4.5',
    })
  })

  it('replaces the stored key when a new one is typed', async () => {
    listMock.mockResolvedValue(PROFILES_WITH_INFERENCE)
    saveMock.mockResolvedValue({ success: true })
    render(<AiModelSection />)

    await waitFor(() => expect(screen.getByTestId('settings-ai-profile')).toBeTruthy())
    fireEvent.click(screen.getByTestId('settings-ai-edit-profile'))
    fireEvent.change(screen.getByPlaceholderText('Leave blank to keep existing'), {
      target: { value: 'sk-or-v1-typed' },
    })
    fireEvent.click(screen.getByTestId('settings-ai-save-profile'))

    await waitFor(() => expect(saveMock).toHaveBeenCalledTimes(1))
    const [, body] = saveMock.mock.calls[0]!
    expect((body as { inference: Record<string, unknown> }).inference.apiKey).toBe('sk-or-v1-typed')
  })

  it('refuses to save without a model instead of writing a broken profile', async () => {
    listMock.mockResolvedValue({ activeProfile: null, profiles: [] })
    render(<AiModelSection />)

    await waitFor(() => expect(screen.getByTestId('settings-ai-new-profile')).toBeTruthy())
    fireEvent.click(screen.getByTestId('settings-ai-new-profile'))
    fireEvent.click(screen.getByTestId('settings-ai-save-profile'))

    await waitFor(() =>
      expect(screen.getByTestId('settings-ai-editor-error').textContent).toContain('Profile name is required'),
    )
    expect(saveMock).not.toHaveBeenCalled()
  })
})
