/**
 * AiChatPanel — Bottom panel for AI chat (VS Code terminal style).
 *
 * Always rendered: collapsed bar when closed, full panel when open.
 * Reads open/close state and chat from AiPanelContext.
 * Resizable via drag handle on the top edge.
 * Default 35vh, min 200px, max 70vh. Persists height in localStorage.
 */

import { useState, useCallback, useEffect, useRef } from 'react'
import { createPortal } from 'react-dom'
import { ChatMessageList } from './ChatMessageList'
import { ChatInput } from './ChatInput'
import { PreviewBanner } from './PreviewBanner'
import { PreviewEventList } from './PreviewEventList'
import { MaterialBuilderModal } from '../../editor/material/MaterialBuilderModal'
import { useAiPanel } from '../context/AiPanelContext'
import type { RecordRef } from '../../types/ref'

const STORAGE_KEY = 'ai-panel-height'
const DEFAULT_HEIGHT_VH = 35
const MIN_HEIGHT = 200
const MAX_HEIGHT_VH = 70

function getDefaultHeight(): number {
  return Math.floor(window.innerHeight * (DEFAULT_HEIGHT_VH / 100))
}

function getMaxHeight(): number {
  return Math.floor(window.innerHeight * (MAX_HEIGHT_VH / 100))
}

function loadPersistedHeight(): number {
  try {
    const stored = localStorage.getItem(STORAGE_KEY)
    if (stored) {
      const parsed = parseInt(stored, 10)
      if (!isNaN(parsed) && parsed >= MIN_HEIGHT && parsed <= getMaxHeight()) {
        return parsed
      }
    }
  } catch { /* ignore */ }
  return getDefaultHeight()
}

export function AiChatPanel() {
  const { open, setOpen, chat } = useAiPanel()

  // ------------------------------------------------------------------
  // Resizable height state
  // ------------------------------------------------------------------
  const [height, setHeight] = useState(loadPersistedHeight)
  const draggingRef = useRef(false)
  const panelRef = useRef<HTMLDivElement>(null)

  // Persist height changes to localStorage
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY, String(height))
    } catch { /* ignore */ }
  }, [height])

  // Drag handle logic (vertical — top edge)
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    draggingRef.current = true
    const startY = e.clientY
    const startHeight = height

    const onMouseMove = (moveEvent: MouseEvent) => {
      if (!draggingRef.current) return
      const delta = startY - moveEvent.clientY
      const newHeight = Math.max(MIN_HEIGHT, Math.min(getMaxHeight(), startHeight + delta))
      setHeight(newHeight)
    }

    const onMouseUp = () => {
      draggingRef.current = false
      document.removeEventListener('mousemove', onMouseMove)
      document.removeEventListener('mouseup', onMouseUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'row-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', onMouseUp)
  }, [height])

  // ------------------------------------------------------------------
  // Material resolution flow state
  // ------------------------------------------------------------------
  const [resolving, setResolving] = useState(false)
  const [resolveIndex, setResolveIndex] = useState(0)
  const [resolutions, setResolutions] = useState<Map<string, RecordRef>>(new Map())

  // R5: Health check — on mount, on open transition, and on chat change
  const prevOpenRef = useRef(open)
  const prevChatRef = useRef(chat)

  useEffect(() => {
    chat?.recheckHealth()
  }, [chat])

  useEffect(() => {
    if (open && !prevOpenRef.current) {
      chat?.recheckHealth()
    }
    prevOpenRef.current = open
  }, [open, chat])

  useEffect(() => {
    if (chat && chat !== prevChatRef.current) {
      chat.recheckHealth()
    }
    prevChatRef.current = chat
  }, [chat])

  // Safety: reset resolution state if preview is cleared
  useEffect(() => {
    if (!chat || chat.previewEvents.length === 0) {
      setResolving(false)
      setResolveIndex(0)
      setResolutions(new Map())
    }
  }, [chat?.previewEvents.length])

  const handleAccept = useCallback(() => {
    if (!chat) return
    if (chat.unresolvedRefs.length === 0) {
      chat.acceptPreview()
    } else {
      setResolving(true)
      setResolveIndex(0)
      setResolutions(new Map())
    }
  }, [chat])

  const handleMaterialSaved = useCallback(
    (ref: RecordRef) => {
      if (!chat) return
      const currentProposal = chat.unresolvedRefs[resolveIndex]
      setResolutions((prev) => {
        const next = new Map(prev)
        next.set(currentProposal.ref.id, ref)
        return next
      })

      const nextIndex = resolveIndex + 1
      if (nextIndex < chat.unresolvedRefs.length) {
        setResolveIndex(nextIndex)
      } else {
        const finalMap = new Map(resolutions)
        finalMap.set(currentProposal.ref.id, ref)
        setResolving(false)
        setResolveIndex(0)
        setResolutions(new Map())
        chat.acceptPreviewWithResolutions(finalMap)
      }
    },
    [chat, resolveIndex, resolutions]
  )

  const handleMaterialCancelled = useCallback(() => {
    setResolving(false)
    setResolveIndex(0)
    setResolutions(new Map())
    chat?.rejectPreview()
  }, [chat])

  const currentProposal = (resolving && chat) ? chat.unresolvedRefs[resolveIndex] : null

  // Collapsed bar
  if (!open) {
    return (
      <>
        <div
          className="ai-panel-collapsed-bar"
          onClick={() => setOpen(true)}
          role="button"
          tabIndex={0}
          onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') setOpen(true) }}
        >
          <span className="ai-panel-collapsed-bar__chevron">&#9650;</span>
          <span className="ai-panel-collapsed-bar__label">AI Assistant</span>
        </div>
        <style>{`
          .ai-panel-collapsed-bar {
            height: 32px;
            flex-shrink: 0;
            border-top: 1px solid #e2e8f0;
            display: flex;
            align-items: center;
            padding: 0 1rem;
            cursor: pointer;
            background: #f8f9fa;
            user-select: none;
          }
          .ai-panel-collapsed-bar:hover {
            background: #e9ecef;
          }
          .ai-panel-collapsed-bar__chevron {
            font-size: 0.7rem;
            color: #868e96;
            margin-right: 0.5rem;
          }
          .ai-panel-collapsed-bar__label {
            font-weight: 700;
            font-size: 0.85rem;
            color: #495057;
          }
        `}</style>
      </>
    )
  }

  // Expanded panel
  return (
    <>
      <div
        ref={panelRef}
        className="ai-chat-panel"
        style={{ height: `${height}px`, flexShrink: 0 }}
      >
        {/* Drag handle — top edge */}
        <div
          className="ai-chat-panel__drag-handle"
          onMouseDown={handleMouseDown}
          title="Drag to resize"
        />

        {/* Header */}
        <div className="ai-chat-panel__header">
          <span className="ai-chat-panel__title">AI Assistant</span>
          <div className="ai-chat-panel__header-actions">
            {chat && chat.messages.length > 0 && (
              <button
                className="ai-chat-panel__clear-btn"
                onClick={chat.clearHistory}
                disabled={chat.isStreaming}
                title="Clear chat history"
              >
                Clear
              </button>
            )}
            <button
              className="ai-chat-panel__collapse-btn"
              onClick={() => setOpen(false)}
              title="Collapse AI panel"
            >
              &#9660;
            </button>
          </div>
        </div>

        {!chat ? (
          <div className="ai-chat-panel__placeholder">
            <p>Navigate to an editor page to use AI assistance</p>
          </div>
        ) : chat.aiAvailable === false ? (
          <div className="ai-chat-panel__unavailable">
            <p>AI is not configured.</p>
            <p>Go to <a href="/settings">Settings</a> to add an inference endpoint.</p>
            <button
              className="ai-chat-panel__retry-btn"
              onClick={chat.recheckHealth}
            >
              Retry
            </button>
          </div>
        ) : (
          <>
            {/* Messages */}
            <ChatMessageList
              messages={chat.messages}
              onPickClarification={(entityType, optionId, optionLabel) => {
                const token = `[[${entityType}:${optionId}|${optionLabel}]]`
                chat.sendPrompt(`Use ${token} — continue.`)
              }}
            />

            {/* Preview details and accept/reject controls */}
            {(chat.previewEvents.length > 0 || chat.previewLabwareAdditions.length > 0) && (
              <>
                <PreviewBanner
                  previewEvents={chat.previewEvents}
                  previewLabwareAdditions={chat.previewLabwareAdditions}
                  previewEventStates={chat.previewEventStates}
                  unresolvedCount={chat.unresolvedRefs.length}
                  onAccept={handleAccept}
                  onReject={chat.rejectPreview}
                  onCommitAccepted={chat.commitAcceptedPreviewEvents}
                  isAccepting={chat.isAccepting}
                />
                {chat.previewEvents.length > 0 && (
                  <PreviewEventList
                    previewEvents={chat.previewEvents}
                    previewEventStates={chat.previewEventStates}
                    setPreviewEventState={chat.setPreviewEventState}
                  />
                )}
              </>
            )}

            {/* Input */}
            <ChatInput
              onSend={chat.sendPrompt}
              onCancel={chat.cancelStream}
              isStreaming={chat.isStreaming}
            />
          </>
        )}
      </div>

      <style>{`
        .ai-chat-panel {
          position: relative;
          width: 100%;
          min-height: ${MIN_HEIGHT}px;
          background: white;
          border-top: 1px solid #e2e8f0;
          display: flex;
          flex-direction: column;
        }

        .ai-chat-panel__drag-handle {
          position: absolute;
          top: -3px;
          left: 0;
          right: 0;
          height: 6px;
          cursor: row-resize;
          z-index: 10;
          background: transparent;
          transition: background 0.15s;
        }

        .ai-chat-panel__drag-handle:hover,
        .ai-chat-panel__drag-handle:active {
          background: rgba(51, 154, 240, 0.3);
        }

        .ai-chat-panel__header {
          display: flex;
          align-items: center;
          justify-content: space-between;
          padding: 0.5rem 1rem;
          border-bottom: 1px solid #e9ecef;
          background: #f8f9fa;
          flex-shrink: 0;
        }

        .ai-chat-panel__title {
          font-weight: 700;
          font-size: 0.95rem;
          color: #495057;
        }

        .ai-chat-panel__header-actions {
          display: flex;
          align-items: center;
          gap: 0.5rem;
        }

        .ai-chat-panel__clear-btn {
          padding: 0.2rem 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          background: white;
          color: #868e96;
          font-size: 0.75rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .ai-chat-panel__clear-btn:hover:not(:disabled) {
          border-color: #adb5bd;
          color: #495057;
        }

        .ai-chat-panel__clear-btn:disabled {
          opacity: 0.4;
          cursor: not-allowed;
        }

        .ai-chat-panel__collapse-btn {
          width: 28px;
          height: 28px;
          border: none;
          border-radius: 4px;
          background: none;
          color: #868e96;
          font-size: 0.75rem;
          cursor: pointer;
          display: flex;
          align-items: center;
          justify-content: center;
          transition: all 0.15s;
        }

        .ai-chat-panel__collapse-btn:hover {
          background: #e9ecef;
          color: #495057;
        }

        .ai-chat-panel__placeholder {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          text-align: center;
          color: #868e96;
        }

        .ai-chat-panel__placeholder p {
          margin: 0.25rem 0;
          font-size: 0.9rem;
        }

        .ai-chat-panel__unavailable {
          flex: 1;
          display: flex;
          flex-direction: column;
          align-items: center;
          justify-content: center;
          padding: 2rem;
          text-align: center;
          color: #868e96;
        }

        .ai-chat-panel__unavailable p {
          margin: 0.25rem 0;
          font-size: 0.9rem;
        }

        .ai-chat-panel__unavailable a {
          color: #339af0;
          text-decoration: none;
          font-weight: 600;
        }

        .ai-chat-panel__unavailable a:hover {
          text-decoration: underline;
        }

        .ai-chat-panel__retry-btn {
          margin-top: 0.75rem;
          padding: 0.4rem 1rem;
          border: 1px solid #dee2e6;
          border-radius: 6px;
          background: white;
          color: #495057;
          font-size: 0.85rem;
          cursor: pointer;
          transition: all 0.15s;
        }

        .ai-chat-panel__retry-btn:hover {
          border-color: #339af0;
          color: #339af0;
        }
      `}</style>

      {/* Material builder modal (portal) */}
      {currentProposal &&
        createPortal(
          <div style={{ position: 'relative', zIndex: 1100 }}>
            <MaterialBuilderModal
              isOpen
              primaryRef={currentProposal.ref}
              onSave={handleMaterialSaved}
              onClose={handleMaterialCancelled}
            />
          </div>,
          document.body
        )}
    </>
  )
}
