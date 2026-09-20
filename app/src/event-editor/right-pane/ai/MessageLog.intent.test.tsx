/**
 * The trace chip must SAY what the forced draft tool decided.
 *
 * Reported 2026-09-20: "I was expecting to see an add_record label, but maybe that
 * happens under the hood?" It did — `create_record` is an intent on the single
 * `agent_intent` tool, and this line filtered `intent` out of the fields it listed, so
 * authoring a record, drafting events and switching the deck all read
 * "Tool: agent_intent · 2 fields: events, notes". Under the hood is fine for the
 * contract; it is not fine for the transcript the user reads.
 */
import { describe, expect, it } from 'vitest'
import { render } from '@testing-library/react'
import { MessageLog } from './MessageLog'
import type { ChatState, TraceEntry } from './chatReducer'

function stateWith(entry: TraceEntry): ChatState {
  return {
    messages: [],
    trace: [entry],
    pending: null,
    status: undefined,
  } as unknown as ChatState
}

function chipText(args: Record<string, unknown>): string {
  const { container } = render(
    <MessageLog state={stateWith({ seq: 0, kind: 'tool_call', toolName: 'agent_intent', args })} />,
  )
  return container.querySelector('[data-testid="trace-tool_call"]')?.textContent ?? ''
}

describe('MessageLog tool-call chip', () => {
  it('names the create_record intent and the records it wants authored', () => {
    const text = chipText({
      intent: 'create_record',
      records: [
        { kind: 'equipment', name: 'MSE PRO 4 plate shaker incubator' },
        { kind: 'material', name: 'fenofibrate' },
      ],
      alsoPlace: { surface: 'lawn' },
    })
    expect(text).toContain('create_record')
    expect(text).toContain('create 2: equipment “MSE PRO 4 plate shaker incubator”, material “fenofibrate”')
    // Creating and placing are two decisions — the chip reports both.
    expect(text).toContain('also place on lawn')
  })

  it('reports a slot placement and a record with no name honestly', () => {
    const text = chipText({
      intent: 'create_record',
      records: [{ kind: 'labware' }],
      alsoPlace: { surface: 'slot', slotId: 'PLATE' },
    })
    expect(text).toContain('labware “(unnamed)”')
    expect(text).toContain('also place on slot (PLATE)')
  })

  it('counts events and equipment for an event_graph turn', () => {
    const text = chipText({
      intent: 'event_graph',
      events: [{ event_type: 'transfer' }, { event_type: 'place_tube' }],
      equipmentRequirements: [{ classCurie: 'equipment:water_bath' }],
    })
    expect(text).toContain('event_graph')
    expect(text).toContain('2 events')
    expect(text).toContain('1 equipment')
  })

  it('names the deck variant a deck_layout turn switched to', () => {
    expect(chipText({ intent: 'deck_layout', variantId: 'single_plate' })).toContain('single_plate')
  })

  it('still shows the field list when the call carries no intent (the original fix)', () => {
    const text = chipText({ query: 'T25' })
    expect(text).toContain('1 field: query')
    // …and an empty call says so rather than looking like a success.
    expect(chipText({})).toContain('no fields')
  })
})
