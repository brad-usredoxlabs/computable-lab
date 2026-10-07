/**
 * PB-CH-8 — the exhaustive switch gains the ledger_answer case WITHOUT
 * weakening the never-default forcing seam, and the answer becomes a chat
 * trace entry rendered from the SERVER-built text (no card, no store touch,
 * no compile relay — the answer half is read-only evidence).
 *
 * Pins:
 *  - a ledger_answer event produces exactly ONE kind:'ledger' trace entry
 *    carrying the server's answerText verbatim + links/labEvents for the
 *    provenance render;
 *  - the source keeps `const _exhaustive: never = event` (NO swallowing
 *    default) and gains the ledger case;
 *  - the ledger answer touches NOTHING else: no onWorkstateProposal call, no
 *    draft result, no store write (the found half's card rides the SEPARATE
 *    workstate_proposal event the server also emits — zero new app code).
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, renderHook } from '@testing-library/react'
import { useChatThread } from './useChatThread'
import type { AssistStreamEvent, AssistStreamRequest, LedgerAnswerEnvelope } from './assistStream'

const FOUND: LedgerAnswerEnvelope = {
  status: 'found',
  asOf: '2026-10-07T10:05:00.000Z',
  capturedAt: '2026-10-07T10:00:00.000Z',
  disclosure: 'as captured at 2026-10-07T10:00:00.000Z — nearest stored snapshot at or before 2026-10-07T10:05:00.000Z',
  links: ['EVT-1'],
  answerText: 'Workstate as captured at 2026-10-07T10:00:00.000Z.\nLinked lab events: EVT-1',
}

const NO_HISTORY: LedgerAnswerEnvelope = {
  status: 'no-history',
  asOf: '2026-09-01T09:00:00.000Z',
  reason: 'predates-first-capture',
  labEvents: [{ recordId: 'EVT-1', action: 'run.status-changed', occurredAt: '2026-09-01T08:50:00.000Z', subjectId: 'RUN-1' }],
  answerText: 'No workstate history exists for that time — it predates your first stored snapshot.',
}

type RunStreamHandlers = { onEvent: (event: AssistStreamEvent) => void; signal?: AbortSignal }

function harness() {
  const emitters: Array<(event: AssistStreamEvent) => void> = []
  const runStream = vi.fn(async (_request: AssistStreamRequest, handlers: RunStreamHandlers) => {
    emitters.push(handlers.onEvent)
  })
  const onWorkstateProposal = vi.fn()
  const { result } = renderHook(() =>
    useChatThread({
      surface: 'workspace.deck',
      context: { studyId: 'STU-000001', activeTabKind: 'deck' },
      runStream,
      onWorkstateProposal,
    }),
  )
  return { result, emitters, onWorkstateProposal }
}

async function sendOnce(h: ReturnType<typeof harness>, text = 'what was the workstate history of the ROS run?') {
  await act(async () => {
    await h.result.current.send(text)
  })
}

describe('useChatThread — ledger_answer case (PB-CH-8)', () => {
  it('a found ledger_answer becomes ONE kind:"ledger" trace entry with the server text verbatim + links', async () => {
    const h = harness()
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'ledger_answer', answer: FOUND })
    })
    const ledgerEntries = h.result.current.state.trace.filter((t) => t.kind === 'ledger')
    expect(ledgerEntries).toHaveLength(1)
    expect(ledgerEntries[0]?.evidence).toBe(FOUND.answerText)
    expect(ledgerEntries[0]?.links).toEqual(['EVT-1'])
    // The answer half is read-only: no proposal relay, no compile, no store.
    expect(h.onWorkstateProposal).not.toHaveBeenCalled()
  })

  it('a no-history ledger_answer becomes the honest trace entry with its labeled lab events', async () => {
    const h = harness()
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'ledger_answer', answer: NO_HISTORY })
    })
    const ledgerEntries = h.result.current.state.trace.filter((t) => t.kind === 'ledger')
    expect(ledgerEntries).toHaveLength(1)
    expect(ledgerEntries[0]?.evidence).toContain('predates your first stored snapshot')
    expect(ledgerEntries[0]?.labEvents).toEqual(NO_HISTORY.labEvents)
    expect(h.onWorkstateProposal).not.toHaveBeenCalled()
  })

  it('the never-default forcing seam survives and the ledger case exists (source-pin)', async () => {
    const source = readFileSync('src/event-editor/right-pane/ai/useChatThread.ts', 'utf8')
    expect(source).toContain('const _exhaustive: never = event')
    expect(source).toContain("case 'ledger_answer'")
  })
})
