/**
 * ChatClarificationCard.absent.test.tsx — L2-P1-CREATE-DOOR-1 (unit absdoor).
 *
 * A binding blocker with NO candidates names a noun this lab's records do
 * not hold: the server declares the miss (request.absence — one server-side
 * reason) and the card renders that line plus exactly ONE create row — an
 * ANCHOR to the existing /lab/labware/new door (route at App.tsx:169,
 * prefill via ?prefillName= at LabLabwareNewPage.tsx:42). The row NAVIGATES;
 * it never writes (the apiClient.createRecord spy stays at zero calls).
 *
 * Wire pin (anti-vacuity): requests are built THROUGH the real server
 * emitter (clarificationRequestsFromAssurance), so the mutation probe
 * (delete the absence emission) drops `absence` from the wire and this
 * suite goes RED with the server case. The specifier is an OPAQUE
 * (non-literal) dynamic import: tsc cannot resolve it (a static import
 * pulls the server type graph into app's program, ~19 new tsc errors),
 * while vitest's SSR runner resolves it at runtime.
 */
import { cleanup, fireEvent, render, screen } from '@testing-library/react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import type { AiClarificationRequest } from '../types/ai'
import * as apiClientModule from '../shared/api/client'
import { ChatClarificationCard } from './ChatClarificationCard'

// Opaque specifier (see header): runtime-resolved, tsc-invisible.
const EMITTER = '../../../server/src/ai/clarifications.js'

const NOUN = 'test-noun-not-held'

async function emitAbsenceRequest(): Promise<AiClarificationRequest> {
  const mod = await import(EMITTER)
  const [request] = mod.clarificationRequestsFromAssurance([
    { code: 'AMBIGUOUS_BINDING', mention: NOUN, message: 'Pick the record this step names.', candidateIds: [] },
  ])
  return request as AiClarificationRequest
}

function renderCard(requests: AiClarificationRequest[], submit = vi.fn()) {
  return render(
    <ChatClarificationCard
      requests={requests}
      turnKey="t1"
      shownPrompts={new Set()}
      onClarificationSubmit={submit}
    />,
  )
}

afterEach(() => {
  cleanup()
  vi.restoreAllMocks()
})

describe('ChatClarificationCard — declared absence (unit absdoor)', () => {
  it('shows the named miss line and ONE create row to the existing door (AC1)', async () => {
    const request = await emitAbsenceRequest()
    expect(request.absence).toBeDefined()
    expect(request.absence!.mention).toBe(NOUN)

    renderCard([request])

    // The absence line is the SERVER'S sentence, verbatim (the card renders
    // request.absence.reason and composes no sentence of its own).
    const reasonLine = screen.getByText(request.absence!.reason)
    expect(reasonLine.textContent).toContain(NOUN)

    // Exactly ONE create row, an ANCHOR (a link, not a fake disabled option).
    const rows = screen.getAllByTestId('chat-clarification-absent-create')
    expect(rows).toHaveLength(1)
    const row = rows[0]!
    expect(row.tagName).toBe('A')
    expect(row).not.toBeDisabled()
    // The door, with the noun prefilled — the destination registered at
    // App.tsx:169 (do not build a second create surface).
    expect(row.getAttribute('href')).toBe(`/lab/labware/new?prefillName=${encodeURIComponent(NOUN)}`)

    // The miss is a named unresolved slot, not a candidate list: no numbered
    // option rows for this request.
    expect(screen.queryAllByTestId(/^chat-clarification-option-/)).toHaveLength(0)
  })

  it('offers no free-text box and writes no record on click (AC2)', async () => {
    const request = await emitAbsenceRequest()
    const createSpy = vi.spyOn(apiClientModule.apiClient, 'createRecord')
    renderCard([request])

    // The free-text parameter box (which can never bind) must NOT render for
    // a declared absence.
    expect(screen.queryByPlaceholderText('Type your answer…')).toBeNull()
    // Nor does the picker's search-then-mint surface shadow the named miss.
    expect(screen.queryByTestId('clarification-identity-search')).toBeNull()

    // Clicking the create row NAVIGATES — it must not mint, pre-create, or
    // post anything (a proposal must not become a commitment).
    fireEvent.click(screen.getByTestId('chat-clarification-absent-create'))
    expect(createSpy).not.toHaveBeenCalled()

    // The absence request still leaves Submit disabled — the person must use
    // the door, and nothing on this card can answer the slot.
    expect(screen.getByTestId('chat-clarification-submit')).toBeDisabled()
  })

  it('leaves bindable-candidate cards exactly as today (AC3)', async () => {
    const mod = await import(EMITTER)
    const [request] = mod.clarificationRequestsFromAssurance([
      { code: 'AMBIGUOUS_BINDING', mention: 'test-noun-held', message: 'Pick the record.', candidateIds: ['LAB-A', 'LAB-B'] },
    ]) as [AiClarificationRequest]
    // Bindable candidates: the absence key is ABSENT (conditional spread —
    // never absence:undefined), the options carry the candidates.
    expect('absence' in request).toBe(false)
    expect(request.options.map((o) => o.id)).toEqual(['LAB-A', 'LAB-B'])

    renderCard([request])

    // Numbered, selectable rows — unchanged from today. (The card's option
    // testid is per REQUEST — chat-clarification-option-${request.id} — so
    // both rows of one request share it: index the getAll result.)
    const optionRows = screen.getAllByTestId('chat-clarification-option-assurance-1')
    expect(optionRows).toHaveLength(2)
    expect(optionRows[0]!.textContent).toBe('1. LAB-A')
    expect(optionRows[1]!.textContent).toBe('2. LAB-B')
    expect(optionRows[0]!).toBeEnabled()
    expect(screen.queryByTestId('chat-clarification-absent-create')).toBeNull()
    expect(screen.queryByPlaceholderText('Type your answer…')).toBeNull()
    // Picking a candidate still enables Submit (the answer flow is intact).
    fireEvent.click(optionRows[0]!)
    expect(screen.getByTestId('chat-clarification-submit')).toBeEnabled()
  })

  it('keeps the typed box for a parameter request with no absence (AC3)', () => {
    // Hand-shaped (the emitter never stamps absence on a parameter-kind
    // blocker): key absent, options empty -> the typed box, as today.
    const parameter: AiClarificationRequest = {
      id: 'p1',
      kind: 'parameter',
      prompt: 'Which volume?',
      menuProvider: 'choice',
      options: [],
    }
    expect('absence' in parameter).toBe(false)

    renderCard([parameter])

    expect(screen.getByPlaceholderText('Type your answer…')).toBeTruthy()
    expect(screen.queryByTestId('chat-clarification-absent-create')).toBeNull()
  })
})
