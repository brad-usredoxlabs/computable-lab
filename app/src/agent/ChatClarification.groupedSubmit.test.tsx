/**
 * Pinned tests for grouped-arm answer — u3driverwiring / u3fix2.
 *
 * Pin (a): onPick throw propagation — the u2 narrowed catch covers ONLY
 * groundedAnswerFromMention. onPick runs OUTSIDE the catch, so a throw
 * must propagate. u1 had a broad catch that wrapped onPick, so a throw
 * from onPick was caught, fallback returned null (for mint suggestions
 * where item.mention has empty id), and the error was swallowed.
 *
 * Pin (b): option-surface click records ref bytes — the numbered <ol>
 * buttons answer the slot and carry the option's ref in the answer.
 *
 * Pins (c)/(d) (restored by u3fix2 FIX-6, dropped by u3driverwiring): the
 * TRUTHFUL transport probe. Mocking groundMaterialRef to reject does NOT
 * represent a real transport failure — groundMaterialRef wraps its api call in
 * try/catch and returns the original ref. The truthful probe mocks the
 * TRANSPORT (apiClient.groundOntologyMaterial). On a real transport failure,
 * groundedAnswerFromMention resolves through answerFromMention and the slot
 * still records; on success the answer carries the grounded RECORD ref.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, act, cleanup, waitFor, within } from '@testing-library/react'
import React from 'react'
import type { AiClarificationRequest } from '../types/ai'
import type { SlashSuggestion } from '../shared/taptab/slashMenu/types'
import { ClarificationPicker } from '../event-editor/right-pane/ai/ClarificationPicker'
import { ChatClarificationCard } from './ChatClarificationCard'

// TRANSPORT mock: groundOntologyMaterial is what actually fails in production.
const mockGroundOntologyMaterial = vi.fn()
const mockMintLocalTerm = vi.fn().mockResolvedValue({ recordId: 'MINT-1', label: 'Mint' })
vi.mock('../shared/api/client', () => ({
  apiClient: {
    groundOntologyMaterial: (...args: unknown[]) => mockGroundOntologyMaterial(...args),
    mintLocalTerm: (...args: unknown[]) => mockMintLocalTerm(...args),
  },
}))

// Mock the slash-menu resolvers so we control suggestions deterministically.
const resolveMaterial = vi.fn()
const resolveLabware = vi.fn()
const resolveEquipment = vi.fn()
vi.mock('../shared/taptab/slashMenu/resolvers', () => ({
  resolveMaterial: () => resolveMaterial(),
  resolveLabware: () => resolveLabware(),
  resolveEquipment: () => resolveEquipment(),
  mintLocalTermLabel: (q: string) => `Create local term "${q}"`,
}))
vi.mock('../shared/taptab/slashMenu/tokens', () => ({
  badgeStyles: () => ({ color: '#000', background: '#fff', border: '#ccc' }),
  VOCABULARY_BADGE: { mint: 'Mint' },
}))

const materialRequest: AiClarificationRequest = {
  id: 'clar-1', kind: 'material', prompt: 'Which material for A3?',
  menuProvider: '/m', query: 'CHO', options: [],
}

// A candidate whose mention is a CURIE: the pick takes the ontology-grounding path.
const curieHit: SlashSuggestion = {
  key: 'test-mat-1', label: 'Test Material', badge: 'material',
  mention: { type: 'material', entityKind: 'material', id: 'CHEBI:17790', label: 'Test Material' },
}

const cardRequest = (): AiClarificationRequest => ({
  id: 'req-1', kind: 'material', prompt: 'Which material?',
  menuProvider: '/m', query: 'test material', options: [], slot: 'slot-A',
})

describe('u3driverwiring pinned tests', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    // Default transport state: the API call fails (the production failure shape).
    mockGroundOntologyMaterial.mockRejectedValue(new Error('transport fails'))
  })
  afterEach(() => { cleanup() })

  it('onPick throw propagates — not swallowed by catch', async () => {
    // Use a mint suggestion: item.mention has empty id, resolveMention returns
    // valid mention. In u1: onPick(answer) throws → outer catch →
    // answerFromMention(item.mention) → null (empty id) → swallowed.
    // In u2: onPick is outside the inner catch → throw propagates.
    const mintHit: SlashSuggestion = {
      key: 'mint:CHO',
      label: 'Create local term "CHO"',
      badge: 'New',
      pinBottom: true,
      mention: { type: 'material', entityKind: 'material', id: '', label: 'CHO' },
      resolveMention: vi.fn().mockResolvedValue({
        type: 'material', entityKind: 'material', id: 'MAT-minted', label: 'CHO',
      }),
    }
    resolveMaterial.mockResolvedValue([mintHit])

    const pickError = new Error('onPick must propagate')
    const onPick = vi.fn(() => { throw pickError })

    // The pick runs in the picker's floating async IIFE, so a PROPAGATED throw
    // lands as a process-level unhandled rejection. u3fix2 FIX-4b: own that
    // channel for the duration of the click (and hand it back to the runner
    // afterwards) so the assertions below — not the runner — judge the leak.
    const rejections: unknown[] = []
    const runnerHandlers = process.listeners('unhandledRejection')
    process.removeAllListeners('unhandledRejection')
    const capture = (reason: unknown) => { rejections.push(reason) }
    process.on('unhandledRejection', capture)
    try {
      const { container } = render(<ClarificationPicker request={materialRequest} onPick={onPick} />)

      // Open the picker so the popover renders suggestions
      const input = container.querySelector(
        'input.message-log__clarification-search',
      ) as HTMLInputElement
      fireEvent.click(input)
      await waitFor(() => screen.getByTestId('clarification-popover'), { timeout: 3000 })

      // Click the mint row in the popover
      const row = await waitFor(() =>
        within(screen.getByTestId('clarification-popover')).getByText('Create local term "CHO"'),
      )
      fireEvent.mouseDown(row)

      // Wait for the async IIFE to settle (and the rejection to be emitted)
      await act(async () => { await new Promise((r) => setTimeout(r, 200)) })
    } finally {
      process.removeListener('unhandledRejection', capture)
      for (const h of runnerHandlers) process.on('unhandledRejection', h)
    }

    // u2: the throw escapes the picker → exactly one rejection, the pick error.
    // u1: the throw was swallowed by the broad catch → no rejection at all.
    expect(rejections).toHaveLength(1)
    expect(rejections[0]).toBe(pickError)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('option-surface click records ref bytes — not just "submit enabled"', async () => {
    // A grouped slot whose only control is the numbered-option <ol> must be
    // answerable. Assert the picked ref bytes (the option's ref appears in the
    // emitted answer), not merely "submit not disabled".
    const onClarificationSubmit = vi.fn()

    // Request without menuProvider to force numbered options (no picker)
    const requests: AiClarificationRequest[] = [
      {
        id: 'req-opt-1', kind: 'general', prompt: 'Which solvent?',
        menuProvider: '/x' as any,
        query: 'solvent',
        options: [
          { id: 'opt-dmsa', label: 'DMSO', ref: { kind: 'ontology', id: 'CHEBI:17790', label: 'DMSO' } },
          { id: 'opt-water', label: 'Water', ref: { kind: 'ontology', id: 'CHEBI:15377', label: 'Water' } },
        ],
        slot: 'solvent',
      },
    ]

    render(
      React.createElement(ChatClarificationCard, {
        requests, turnKey: 'turn-2', shownPrompts: new Set<string>(), onClarificationSubmit,
      })
    )

    expect(screen.getByTestId('chat-clarification-card')).toBeTruthy()

    // Submit disabled initially
    const submitBtn = screen.getByTestId('chat-clarification-submit')
    expect(submitBtn).toBeDisabled()

    // Click the first option button (DMSO)
    const optionBtns = screen.getAllByTestId('chat-clarification-option-req-opt-1')
    expect(optionBtns.length).toBe(2)

    fireEvent.click(optionBtns[0] as HTMLElement)

    // Submit should now be enabled
    expect(submitBtn).not.toBeDisabled()

    // Click submit to fire onClarificationSubmit
    fireEvent.click(submitBtn)

    // Assert the answer carries the option's ref bytes
    expect(onClarificationSubmit).toHaveBeenCalledTimes(1)
    const [, answers, reqs] = onClarificationSubmit.mock.calls[0]
    expect(answers.length).toBe(1)
    expect(answers[0].optionId).toBe('opt-dmsa')
    expect(answers[0].label).toBe('DMSO')
    expect(answers[0].ref).toEqual({ kind: 'ontology', id: 'CHEBI:17790', label: 'DMSO' })
    expect(reqs.length).toBe(1)
    expect(reqs[0].id).toBe('req-opt-1')
  })

  it('transport failure falls back to the ontology answer, not a catch', async () => {
    resolveMaterial.mockResolvedValue([curieHit])
    const onClarificationSubmit = vi.fn()

    render(
      React.createElement(ChatClarificationCard, {
        requests: [cardRequest()], turnKey: 'turn-1', shownPrompts: new Set<string>(), onClarificationSubmit,
      })
    )

    expect(screen.getByTestId('chat-clarification-card')).toBeTruthy()

    // Submit disabled initially (no picks)
    const submitBtn = screen.getByTestId('chat-clarification-submit')
    expect(submitBtn).toBeDisabled()

    // Wait for the mount pass to populate the top candidates
    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    const candidateBtns = screen.getAllByTestId('clarification-top3-row')
    expect(candidateBtns.length).toBeGreaterThanOrEqual(1)

    await act(async () => { fireEvent.click(candidateBtns[0] as HTMLElement) })
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })

    // groundOntologyMaterial rejects at the transport level, but groundMaterialRef
    // catches it and returns the ORIGINAL ontology ref — no catch is needed in
    // the picker, and the slot still records. The answer carries ontology bytes.
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)
    expect(onClarificationSubmit).toHaveBeenCalledTimes(1)
    const [, answers] = onClarificationSubmit.mock.calls[0]
    expect(answers[0].ref).toEqual({ kind: 'ontology', id: 'CHEBI:17790', label: 'Test Material' })
  })

  it('pick completes and enables submit when typed path succeeds', async () => {
    // The narrowed catch covers ONLY the grounding await. When the transport
    // succeeds and grounds to a record, the answer flows through normally —
    // onPick fires, closePicker fires, and the slot records the RECORD ref.
    mockGroundOntologyMaterial.mockResolvedValue({
      materialRef: { kind: 'record', id: 'M-1', type: 'material', label: 'Grounded Material' },
    })
    resolveMaterial.mockResolvedValue([curieHit])
    const onClarificationSubmit = vi.fn()

    render(
      React.createElement(ChatClarificationCard, {
        requests: [cardRequest()], turnKey: 'turn-1', shownPrompts: new Set<string>(), onClarificationSubmit,
      })
    )

    const submitBtn = screen.getByTestId('chat-clarification-submit')
    expect(submitBtn).toBeDisabled()

    await act(async () => { await new Promise((r) => setTimeout(r, 100)) })
    const candidateBtns = screen.getAllByTestId('clarification-top3-row')
    expect(candidateBtns.length).toBeGreaterThanOrEqual(1)

    await act(async () => { fireEvent.click(candidateBtns[0] as HTMLElement) })
    await act(async () => { await new Promise((r) => setTimeout(r, 200)) })

    // Pick succeeded: slot records the grounded record and submit enables
    expect(submitBtn).not.toBeDisabled()
    fireEvent.click(submitBtn)
    expect(onClarificationSubmit).toHaveBeenCalledTimes(1)
    const [, answers] = onClarificationSubmit.mock.calls[0]
    expect(answers[0].ref).toEqual({ kind: 'record', id: 'M-1', type: 'material', label: 'Grounded Material' })
  })
})
