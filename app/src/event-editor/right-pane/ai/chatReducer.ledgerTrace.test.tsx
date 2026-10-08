/**
 * PB-CH-8 — the chatReducer gains the 'ledger' trace kind (additive, mirroring
 * PB-CH-4's 'action' kind) and MessageLog renders the ledger answer honestly:
 * the SERVER-built answerText verbatim, provenance lines for a found answer
 * (capturedAt + links), and the labeled lab events for a no-history answer.
 *
 * Pins:
 *  - stream-trace accepts kind:'ledger' with evidence and appends it;
 *  - MessageLog renders a kind:'ledger' chip with the trace icon + verbatim
 *    evidence (the client never re-composes answer prose);
 *  - a no-history ledger chip renders its honest text (no card, no movement).
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { chatReducer, initialChatState } from './chatReducer'
import { MessageLog } from './MessageLog'
import type { ChatState, TraceEntry } from './chatReducer'

function stateWith(entries: TraceEntry[]): ChatState {
  return {
    messages: [],
    trace: entries,
    pending: null,
    status: undefined,
  } as unknown as ChatState
}

describe('chatReducer — ledger trace kind (PB-CH-8)', () => {
  it('stream-trace accepts a kind:"ledger" entry with evidence and appends it', () => {
    const next = chatReducer(initialChatState, {
      type: 'stream-trace',
      entry: { seq: 0, kind: 'ledger', evidence: 'Workstate as captured at 2026-10-07T10:00:00.000Z.' },
    })
    expect(next.trace).toHaveLength(1)
    expect(next.trace[0]?.kind).toBe('ledger')
    expect(next.trace[0]?.evidence).toBe('Workstate as captured at 2026-10-07T10:00:00.000Z.')
  })
})

describe('MessageLog — ledger trace chip (PB-CH-8)', () => {
  it('a found ledger answer renders verbatim with provenance lines (capturedAt + links)', () => {
    const { container } = render(
      <MessageLog
        state={stateWith([
          {
            seq: 0,
            kind: 'ledger',
            evidence: 'Workstate as captured at 2026-10-07T10:00:00.000Z — nearest stored snapshot at or before 2026-10-07T10:05:00.000Z.',
            links: ['EVT-1', 'EVT-2'],
          },
        ])}
      />,
    )
    const chip = container.querySelector('[data-testid="trace-ledger"]')
    expect(chip).toBeTruthy()
    expect(chip?.textContent).toContain('as captured at 2026-10-07T10:00:00.000Z')
    expect(chip?.textContent).toContain('EVT-1')
    expect(chip?.textContent).toContain('EVT-2')
    expect(chip?.querySelector('.message-log__trace-icon')).toBeTruthy()
    // A ledger_answer frame ALONE renders NO accept control — the answer is
    // read-only evidence; the reattach card is a separate workstate_proposal
    // event handled by the existing flow.
    expect(container.querySelector('[data-testid="workstate-card-accept"]')).toBeNull()
    expect(chip?.querySelector('button')).toBeNull()
  })

  it('a no-history ledger answer renders the honest server text with its labeled lab events', () => {
    const { container } = render(
      <MessageLog
        state={stateWith([
          {
            seq: 0,
            kind: 'ledger',
            evidence: 'No workstate history exists for that time — it predates your first stored snapshot.',
            labEvents: [{ occurredAt: '2026-09-01T08:50:00.000Z', action: 'run.status-changed', subjectId: 'RUN-1', recordId: 'EVT-1' }],
          },
        ])}
      />,
    )
    const chip = container.querySelector('[data-testid="trace-ledger"]')
    expect(chip).toBeTruthy()
    expect(chip?.textContent).toContain('No workstate history exists for that time')
    expect(chip?.textContent).toContain('lab events, not workstate')
    expect(chip?.textContent).toContain('run.status-changed')
  })
})
