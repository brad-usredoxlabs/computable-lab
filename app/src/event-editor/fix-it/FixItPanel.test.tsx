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
    fixItSessionId: string
  } | null
  chat: Array<{ role: 'user' | 'assistant'; content: string }>
  streaming: boolean
  stage: FixItStage
  error: string | null
  spec: { specId: string; specYaml: string; fixtureYaml: string; fixturePath: string } | null
  applyStage: FixItApplyStage | null
  applyProgress: Array<{
    source: 'server' | 'coder' | 'critic'
    phase: string
    message: string
    details?: Record<string, unknown>
    ts: string
  }>
  applyReasoning: string
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
    fixItSessionId: 'fix-session-1',
  },
  chat: [],
  streaming: false,
  stage: 'chatting',
  error: null,
  spec: null,
  applyStage: null,
  applyProgress: [],
  applyReasoning: '',
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
  restoreFixItSession: vi.fn(),
  setFixItApplyResult: vi.fn(),
  setFixItApplyStage: vi.fn(),
  appendFixItApplyProgress: vi.fn(),
  requestRetryPrompt: vi.fn(),
  probeFixItHealth: vi.fn(),
  streamApplyFix: vi.fn(),
  streamFixChat: vi.fn(),
  synthesizeFixSpec: vi.fn(),
  listFixItJobs: vi.fn(),
  getFixItJob: vi.fn(),
  getFixItJobSpec: vi.fn(),
  completeFixItJob: vi.fn(),
  appendFixItApplyReasoning: vi.fn(),
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
      restoreFixItSession: mocks.restoreFixItSession,
      setFixItApplyResult: mocks.setFixItApplyResult,
      setFixItApplyStage: mocks.setFixItApplyStage,
      appendFixItApplyProgress: mocks.appendFixItApplyProgress,
      appendFixItApplyReasoning: mocks.appendFixItApplyReasoning,
      requestRetryPrompt: mocks.requestRetryPrompt,
    },
  }),
}))

vi.mock('./fixItClient', () => ({
  probeFixItHealth: mocks.probeFixItHealth,
  streamApplyFix: mocks.streamApplyFix,
  streamFixChat: mocks.streamFixChat,
  synthesizeFixSpec: mocks.synthesizeFixSpec,
  listFixItJobs: mocks.listFixItJobs,
  getFixItJob: mocks.getFixItJob,
  getFixItJobSpec: mocks.getFixItJobSpec,
  completeFixItJob: mocks.completeFixItJob,
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
    mocks.restoreFixItSession.mockReset()
    mocks.probeFixItHealth.mockReset()
    mocks.probeFixItHealth.mockResolvedValue(healthyResponse)
    mocks.streamApplyFix.mockReset()
    mocks.streamFixChat.mockReset()
    mocks.synthesizeFixSpec.mockReset()
    mocks.listFixItJobs.mockReset()
    mocks.listFixItJobs.mockResolvedValue({ jobs: [] })
    mocks.getFixItJob.mockReset()
    mocks.getFixItJob.mockResolvedValue(null)
    mocks.completeFixItJob.mockReset()
    mocks.completeFixItJob.mockResolvedValue(null)
  })
  afterEach(() => {
    cleanup()
  })

  it('renders nothing when the panel is closed', () => {
    mocks.fixItState = { ...baseFixIt(), isOpen: false, seed: null }
    const { container } = render(<FixItPanel />)
    expect(container.firstChild).toBeNull()
  })

  it('renders the panel without a seed (post-refresh launcher entry)', () => {
    // Open the panel but with no seed — the user clicked the floating
    // launcher after a refresh to view running jobs.
    mocks.fixItState = { ...baseFixIt(), isOpen: true, seed: null }
    render(<FixItPanel />)
    // Header chrome is visible…
    expect(screen.getByRole('button', { name: 'Close panel' })).toBeTruthy()
    // …and the no-seed placeholder points the user toward the next action.
    expect(screen.getByText('No active Fix-it session.')).toBeTruthy()
    // Failing-prompt section is NOT rendered (would require a seed).
    expect(screen.queryByText('Failing prompt')).toBeNull()
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
    // FixItLiveStatus identifies the agent. Without a senior_started event
    // in the progress log, we're still on the junior pass.
    expect(screen.getByText('Junior coder writing patch')).toBeTruthy()
    // The progress message appears in both the live-status strip and the
    // detailed progress log below — accept either.
    expect(screen.getAllByText('Asking coder model for symbol replacements').length).toBeGreaterThan(0)
    const stop = screen.getByRole('button', { name: 'Stop' })
    fireEvent.click(stop)
    // No assertion on abortRef state — we just verify the button is wired.
    expect(stop).toBeTruthy()
  })

  it('shows the senior-coder agent + reason when escalated', () => {
    mocks.fixItState = {
      ...baseFixIt(),
      stage: 'applying',
      applyStage: 'coder_running',
      applyProgress: [
        {
          source: 'coder',
          phase: 'llm_started',
          message: 'Junior asked for symbol replacements',
          ts: '2026-05-17T00:00:00.000Z',
        },
        {
          source: 'critic',
          phase: 'result',
          message: 'Critic verdict: revision',
          details: { verdict: 'revision', revisionFeedback: 'Slot regex still requires "slot" literal.' },
          ts: '2026-05-17T00:00:30.000Z',
        },
        {
          source: 'server',
          phase: 'senior_started',
          message: 'Critic requested a revision; starting senior coder',
          ts: '2026-05-17T00:00:31.000Z',
        },
        {
          source: 'coder',
          phase: 'llm_started',
          message: 'Senior asked for symbol replacements',
          ts: '2026-05-17T00:00:32.000Z',
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
    // Live status flips to senior agent because a senior_started event is
    // present in the progress log.
    expect(screen.getByText('Senior coder writing patch')).toBeTruthy()
    // The reason from the senior_started event is surfaced in the live
    // status strip AND in the progress log below; either is fine.
    expect(screen.getAllByText(/Critic requested a revision/).length).toBeGreaterThan(0)
    // The latest critic verdict from before escalation is shown as context.
    expect(screen.getByText(/critic: revision/)).toBeTruthy()
    // Revision feedback is highlighted so the user can see WHY.
    expect(screen.getByText(/Slot regex still requires/)).toBeTruthy()
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

  it('renders active Fix-it jobs and can mark retained jobs complete', async () => {
    mocks.listFixItJobs.mockResolvedValue({
      jobs: [
        {
          kind: 'event-editor-fixit-job',
          id: 'job-1',
          status: 'needs-feedback',
          createdAt: '2026-05-17T00:00:00.000Z',
          updatedAt: '2026-05-17T00:01:00.000Z',
          repoRoot: '/repo',
          artifactRoot: '/repo/artifacts',
          jobRoot: '/repo/artifacts/event-editor-fixit/jobs/job-1',
          worktreeRoot: '/repo/.fixit-worktrees',
          baseRef: 'HEAD',
          worktreePath: '/repo/.fixit-worktrees/job-1',
          specId: 'spec-fix-job',
          title: 'Fix job stack',
          prompt: 'Put a plate on B2',
          eventsPath: '/repo/artifacts/event-editor-fixit/jobs/job-1/events.jsonl',
        },
      ],
    })

    render(<FixItPanel />)
    await waitFor(() => {
      expect(screen.getByText('Jobs')).toBeTruthy()
    })
    // STATUS_LABELS maps `needs-feedback` to the friendlier "needs feedback".
    expect(screen.getByText('needs feedback')).toBeTruthy()
    expect(screen.getByText('Fix job stack')).toBeTruthy()
    expect(screen.getByText('Put a plate on B2')).toBeTruthy()

    fireEvent.click(screen.getByRole('button', { name: 'Mark job complete' }))
    await waitFor(() => {
      expect(mocks.completeFixItJob).toHaveBeenCalledWith('job-1')
    })
  })

  it('shows a Resume button on interrupted jobs that fetches the spec and reruns apply', async () => {
    const interruptedJob = {
      kind: 'event-editor-fixit-job' as const,
      id: 'job-zombie',
      status: 'interrupted' as const,
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:01:00.000Z',
      repoRoot: '/repo',
      artifactRoot: '/repo/artifacts',
      jobRoot: '/repo/artifacts/event-editor-fixit/jobs/job-zombie',
      worktreeRoot: '/repo/.fixit-worktrees',
      baseRef: 'HEAD',
      specId: 'spec-fix-zombie',
      title: 'Resume zombie job',
      prompt: 'Place a 96-well plate on B2',
      specPath: '/repo/artifacts/event-editor-fixit/patch-specs/.../spec-fix-zombie.yaml',
      fixturePath: '/repo/server/src/compiler/pipeline/fixtures/spec-fix-zombie.yaml',
      eventsPath: '/repo/artifacts/event-editor-fixit/jobs/job-zombie/events.jsonl',
    }
    mocks.listFixItJobs.mockResolvedValue({ jobs: [interruptedJob] })
    mocks.getFixItJobSpec.mockResolvedValue({
      specId: 'spec-fix-zombie',
      specYaml: 'id: spec-fix-zombie\nfixClass: compiler\n',
      fixtureYaml: 'name: spec-fix-zombie\ninput:\n  prompt: Place a 96-well plate on B2\n',
      fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-zombie.yaml',
    })
    // streamApplyFix yields nothing (returned as soon as the generator is
    // entered) — we only care that it was kicked off.
    mocks.streamApplyFix.mockReturnValue((async function*() {})())

    render(<FixItPanel />)
    await waitFor(() => {
      expect(screen.getByText('Jobs')).toBeTruthy()
    })

    // Status pill uses the friendlier label and the Resume button is
    // present (because status='interrupted').
    expect(screen.getByText('interrupted')).toBeTruthy()
    const resume = screen.getByRole('button', { name: 'Resume job Resume zombie job' })
    fireEvent.click(resume)

    await waitFor(() => {
      expect(mocks.getFixItJobSpec).toHaveBeenCalledWith('job-zombie')
    })
    await waitFor(() => {
      expect(mocks.setFixItSpec).toHaveBeenCalledWith(expect.objectContaining({
        specId: 'spec-fix-zombie',
      }))
    })
    await waitFor(() => {
      expect(mocks.streamApplyFix).toHaveBeenCalledTimes(1)
    })
  })

  it('restores an in-memory Fix-it dialog for the selected job', async () => {
    const job = {
      kind: 'event-editor-fixit-job' as const,
      id: 'job-restore',
      status: 'running' as const,
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:01:00.000Z',
      repoRoot: '/repo',
      artifactRoot: '/repo/artifacts',
      jobRoot: '/repo/artifacts/event-editor-fixit/jobs/job-restore',
      worktreeRoot: '/repo/.fixit-worktrees',
      baseRef: 'HEAD',
      worktreePath: '/repo/.fixit-worktrees/job-restore',
      specId: 'spec-fix-restore',
      title: 'Restore job dialog',
      prompt: 'Put a plate on C1',
      fixItSessionId: 'fix-session-1',
      eventsPath: '/repo/artifacts/event-editor-fixit/jobs/job-restore/events.jsonl',
    }
    mocks.fixItState = {
      ...baseFixIt(),
      stage: 'applying',
      chat: [{ role: 'assistant', content: 'Diagnosis kept in memory' }],
      spec: {
        specId: 'spec-fix-restore',
        specYaml: 'id: spec-fix-restore\n',
        fixtureYaml: 'name: spec-fix-restore\n',
        fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-restore.yaml',
      },
      applyStage: 'coder_running',
      applyProgress: [
        {
          source: 'server',
          phase: 'job_started',
          message: 'Started isolated Fix-it job job-restore',
          details: { id: 'job-restore' },
          ts: '2026-05-17T00:00:10.000Z',
        },
      ],
    }
    mocks.listFixItJobs.mockResolvedValue({ jobs: [job] })
    mocks.getFixItJob.mockResolvedValue({ job, events: [] })

    render(<FixItPanel />)
    await waitFor(() => {
      expect(screen.getByText('Jobs')).toBeTruthy()
    })
    // Clicking the card itself restores the session — no popup.
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation for job Restore job dialog' }))

    await waitFor(() => {
      expect(mocks.restoreFixItSession).toHaveBeenCalledTimes(1)
    })
    expect(mocks.restoreFixItSession.mock.calls[0]?.[0]?.chat[0]?.content).toBe('Diagnosis kept in memory')
  })

  it('restores a durable Fix-it dialog snapshot returned with job detail', async () => {
    const job = {
      kind: 'event-editor-fixit-job' as const,
      id: 'job-durable',
      status: 'needs-feedback' as const,
      createdAt: '2026-05-17T00:00:00.000Z',
      updatedAt: '2026-05-17T00:01:00.000Z',
      repoRoot: '/repo',
      artifactRoot: '/repo/artifacts',
      jobRoot: '/repo/artifacts/event-editor-fixit/jobs/job-durable',
      worktreeRoot: '/repo/.fixit-worktrees',
      baseRef: 'HEAD',
      worktreePath: '/repo/.fixit-worktrees/job-durable',
      specId: 'spec-fix-durable',
      title: 'Durable job dialog',
      prompt: 'Put a plate on D1',
      fixItSessionId: 'fix-session-durable',
      eventsPath: '/repo/artifacts/event-editor-fixit/jobs/job-durable/events.jsonl',
    }
    mocks.listFixItJobs.mockResolvedValue({ jobs: [job] })
    mocks.getFixItJob.mockResolvedValue({
      job,
      events: [],
      sessionSnapshot: {
        seed: baseFixIt().seed,
        chat: [{ role: 'assistant', content: 'Durable diagnosis' }],
        stage: 'failed',
        error: null,
        spec: null,
        applyStage: null,
        applyProgress: [],
        applyReasoning: '',
        applyResult: null,
        fixHistory: [],
        pendingRetryPrompt: null,
      },
    })

    render(<FixItPanel />)
    await waitFor(() => {
      expect(screen.getByText('Jobs')).toBeTruthy()
    })
    fireEvent.click(screen.getByRole('button', { name: 'Open conversation for job Durable job dialog' }))

    await waitFor(() => {
      expect(mocks.restoreFixItSession).toHaveBeenCalledTimes(1)
    })
    expect(mocks.restoreFixItSession.mock.calls[0]?.[0]?.chat[0]?.content).toBe('Durable diagnosis')
  })

  it('does not let a stale apply abort overwrite another selected Fix-it dialog', async () => {
    let rejectApply: (err: unknown) => void = () => {}
    mocks.fixItState = {
      ...baseFixIt(),
      stage: 'spec-ready',
      spec: {
        specId: 'spec-fix-stale',
        specYaml: 'id: spec-fix-stale\n',
        fixtureYaml: 'name: spec-fix-stale\n',
        fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-stale.yaml',
      },
    }
    mocks.streamApplyFix.mockImplementation(async function* () {
      await new Promise((_resolve, reject) => {
        rejectApply = reject
      })
    })

    const view = render(<FixItPanel />)
    fireEvent.click(screen.getByRole('button', { name: 'Apply fix' }))
    await waitFor(() => {
      expect(mocks.streamApplyFix).toHaveBeenCalledTimes(1)
    })
    mocks.setFixItStage.mockClear()

    mocks.fixItState = {
      ...baseFixIt(),
      seed: {
        ...baseFixIt().seed!,
        prompt: 'another failing prompt',
        fixItSessionId: 'fix-session-2',
      },
      stage: 'spec-ready',
      spec: {
        specId: 'spec-fix-other',
        specYaml: 'id: spec-fix-other\n',
        fixtureYaml: 'name: spec-fix-other\n',
        fixturePath: 'server/src/compiler/pipeline/fixtures/spec-fix-other.yaml',
      },
    }
    view.rerender(<FixItPanel />)
    rejectApply(new DOMException('aborted', 'AbortError'))

    await new Promise((resolve) => window.setTimeout(resolve, 0))
    expect(mocks.setFixItStage).not.toHaveBeenCalledWith(
      'spec-ready',
      'Aborted — edit the spec and try again.',
    )
  })
})
