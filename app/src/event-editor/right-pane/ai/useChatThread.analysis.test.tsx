/**
 * PB-CH-5 — useChatThread gains the analysis_proposal case with the same
 * zero-touch discipline as workstate_proposal: the hook forwards the INTENT
 * verbatim and touches NOTHING else (no trace entry, no store, no compile).
 * The card mount owns the compile relay.
 *
 * Pins (spec matrix "envelope pins" + never-break-the-turn wrapper):
 *  - onAnalysisProposal fires exactly once per event with the payload verbatim;
 *  - a throwing mount callback must NOT break the chat turn (the hook swallows
 *    the throw the same way the agent_action wrapper does — the turn completes);
 *  - NO trace entry is created for analysis_proposal (the hook touches nothing);
 *  - the exhaustive switch keeps `const _exhaustive: never = event` while
 *    gaining the new case (source-pin — the compile break was the feature).
 */
import { describe, expect, it, vi } from 'vitest'
import { readFileSync } from 'node:fs'
import { act, renderHook } from '@testing-library/react'
import { useChatThread } from './useChatThread'
import type { AssistStreamEvent, AssistStreamRequest } from './assistStream'

const ANALYSIS = {
  operation: 'compose-analysis',
  target: { revision: { term: 'ROS mitochondrial flux analysis' } },
  focus: 'run',
}

type RunStreamHandlers = { onEvent: (event: AssistStreamEvent) => void; signal?: AbortSignal }

function harness(opts: { throwingMount?: boolean } = {}) {
  const emitters: Array<(event: AssistStreamEvent) => void> = []
  const runStream = vi.fn(async (_request: AssistStreamRequest, handlers: RunStreamHandlers) => {
    emitters.push(handlers.onEvent)
  })
  const onAnalysisProposal = opts.throwingMount
    ? vi.fn(() => {
        throw new Error('mount exploded')
      })
    : vi.fn()
  const { result } = renderHook(() =>
    useChatThread({
      surface: 'workspace.deck',
      context: { studyId: 'STU-000001', activeTabKind: 'deck' },
      runStream,
      onAnalysisProposal,
    }),
  )
  return { result, emitters, onAnalysisProposal }
}

async function sendOnce(h: ReturnType<typeof harness>, text = 'open the ROS analysis') {
  await act(async () => {
    await h.result.current.send(text)
  })
}

describe('useChatThread — analysis_proposal case (PB-CH-5)', () => {
  it('onAnalysisProposal fires exactly once per event with the INTENT verbatim, and the hook adds NO trace entry', async () => {
    const h = harness()
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'analysis_proposal', analysis: ANALYSIS })
    })
    expect(h.onAnalysisProposal).toHaveBeenCalledTimes(1)
    expect(h.onAnalysisProposal).toHaveBeenCalledWith(ANALYSIS)
    // Zero-touch: the hook itself creates no trace entry for the proposal.
    expect(h.result.current.state.trace.filter((t) => t.kind === 'action')).toHaveLength(0)
  })

  it('a throwing mount callback never breaks the chat turn (same never-break wrapper as agent_action)', async () => {
    const h = harness({ throwingMount: true })
    await sendOnce(h)
    await act(async () => {
      h.emitters[0]?.({ type: 'analysis_proposal', analysis: ANALYSIS })
    })
    expect(h.onAnalysisProposal).toHaveBeenCalledTimes(1)
    // The turn completed — no error state was set by the mount explosion.
    expect(h.result.current.state.error).toBeNull()
  })

  it('the exhaustive switch keeps its never arm while gaining the analysis case (source-pin)', () => {
    const source = readFileSync('src/event-editor/right-pane/ai/useChatThread.ts', 'utf8')
    expect(source).toContain('const _exhaustive: never = event')
    expect(source).toContain("case 'analysis_proposal'")
  })
})
