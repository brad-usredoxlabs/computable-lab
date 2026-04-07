/**
 * StreamProgress — Compact rendering of SSE stream events.
 *
 * Shows status text, tool call badges, and thinking sections.
 * Collapsed after streaming completes, expandable.
 */

import { useState } from 'react'
import type { AiStreamEvent } from '../../types/ai'

interface StreamProgressProps {
  events: AiStreamEvent[]
  isStreaming: boolean
}

export function StreamProgress({ events, isStreaming }: StreamProgressProps) {
  const [expanded, setExpanded] = useState(isStreaming)

  if (events.length === 0) return null

  // Summarise: count tool calls, statuses, etc.
  const toolCalls = events.filter((e) => e.type === 'tool_call')
  const statuses = events.filter((e) => e.type === 'status')
  const lastStatus = statuses[statuses.length - 1]

  const showDetails = isStreaming || expanded

  return (
    <div className="stream-progress">
      <button
        className="stream-progress__toggle"
        onClick={() => setExpanded(!expanded)}
      >
        <span className="stream-progress__summary">
          {isStreaming && <span className="stream-progress__dot" />}
          {lastStatus
            ? (lastStatus as { message: string }).message
            : toolCalls.length > 0
              ? `${toolCalls.length} tool call${toolCalls.length !== 1 ? 's' : ''}`
              : 'Processing...'}
        </span>
        {!isStreaming && (
          <span className="stream-progress__expand">{expanded ? '\u25B2' : '\u25BC'}</span>
        )}
      </button>

      {showDetails && (
        <div className="stream-progress__details">
          {events.map((ev, i) => (
            <StreamEventRow key={i} event={ev} />
          ))}
        </div>
      )}

      <style>{`
        .stream-progress {
          margin-top: 0.25rem;
          font-size: 0.75rem;
        }

        .stream-progress__toggle {
          display: flex;
          align-items: center;
          gap: 0.375rem;
          background: none;
          border: none;
          padding: 0.25rem 0;
          cursor: pointer;
          color: #868e96;
          font-size: 0.75rem;
          width: 100%;
          text-align: left;
        }

        .stream-progress__toggle:hover {
          color: #495057;
        }

        .stream-progress__dot {
          display: inline-block;
          width: 6px;
          height: 6px;
          border-radius: 50%;
          background: #339af0;
          animation: stream-pulse 1s infinite;
        }

        @keyframes stream-pulse {
          0%, 100% { opacity: 1; }
          50% { opacity: 0.3; }
        }

        .stream-progress__summary {
          flex: 1;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        .stream-progress__expand {
          font-size: 0.65rem;
          flex-shrink: 0;
        }

        .stream-progress__details {
          border-left: 2px solid #e9ecef;
          margin-left: 0.25rem;
          padding-left: 0.5rem;
          margin-top: 0.25rem;
          overflow-y: auto;
        }

        .stream-event-row {
          padding: 0.125rem 0;
          display: flex;
          align-items: baseline;
          gap: 0.375rem;
        }

        .stream-event-row__badge {
          display: inline-block;
          padding: 0.0625rem 0.25rem;
          border-radius: 3px;
          font-size: 0.65rem;
          font-weight: 600;
          flex-shrink: 0;
        }

        .stream-event-row__badge--status { background: #d0ebff; color: #1971c2; }
        .stream-event-row__badge--tool { background: #fff3bf; color: #e67700; }
        .stream-event-row__badge--thinking { background: #f3d9fa; color: #9c36b5; }
        .stream-event-row__badge--draft { background: #d3f9d8; color: #2b8a3e; }
        .stream-event-row__badge--error { background: #ffe3e3; color: #c92a2a; }

        .stream-event-row__text {
          color: #495057;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }
      `}</style>
    </div>
  )
}

function StreamEventRow({ event }: { event: AiStreamEvent }) {
  switch (event.type) {
    case 'status':
      return (
        <div className="stream-event-row">
          <span className="stream-event-row__badge stream-event-row__badge--status">status</span>
          <span className="stream-event-row__text">{event.message}</span>
        </div>
      )
    case 'tool_call':
      return (
        <div className="stream-event-row">
          <span className="stream-event-row__badge stream-event-row__badge--tool">tool</span>
          <span className="stream-event-row__text">{event.toolName}</span>
        </div>
      )
    case 'tool_result':
      return (
        <div className="stream-event-row">
          <span className="stream-event-row__badge stream-event-row__badge--tool">result</span>
          <span className="stream-event-row__text">{event.toolName}</span>
        </div>
      )
    case 'thinking':
      return (
        <div className="stream-event-row">
          <span className="stream-event-row__badge stream-event-row__badge--thinking">think</span>
          <span className="stream-event-row__text">{event.text.slice(0, 100)}</span>
        </div>
      )
    case 'draft':
      return (
        <div className="stream-event-row">
          <span className="stream-event-row__badge stream-event-row__badge--draft">draft</span>
          <span className="stream-event-row__text">
            {event.events.length} event{event.events.length !== 1 ? 's' : ''}
          </span>
        </div>
      )
    case 'error':
      return (
        <div className="stream-event-row">
          <span className="stream-event-row__badge stream-event-row__badge--error">error</span>
          <span className="stream-event-row__text">{event.message}</span>
        </div>
      )
    case 'done':
      return null
    default:
      return null
  }
}
