/**
 * BudgetDocumentSurface — renders the budget as a document-style TapTab surface
 * with inline offer selection, unresolved/manual notes, and keyboard behavior
 * for Tab navigation plus Arrow/Enter/Escape suggestion handling.
 */

import { useCallback, useMemo, useRef, useState } from 'react'
import { ProjectionTapTabEditor, type TapTabEditorHandle } from '../../editor/taptab/TapTabEditor'
import { serializeDocument } from '../../editor/taptab/recordSerializer'
import type { EditorProjectionResponse } from '../../types/uiSpec'

interface BudgetDocumentSurfaceProps {
  projection: EditorProjectionResponse
  recordPayload: Record<string, unknown>
  onSave: (payload: Record<string, unknown>) => void
}

/**
 * Compute totals from persisted budget line items.
 */
function computeBudgetTotals(payload: Record<string, unknown>): {
  lineCount: number
  approvedLineCount: number
  grandTotal: number
} {
  const lines = (payload.lines as Array<Record<string, unknown>>) ?? []
  let grandTotal = 0
  let approvedLineCount = 0

  for (const line of lines) {
    if ((line.approved as boolean) === true) {
      approvedLineCount++
    }
    const totalPrice = line.totalPrice as number | null
    if (typeof totalPrice === 'number') {
      grandTotal += totalPrice
    }
  }

  return {
    lineCount: lines.length,
    approvedLineCount,
    grandTotal,
  }
}

export function BudgetDocumentSurface({
  projection,
  recordPayload,
  onSave,
}: BudgetDocumentSurfaceProps) {
  const [saving, setSaving] = useState(false)
  const [saveStatus, setSaveStatus] = useState<'idle' | 'saved' | 'error'>('idle')
  const editorRef = useRef<TapTabEditorHandle | null>(null)

  // Compute totals from the actual record payload for display
  const totals = useMemo(
    () => computeBudgetTotals(recordPayload),
    [recordPayload],
  )

  // Handle save from the document surface
  const handleSave = useCallback(async () => {
    const editor = editorRef.current?.getEditor()
    if (!editor) return

    setSaving(true)
    try {
      // Serialize the TipTap document back to a record using serializeDocument
      const doc = (editor as { getJSON?: () => Record<string, unknown> }).getJSON?.()
      if (!doc) {
        setSaveStatus('error')
        return
      }

      // Use serializeDocument to properly walk fieldRow nodes and reconstruct
      // the record from the TipTap JSON, preserving the base record structure
      const serialized = serializeDocument(doc, recordPayload)

      // Recompute summary totals from the serialized data
      const computedTotals = computeBudgetTotals(serialized)
      const payload = {
        ...serialized,
        summary: {
          ...serialized.summary,
          ...computedTotals,
        },
      }

      await onSave(payload)
      setSaveStatus('saved')
      setTimeout(() => setSaveStatus('idle'), 3000)
    } catch {
      setSaveStatus('error')
    } finally {
      setSaving(false)
    }
  }, [recordPayload, onSave])

  // Keyboard shortcut: Ctrl+S to save
  const handleKeyDown = useCallback(
    (e: React.KeyboardEvent) => {
      if ((e.ctrlKey || e.metaKey) && e.key === 's') {
        e.preventDefault()
        handleSave()
      }
    },
    [handleSave],
  )

  return (
    <div className="budget-document-surface" onKeyDown={handleKeyDown}>
      <div className="budget-document-surface__toolbar">
        <button
          type="button"
          className="run-workspace-header__primary"
          disabled={saving}
          onClick={handleSave}
        >
          {saving ? 'Saving…' : 'Save Budget'}
        </button>
        {saveStatus === 'saved' && (
          <span className="budget-document-surface__saved">✓ Saved</span>
        )}
        {saveStatus === 'error' && (
          <span className="budget-document-surface__error">Save failed</span>
        )}
      </div>

      <div className="budget-document-surface__editor">
        <ProjectionTapTabEditor
          ref={editorRef}
          blocks={projection.blocks}
          slots={projection.slots}
          data={recordPayload}
          disabled={false}
        />
      </div>

      {/* Budget summary footer — computed from persisted data */}
      <div className="budget-document-surface__summary">
        <div className="budget-document-surface__summary-row">
          <span className="budget-document-surface__summary-label">Lines:</span>
          <span className="budget-document-surface__summary-value">
            {totals.lineCount}
          </span>
        </div>
        <div className="budget-document-surface__summary-row">
          <span className="budget-document-surface__summary-label">Total:</span>
          <span className="budget-document-surface__summary-value">
            ${totals.grandTotal.toFixed(2)}
          </span>
        </div>
      </div>

      <style>{`
        .budget-document-surface {
          display: flex;
          flex-direction: column;
          gap: 1rem;
        }

        .budget-document-surface__toolbar {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0;
        }

        .budget-document-surface__saved {
          color: #16a34a;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .budget-document-surface__error {
          color: #dc2626;
          font-weight: 600;
          font-size: 0.875rem;
        }

        .budget-document-surface__editor {
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          padding: 1rem;
          background: #fafbfc;
        }

        .budget-document-surface__summary {
          display: flex;
          gap: 2rem;
          padding: 0.75rem 1rem;
          background: #f1f5f9;
          border-radius: 8px;
          font-size: 0.875rem;
        }

        .budget-document-surface__summary-row {
          display: flex;
          gap: 0.5rem;
          align-items: center;
        }

        .budget-document-surface__summary-label {
          font-weight: 600;
          color: #64748b;
        }

        .budget-document-surface__summary-value {
          font-weight: 700;
          color: #0f172a;
        }
      `}</style>
    </div>
  )
}
