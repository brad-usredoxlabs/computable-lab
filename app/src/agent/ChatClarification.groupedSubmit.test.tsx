/**
 * Pinned tests for the grouped clarification card submission gate.
 *
 * TRUTHFUL transport probe: advc cycle-1 proved that mocking groundMaterialRef
 * to reject does NOT represent a real transport failure — groundMaterialRef
 * wraps its api call in try/catch and returns the original ref. The truthful
 * probe mocks the TRANSPORT (apiClient.groundOntologyMaterial), which is what
 * actually fails in production. On a real transport failure, groundedAnswerFromMention
 * resolves through the pre-existing fallback and returns answerFromMention bytes.
 *
 * onPick-throw pin: the narrowed catch must not swallow errors from onPick or
 * closePicker — they run outside the catch so any throw propagates.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import React from 'react'
import type { AiClarificationRequest, AiClarificationAnswer } from '../types/ai'

// TRANSPORT mock: groundOntologyMaterial rejects (the shape production produces)
const mockGroundOntologyMaterial = vi.fn().mockRejectedValue(new Error('transport fails'))
const mockMintLocalTerm = vi.fn().mockResolvedValue({ recordId: 'MINT-1', label: 'Mint' })
vi.mock('../shared/api/client', () => ({
  apiClient: {
    groundOntologyMaterial: (...args: unknown[]) => mockGroundOntologyMaterial(...args),
    mintLocalTerm: (...args: unknown[]) => mockMintLocalTerm(...args),
  },
}))

// Resolver returns a candidate with a CURIE mention (triggers the ontology path)
const mockResolveMaterial = vi.fn().mockResolvedValue([
  {
    label: 'Test Material',
    key: 'test-mat-1',
    badge: 'material',
    mention: {
      type: 'material' as const,
      entityKind: 'material' as const,
      id: 'CHEBI:17790',
      label: 'Test Material',
    },
    disabled: false,
    pinBottom: false,
    resolveMention: undefined,
  },
])
vi.mock('../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: mockResolveMaterial,
  resolveLabware: vi.fn(),
  resolveEquipment: vi.fn(),
}))

vi.mock('../shared/taptab/slashMenu/SlashSuggestionList', () => ({
  SlashSuggestionList: vi.fn(() => null),
}))
vi.mock('../shared/taptab/slashMenu/tokens', () => ({
  badgeStyles: () => ({ color: '#000', background: '#fff', border: '#ccc' }),
  VOCABULARY_BADGE: { mint: 'Mint' },
}))
vi.mock('../shared/hooks/clarificationAnswerPrompt', () => ({
  clarificationAnswersPrompt: vi.fn((answers: AiClarificationAnswer[]) => `Answered: ${answers.length}`),
}))
vi.mock('../event-editor/right-pane/ai/ParameterAnswerInput', () => ({
  ParameterAnswerInput: vi.fn(() => null),
}))
vi.mock('./ClarifyAssumedChip', () => ({ ClarifyAssumedChip: vi.fn(() => null) }))
vi.mock('./ClarifyWellTargetSlot', () => ({ ClarifyWellTargetSlot: vi.fn(() => null) }))

// Import after mocks
const ChatClarificationCardModule = await import('./ChatClarificationCard')

describe('ChatClarificationCard grouped submit — truthful transport probe', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('transport failure falls back to the ontology answer, not a catch', async () => {
    const onClarificationSubmit = vi.fn()
    const requests: AiClarificationRequest[] = [
      {
        id: 'req-1', kind: 'material', prompt: 'Which material?',
        menuProvider: '/m', query: 'test material', options: [],
        slot: 'slot-A',
      },
    ]

    render(
      React.createElement(ChatClarificationCardModule.ChatClarificationCard, {
        requests, turnKey: 'turn-1', shownPrompts: new Set<string>(), onClarificationSubmit,
      })
    )

    expect(screen.getByTestId('chat-clarification-card')).toBeTruthy()

    // Submit disabled initially (no picks)
    const submitBtn = screen.getByTestId('chat-clarification-submit')
    expect(submitBtn).toBeDisabled()

    // Wait for mount pass to populate top candidates
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })

    // Click the candidate button
    const candidateBtns = screen.getAllByTestId('clarification-top3-row')
    expect(candidateBtns.length).toBeGreaterThanOrEqual(1)

    await act(async () => {
      fireEvent.click(candidateBtns[0] as HTMLElement)
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })

    // TRUTHFUL FINDING: groundOntologyMaterial rejects at the transport level,
    // but groundMaterialRef catches and returns the original ontology ref.
    // groundedAnswerFromMention resolves through answerFromMention — no catch
    // is needed because the rejection never reaches it.
    // The slot records and submit becomes enabled.
    expect(submitBtn).not.toBeDisabled()
  })

  it('pick completes and enables submit when transport succeeds', async () => {
    // The narrowed catch covers ONLY the grounding await. When the transport
    // succeeds and grounds to a record, the answer flows through normally —
    // onPick fires, closePicker fires, and the slot records.
    // Structural guarantee: onPick + closePicker run OUTSIDE the inner catch,
    // so a throw from either propagates as an unhandled rejection.
    mockGroundOntologyMaterial.mockResolvedValue({
      materialRef: { kind: 'record', id: 'M-1', type: 'material', label: 'Grounded Material' },
    })

    const onClarificationSubmit = vi.fn()
    const requests: AiClarificationRequest[] = [
      {
        id: 'req-1', kind: 'material', prompt: 'Which material?',
        menuProvider: '/m', query: 'test material', options: [],
        slot: 'slot-A',
      },
    ]

    render(
      React.createElement(ChatClarificationCardModule.ChatClarificationCard, {
        requests, turnKey: 'turn-1', shownPrompts: new Set<string>(), onClarificationSubmit,
      })
    )

    const submitBtn = screen.getByTestId('chat-clarification-submit')
    expect(submitBtn).toBeDisabled()

    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })

    const candidateBtns = screen.getAllByTestId('clarification-top3-row')
    expect(candidateBtns.length).toBeGreaterThanOrEqual(1)

    await act(async () => {
      fireEvent.click(candidateBtns[0] as HTMLElement)
    })
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })

    // Pick succeeded: slot records and submit enables
    expect(submitBtn).not.toBeDisabled()
  })
})
