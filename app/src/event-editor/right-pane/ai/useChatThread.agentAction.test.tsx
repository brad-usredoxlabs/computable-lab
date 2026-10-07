/**
 * PB-CH-4 — the exhaustive switch gains the agent_action / workstate_proposal
 * cases WITHOUT weakening the never-default forcing seam, and workingFocus
 * rides the request top-level.
 *
 * Pins (spec matrix "exhaustive seam" + "context gap fix on the wire"):
 *  - onAgentAction fires exactly once per event; the trace entry carries the
 *    executor outcome text when the mount returns one, else the payload-derived
 *    evidence;
 *  - the source keeps `const _exhaustive: never = event` (NO swallowing default)
 *    and gains both new cases — the compile error was the feature;
 *  - onWorkstateProposal forwards the intent VERBATIM (identity) and touches
 *    nothing else (no trace, no store — the card mount owns the compile relay);
 *  - with workingFocus set, the request body carries it; with none, the key is
 *    ABSENT (not undefined); context stays byte-identical when only focus
 *    changes (warm-prefix stability).
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, renderHook } from '@testing-library/react'
import { useChatThread } from './useChatThread'
import type {
  AgentActionEnvelope,
  AssistStreamEvent,
  AssistStreamRequest,
} from './assistStream'

const ACTION: AgentActionEnvelope = {
  action: 'focus',
  target: { kind: 'protocol-step', protocolId: 'PRT-000123', stepId: 'step-read', label: 'Read plate' },
}

const INTENT = {
  operation: 'compose-workstate',
  tabs: [{ surface: 'run-design', target: { term: 'ROS run' } }],
}

type RunStreamHandlers = { onEvent: (event: AssistStreamEvent) => void; signal?: AbortSignal }

function harness(opts: { workingFocus?: { protocolId: string; stepId: string; label: string; ordinal?: number } } = {}) {
  const requests: AssistStreamRequest[] = []
  const emitters: Array<(event: AssistStreamEvent) => void> = []
  const runStream = vi.fn(async (request: AssistStreamRequest, handlers: RunStreamHandlers) => {
    requests.push(request)
    emitters.push(handlers.onEvent)
  })
  const onAgentAction = vi.fn()
  const onWorkstateProposal = vi.fn()
  const focusRef = { current: opts.workingFocus }
  const { result, rerender } = renderHook(() =>
    useChatThread({
      surface: 'workspace.deck',
      context: { studyId: 'STU-000001', activeTabKind: 'deck' },
      runStream,
      onAgentAction,
      onWorkstateProposal,
      ...(focusRef.current ? { workingFocus: focusRef.current } : {}),
    }),
  )
  return { result, rerender, requests, emitters, onAgentAction, onWorkstateProposal, focusRef }
}

async function sendOnce(h: ReturnType<typeof harness>, text = 'focus the read step') {
  await act(async () => {
    await h.result.current.send(text)
  })
}

describe('useChatThread — agent_action / workstate_proposal cases (PB-CH-4)', () => {
  it('onAgentAction fires exactly once per event and the never-default still compiles (source-pin: the switch keeps the never arm, no swallowing default)', async () => {
    const h = harness()
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'agent_action', action: ACTION })
    })
    expect(h.onAgentAction).toHaveBeenCalledTimes(1)
    expect(h.onAgentAction).toHaveBeenCalledWith(ACTION)

    // Source-pin via the vitest cwd (app/): import.meta.url is an http:// URL
    // under the jsdom transform and readFileSync rejects it.
    const source = readFileSync('src/event-editor/right-pane/ai/useChatThread.ts', 'utf8')
    // The forcing seam survives: the never arm is still there…
    expect(source).toContain('const _exhaustive: never = event')
    // …and both new cases exist. (A `default:` that swallowed the new members
    // would delete the never arm — the compile error was the feature.)
    expect(source).toContain("case 'agent_action'")
    expect(source).toContain("case 'workstate_proposal'")
  })

  it('the agent_action trace entry carries the mount-returned executor outcome text', async () => {
    const h = harness()
    h.onAgentAction.mockReturnValue('no OpenTabsProvider mounted; tier-1 actions do not fall back to window hacks')
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'agent_action', action: ACTION })
    })
    const actionEntries = h.result.current.state.trace.filter((t) => t.kind === 'action')
    expect(actionEntries).toHaveLength(1)
    expect(actionEntries[0].evidence).toContain('no OpenTabsProvider mounted')
  })

  it('without mount text, the trace evidence is the payload verb + resolved label', async () => {
    const h = harness()
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'agent_action', action: ACTION })
    })
    const actionEntries = h.result.current.state.trace.filter((t) => t.kind === 'action')
    expect(actionEntries[0].evidence).toBe('Focused on Read plate — nothing was written.')
  })

  it('a throwing onAgentAction never breaks the chat turn (same wrapper as onDraftResult)', async () => {
    const h = harness()
    h.onAgentAction.mockImplementation(() => {
      throw new Error('mount exploded')
    })
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'agent_action', action: ACTION })
      h.emitters[0]?.({ type: 'done' })
    })
    // The turn still commits — the stream survived the callback failure.
    expect(h.result.current.state.pending).toBeNull()
    expect(h.result.current.state.messages.some((m) => m.role === 'assistant')).toBe(true)
  })

  it('onWorkstateProposal forwards the intent verbatim without touching the tab store or the trace', async () => {
    const h = harness()
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'workstate_proposal', workstate: INTENT })
    })
    expect(h.onWorkstateProposal).toHaveBeenCalledTimes(1)
    // Verbatim: identity, not deep-equality — the client relays, never compiles.
    expect(h.onWorkstateProposal.mock.calls[0]?.[0]).toBe(INTENT)
    // Forward only: no trace entry, no reducer movement.
    expect(h.result.current.state.trace).toHaveLength(0)
  })

  it('with workingFocus set, the request body carries {protocolId,stepId,label,ordinal}; with none focused the key is ABSENT (not undefined)', async () => {
    const withFocus = harness({ workingFocus: { protocolId: 'PRT-000123', stepId: 'step-read', label: 'Read plate', ordinal: 2 } })
    await sendOnce(withFocus)
    expect(withFocus.requests[0]?.workingFocus).toEqual({
      protocolId: 'PRT-000123',
      stepId: 'step-read',
      label: 'Read plate',
      ordinal: 2,
    })

    const without = harness()
    await sendOnce(without)
    expect('workingFocus' in (without.requests[0] ?? {})).toBe(false)
  })

  it('context stays byte-identical when only focus changes (warm-prefix stability)', async () => {
    const h = harness()
    await sendOnce(h, 'first')
    h.focusRef.current = { protocolId: 'PRT-000123', stepId: 'step-read', label: 'Read plate', ordinal: 2 }
    h.rerender()
    await sendOnce(h, 'second')
    expect(h.requests).toHaveLength(2)
    expect(h.requests[1].context).toEqual(h.requests[0].context)
    expect('workingFocus' in h.requests[0]).toBe(false)
    expect(h.requests[1].workingFocus).toBeDefined()
  })
})
