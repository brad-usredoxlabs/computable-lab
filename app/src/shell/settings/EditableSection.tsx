/**
 * EditableSection — Card wrapper with Edit / Save / Cancel controls.
 *
 * Renders children in read mode by default. When editing, shows Save / Cancel
 * buttons and an inline feedback banner (success / error / restart-required).
 */

import { useState, useEffect, useCallback, type ReactNode } from 'react'

export type SectionId = string

export type FeedbackType = 'success' | 'error' | 'restart'

export interface Feedback {
  type: FeedbackType
  message: string
}

interface EditableSectionProps {
  id: SectionId
  title: string
  /** Which section is currently being edited (only one at a time) */
  editingSection: SectionId | null
  /** Request to start / stop editing */
  onEditChange: (id: SectionId | null) => void
  /** Read-mode content */
  readContent: ReactNode
  /** Edit-mode content */
  editContent: ReactNode
  /** Called when user clicks Save. Should throw on error. */
  onSave: () => Promise<{ restartRequired?: boolean }>
  /** Called when user clicks Cancel */
  onCancel: () => void
  /** Whether a save is currently in flight (disables buttons) */
  saving?: boolean
}

const FEEDBACK_COLORS: Record<FeedbackType, { bg: string; text: string; border: string }> = {
  success: { bg: '#d3f9d8', text: '#2b8a3e', border: '#b2f2bb' },
  error: { bg: '#ffe3e3', text: '#c92a2a', border: '#ffc9c9' },
  restart: { bg: '#fff3bf', text: '#e67700', border: '#ffe066' },
}

export function EditableSection({
  id,
  title,
  editingSection,
  onEditChange,
  readContent,
  editContent,
  onSave,
  onCancel,
  saving = false,
}: EditableSectionProps) {
  const isEditing = editingSection === id
  const isLocked = editingSection !== null && editingSection !== id
  const [feedback, setFeedback] = useState<Feedback | null>(null)

  // Auto-clear success feedback after 4 seconds
  useEffect(() => {
    if (feedback?.type === 'success') {
      const timer = setTimeout(() => setFeedback(null), 4000)
      return () => clearTimeout(timer)
    }
  }, [feedback])

  const handleEdit = useCallback(() => {
    setFeedback(null)
    onEditChange(id)
  }, [id, onEditChange])

  const handleCancel = useCallback(() => {
    setFeedback(null)
    onCancel()
    onEditChange(null)
  }, [onCancel, onEditChange])

  const handleSave = useCallback(async () => {
    try {
      const result = await onSave()
      onEditChange(null)

      if (result.restartRequired) {
        setFeedback({ type: 'restart', message: 'Saved. Server restart required for changes to take effect.' })
      } else {
        setFeedback({ type: 'success', message: 'Settings saved successfully.' })
      }
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Save failed'
      setFeedback({ type: 'error', message })
    }
  }, [onSave, onEditChange])

  return (
    <div className="settings-section">
      <div className="settings-section__header">
        <h2>{title}</h2>
        {!isEditing && (
          <button
            className="btn btn-edit"
            onClick={handleEdit}
            disabled={isLocked}
            title={isLocked ? 'Finish editing the other section first' : `Edit ${title}`}
          >
            Edit
          </button>
        )}
      </div>

      {/* Feedback banner */}
      {feedback && (
        <div
          className="feedback-banner"
          style={{
            background: FEEDBACK_COLORS[feedback.type].bg,
            color: FEEDBACK_COLORS[feedback.type].text,
            borderBottom: `1px solid ${FEEDBACK_COLORS[feedback.type].border}`,
          }}
        >
          {feedback.message}
          {feedback.type !== 'success' && (
            <button className="feedback-banner__dismiss" onClick={() => setFeedback(null)}>
              ×
            </button>
          )}
        </div>
      )}

      <div className="settings-section__content">
        {isEditing ? editContent : readContent}
      </div>

      {/* Save / Cancel footer */}
      {isEditing && (
        <div className="settings-section__footer">
          <button className="btn btn-primary" onClick={handleSave} disabled={saving}>
            {saving ? 'Saving...' : 'Save'}
          </button>
          <button className="btn btn-secondary" onClick={handleCancel} disabled={saving}>
            Cancel
          </button>
        </div>
      )}
    </div>
  )
}
