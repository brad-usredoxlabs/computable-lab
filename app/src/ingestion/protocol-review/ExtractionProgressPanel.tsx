/**
 * ExtractionProgressPanel — a long extraction has to LOOK alive.
 *
 * The complaint this answers: the review tab showed "Extracting…" for minutes
 * with no way to tell a working run from a dead one. This panel shows the
 * server's own stage line, an elapsed clock, how long ago the last event
 * arrived (an idle model is normal — a silent SERVER is not), and the model's
 * reasoning as it streams in. The model it talks to is a deployment setting
 * (settings → AI), not a per-extraction choice, so this panel carries no model
 * or thinking control:
 * how hard the model thinks is a per-extraction choice, not a global setting.
 */
import { useEffect, useRef } from 'react'

export interface ExtractionLogLine {
  kind: 'reasoning' | 'note'
  text: string
}

export interface ExtractionProgressPanelProps {
  running: boolean
  /** The server's current stage sentence, e.g. "Extracting chunk 1 of 3 (…)"; */
  stage: string | null
  /** Streamed model reasoning + stage notes, oldest first. */
  log: ExtractionLogLine[]
  /** Server-reported elapsed time for the run (ms). */
  elapsedMs: number
  /** Milliseconds since the last event arrived (liveness; null = none yet). */
  sinceLastEventMs: number | null
  canStart: boolean
  onStart: () => void
  onCancel: () => void
  error: string | null
  note: string | null
}

const IDLE_WARN_MS = 20_000
const MAX_LOG_LINES = 400

function seconds(ms: number | null): string {
  if (ms === null) return '—'
  return `${Math.round(ms / 1000)}s`
}

export default function ExtractionProgressPanel({
  running,
  stage,
  log,
  elapsedMs,
  sinceLastEventMs,
  canStart,
  onStart,
  onCancel,
  error,
  note,
}: ExtractionProgressPanelProps) {
  const logRef = useRef<HTMLPreElement | null>(null)

  // Follow the stream: the newest reasoning line is the interesting one.
  useEffect(() => {
    const el = logRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [log])

  const idle = running && sinceLastEventMs !== null && sinceLastEventMs > IDLE_WARN_MS
  const shown = log.slice(-MAX_LOG_LINES)

  return (
    <section className="vpdf-review__extract-panel" data-testid="extraction-panel">
      <div className="vpdf-review__extract-controls">
        {running ? (
          <button type="button" className="vpdf-review__extract" onClick={onCancel} data-testid="vpdf-extract-cancel">
            Cancel extraction
          </button>
        ) : (
          <button
            type="button"
            className="vpdf-review__extract"
            onClick={onStart}
            disabled={!canStart}
            data-testid="vpdf-extract"
          >
            Extract Protocol (AI)
          </button>
        )}
      </div>

      {running || log.length > 0 ? (
        <div className="vpdf-review__extract-status" data-testid="extraction-status">
          <p className={`vpdf-review__hint${idle ? ' vpdf-review__hint--idle' : ''}`}>
            {stage ? (running ? stage : `Last stage: ${stage}`) : 'Starting…'}
            {running ? ` · ${seconds(elapsedMs)} elapsed` : ''}
            {running ? ` · last event ${seconds(sinceLastEventMs)} ago` : ''}
            {idle ? ' — the model has been quiet for a while; still connected' : ''}
          </p>
          {shown.length > 0 ? (
            <details className="vpdf-review__reasoning" open={running} data-testid="extraction-reasoning">
              <summary>{running ? 'Model reasoning (live)' : 'Model reasoning'}</summary>
              <pre ref={logRef} className="vpdf-review__reasoning-log">
                {shown
                  .map((line) => (line.kind === 'note' ? `— ${line.text}` : line.text))
                  .join('')}
              </pre>
            </details>
          ) : null}
        </div>
      ) : null}

      {note ? (
        <p className="vpdf-review__hint" data-testid="extraction-note">
          {note}
        </p>
      ) : null}
      {error ? (
        <p className="vpdf-review__error" role="alert" data-testid="extraction-error">
          {error}
        </p>
      ) : null}
    </section>
  )
}