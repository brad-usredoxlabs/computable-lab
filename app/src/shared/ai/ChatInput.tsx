/**
 * ChatInput — the AI chat composer.
 *
 * Phase 2 rebuild: TipTap editor as the input control, with the shared
 * slash-menu extension supplying `/m /l /p /s /t` lookups and inline
 * mention pills. The wire format on submit is unchanged — mentions
 * serialize to `[[kind:id|label]]` tokens via the slash menu's serializer.
 *
 * Side concerns (file attachments, multi-line paste capture, image paste,
 * drag-and-drop, send/cancel, readline keybindings) carry over from the
 * pre-Phase-2 textarea implementation. The inline slash detection, the
 * three resolver effects, and the dropdown rendering all moved to the
 * shared `slashMenu/` module.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import Placeholder from '@tiptap/extension-placeholder'
import { TextSelection } from '@tiptap/pm/state'
import {
  buildSlashMenuExtension,
  MentionNode,
  editorToText,
} from '../taptab/slashMenu'
import { useSelection } from '../context/SelectionContext'
import { PastedBlockToken } from './PastedBlockToken'
import { FileAttachmentButton, filesToAttachments } from './FileAttachmentButton'
import { AttachmentChip } from './AttachmentChip'
import type { FileAttachment } from '../../types/aiContext'

interface ChatInputProps {
  onSend: (prompt: string, attachments?: FileAttachment[]) => void
  onCancel: () => void
  isStreaming: boolean
  disabled?: boolean
  inputText?: string
}

const PLACEHOLDER =
  'Ask AI to plan events. /m material, /l labware, /p protocol, /s source selection, /t target selection'

export function ChatInput({
  onSend,
  onCancel,
  isStreaming,
  disabled,
  inputText,
}: ChatInputProps) {
  const [isSubmittingLocal, setIsSubmittingLocal] = useState(false)
  const [pastedBlock, setPastedBlock] = useState<string | null>(null)
  const [attachments, setAttachments] = useState<FileAttachment[]>([])
  const [attachError, setAttachError] = useState<string | null>(null)
  const [isDragOver, setIsDragOver] = useState(false)

  const selection = useSelection()
  const selectionRef = useRef(selection)
  selectionRef.current = selection

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({ placeholder: PLACEHOLDER }),
      MentionNode,
      buildSlashMenuExtension({
        // Pass a getter — the editor is constructed once but reads the
        // latest selection at trigger time.
        getSelection: () => selectionRef.current,
      }),
    ],
    editorProps: {
      attributes: {
        class: 'chat-input__tiptap',
      },
      handleKeyDown(view, event) {
        // Readline keybindings: Ctrl+A / Ctrl+E move to line start / end.
        // TipTap doesn't expose these by default; we forward to the
        // underlying DOM selection so the behaviour matches the prior
        // textarea control.
        if (event.ctrlKey && !event.shiftKey && !event.altKey && !event.metaKey) {
          if (event.key === 'a' || event.key === 'e') {
            event.preventDefault()
            const { state } = view
            const { $from } = state.selection
            const pos = event.key === 'a' ? $from.start() : $from.end()
            view.dispatch(state.tr.setSelection(TextSelection.near(state.doc.resolve(pos))))
            return true
          }
        }
        return false
      },
      handlePaste(_view, event) {
        const data = event.clipboardData
        if (!data) return false

        // Image paste: route through the existing attachment pipeline.
        const items = Array.from(data.items)
        const imageItem = items.find((item) => item.type.startsWith('image/'))
        if (imageItem) {
          const file = imageItem.getAsFile()
          if (file) {
            event.preventDefault()
            ;(async () => {
              const next = await filesToAttachments([file], attachmentsRef.current, handleAttachError)
              if (next.length > 0) handleAttach(next)
            })()
            return true
          }
        }

        // Multi-line plain-text paste: hoist into a "pasted block" chip so
        // the prompt stays readable.
        const text = data.getData('text/plain')
        if (text && text.split('\n').length >= 3) {
          event.preventDefault()
          setPastedBlock(text)
          return true
        }
        return false
      },
    },
  })

  // Track the latest attachments inside paste callbacks (which capture
  // their closure at editor-construction time).
  const attachmentsRef = useRef(attachments)
  attachmentsRef.current = attachments

  // One-shot pre-fill from parent (e.g. applyToGraph).
  useEffect(() => {
    if (!editor || inputText === undefined) return
    if (editorToText(editor) === inputText.trim()) return
    editor.commands.setContent(inputText)
  }, [editor, inputText])

  useEffect(() => {
    if (!isStreaming) setIsSubmittingLocal(false)
  }, [isStreaming])

  const handleAttach = useCallback((files: FileAttachment[]) => {
    setAttachments((prev) => [...prev, ...files])
    setAttachError(null)
  }, [])

  const handleAttachError = useCallback((message: string) => {
    setAttachError(message)
    setTimeout(() => setAttachError(null), 5000)
  }, [])

  const removeAttachment = useCallback((id: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== id))
  }, [])

  const submit = useCallback(() => {
    if (!editor) return
    const text = editorToText(editor)
    const hasContent = text.trim() || pastedBlock || attachments.length > 0
    if (!hasContent || isStreaming || isSubmittingLocal || disabled) return

    const parts: string[] = []
    if (text.trim()) parts.push(text.trim())
    if (pastedBlock) {
      parts.push(`---pasted-content---\n${pastedBlock}\n---end-pasted-content---`)
    }
    setIsSubmittingLocal(true)
    onSend(parts.join('\n\n'), attachments.length > 0 ? attachments : undefined)

    editor.commands.clearContent(true)
    setPastedBlock(null)
    setAttachments([])
  }, [editor, pastedBlock, attachments, isStreaming, isSubmittingLocal, disabled, onSend])

  // Bind Enter/Shift+Enter behaviour at the DOM level. We register on the
  // editor element so it composes cleanly with TipTap's own handling: the
  // suggestion plugin (slash menu) consumes Enter when its popover is open;
  // when it isn't, our listener fires and submits the prompt.
  useEffect(() => {
    if (!editor) return
    const dom = editor.view.dom
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== 'Enter' || event.shiftKey || event.isComposing) return
      // If the slash menu popover is open, let it handle Enter.
      if (document.querySelector('[data-slash-menu-root]')) return
      event.preventDefault()
      submit()
    }
    dom.addEventListener('keydown', onKeyDown)
    return () => dom.removeEventListener('keydown', onKeyDown)
  }, [editor, submit])

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(true)
  }, [])

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault()
    e.stopPropagation()
    setIsDragOver(false)
  }, [])

  const handleDrop = useCallback(
    async (e: React.DragEvent) => {
      e.preventDefault()
      e.stopPropagation()
      setIsDragOver(false)
      const files = e.dataTransfer.files
      if (files.length === 0) return
      const next = await filesToAttachments(files, attachments, handleAttachError)
      if (next.length > 0) handleAttach(next)
    },
    [attachments, handleAttach, handleAttachError],
  )

  const hasContent =
    editor !== null && editorToText(editor).trim().length > 0
  const canSend =
    (hasContent || pastedBlock || attachments.length > 0) &&
    !disabled &&
    !isSubmittingLocal

  return (
    <div
      className="chat-input"
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      style={{
        position: 'relative',
        borderTop: '1px solid #e9ecef',
        padding: '0.75rem 1rem',
        flexShrink: 0,
        ...(isDragOver ? { background: '#eff6ff', borderColor: '#3b82f6' } : {}),
      }}
    >
      <style>{tiptapStyles}</style>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>
        <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'flex-end' }}>
          <FileAttachmentButton
            attachments={attachments}
            onAttach={handleAttach}
            onError={handleAttachError}
            disabled={disabled || isStreaming}
          />
          <div className="chat-input__editor-wrap">
            <EditorContent editor={editor} />
          </div>
          {isStreaming ? (
            <button
              onClick={onCancel}
              type="button"
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: '8px',
                border: '1px solid #fecaca',
                background: '#fff1f2',
                color: '#b91c1c',
                cursor: 'pointer',
              }}
            >
              Cancel
            </button>
          ) : (
            <button
              onClick={submit}
              type="button"
              disabled={!canSend}
              style={{
                padding: '0.6rem 0.9rem',
                borderRadius: '8px',
                border: 'none',
                background: isSubmittingLocal ? '#64748b' : '#2563eb',
                color: 'white',
                cursor: canSend ? 'pointer' : 'not-allowed',
                opacity: canSend ? 1 : 0.6,
              }}
            >
              {isSubmittingLocal ? 'Submitting...' : 'Send'}
            </button>
          )}
        </div>
        {isSubmittingLocal && !isStreaming && (
          <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#475569' }}>
            Prompt submitted...
          </div>
        )}
        <div style={{ marginTop: '0.35rem', fontSize: '0.75rem', color: '#64748b' }}>
          /m material, /l labware, /p protocol, /s source selection, /t target selection
        </div>
        {pastedBlock && (
          <PastedBlockToken
            lineCount={pastedBlock.split('\n').length}
            content={pastedBlock}
            onRemove={() => setPastedBlock(null)}
          />
        )}
        {attachments.length > 0 && (
          <div style={{ marginTop: '0.45rem', display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
            {attachments.map((attachment) => (
              <AttachmentChip
                key={attachment.id}
                name={attachment.name}
                size={attachment.size}
                type={attachment.type}
                previewUrl={attachment.previewUrl}
                onRemove={() => removeAttachment(attachment.id)}
              />
            ))}
          </div>
        )}
        {attachError && (
          <div
            style={{
              marginTop: '0.35rem',
              fontSize: '0.75rem',
              color: '#dc2626',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 6,
              padding: '4px 8px',
            }}
          >
            {attachError}
          </div>
        )}
        {isDragOver && (
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: 'rgba(59, 130, 246, 0.08)',
              border: '2px dashed #3b82f6',
              borderRadius: 8,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              fontSize: '0.85rem',
              color: '#2563eb',
              fontWeight: 600,
              pointerEvents: 'none',
              zIndex: 10,
            }}
          >
            Drop files to attach
          </div>
        )}
      </div>
    </div>
  )
}

const tiptapStyles = `
.chat-input__editor-wrap {
  flex: 1;
  min-height: 40px;
  max-height: 120px;
  overflow-y: auto;
  padding: 0.5rem 0.75rem;
  border: 1px solid #d0d5dd;
  border-radius: 8px;
  font-size: 0.9rem;
  line-height: 1.4;
  background: white;
}
.chat-input__editor-wrap:focus-within {
  border-color: #2563eb;
}
.chat-input__tiptap {
  outline: none;
  min-height: 1.4em;
}
.chat-input__tiptap p {
  margin: 0;
}
.chat-input__tiptap p + p {
  margin-top: 0.25em;
}
.chat-input__tiptap p.is-editor-empty:first-child::before {
  content: attr(data-placeholder);
  color: #94a3b8;
  pointer-events: none;
  float: left;
  height: 0;
}
`
