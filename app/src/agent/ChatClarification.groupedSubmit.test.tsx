/**
 * RED test: grouped clarification card — popover identity pick with rejected
 * groundMaterialRef never records into picks, so Submit-answers stays disabled.
 *
 * The defect: ClarificationPicker.tsx:682-707 — the async IIFE in `command`
 * has try + finally but no catch. A rejection from `groundedAnswerFromMention`
 * (which awaits `groundMaterialRef`) dies unhandled, `onPick` never fires,
 * the slot never records, and `allAnswered` stays false forever.
 *
 * Expected (after fix): even when groundMaterialRef rejects, the catch falls
 * back to answerFromMention so the slot records and submit is enabled.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup } from '@testing-library/react'
import React from 'react'
import type { AiClarificationRequest, AiClarificationAnswer } from '../types/ai'

// groundMaterialRef rejects — simulates API failure
vi.mock('../event-editor/lib/groundMaterialRef', () => ({
  groundMaterialRef: vi.fn().mockRejectedValue(new Error('API unavailable')),
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

describe('ChatClarificationCard grouped submit — popover pick rejection', () => {
  beforeEach(() => { vi.clearAllMocks() })
  afterEach(() => { cleanup() })

  it('submit enables after pick even when groundMaterialRef rejects (catch-and-fallback)', async () => {
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

    // FIX: catch block falls back to answerFromMention, so the slot records
    // and submit becomes enabled
    expect(submitBtn).not.toBeDisabled()
  })
})
