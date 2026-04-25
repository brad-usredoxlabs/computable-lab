/**
 * RunBudgetTab — owns data loading, save/export actions, and error state
 * for the budget workspace tab.
 */

import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../shared/api/client'
import { BudgetDocumentSurface } from './BudgetDocumentSurface'
import type { EditorProjectionResponse } from '../../types/uiSpec'

interface RunBudgetTabProps {
  runId: string
}

interface BudgetState {
  projection: EditorProjectionResponse | null
  budgetRecordId: string | null
  recordPayload: Record<string, unknown> | null
  saving: boolean
  saved: boolean
  saveError: string | null
  loading: boolean
  loadError: string | null
}

export function RunBudgetTab({ runId }: RunBudgetTabProps) {
  const [state, setState] = useState<BudgetState>({
    projection: null,
    budgetRecordId: null,
    recordPayload: null,
    saving: false,
    saved: false,
    saveError: null,
    loading: true,
    loadError: null,
  })

  // Load the budget record (or create one if none exists for this run)
  useEffect(() => {
    let cancelled = false
    setState((prev) => ({ ...prev, loading: true, loadError: null }))

    // Try to find an existing budget record for this run
    apiClient
      .listRecordsByKind('budget', 1, 0)
      .then(({ records }) => {
        if (cancelled) return
        if (records.length > 0) {
          // Load the existing budget with its editor projection and payload
          const budgetRecord = records[0]
          const payload = (budgetRecord.payload ?? {}) as Record<string, unknown>
          setState((prev) => ({
            ...prev,
            budgetRecordId: budgetRecord.recordId,
            recordPayload: payload,
            loading: false,
          }))
          apiClient
            .getRecordEditorProjection(budgetRecord.recordId)
            .then((projection) => {
              if (cancelled) return
              setState((prev) => ({
                ...prev,
                projection,
                loading: false,
              }))
            })
            .catch((err) => {
              if (cancelled) return
              setState((prev) => ({
                ...prev,
                loading: false,
                loadError:
                  err instanceof Error
                    ? err.message
                    : 'Failed to load budget projection',
              }))
            })
        } else {
          // No budget exists yet — show empty state
          setState((prev) => ({
            ...prev,
            loading: false,
            projection: null,
          }))
        }
      })
      .catch((err) => {
        if (cancelled) return
        setState((prev) => ({
          ...prev,
          loading: false,
          loadError:
            err instanceof Error
              ? err.message
              : 'Failed to load budget records',
        }))
      })

    return () => {
      cancelled = true
    }
  }, [runId])

  // Save handler — persists the budget record
  const handleSave = useCallback(
    async (payload: Record<string, unknown>) => {
      setState((prev) => ({
        ...prev,
        saving: true,
        saved: false,
        saveError: null,
      }))
      try {
        if (state.budgetRecordId) {
          await apiClient.updateRecord(state.budgetRecordId, payload)
        } else {
          const result = await apiClient.createRecord(
            'https://computable-lab.com/schema/computable-lab/budget.schema.yaml',
            payload,
          )
          if (result.record) {
            setState((prev) => ({
              ...prev,
              budgetRecordId: result.record.recordId,
              recordPayload: payload,
            }))
          }
        }
        setState((prev) => ({ ...prev, saving: false, saved: true }))
      } catch (err) {
        setState((prev) => ({
          ...prev,
          saving: false,
          saveError:
            err instanceof Error ? err.message : 'Failed to save budget',
        }))
      }
    },
    [state.budgetRecordId],
  )

  // Export handler — triggers CSV/HTML export via server endpoint
  const handleExport = useCallback(
    async (format: 'csv' | 'html') => {
      if (!state.budgetRecordId) return
      try {
        const response = await fetch(
          `/api/budget/${encodeURIComponent(
            state.budgetRecordId,
          )}/export?format=${format}`,
          { method: 'GET' },
        )
        if (!response.ok) throw new Error('Export failed')
        const blob = await response.blob()
        const url = window.URL.createObjectURL(blob)
        const a = document.createElement('a')
        a.href = url
        a.download = `budget-export.${format}`
        document.body.appendChild(a)
        a.click()
        document.body.removeChild(a)
        window.URL.revokeObjectURL(url)
      } catch (err) {
        setState((prev) => ({
          ...prev,
          saveError:
            err instanceof Error ? err.message : 'Export failed',
        }))
      }
    },
    [state.budgetRecordId],
  )

  if (state.loading) {
    return (
      <section className="run-workspace-card">
        <h2>Budget</h2>
        <p>Loading budget…</p>
      </section>
    )
  }

  if (state.loadError) {
    return (
      <section className="run-workspace-card">
        <h2>Budget</h2>
        <p className="error">{state.loadError}</p>
      </section>
    )
  }

  return (
    <section className="run-workspace-card run-workspace-budget">
      <div className="run-workspace-budget__header">
        <h2>Budget</h2>
        <div className="run-workspace-budget__actions">
          {state.saved && (
            <span className="run-workspace-budget__saved">✓ Saved</span>
          )}
          {state.saveError && (
            <span className="run-workspace-budget__error">
              {state.saveError}
            </span>
          )}
          {state.budgetRecordId && (
            <>
              <button
                type="button"
                className="run-workspace-header__secondary"
                onClick={() => handleExport('csv')}
              >
                Export CSV
              </button>
              <button
                type="button"
                className="run-workspace-header__secondary"
                onClick={() => handleExport('html')}
              >
                Export HTML
              </button>
            </>
          )}
        </div>
      </div>

      {state.projection && state.recordPayload ? (
        <BudgetDocumentSurface
          projection={state.projection}
          recordPayload={state.recordPayload}
          onSave={handleSave}
        />
      ) : (
        <div className="run-workspace-budget__empty">
          <p>No budget record found for this run.</p>
          <p>
            Generate a budget from the Plan tab first, or create one manually.
          </p>
        </div>
      )}
    </section>
  )
}
