/**
 * ProtocolTabPanel — Protocol tab for the workspace right pane.
 *
 * Displays protocol steps when viewing a run:
 * - Step chips with number, label, and description
 * - Visibility toggle per step (ghost events onto deck)
 * - Play button per step (open execution modal)
 * - Settings display with isControlled indicator
 * - Execution metadata (timestamps, deviations)
 * - "Play All" button to execute all steps in sequence
 *
 * Steps are fetched from the run data via the API. The component
 * uses the existing ExecutionModal and ExecutionContext patterns
 * from the ExecutionTabPanel.
 */

import { useCallback, useEffect, useState } from 'react'
import { ExecutionProvider } from '../../execution/ExecutionContext'
import { StepExecutionModal } from '../../../components/StepExecutionModal'
import type { StepInfo } from '../../../components/StepExecutionModal'
import type { AiProtocolCandidateStepSummary } from '../../../types/ai'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

export interface ProtocolStep {
  /** Unique step identifier. */
  stepId: string
  /** Display order within the protocol. */
  ordinal: number
  /** Human-readable step label. */
  label: string
  /** Optional step description. */
  description?: string
  /** Whether this step is currently visible on the deck. */
  visible: boolean
  /** Step settings with optional controlled indicators. */
  settings?: Array<{
    settingId: string
    label: string
    defaultValue: string
    isControlled?: boolean
  }>
  /** Execution provenance metadata. */
  executionMeta?: {
    startedAt: string
    completedAt?: string
    executedBy?: string
    deviationNote?: string
  }
  /** Uncertainty from the AI extraction. */
  uncertainty?: 'ambiguous' | 'inferred' | 'unresolved' | 'table-derived'
}

export interface ProtocolTabPanelProps {
  /** The run ID to fetch protocol steps for. */
  runId: string
  /** The study ID for workspace context. */
  studyId: string
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/**
 * Convert AiProtocolCandidateStepSummary into our internal ProtocolStep
 * shape so the UI has a consistent model regardless of data source.
 */
function toProtocolStep(
  step: AiProtocolCandidateStepSummary,
  index: number,
): ProtocolStep {
  return {
    stepId: `step-${step.stepNumber ?? index}`,
    ordinal: step.stepNumber ?? index + 1,
    label: step.title ?? `Step ${step.stepNumber ?? index + 1}`,
    description: step.text,
    visible: true,
    settings: [
      ...(step.materials ?? []).map((m, i) => ({
        settingId: `mat-${m}-${i}`,
        label: `Material ${i + 1}`,
        defaultValue: m,
      })),
      ...(step.labware ?? []).map((l, i) => ({
        settingId: `lab-${l}-${i}`,
        label: `Labware ${i + 1}`,
        defaultValue: l,
      })),
      ...(step.equipment ?? []).map((e, i) => ({
        settingId: `eq-${e}-${i}`,
        label: `Equipment ${i + 1}`,
        defaultValue: e,
      })),
    ].filter(Boolean),
    uncertainty: step.uncertainty,
  }
}

/* ------------------------------------------------------------------ */
/* Icons                                                                */
/* ------------------------------------------------------------------ */

function PlayIcon() {
  return (
    <svg className="w-3.5 h-3.5" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
    </svg>
  )
}

function PlayAllIcon() {
  return (
    <svg className="w-4 h-4" fill="currentColor" viewBox="0 0 24 24">
      <path d="M8 5v14l11-7z" />
      <path d="M3 5v14l2-1V6z" opacity={0.5} />
    </svg>
  )
}

function EyeIcon({ open }: { open: boolean }) {
  return (
    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      {open ? (
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M15 12a3 3 0 11-6 0 3 3 0 016 0z"
        />
      ) : (
        <>
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M13.875 18.625a9.513 9.513 0 01-5.3-1.77c-.385-.24-1.06-.24-1.445 0a9.513 9.513 0 01-5.3-1.77"
          />
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M3 3l18 18"
          />
        </>
      )}
    </svg>
  )
}

function WarningIcon() {
  return (
    <svg className="w-3.5 h-3.5 text-amber-500" fill="currentColor" viewBox="0 0 24 24">
      <path d="M12 2L1 21h22L12 2zm0 4v7m0 4v1" />
    </svg>
  )
}

/* ------------------------------------------------------------------ */
/* Uncertainty badge                                                    */
/* ------------------------------------------------------------------ */

const uncertaintyLabels: Record<string, string> = {
  ambiguous: 'Ambiguous',
  inferred: 'Inferred',
  unresolved: 'Unresolved',
  'table-derived': 'Table-derived',
}

function UncertaintyBadge({ uncertainty }: { uncertainty: string }) {
  return (
    <span
      className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-amber-50 text-amber-700 border border-amber-200"
      title={`Uncertainty: ${uncertainty}`}
    >
      <WarningIcon />
      {uncertaintyLabels[uncertainty] ?? uncertainty}
    </span>
  )
}

/* ------------------------------------------------------------------ */
/* Step chip component                                                  */
/* ------------------------------------------------------------------ */

interface StepChipProps {
  step: ProtocolStep
  isActive: boolean
  onToggle: () => void
  onPlay: () => void
  onSelect: () => void
}

function StepChip({ step, isActive, onToggle, onPlay, onSelect }: StepChipProps) {
  return (
    <div
      className="protocol-step-chip"
      data-active={isActive}
      onClick={() => onSelect()}
      style={{
        padding: '12px',
        background: isActive ? 'var(--cl-bg-elev-2)' : 'var(--cl-bg-elev)',
        border: `1px solid ${isActive ? 'var(--cl-accent)' : 'var(--cl-border)'}`,
        borderRadius: '6px',
        cursor: 'pointer',
        transition: 'background 100ms ease, border-color 100ms ease',
      }}
    >
      {/* Header row */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: '8px' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
            <span style={{ fontWeight: 600, fontSize: '13px' }}>
              Step {step.ordinal}: {step.label}
            </span>
            {step.uncertainty && <UncertaintyBadge uncertainty={step.uncertainty} />}
          </div>
          {step.description && (
            <div style={{ fontSize: '12px', color: 'var(--cl-text-dim)', marginTop: '2px', lineHeight: 1.4 }}>
              {step.description}
            </div>
          )}
        </div>

        {/* Actions */}
        <div style={{ display: 'flex', gap: '4px', flexShrink: 0, alignItems: 'flex-start' }}>
          {/* Visibility toggle */}
          <label
            className="inline-flex items-center gap-1 cursor-pointer"
            style={{ fontSize: '11px', color: 'var(--cl-text-dim)', padding: '4px 0' }}
            title={step.visible ? 'Hide step events' : 'Show step events'}
          >
            <input
              type="checkbox"
              checked={step.visible}
              onChange={(e) => { e.stopPropagation(); onToggle(); }}
              onClick={(e) => e.stopPropagation()}
            />
            <EyeIcon open={step.visible} />
          </label>

          {/* Play button */}
          <button
            className="inline-flex items-center gap-1"
            style={{
              padding: '4px 10px',
              fontSize: '11px',
              fontWeight: 600,
              background: 'var(--cl-accent)',
              color: '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: 'pointer',
              transition: 'opacity 100ms ease',
            }}
            onClick={(e) => { e.stopPropagation(); onPlay(); }}
            title={`Execute step ${step.ordinal}`}
          >
            <PlayIcon />
            Play
          </button>
        </div>
      </div>

      {/* Settings section */}
      {step.settings && step.settings.length > 0 && (
        <div style={{ marginTop: '8px', padding: '8px', background: 'var(--cl-bg)', borderRadius: '4px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: 'var(--cl-text-dim)', marginBottom: '4px' }}>
            Materials & Equipment
          </div>
          {step.settings.map((setting) => (
            <div key={setting.settingId} style={{ fontSize: '12px', display: 'flex', alignItems: 'center', gap: '4px' }}>
              <span style={{ color: 'var(--cl-text-dim)' }}>{setting.label}:</span>
              <span>{setting.defaultValue}</span>
              {setting.isControlled && (
                <span style={{ color: 'var(--cl-error)', fontSize: '10px' }} title="Controlled parameter">
                  🔒
                </span>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Execution metadata */}
      {step.executionMeta && (
        <div style={{ marginTop: '8px', fontSize: '11px', color: 'var(--cl-text-dim)', display: 'flex', flexDirection: 'column', gap: '2px' }}>
          <div>
            Started: {new Date(step.executionMeta.startedAt).toLocaleString()}
            {step.executionMeta.executedBy && <span> by {step.executionMeta.executedBy}</span>}
          </div>
          {step.executionMeta.completedAt && (
            <div>Completed: {new Date(step.executionMeta.completedAt).toLocaleString()}</div>
          )}
          {step.executionMeta.deviationNote && (
            <div style={{ color: 'var(--cl-warning)', fontStyle: 'italic' }}>
              Deviation: {step.executionMeta.deviationNote}
            </div>
          )}
        </div>
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Loading / error states                                               */
/* ------------------------------------------------------------------ */

function LoadingState() {
  return (
    <div style={{ padding: '16px', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
      <div style={{ color: 'var(--cl-text-dim)', fontSize: '13px' }}>Loading protocol…</div>
    </div>
  )
}

function ErrorState({ error }: { error: string }) {
  return (
    <div style={{ padding: '16px', color: 'var(--cl-error)', fontSize: '13px' }}>
      Failed to load protocol: {error}
    </div>
  )
}

function EmptyState() {
  return (
    <div style={{ padding: '16px', color: 'var(--cl-text-dim)', fontSize: '13px' }}>
      No protocol steps found for this run.
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inner panel (uses ExecutionProvider)                                 */
/* ------------------------------------------------------------------ */

function ProtocolTabPanelInner({ runId }: ProtocolTabPanelProps) {
  const [steps, setSteps] = useState<ProtocolStep[]>([])
  const [activeStepId, setActiveStepId] = useState<string | null>(null)
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  // Step execution modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingStep, setPendingStep] = useState<ProtocolStep | null>(null)

  // Fetch protocol steps on mount
  useEffect(() => {
    let cancelled = false

    async function fetchSteps() {
      setIsLoading(true)
      setError(null)
      try {
        // Try to get protocol steps from the run's protocol context
        const res = await fetch(`/api/protocols/${runId}/steps`)
        if (!res.ok) {
          // Fallback: try getting the protocol candidate from the run
          const fallbackRes = await fetch(`/api/runs/${runId}/protocol-candidate`)
          if (!fallbackRes.ok) {
            throw new Error(`Failed to load protocol steps (${res.status} / ${fallbackRes.status})`)
          }
          const fallbackData = await fallbackRes.json()
          const candidateSteps = fallbackData?.candidate?.steps ?? fallbackData?.steps ?? []
          if (!cancelled) {
            setSteps(candidateSteps.map((s: any, i: number) => toProtocolStep(s, i)))
            setError(null)
          }
        } else {
          const data = await res.json()
          const rawSteps = data?.steps ?? data ?? []
          if (!cancelled) {
            setSteps(rawSteps.map((s: any, i: number) => toProtocolStep(s, i)))
          }
        }
      } catch (err) {
        if (!cancelled) {
          // If the API doesn't exist yet, start with empty steps
          // The execution tab panel uses MOCK_STEPS as a pattern
          setError(err instanceof Error ? err.message : String(err))
          setSteps([])
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchSteps()
    return () => { cancelled = true }
  }, [runId])

  const handleToggleVisibility = useCallback((stepId: string) => {
    setSteps(prev => prev.map(s => s.stepId === stepId ? { ...s, visible: !s.visible } : s))
  }, [])

  const handlePlayStep = useCallback((step: ProtocolStep) => {
    setPendingStep(step)
    setModalOpen(true)
  }, [])

  const handlePlayAll = useCallback(() => {
    // Open modal for the first pending step, then chain through all
    const firstPending = steps.find(s => !s.executionMeta?.completedAt)
    if (firstPending) {
      handlePlayStep(firstPending)
    }
  }, [steps, handlePlayStep])

  /**
   * Convert ProtocolStep settings into StepInfo-compatible format for
   * the StepExecutionModal.
   */
  const buildStepInfo = useCallback((step: ProtocolStep): StepInfo => {
    return {
      stepId: step.stepId,
      label: `Step ${step.ordinal}: ${step.label}`,
      settings: step.settings?.map(s => ({
        settingId: s.settingId,
        label: s.label,
        type: 'string',
        defaultValue: s.defaultValue,
        isControlled: s.isControlled ?? false,
      })) ?? [],
    }
  }, [])

  const handleModalSubmit = useCallback(async (data: {
    stepId: string
    startedAt: string
    completedAt?: string
    settings?: Record<string, any>
    deviations?: Array<{ code: string; message: string; severity: string }>
  }) => {
    try {
      // Call the step execution API
      const res = await fetch(`/api/runs/${runId}/steps/${data.stepId}/execute`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          startedAt: data.startedAt,
          completedAt: data.completedAt,
          settings: data.settings,
          deviations: data.deviations,
        }),
      })

      if (!res.ok) {
        const errBody = await res.json().catch(() => null)
        throw new Error(errBody?.message ?? `API error ${res.status}`)
      }

      // Reload steps to reflect server-side updates
      setSteps(prev => prev.map(s =>
        s.stepId === data.stepId
          ? {
              ...s,
              executionMeta: {
                startedAt: data.startedAt,
                completedAt: data.completedAt,
                executedBy: s.executionMeta?.executedBy,
                deviationNote: data.deviations?.map(d => d.message).join('; ') ?? s.executionMeta?.deviationNote,
              },
            }
          : s
      ))

      setModalOpen(false)
      setPendingStep(null)
    } catch (err) {
      console.error('Failed to update step execution:', err)
      // Error is surfaced via the modal's own error state
    }
  }, [runId])

  if (isLoading) return <LoadingState />
  if (error && steps.length === 0) return <ErrorState error={error} />
  if (steps.length === 0) return <EmptyState />

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', height: '100%' }}>
      {/* Header */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px' }}>
        <div>
          <h3 style={{ fontSize: '14px', margin: 0, fontWeight: 600 }}>Protocol Steps</h3>
          <p style={{ fontSize: '11px', color: 'var(--cl-text-dim)', margin: '2px 0 0' }}>
            Run: {runId} · {steps.length} steps
          </p>
        </div>
        <button
          className="inline-flex items-center gap-1.5"
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            background: 'var(--cl-accent)',
            color: '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: 'pointer',
          }}
          onClick={handlePlayAll}
          title="Execute all remaining steps"
        >
          <PlayAllIcon />
          Play All
        </button>
      </div>

      {/* Step chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step) => (
          <StepChip
            key={step.stepId}
            step={step}
            isActive={activeStepId === step.stepId}
            onToggle={() => handleToggleVisibility(step.stepId)}
            onPlay={() => handlePlayStep(step)}
            onSelect={() => setActiveStepId(activeStepId === step.stepId ? null : step.stepId)}
          />
        ))}
      </div>

      {/* Step execution modal */}
      {pendingStep && (
        <StepExecutionModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setPendingStep(null) }}
          onSubmit={handleModalSubmit}
          step={buildStepInfo(pendingStep)}
        />
      )}
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Public component (wrapped in ExecutionProvider)                      */
/* ------------------------------------------------------------------ */

/**
 * ProtocolTabPanel — renders inside the right pane when mode === 'protocol'.
 *
 * Fetches protocol steps for the given run and displays them as interactive
 * chips with visibility toggles, play buttons, and settings display.
 */
export function ProtocolTabPanel({ runId, studyId: _studyId }: ProtocolTabPanelProps) {
  // studyId kept in the props interface for backward compatibility with RightPane
  void _studyId
  return (
    <ExecutionProvider>
      <ProtocolTabPanelInner runId={runId} studyId={_studyId} />
    </ExecutionProvider>
  )
}
