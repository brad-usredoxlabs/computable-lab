/**
 * Render tests for the Fix-it side panel. These don't exercise the full
 * stream loop end-to-end — those flows go through the dock + apply path
 * which is integration-shaped. Instead, the test drives each panel UI
 * state (chatting / spec-ready / applying / done) against a fake context
 * and asserts the right scaffolding is on screen.
 */
import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type {
  FixItApplyStage,
  FixItApplyResult,
  FixItHistoryEntry,
  FixItStage,
} from '../EventEditorContext'
import type { FixItHealthResponse } from './fixItClient'
import { FixItPanel } from './FixItPanel'

interface MockFixItState {
  isOpen: boolean
  seed: {
    prompt: string
    draft: { events: unknown[]; placements: unknown[]; skips: string[] }
    deckContext: { platformLabel: string; platformId: string; variantTitle: string; variantId: string }
  } | null
  chat: Array<{ role: 'user' | 'assistant'; content: string }>
  streaming: boolean
  stage: FixItStage
  error: string | null
  spec: { specId: string; specYaml: string; fixtureYaml: string; fixturePath: string } | null
  applyStage: FixItApplyStage | null
  applyProgress: Array<{ source: 'server' | 'coder' | 'critic'; phase: string; message: string; ts: string }>
  applyResult: FixItApplyResult | null
  fixHistory: FixItHistoryEntry[]
  pendingRetryPrompt: string | null
}

const baseFixIt = (): MockFixItState => ({
  isOpen: true,
  seed: {
    prompt: 'Put a 12-well reservoir on deck slot B1',
    draft: { events: [], placements: [], skips: [] },
    deckContext: {
      platformLabel: 'Opentrons Flex',
      platformId: 'opentrons_flex',
      variantTitle: 'Flex 96-channel',
      variantId: 'flex_96',
    },
  },
  chat: [],
  streaming: false,
  stage: 'chatting',
  error: null,
  spec: null,
  applyStage: null,
  applyProgress: [],
  applyResult: null,
  fixHistory: [],
  pendingRetryPrompt: null,
})

const mocks = vi.hoisted(() => ({
  fixItState: null as MockFixItState | null,
  closeFixIt: vi.fn(),
  appendFixItChat: vi.fn(),
  updateLastFixItAssistant: vi.fn(),
  setFixItStreaming: vi.fn(),
  setFixItStage: vi.fn(),
  setFixItSpec: vi.fn(),
  editFixItSpec: vi.fn(),
  clearFixItSpec: vi.fn(),
  continueFixItFeedback: vi.fn(),
  setFixItApplyResult: vi.fn(),
  setFixItApplyStage: vi.fn(),
  appendFixItApplyProgress: vi.fn(),
  requestRetryPrompt: vi.fn(),
  probeFixItHealth: vi.fn(),
  streamApplyFix: vi.fn(),
  streamFixChat: vi.fn(),
  synthesizeFixSpec: vi.fn(),
}))

vi.mock('../EventEditorContext', () => ({
  useEventEditor: () => ({
    state: { fixIt: mocks.fixItState },
    actions: {
      closeFixIt: mocks.closeFixIt,
      appendFixItChat: mocks.appendFixItChat,
      updateLastFixItAssistant: mocks.updateLastFixItAssistant,
      setFixItStreaming: mocks.setFixItStreaming,
      setFixItStage: mocks.setFixItStage,
      setFixItSpec: mocks.setFixItSpec,
      editFixItSpec: mocks.editFixItSpec,
      clearFixItSpec: mocks.clearFixItSpec,
      continueFixItFeedback: mocks.continueFixItFeedback,
      setFixItApplyResult: mocks.setFixItApplyResult,
      setFixItApplyStage: mocks.setFixItApplyStage,
      appendFixItApplyProgress: mocks.appendFixItApplyProgress,
      requestRetryPrompt: mocks.requestRetryPrompt,
    },
  }),
}))

vi.mock('./fixItClient', () => ({
  probeFixItHealth: mocks.probeFixItHealth,
  streamApplyFix: mocks.streamApplyFix,
  streamFixChat: mocks.streamFixChat,
  synthesizeFixSpec: mocks.synthesizeFixSpec,
}))

const healthyResponse: FixItHealthResponse = {
  worker: { reachable: true, baseUrl: 'http://thunderbeast:8001/v1', model: 'Qwen/Qwen3.6-35B-A3B-FP8' },
  architect: { reachable: true, baseUrl: 'http://thunderbeast:8000/v1', model: 'Qwen/Qwen3.6-27B-FP8' },
}

describe('FixItPanel', () => {
  beforeEach(() => {
    mocks.fixItState = baseFixIt()
    mocks.closeFixIt.mockReset()
    mocks.setFixItStage.mockReset()
    mocks.setFixItApplyStage.mockReset()
    mocks.appendFixItApplyProgress.mockReset()
    mocks.requestRetryPrompt.mockReset()
    mocks.continueFixItFeedback.mockReset()
    mocks.probeFixItHealth.mockReset()
    mocks.probeFixItHealth.mockResolvedValue(healthyResponse)
    mocks.streamApplyFix.mockReset()
    mocks.streamFixChat.mockReset()
    mocks.synthesizeFixSpec.mockReset()
  })
  afterEach(() => {
    cleanup()
  })

  it('renders nothing when the panel is closed', () => {
    mocks.fixItState = { ...baseFixIt(), isOpen: false, seed: null }
    const { container } = render(<FixItPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the failing prompt and the chat input on the chatting stage', () => {
    render(<FixItPanel />)
    expect(screen.getByText('Failing prompt')).toBeTruthy()
    expect(
      screen.getByText('Put a 12-well reservoir on deck slot B1'),
    ).toBeTruthy()
    expect(screen.getByRole('button', { name: 'Send' })).toBeTruthy()
    // Generate spec button is disabled until the assistant has spoken.
    const synth = screen.getByRole('button', { name: /Generate fix spec/i })
    expect((synth as HTMLButtonElement).disabled).toBe(true)
  })

  it('renders the spinner and a Stop button while applying', () => {
    mocks.fixItState = {
      ...baseFixIt(),
      stage: 'applying',
      applyStage: 'coder_running',
      applyProgress: [
        {
          source: 'coder',
          phase: 'llm_started',
          message: 'Asking coder model for symbol replacements',
          ts: '2026-05-17T00:00:00.000Z',
        },
      ],
      spec: {
        specId: 'spec-fix-T',
        specYaml: 'id: spec-fix-T\n',
        fixtureYaml: 'name: spec-fix-T\n',
        fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-T.yaml',
      },
    }
    render(<FixItPanel />)
    expect(screen.getByText(/Coder agent running/)).toBeTruthy()
    expect(screen.getByText(/coder running/)).toBeTruthy()
    expect(screen.getByText('coder')).toBeTruthy()
    expect(screen.getByText('Asking coder model for symbol replacements')).toBeTruthy()
    const stop = screen.getByRole('button', { name: 'Stop' })
    fireEvent.click(stop)
    // No assertion on abortRef state — we just verify the button is wired.
    expect(stop).toBeTruthy()
  })

  it('renders the critic block with verdict and senior-retry badge on done', () => {
    mocks.fixItState = {
      ...baseFixIt(),
      stage: 'done',
      applyResult: {
        status: 'applied',
        message: 'patch committed',
        touchedFiles: ['server/src/foo.ts', 'server/src/bar.ts'],
        commit: 'deadbeef',
        critic: {
          verdict: 'pass',
          message: 'senior patch matches the spec',
          criteriaMet: ['criterion-1'],
          criteriaFailed: [],
          seniorRetryRan: true,
        },
      },
    }
    render(<FixItPanel />)
    expect(screen.getByText('applied')).toBeTruthy()
    expect(screen.getByText('patch committed')).toBeTruthy()
    expect(screen.getByText('deadbeef')).toBeTruthy()
    expect(screen.getByText('critic')).toBeTruthy()
    expect(screen.getByText('pass')).toBeTruthy()
    expect(screen.getByText('via senior retry')).toBeTruthy()
    const continueButton = screen.getByRole('button', { name: 'Continue feedback' })
    fireEvent.click(continueButton)
    expect(mocks.continueFixItFeedback).toHaveBeenCalledTimes(1)
  })

  it('surfaces an offline banner when the worker endpoint is unreachable', async () => {
    mocks.probeFixItHealth.mockResolvedValue({
      worker: {
        reachable: false,
        baseUrl: 'http://thunderbeast:8001/v1',
        model: 'Qwen/Qwen3.6-35B-A3B-FP8',
        error: 'fetch failed',
      },
      architect: {
        reachable: true,
        baseUrl: 'http://thunderbeast:8000/v1',
        model: 'Qwen/Qwen3.6-27B-FP8',
      },
    } satisfies FixItHealthResponse)

    render(<FixItPanel />)
    await waitFor(() => {
      expect(screen.getByText(/Inference endpoint offline/i)).toBeTruthy()
    })
    expect(screen.getByText(/worker .http:\/\/thunderbeast:8001\/v1./)).toBeTruthy()
  })
})
