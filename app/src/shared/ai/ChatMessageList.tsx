/**
 * ChatMessageList — Scrollable message history with auto-scroll.
 *
 * Messages are left-aligned with You/AI labels, centered in a ~900px column.
 * System messages: centered gray text.
 * StreamLog uses full panel width (no max-width).
 */

import { useEffect, useRef, useState } from 'react'
import { CompactStreamIndicator } from './CompactStreamIndicator'
import { AttachmentChip } from './AttachmentChip'
import { ImageLightbox } from './ImageLightbox'
import { isImageFile } from '../../types/aiContext'
import type { ChatMessage } from '../../types/ai'

interface ChatMessageListProps {
  messages: ChatMessage[]
  onPickClarification?: (
    entityType: string,
    optionId: string,
    optionLabel: string,
  ) => void
  onApplyToGraph?: (message: ChatMessage) => void
}

export function ChatMessageList({ messages, onPickClarification, onApplyToGraph }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    const bottomEl = bottomRef.current
    if (typeof bottomEl?.scrollIntoView === 'function') {
      bottomEl.scrollIntoView({ behavior: 'auto' })
    }
  }, [messages])

  if (messages.length === 0) {
    return (
      <div className="chat-messages chat-messages--empty">
        <p className="chat-messages__placeholder">
          Describe the events you want to create.
        </p>
        <p className="chat-messages__hint">
          e.g. "Add 10 uL of DMSO to wells A1-A6"
        </p>
        <ChatMessageStyles />
      </div>
    )
  }

  return (
    <div className="chat-messages">
      {messages.map((msg) => (
        <MessageBubble
          key={msg.id}
          message={msg}
          onPickClarification={onPickClarification}
          onApplyToGraph={onApplyToGraph}
        />
      ))}
      <div ref={bottomRef} />
      <ChatMessageStyles />
    </div>
  )
}

function ChatMessageStyles() {
  return (
    <style>{`
        .chat-messages {
          flex: 1;
          overflow-y: auto;
          padding: 0.75rem;
          display: flex;
          flex-direction: column;
          gap: 0;
        }

        .chat-messages--empty {
          align-items: center;
          justify-content: center;
        }

        .chat-messages__placeholder {
          color: #868e96;
          font-size: 0.85rem;
          text-align: center;
          margin: 0;
        }

        .chat-messages__hint {
          color: #adb5bd;
          font-size: 0.75rem;
          font-style: italic;
          text-align: center;
          margin: 0.25rem 0 0;
        }

        .chat-msg {
          padding: 0.75rem 1rem;
          font-size: 0.85rem;
          line-height: 1.5;
          word-break: break-word;
          white-space: pre-wrap;
        }

        .chat-msg--user {
          background: #f8f9fa;
        }

        .chat-msg--assistant {
          background: #ffffff;
        }

        .chat-msg--system {
          background: transparent;
          text-align: center;
          color: #868e96;
          font-size: 0.75rem;
          font-style: italic;
          padding: 0.35rem 1rem;
        }

        .chat-msg__inner {
          max-width: 900px;
          margin: 0 auto;
        }

        .chat-msg__label {
          display: block;
          font-size: 0.7rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.04em;
          margin-bottom: 0.25rem;
          color: #64748b;
        }

        .chat-msg__label--user {
          color: #2563eb;
        }

        .chat-msg__label--ai {
          color: #7c3aed;
        }

        .chat-msg__content {
          margin: 0;
          color: #1e293b;
        }

        .chat-msg__event-count {
          margin-top: 0.375rem;
          padding-top: 0.375rem;
          border-top: 1px solid #e2e8f0;
          font-size: 0.75rem;
          color: #495057;
          font-weight: 600;
        }

        .chat-msg__scale-plan {
          margin-top: 0.45rem;
          padding: 0.45rem 0.55rem;
          border: 1px solid #cbd5e1;
          border-radius: 6px;
          background: #f8fafc;
          color: #334155;
          font-size: 0.74rem;
          line-height: 1.35;
        }

        .chat-msg__scale-plan-title {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 0.5rem;
          font-weight: 700;
        }

        .chat-msg__scale-plan-status {
          text-transform: uppercase;
          font-size: 0.66rem;
          letter-spacing: 0.04em;
          color: #475569;
        }

        .chat-msg__scale-plan-detail {
          margin-top: 0.2rem;
          color: #64748b;
        }

        .chat-msg__actions {
          margin-top: 0.5rem;
          display: flex;
          gap: 0.4rem;
        }

        .chat-msg__apply-btn {
          font-size: 0.75rem;
          font-weight: 600;
          padding: 0.3rem 0.7rem;
          border-radius: 999px;
          border: 1px solid #c7d2fe;
          background: #eef2ff;
          color: #3730a3;
          cursor: pointer;
        }

        .chat-msg__apply-btn:hover {
          background: #e0e7ff;
          border-color: #a5b4fc;
        }

        .chat-msg__stream-log {
          max-width: none;
          margin: 0.5rem -1rem 0;
          padding: 0 1rem;
        }

        .chat-msg__running {
          margin-top: 0.5rem;
          display: flex;
          align-items: center;
          gap: 0.55rem;
          padding: 0.55rem 0.7rem;
          border: 1px solid #ddd6fe;
          border-radius: 6px;
          background: #faf5ff;
          color: #4c1d95;
          font-size: 0.78rem;
          line-height: 1.35;
        }

        .chat-msg__running-spinner {
          width: 14px;
          height: 14px;
          flex: 0 0 auto;
          border: 2px solid #ddd6fe;
          border-top-color: #7c3aed;
          border-radius: 50%;
          animation: chat-msg-running-spin 0.8s linear infinite;
        }

        .chat-msg__running-text {
          display: flex;
          flex-direction: column;
          gap: 0.1rem;
          min-width: 0;
        }

        .chat-msg__running-title {
          font-weight: 700;
        }

        .chat-msg__running-detail {
          color: #6d28d9;
          overflow: hidden;
          text-overflow: ellipsis;
          white-space: nowrap;
        }

        @keyframes chat-msg-running-spin {
          to { transform: rotate(360deg); }
        }

        .chat-msg__clarification {
          list-style: none;
          padding: 0;
          margin: 0.5rem 0 0;
          display: flex;
          flex-direction: column;
          gap: 4px;
        }
        .chat-msg__clarification-btn {
          display: flex;
          align-items: baseline;
          gap: 6px;
          width: 100%;
          text-align: left;
          padding: 6px 10px;
          border: 1px solid #cbd5e1;
          border-radius: 4px;
          background: #f8fafc;
          color: #1e293b;
          cursor: pointer;
          font-size: 0.8rem;
        }
        .chat-msg__clarification-btn:hover {
          background: #e2e8f0;
          border-color: #94a3b8;
        }
        .chat-msg__clarification-num {
          font-weight: 700;
          color: #7c3aed;
          min-width: 18px;
        }
        .chat-msg__clarification-label {
          flex: 1;
          font-weight: 500;
        }
        .chat-msg__clarification-snippet {
          color: #64748b;
          font-size: 0.72rem;
        }

        .chat-msg__apply-to-graph {
          margin-top: 0.5rem;
          padding: 4px 12px;
          border: 1px solid #7c3aed;
          border-radius: 4px;
          background: #f5f3ff;
          color: #7c3aed;
          font-size: 0.78rem;
          font-weight: 600;
          cursor: pointer;
          transition: all 0.15s;
        }
        .chat-msg__apply-to-graph:hover {
          background: #ede9fe;
          border-color: #6d28d9;
        }
      `}</style>
  )
}

function latestRunningStatus(events?: ChatMessage['streamEvents']): string {
  if (!events || events.length === 0) return 'Starting compiler pipeline...'
  for (let i = events.length - 1; i >= 0; i--) {
    const event = events[i]
    if (event?.type === 'status' && event.message.trim().length > 0) {
      return event.message
    }
    if ((event?.type === 'tool_call' || event?.type === 'tool_result') && event.toolName) {
      return event.toolName
    }
  }
  return 'Compiler pipeline is still running...'
}

function RunningStatus({ streamEvents }: { streamEvents?: ChatMessage['streamEvents'] }) {
  return (
    <div className="chat-msg__running" role="status" aria-live="polite">
      <span className="chat-msg__running-spinner" aria-hidden />
      <span className="chat-msg__running-text">
        <span className="chat-msg__running-title">Prompt received. Working...</span>
        <span className="chat-msg__running-detail">{latestRunningStatus(streamEvents)}</span>
      </span>
    </div>
  )
}

function formatScaleLevel(level: string): string {
  if (level === 'manual_tubes') return 'Manual tubes'
  if (level === 'bench_plate_multichannel') return 'Bench multichannel'
  if (level === 'robot_deck') return 'Robot deck'
  return level
}

function MessageBubble({
  message,
  onPickClarification,
  onApplyToGraph,
}: {
  message: ChatMessage
  onPickClarification?: (
    entityType: string,
    optionId: string,
    optionLabel: string,
  ) => void
  onApplyToGraph?: (message: ChatMessage) => void
}) {
  const { role, content, streamEvents, events, isStreaming, attachments } = message
  const [lightboxSrc, setLightboxSrc] = useState<{ src: string; alt: string } | null>(null)

  if (role === 'system') {
    return (
      <div className="chat-msg chat-msg--system">
        <div className="chat-msg__inner">{content}</div>
      </div>
    )
  }

  if (role === 'user') {
    return (
      <div className="chat-msg chat-msg--user">
        <div className="chat-msg__inner">
          <span className="chat-msg__label chat-msg__label--user">You</span>
          {attachments && attachments.length > 0 && (
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '4px', marginBottom: '6px' }}>
              {attachments.map((att, idx) => (
                <AttachmentChip
                  key={`${att.name}-${idx}`}
                  name={att.name}
                  size={att.size}
                  type={att.type}
                  previewUrl={att.previewUrl}
                  onClick={isImageFile(att.name) && att.previewUrl
                    ? () => setLightboxSrc({ src: att.previewUrl!, alt: att.name })
                    : undefined}
                />
              ))}
            </div>
          )}
          <p className="chat-msg__content">{content}</p>
          {lightboxSrc && (
            <ImageLightbox
              src={lightboxSrc.src}
              alt={lightboxSrc.alt}
              onClose={() => setLightboxSrc(null)}
            />
          )}
        </div>
      </div>
    )
  }

  // Assistant
  return (
    <div className="chat-msg chat-msg--assistant">
      <div className="chat-msg__inner">
        <span className="chat-msg__label chat-msg__label--ai">AI</span>
        <p className="chat-msg__content">{content}</p>
        {isStreaming && <RunningStatus streamEvents={streamEvents} />}
        {message.clarification && message.clarification.options.length > 0 && (
          <ol className="chat-msg__clarification">
            {message.clarification.options.map((opt, idx) => (
              <li key={opt.id}>
                <button
                  type="button"
                  className="chat-msg__clarification-btn"
                  onClick={() =>
                    onPickClarification?.(
                      message.clarification!.entityType,
                      opt.id,
                      opt.label,
                    )
                  }
                >
                  <span className="chat-msg__clarification-num">{idx + 1}.</span>
                  <span className="chat-msg__clarification-label">{opt.label}</span>
                  {opt.snippet && (
                    <span className="chat-msg__clarification-snippet">{opt.snippet}</span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        )}
        {events && events.length > 0 && !isStreaming && (
          <div className="chat-msg__event-count">
            {events.length} event{events.length !== 1 ? 's' : ''} proposed
          </div>
        )}
        {message.executionScalePlan && !isStreaming && (
          <div className="chat-msg__scale-plan">
            <div className="chat-msg__scale-plan-title">
              <span>
                {formatScaleLevel(message.executionScalePlan.sourceLevel)}
                {' -> '}
                {formatScaleLevel(message.executionScalePlan.targetLevel)}
              </span>
              <span className="chat-msg__scale-plan-status">{message.executionScalePlan.status}</span>
            </div>
            <div className="chat-msg__scale-plan-detail">
              {message.executionScalePlan.sampleLayout?.sampleCount
                ? `${message.executionScalePlan.sampleLayout.sampleCount} samples`
                : 'Sample layout pending'}
              {message.executionScalePlan.pipettingStrategy
                ? ` · ${message.executionScalePlan.pipettingStrategy.channels}-channel ${message.executionScalePlan.pipettingStrategy.pipetteMode === 'multi_channel_parallel' ? 'parallel' : 'single'} pipetting`
                : ''}
              {message.executionScalePlan.blockers.length > 0
                ? ` · ${message.executionScalePlan.blockers.length} blocker${message.executionScalePlan.blockers.length !== 1 ? 's' : ''}`
                : ''}
            </div>
          </div>
        )}
        {role === 'assistant' && !isStreaming && message.docDiscussion === true && onApplyToGraph && (
          <button
            type="button"
            className="chat-msg__apply-to-graph"
            data-testid="chat-msg-apply-to-graph"
            onClick={() => onApplyToGraph(message)}
          >
            Apply to graph
          </button>
        )}
      </div>
      {streamEvents && streamEvents.length > 0 && (
        <div className="chat-msg__stream-log">
          <CompactStreamIndicator events={streamEvents} isStreaming={!!isStreaming} />
        </div>
      )}
    </div>
  )
}
