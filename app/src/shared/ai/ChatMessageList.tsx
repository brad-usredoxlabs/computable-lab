/**
 * ChatMessageList — Scrollable message history with auto-scroll.
 *
 * Messages are left-aligned with You/AI labels, centered in a ~900px column.
 * System messages: centered gray text.
 * StreamLog uses full panel width (no max-width).
 */

import { useEffect, useRef, useState } from 'react'
import { StreamLog } from './StreamLog'
import { AttachmentChip } from './AttachmentChip'
import { ImageLightbox } from './ImageLightbox'
import { isImageFile } from '../../types/aiContext'
import type { ChatMessage } from '../../types/ai'

interface ChatMessageListProps {
  messages: ChatMessage[]
}

export function ChatMessageList({ messages }: ChatMessageListProps) {
  const bottomRef = useRef<HTMLDivElement>(null)

  // Auto-scroll to bottom on new messages
  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth' })
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
        <MessageBubble key={msg.id} message={msg} />
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

        .chat-msg__stream-log {
          max-width: none;
          margin: 0.5rem -1rem 0;
          padding: 0 1rem;
        }
      `}</style>
  )
}

function MessageBubble({ message }: { message: ChatMessage }) {
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
        {events && events.length > 0 && !isStreaming && (
          <div className="chat-msg__event-count">
            {events.length} event{events.length !== 1 ? 's' : ''} proposed
          </div>
        )}
      </div>
      {streamEvents && streamEvents.length > 0 && (
        <div className="chat-msg__stream-log">
          <StreamLog events={streamEvents} isStreaming={!!isStreaming} />
        </div>
      )}
    </div>
  )
}
