/**
 * ProtocolTabPanel — Protocol tab for the workspace right pane.
 *
 * Displays protocol steps when viewing a run:
 * - Run metadata header (editable run name, operator, mode, Play All)
 * - Step chips with number, label, and description
 * - Visibility toggle per step (ghost events onto deck)
 * - Play button per step (open execution modal)
 * - Settings display with isControlled indicator
 * - Execution metadata (timestamps, deviations) with editable completion time
 * - "Play All" button to execute all steps in sequence
 *
 * Steps are fetched from the run data via the API. The component
 * uses the existing ExecutionModal, ExecutionContext, and useExecutionState
 * patterns from the ExecutionTabPanel.
 */

import { useCallback, useEffect, useMemo, useState } from 'react'
import { ExecutionProvider, useExecution } from '../../execution/ExecutionContext'
import { StepExecutionModal } from '../../../components/StepExecutionModal'
import type { StepInfo } from '../../../components/StepExecutionModal'
import type { PlateEvent } from '../../../types/events'
import { updateExecutionState } from '../../../shared/api/execution'
import { apiClient, type ProtocolContextResponse } from '../../../shared/api/client'
import { SettingsPanel, type Setting } from './SettingsPanel'
import { useProtocolSelection, ProtocolSelectionProvider, type ProtocolStepGraph } from '../../protocol/ProtocolSelectionContext'
import { ProtocolSelector } from './ProtocolSelector'
import { StepDetailPane } from '../../../run/protocol-planning/StepDetailPane'
import { StepLocalizationPane } from './StepLocalizationPane'
import { SetupSectionWidget } from '../../../editor/taptab/widgets/LocalProtocolSetupWidgets'
import type { LocalProtocolSetupRows } from './StepLocalizationPane'
import './protocolTabPanel.css'

/* ------------------------------------------------------------------ */
/* Types                                                                */
/* ------------------------------------------------------------------ */

/** Minimal shape of an event graph returned by the sub-graph API. */
interface EventGraph {
  id: string
  name?: string
  description?: string
  stepId?: string
  phaseId?: string
  events: Array<Record<string, unknown>>
  labwares: Array<Record<string, unknown>>
}

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
  /** Compiled sub-graph for this step (fetched on demand). */
  subGraph?: EventGraph
}

export interface ProtocolTabPanelProps {
  /** The run ID to fetch protocol steps for. Null means no active run context. */
  runId: string | null
  /** The study ID for workspace context. */
  studyId: string
}

/* ------------------------------------------------------------------ */
/* Helpers                                                              */
/* ------------------------------------------------------------------ */

/** A concise one-line title for a step, derived from its long-form label. */
function briefLabel(label: string | undefined): string | undefined {
  if (!label) return undefined
  const first = label.split(/\r?\n/)[0]?.trim()
  if (!first) return undefined
  return first.length > 88 ? `${first.slice(0, 88)}…` : first
}

/** Fields the step chip + localized step need, regardless of data source. */
interface MappedStep {
  stepId?: string
  stepNumber?: number
  ordinal?: number
  title?: string
  label?: string
  text?: string
  notes?: string
  description?: string
  uncertainty?: ProtocolStep['uncertainty']
  materials?: string[]
  labware?: string[]
  equipment?: string[]
}

/**
 * Convert Ak protocol step into our internal ProtocolStep shape so the UI has
 * a consistent model regardless of data source. The `/api/protocols/{id}/steps`
 * path carries the full step text in `label`; the extraction path uses
 * `title`/`text` — map both.
 */
function toProtocolStep(step: MappedStep, index: number): ProtocolStep {
  const ordinal = step.ordinal ?? step.stepNumber ?? index + 1
  return {
    stepId: typeof step.stepId === 'string' && step.stepId ? step.stepId : `step-${step.stepNumber ?? index}`,
    ordinal,
    label: step.title ?? briefLabel(step.label ?? step.description) ?? `Step ${ordinal}`,
    description: step.text ?? step.label ?? step.description ?? step.notes,
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

/**
 * Generate a default run name from the current date and protocol label.
 * e.g. "2026-07-29 Incubation Run"
 */
function defaultRunName(protocolLabel: string): string {
  const now = new Date()
  const dateStr = now.toISOString().slice(0, 10)
  return `${dateStr} ${protocolLabel} Run`
}

/**
 * Split a long-form (humanStepsText) protocol into ordinal-keyed sections on
 * lines starting with /^\s*\d+\./. Returns { } when nothing splits, so callers
 * fall back to the whole text keyed at 1.
 */
export function splitHumanSteps(text: string): Record<number, string> {
  const sections: Record<number, string> = {}
  let cur: number | null = null
  const buf: string[] = []
  const flush = () => {
    if (cur !== null) {
      const content = buf.join('\n').trim()
      if (content) sections[cur] = content
    }
    buf.length = 0
  }
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^\s*(\d+)\.\s?(.*)$/)
    if (m) {
      flush()
      cur = parseInt(m[1], 10)
      if (m[2]) buf.push(m[2])
    } else {
      buf.push(line)
    }
  }
  flush()
  if (Object.keys(sections).length === 0) return { 1: text }
  return sections
}

/**
 * Extract the plate-setting sections (labwares/equipment/materials rows) from
 * a resolved protocol record. Returns null when the record is not a
 * local-protocol or declares no setup rows — so the Protocol tab only shows
 * the "This assay needs" block for local-protocol runs.
 */
export function extractLocalProtocolSetup(
  record: object | null | undefined,
): LocalProtocolSetupRows | null {
  const candidate = record as
    | (Record<string, unknown> & { payload?: unknown })
    | null
    | undefined
  const payload = (candidate?.payload ?? candidate) as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object') return null
  if (payload.kind !== 'local-protocol') return null
  const pick = (v: unknown): Array<Record<string, unknown>> | undefined =>
    Array.isArray(v) && v.length > 0
      ? (v as Array<Record<string, unknown>>)
      : undefined
  const labwares = pick(payload.labwares)
  const equipment = pick(payload.equipment)
  const materials = pick(payload.materials)
  if (!labwares && !equipment && !materials) return null
  return {
    ...(labwares ? { labwares } : {}),
    ...(equipment ? { equipment } : {}),
    ...(materials ? { materials } : {}),
  }
}

/**
 * Derive read-only plate-setting rows from a UNIVERSAL protocol's declared
 * abstract roles (roles.labwareRoles / instrumentRoles / materialRoles). Used
 * as a fallback preview when a run is attached directly to a universal
 * protocol (no local protocol in the chain): the Protocol tab shows what the
 * assay needs in role form, so the biologist sees the setup surface before
 * specializing into a local protocol. Rows have no `ref` — a universal
 * protocol declares roles, not concrete bindings — and the section renders
 * read-only.
 */
export function extractUniversalProtocolSetup(
  record: object | null | undefined,
): LocalProtocolSetupRows | null {
  const candidate = record as
    | (Record<string, unknown> & { payload?: unknown })
    | null
    | undefined
  const payload = (candidate?.payload ?? candidate) as Record<string, unknown> | null
  if (!payload || typeof payload !== 'object') return null
  if (payload.kind !== 'protocol') return null
  const roles = payload.roles as Record<string, unknown> | undefined
  if (!roles || typeof roles !== 'object') return null
  const toRows = (v: unknown): Array<Record<string, unknown>> | undefined => {
    if (!Array.isArray(v)) return undefined
    const rows = (v as Array<Record<string, unknown>>).flatMap((r) => {
      const role = typeof r?.roleId === 'string' ? r.roleId : ''
      if (!role) return [] // a setup row without a role name is useless
      const description = typeof r?.description === 'string' ? r.description : ''
      return [{ role, ...(description ? { description } : {}) }]
    })
    return rows.length > 0 ? rows : undefined
  }
  const labwares = toRows(roles.labwareRoles)
  const equipment = toRows(roles.instrumentRoles)
  const materials = toRows(roles.materialRoles)
  if (!labwares && !equipment && !materials) return null
  return {
    ...(labwares ? { labwares } : {}),
    ...(equipment ? { equipment } : {}),
    ...(materials ? { materials } : {}),
  }
}

/**
 * Format a datetime-local value from an ISO string.
 * Converts "2026-07-29T10:30:00Z" → "2026-07-29T10:30"
 */
function toDatetimeLocal(isoStr: string): string {
  const d = new Date(isoStr)
  const pad = (n: number) => n.toString().padStart(2, '0')
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`
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

function ClockIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m0 0h3v-3m-3 3V4a9 9 0 110 18 9 9 0 010-18z" />
    </svg>
  )
}

function PencilIcon() {
  return (
    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.07 4.458a1.5 1.5 0 01-2.122 0l-2.104-2.104a1.5 1.5 0 010-2.122l2.104-2.104a1.5 1.5 0 012.122 0l-1.414 1.414z" />
    </svg>
  )
}

function CheckIcon() {
  return (
    <svg className="w-3 h-3" fill="currentColor" viewBox="0 0 24 24">
      <path d="M9 16.17l-4.24-4.24 1.42-1.42L9 13.33l7.81-7.81 1.42 1.42z" />
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
  /** Called when the completion timestamp is edited. */
  onCompletionChange?: (stepId: string, completedAt: string) => void
}

function StepChip({ step, isActive, onToggle, onPlay, onSelect, onCompletionChange }: StepChipProps) {
  const [editingTime, setEditingTime] = useState<string | null>(null)

  // Determine which timestamp to show: completedAt > startedAt
  const displayTime = step.executionMeta?.completedAt ?? step.executionMeta?.startedAt
  const isComplete = !!step.executionMeta?.completedAt

  const handleTimeBlur = () => {
    if (editingTime && editingTime !== toDatetimeLocal(displayTime ?? new Date().toISOString())) {
      onCompletionChange?.(step.stepId, new Date(editingTime).toISOString())
    }
    setEditingTime(null)
  }

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
            {isComplete && (
              <span
                className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[10px] font-medium bg-emerald-50 text-emerald-700 border border-emerald-200"
              >
                <CheckIcon /> Done
              </span>
            )}
          </div>
          {step.description && (
            <div
              style={{
                fontSize: '12px',
                color: 'var(--cl-text-dim)',
                marginTop: '2px',
                lineHeight: 1.4,
                display: '-webkit-box',
                WebkitLineClamp: 3,
                WebkitBoxOrient: 'vertical',
                overflow: 'hidden',
              }}
            >
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
              background: isComplete ? 'var(--cl-border)' : 'var(--cl-accent)',
              color: isComplete ? 'var(--cl-text-dim)' : '#fff',
              border: 'none',
              borderRadius: '4px',
              cursor: isComplete ? 'default' : 'pointer',
              transition: 'opacity 100ms ease',
              opacity: isComplete ? 0.5 : 1,
            }}
            onClick={(e) => {
              e.stopPropagation()
              if (!isComplete) onPlay()
            }}
            title={isComplete ? 'Step already completed' : `Execute step ${step.ordinal}`}
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
            <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
              <ClockIcon />
              {editingTime === step.stepId ? (
                <input
                  type="datetime-local"
                  value={toDatetimeLocal(step.executionMeta.completedAt)}
                  onChange={(e) => {
                    e.stopPropagation()
                    setEditingTime(step.stepId)
                    // Update on change with debounce handled by blur
                    onCompletionChange?.(step.stepId, new Date(e.target.value).toISOString())
                  }}
                  onBlur={handleTimeBlur}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') handleTimeBlur()
                    if (e.key === 'Escape') setEditingTime(null)
                  }}
                  onClick={(e) => e.stopPropagation()}
                  style={{
                    fontSize: '11px',
                    color: 'var(--cl-text-dim)',
                    background: 'var(--cl-bg)',
                    border: '1px solid var(--cl-border)',
                    borderRadius: '3px',
                    padding: '2px 4px',
                    cursor: 'pointer',
                  }}
                />
              ) : (
                <span
                  onClick={(e) => {
                    e.stopPropagation()
                    setEditingTime(step.stepId)
                  }}
                  style={{ cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: '3px' }}
                  title="Click to edit completion time"
                >
                  Completed: {new Date(step.executionMeta.completedAt).toLocaleString()}
                  <PencilIcon />
                </span>
              )}
            </div>
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
/* Run metadata header                                                  */
/* ------------------------------------------------------------------ */

interface RunHeaderProps {
  runId: string
  stepCount: number
  mode: 'planning' | 'executing'
  onToggleMode: () => void
  operatorName: string
  runName: string
  onRunNameChange: (name: string) => void
  onPlayAll: () => void
}

function RunHeader({
  runId,
  stepCount,
  mode,
  onToggleMode,
  operatorName,
  runName,
  onRunNameChange,
  onPlayAll,
}: RunHeaderProps) {
  const [editingName, setEditingName] = useState(false)
  const [draftName, setDraftName] = useState(runName)

  useEffect(() => {
    setDraftName(runName)
  }, [runName])

  const handleNameBlur = () => {
    if (draftName.trim() && draftName !== runName) {
      onRunNameChange(draftName.trim())
    } else {
      setDraftName(runName)
    }
    setEditingName(false)
  }

  const isPlanning = mode === 'planning'

  return (
    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '4px', gap: '12px', flexWrap: 'wrap' }}>
      {/* Left: run name + metadata */}
      <div style={{ flex: 1, minWidth: 0 }}>
        {/* Editable run name */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
          <h3 style={{ fontSize: '14px', margin: 0, fontWeight: 600, flex: 1 }}>
            {editingName ? (
              <input
                type="text"
                value={draftName}
                onChange={(e) => setDraftName(e.target.value)}
                onBlur={handleNameBlur}
                onKeyDown={(e) => {
                  if (e.key === 'Enter') handleNameBlur()
                  if (e.key === 'Escape') { setDraftName(runName); setEditingName(false) }
                }}
                autoFocus
                onClick={(e) => e.stopPropagation()}
                style={{
                  fontSize: '14px',
                  fontWeight: 600,
                  width: '100%',
                  background: 'transparent',
                  border: '1px solid var(--cl-accent)',
                  borderRadius: '3px',
                  padding: '2px 4px',
                  outline: 'none',
                }}
              />
            ) : (
              <span
                onClick={() => { setEditingName(true); setDraftName(runName) }}
                style={{ cursor: 'pointer', borderBottom: '1px dashed var(--cl-text-dim)' }}
                title="Click to edit run name"
              >
                {runName}
              </span>
            )}
          </h3>
        </div>
        <p style={{ fontSize: '11px', color: 'var(--cl-text-dim)', margin: '2px 0 0' }}>
          Run: {runId} · {stepCount} steps · Operator: {operatorName}
        </p>
      </div>

      {/* Right: mode indicator + Play All */}
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        {/* Mode indicator */}
        <button
          onClick={onToggleMode}
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: '4px',
            padding: '4px 10px',
            fontSize: '11px',
            fontWeight: 600,
            border: 'none',
            borderRadius: '9999px',
            cursor: 'pointer',
            background: isPlanning ? 'var(--cl-bg-elev-2)' : 'rgba(16, 185, 129, 0.15)',
            color: isPlanning ? 'var(--cl-text-dim)' : '#059669',
            transition: 'background 150ms ease, color 150ms ease',
          }}
          title={isPlanning ? 'Click to start executing' : 'Click to return to planning'}
        >
          <span
            style={{
              width: '6px',
              height: '6px',
              borderRadius: '50%',
              background: isPlanning ? 'var(--cl-text-dim)' : '#10b981',
              display: 'inline-block',
              transition: 'background 150ms ease',
            }}
          />
          {isPlanning ? 'Planning' : 'Executing'}
        </button>

        {/* Play All button — disabled in plan mode */}
        <button
          className="inline-flex items-center gap-1.5"
          style={{
            padding: '6px 12px',
            fontSize: '12px',
            fontWeight: 600,
            background: isPlanning ? 'var(--cl-bg-elev-2)' : 'var(--cl-accent)',
            color: isPlanning ? 'var(--cl-text-dim)' : '#fff',
            border: 'none',
            borderRadius: '4px',
            cursor: isPlanning ? 'default' : 'pointer',
            opacity: isPlanning ? 0.4 : 1,
            transition: 'opacity 150ms ease, background 150ms ease',
          }}
          onClick={() => !isPlanning && onPlayAll()}
          title={isPlanning ? 'Switch to Executing mode to play all steps' : 'Execute all remaining steps'}
          disabled={isPlanning}
        >
          <PlayAllIcon />
          Play All
        </button>
      </div>
    </div>
  )
}

/* ------------------------------------------------------------------ */
/* Inner panel (uses ExecutionProvider)                                 */
/* ------------------------------------------------------------------ */

function ProtocolTabPanelInner({ runId, studyId }: ProtocolTabPanelProps) {
  // No run context — can't fetch protocol steps or attach a protocol.
  // Show a helpful message directing the user to open a run first.
  if (!runId) {
    return (
      <div style={{ padding: '16px', display: 'flex', flexDirection: 'column', gap: '8px' }}>
        <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--cl-text)' }}>
          No run selected
        </div>
        <p style={{ fontSize: '12px', color: 'var(--cl-text-dim)', lineHeight: 1.4 }}>
          Open a run from the{' '}
          <strong style={{ color: 'var(--cl-text)' }}>Find</strong> tab to
          see protocol steps here, or select a protocol to attach to a run.
        </p>
      </div>
    )
  }

  const [steps, setSteps] = useState<ProtocolStep[]>([])
  const protocolSelection = useProtocolSelection()
  const activeStepId = protocolSelection?.activeStepId ?? null
  const setActiveStepId = protocolSelection?.setActiveStepId ?? (() => {})
  const visibleSteps = protocolSelection?.visibleSteps ?? new Set<string>()
  const toggleStepVisibility = protocolSelection?.toggleStepVisibility ?? (() => {})
  const setVisibleSteps = protocolSelection?.setVisibleSteps ?? (() => {})
  const contextStepGraphs = protocolSelection?.stepGraphs ?? {}
  const setContextStepGraph = protocolSelection?.setStepGraph ?? (() => {})
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [noProtocol, setNoProtocol] = useState(false)
  const [protocolContext, setProtocolContext] = useState<ProtocolContextResponse | null>(null)
  const [refetchTrigger, setRefetchTrigger] = useState(0)
  // Plate-setting sections declared on the run's local protocol (if the
  // attached protocol is an LPR-*). Rendered above the step chips and fed to
  // each StepLocalizationPane as read-only localization context.
  const [localProtocolId, setLocalProtocolId] = useState<string | null>(null)
  const [localSetup, setLocalSetup] = useState<LocalProtocolSetupRows | null>(null)
  // True when the setup rows shown are a read-only PREVIEW derived from a
  // universal protocol's declared roles (run attached directly to a universal
  // protocol, no local protocol in the chain) — as opposed to concrete rows
  // stored on an LPR (editable, persisted back to the record).
  const [setupIsPreview, setSetupIsPreview] = useState(false)

  // Step settings keyed by stepId (fetched on demand when a step is selected)
  const [stepSettings, setStepSettings] = useState<Record<string, Setting[]>>({})

  // Phase D: long-form protocol text (humanStepsText) + the currently expanded
  // step's detail pane. Selecting a step drives the deck ghost (current highlight).
  const [humanStepsText, setHumanStepsText] = useState<string | null>(null)
  const [expandedStepId, setExpandedStepId] = useState<string | null>(null)

  // Step execution modal state
  const [modalOpen, setModalOpen] = useState(false)
  const [pendingStep, setPendingStep] = useState<ProtocolStep | null>(null)

  // Run metadata state
  const [runName, setRunName] = useState('')
  const [mode, setMode] = useState<'planning' | 'executing'>('planning')

  // Execution context — provides start/complete execution lifecycle
  const { state: execState, startExecution, setStep: setExecStep, abortExecution } = useExecution()

  // Sync mode with execution context
  useEffect(() => {
    if (execState.isActive && mode === 'planning') {
      setMode('executing')
    } else if (!execState.isActive && mode === 'executing') {
      setMode('planning')
    }
  }, [execState.isActive, mode])

  // Derive operator name from execution metadata or default
  const operatorName = useMemo(() => {
    return execState.metadata?.operatorName ?? 'Operator'
  }, [execState.metadata?.operatorName])

  // Generate default run name on mount
  useEffect(() => {
    if (!runName) {
      setRunName(defaultRunName('Protocol'))
    }
  }, [runName])

  // Fetch protocol steps on mount
  useEffect(() => {
    let cancelled = false

    async function fetchSteps() {
      if (!runId) return
      setIsLoading(true)
      setError(null)

      // Resolve the run's attached protocol id: run → plannedRunRef (PLR) →
      // protocolRef. `/api/protocols/{id}/steps` requires a PROTOCOL id, not
      // the run id (which would 400 NOT_A_PROTOCOL and hide the steps).
      let protocolId: string | null = null
      try {
        const runEnv = await apiClient.getRecord(runId)
        const rp = (runEnv?.payload ?? runEnv) as Record<string, unknown> | null
        const plr = rp?.plannedRunRef as { id?: string } | undefined
        if (plr?.id) {
          const plrEnv = await apiClient.getRecord(plr.id)
          const pp = (plrEnv?.payload ?? plrEnv) as Record<string, unknown> | null
          const protoRef = (pp?.protocolRef ?? pp?.sourceRef) as { id?: string } | undefined
          if (typeof protoRef?.id === 'string') protocolId = protoRef.id
        }
      } catch {
        // resolution failed — fall back to the run id below
      }
      // Fetch the attached protocol's record ONCE, up front: (1) its
      // plate-setting sections (when it is a local-protocol / LPR-*), rendered
      // above the step chips and riding in every localization prompt; (2) any
      // long-form text; and (3) for an LPR, the inherited universal protocol's
      // id — `/api/protocols/{id}/steps` only accepts a UNIVERSAL protocol id
      // (400 NOT_A_PROTOCOL for an LPR), so steps are fetched from the
      // inherited protocol.
      const attachedId = protocolId ?? runId
      let stepsId = attachedId
      let resolvedSetup: LocalProtocolSetupRows | null = null
      let resolvedIsPreview = false
      try {
        const env = await apiClient.getRecord(attachedId)
        if (!cancelled) {
          const pp = (env?.payload ?? env) as Record<string, unknown> | null
          const t = pp?.humanStepsText
          if (typeof t === 'string') setHumanStepsText(t)
          resolvedSetup = extractLocalProtocolSetup(env)
          if (pp?.kind === 'local-protocol') {
            const inh = pp?.inherits_from as { id?: string } | undefined
            if (typeof inh?.id === 'string') stepsId = inh.id
          } else if (pp?.kind === 'protocol') {
            // Run attached DIRECTLY to a universal protocol (no local
            // protocol in the chain): show the declared roles as a read-only
            // "This assay needs" preview so the setup surface is visible
            // before the run is specialized into an LPR.
            const preview = extractUniversalProtocolSetup(env)
            if (preview) {
              resolvedSetup = preview
              resolvedIsPreview = true
            }
          }
        }
      } catch {
        // non-fatal — step detail stays collapsed; no setup sections shown
      }
      if (!cancelled) {
        if (resolvedSetup) {
          setLocalProtocolId(resolvedIsPreview ? null : attachedId)
          setLocalSetup(resolvedSetup)
          setSetupIsPreview(resolvedIsPreview)
        } else {
          setLocalProtocolId(null)
          setLocalSetup(null)
          setSetupIsPreview(false)
        }
      }

      // For an LPR, the long-form text lives on the INHERITED universal
      // protocol (the steps are read from it too) — fetch it once.
      if (!cancelled && stepsId !== attachedId) {
        try {
          const parentEnv = await apiClient.getRecord(stepsId)
          if (!cancelled) {
            const pp = (parentEnv?.payload ?? parentEnv) as Record<string, unknown> | null
            const t = pp?.humanStepsText
            if (typeof t === 'string') setHumanStepsText(t)
          }
        } catch {
          // non-fatal — step detail just stays collapsed
        }
      }

      try {
        // Try to get protocol steps from the run's protocol context
        const res = await fetch(`/api/protocols/${stepsId}/steps`)
        if (!res.ok) {
          // Fallback 1: try the extraction API
          const extRes = await fetch(`/api/extractions/${runId}/protocol-steps`)
          if (!extRes.ok) {
            // Fallback 2: try getting the protocol candidate from the run
            const fallbackRes = await fetch(`/api/runs/${runId}/protocol-candidate`)
            if (!fallbackRes.ok) {
              throw new Error(`Failed to load protocol steps (${res.status} / ${extRes.status} / ${fallbackRes.status})`)
            }
            const fallbackData = await fallbackRes.json()
            const candidateSteps = fallbackData?.candidate?.steps ?? fallbackData?.steps ?? []
            if (!cancelled) {
              setSteps(candidateSteps.map((s: any, i: number) => toProtocolStep(s, i)))
              setError(null)
            }
          } else {
            const extData = await extRes.json()
            const extSteps = extData?.steps ?? extData ?? []
            if (!cancelled) {
              setSteps(extSteps.map((s: any, i: number) => toProtocolStep(s, i)))
              setError(null)
            }
          }
        } else {
          const data = await res.json()
          const rawSteps = data?.steps ?? data ?? []
          if (!cancelled) {
            setSteps(rawSteps.map((s: any, i: number) => toProtocolStep(s, i)))
          }
          if (typeof data?.humanStepsText === 'string') {
            if (!cancelled) setHumanStepsText(data.humanStepsText)
          }
          // When the steps endpoint doesn't carry the text, the record fetch
          // below (loadProtocolRecordExtras) fills it in.
        }
      } catch (err) {
        if (!cancelled) {
          // All three endpoints failed — no protocol is attached to this run.
          // Show the protocol selector instead of an error.
          setError(null)
          setNoProtocol(true)
          setSteps([])
          try {
            const ctx = await apiClient.getProtocolContext({ studyId })
            if (!cancelled) setProtocolContext(ctx)
          } catch {
            // If context fetch also fails, selector will show empty state
          }
        }
      } finally {
        if (!cancelled) setIsLoading(false)
      }
    }

    void fetchSteps()
    return () => { cancelled = true }
  }, [runId, refetchTrigger])

  // Initialize visibleSteps when steps are first loaded — all steps
  // default to visible so their events ghost onto the canvas.
  useEffect(() => {
    if (steps.length > 0 && visibleSteps.size === 0) {
      setVisibleSteps(steps.map(s => s.stepId))
    }
  }, [steps, visibleSteps.size, setVisibleSteps])

  /**
   * Persist a changed plate-setting section back to the run's local-protocol
   * record and refresh the in-memory copy. Read-modify-write on the full
   * payload so concurrent edits to other fields survive.
   */
  const patchSetup = useCallback(async (key: 'labwares' | 'equipment' | 'materials', rows: unknown[]) => {
    if (!localProtocolId) return
    try {
      const env = await apiClient.getRecord(localProtocolId).catch(() => null)
      const payload = (env?.payload ?? env) as Record<string, unknown>
      await apiClient.updateRecord(localProtocolId, { ...payload, [key]: rows })
      setLocalSetup((prev) => (prev ? { ...prev, [key]: rows } : prev))
      // Let any TapTab form (or other record subscriber) resync the record.
      window.dispatchEvent(new CustomEvent('cl:records-changed'))
    } catch (err) {
      console.warn('Failed to save plate setup section:', err)
    }
  }, [localProtocolId])

  /** Fetch the compiled sub-graph for a single step. */
  const fetchStepGraph = useCallback(async (stepId: string): Promise<EventGraph | null> => {
    // Return cached graph if available (from ProtocolSelectionContext)
    if (contextStepGraphs[stepId]) {
      return contextStepGraphs[stepId] as unknown as EventGraph;
    }
    try {
      const res = await fetch(`/api/protocols/${runId}/steps/${stepId}/graph`);
      if (!res.ok) {
        console.warn(`Failed to fetch sub-graph for step ${stepId}: ${res.status}`);
        return null;
      }
      const data = await res.json();
      const graph: EventGraph = data?.graph ?? data;
      if (graph) {
        setContextStepGraph(stepId, graph as unknown as ProtocolStepGraph);
      }
      return graph ?? null;
    } catch (err) {
      console.error(`Error fetching sub-graph for step ${stepId}:`, err);
      return null;
    }
  }, [runId, contextStepGraphs, setContextStepGraph]);

  /** Fetch settings for a single step. */
  const fetchStepSettings = useCallback(async (stepId: string): Promise<void> => {
    // Return early if already cached
    if (stepSettings[stepId]) {
      return;
    }
    try {
      const res = await fetch(`/api/protocols/${runId}/steps/${stepId}/settings`);
      if (!res.ok) {
        console.warn(`Failed to fetch settings for step ${stepId}: ${res.status}`);
        return;
      }
      const data = await res.json();
      const fetchedSettings: Setting[] = data?.settings ?? [];
      setStepSettings(prev => ({ ...prev, [stepId]: fetchedSettings }));
    } catch (err) {
      console.error(`Error fetching settings for step ${stepId}:`, err);
    }
  }, [runId, stepSettings]);

  /** Called when settings are saved for a step. */
  const handleSettingsSave = useCallback((stepId: string, savedSettings: Setting[]) => {
    setStepSettings(prev => ({ ...prev, [stepId]: savedSettings }));
  }, []);

  const handleToggleVisibility = useCallback(async (stepId: string) => {
    // Fetch sub-graph before toggling visibility so the canvas has events to show
    await fetchStepGraph(stepId);
    toggleStepVisibility(stepId);
    setSteps(prev => prev.map(s => s.stepId === stepId ? { ...s, visible: !s.visible } : s));
  }, [fetchStepGraph, toggleStepVisibility]);

  const handlePlayStep = useCallback((step: ProtocolStep) => {
    // Set execution step context
    setExecStep(step.stepId)
    setPendingStep(step)
    setModalOpen(true)
  }, [setExecStep])

  const handlePlayAll = useCallback(() => {
    // Start execution if not already active
    if (!execState.isActive) {
      startExecution(
        { executionName: runName, operatorName },
        runId,
        runId,
      )
      setMode('executing')
    }
    // Open modal for the first pending step, then chain through all
    const firstPending = steps.find(s => !s.executionMeta?.completedAt)
    if (firstPending) {
      handlePlayStep(firstPending)
    }
  }, [execState.isActive, startExecution, runName, operatorName, runId, steps, handlePlayStep])

  const handleToggleMode = useCallback(() => {
    if (mode === 'planning') {
      startExecution(
        { executionName: runName, operatorName },
        runId,
        runId,
      )
      setMode('executing')
    } else {
      abortExecution()
      setMode('planning')
    }
  }, [mode, startExecution, runName, operatorName, runId, abortExecution])

  /** Handle completion timestamp edit from StepChip. */
  const handleCompletionChange = useCallback((stepId: string, completedAt: string) => {
    setSteps(prev => prev.map(s =>
      s.stepId === stepId
        ? { ...s, executionMeta: { ...s.executionMeta, completedAt } as NonNullable<typeof s.executionMeta> }
        : s
    ))
  }, [])

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
                executedBy: s.executionMeta?.executedBy ?? operatorName,
                deviationNote: data.deviations?.map(d => d.message).join('; ') ?? s.executionMeta?.deviationNote,
              },
            }
          : s
      ))

      // Also update execution state via the API
      try {
        await updateExecutionState(runId, data.stepId, 'completed')
      } catch (apiErr) {
        // Non-fatal — step metadata is already updated locally
        console.warn('Execution state API unavailable:', apiErr)
      }

      // Advance to next step
      const completedStep = steps.find(s => s.stepId === data.stepId)
      if (completedStep) {
        const nextIdx = completedStep.ordinal
        const nextStep = steps.find(s => s.ordinal === nextIdx + 1 && !s.executionMeta?.completedAt)
        if (nextStep && mode === 'executing') {
          // Auto-advance to next step in execution mode
          setExecStep(nextStep.stepId)
          setPendingStep(nextStep)
          setModalOpen(true)
          return
        }
      }

      setModalOpen(false)
      setPendingStep(null)
    } catch (err) {
      console.error('Failed to update step execution:', err)
      // Error is surfaced via the modal's own error state
    }
  }, [runId, steps, operatorName, mode, setExecStep])

  if (noProtocol) {
    return (
      <ProtocolSelector
        runId={runId}
        studyId={studyId}
        context={protocolContext}
        onAttached={() => {
          setNoProtocol(false)
          setRefetchTrigger(n => n + 1)
        }}
      />
    )
  }
  if (isLoading) return <LoadingState />
  if (error && steps.length === 0) return <ErrorState error={error} />
  if (steps.length === 0) return <EmptyState />

  return (
    <div style={{ padding: '12px', display: 'flex', flexDirection: 'column', gap: '8px', overflowY: 'auto', height: '100%' }}>
      {/* Run metadata header */}
      <RunHeader
        runId={runId}
        stepCount={steps.length}
        mode={mode}
        onToggleMode={handleToggleMode}
        operatorName={operatorName}
        runName={runName}
        onRunNameChange={setRunName}
        onPlayAll={handlePlayAll}
      />

      {/* Plate setup (this lab) — the local protocol's declared bindings,
          above the steps, so a biologist reads what the assay needs before
          localizing a step. Edits here persist back to the LPR record. When
          the run is attached directly to a universal protocol, this is a
          read-only preview of the protocol's declared roles (no concrete
          bindings exist yet — specialize into a local protocol to set them). */}
      {localSetup ? (
        <section className="protocol-setup-sections" data-testid="protocol-setup-sections">
          <h3 className="protocol-setup-sections__title">This assay needs</h3>
          {setupIsPreview ? (
            <p className="protocol-setup-sections__hint" data-testid="protocol-setup-preview-hint">
              Declared roles from the universal protocol — no concrete bindings yet. Use the
              local version of this protocol to pick labware, equipment and materials.
            </p>
          ) : null}
          <SetupSectionWidget
            kind="labware"
            value={localSetup.labwares ?? []}
            readOnly={setupIsPreview}
            onCommit={(rows) => void patchSetup('labwares', rows)}
          />
          <SetupSectionWidget
            kind="equipment"
            value={localSetup.equipment ?? []}
            readOnly={setupIsPreview}
            onCommit={(rows) => void patchSetup('equipment', rows)}
          />
          <SetupSectionWidget
            kind="material"
            value={localSetup.materials ?? []}
            readOnly={setupIsPreview}
            onCommit={(rows) => void patchSetup('materials', rows)}
          />
        </section>
      ) : null}

      {/* Step chips */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
        {steps.map((step) => (
          <StepChip
            key={step.stepId}
            step={step}
            isActive={activeStepId === step.stepId}
            onToggle={() => handleToggleVisibility(step.stepId)}
            onPlay={() => handlePlayStep(step)}
            onSelect={async () => {
              const wasActive = activeStepId === step.stepId
              if (!wasActive) {
                await fetchStepSettings(step.stepId)
              }
              setActiveStepId(wasActive ? null : step.stepId)
              setExpandedStepId(wasActive ? null : step.stepId)
              protocolSelection?.setCurrentStepId(wasActive ? null : step.stepId)
            }}
            onCompletionChange={handleCompletionChange}
          />
        ))}
      </div>

      {/* Settings panel for the selected step */}
      {activeStepId && stepSettings[activeStepId] !== undefined && (
        <SettingsPanel
          protocolId={runId}
          stepId={activeStepId}
          settings={stepSettings[activeStepId]}
          onSave={(savedSettings) => handleSettingsSave(activeStepId, savedSettings)}
        />
      )}

      {/* Step detail (long-form full text) for the expanded step */}
      {expandedStepId ? (
        (() => {
          const expanded = steps.find((s) => s.stepId === expandedStepId)
          const section =
            expanded && humanStepsText
              ? splitHumanSteps(humanStepsText)[expanded.ordinal]
              : undefined
          const text = section ?? expanded?.description
          if (!text) return null
          return (
            <StepDetailPane
              runId={runId}
              stepId={expandedStepId}
              stepLabel={expanded?.label ?? expandedStepId}
              text={text}
            />
          )
        })()
      ) : null}

      {/* Step-localization AI input (Phase D) for the expanded step */}
      {expandedStepId ? (
        (() => {
          const expanded = steps.find((s) => s.stepId === expandedStepId)
          const section = expanded
            ? splitHumanSteps(humanStepsText ?? '')[expanded.ordinal]
            : undefined
          return (
            <StepLocalizationPane
              runId={runId}
              step={
                expanded
                  ? { stepId: expanded.stepId, label: expanded.label }
                  : { stepId: expandedStepId, label: expandedStepId }
              }
              stepText={section ?? expanded?.description ?? humanStepsText ?? undefined}
              localProtocolSetup={
                // Concrete LPR rows only — the universal-protocol role
                // preview is abstract (no refs), so it must not ride in
                // the localization context as if it were a declared setup.
                localSetup && !setupIsPreview ? localSetup : undefined
              }
            />
          )
        })()
      ) : null}

      {/* Step execution modal */}
      {pendingStep && (
        <StepExecutionModal
          isOpen={modalOpen}
          onClose={() => { setModalOpen(false); setPendingStep(null) }}
          onSubmit={handleModalSubmit}
          step={buildStepInfo(pendingStep)}
          {...(pendingStep.subGraph?.events?.[0] ? {
            plannedEvent: pendingStep.subGraph.events[0] as unknown as PlateEvent
          } : {})}
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
 * chips with visibility toggles, play buttons, settings display, and
 * execution metadata with editable completion timestamps.
 */
export function ProtocolTabPanel({ runId, studyId: _studyId }: ProtocolTabPanelProps) {
  // studyId kept in the props interface for backward compatibility with RightPane
  void _studyId
  return (
    <ProtocolSelectionProvider>
      <ExecutionProvider>
        <ProtocolTabPanelInner runId={runId} studyId={_studyId} />
      </ExecutionProvider>
    </ProtocolSelectionProvider>
  )
}
