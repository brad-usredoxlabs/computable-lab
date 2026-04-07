/**
 * StreamLog — Full real-time rendering of SSE stream events.
 *
 * Replaces the compact StreamProgress summary with a detailed log
 * showing tool names + args, full results, thinking text, and status lines.
 * Auto-scrolls as events arrive and remains visible after streaming completes.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import type { AiStreamEvent } from '../../types/ai'

interface StreamLogProps {
  events: AiStreamEvent[]
  isStreaming: boolean
}

export function StreamLog({ events, isStreaming }: StreamLogProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const [copied, setCopied] = useState(false)

  // Auto-scroll to bottom as new events arrive
  useEffect(() => {
    const el = containerRef.current
    if (!el) return
    el.scrollTop = el.scrollHeight
  }, [events.length])

  const copyLog = useCallback(() => {
    const text = events
      .map((ev) => formatEventAsText(ev))
      .filter(Boolean)
      .join('\n')
    navigator.clipboard.writeText(text).then(() => {
      setCopied(true)
      setTimeout(() => setCopied(false), 2000)
    })
  }, [events])

  if (events.length === 0) return null

  return (
    <div className="stream-log">
      <div className="stream-log__header">
        <span className="stream-log__title">
          {isStreaming && <span className="stream-log__dot" />}
          {isStreaming ? 'Streaming...' : `${events.length} events`}
        </span>
        <button
          type="button"
          className="stream-log__copy"
          onClick={copyLog}
          title="Copy log as text"
        >
          {copied ? 'Copied!' : 'Copy log'}
        </button>
      </div>

      <div ref={containerRef} className="stream-log__entries">
        {events.map((ev, i) => (
          <StreamLogEntry key={i} event={ev} />
        ))}
      </div>

      <style>{`
        .stream-log {
          margin-top: 0.5rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #fafbfc;
          overflow: hidden;
        }

        .stream-log__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.35rem 0.65rem;
          background: #f1f5f9;
          border-bottom: 1px solid #e2e8f0;
          font-size: 0.72rem;
          color: #64748b;
        }

        .stream-log__title {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          font-weight: 600;
        }

        .stream-log__dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #339af0;
          animation: stream-log-pulse 1s infinite;
        }

        @keyframes stream-log-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .stream-log__copy {
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          background: white;
          color: #64748b;
          font-size: 0.68rem;
          padding: 2px 8px;
          cursor: pointer;
        }

        .stream-log__copy:hover {
          border-color: #94a3b8;
          color: #334155;
        }

        .stream-log__entries {
          overflow-y: auto;
          padding: 0.35rem 0;
        }

        .stream-log-entry {
          padding: 0.25rem 0.65rem;
          font-size: 0.78rem;
          line-height: 1.45;
        }

        .stream-log-entry + .stream-log-entry {
          border-top: 1px solid #f1f5f9;
        }

        .stream-log-entry__badge {
          display: inline-block;
          padding: 1px 6px;
          border-radius: 3px;
          font-size: 0.65rem;
          font-weight: 700;
          margin-right: 0.35rem;
          vertical-align: middle;
        }

        .stream-log-entry__badge--status { background: #dbeafe; color: #1d4ed8; }
        .stream-log-entry__badge--tool { background: #fef3c7; color: #92400e; }
        .stream-log-entry__badge--result { background: #d1fae5; color: #065f46; }
        .stream-log-entry__badge--thinking { background: #f3e8ff; color: #7e22ce; }
        .stream-log-entry__badge--draft { background: #dcfce7; color: #166534; }
        .stream-log-entry__badge--error { background: #fee2e2; color: #991b1b; }
        .stream-log-entry__badge--done { background: #e0f2fe; color: #075985; }

        .stream-log-entry__text {
          color: #334155;
        }

        .stream-log-entry__text--error {
          color: #dc2626;
        }

        .stream-log-entry__text--thinking {
          color: #7c3aed;
          font-style: italic;
        }

        .stream-log-entry__collapsible {
          margin-top: 0.2rem;
        }

        .stream-log-entry__toggle {
          border: none;
          background: none;
          color: #64748b;
          font-size: 0.68rem;
          cursor: pointer;
          padding: 0;
          text-decoration: underline;
        }

        .stream-log-entry__toggle:hover {
          color: #334155;
        }

        .stream-log-entry__json {
          margin-top: 0.2rem;
          background: #f8fafc;
          border: 1px solid #e2e8f0;
          border-radius: 4px;
          padding: 0.4rem 0.5rem;
          font-family: 'SF Mono', 'Fira Code', monospace;
          font-size: 0.72rem;
          color: #334155;
          white-space: pre-wrap;
          word-break: break-all;
          max-height: 200px;
          overflow-y: auto;
        }
      `}</style>
    </div>
  )
}

function StreamLogEntry({ event }: { event: AiStreamEvent }) {
  const [expanded, setExpanded] = useState(false)

  switch (event.type) {
    case 'status':
      return (
        <div className="stream-log-entry">
          <span className="stream-log-entry__badge stream-log-entry__badge--status">status</span>
          <span className="stream-log-entry__text">{event.message}</span>
        </div>
      )

    case 'tool_call':
      return (
        <div className="stream-log-entry">
          <span className="stream-log-entry__badge stream-log-entry__badge--tool">tool</span>
          <span className="stream-log-entry__text">{event.toolName}</span>
          {event.args && Object.keys(event.args).length > 0 && (
            <div className="stream-log-entry__collapsible">
              <button
                type="button"
                className="stream-log-entry__toggle"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'hide args' : 'show args'}
              </button>
              {expanded && (
                <pre className="stream-log-entry__json">
                  {JSON.stringify(event.args, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )

    case 'tool_result':
      return (
        <div className="stream-log-entry">
          <span className="stream-log-entry__badge stream-log-entry__badge--result">result</span>
          <span className="stream-log-entry__text">{event.toolName}</span>
          {event.result != null && (
            <div className="stream-log-entry__collapsible">
              <button
                type="button"
                className="stream-log-entry__toggle"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'hide result' : 'show result'}
              </button>
              {expanded && (
                <pre className="stream-log-entry__json">
                  {typeof event.result === 'string'
                    ? event.result
                    : JSON.stringify(event.result, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )

    case 'thinking':
      return (
        <div className="stream-log-entry">
          <span className="stream-log-entry__badge stream-log-entry__badge--thinking">think</span>
          {event.text.length > 120 ? (
            <>
              <span className="stream-log-entry__text stream-log-entry__text--thinking">
                {expanded ? event.text : `${event.text.slice(0, 120)}...`}
              </span>
              <div className="stream-log-entry__collapsible">
                <button
                  type="button"
                  className="stream-log-entry__toggle"
                  onClick={() => setExpanded(!expanded)}
                >
                  {expanded ? 'collapse' : 'expand'}
                </button>
              </div>
            </>
          ) : (
            <span className="stream-log-entry__text stream-log-entry__text--thinking">{event.text}</span>
          )}
        </div>
      )

    case 'draft':
      return (
        <div className="stream-log-entry">
          <span className="stream-log-entry__badge stream-log-entry__badge--draft">draft</span>
          <span className="stream-log-entry__text">
            {event.events.length} event{event.events.length !== 1 ? 's' : ''}
            {event.notes?.length ? ` — ${event.notes.join('; ')}` : ''}
          </span>
          {event.events.length > 0 && (
            <div className="stream-log-entry__collapsible">
              <button
                type="button"
                className="stream-log-entry__toggle"
                onClick={() => setExpanded(!expanded)}
              >
                {expanded ? 'hide events' : 'show events'}
              </button>
              {expanded && (
                <pre className="stream-log-entry__json">
                  {JSON.stringify(event.events, null, 2)}
                </pre>
              )}
            </div>
          )}
        </div>
      )

    case 'error':
      return (
        <div className="stream-log-entry">
          <span className="stream-log-entry__badge stream-log-entry__badge--error">error</span>
          <span className="stream-log-entry__text stream-log-entry__text--error">{event.message}</span>
        </div>
      )

    case 'done':
      return (
        <div className="stream-log-entry">
          <span className="stream-log-entry__badge stream-log-entry__badge--done">done</span>
          <span className="stream-log-entry__text">
            {(event.result.events ?? []).length} event{(event.result.events ?? []).length !== 1 ? 's' : ''}
            {event.result.usage
              ? ` — ${event.result.usage.totalTokens ?? 0} tokens`
              : ''}
          </span>
        </div>
      )

    default:
      return null
  }
}

function formatEventAsText(event: AiStreamEvent): string {
  switch (event.type) {
    case 'status':
      return `[status] ${event.message}`
    case 'tool_call':
      return `[tool] ${event.toolName}${event.args ? ' ' + JSON.stringify(event.args) : ''}`
    case 'tool_result':
      return `[result] ${event.toolName}${event.result != null ? ' ' + (typeof event.result === 'string' ? event.result : JSON.stringify(event.result)) : ''}`
    case 'thinking':
      return `[thinking] ${event.text}`
    case 'draft':
      return `[draft] ${event.events.length} events`
    case 'error':
      return `[error] ${event.message}`
    case 'done':
      return `[done] ${(event.result.events ?? []).length} events`
    default:
      return ''
  }
}
