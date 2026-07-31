/**
 * EditableTitle — displays a title that becomes an input on click.
 * Calls onCommit(title) when the user presses Enter or blurs the input.
 * Escape cancels the edit and restores the original title.
 *
 * Used for the run name in the deck toolbar.
 */

import { useState, useRef, useEffect, type KeyboardEvent } from 'react'
import './EditableTitle.css'

export interface EditableTitleProps {
  title: string
  onCommit: (title: string) => void
  /** Optional placeholder when title is empty. */
  placeholder?: string
  /** Test ID for the display span. */
  testId?: string
}

export function EditableTitle({ title, onCommit, placeholder, testId }: EditableTitleProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(title)
  const inputRef = useRef<HTMLInputElement>(null)

  // Focus the input when entering edit mode
  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus()
      inputRef.current.select()
    }
  }, [editing])

  // Reset draft when title prop changes (e.g. external rename)
  useEffect(() => {
    setDraft(title)
  }, [title])

  const startEdit = () => {
    setDraft(title)
    setEditing(true)
  }

  const commit = () => {
    const trimmed = draft.trim()
    if (trimmed && trimmed !== title) {
      onCommit(trimmed)
    }
    setEditing(false)
  }

  const cancel = () => {
    setDraft(title)
    setEditing(false)
  }

  const handleKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter') {
      e.preventDefault()
      commit()
    } else if (e.key === 'Escape') {
      e.preventDefault()
      cancel()
    }
  }

  if (editing) {
    return (
      <input
        ref={inputRef}
        className="editable-title__input"
        data-testid={testId ? `${testId}-input` : 'editable-title-input'}
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onKeyDown={handleKeyDown}
        onBlur={commit}
      />
    )
  }

  return (
    <span
      className="editable-title__display"
      data-testid={testId ?? 'editable-title'}
      onClick={startEdit}
      title="Click to rename"
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault()
          startEdit()
        }
      }}
    >
      {title || placeholder || 'Untitled'}
    </span>
  )
}
