import { describe, it, expect, vi, beforeEach } from 'vitest'
import { renderHook, act, waitFor } from '@testing-library/react'
import { useAiChat } from './useAiChat'
import { streamAssist } from '../api/aiClient'
import type { AiContext } from '../../types/aiContext'

vi.mock('../api/aiClient', () => ({
  streamAssist: vi.fn(),
  getAiHealth: vi.fn().mockResolvedValue({ available: true }),
}))

vi.mock('../api/client', () => ({
  apiClient: { getRecord: vi.fn(), getPromptTemplate: vi.fn().mockResolvedValue({ error: 'not found' }) },
}))

const aiContext: AiContext = { surface: 'event-editor', summary: 's', surfaceContext: {} }

beforeEach(() => { vi.clearAllMocks() })

describe('debug', () => {
  it('relay + empty done: settles, wall state?', async () => {
    const relay = vi.fn()
    vi.mocked(streamAssist).mockImplementation(async function* () {
      yield { type: 'status', message: 'working' } as never
      yield { type: 'record_draft_proposal', recordDraft: { operation: 'compose-record', kind: 'x' } } as never
      yield { type: 'done', result: { success: true, events: [], notes: [] } } as never
    })
    const { result: hook } = renderHook(() => useAiChat({ aiContext, onRecordDraftProposal: relay }))
    await act(async () => { hook.current.sendPrompt('place the unknown product') })
    await waitFor(() => expect(hook.current.isStreaming).toBe(false), { timeout: 8000 })
    // eslint-disable-next-line no-console
    console.log('relay calls=', relay.mock.calls.length, 'isStreaming=', hook.current.isStreaming)
    // eslint-disable-next-line no-console
    console.log('honestWall=', JSON.stringify(hook.current.honestWall))
    // eslint-disable-next-line no-console
    console.log('msgs=', hook.current.messages.map((m) => `${m.role}:${String(m.content).slice(0, 60)}`))
    expect(true).toBe(true)
  }, 20000)
})
