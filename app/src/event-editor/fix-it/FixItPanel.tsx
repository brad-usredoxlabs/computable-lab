import { useCallback, useEffect, useRef, useState } from 'react'
import { useEventEditor } from '../EventEditorContext'
import {
  probeFixItHealth,
  streamApplyFix,
  streamFixChat,
  synthesizeFixSpec,
  type FixItHealthResponse,
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
export function FixItPanel() {
  const { state, actions } = useEventEditor()
  const fixIt = state.fixIt
  const [input, setInput] = useState('')
  const [synthesizing, setSynthesizing] = useState(false)
  const [health, setHealth] = useState<FixItHealthResponse | null>(null)
  const abortRef = useRef<AbortController | null>(null)
  const logRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight
  }, [fixIt.chat, fixIt.streaming])

  useEffect(() => () => abortRef.current?.abort(), [])

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

  if (!fixIt.isOpen || !fixIt.seed) return null
  const seed = fixIt.seed

  // Phase-2 readiness: we want at least one assistant reply before letting
  // the user mint a spec, so the LLM has actually weighed in on the seed.
  const hasAssistantTurn = fixIt.chat.some(
    (m) => m.role === 'assistant' && m.content.trim().length > 0,
  )

  return (
    <aside className="fixit-panel" aria-label="Fix-it side chat">
      <header className="fixit-panel__header">
        <div className="fixit-panel__title">
          Fix-it
          <span className="fixit-panel__stage-tag" data-stage={fixIt.stage}>
            {fixIt.stage}
          </span>
        </div>
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
      </header>

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
        <SpecEditor abortRef={abortRef} />
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
function SpecEditor({ abortRef }: { abortRef: React.MutableRefObject<AbortController | null> }) {
  const { state, actions } = useEventEditor()
  const spec = state.fixIt.spec
  const [applying, setApplying] = useState(false)

  const apply = useCallback(async () => {
    if (!spec || applying) return
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
        signal: controller.signal,
      })) {
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
            ...(ev.result.commit ? { commit: ev.result.commit } : {}),
            ...(ev.result.critic ? { critic: ev.result.critic } : {}),
          })
        } else if (ev.type === 'error') {
          actions.setFixItStage('failed', ev.message)
          actions.setFixItApplyStage(null)
        }
      }
    } catch (err) {
      // Aborts surface as DOMException with name 'AbortError'. Treat them
      // as a clean return-to-spec — the server rolls back its working tree
      // when the connection closes, so the user can edit and retry.
      const wasAbort = controller.signal.aborted
        || (err instanceof DOMException && err.name === 'AbortError')
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
  }, [abortRef, actions, applying, spec])

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
