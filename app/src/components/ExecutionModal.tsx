/**
 * ExecutionModal — Dialog for capturing execution provenance metadata
 * before starting a protocol execution.
 *
 * Fields:
 *   - Execution Name (required)
 *   - Operator Name (required)
 *   - Notes (optional)
 *   - Timestamp (auto-generated on submit)
 *
 * Controlled by `isOpen` prop. Calls `onClose` on cancel/overlay click/Escape.
 * Calls `onSubmit` with metadata on successful submit.
 */

import { useCallback, useEffect, useState } from 'react'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface ExecutionFormData {
  executionName: string
  operatorName: string
  notes: string
}

export interface ExecutionModalProps {
  isOpen: boolean
  onClose: () => void
  onSubmit: (data: {
    executionName: string
    operatorName: string
    notes: string
    timestamp: string
  }) => void
  /**
   * Optional pre-filled values (e.g. from context).
   */
  defaultOperatorName?: string
}

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function CloseIcon() {
  return (
    <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Component                                                            */
/* ------------------------------------------------------------------ */

export function ExecutionModal({
  isOpen,
  onClose,
  onSubmit,
  defaultOperatorName,
}: ExecutionModalProps) {
  const [executionName, setExecutionName] = useState('')
  const [operatorName, setOperatorName] = useState(defaultOperatorName ?? '')
  const [notes, setNotes] = useState('')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  // Reset state when modal opens
  useEffect(() => {
    if (isOpen) {
      setExecutionName('')
      setOperatorName(defaultOperatorName ?? '')
      setNotes('')
      setError(null)
      setIsSubmitting(false)
    }
  }, [isOpen, defaultOperatorName])

  // Escape key handler
  useEffect(() => {
    if (!isOpen) return

    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', handleKeyDown)
    return () => document.removeEventListener('keydown', handleKeyDown)
  }, [isOpen, onClose])

  const handleSubmit = useCallback(
    (e: React.FormEvent) => {
      e.preventDefault()

      // Validate required fields
      if (!executionName.trim()) {
        setError('Execution name is required')
        return
      }
      if (!operatorName.trim()) {
        setError('Operator name is required')
        return
      }

      setIsSubmitting(true)
      setError(null)

      onSubmit({
        executionName: executionName.trim(),
        operatorName: operatorName.trim(),
        notes: notes.trim(),
        timestamp: new Date().toISOString(),
      })
    },
    [executionName, operatorName, notes, onSubmit],
  )

  const handleOverlayClick = useCallback(
    (e: React.MouseEvent) => {
      // Only close when clicking the overlay background, not the card itself
      if (e.target === e.currentTarget) {
        onClose()
      }
    },
    [onClose],
  )

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center" onClick={handleOverlayClick}>
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/50" />

      {/* Modal card */}
      <div className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-200">
          <h2 className="text-lg font-semibold text-gray-900">Start Execution</h2>
          <button
            type="button"
            onClick={onClose}
            className="p-1 hover:bg-gray-100 rounded text-gray-400 hover:text-gray-600"
            aria-label="Close"
          >
            <CloseIcon />
          </button>
        </div>

        {/* Body */}
        <form onSubmit={handleSubmit} className="flex flex-col">
          <div className="px-6 py-5 space-y-4">
            {error && (
              <div className="p-3 bg-red-50 border border-red-200 rounded text-red-700 text-sm">
                {error}
              </div>
            )}

            {/* Execution Name */}
            <div>
              <label htmlFor="exec-name" className="block text-sm font-medium text-gray-700 mb-1">
                Execution Name <span className="text-red-500">*</span>
              </label>
              <input
                id="exec-name"
                type="text"
                value={executionName}
                onChange={(e) => setExecutionName(e.target.value)}
                placeholder="e.g. PPARα ROS assay run 1"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none text-sm"
                disabled={isSubmitting}
                autoFocus
              />
            </div>

            {/* Operator Name */}
            <div>
              <label htmlFor="exec-operator" className="block text-sm font-medium text-gray-700 mb-1">
                Operator Name <span className="text-red-500">*</span>
              </label>
              <input
                id="exec-operator"
                type="text"
                value={operatorName}
                onChange={(e) => setOperatorName(e.target.value)}
                placeholder="Your name"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none text-sm"
                disabled={isSubmitting}
              />
            </div>

            {/* Notes */}
            <div>
              <label htmlFor="exec-notes" className="block text-sm font-medium text-gray-700 mb-1">
                Notes
              </label>
              <textarea
                id="exec-notes"
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                placeholder="Optional notes about this execution…"
                rows={3}
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:ring-2 focus:ring-blue-200 focus:border-blue-500 outline-none resize-none text-sm"
                disabled={isSubmitting}
              />
            </div>

            {/* Auto-generated timestamp preview */}
            <div className="text-xs text-gray-400">
              Timestamp will be generated on submit
            </div>
          </div>

          {/* Footer */}
          <div className="flex justify-end gap-2 px-6 py-4 border-t border-gray-200">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm text-gray-700 hover:text-gray-900 border border-gray-300 rounded-md hover:bg-gray-50"
              disabled={isSubmitting}
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className={`px-4 py-2 text-sm font-medium rounded-md ${
                isSubmitting
                  ? 'bg-gray-200 text-gray-400 cursor-not-allowed'
                  : 'bg-blue-500 text-white hover:bg-blue-600'
              }`}
            >
              {isSubmitting ? 'Starting…' : 'Start Execution'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}
