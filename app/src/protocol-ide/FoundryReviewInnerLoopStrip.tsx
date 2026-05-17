import { useCallback, useState } from 'react'
import {
  apiClient,
  type FoundryInnerLoopDiffEntry,
  type FoundryInnerLoopEvent,
  type FoundryInnerLoopTrace,
} from '../shared/api/client'

export interface FoundryReviewInnerLoopStripProps {
  protocolId: string
  variant: string
  onTraceCompleted?: (trace: FoundryInnerLoopTrace) => void
  onPromoted?: () => void
  onHighlightEvent?: (key: string) => void
}

const STAGE_LABELS: Record<string, string> = {
  snapshotting: 'Snapshotting prior graph…',
  synthesizing: 'Synthesizing draft spec…',
  applying: 'Applying coder patch…',
  recompiling: 'Recompiling variant…',
  diffing: 'Diffing event graph…',
}

function diffRow(entry: FoundryInnerLoopDiffEntry, kind: 'added' | 'removed' | 'changed', onClick?: (key: string) => void): JSX.Element {
  const label = entry.semanticKey ?? entry.eventId ?? entry.key
  return (
    <li
      key={`${kind}:${entry.key}`}
      className={`foundry-inner-loop-diff__row foundry-inner-loop-diff__row--${kind}`}
      data-testid={`foundry-inner-loop-diff-${kind}-${entry.key}`}
    >
      <button
        type="button"
        onClick={() => onClick?.(entry.key)}
        title={entry.eventType ? `${entry.eventType} — ${label}` : label}
      >
        {entry.eventType && <span className="foundry-inner-loop-diff__type">{entry.eventType}</span>}
        <span>{label}</span>
      </button>
    </li>
  )
}

export function FoundryReviewInnerLoopStrip({
  protocolId,
  variant,
  onTraceCompleted,
  onPromoted,
  onHighlightEvent,
}: FoundryReviewInnerLoopStripProps): JSX.Element {
  const [prompt, setPrompt] = useState('')
  const [isRunning, setIsRunning] = useState(false)
  const [isPromoting, setIsPromoting] = useState(false)
  const [stage, setStage] = useState<string | null>(null)
  const [stageMessage, setStageMessage] = useState<string | null>(null)
  const [trace, setTrace] = useState<FoundryInnerLoopTrace | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [runCritic, setRunCritic] = useState(false)

  const handleRun = useCallback(async () => {
    const value = prompt.trim()
    if (!value || isRunning) return
    setIsRunning(true)
    setStage(null)
    setStageMessage(null)
    setTrace(null)
    setError(null)
    try {
      let finalTrace: FoundryInnerLoopTrace | null = null
      const stream = apiClient.streamFoundryInnerLoop(protocolId, variant, value, { runCritic })
      for await (const event of stream as AsyncGenerator<FoundryInnerLoopEvent>) {
        if (event.type === 'status') {
          setStage(event.stage)
          setStageMessage(event.message ?? null)
        } else if (event.type === 'done') {
          finalTrace = event.trace
        } else if (event.type === 'error') {
          setError(event.message)
        }
      }
      if (finalTrace) {
        setTrace(finalTrace)
        onTraceCompleted?.(finalTrace)
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsRunning(false)
      setStage(null)
      setStageMessage(null)
    }
  }, [prompt, isRunning, runCritic, protocolId, variant, onTraceCompleted])

  const handlePromote = useCallback(async () => {
    if (!trace?.draftSpec.id || isPromoting) return
    setIsPromoting(true)
    setError(null)
    try {
      await apiClient.promoteFoundryDraftSpec(protocolId, variant, trace.draftSpec.id)
      onPromoted?.()
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err))
    } finally {
      setIsPromoting(false)
    }
  }, [trace, isPromoting, protocolId, variant, onPromoted])

  const diff = trace?.diff
  const hasDiff = Boolean(diff && (diff.added.length || diff.removed.length || diff.changed.length))

  return (
    <section
      className="foundry-inner-loop"
      data-testid="foundry-review-inner-loop"
      aria-label="Inner loop"
    >
      <header className="foundry-inner-loop__header">
        <strong>Inner loop</strong>
        <span className="foundry-inner-loop__hint">
          Prompt → draft spec → coder → recompile → diff. Drafts stay in
          drafts/ until you promote them to the queue.
        </span>
      </header>

      <form
        className="foundry-inner-loop__composer"
        onSubmit={(e) => {
          e.preventDefault()
          void handleRun()
        }}
      >
        <textarea
          data-testid="foundry-inner-loop-prompt"
          aria-label="Inner-loop prompt"
          rows={2}
          placeholder="Describe the fix you want the compiler to attempt…"
          value={prompt}
          disabled={isRunning}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
              e.preventDefault()
              void handleRun()
            }
          }}
        />
        <div className="foundry-inner-loop__controls">
          <label className="foundry-inner-loop__critic">
            <input
              type="checkbox"
              data-testid="foundry-inner-loop-critic-toggle"
              checked={runCritic}
              disabled={isRunning}
              onChange={(e) => setRunCritic(e.target.checked)}
            />
            Run critic (slower)
          </label>
          <button
            type="submit"
            data-testid="foundry-inner-loop-run"
            disabled={isRunning || prompt.trim().length === 0}
          >
            {isRunning ? 'Running…' : 'Run loop'}
          </button>
        </div>
      </form>

      {!runCritic && (
        <p className="foundry-inner-loop__banner" data-testid="foundry-inner-loop-no-critic">
          Critic not run — the diff below is unvalidated. Enable the critic
          toggle to gate iteration on a critic pass.
        </p>
      )}

      {isRunning && (
        <div className="foundry-inner-loop__status" data-testid="foundry-inner-loop-status">
          <span className="foundry-inner-loop__spinner" />
          <span>
            {stage ? (STAGE_LABELS[stage] ?? stage) : 'Starting…'}
            {stageMessage ? ` — ${stageMessage}` : ''}
          </span>
        </div>
      )}

      {error && (
        <p className="foundry-inner-loop__error" data-testid="foundry-inner-loop-error">
          {error}
        </p>
      )}

      {trace && (
        <div className="foundry-inner-loop__result" data-testid="foundry-inner-loop-result">
          <div className="foundry-inner-loop__result-row">
            <span>
              Trace <code>{trace.id}</code> · status {trace.status}
              {trace.coder?.status ? ` · coder ${trace.coder.status}` : ''}
              {trace.recompile?.outcome ? ` · recompile ${trace.recompile.outcome}` : ''}
            </span>
            <button
              type="button"
              data-testid="foundry-inner-loop-promote"
              disabled={isPromoting || trace.status !== 'completed'}
              onClick={() => void handlePromote()}
              title="Promote this draft to the executable Foundry queue"
            >
              {isPromoting ? 'Promoting…' : 'Promote to queue'}
            </button>
          </div>

          {trace.error && (
            <p className="foundry-inner-loop__error" data-testid="foundry-inner-loop-trace-error">
              {trace.error}
            </p>
          )}

          {hasDiff ? (
            <div className="foundry-inner-loop-diff" data-testid="foundry-inner-loop-diff">
              <div className="foundry-inner-loop-diff__column">
                <h4>Added ({diff!.added.length})</h4>
                <ul>{diff!.added.map((e) => diffRow(e, 'added', onHighlightEvent))}</ul>
              </div>
              <div className="foundry-inner-loop-diff__column">
                <h4>Removed ({diff!.removed.length})</h4>
                <ul>{diff!.removed.map((e) => diffRow(e, 'removed', onHighlightEvent))}</ul>
              </div>
              <div className="foundry-inner-loop-diff__column">
                <h4>Changed ({diff!.changed.length})</h4>
                <ul>{diff!.changed.map((e) => diffRow(e, 'changed', onHighlightEvent))}</ul>
              </div>
            </div>
          ) : (
            <p className="foundry-inner-loop__muted">
              No event-graph deltas detected for this run.
            </p>
          )}
        </div>
      )}

      <style>{`
        .foundry-inner-loop {
          background: #fff;
          border: 1px solid #dde5ef;
          border-radius: 8px;
          padding: 0.75rem 0.85rem;
          display: flex;
          flex-direction: column;
          gap: 0.55rem;
        }
        .foundry-inner-loop__header {
          display: flex;
          align-items: baseline;
          justify-content: space-between;
          gap: 0.75rem;
        }
        .foundry-inner-loop__header strong {
          font-size: 0.9rem;
          color: #0f172a;
        }
        .foundry-inner-loop__hint {
          font-size: 0.72rem;
          color: #64748b;
        }
        .foundry-inner-loop__composer {
          display: flex;
          flex-direction: column;
          gap: 0.4rem;
        }
        .foundry-inner-loop__composer textarea {
          width: 100%;
          padding: 0.45rem 0.55rem;
          font: inherit;
          font-size: 0.82rem;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          resize: vertical;
        }
        .foundry-inner-loop__controls {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          justify-content: space-between;
        }
        .foundry-inner-loop__critic {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.78rem;
          color: #334155;
        }
        .foundry-inner-loop__controls button {
          padding: 0.4rem 0.85rem;
          border-radius: 6px;
          border: 1px solid #1d4ed8;
          background: #1d4ed8;
          color: #fff;
          font-weight: 600;
          font-size: 0.82rem;
          cursor: pointer;
        }
        .foundry-inner-loop__controls button[disabled] {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .foundry-inner-loop__banner {
          margin: 0;
          padding: 0.4rem 0.55rem;
          border-radius: 6px;
          background: #fef3c7;
          border: 1px solid #fde68a;
          color: #92400e;
          font-size: 0.75rem;
        }
        .foundry-inner-loop__status {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          font-size: 0.78rem;
          color: #475569;
        }
        .foundry-inner-loop__spinner {
          display: inline-block;
          width: 0.7rem;
          height: 0.7rem;
          border: 2px solid #cbd5e1;
          border-top-color: #1d4ed8;
          border-radius: 50%;
          animation: foundry-inner-loop-spin 1s linear infinite;
        }
        @keyframes foundry-inner-loop-spin {
          to { transform: rotate(360deg); }
        }
        .foundry-inner-loop__error {
          margin: 0;
          color: #b42318;
          font-size: 0.78rem;
        }
        .foundry-inner-loop__result {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.55rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 6px;
        }
        .foundry-inner-loop__result-row {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.75rem;
          font-size: 0.78rem;
          color: #1e293b;
        }
        .foundry-inner-loop__result-row code {
          font-size: 0.72rem;
          background: #fff;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          padding: 0.05rem 0.3rem;
        }
        .foundry-inner-loop__result-row button {
          padding: 0.3rem 0.65rem;
          border-radius: 6px;
          border: 1px solid #166534;
          background: #16a34a;
          color: #fff;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
        }
        .foundry-inner-loop__result-row button[disabled] {
          opacity: 0.5;
          cursor: not-allowed;
        }
        .foundry-inner-loop__muted {
          margin: 0;
          font-size: 0.75rem;
          color: #64748b;
        }
        .foundry-inner-loop-diff {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 0.5rem;
        }
        .foundry-inner-loop-diff__column h4 {
          margin: 0 0 0.25rem;
          font-size: 0.75rem;
          color: #334155;
        }
        .foundry-inner-loop-diff__column ul {
          list-style: none;
          margin: 0;
          padding: 0;
          display: flex;
          flex-direction: column;
          gap: 0.2rem;
        }
        .foundry-inner-loop-diff__row button {
          width: 100%;
          text-align: left;
          background: #fff;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.25rem 0.4rem;
          font-size: 0.72rem;
          cursor: pointer;
          display: inline-flex;
          gap: 0.4rem;
          align-items: center;
        }
        .foundry-inner-loop-diff__row--added button   { border-color: #bbf7d0; background: #f0fdf4; color: #166534; }
        .foundry-inner-loop-diff__row--removed button { border-color: #fecaca; background: #fef2f2; color: #991b1b; }
        .foundry-inner-loop-diff__row--changed button { border-color: #fde68a; background: #fffbeb; color: #92400e; }
        .foundry-inner-loop-diff__type {
          font-family: ui-monospace, SFMono-Regular, Menlo, monospace;
          font-size: 0.65rem;
          background: rgba(0,0,0,0.05);
          border-radius: 3px;
          padding: 0.05rem 0.25rem;
        }
      `}</style>
    </section>
  )
}
