/**
 * Pinned tests for grouped-arm answer — u3driverwiring.
 *
 * Pin (a): onPick throw propagation — the u2 narrowed catch covers ONLY
 * groundedAnswerFromMention. onPick runs OUTSIDE the catch, so a throw
 * must propagate. u1 had a broad catch that wrapped onPick, so a throw
 * from onPick was caught, fallback returned null (for mint suggestions
 * where item.mention has empty id), and the error was swallowed.
 *
 * Pin (b): option-surface click records ref bytes — the numbered <ol>
 * buttons answer the slot and carry the option's ref in the answer.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest'
import { render, screen, fireEvent, cleanup, waitFor } from '@testing-library/react'
import React from 'react'
import type { AiClarificationRequest } from '../types/ai'
import type { SlashSuggestion } from '../shared/taptab/slashMenu/types'
import { ClarificationPicker } from '../event-editor/right-pane/ai/ClarificationPicker'
import { within } from '@testing-library/react'

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
vi.mock('../lib/groundMaterialRef', () => ({
  groundMaterialRef: vi.fn(),
}))
vi.mock('../shared/taptab/slashMenu/tokens', () => ({
  badgeStyles: () => ({ color: '#000', background: '#fff', border: '#ccc' }),
  VOCABULARY_BADGE: { mint: 'Mint' },
}))

const materialRequest: AiClarificationRequest = {
  id: 'clar-1', kind: 'material', prompt: 'Which material for A3?',
  menuProvider: '/m', query: 'CHO', options: [],
}

describe('u3driverwiring pinned tests', () => {
  beforeEach(() => { vi.clearAllMocks() })
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

    // Capture unhandled rejections
    let rejected: unknown = null
    const handler = (reason: unknown) => { rejected = reason }
    const origHandlers = process.listeners('unhandledRejection')
    process.on('unhandledRejection', handler)

    const { container } = render(<ClarificationPicker request={materialRequest} onPick={onPick} />)

    // Open the picker so the popover renders suggestions
    const input = container.querySelector(
      'input.message-log__clarification-search',
    ) as HTMLInputElement
    fireEvent.click(input)
    await waitFor(() => screen.getByTestId('clarification-popover'), { timeout: 3000 })

    // Click the mint row in the popover
    const row = await new Promise<HTMLElement>((resolve) => {
      void waitFor(() => {
        resolve(within(screen.getByTestId('clarification-popover')).getByText('Create local term "CHO"'))
      })
    })
    fireEvent.mouseDown(row)

    // Wait for the async IIFE to settle
    await new Promise((r) => setTimeout(r, 200))

    // Restore handler
    process.off('unhandledRejection', handler)
    for (const h of origHandlers) process.on('unhandledRejection', h)

    // u2: onPick throw propagates as unhandled rejection
    // u1: onPick throw is caught → answerFromMention(empty id) → null → swallowed
    expect(rejected).toBeInstanceOf(Error)
    expect(onPick).toHaveBeenCalledTimes(1)
  })

  it('option-surface click records ref bytes — not just "submit enabled"', async () => {
    // A grouped slot whose only control is the numbered-option <ol> must be
    // answerable. Assert the picked ref bytes (the option's ref appears in the
    // emitted answer), not merely "submit not disabled".

    const { ChatClarificationCard } = await import('./ChatClarificationCard')

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
})
