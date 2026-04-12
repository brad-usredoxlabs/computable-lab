/**
 * CompactStreamIndicator — A compact, collapsed spinner that shows minimal info while streaming.
 *
 * Shows a single-line spinner with turn number and tool name.
 * User can expand to see the full StreamLog details.
 */

import { useState } from 'react'
import { StreamLog } from './StreamLog'
import type { AiStreamEvent } from '../../types/ai'

interface CompactStreamIndicatorProps {
  events: AiStreamEvent[]
  isStreaming: boolean
}

export function CompactStreamIndicator({ events, isStreaming }: CompactStreamIndicatorProps) {
  const [expanded, setExpanded] = useState(false)
  if (events.length === 0) return null

  const turnLabel = lastTurnLabel(events)       // e.g. "Turn 3" or ""
  const toolLabel = lastToolLabel(events)       // e.g. "search_records" or ""

  if (!isStreaming && !expanded) {
    return (
      <div className="stream-compact stream-compact--done">
        <button
          type="button"
          className="stream-compact__toggle"
          onClick={() => setExpanded(true)}
        >
          Show trace ({events.length} events)
        </button>
        <CompactStreamStyles />
      </div>
    )
  }

  if (!isStreaming && expanded) {
    return (
      <>
        <button type="button" className="stream-compact__toggle" onClick={() => setExpanded(false)}>
          Hide trace
        </button>
        <StreamLog events={events} isStreaming={false} />
        <CompactStreamStyles />
      </>
    )
  }

  // isStreaming === true
  return (
    <div className="stream-compact">
      <span className="stream-compact__spinner" aria-hidden />
      <span className="stream-compact__turn">{turnLabel}</span>
      {toolLabel && <span className="stream-compact__tool">· {toolLabel}</span>}
      <button
        type="button"
        className="stream-compact__toggle"
        onClick={() => setExpanded((v) => !v)}
      >
        {expanded ? 'Hide details' : 'Show details'}
      </button>
      {expanded && <StreamLog events={events} isStreaming={true} />}
      <CompactStreamStyles />
    </div>
  )
}

function lastTurnLabel(events: AiStreamEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev && ev.type === 'status') {
      const match = /^Turn\s+(\d+)/i.exec(ev.message)
      if (match) return `Turn ${match[1]}`
    }
  }
  return ''
}

function lastToolLabel(events: AiStreamEvent[]): string {
  for (let i = events.length - 1; i >= 0; i--) {
    const ev = events[i]
    if (ev && (ev.type === 'tool_call' || ev.type === 'tool_result')) {
      return ev.toolName
    }
  }
  return ''
}

function CompactStreamStyles() {
  return (
    <style>{`
      .stream-compact {
        display: flex;
        align-items: center;
        gap: 6px;
        padding: 4px 0;
        font-size: 0.75rem;
        color: #64748b;
        line-height: 1.4;
      }
      .stream-compact__spinner {
        width: 12px;
        height: 12px;
        border: 2px solid #e2e8f0;
        border-top-color: #7c3aed;
        border-radius: 50%;
        animation: stream-compact-spin 0.8s linear infinite;
      }
      @keyframes stream-compact-spin {
        to { transform: rotate(360deg); }
      }
      .stream-compact__turn { font-weight: 600; color: #475569; }
      .stream-compact__tool { color: #64748b; font-family: ui-monospace, monospace; }
      .stream-compact__toggle {
        margin-left: auto;
        background: transparent;
        border: none;
        color: #7c3aed;
        font-size: 0.7rem;
        cursor: pointer;
        padding: 0;
      }
      .stream-compact__toggle:hover { text-decoration: underline; }
      .stream-compact--done {
        justify-content: flex-start;
      }
    `}</style>
  )
}
