/**
 * ChatInput — TipTap-backed prompt editor + Send/Stop buttons for the
 * workspace AI panel.
 *
 * Phase 7b shipped a plain textarea; Phase 13 lifts the right-pane AI
 * tab to feature parity with the legacy EventEditorAiDock by swapping
 * the textarea for the same TipTap stack:
 *   - slash menu (/l labware, /m material, /p protocol, /s source,
 *     /t target) via buildSlashMenuExtension
 *   - @-trigger ontology copilot via buildOntologyCopilotExtension
 *   - MentionNode chips that serialize back to the wire format the
 *     server's mention parser already understands ([[kind:id|label]])
 *
 * `editorToText` is the bridge between the rich editor and the plain
 * string the chat thread + downstream tools expect — the same serializer
 * the legacy dock uses, so messages typed here are indistinguishable
 * on the wire from messages typed in the dock.
 */

import { useCallback, useEffect, useRef, useState } from 'react'
import { useEditor, EditorContent, type Editor } from '@tiptap/react'
import Document from '@tiptap/extension-document'
import Paragraph from '@tiptap/extension-paragraph'
import Text from '@tiptap/extension-text'
import HardBreak from '@tiptap/extension-hard-break'
import Placeholder from '@tiptap/extension-placeholder'
import {
  buildSlashMenuExtension,
  MentionNode,
  editorToText,
} from '../../../shared/taptab/slashMenu'
import { buildOntologyCopilotExtension } from '../../../shared/taptab/ontologyCopilot/OntologyCopilotExtension'
import { useSelection } from '../../../shared/context/SelectionContext'

export interface ChatInputProps {
  isStreaming: boolean
  onSend: (text: string) => void | Promise<void>
  onStop: () => void
  /** When false, the send button is disabled but the editor is still
   *  editable so the user can stage a prompt. */
  disabled?: boolean
  /** Optional placeholder override; defaults to a generic prompt hint. */
  placeholder?: string
  /** Label for the send button. Defaults to "Send"; set to "Revise" when a
   *  ghost preview is active so the action reads as editing the proposal. */
  sendLabel?: string
  /** Allow the parent to push text into the input (e.g. Run-in-event-editor
   *  pre-fills the prompt from a viewer excerpt). */
  prefill?: string
}

export function ChatInput({
  isStreaming,
  onSend,
  onStop,
  disabled,
  placeholder,
  sendLabel = 'Send',
  prefill,
}: ChatInputProps) {
  const [text, setText] = useState('')
  // The slash menu extension wants live access to the cross-endpoint
  // selection (the /m material kind uses selected wells); we expose it
  // through a ref so the extension reads the latest value without
  // forcing the editor to be re-created on selection change.
  const selection = useSelection()
  const selectionRef = useRef(selection)
  useEffect(() => {
    selectionRef.current = selection
  }, [selection])

  // Hold the editor on a ref so `send` (declared before useEditor) can
  // call clearContent without re-running its callback on every editor
  // re-render.
  const editorRef = useRef<Editor | null>(null)

  const send = useCallback(async () => {
    const trimmed = text.trim()
    if (!trimmed) return
    setText('')
    editorRef.current?.commands.clearContent()
    await onSend(trimmed)
  }, [text, onSend])

  // Track the latest send fn in a ref so the editor's keydown handler
  // (registered once at mount) always calls the current closure.
  const sendRef = useRef(send)
  useEffect(() => {
    sendRef.current = send
  }, [send])

  const isStreamingRef = useRef(isStreaming)
  useEffect(() => {
    isStreamingRef.current = isStreaming
  }, [isStreaming])

  const editor = useEditor({
    extensions: [
      Document,
      Paragraph,
      Text,
      HardBreak,
      Placeholder.configure({
        placeholder:
          placeholder ??
          'Ask anything. /l labware · /m material · @ for ontology · Enter to send.',
      }),
      MentionNode,
      buildSlashMenuExtension({
        getSelection: () => selectionRef.current,
      }),
      buildOntologyCopilotExtension(),
    ],
    editorProps: {
      attributes: { class: 'chat-input__editor' },
      handleKeyDown(_view, event) {
        // Enter sends; Shift-Enter inserts a hard break — matches the
        // legacy dock and the prior textarea behavior. Don't send while
        // a stream is in flight (the Send button is replaced by Stop in
        // that state).
        if (
          event.key === 'Enter' &&
          !event.shiftKey &&
          !event.ctrlKey &&
          !event.metaKey
        ) {
          event.preventDefault()
          if (!isStreamingRef.current) void sendRef.current()
          return true
        }
        return false
      },
    },
    onUpdate({ editor }) {
      setText(editorToText(editor))
    },
  })

  useEffect(() => {
    editorRef.current = editor
  }, [editor])

  // Run-in-event-editor prefill: parent pushes a string in; we replace
  // the editor content (escaping HTML so it lands as plain text in the
  // paragraph). The ref guards against re-applying the same prefill on
  // unrelated re-renders.
  const lastPrefillRef = useRef<string | undefined>(undefined)
  useEffect(() => {
    if (prefill === undefined) return
    if (prefill === lastPrefillRef.current) return
    lastPrefillRef.current = prefill
    if (!editor) return
    editor.commands.setContent(`<p>${escapeHtml(prefill)}</p>`)
    setText(prefill)
    editor.commands.focus('end')
  }, [prefill, editor])

  return (
    <div className="chat-input" data-testid="chat-input">
      <div className="chat-input__editor-wrap">
        <EditorContent editor={editor} />
      </div>
      <div className="chat-input__actions">
        {isStreaming ? (
          <button
            type="button"
            className="chat-input__btn chat-input__btn--stop"
            onClick={onStop}
            data-testid="chat-input-stop"
          >
            Stop
          </button>
        ) : (
          <button
            type="button"
            className="chat-input__btn chat-input__btn--send"
            onClick={() => void send()}
            disabled={disabled || !text.trim()}
            data-testid="chat-input-send"
          >
            {sendLabel}
          </button>
        )}
      </div>
    </div>
  )
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}
