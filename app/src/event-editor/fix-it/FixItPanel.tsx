import { useCallback, useEffect, useRef, useState } from 'react'
import { useEventEditor, type FixItSessionSnapshot, type FixItState } from '../EventEditorContext'
import {
  completeFixItJob,
  getFixItJob,
  getFixItJobSpec,
  listFixItJobs,
  probeFixItHealth,
  streamApplyFix,
  streamFixChat,
  synthesizeFixSpec,
  type FixItHealthResponse,
  type FixItJobRecord,
} from './fixItClient'

/**
 * Right-side drawer for the deterministic precompile fix-it loop.
 *
 * Stages:
 *   chatting   — free-form diagnosis chat with the worker Qwen.
 *   spec-ready — synthesized spec + fixture YAML; user inspects/edits.
 *   applying   — coder agent running (Phase 2 wiring).
 *   done       — patch landed; show commit + touched files.
 *   failed     — apply blocked/failed; show error.
 */
/**
 * `drawer` is the desktop right-side fixed-width panel (the default).
 * `fullscreen` drops the fixed width/position so the panel fills its
 * parent — used by the `/event-editor/fixit` route on mobile, where the
 * Fix-it experience lives in its own browser tab.
 */
export type FixItPanelLayout = 'drawer' | 'fullscreen'

export function FixItPanel({ layout = 'drawer' }: { layout?: FixItPanelLayout } = {}) {
  const { state, actions } = useEventEditor()
  const fixIt = state.fixIt
  const [input, setInput] = useState('')
  const [synthesizing, setSynthesizing] = useState(false)
  const [health, setHealth] = useState<FixItHealthResponse | null>(null)
  const [jobs, setJobs] = useState<FixItJobRecord[]>([])
  // Per-row "restoring…" flag while we fetch the server-side session
  // snapshot for the clicked job. Replaces the old detail-popup state.
  const [restoringJobId, setRestoringJobId] = useState<string | null>(null)
  const [restoreError, setRestoreError] = useState<string | null>(null)
  // Separate collapse for the jobs section — useful once a few queued
  // cards stack up.
  const [jobsCollapsed, setJobsCollapsed] = useState(false)
  const jobSessionSnapshotsRef = useRef<Record<string, FixItSessionSnapshot>>({})
  const currentFixItRef = useRef(fixIt)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    currentFixItRef.current = fixIt
  }, [fixIt])

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [fixIt.chat, fixIt.streaming])

  useEffect(() => () => abortRef.current?.abort(), [])

  const refreshJobs = useCallback(async (signal?: AbortSignal) => {
    const result = await listFixItJobs({ signal }).catch(() => ({ jobs: [] }))
    if (!signal?.aborted) setJobs(result.jobs)
  }, [])

  useEffect(() => {
    if (!fixIt.isOpen) return
    const controller = new AbortController()
    void refreshJobs(controller.signal)
    const interval = window.setInterval(() => {
      void refreshJobs(controller.signal)
    }, fixIt.stage === 'applying' ? 2000 : 5000)
    return () => {
      window.clearInterval(interval)
      controller.abort()
    }
  }, [fixIt.isOpen, fixIt.stage, refreshJobs])

  // Clicking a job row reopens the main dialog with that job's session
  // restored — the seed, chat, stage, and result all flow back into the
  // top-of-panel view. Prefer the in-tab snapshot ref (richer, live);
  // fall back to the server-side snapshot for jobs from other tabs.
  const restoreJobSession = useCallback(async (jobId: string) => {
    if (restoringJobId) return
    setRestoringJobId(jobId)
    setRestoreError(null)
    try {
      const localSnapshot = jobSessionSnapshotsRef.current[jobId]
      if (localSnapshot) {
        actions.restoreFixItSession(localSnapshot)
        return
      }
      const detail = await getFixItJob(jobId).catch(() => null)
      const snapshot = detail?.sessionSnapshot
      if (snapshot) {
        actions.restoreFixItSession(snapshot)
        return
      }
      setRestoreError('No saved session for this job — it was started in a different browser tab.')
    } finally {
      setRestoringJobId(null)
    }
  }, [actions, restoringJobId])

  useEffect(() => {
    if (fixIt.isOpen) return
    setRestoringJobId(null)
    setRestoreError(null)
  }, [fixIt.isOpen])

  useEffect(() => {
    const jobId = currentFixItJobId(fixIt)
    const snapshot = snapshotFixItSession(fixIt)
    if (!jobId || !snapshot) return
    jobSessionSnapshotsRef.current[jobId] = snapshot
  }, [fixIt])

  // Pre-flight probe: when the panel opens, ask the server whether the
  // worker (:8001) and architect (:8000) endpoints are reachable so we can
  // show a banner instead of waiting for a stream to error out.
  useEffect(() => {
    if (!fixIt.isOpen) return
    let cancelled = false
    void probeFixItHealth().then((result) => {
      if (!cancelled) setHealth(result)
    })
    return () => { cancelled = true }
  }, [fixIt.isOpen])

  // applying flag tracked at the panel level so the Resume button (which
  // lives outside SpecEditor) can also drive the apply flow.
  const [applying, setApplying] = useState(false)

  /**
   * Run the apply pipeline for the given spec. Pipes SSE events back into
   * the fixIt state via actions. Used by both SpecEditor's Apply button
   * and the Resume button on interrupted job cards.
   */
  const applySpec = useCallback(async (args: {
    spec: { specYaml: string; fixtureYaml: string; specId: string; fixturePath: string }
    fixItSessionId?: string
    sessionSnapshot?: Parameters<typeof streamApplyFix>[0]['sessionSnapshot']
  }) => {
    if (applying) return
    const { spec, fixItSessionId, sessionSnapshot } = args
    const applySessionId = fixItSessionId
    const isCurrentApplySession = () =>
      !applySessionId
      || currentFixItRef.current.seed?.fixItSessionId === applySessionId
    setApplying(true)
    actions.setFixItStage('applying', null)
    actions.setFixItApplyStage(null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      for await (const ev of streamApplyFix({
        specYaml: spec.specYaml,
        fixtureYaml: spec.fixtureYaml,
        specId: spec.specId,
        fixturePath: spec.fixturePath,
        ...(fixItSessionId ? { fixItSessionId } : {}),
        ...(sessionSnapshot ? { sessionSnapshot } : {}),
        signal: controller.signal,
      })) {
        if (!isCurrentApplySession()) continue
        if (ev.type === 'stage') {
          actions.setFixItApplyStage(ev.stage)
        } else if (ev.type === 'progress') {
          actions.appendFixItApplyProgress({
            source: ev.source,
            phase: ev.phase,
            message: ev.message,
            ...(ev.details ? { details: ev.details } : {}),
          })
          if (ev.details?.rawReasoning && typeof ev.details.rawReasoning === 'string') {
            actions.appendFixItApplyReasoning(ev.details.rawReasoning)
          }
        } else if (ev.type === 'done') {
          actions.setFixItApplyResult({
            status: ev.result.status as 'applied' | 'blocked' | 'failed' | 'skipped' | 'stale' | 'needs-human' | 'needs-revision',
            message: ev.result.message,
            touchedFiles: ev.result.touchedFiles,
            ...(ev.result.job ? { job: ev.result.job } : {}),
            ...(ev.result.commit ? { commit: ev.result.commit } : {}),
            ...(ev.result.critic ? { critic: ev.result.critic } : {}),
          })
        } else if (ev.type === 'error') {
          actions.setFixItStage('failed', ev.message)
          actions.setFixItApplyStage(null)
        }
      }
    } catch (err) {
      const wasAbort = controller.signal.aborted
        || (err instanceof DOMException && err.name === 'AbortError')
      if (!isCurrentApplySession()) return
      if (wasAbort) {
        actions.setFixItStage('spec-ready', 'Aborted — edit the spec and try again.')
      } else {
        const message = err instanceof Error ? err.message : String(err)
        actions.setFixItStage('failed', message)
      }
      actions.setFixItApplyStage(null)
    } finally {
      if (abortRef.current === controller) abortRef.current = null
      setApplying(false)
    }
  }, [actions, applying])

  /**
   * Resume an interrupted job. Fetches the saved spec from the server,
   * sets it in the editor state, and immediately runs `applySpec` — a new
   * job is created (the old `interrupted` job stays as audit trail).
   */
  const resumeJob = useCallback(async (jobId: string) => {
    if (applying) return
    setRestoringJobId(jobId)
    setRestoreError(null)
    try {
      const spec = await getFixItJobSpec(jobId)
      if (!spec) {
        setRestoreError('Could not fetch the saved spec for this job.')
        return
      }
      // Best-effort: also restore the conversation context if we have it.
      const localSnapshot = jobSessionSnapshotsRef.current[jobId]
      if (localSnapshot) {
        actions.restoreFixItSession(localSnapshot)
      } else {
        const detail = await getFixItJob(jobId).catch(() => null)
        if (detail?.sessionSnapshot) {
          actions.restoreFixItSession(detail.sessionSnapshot)
        }
      }
      actions.setFixItSpec({
        specId: spec.specId,
        specYaml: spec.specYaml,
        fixtureYaml: spec.fixtureYaml,
        fixturePath: spec.fixturePath,
      })
      await applySpec({ spec })
    } finally {
      setRestoringJobId(null)
    }
  }, [actions, applying, applySpec])

  const send = useCallback(async () => {
    const text = input.trim()
    if (!text || fixIt.streaming || !fixIt.seed) return
    setInput('')

    // History sent to the server is the chat AS IT WAS before this turn;
    // the new user message and the new assistant placeholder are appended
    // to local state but not yet to the wire history.
    const history = fixIt.chat.map((m) => ({ role: m.role, content: m.content }))

    actions.appendFixItChat({ role: 'user', content: text })
    actions.appendFixItChat({ role: 'assistant', content: '' })
    actions.setFixItStreaming(true)

    const controller = new AbortController()
    abortRef.current = controller

    let buffered = ''
    let reasoningBuffered = ''
    try {
      for await (const ev of streamFixChat({
        seed: fixIt.seed,
        history,
        userMessage: text,
        signal: controller.signal,
      })) {
        if (ev.type === 'reasoning_delta') {
          reasoningBuffered += ev.delta
          actions.appendLastFixItReasoning(ev.delta)
        } else if (ev.type === 'text_delta') {
          buffered += ev.delta
          actions.updateLastFixItAssistant(buffered, reasoningBuffered || undefined)
        } else if (ev.type === 'error') {
          actions.updateLastFixItAssistant(
            (buffered.length > 0 ? buffered + '\n\n' : '') + `Error: ${ev.message}`,
            reasoningBuffered || undefined,
          )
        }
        // 'done' needs no UI work — text_delta accumulation handles final flush.
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      actions.updateLastFixItAssistant(
        (buffered.length > 0 ? buffered + '\n\n' : '') + `Stream failed: ${message}`,
        reasoningBuffered || undefined,
      )
    } finally {
      actions.setFixItStreaming(false)
      abortRef.current = null
    }
  }, [actions, fixIt.chat, fixIt.seed, fixIt.streaming, input])

  const synthesize = useCallback(async () => {
    if (synthesizing || !fixIt.seed) return
    setSynthesizing(true)
    actions.setFixItStage('chatting', null)
    const controller = new AbortController()
    abortRef.current = controller
    try {
      const result = await synthesizeFixSpec({
        seed: fixIt.seed,
        history: fixIt.chat,
        signal: controller.signal,
      })
      if ('error' in result) {
        actions.setFixItStage('chatting', result.message)
        return
      }
      actions.setFixItSpec({
        specId: result.specId,
        specYaml: result.specYaml,
        fixtureYaml: result.fixtureYaml,
        fixturePath: result.fixturePath,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      actions.setFixItStage('chatting', message)
    } finally {
      setSynthesizing(false)
      abortRef.current = null
    }
  }, [actions, fixIt.chat, fixIt.seed, synthesizing])

  if (!fixIt.isOpen) return null
  // Seed-less mode is allowed: lets the user pop the panel from the
  // launcher after a refresh to view running jobs and restore sessions
  // without needing an in-flight draft preview.
  const seed = fixIt.seed

  // Phase-2 readiness: we want at least one assistant reply before letting
  // the user mint a spec, so the LLM has actually weighed in on the seed.
  const hasAssistantTurn = fixIt.chat.some(
    (m) => m.role === 'assistant' && m.content.trim().length > 0,
  )

  return (
    <aside className="fixit-panel" data-layout={layout} aria-label="Fix-it side chat">
      <header className="fixit-panel__header">
        <div className="fixit-panel__title">
          Fix-it
          <span className="fixit-panel__stage-tag" data-stage={fixIt.stage}>
            {fixIt.stage}
          </span>
        </div>
        <div className="fixit-panel__header-actions">
          <button
            type="button"
            className="fixit-panel__collapse"
            onClick={() => actions.closeFixIt()}
            title="Collapse to launcher chip (keeps the conversation)"
            aria-label="Collapse panel"
          >▾</button>
          <button
            type="button"
            className="fixit-panel__close"
            onClick={() => {
              abortRef.current?.abort()
              actions.closeFixIt()
            }}
            title="Close (keeps the conversation)"
            aria-label="Close panel"
          >×</button>
        </div>
      </header>

      {fixIt.stage === 'applying' ? (
        <FixItLiveStatus
          applyStage={fixIt.applyStage}
          applyProgress={fixIt.applyProgress}
        />
      ) : null}

      {!seed ? null : (
        <>
        <section className="fixit-panel__seed">
          <div className="fixit-panel__seed-label">Failing prompt</div>
          <div className="fixit-panel__seed-prompt">{seed.prompt}</div>
          <div className="fixit-panel__seed-row">
            <span className="fixit-panel__seed-key">Draft:</span>
            <span>
              {seed.draft.events.length} event{seed.draft.events.length === 1 ? '' : 's'},{' '}
              {seed.draft.placements.length} placement
              {seed.draft.placements.length === 1 ? '' : 's'}
            </span>
          </div>
          {seed.draft.skips.length > 0 ? (
            <ul className="fixit-panel__skips">
              {seed.draft.skips.map((s, i) => (
                <li key={i}>Skipped: {s}</li>
              ))}
            </ul>
          ) : null}
          <div className="fixit-panel__seed-row">
            <span className="fixit-panel__seed-key">Deck:</span>
            <span>
              {seed.deckContext.platformLabel ?? seed.deckContext.platformId}
              {' · '}
              {seed.deckContext.variantTitle ?? seed.deckContext.variantId}
            </span>
          </div>
        </section>

      {fixIt.error ? (
        <div className="fixit-panel__error" role="alert">{fixIt.error}</div>
      ) : null}

      {health && (!health.worker.reachable || !health.architect.reachable) ? (
        <div className="fixit-panel__health" role="status">
          <strong>Inference endpoint offline:</strong>
          {!health.worker.reachable ? (
            <span> worker ({health.worker.baseUrl})</span>
          ) : null}
          {!health.architect.reachable ? (
            <span> architect ({health.architect.baseUrl})</span>
          ) : null}
          <span className="fixit-panel__health-hint">
            {' '}— Fix-it streams will fail until the host is back.
          </span>
        </div>
      ) : null}

      {fixIt.stage === 'chatting' || fixIt.stage === 'failed' ? (
        <>
          <div className="fixit-panel__log" ref={logRef}>
            {fixIt.chat.length === 0 ? (
              <div className="fixit-panel__hint">
                Tell the AI what looks wrong about the preview on the deck.
                It'll diagnose which pass produced the result and propose a fix.
                Once you're aligned on the diagnosis, click <strong>Generate fix spec</strong>.
              </div>
            ) : null}
            {fixIt.chat.map((m, i) => (
              <div key={i} className="fixit-panel__msg" data-role={m.role}>
                <span className="fixit-panel__role">{m.role === 'user' ? 'you' : 'ai'}</span>
                <div className="fixit-panel__bubble">
                  {m.role === 'assistant' && m.reasoning ? (
                    <details className="fixit-panel__reasoning">
                      <summary className="fixit-panel__reasoning-toggle">
                        Reasoning ({m.reasoning.replace(/\s+/g, ' ').trim().length} chars)
                      </summary>
                      <pre className="fixit-panel__reasoning-content">{m.reasoning}</pre>
                    </details>
                  ) : null}
                  {m.content || (m.role === 'assistant' && fixIt.streaming ? '…' : '')}
                </div>
              </div>
            ))}
          </div>

          <form
            className="fixit-panel__input-row"
            onSubmit={(event) => {
              event.preventDefault()
              void send()
            }}
          >
            <textarea
              className="fixit-panel__input"
              placeholder={fixIt.streaming ? 'Streaming…' : 'What went wrong?'}
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault()
                  void send()
                }
              }}
              disabled={fixIt.streaming || synthesizing}
              rows={3}
            />
            {fixIt.streaming ? (
              <button
                type="button"
                className="fixit-panel__send fixit-panel__send--cancel"
                onClick={() => abortRef.current?.abort()}
              >Stop</button>
            ) : (
              <div className="fixit-panel__btn-stack">
                <button
                  type="submit"
                  className="fixit-panel__send"
                  disabled={!input.trim() || synthesizing}
                >Send</button>
                <button
                  type="button"
                  className="fixit-panel__synthesize"
                  onClick={() => { void synthesize() }}
                  disabled={!hasAssistantTurn || synthesizing}
                  title={
                    !hasAssistantTurn
                      ? 'Discuss the bug with the AI first — it needs context to write a spec'
                      : 'Synthesize a fix spec + regression fixture from this conversation'
                  }
                >{synthesizing ? 'Synthesizing…' : 'Generate fix spec'}</button>
              </div>
            )}
          </form>
        </>
      ) : null}

      {fixIt.stage === 'spec-ready' && fixIt.spec ? (
        <SpecEditor
          applying={applying}
          onApply={() => {
            const spec = fixIt.spec
            if (!spec) return
            void applySpec({
              spec,
              ...(fixIt.seed?.fixItSessionId ? { fixItSessionId: fixIt.seed.fixItSessionId } : {}),
              ...((snapshotFixItSession(fixIt)) ? { sessionSnapshot: { ...snapshotFixItSession(fixIt)!, stage: 'applying' } } : {}),
            })
          }}
        />
      ) : null}

      {fixIt.stage === 'applying' ? (
        <ApplyingView
          stage={fixIt.applyStage}
          progress={fixIt.applyProgress}
          reasoning={fixIt.applyReasoning}
          onStop={() => abortRef.current?.abort()}
        />
      ) : null}

      {(fixIt.stage === 'done' || fixIt.stage === 'failed') && fixIt.applyResult ? (
        <DoneView />
      ) : null}
        </>
      )}

      {!seed ? (
        <div className="fixit-panel__no-seed" role="status">
          <strong>No active Fix-it session.</strong>
          <span>
            {' '}Click a running job below to restore its conversation, or
            start a new diagnosis from a preview by clicking <em>Fix-it</em>
            on the preview action bar.
          </span>
        </div>
      ) : null}

      <FixItJobStack
        jobs={jobs}
        currentJobId={currentFixItJobId(fixIt)}
        restoringJobId={restoringJobId}
        restoreError={restoreError}
        collapsed={jobsCollapsed}
        onToggleCollapsed={() => setJobsCollapsed((prev) => !prev)}
        onActivate={(jobId) => { void restoreJobSession(jobId) }}
        onResume={(jobId) => { void resumeJob(jobId) }}
        onRefresh={() => { void refreshJobs() }}
      />
    </aside>
  )
}

const APPLY_STAGE_LABELS: Record<string, string> = {
  writing_fixture: 'writing fixture',
  writing_spec: 'writing spec',
  coder_running: 'coder running',
  critic_running: 'critic running',
  senior_retry: 'escalating to senior coder',
}

function currentFixItJobId(fixIt: FixItState): string | null {
  if (fixIt.applyResult?.job?.id) return fixIt.applyResult.job.id
  for (let index = fixIt.applyProgress.length - 1; index >= 0; index -= 1) {
    const details = fixIt.applyProgress[index]?.details
    if (!details) continue
    if (typeof details.id === 'string') return details.id
    const nested = details.job
    if (nested && typeof nested === 'object' && 'id' in nested && typeof nested.id === 'string') {
      return nested.id
    }
  }
  return null
}

function snapshotFixItSession(fixIt: FixItState): FixItSessionSnapshot | null {
  if (!fixIt.seed) return null
  return {
    seed: fixIt.seed,
    chat: fixIt.chat,
    stage: fixIt.stage,
    error: fixIt.error,
    spec: fixIt.spec,
    applyStage: fixIt.applyStage,
    applyProgress: fixIt.applyProgress,
    applyReasoning: fixIt.applyReasoning,
    applyResult: fixIt.applyResult,
    fixHistory: fixIt.fixHistory,
    pendingRetryPrompt: fixIt.pendingRetryPrompt,
  }
}

const RUNNING_JOB_STATUSES = new Set(['queued', 'running', 'critic'])

function canMarkJobComplete(job: FixItJobRecord): boolean {
  return job.status !== 'complete' && !RUNNING_JOB_STATUSES.has(job.status)
}

function FixItJobStack({
  jobs,
  currentJobId,
  restoringJobId,
  restoreError,
  collapsed,
  onToggleCollapsed,
  onActivate,
  onResume,
  onRefresh,
}: {
  jobs: FixItJobRecord[]
  currentJobId: string | null
  restoringJobId: string | null
  restoreError: string | null
  collapsed: boolean
  onToggleCollapsed: () => void
  onActivate: (jobId: string) => void
  onResume: (jobId: string) => void
  onRefresh: () => void
}) {
  const visible = jobs
    .filter((job) => job.status !== 'complete')
    .slice(-12)
    .reverse()
  if (visible.length === 0 && !restoreError) return null

  return (
    <section className="fixit-jobs" aria-label="Fix-it jobs">
      <div className="fixit-jobs__header">
        <button
          type="button"
          className="fixit-jobs__toggle"
          onClick={onToggleCollapsed}
          aria-expanded={!collapsed}
          aria-label={collapsed ? 'Expand jobs' : 'Collapse jobs'}
          title={collapsed ? 'Show job cards' : 'Hide job cards'}
        >{collapsed ? '▸' : '▾'}</button>
        <span className="fixit-jobs__title">Jobs</span>
        <span className="fixit-jobs__count">{visible.length}</span>
        <button
          type="button"
          className="fixit-jobs__refresh"
          onClick={onRefresh}
          title="Refresh Fix-it jobs"
          aria-label="Refresh"
        >↻</button>
      </div>
      {restoreError ? (
        <div className="fixit-jobs__error" role="alert">{restoreError}</div>
      ) : null}
      {collapsed ? null : (
        <ol className="fixit-jobs__list">
          {visible.map((job) => (
            <FixItJobCard
              key={job.id}
              job={job}
              isCurrent={job.id === currentJobId}
              isRestoring={job.id === restoringJobId}
              onActivate={onActivate}
              onResume={onResume}
              onRefresh={onRefresh}
            />
          ))}
        </ol>
      )}
    </section>
  )
}

/**
 * Always-visible status strip shown below the header during the apply
 * phase. Even when the conversation body is collapsed, the user can see
 * which agent is running, why, and the latest critic verdict if any.
 */
function FixItLiveStatus({
  applyStage,
  applyProgress,
}: {
  applyStage: FixItState['applyStage']
  applyProgress: FixItState['applyProgress']
}) {
  const step = deriveCurrentStep(applyStage, applyProgress)
  if (!step) return null
  return (
    <div className="fixit-live" role="status" aria-live="polite" data-agent={step.agentKey}>
      <div className="fixit-live__row">
        <span className="fixit-live__agent">{step.agentLabel}</span>
        {step.criticVerdict ? (
          <span className="fixit-live__verdict" data-verdict={step.criticVerdict}>
            critic: {step.criticVerdict}
          </span>
        ) : null}
      </div>
      {step.reason ? (
        <div className="fixit-live__reason">{step.reason}</div>
      ) : null}
      {step.criticFeedback ? (
        <div className="fixit-live__feedback">
          <strong>Why revision:</strong> {step.criticFeedback}
        </div>
      ) : null}
      {step.latestMessage && step.latestMessage !== step.reason ? (
        <div className="fixit-live__latest">{step.latestMessage}</div>
      ) : null}
    </div>
  )
}

interface CurrentStepInfo {
  agentKey: 'junior' | 'critic-junior' | 'senior' | 'critic-senior' | 'setup'
  agentLabel: string
  reason?: string
  latestMessage?: string
  criticVerdict?: 'pass' | 'block' | 'revision'
  criticFeedback?: string
}

/**
 * Derives a human-readable "current step" summary from the apply state +
 * progress log. Answers: who's running (junior / critic / senior), what
 * was the latest critic verdict, and (for senior runs) what reason the
 * server gave for escalating.
 */
function deriveCurrentStep(
  applyStage: FixItState['applyStage'],
  applyProgress: FixItState['applyProgress'],
): CurrentStepInfo | null {
  if (!applyStage) return null

  const seniorStartedEntry = [...applyProgress].reverse().find(
    (p) => p.source === 'server' && p.phase === 'senior_started',
  )
  const seniorTriggered = Boolean(seniorStartedEntry)
  const seniorReason = seniorStartedEntry?.message

  // Latest critic 'result' (final verdict for that pass).
  const lastCriticResult = [...applyProgress].reverse().find(
    (p) => p.source === 'critic' && p.phase === 'result',
  )
  const criticVerdict = readVerdict(lastCriticResult?.details)
  const criticFeedback = readString(lastCriticResult?.details, 'revisionFeedback')

  let agentKey: CurrentStepInfo['agentKey'] = 'setup'
  let agentLabel = ''
  let reason: string | undefined

  if (applyStage === 'writing_fixture') {
    agentLabel = 'Writing regression fixture'
  } else if (applyStage === 'writing_spec') {
    agentLabel = 'Writing patch spec'
  } else if (applyStage === 'coder_running') {
    if (seniorTriggered) {
      agentKey = 'senior'
      agentLabel = 'Senior coder writing patch'
      if (seniorReason) reason = seniorReason
    } else {
      agentKey = 'junior'
      agentLabel = 'Junior coder writing patch'
    }
  } else if (applyStage === 'critic_running') {
    if (seniorTriggered) {
      agentKey = 'critic-senior'
      agentLabel = "Critic reviewing senior's patch"
    } else {
      agentKey = 'critic-junior'
      agentLabel = "Critic reviewing junior's patch"
    }
  } else if (applyStage === 'senior_retry') {
    agentKey = 'senior'
    agentLabel = 'Escalating to senior coder'
    reason = seniorReason
  }

  // Latest meaningful event — drop heartbeats and pure tick noise.
  const latest = [...applyProgress].reverse().find(
    (p) => p.phase !== 'heartbeat' && p.phase !== 'tick',
  )

  return {
    agentKey,
    agentLabel,
    ...(reason ? { reason } : {}),
    ...(latest?.message ? { latestMessage: latest.message } : {}),
    ...(criticVerdict ? { criticVerdict } : {}),
    ...(criticFeedback ? { criticFeedback } : {}),
  }
}

function readVerdict(details: Record<string, unknown> | undefined): 'pass' | 'block' | 'revision' | undefined {
  const v = details?.verdict
  return v === 'pass' || v === 'block' || v === 'revision' ? v : undefined
}

function readString(details: Record<string, unknown> | undefined, key: string): string | undefined {
  const v = details?.[key]
  return typeof v === 'string' && v.length > 0 ? v : undefined
}

function FixItJobCard({
  job,
  isCurrent,
  isRestoring,
  onActivate,
  onResume,
  onRefresh,
}: {
  job: FixItJobRecord
  isCurrent: boolean
  isRestoring: boolean
  onActivate: (jobId: string) => void
  onResume: (jobId: string) => void
  onRefresh: () => void
}) {
  const [completing, setCompleting] = useState(false)
  const canComplete = canMarkJobComplete(job)
  const canResume = job.status === 'interrupted'

  async function markComplete(event: React.MouseEvent) {
    event.stopPropagation()
    if (completing) return
    setCompleting(true)
    try {
      await completeFixItJob(job.id)
      onRefresh()
    } finally {
      setCompleting(false)
    }
  }

  function handleResume(event: React.MouseEvent) {
    event.stopPropagation()
    onResume(job.id)
  }

  const headline = job.title ?? job.specId ?? job.id
  const subline = job.prompt && job.prompt !== headline ? job.prompt : null

  // Card body is a <button> for the activate click. Sibling buttons
  // (Mark complete, Resume) are positioned over the card so we avoid
  // nesting <button> inside <button>.
  return (
    <li className="fixit-job-card-wrap" data-status={job.status}>
      <button
        type="button"
        className="fixit-job-card"
        data-status={job.status}
        data-current={isCurrent ? 'true' : undefined}
        onClick={() => onActivate(job.id)}
        disabled={isRestoring}
        aria-label={`Open conversation for job ${headline}`}
      >
        <div className="fixit-job-card__row">
          <FixItJobStatusBadge status={job.status} />
          {isCurrent ? (
            <span className="fixit-job-card__current">current</span>
          ) : null}
          {isRestoring ? (
            <span className="fixit-job-card__restoring">restoring…</span>
          ) : null}
        </div>
        <div className="fixit-job-card__title">{headline}</div>
        {subline ? (
          <div className="fixit-job-card__subline">{subline}</div>
        ) : null}
        {canResume ? (
          <div className="fixit-job-card__hint">
            Interrupted — click <strong>Resume</strong> to retry from scratch.
          </div>
        ) : null}
      </button>
      <div className="fixit-job-card__actions">
        {canResume ? (
          <button
            type="button"
            className="fixit-job-card__resume"
            onClick={handleResume}
            disabled={isRestoring}
            title="Restart the apply pipeline using this job's saved spec"
            aria-label={`Resume job ${headline}`}
          >Resume</button>
        ) : null}
        {canComplete ? (
          <button
            type="button"
            className="fixit-job-card__complete"
            onClick={markComplete}
            disabled={completing}
            title="Release this job's retained context and worktree"
            aria-label="Mark job complete"
          >{completing ? '…' : '✕'}</button>
        ) : null}
      </div>
    </li>
  )
}

/**
 * Status badge. Color is driven by `data-status` in CSS so adding a new
 * status doesn't require code changes — just a CSS rule for the tint.
 */
function FixItJobStatusBadge({ status }: { status: string }) {
  const label = STATUS_LABELS[status] ?? status
  return (
    <span className="fixit-job-card__status" data-status={status}>{label}</span>
  )
}

const STATUS_LABELS: Record<string, string> = {
  queued: 'queued',
  running: 'running',
  critic: 'critic reviewing',
  'needs-feedback': 'needs feedback',
  applied: 'applied',
  blocked: 'blocked',
  failed: 'failed',
  skipped: 'skipped',
  complete: 'complete',
}

function ApplyingView({
  stage,
  progress,
  reasoning,
  onStop,
}: {
  stage: 'writing_fixture' | 'writing_spec' | 'coder_running' | 'critic_running' | 'senior_retry' | null
  progress: Array<{ source: 'server' | 'coder' | 'critic'; phase: string; message: string; ts: string }>
  reasoning?: string
  onStop: () => void
}) {
  return (
    <div className="fixit-panel__applying" aria-live="polite">
      <div className="fixit-panel__applying-header">
        <div className="fixit-panel__applying-spinner" aria-hidden />
        <div className="fixit-panel__hint">
          Coder agent running…
          {stage ? <span> ({APPLY_STAGE_LABELS[stage] ?? stage})</span> : null}
        </div>
        <button
          type="button"
          className="fixit-panel__send fixit-panel__send--cancel"
          onClick={onStop}
          title="Stop the coder; any uncommitted edits will be rolled back"
        >Stop</button>
      </div>
      {reasoning && reasoning.length > 0 ? (
        <details className="fixit-panel__reasoning" open>
          <summary className="fixit-panel__reasoning-toggle">
            Model reasoning ({reasoning.replace(/\s+/g, ' ').trim().length} chars)
          </summary>
          <pre className="fixit-panel__reasoning-content">{reasoning}</pre>
        </details>
      ) : null}
      {progress.length > 0 ? (
        <ol className="fixit-panel__progress-log" aria-label="Fix progress">
          {progress.slice(-12).map((entry, index) => (
            <li
              key={`${entry.ts}-${entry.source}-${entry.phase}-${index}`}
              className={`fixit-panel__progress-log-item fixit-panel__progress-log-item--${entry.source}`}
            >
              <span className="fixit-panel__progress-source">{entry.source}</span>
              <span className="fixit-panel__progress-message">{entry.message}</span>
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  )
}

/**
 * Side-by-side editor for the synthesized spec + fixture YAML. The user
 * can tweak before applying, or regenerate the whole pair from chat.
 */
function SpecEditor({
  applying,
  onApply,
}: {
  applying: boolean
  onApply: () => void
}) {
  const { state, actions } = useEventEditor()
  const spec = state.fixIt.spec
  const apply = onApply

  if (!spec) return null
  return (
    <div className="fixit-panel__spec-editor">
      <div className="fixit-panel__spec-meta">
        <span className="fixit-panel__seed-label">Spec</span>
        <span className="fixit-panel__spec-id">{spec.specId}</span>
      </div>
      <label className="fixit-panel__spec-label" htmlFor="fixit-spec-yaml">spec.yaml</label>
      <textarea
        id="fixit-spec-yaml"
        className="fixit-panel__yaml"
        value={spec.specYaml}
        onChange={(e) => actions.editFixItSpec(e.target.value, spec.fixtureYaml)}
        rows={10}
        spellCheck={false}
        disabled={applying}
      />
      <label className="fixit-panel__spec-label" htmlFor="fixit-fixture-yaml">
        {spec.fixturePath}
      </label>
      <textarea
        id="fixit-fixture-yaml"
        className="fixit-panel__yaml"
        value={spec.fixtureYaml}
        onChange={(e) => actions.editFixItSpec(spec.specYaml, e.target.value)}
        rows={8}
        spellCheck={false}
        disabled={applying}
      />
      <div className="fixit-panel__spec-actions">
        <button
          type="button"
          className="fixit-panel__synthesize"
          onClick={() => actions.clearFixItSpec()}
          disabled={applying}
          title="Discard this spec and return to chat"
        >Back to chat</button>
        <button
          type="button"
          className="fixit-panel__apply"
          onClick={() => { void apply() }}
          disabled={applying}
          title="Write the fixture + spec to disk, then run the coder agent and (on success) auto-commit"
        >{applying ? 'Applying…' : 'Apply fix'}</button>
      </div>
    </div>
  )
}

function DoneView() {
  const { state, actions } = useEventEditor()
  const result = state.fixIt.applyResult
  if (!result) return null
  const critic = result.critic
  return (
    <div className="fixit-panel__done">
      <div className="fixit-panel__done-status">{result.status}</div>
      {result.message ? (
        <div className="fixit-panel__done-row">
          <span>{result.message}</span>
        </div>
      ) : null}
      {result.commit ? (
        <div className="fixit-panel__done-row">
          <span className="fixit-panel__seed-key">Commit:</span>
          <code>{result.commit.slice(0, 12)}</code>
        </div>
      ) : null}
      {critic ? (
        <div className="fixit-panel__critic" data-verdict={critic.verdict}>
          <div className="fixit-panel__critic-row">
            <span className="fixit-panel__critic-tag">critic</span>
            <span className="fixit-panel__critic-verdict">{critic.verdict}</span>
            {critic.seniorRetryRan ? (
              <span className="fixit-panel__critic-senior">via senior retry</span>
            ) : null}
          </div>
          {critic.message ? (
            <div className="fixit-panel__critic-message">{critic.message}</div>
          ) : null}
          {critic.criteriaMet.length > 0 ? (
            <details className="fixit-panel__critic-criteria">
              <summary>✓ {critic.criteriaMet.length} criteria met</summary>
              <ul>
                {critic.criteriaMet.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </details>
          ) : null}
          {critic.criteriaFailed.length > 0 ? (
            <details className="fixit-panel__critic-criteria" data-fail>
              <summary>✗ {critic.criteriaFailed.length} criteria failed</summary>
              <ul>
                {critic.criteriaFailed.map((c, i) => <li key={i}>{c}</li>)}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
      {result.touchedFiles.length > 0 ? (
        <details className="fixit-panel__done-files">
          <summary>{result.touchedFiles.length} file{result.touchedFiles.length === 1 ? '' : 's'}</summary>
          <ul>
            {result.touchedFiles.map((f, i) => <li key={i}><code>{f}</code></li>)}
          </ul>
        </details>
      ) : null}
      <RetryPromptRow />
      <FixHistoryList />
      <div className="fixit-panel__spec-actions">
        <button
          type="button"
          className="fixit-panel__synthesize"
          onClick={() => actions.continueFixItFeedback()}
          title="Return to this same Fix-it conversation with the apply result still in context"
        >Continue feedback</button>
        <button
          type="button"
          className="fixit-panel__synthesize"
          onClick={() => actions.clearFixItSpec()}
        >Discard spec</button>
      </div>
    </div>
  )
}

function FixHistoryList() {
  const { state } = useEventEditor()
  const history = state.fixIt.fixHistory
  if (history.length === 0) return null
  return (
    <details className="fixit-panel__history">
      <summary>{history.length} attempt{history.length === 1 ? '' : 's'} this session</summary>
      <ol className="fixit-panel__history-list">
        {history.map((h, i) => (
          <li key={i} className="fixit-panel__history-item" data-status={h.status}>
            <span className="fixit-panel__history-status">{h.status}</span>
            {h.commit ? <code className="fixit-panel__history-commit">{h.commit.slice(0, 7)}</code> : null}
            <span className="fixit-panel__history-title">{h.title}</span>
            {h.criticVerdict ? (
              <span className="fixit-panel__history-critic" data-verdict={h.criticVerdict}>
                {h.criticVerdict}
              </span>
            ) : null}
          </li>
        ))}
      </ol>
    </details>
  )
}

/**
 * Replay the original failing prompt through the dock's draft pipeline.
 * The dock subscribes to `pendingRetryPrompt`; we set it here and let the
 * dock effect take over (which also closes this panel so the user can see
 * the new ghost on the deck).
 *
 * Only enabled when the apply landed successfully — there's no point
 * retrying if the patch didn't actually go in.
 */
function RetryPromptRow() {
  const { state, actions } = useEventEditor()
  const seed = state.fixIt.seed
  const result = state.fixIt.applyResult
  if (!seed || !result || result.status !== 'applied' || !seed.prompt.trim()) {
    return null
  }
  return (
    <div className="fixit-panel__retry-row">
      <button
        type="button"
        className="fixit-panel__retry"
        onClick={() => actions.requestRetryPrompt(seed.prompt)}
        title="Replay the original prompt through the dock and close this panel"
      >Retry prompt</button>
      <span className="fixit-panel__retry-hint">
        Replays <code>{seed.prompt}</code>
      </span>
    </div>
  )
}
