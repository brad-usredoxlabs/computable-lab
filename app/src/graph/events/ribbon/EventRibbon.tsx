/**
 * EventRibbon - Unified horizontal event editor.
 * 
 * Workflow:
 * - Form is always visible with event type selector
 * - Each click of ✓ creates a NEW event, form stays open for next
 * - Click an event in timeline to edit it (✓ saves changes, then back to create mode)
 */

import { useState, useCallback, useEffect, useMemo, type ReactNode } from 'react'
import { useNavigate } from 'react-router-dom'
import type { PlateEvent, EventType, EventDetails, TransferDetails, AddMaterialDetails, NormalizedTransferDetails } from '../../../types/events'
import { EVENT_TYPE_LABELS, EVENT_TYPE_ICONS } from '../../../types/events'
import {
  applyAddMaterialSelection,
  getAddMaterialRef,
  normalizeTransferDetails,
  parseMaterialLikeRef,
  serializeTransferDetails,
  withCanonicalTransferDetails,
} from '../../../types/events'
import { getEventSummary } from '../../../types/events'
import type { WellId } from '../../../types/plate'
import { getVerbsForDisplay } from '../../../shared/vocab/registry'
import { EventPillBar } from './EventPillBar'
import {
  CompactVolumeInput,
  CompactConcentrationInput,
  CompactDurationInput,
  CompactTemperatureInput,
  CompactWellsDisplay,
  CompactSpeedInput,
  CompactCyclesInput,
  CompactDeadVolumeInput,
  CompactInputStyles,
} from './compact/CompactInputs'
import { SerialDilutionForm } from '../forms/SerialDilutionForm'
import { normalizeSerialDilutionParams } from '../../../editor/lib/serialDilutionPlan'
import { QuadrantReplicateForm } from '../forms/QuadrantReplicateForm'
import { SpacingTransitionTransferForm } from '../forms/SpacingTransitionTransferForm'
import { FormulationUsageModal, type FormulationInstanceLotDraft } from '../forms/FormulationUsageModal'
import { type Ref } from '../../../shared/ref'
import { MaterialPicker } from '../../../editor/material'
import { apiClient } from '../../../shared/api/client'
import { resolveAddMaterialSourceDefaults } from '../../../editor/lib/materialComposition'
import {
  applyNormalizedTransferToVignette,
  createTransferVignetteProgramFromTemplate,
  normalizeTransferVignetteProgram,
} from '../../lib/operationTemplates'
import type { MacroProgram, QuadrantReplicateParams, SerialDilutionParamsV2, SpacingTransitionTransferParams, TransferVignetteMacroProgram } from '../../../types/macroProgram'
import { useLabSettings } from '../../hooks/useLabSettings'
import { OperationTemplateModal } from './OperationTemplateModal'
import { OperationTemplateLibraryModal } from './OperationTemplateLibraryModal'
import {
  formatOperationTemplateLabel,
  operationTemplateActionType,
  parseOperationTemplateEnvelope,
  OPERATION_TEMPLATE_SCHEMA_ID,
  type OperationTemplateRecord,
} from '../../../types/operationTemplate'
import { formatCompositionSummary, formatConcentration, withInferredConcentrationBasis } from '../../../types/material'

interface EventRibbonProps {
  events: PlateEvent[]
  selectedEventId: string | null
  editingEventId?: string | null
  onSelectEvent: (eventId: string | null) => void
  onEditEvent?: (eventId: string | null) => void
  onAddEvent: (event: PlateEvent) => void
  onUpdateEvent: (event: PlateEvent) => void
  onDeleteEvent: (eventId: string) => void
  sourceSelectionCount?: number
  targetSelectionCount?: number
  getSourceWells?: () => WellId[]
  getTargetWells?: () => WellId[]
  sourceLabwareId?: string
  sourceLabwareRows?: number
  sourceLabwareCols?: number
  targetLabwareId?: string
  targetLabwareRows?: number
  targetLabwareCols?: number
  sourceOrientation?: 'portrait' | 'landscape'
  targetOrientation?: 'portrait' | 'landscape'
  sourceMaxVolumeUL?: number
  targetMaxVolumeUL?: number
  /** Vocab pack ID to use for event types */
  vocabPackId?: string
  /** Timeline playback position (number of events applied) */
  onPlaybackPositionChange?: (position: number) => void
  /** Optional material refs surfaced as quick-pick inputs for add-material events */
  prefillMaterials?: Ref[]
}

type DetailsRecord = Record<string, unknown>

function generateEventId(): string {
  return `evt-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`
}

function createDefaultDetails(type: EventType | string): DetailsRecord {
  if (type === 'transfer' || type === 'multi_dispense') {
    return { source_wells: [], dest_wells: [] }
  }
  return { wells: [] }
}

interface TypeSelectorProps {
  value: string
  onChange: (type: string) => void
  vocabPackId?: string
  operationTemplates?: OperationTemplateRecord[]
  disabled?: boolean
  showAdvanced?: boolean
  onToggleAdvanced?: () => void
}

type ActionScope = 'Well' | 'Plate' | 'Program'
type ActionGroup = 'common' | 'programs' | 'plate' | 'advanced'

type ActionOption = {
  type: string
  label: string
  icon: string
  scope: ActionScope
  group: ActionGroup
}

const ACTION_GROUP_LABELS: Record<ActionGroup, string> = {
  common: 'Common',
  programs: 'Saved Programs',
  plate: 'Plate Actions',
  advanced: 'Advanced',
}

function getActionTypeForDisplay(type: string, details?: DetailsRecord): string {
  if (type === 'multi_dispense') return 'transfer'
  if (type === 'macro_program') {
    const program = details?.program as MacroProgram | undefined
    if (program?.kind === 'serial_dilution') return 'serial_dilution'
    if (program?.kind === 'quadrant_replicate') return 'quadrant_replicate'
    if (program?.kind === 'transfer_vignette' && program.template_ref?.id) return operationTemplateActionType(program.template_ref.id)
  }
  return type
}

function TypeSelector({
  value,
  onChange,
  vocabPackId,
  operationTemplates = [],
  disabled = false,
  showAdvanced = false,
  onToggleAdvanced,
}: TypeSelectorProps) {
  const actionOptions = useMemo(() => {
    const vocabVerbs = new Map(getVerbsForDisplay(vocabPackId || 'liquid-handling/v1').map((verb) => [verb.verb, verb]))
    const option = (
      type: string,
      scope: ActionScope,
      group: ActionGroup,
      fallbackLabel?: string,
      fallbackIcon?: string,
    ): ActionOption => ({
      type,
      label: vocabVerbs.get(type)?.displayName || fallbackLabel || EVENT_TYPE_LABELS[type as EventType] || type,
      icon: vocabVerbs.get(type)?.icon || fallbackIcon || EVENT_TYPE_ICONS[type as EventType] || '•',
      scope,
      group,
    })

    return [
      option('add_material', 'Well', 'common'),
      option('transfer', 'Well', 'common'),
      option('serial_dilution', 'Program', 'common', 'Serial Dilution', '📉'),
      ...operationTemplates.map((template) => ({
        type: operationTemplateActionType(template.id),
        label: formatOperationTemplateLabel(template),
        icon: '🧩',
        scope: 'Program' as const,
        group: 'programs' as const,
      })),
      option('incubate', 'Plate', 'plate'),
      option('read', 'Plate', 'plate'),
      option('wash', 'Plate', 'plate'),
      option('harvest', 'Plate', 'plate'),
      option('mix', 'Well', 'advanced'),
      option('quadrant_replicate', 'Program', 'advanced', 'Quadrant Replicate', '🧩'),
      option('other', 'Well', 'advanced'),
    ]
  }, [operationTemplates, vocabPackId])

  const visibleGroups: ActionGroup[] = [
    'common',
    ...(operationTemplates.length > 0 ? ['programs' as const] : []),
    'plate',
    ...(showAdvanced ? ['advanced' as const] : []),
  ]

  return (
    <div className="action-chooser">
      {visibleGroups.map((group) => (
        <div key={group} className="action-chooser__group">
          <div className="action-chooser__group-label">{ACTION_GROUP_LABELS[group]}</div>
          <div className="action-chooser__group-actions">
            {actionOptions.filter((option) => option.group === group).map((option) => {
              const isSelected = value === option.type
              return (
                <button
                  key={option.type}
                  type="button"
                  className={`action-chip ${isSelected ? 'action-chip--selected' : ''}`}
                  onClick={() => onChange(option.type)}
                  disabled={disabled}
                  title={`${option.label} (${option.scope})`}
                >
                  <span className="action-chip__icon">{option.icon}</span>
                  <span className="action-chip__label">{option.label}</span>
                  <span className={`action-chip__scope action-chip__scope--${option.scope.toLowerCase()}`}>{option.scope}</span>
                </button>
              )
            })}
          </div>
        </div>
      ))}
      {onToggleAdvanced && (
        <button type="button" className="action-chooser__toggle" onClick={onToggleAdvanced}>
          {showAdvanced ? 'Hide Advanced' : 'More Actions'}
        </button>
      )}
    </div>
  )
}

function AdvancedSection({
  title,
  open,
  onToggle,
  children,
}: {
  title: string
  open: boolean
  onToggle: () => void
  children: ReactNode
}) {
  return (
    <div className={`advanced-section ${open ? 'advanced-section--open' : ''}`}>
      <button type="button" className="advanced-section__toggle" onClick={onToggle}>
        <span>{open ? '▾' : '▸'} {title}</span>
      </button>
      {open && <div className="advanced-section__content">{children}</div>}
    </div>
  )
}

interface FieldProps {
  details: DetailsRecord
  onChange: (d: DetailsRecord) => void
  eventType?: string
  onEventTypeChange?: (type: EventType) => void
  onSaveTransferProgram?: (program: TransferVignetteMacroProgram) => void
  sourceSelectionCount?: number
  targetSelectionCount?: number
  getSourceWells?: () => WellId[]
  getTargetWells?: () => WellId[]
  contextOptions?: ContextOption[]
  contextsLoading?: boolean
  sourceLabwareId?: string
  sourceLabwareRows?: number
  sourceLabwareCols?: number
  targetLabwareId?: string
  targetLabwareRows?: number
  targetLabwareCols?: number
}

interface ContextOption {
  id: string
  label: string
}

function AddMaterialFields({ details, onChange, sourceSelectionCount, getSourceWells, sourceLabwareId }: FieldProps) {
  const navigate = useNavigate()
  const [pendingFormulationRef, setPendingFormulationRef] = useState<Ref | null>(null)
  const [selectedFormulationSummary, setSelectedFormulationSummary] = useState<Awaited<ReturnType<typeof apiClient.getFormulationsSummary>>[number] | null>(null)
  const [preferredSources, setPreferredSources] = useState<Array<{ roleLabel: string; vendor?: string; catalogNumber?: string }>>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { settings } = useLabSettings()
  const wells = (details.wells as WellId[]) || []
  const volume = details.volume as { value: number; unit: string } | undefined
  const concentration = details.concentration as { value: number; unit: string } | undefined
  const compositionSnapshot = Array.isArray((details as AddMaterialDetails).composition_snapshot)
    ? (details as AddMaterialDetails).composition_snapshot || []
    : []
  const compositionSummary = formatCompositionSummary(compositionSnapshot, 4)
  const hasCellComposition = compositionSnapshot.some((entry) => entry?.role === 'cells')
  const countLabel = hasCellComposition ? 'Cells' : 'Count'
  const sourceSummary = compositionSummary || formatConcentration(concentration)
  const materialRef = parseMaterialLikeRef(getAddMaterialRef(details as AddMaterialDetails))
  const countValue = typeof details.count === 'number' ? details.count : ''
  const noteValue = typeof details.note === 'string' ? details.note : ''

  const handleMaterialSelection = useCallback((ref: Ref | null) => {
    if (!ref) {
      setPendingFormulationRef(null)
      setSelectedFormulationSummary(null)
      onChange({
        ...(applyAddMaterialSelection(details as AddMaterialDetails, null) as DetailsRecord),
        ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
      })
      return
    }
    if (ref.kind === 'record' && ref.type === 'material-spec') {
      setPendingFormulationRef(ref)
      return
    }
    if (ref.kind === 'record' && ref.type === 'vendor-product') {
      setPendingFormulationRef(null)
      setSelectedFormulationSummary(null)
      void resolveAddMaterialSourceDefaults(ref)
        .then((defaults) => {
          onChange({
            ...(applyAddMaterialSelection(details as AddMaterialDetails, ref) as DetailsRecord),
            ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
            ...(defaults.concentration ? { concentration: withInferredConcentrationBasis(defaults.concentration) } : {}),
            composition_snapshot: defaults.compositionSnapshot,
          })
        })
        .catch(() => {
          onChange({
            ...(applyAddMaterialSelection(details as AddMaterialDetails, ref) as DetailsRecord),
            ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
          })
        })
      return
    }
    if (ref.kind === 'record' && (ref.type === 'aliquot' || ref.type === 'material-instance')) {
      setPendingFormulationRef(null)
      setSelectedFormulationSummary(null)
      void resolveAddMaterialSourceDefaults(ref)
        .then((defaults) => {
          onChange({
            ...(applyAddMaterialSelection(details as AddMaterialDetails, ref) as DetailsRecord),
            ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
            ...(defaults.concentration ? { concentration: defaults.concentration } : {}),
            ...(defaults.compositionSnapshot ? { composition_snapshot: defaults.compositionSnapshot } : {}),
          })
        })
        .catch(() => {
          onChange({
            ...(applyAddMaterialSelection(details as AddMaterialDetails, ref) as DetailsRecord),
            ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
          })
        })
      return
    }
    setPendingFormulationRef(null)
    setSelectedFormulationSummary(null)
    onChange({
      ...(applyAddMaterialSelection(details as AddMaterialDetails, ref) as DetailsRecord),
      ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
    })
  }, [details, onChange, sourceLabwareId])

  const applyFormulationSelection = useCallback((lot?: FormulationInstanceLotDraft) => {
    if (!pendingFormulationRef) return
    const next = applyAddMaterialSelection(details as AddMaterialDetails, pendingFormulationRef)
    void resolveAddMaterialSourceDefaults(pendingFormulationRef, selectedFormulationSummary?.outputSpec ? selectedFormulationSummary : null)
      .then((defaults) => {
        onChange({
          ...next,
          ...(defaults.concentration ? { concentration: defaults.concentration } : {}),
          ...(defaults.compositionSnapshot ? { composition_snapshot: defaults.compositionSnapshot } : {}),
          ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
          ...(lot && Object.keys(lot).length > 0 ? { instance_lot: lot } : { instance_lot: undefined }),
        } as DetailsRecord)
      })
      .finally(() => {
        setPendingFormulationRef(null)
        setPreferredSources([])
      })
  }, [details, onChange, pendingFormulationRef, selectedFormulationSummary, sourceLabwareId])

  useEffect(() => {
    let cancelled = false
    async function loadPreferredSources() {
      if (!pendingFormulationRef || pendingFormulationRef.kind !== 'record' || pendingFormulationRef.type !== 'material-spec') {
        setPreferredSources([])
        return
      }
      try {
        const summaries = await apiClient.getFormulationsSummary({ outputSpecId: pendingFormulationRef.id, limit: 1 })
        if (cancelled) return
        const summary = summaries[0]
        setSelectedFormulationSummary(summary ?? null)
        if (!summary?.preferredSources?.length) {
          setPreferredSources([])
          return
        }
        const roleLabels = new Map(summary.inputRoles.map((role) => [role.roleId, role.materialRef?.label || role.allowedMaterialSpecRefs[0]?.label || role.roleId]))
        setPreferredSources(summary.preferredSources.map((source) => ({
          roleLabel: roleLabels.get(source.roleId) || source.roleId,
          ...(source.vendor ? { vendor: source.vendor } : {}),
          ...(source.catalogNumber ? { catalogNumber: source.catalogNumber } : {}),
        })))
      } catch {
        if (!cancelled) {
          setSelectedFormulationSummary(null)
          setPreferredSources([])
        }
      }
    }
    loadPreferredSources()
    return () => {
      cancelled = true
    }
  }, [pendingFormulationRef])

  useEffect(() => {
    if (countValue !== '' || noteValue || hasCellComposition) setShowAdvanced(true)
  }, [countValue, hasCellComposition, noteValue])

  const routeOntologyToFormulation = useCallback((ref: Ref) => {
    if (ref.kind !== 'ontology') return
    const params = new URLSearchParams({
      create: '1',
      prefillName: ref.label || ref.id,
      prefillOntologyId: ref.id,
      prefillOntologyNamespace: ref.namespace,
      prefillOntologyLabel: ref.label,
      ...(ref.uri ? { prefillOntologyUri: ref.uri } : {}),
      prefillSource: 'event-ribbon',
    })
    navigate(`/formulations?${params.toString()}`)
  }, [navigate])

  return (
    <>
      <CompactWellsDisplay
        wells={wells}
        onChange={(w) => onChange({ ...details, wells: w, ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) })}
        selectionCount={sourceSelectionCount}
        onUseSelection={getSourceWells ? () => onChange({ ...details, wells: getSourceWells(), ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) }) : undefined}
      />
      <div className="ribbon-section ribbon-section--material">
        <MaterialPicker
          value={materialRef}
          onChange={handleMaterialSelection}
          allowCreateLocal
          placeholder="Search saved stocks, prepared tubes, or concepts..."
          minQueryLength={2}
          localKinds={['material', 'material-spec', 'vendor-product', 'material-instance', 'aliquot']}
          primaryKinds={['material-spec', 'vendor-product']}
          preparedKinds={['material-instance', 'aliquot']}
          secondaryKinds={['material']}
          primarySectionLabel="Saved Stocks / Vendor Reagents"
          preparedSectionLabel="Existing Prepared Tubes / Plates"
          secondarySectionLabel="Concept Only"
          ontologySelectionMode="route"
          onCreateFormulationFromOntology={routeOntologyToFormulation}
        />
        {materialRef?.kind === 'record' && sourceSummary && (
          <div className="compact-field" style={{ marginTop: '0.35rem' }}>
            <span className="compact-field__label">{compositionSummary ? 'Composition' : 'Default'}</span>
            <div className="compact-input compact-input--note" style={{ fontSize: '0.72rem', color: '#475569' }}>
              {sourceSummary}
              {!compositionSummary && selectedFormulationSummary?.outputSpec.solventLabel ? ` in ${selectedFormulationSummary.outputSpec.solventLabel}` : ''}
            </div>
          </div>
        )}
      </div>
      <CompactVolumeInput value={volume} onChange={(v) => onChange({ ...details, volume: v, ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) })} />
      <AdvancedSection
        title="Overrides & Notes"
        open={showAdvanced}
        onToggle={() => setShowAdvanced((prev) => !prev)}
      >
        <CompactConcentrationInput value={concentration} onChange={(c) => onChange({ ...details, concentration: c, ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) })} />
        <div className="compact-field">
          <span className="compact-field__label">{countLabel}</span>
          <div className="compact-input">
            <input
              type="number"
              min="0"
              step="any"
              value={countValue}
              placeholder={hasCellComposition ? 'optional cell count' : 'optional'}
              onChange={(e) => {
                const next = e.target.value
                onChange({ ...details, count: next === '' ? undefined : Number(next), ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) })
              }}
            />
          </div>
        </div>
        <div className="compact-field">
          <span className="compact-field__label">Note</span>
          <div className="compact-input compact-input--note">
            <input
              type="text"
              value={noteValue}
              placeholder="optional"
              onChange={(e) => onChange({ ...details, note: e.target.value || undefined, ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) })}
            />
          </div>
        </div>
      </AdvancedSection>
      <FormulationUsageModal
        isOpen={Boolean(pendingFormulationRef)}
        formulationRef={pendingFormulationRef}
        preferredSources={preferredSources}
        trackingMode={settings.materialTracking.mode}
        allowAdHocEventInstances={settings.materialTracking.allowAdHocEventInstances}
        onCancel={() => {
          setPendingFormulationRef(null)
          setPreferredSources([])
        }}
        onSkip={() => applyFormulationSelection()}
        onSave={(lot) => applyFormulationSelection(lot)}
      />
    </>
  )
}

function hasTransferProgramOverrides(hints: TransferDetails['execution_hints'] | undefined): boolean {
  if (!hints) return false
  return Boolean(
    hints.tip_policy
    || typeof hints.aspirate_height_mm === 'number'
    || typeof hints.dispense_height_mm === 'number'
    || hints.air_gap
    || hints.pre_mix?.enabled
    || hints.post_mix?.enabled
    || hints.touch_tip_after_aspirate
    || hints.touch_tip_after_dispense
    || hints.blowout
  )
}

function pruneTransferMixHint(mix: NonNullable<TransferDetails['execution_hints']>['pre_mix'] | undefined) {
  if (!mix?.enabled) return undefined
  return {
    enabled: true,
    ...(typeof mix.cycles === 'number' ? { cycles: mix.cycles } : {}),
    ...(mix.volume ? { volume: mix.volume } : {}),
  }
}

function pruneTransferExecutionHints(hints: TransferDetails['execution_hints'] | undefined): TransferDetails['execution_hints'] | undefined {
  if (!hints) return undefined
  const next = {
    ...(hints.tip_policy ? { tip_policy: hints.tip_policy } : {}),
    ...(typeof hints.aspirate_height_mm === 'number' ? { aspirate_height_mm: hints.aspirate_height_mm } : {}),
    ...(typeof hints.dispense_height_mm === 'number' ? { dispense_height_mm: hints.dispense_height_mm } : {}),
    ...(hints.air_gap ? { air_gap: hints.air_gap } : {}),
    ...(pruneTransferMixHint(hints.pre_mix) ? { pre_mix: pruneTransferMixHint(hints.pre_mix) } : {}),
    ...(pruneTransferMixHint(hints.post_mix) ? { post_mix: pruneTransferMixHint(hints.post_mix) } : {}),
    ...(hints.touch_tip_after_aspirate ? { touch_tip_after_aspirate: true } : {}),
    ...(hints.touch_tip_after_dispense ? { touch_tip_after_dispense: true } : {}),
    ...(hints.blowout ? { blowout: true } : {}),
  }
  return Object.keys(next).length > 0 ? next : undefined
}

function transferProgramSummary(
  mode: 'transfer' | 'multi_dispense',
  hints: TransferDetails['execution_hints'] | undefined,
): string {
  const parts = [mode === 'multi_dispense' ? 'Multi-dispense' : 'Standard']
  if (hints?.tip_policy && hints.tip_policy !== 'inherit') {
    const tipLabels: Record<'inherit' | 'new_tip_each_transfer' | 'new_tip_each_source' | 'reuse_within_batch', string> = {
      inherit: 'inherit tips',
      new_tip_each_transfer: 'new tip / transfer',
      new_tip_each_source: 'new tip / source',
      reuse_within_batch: 'reuse tips in batch',
    }
    parts.push(tipLabels[hints.tip_policy])
  }
  if (hints?.pre_mix?.enabled) parts.push(`pre-mix ${hints.pre_mix.cycles ?? 3}x`)
  if (hints?.post_mix?.enabled) parts.push(`post-mix ${hints.post_mix.cycles ?? 3}x`)
  if (typeof hints?.aspirate_height_mm === 'number') parts.push(`asp ${hints.aspirate_height_mm} mm`)
  if (typeof hints?.dispense_height_mm === 'number') parts.push(`disp ${hints.dispense_height_mm} mm`)
  if (hints?.blowout) parts.push('blowout')
  return parts.join(' · ')
}

function TransferFields({
  details,
  onChange,
  eventType,
  onEventTypeChange,
  onSaveTransferProgram,
  sourceSelectionCount,
  targetSelectionCount,
  getSourceWells,
  getTargetWells,
  contextOptions = [],
  contextsLoading = false,
}: FieldProps) {
  const transferDetails = details as TransferDetails
  const normalized = normalizeTransferDetails(transferDetails)
  const sourceWells = normalized.sourceWells
  const destWells = normalized.destWells
  const volume = normalized.volume
  const deadVolume = normalized.deadVolume
  const firstInput = normalized.inputs?.[0]
  const contextRefId = typeof firstInput?.contextRef === 'string'
    ? firstInput.contextRef
    : firstInput?.contextRef?.id || ''
  const contextAmount = firstInput?.amount
  const executionHints = normalized.executionHints
  const preMix = executionHints?.pre_mix
  const postMix = executionHints?.post_mix
  const transferMode = eventType === 'multi_dispense' ? 'multi_dispense' : 'transfer'
  const [showAdvanced, setShowAdvanced] = useState(false)
  const currentTransferProgram: TransferVignetteMacroProgram = {
    kind: 'transfer_vignette',
    params: {
      sourceLabwareId: normalized.sourceLabwareId,
      targetLabwareId: normalized.destLabwareId,
      sourceWells,
      targetWells: destWells,
      ...(normalized.volume ? { volume: normalized.volume } : {}),
      transferMode,
      ...(normalized.deadVolume ? { deadVolume: normalized.deadVolume } : {}),
      ...(normalized.discardToWaste ? { discardToWaste: true } : {}),
      ...(normalized.inputs?.length ? { inputs: normalized.inputs } : {}),
    },
    ...(normalized.executionHints ? { execution_hints: normalized.executionHints } : {}),
  }

  const applyNormalizedUpdate = useCallback((next: NormalizedTransferDetails) => {
    onChange(
      serializeTransferDetails(
        next,
        transferDetails
      ) as unknown as DetailsRecord
    )
  }, [onChange, transferDetails])

  const updateExecutionHints = useCallback((updater: (current: TransferDetails['execution_hints']) => TransferDetails['execution_hints']) => {
    const nextHints = pruneTransferExecutionHints(updater(normalized.executionHints))
    applyNormalizedUpdate({ ...normalized, executionHints: nextHints })
  }, [applyNormalizedUpdate, normalized])

  useEffect(() => {
    if (
      transferMode === 'multi_dispense'
      || normalized.deadVolume
      || contextRefId
      || contextAmount
      || normalized.discardToWaste
      || hasTransferProgramOverrides(executionHints)
    ) {
      setShowAdvanced(true)
    }
  }, [contextAmount, contextRefId, executionHints, normalized.deadVolume, normalized.discardToWaste, transferMode])

  return (
    <>
      <CompactWellsDisplay
        wells={sourceWells}
        onChange={(w) =>
          applyNormalizedUpdate({ ...normalized, sourceWells: w })
        }
        selectionCount={sourceSelectionCount}
        onUseSelection={getSourceWells
          ? () =>
              applyNormalizedUpdate({ ...normalized, sourceWells: getSourceWells() })
          : undefined}
        label="From"
      />
      <CompactWellsDisplay
        wells={destWells}
        onChange={(w) =>
          applyNormalizedUpdate({ ...normalized, destWells: w })
        }
        selectionCount={targetSelectionCount}
        onUseSelection={getTargetWells
          ? () =>
              applyNormalizedUpdate({ ...normalized, destWells: getTargetWells() })
          : undefined}
        label="To"
      />
      <CompactVolumeInput
        value={volume}
        onChange={(v) => applyNormalizedUpdate({ ...normalized, volume: v })}
      />
      <AdvancedSection
        title="Transfer Program"
        open={showAdvanced}
        onToggle={() => setShowAdvanced((prev) => !prev)}
      >
        <div className="transfer-program__summary">
          {transferProgramSummary(transferMode, executionHints)}
        </div>
        {onSaveTransferProgram && (
          <button
            type="button"
            className="transfer-program__save"
            onClick={() => onSaveTransferProgram(currentTransferProgram)}
          >
            Save as Program
          </button>
        )}
        <div className="compact-field">
          <span className="compact-field__label">Mode</span>
          <div className="compact-input">
            <select
              value={transferMode}
              onChange={(e) => onEventTypeChange?.(e.target.value as EventType)}
            >
              <option value="transfer">Standard</option>
              <option value="multi_dispense">Multi-dispense</option>
            </select>
          </div>
        </div>
        <div className="compact-field">
          <span className="compact-field__label">Tips</span>
          <div className="compact-input">
            <select
              value={executionHints?.tip_policy || 'inherit'}
              onChange={(e) => updateExecutionHints((current) => ({
                ...current,
                tip_policy: e.target.value === 'inherit'
                  ? undefined
                  : e.target.value as NonNullable<TransferDetails['execution_hints']>['tip_policy'],
              }))}
            >
              <option value="inherit">Inherit plan</option>
              <option value="new_tip_each_transfer">New each transfer</option>
              <option value="new_tip_each_source">New each source</option>
              <option value="reuse_within_batch">Reuse in batch</option>
            </select>
          </div>
        </div>
        {transferMode === 'multi_dispense' && (
          <CompactDeadVolumeInput
            value={deadVolume}
            onChange={(dv) => applyNormalizedUpdate({ ...normalized, deadVolume: dv })}
          />
        )}
        <div className="transfer-program__group">
          <div className="transfer-program__group-label">Heights</div>
          <div className="compact-field">
            <span className="compact-field__label">Asp mm</span>
            <div className="compact-input">
              <input
                type="number"
                value={executionHints?.aspirate_height_mm ?? ''}
                placeholder="auto"
                min="0"
                step="0.1"
                onChange={(e) => {
                  const next = parseFloat(e.target.value)
                  updateExecutionHints((current) => ({
                    ...current,
                    aspirate_height_mm: Number.isFinite(next) ? next : undefined,
                  }))
                }}
              />
            </div>
          </div>
          <div className="compact-field">
            <span className="compact-field__label">Disp mm</span>
            <div className="compact-input">
              <input
                type="number"
                value={executionHints?.dispense_height_mm ?? ''}
                placeholder="auto"
                min="0"
                step="0.1"
                onChange={(e) => {
                  const next = parseFloat(e.target.value)
                  updateExecutionHints((current) => ({
                    ...current,
                    dispense_height_mm: Number.isFinite(next) ? next : undefined,
                  }))
                }}
              />
            </div>
          </div>
        </div>
        <div className="transfer-program__group">
          <div className="transfer-program__group-label">Mix</div>
          <label className="compact-checkbox">
            <input
              type="checkbox"
              checked={Boolean(preMix?.enabled)}
              onChange={(e) => updateExecutionHints((current) => ({
                ...current,
                pre_mix: e.target.checked
                  ? { enabled: true, cycles: current?.pre_mix?.cycles ?? 3, volume: current?.pre_mix?.volume ?? normalized.volume }
                  : undefined,
              }))}
            />
            <span>Pre-mix</span>
          </label>
          {preMix?.enabled && (
            <div className="transfer-program__mix-inline">
              <CompactCyclesInput
                value={preMix.cycles}
                onChange={(cycles) => updateExecutionHints((current) => ({
                  ...current,
                  pre_mix: { ...(current?.pre_mix || { enabled: true }), enabled: true, cycles },
                }))}
              />
              <CompactVolumeInput
                value={preMix.volume}
                onChange={(mixVolume) => updateExecutionHints((current) => ({
                  ...current,
                  pre_mix: { ...(current?.pre_mix || { enabled: true }), enabled: true, volume: mixVolume },
                }))}
              />
            </div>
          )}
          <label className="compact-checkbox">
            <input
              type="checkbox"
              checked={Boolean(postMix?.enabled)}
              onChange={(e) => updateExecutionHints((current) => ({
                ...current,
                post_mix: e.target.checked
                  ? { enabled: true, cycles: current?.post_mix?.cycles ?? 3, volume: current?.post_mix?.volume ?? normalized.volume }
                  : undefined,
              }))}
            />
            <span>Post-mix</span>
          </label>
          {postMix?.enabled && (
            <div className="transfer-program__mix-inline">
              <CompactCyclesInput
                value={postMix.cycles}
                onChange={(cycles) => updateExecutionHints((current) => ({
                  ...current,
                  post_mix: { ...(current?.post_mix || { enabled: true }), enabled: true, cycles },
                }))}
              />
              <CompactVolumeInput
                value={postMix.volume}
                onChange={(mixVolume) => updateExecutionHints((current) => ({
                  ...current,
                  post_mix: { ...(current?.post_mix || { enabled: true }), enabled: true, volume: mixVolume },
                }))}
              />
            </div>
          )}
        </div>
        <div className="transfer-program__group">
          <div className="transfer-program__group-label">Handling</div>
          <div className="compact-field compact-field--checkbox">
            <span className="compact-field__label">Air Gap</span>
            <div className="compact-input compact-volume">
              <input
                type="number"
                value={executionHints?.air_gap?.value ?? ''}
                placeholder="0"
                min="0"
                step="any"
                onChange={(e) => {
                  const next = parseFloat(e.target.value)
                  updateExecutionHints((current) => ({
                    ...current,
                    air_gap: Number.isFinite(next)
                      ? { value: next, unit: current?.air_gap?.unit || 'uL' }
                      : undefined,
                  }))
                }}
              />
              <select
                value={executionHints?.air_gap?.unit || 'uL'}
                onChange={(e) => updateExecutionHints((current) => ({
                  ...current,
                  air_gap: current?.air_gap
                    ? { ...current.air_gap, unit: e.target.value as 'uL' | 'mL' }
                    : { value: 0, unit: e.target.value as 'uL' | 'mL' },
                }))}
              >
                <option value="uL">uL</option>
                <option value="mL">mL</option>
              </select>
            </div>
          </div>
          <label className="compact-checkbox">
            <input
              type="checkbox"
              checked={Boolean(executionHints?.touch_tip_after_aspirate)}
              onChange={(e) => updateExecutionHints((current) => ({
                ...current,
                touch_tip_after_aspirate: e.target.checked || undefined,
              }))}
            />
            <span>Touch tip after aspirate</span>
          </label>
          <label className="compact-checkbox">
            <input
              type="checkbox"
              checked={Boolean(executionHints?.touch_tip_after_dispense)}
              onChange={(e) => updateExecutionHints((current) => ({
                ...current,
                touch_tip_after_dispense: e.target.checked || undefined,
              }))}
            />
            <span>Touch tip after dispense</span>
          </label>
          <label className="compact-checkbox">
            <input
              type="checkbox"
              checked={Boolean(executionHints?.blowout)}
              onChange={(e) => updateExecutionHints((current) => ({
                ...current,
                blowout: e.target.checked || undefined,
              }))}
            />
            <span>Blowout</span>
          </label>
        </div>
        <div className="compact-field compact-field--checkbox">
          <span className="compact-field__label">Waste</span>
          <label className="compact-checkbox">
            <input
              type="checkbox"
              checked={Boolean(normalized.discardToWaste)}
              onChange={(e) => applyNormalizedUpdate({ ...normalized, discardToWaste: e.target.checked })}
            />
            <span>Discard to waste</span>
          </label>
        </div>
        <div className="transfer-program__group">
          <div className="transfer-program__group-label">Lineage</div>
        <div className="ribbon-section ribbon-section--context">
          <label className="context-label" htmlFor="aliquot-context-input">Source</label>
          <input
            id="aliquot-context-input"
            className="context-input"
            list="aliquot-context-options"
            placeholder={contextsLoading ? 'Loading contexts...' : 'Context ID...'}
            value={contextRefId}
            onChange={(e) => {
              const nextId = e.target.value.trim()
              const match = contextOptions.find(o => o.id === nextId)
              const nextInputs = nextId
                ? [{
                    contextRef: {
                      kind: 'record' as const,
                      id: nextId,
                      type: 'context',
                      label: match?.label || nextId,
                    },
                    amount: contextAmount,
                  }]
                : []
              applyNormalizedUpdate({ ...normalized, inputs: nextInputs })
            }}
          />
          <datalist id="aliquot-context-options">
            {contextOptions.map((ctx) => (
              <option key={ctx.id} value={ctx.id}>
                {ctx.label}
              </option>
            ))}
          </datalist>
        </div>
        <div className="compact-field compact-field--amount">
          <span className="compact-field__label">Amt</span>
          <div className="compact-input compact-volume">
            <input
              type="number"
              value={contextAmount?.value ?? ''}
              onChange={(e) => {
                const n = parseFloat(e.target.value)
                const nextAmount = !isNaN(n)
                  ? { value: n, unit: contextAmount?.unit || 'uL' }
                  : undefined
                const nextInputs = contextRefId
                  ? [{
                      contextRef: firstInput?.contextRef || {
                        kind: 'record' as const,
                        id: contextRefId,
                        type: 'context',
                        label: contextRefId,
                      },
                      amount: nextAmount,
                    }]
                  : normalized.inputs
                applyNormalizedUpdate({ ...normalized, inputs: nextInputs })
              }}
              placeholder="0"
              min="0"
              step="any"
            />
            <select
              value={contextAmount?.unit || 'uL'}
              onChange={(e) => {
                if (!contextRefId) return
                const nextInputs = [{
                  contextRef: firstInput?.contextRef || {
                    kind: 'record' as const,
                    id: contextRefId,
                    type: 'context',
                    label: contextRefId,
                  },
                  amount: {
                    value: contextAmount?.value ?? 0,
                    unit: e.target.value,
                  },
                }]
                applyNormalizedUpdate({ ...normalized, inputs: nextInputs })
              }}
            >
              <option value="uL">uL</option>
              <option value="mL">mL</option>
              <option value="cells">cells</option>
            </select>
          </div>
        </div>
        </div>
      </AdvancedSection>
    </>
  )
}

function TransferVignetteFields(props: FieldProps) {
  const program = (props.details.program as MacroProgram | undefined)
  if (!program || program.kind !== 'transfer_vignette') return <GenericFields {...props} />
  const normalized = normalizeTransferVignetteProgram(program)
  const transferMode = program.params.transferMode === 'multi_dispense' ? 'multi_dispense' : 'transfer'
  return (
    <TransferFields
      {...props}
      details={serializeTransferDetails(normalized) as unknown as DetailsRecord}
      eventType={transferMode}
      onChange={(nextDetails) => {
        const nextProgram = applyNormalizedTransferToVignette(
          program,
          normalizeTransferDetails(nextDetails as TransferDetails),
          transferMode,
        )
        props.onChange({ ...props.details, program: nextProgram })
      }}
      onEventTypeChange={(nextType) => {
        const nextProgram = applyNormalizedTransferToVignette(
          program,
          normalized,
          nextType === 'multi_dispense' ? 'multi_dispense' : 'transfer',
        )
        props.onChange({ ...props.details, program: nextProgram })
      }}
      onSaveTransferProgram={(nextProgram) => props.onSaveTransferProgram?.({ ...nextProgram, template_ref: program.template_ref })}
    />
  )
}

function MixFields({ details, onChange, sourceSelectionCount, getSourceWells }: FieldProps) {
  const wells = (details.wells as WellId[]) || []
  const speed = details.speed as number | undefined
  const duration = details.duration as string | undefined

  return (
    <>
      <CompactWellsDisplay
        wells={wells}
        onChange={(w) => onChange({ ...details, wells: w })}
        selectionCount={sourceSelectionCount}
        onUseSelection={getSourceWells ? () => onChange({ ...details, wells: getSourceWells() }) : undefined}
      />
      <CompactSpeedInput value={speed} onChange={(s) => onChange({ ...details, speed: s })} />
      <CompactDurationInput value={duration} onChange={(d) => onChange({ ...details, duration: d })} />
    </>
  )
}

function WashFields({ details, onChange, sourceSelectionCount, getSourceWells }: FieldProps) {
  const wells = (details.wells as WellId[]) || []
  const volume = details.volume as { value: number; unit: string } | undefined
  const cycles = details.cycles as number | undefined

  return (
    <>
      <CompactWellsDisplay
        wells={wells}
        onChange={(w) => onChange({ ...details, wells: w })}
        selectionCount={sourceSelectionCount}
        onUseSelection={getSourceWells ? () => onChange({ ...details, wells: getSourceWells() }) : undefined}
      />
      <div className="ribbon-section">
        <input
          type="text"
          value={(details.wash_buffer as string) || ''}
          onChange={(e) => onChange({ ...details, wash_buffer: e.target.value || undefined })}
          placeholder="Buffer..."
          className="buffer-input"
        />
      </div>
      <CompactVolumeInput value={volume} onChange={(v) => onChange({ ...details, volume: v })} />
      <CompactCyclesInput value={cycles} onChange={(c) => onChange({ ...details, cycles: c })} />
    </>
  )
}

function IncubateFields({ details, onChange, sourceSelectionCount, getSourceWells }: FieldProps) {
  const wells = (details.wells as WellId[]) || []
  const duration = details.duration as string | undefined
  const temperature = details.temperature as { value: number; unit: string } | undefined

  return (
    <>
      <CompactWellsDisplay
        wells={wells}
        onChange={(w) => onChange({ ...details, wells: w })}
        selectionCount={sourceSelectionCount}
        onUseSelection={getSourceWells ? () => onChange({ ...details, wells: getSourceWells() }) : undefined}
      />
      <CompactDurationInput value={duration} onChange={(d) => onChange({ ...details, duration: d })} />
      <CompactTemperatureInput value={temperature} onChange={(t) => onChange({ ...details, temperature: t })} />
    </>
  )
}

function ReadFields({ details, onChange, sourceSelectionCount, getSourceWells }: FieldProps) {
  const wells = (details.wells as WellId[]) || []

  return (
    <>
      <CompactWellsDisplay
        wells={wells}
        onChange={(w) => onChange({ ...details, wells: w })}
        selectionCount={sourceSelectionCount}
        onUseSelection={getSourceWells ? () => onChange({ ...details, wells: getSourceWells() }) : undefined}
      />
      <div className="ribbon-section">
        <select
          value={(details.read_type as string) || 'absorbance'}
          onChange={(e) => onChange({ ...details, read_type: e.target.value })}
          className="read-type-select"
        >
          <option value="absorbance">Absorbance</option>
          <option value="fluorescence">Fluorescence</option>
          <option value="luminescence">Luminescence</option>
        </select>
      </div>
      <div className="compact-field">
        <span className="compact-field__label">λ</span>
        <input
          type="number"
          value={(details.wavelength as number) || ''}
          onChange={(e) => {
            const num = parseInt(e.target.value)
            onChange({ ...details, wavelength: !isNaN(num) ? num : undefined })
          }}
          placeholder="450"
          className="wavelength-input"
        />
        <span className="wavelength-unit">nm</span>
      </div>
    </>
  )
}

function GenericFields({ details, onChange, sourceSelectionCount, getSourceWells }: FieldProps) {
  const wells = (details.wells as WellId[]) || []

  return (
    <>
      <CompactWellsDisplay
        wells={wells}
        onChange={(w) => onChange({ ...details, wells: w })}
        selectionCount={sourceSelectionCount}
        onUseSelection={getSourceWells ? () => onChange({ ...details, wells: getSourceWells() }) : undefined}
      />
      <div className="ribbon-section ribbon-section--grow">
        <input
          type="text"
          value={(details.description as string) || ''}
          onChange={(e) => onChange({ ...details, description: e.target.value || undefined })}
          placeholder="Description..."
          className="description-input"
        />
      </div>
    </>
  )
}

/**
 * Serial dilution macro fields - uses the SerialDilutionForm in compact mode
 */
function SerialDilutionFields({
  details,
  onChange,
  getSourceWells,
  getTargetWells,
  sourceLabwareId,
  sourceLabwareRows,
  sourceLabwareCols,
  targetLabwareId,
  targetLabwareRows,
  targetLabwareCols,
}: FieldProps) {
  const program = details.program as MacroProgram | undefined
  const programParams = program?.kind === 'serial_dilution' ? program.params : undefined
  const fallbackPath = programParams
    ? normalizeSerialDilutionParams(programParams, { fallbackLabwareId: sourceLabwareId }).lanes[0]?.path || []
    : []
  const sourceWells = getSourceWells ? getSourceWells() : ((details.wells as WellId[]) || fallbackPath)
  const targetWells = getTargetWells ? getTargetWells() : []
  const labwareId = (details.labwareId as string) || sourceLabwareId || 'source'

  const handleParamsChange = useCallback((params: SerialDilutionParamsV2 | null) => {
    if (params) {
      onChange({
        ...details,
        wells: params.lanes[0]?.path?.[0] ? [params.lanes[0].path[0]] : [],
        labwareId: params.lanes[0]?.targetLabwareId || labwareId,
        serialDilutionParams: params,
      })
    } else {
      onChange({ ...details, wells: [], serialDilutionParams: undefined })
    }
  }, [details, labwareId, onChange])

  return (
    <div className="serial-dilution-ribbon-wrapper">
      <SerialDilutionForm
        sourceSelectedWells={sourceWells}
        targetSelectedWells={targetWells}
        sourceLabwareId={labwareId}
        sourceLabwareRows={sourceLabwareRows}
        sourceLabwareCols={sourceLabwareCols}
        targetLabwareId={targetLabwareId}
        targetLabwareRows={targetLabwareRows}
        targetLabwareCols={targetLabwareCols}
        initialParams={programParams}
        onChange={handleParamsChange}
        showPreview={true}
        compact={true}
      />
    </div>
  )
}

function QuadrantReplicateFields({
  details,
  onChange,
  getSourceWells,
  sourceLabwareId,
  sourceLabwareRows,
  sourceLabwareCols,
  targetLabwareId,
  targetLabwareRows,
  targetLabwareCols,
}: FieldProps) {
  const program = details.program as MacroProgram | undefined
  const programParams = program?.kind === 'quadrant_replicate' ? program.params : undefined
  const sourceWells = getSourceWells ? getSourceWells() : ((details.wells as WellId[]) || programParams?.sourceWells || [])

  const handleParamsChange = useCallback((params: QuadrantReplicateParams | null) => {
    if (params) {
      onChange({
        ...details,
        wells: params.sourceWells,
        quadrantParams: params,
      })
    } else {
      onChange({ ...details, wells: [], quadrantParams: undefined })
    }
  }, [details, onChange])

  return (
    <div className="serial-dilution-ribbon-wrapper">
      <QuadrantReplicateForm
        sourceWells={sourceWells}
        sourceLabwareId={sourceLabwareId}
        sourceRows={sourceLabwareRows}
        sourceCols={sourceLabwareCols}
        targetLabwareId={targetLabwareId}
        targetRows={targetLabwareRows}
        targetCols={targetLabwareCols}
        initialParams={programParams}
        onChange={handleParamsChange}
        compact={true}
      />
    </div>
  )
}

function SpacingTransitionFields({
  details,
  onChange,
  getSourceWells,
  getTargetWells,
  sourceLabwareId,
  targetLabwareId,
}: FieldProps) {
  const program = details.program as MacroProgram | undefined
  const programParams = program?.kind === 'spacing_transition_transfer' ? program.params : undefined
  const sourceWells = getSourceWells ? getSourceWells() : ((details.wells as WellId[]) || programParams?.sourceWells || [])
  const targetWells = getTargetWells ? getTargetWells() : (programParams?.targetWells || [])

  const handleParamsChange = useCallback((params: SpacingTransitionTransferParams | null) => {
    if (params) {
      onChange({
        ...details,
        wells: params.sourceWells,
        spacingTransitionParams: params,
      })
    } else {
      onChange({ ...details, wells: [], spacingTransitionParams: undefined })
    }
  }, [details, onChange])

  return (
    <div className="serial-dilution-ribbon-wrapper">
      <SpacingTransitionTransferForm
        sourceWells={sourceWells}
        targetWells={targetWells}
        sourceLabwareId={sourceLabwareId}
        targetLabwareId={targetLabwareId}
        initialParams={programParams}
        onChange={handleParamsChange}
        compact={true}
      />
    </div>
  )
}

export function EventRibbon({
  events,
  selectedEventId,
  editingEventId = null,
  onSelectEvent,
  onEditEvent,
  onAddEvent,
  onUpdateEvent,
  onDeleteEvent,
  sourceSelectionCount = 0,
  targetSelectionCount = 0,
  getSourceWells,
  getTargetWells,
  sourceLabwareId,
  sourceLabwareRows,
  sourceLabwareCols,
  targetLabwareId,
  targetLabwareRows,
  targetLabwareCols,
  sourceOrientation = 'landscape',
  targetOrientation = 'landscape',
  sourceMaxVolumeUL,
  targetMaxVolumeUL,
  vocabPackId = 'liquid-handling/v1',
  onPlaybackPositionChange,
  prefillMaterials = [],
}: EventRibbonProps) {
  // Get first verb from vocab pack for default
  const defaultEventType = useMemo(() => {
    const verbs = getVerbsForDisplay(vocabPackId)
    return verbs.length > 0 ? verbs[0].verb : 'add_material'
  }, [vocabPackId])
  
  // Current event type being created (now string to support vocab verbs)
  const [eventType, setEventType] = useState<string>(defaultEventType)
  const [appliedPrefillKey, setAppliedPrefillKey] = useState<string | null>(null)
  const [showAdvancedActions, setShowAdvancedActions] = useState(false)
  const [operationTemplates, setOperationTemplates] = useState<OperationTemplateRecord[]>([])
  const [templateModalProgram, setTemplateModalProgram] = useState<TransferVignetteMacroProgram | null>(null)
  const [templateModalTemplate, setTemplateModalTemplate] = useState<OperationTemplateRecord | null>(null)
  const [showTemplateLibrary, setShowTemplateLibrary] = useState(false)
  
  // Reset event type when vocab pack changes
  useEffect(() => {
    setEventType(defaultEventType)
    setFormDetails({ wells: [], ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) })
  }, [vocabPackId, defaultEventType, sourceLabwareId])
  // Form details (for creating new events)
  const [formDetails, setFormDetails] = useState<DetailsRecord>(() => ({
    ...createDefaultDetails('add_material'),
    ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
  }))
  // If editing an existing event
  const [editingEvent, setEditingEvent] = useState<PlateEvent | null>(null)
  const [contextOptions, setContextOptions] = useState<ContextOption[]>([])
  const [contextsLoading, setContextsLoading] = useState(false)
  const prefillKey = useMemo(
    () => prefillMaterials.map((ref) => `${ref.kind}:${ref.id}`).join(','),
    [prefillMaterials],
  )

  const loadOperationTemplates = useCallback(async () => {
    try {
      const records = await apiClient.getRecords(OPERATION_TEMPLATE_SCHEMA_ID)
      setOperationTemplates(
        records
          .map((envelope) => parseOperationTemplateEnvelope(envelope))
          .filter((template): template is OperationTemplateRecord => Boolean(template))
          .sort((a, b) => a.name.localeCompare(b.name)),
      )
    } catch {
      setOperationTemplates([])
    }
  }, [])
  
  // Get the selected event from the timeline
  const selectedEvent = useMemo(() => events.find((e) => e.eventId === selectedEventId), [events, selectedEventId])
  const editingSourceEvent = useMemo(() => events.find((e) => e.eventId === editingEventId) ?? null, [events, editingEventId])

  // When an existing event is selected, load it for editing
  useEffect(() => {
    if (editingSourceEvent) {
      setEditingEvent({ ...editingSourceEvent })
    } else {
      setEditingEvent(null)
    }
  }, [editingSourceEvent])

  useEffect(() => {
    void loadOperationTemplates()
  }, [loadOperationTemplates])

  // Load context records once for aliquot lineage picker
  useEffect(() => {
    let cancelled = false
    const loadContexts = async () => {
      setContextsLoading(true)
      try {
        const records = await apiClient.getRecords('computable-lab/context')
        if (cancelled) return
        const options: ContextOption[] = records.map((env) => {
          const payload = env.payload as { id?: string; subject_ref?: { label?: string } }
          const id = payload.id || env.recordId
          const label = payload.subject_ref?.label
            ? `${id} - ${payload.subject_ref.label}`
            : id
          return { id, label }
        })
        setContextOptions(options)
      } catch {
        if (!cancelled) setContextOptions([])
      } finally {
        if (!cancelled) setContextsLoading(false)
      }
    }
    loadContexts()
    return () => {
      cancelled = true
    }
  }, [])

  // Auto-sync wells from selection when creating (not editing)
  useEffect(() => {
    if (editingEvent || !getSourceWells) return
    
    const currentSourceWells = getSourceWells()
    const currentTargetWells = getTargetWells?.() || []
    
    // Only auto-sync if there's a selection
    if (currentSourceWells.length === 0 && currentTargetWells.length === 0) return
    
    setFormDetails((prev) => {
      if (eventType === 'transfer' || eventType === 'multi_dispense') {
        const normalized = normalizeTransferDetails(prev as TransferDetails)
        const newDetails = { ...normalized }
        if (currentSourceWells.length > 0) {
          newDetails.sourceWells = currentSourceWells
        }
        if (currentTargetWells.length > 0) {
          newDetails.destWells = currentTargetWells
        }
        return serializeTransferDetails(newDetails, prev as TransferDetails) as unknown as DetailsRecord
      } else if ((prev.program as MacroProgram | undefined)?.kind === 'transfer_vignette') {
        const program = prev.program as TransferVignetteMacroProgram
        return {
          ...prev,
          program: {
            ...program,
            params: {
              ...program.params,
              ...(currentSourceWells.length > 0 ? { sourceWells: currentSourceWells, sourceLabwareId } : {}),
              ...(currentTargetWells.length > 0 ? { targetWells: currentTargetWells, targetLabwareId } : {}),
            },
          },
        }
      } else {
        if (currentSourceWells.length > 0) {
          return { ...prev, wells: currentSourceWells, ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) }
        }
      }
      return prev
    })
  }, [sourceSelectionCount, targetSelectionCount, getSourceWells, getTargetWells, eventType, editingEvent, sourceLabwareId, targetLabwareId])

  useEffect(() => {
    if (editingEvent || prefillMaterials.length === 0 || appliedPrefillKey === prefillKey) return
    const firstRef = prefillMaterials[0]
    const selectedSourceWells = getSourceWells?.() || []
    setEventType('add_material')
    setFormDetails(
      applyAddMaterialSelection(
        {
          wells: selectedSourceWells,
          ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}),
        } as AddMaterialDetails,
        firstRef,
      ) as DetailsRecord,
    )
    setAppliedPrefillKey(prefillKey)
  }, [appliedPrefillKey, editingEvent, getSourceWells, prefillKey, prefillMaterials, sourceLabwareId])

  // Change event type (resets form details)
  const handleTypeChange = useCallback((newType: string) => {
    if (newType.startsWith('operation-template:')) {
      const templateId = newType.slice('operation-template:'.length)
      const template = operationTemplates.find((entry) => entry.id === templateId)
      if (!template) return
      const program = createTransferVignetteProgramFromTemplate(template, {
        sourceLabwareId,
        targetLabwareId,
        sourceWells: getSourceWells?.() || [],
        targetWells: getTargetWells?.() || [],
      })
      setEventType('macro_program')
      setFormDetails({ program } as DetailsRecord)
      return
    }
    setEventType(newType)
    setFormDetails((newType === 'transfer' || newType === 'multi_dispense')
      ? serializeTransferDetails({ sourceWells: [], destWells: [] }) as unknown as DetailsRecord
      : { wells: [], ...(sourceLabwareId ? { labwareId: sourceLabwareId } : {}) })
  }, [getSourceWells, getTargetWells, operationTemplates, sourceLabwareId, targetLabwareId])

  const handleUnderlyingEventTypeChange = useCallback((nextType: EventType) => {
    if (editingEvent) {
      setEditingEvent({ ...editingEvent, event_type: nextType })
    } else {
      setEventType(nextType)
    }
  }, [editingEvent])

  // Update form details
  const handleDetailsChange = useCallback((details: DetailsRecord) => {
    if (editingEvent) {
      setEditingEvent({ ...editingEvent, details: details as EventDetails })
    } else {
      setFormDetails(details)
    }
  }, [editingEvent])

  const handleSaveTransferProgram = useCallback((program: TransferVignetteMacroProgram) => {
    setTemplateModalTemplate(null)
    setTemplateModalProgram(program)
  }, [])

  const handleVersionTemplate = useCallback((template: OperationTemplateRecord) => {
    setTemplateModalTemplate(template)
    setTemplateModalProgram(createTransferVignetteProgramFromTemplate(template))
  }, [])

  const handleTransferProgramSaved = useCallback((template: OperationTemplateRecord) => {
    setOperationTemplates((prev) => {
      const next = [...prev.filter((entry) => entry.id !== template.id), template]
      next.sort((a, b) => a.name.localeCompare(b.name))
      return next
    })
    setTemplateModalProgram((current) => {
      if (!current) return current
      const nextProgram = {
        ...current,
        template_ref: {
          kind: 'record' as const,
          id: template.id,
          type: 'operation-template',
          label: formatOperationTemplateLabel(template),
        },
      }
      if (editingEvent && editingEvent.event_type === 'macro_program') {
        setEditingEvent({ ...editingEvent, details: { ...(editingEvent.details as DetailsRecord), program: nextProgram } as EventDetails })
      } else {
        setEventType('macro_program')
        setFormDetails({ program: nextProgram } as DetailsRecord)
      }
      return nextProgram
    })
  }, [editingEvent])

  const handleTemplateUpdated = useCallback((template: OperationTemplateRecord) => {
    setOperationTemplates((prev) => {
      const next = [...prev.filter((entry) => entry.id !== template.id), template]
      next.sort((a, b) => a.name.localeCompare(b.name))
      return next
    })
  }, [])

  // Submit: Create new (if no editingEvent) or Update existing
  const handleSubmit = useCallback(() => {
    const detailsForGuard = (editingEvent ? editingEvent.details : formDetails) as DetailsRecord
    const typeForGuard = editingEvent ? editingEvent.event_type : eventType
    const guardVolume = (typeForGuard === 'transfer' || typeForGuard === 'multi_dispense')
      ? normalizeTransferDetails(detailsForGuard as TransferDetails).volume?.value
      : (typeForGuard === 'macro_program' && (detailsForGuard.program as MacroProgram | undefined)?.kind === 'transfer_vignette')
        ? ((detailsForGuard.program as TransferVignetteMacroProgram).params.volume?.value)
      : (typeForGuard === 'add_material' ? (detailsForGuard.volume as { value?: number } | undefined)?.value : undefined)
    const guardMessage = (() => {
      if (typeof guardVolume !== 'number' || guardVolume <= 0) return null
      if ((typeForGuard === 'transfer' || typeForGuard === 'multi_dispense') && typeof targetMaxVolumeUL === 'number' && guardVolume > targetMaxVolumeUL) {
        return `Volume ${guardVolume} µL exceeds target well capacity (${targetMaxVolumeUL} µL).`
      }
      if (typeForGuard === 'add_material' && typeof sourceMaxVolumeUL === 'number' && guardVolume > sourceMaxVolumeUL) {
        return `Volume ${guardVolume} µL exceeds source well capacity (${sourceMaxVolumeUL} µL).`
      }
      return null
    })()
    if (guardMessage) return
    if (editingEvent) {
      // Update existing event
      const updatedEvent = (editingEvent.event_type === 'transfer' || editingEvent.event_type === 'multi_dispense')
        ? {
            ...editingEvent,
            details: withCanonicalTransferDetails(editingEvent.details as TransferDetails),
          }
        : editingEvent
      onUpdateEvent(updatedEvent)
      onEditEvent?.(null)
      onSelectEvent(updatedEvent.eventId)
    } else {
      if (eventType === 'serial_dilution') {
        const params = (formDetails.serialDilutionParams as SerialDilutionParamsV2 | undefined) || undefined
        if (!params) return
        const macroProgram: MacroProgram = {
          kind: 'serial_dilution',
          params,
        }
        const macroEvent: PlateEvent = {
          eventId: generateEventId(),
          event_type: 'macro_program',
          t_offset: 'PT0M',
          details: {
            ...(formDetails as EventDetails),
            program: macroProgram,
          } as EventDetails,
        }
        onAddEvent(macroEvent)
        return
      }
      if (eventType === 'quadrant_replicate') {
        const params = (formDetails.quadrantParams as QuadrantReplicateParams | undefined) || undefined
        if (!params) return
        const macroProgram: MacroProgram = {
          kind: 'quadrant_replicate',
          params,
          source_pose: sourceLabwareId ? { orientation: sourceOrientation } : undefined,
          target_pose: targetLabwareId ? { orientation: targetOrientation } : undefined,
        }
        const macroEvent: PlateEvent = {
          eventId: generateEventId(),
          event_type: 'macro_program',
          t_offset: 'PT0M',
          details: {
            ...(formDetails as EventDetails),
            program: macroProgram,
          } as EventDetails,
        }
        onAddEvent(macroEvent)
        return
      }
      const normalizedDetails = (eventType === 'transfer' || eventType === 'multi_dispense')
        ? withCanonicalTransferDetails(formDetails as TransferDetails)
        : (formDetails as EventDetails)
      // Create new event (cast event_type as EventType for backwards compatibility)
      const newEvent: PlateEvent = {
        eventId: generateEventId(),
        event_type: eventType as EventType,
        t_offset: 'PT0M',
        details: normalizedDetails,
      }
      onAddEvent(newEvent)
      
      // Reset form for next event (keep type, clear wells but preserve material/volume for quick repeat)
      const preservedDetails = { ...formDetails }
      if (eventType === 'transfer' || eventType === 'multi_dispense') {
        const nextDetails = serializeTransferDetails(
          { ...normalizeTransferDetails(preservedDetails as TransferDetails), sourceWells: [], destWells: [] },
          preservedDetails as TransferDetails
        )
        setFormDetails(nextDetails as unknown as DetailsRecord)
        return
      } else if ((preservedDetails.program as MacroProgram | undefined)?.kind === 'transfer_vignette') {
        const program = preservedDetails.program as TransferVignetteMacroProgram
        setFormDetails({
          ...preservedDetails,
          program: {
            ...program,
            params: {
              ...program.params,
              sourceWells: [],
              targetWells: [],
            },
          },
        })
        return
      } else {
        preservedDetails.wells = []
      }
      setFormDetails(preservedDetails)
    }
  }, [editingEvent, eventType, formDetails, onAddEvent, onUpdateEvent, onSelectEvent, onEditEvent, sourceMaxVolumeUL, targetMaxVolumeUL])

  // Cancel editing (return to create mode)
  const handleCancel = useCallback(() => {
    setEditingEvent(null)
    onEditEvent?.(null)
  }, [onEditEvent])

  const handleStartEditing = useCallback(() => {
    if (!selectedEvent) return
    onSelectEvent(selectedEvent.eventId)
    onEditEvent?.(selectedEvent.eventId)
  }, [onEditEvent, onSelectEvent, selectedEvent])

  const handleCreateMode = useCallback(() => {
    onEditEvent?.(null)
    onSelectEvent(null)
  }, [onEditEvent, onSelectEvent])

  // Get current details (either editing or form)
  const currentDetails = editingEvent ? editingEvent.details as DetailsRecord : formDetails
  const currentType = editingEvent ? editingEvent.event_type : eventType
  const currentActionType = getActionTypeForDisplay(currentType, currentDetails)
  const visibleOperationTemplates = useMemo(
    () => operationTemplates.filter((template) => template.status !== 'deprecated'),
    [operationTemplates],
  )
  const isEditing = !!editingEvent
  const selectedEventIndex = selectedEvent ? events.findIndex((event) => event.eventId === selectedEvent.eventId) : -1
  const selectedEventSummary = selectedEvent ? getEventSummary(selectedEvent) : null
  const currentVolumeValue = useMemo(() => {
    if (currentType === 'transfer' || currentType === 'multi_dispense') {
      const normalized = normalizeTransferDetails(currentDetails as TransferDetails)
      return normalized.volume?.value
    }
    if (currentType === 'macro_program' && (currentDetails.program as MacroProgram | undefined)?.kind === 'transfer_vignette') {
      return (currentDetails.program as TransferVignetteMacroProgram).params.volume?.value
    }
    if (currentType === 'add_material') {
      const volume = currentDetails.volume as { value?: number } | undefined
      return typeof volume?.value === 'number' ? volume.value : undefined
    }
    return undefined
  }, [currentDetails, currentType])
  const volumeGuardMessage = useMemo(() => {
    if (typeof currentVolumeValue !== 'number' || currentVolumeValue <= 0) return null
    if ((currentType === 'transfer' || currentType === 'multi_dispense' || ((currentDetails.program as MacroProgram | undefined)?.kind === 'transfer_vignette')) && typeof targetMaxVolumeUL === 'number' && currentVolumeValue > targetMaxVolumeUL) {
      return `Volume ${currentVolumeValue} µL exceeds target well capacity (${targetMaxVolumeUL} µL).`
    }
    if (currentType === 'add_material' && typeof sourceMaxVolumeUL === 'number' && currentVolumeValue > sourceMaxVolumeUL) {
      return `Volume ${currentVolumeValue} µL exceeds source well capacity (${sourceMaxVolumeUL} µL).`
    }
    return null
  }, [currentType, currentVolumeValue, sourceMaxVolumeUL, targetMaxVolumeUL])

  useEffect(() => {
    if (currentActionType === 'mix' || currentActionType === 'quadrant_replicate' || currentActionType === 'other') {
      setShowAdvancedActions(true)
    }
  }, [currentActionType])

  // Render the form fields
  const renderFields = () => {
    const props: FieldProps = {
      details: currentDetails,
      onChange: handleDetailsChange,
      eventType: currentType,
      onEventTypeChange: handleUnderlyingEventTypeChange,
      onSaveTransferProgram: handleSaveTransferProgram,
      sourceSelectionCount,
      targetSelectionCount,
      getSourceWells,
      getTargetWells,
      contextOptions,
      contextsLoading,
      sourceLabwareId,
      sourceLabwareRows,
      sourceLabwareCols,
      targetLabwareId,
      targetLabwareRows,
      targetLabwareCols,
    }

    switch (currentType) {
      case 'add_material': return <AddMaterialFields {...props} />
      case 'transfer': return <TransferFields {...props} />
      case 'multi_dispense': return <TransferFields {...props} />
      case 'mix': return <MixFields {...props} />
      case 'wash': return <WashFields {...props} />
      case 'incubate': return <IncubateFields {...props} />
      case 'read': return <ReadFields {...props} />
      case 'serial_dilution': return <SerialDilutionFields {...props} />
      case 'quadrant_replicate': return <QuadrantReplicateFields {...props} />
      case 'macro_program':
        if ((currentDetails.program as MacroProgram | undefined)?.kind === 'serial_dilution') {
          return <SerialDilutionFields {...props} />
        }
        if ((currentDetails.program as MacroProgram | undefined)?.kind === 'quadrant_replicate') {
          return <QuadrantReplicateFields {...props} />
        }
        if ((currentDetails.program as MacroProgram | undefined)?.kind === 'transfer_vignette') {
          return <TransferVignetteFields {...props} />
        }
        if ((currentDetails.program as MacroProgram | undefined)?.kind === 'spacing_transition_transfer') {
          return <SpacingTransitionFields {...props} />
        }
        return <GenericFields {...props} />
      default: return <GenericFields {...props} />
    }
  }

  const handleUseTemplate = useCallback((template: OperationTemplateRecord) => {
    handleTypeChange(operationTemplateActionType(template.id))
    setShowTemplateLibrary(false)
  }, [handleTypeChange])

  return (
    <div className="event-ribbon">
      <CompactInputStyles />
      
      {/* Timeline scrubber (no + button needed) */}
      <EventPillBar
        events={events}
        selectedEventId={selectedEventId}
        onSelectEvent={onSelectEvent}
        onAddEvent={() => {}} // No-op, not using + button
        onDeleteEvent={onDeleteEvent}
        onPlaybackPositionChange={onPlaybackPositionChange}
      />

      {/* Always-visible form */}
      <div className={`event-ribbon__form ${isEditing ? 'event-ribbon__form--edit' : ''}`}>
        <div className="form-mode">
          {isEditing ? (
            <>
              <span className="form-mode-label">Editing Event {selectedEventIndex + 1}</span>
              {selectedEventSummary && (
                <span className="form-mode-summary" title={selectedEventSummary}>
                  {selectedEventSummary}
                </span>
              )}
            </>
          ) : selectedEvent ? (
            <>
              <span className="form-mode-label form-mode-label--focus">Focused Event {selectedEventIndex + 1}</span>
              {selectedEventSummary && (
                <span className="form-mode-summary" title={selectedEventSummary}>
                  {selectedEventSummary}
                </span>
              )}
              <button className="ribbon-chip-btn" type="button" onClick={handleStartEditing}>
                Edit Focused
              </button>
              <button className="ribbon-chip-btn ribbon-chip-btn--muted" type="button" onClick={handleCreateMode}>
                New Event
              </button>
            </>
          ) : (
            <>
              <span className="form-mode-label form-mode-label--create">Create New Event</span>
              <span className="form-mode-summary">Selected wells stay independent from event focus.</span>
            </>
          )}
        </div>
        
        <div className="event-ribbon__template-tools">
          <button
            className="ribbon-chip-btn"
            type="button"
            onClick={() => setShowTemplateLibrary(true)}
          >
            Manage Programs
          </button>
        </div>
        <TypeSelector 
          value={currentActionType} 
          onChange={isEditing ? () => {} : handleTypeChange}
          vocabPackId={vocabPackId}
          operationTemplates={visibleOperationTemplates}
          disabled={isEditing}
          showAdvanced={showAdvancedActions}
          onToggleAdvanced={() => setShowAdvancedActions((prev) => !prev)}
        />
        {prefillMaterials.length > 0 && currentActionType === 'add_material' && (
          <div className="event-ribbon__prefills">
            <span className="event-ribbon__prefills-label">Ready to Add</span>
            {prefillMaterials.map((ref) => (
              <button
                key={`${ref.kind}-${ref.id}`}
                className="event-ribbon__prefill-chip"
                type="button"
                onClick={() => handleDetailsChange(applyAddMaterialSelection(currentDetails as AddMaterialDetails, ref) as DetailsRecord)}
              >
                {ref.label || ref.id}
              </button>
            ))}
          </div>
        )}
        
        <div className="event-ribbon__fields">{renderFields()}</div>
        {volumeGuardMessage && (
          <div className="event-ribbon__volume-guard" role="alert">
            {volumeGuardMessage}
          </div>
        )}
        <div className="event-ribbon__actions">
          <button 
            className="ribbon-btn ribbon-btn--save" 
            onClick={handleSubmit} 
            disabled={Boolean(volumeGuardMessage)}
            title={isEditing ? 'Save Changes' : 'Create Event'}
          >
            ✓
          </button>
          {isEditing && (
            <button 
              className="ribbon-btn ribbon-btn--cancel" 
              onClick={handleCancel} 
              title="Cancel Edit"
            >
              ✕
            </button>
          )}
        </div>
      </div>
      <OperationTemplateModal
        isOpen={Boolean(templateModalProgram)}
        program={templateModalProgram}
        template={templateModalTemplate}
        onClose={() => {
          setTemplateModalProgram(null)
          setTemplateModalTemplate(null)
        }}
        onSaved={handleTransferProgramSaved}
      />
      <OperationTemplateLibraryModal
        isOpen={showTemplateLibrary}
        templates={operationTemplates}
        onClose={() => setShowTemplateLibrary(false)}
        onUseTemplate={handleUseTemplate}
        onVersionTemplate={handleVersionTemplate}
        onUpdated={handleTemplateUpdated}
      />

      <style>{`
        .event-ribbon {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          padding: 0.5rem;
          background: #f8f9fa;
          border-radius: 8px;
        }
        .event-ribbon__form {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          padding: 0.5rem 0.75rem;
          background: white;
          border-radius: 6px;
          border: 1px solid #e9ecef;
          flex-wrap: wrap;
        }
        .event-ribbon__form--edit {
          border-color: #339af0;
          background: #f8fbff;
        }
        .event-ribbon__prefills {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex-wrap: wrap;
        }
        .event-ribbon__prefills-label {
          font-size: 0.72rem;
          font-weight: 700;
          color: #64748b;
          text-transform: uppercase;
          letter-spacing: 0.08em;
        }
        .event-ribbon__prefill-chip {
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          border-radius: 999px;
          padding: 0.35rem 0.7rem;
          font-size: 0.8rem;
          cursor: pointer;
        }
        .event-ribbon__prefill-chip:hover {
          background: #dbeafe;
        }
        .form-mode-label {
          font-size: 0.7rem;
          font-weight: 600;
          color: #339af0;
          text-transform: uppercase;
        }
        .form-mode-label--focus {
          color: #5f3dc4;
        }
        .form-mode-label--create {
          color: #2b8a3e;
        }
        .form-mode {
          display: flex;
          align-items: center;
          gap: 0.5rem;
          flex: 1 1 100%;
          min-width: 0;
        }
        .form-mode-summary {
          font-size: 0.78rem;
          color: #495057;
          max-width: 320px;
          white-space: nowrap;
          overflow: hidden;
          text-overflow: ellipsis;
        }
        .ribbon-chip-btn {
          height: 28px;
          padding: 0 0.65rem;
          border: 1px solid #bac8ff;
          border-radius: 999px;
          background: #edf2ff;
          color: #364fc7;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
        .ribbon-chip-btn--muted {
          border-color: #ced4da;
          background: #f8f9fa;
          color: #495057;
        }
        .event-ribbon__fields {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex: 1;
          flex-wrap: wrap;
        }
        .event-ribbon__actions {
          display: flex;
          gap: 0.25rem;
        }
        .event-ribbon__volume-guard {
          font-size: 0.72rem;
          color: #b45309;
          background: #fffbeb;
          border: 1px solid #fde68a;
          border-radius: 6px;
          padding: 0.2rem 0.45rem;
          max-width: 420px;
        }
        .action-chooser {
          display: flex;
          flex-wrap: wrap;
          gap: 0.6rem 1rem;
          flex: 1 1 100%;
          align-items: flex-start;
        }
        .action-chooser__group {
          display: flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .action-chooser__group-label {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.08em;
          color: #64748b;
        }
        .action-chooser__group-actions {
          display: flex;
          align-items: center;
          gap: 0.35rem;
          flex-wrap: wrap;
        }
        .action-chip {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          border: 1px solid #d0d7de;
          background: #fff;
          border-radius: 999px;
          padding: 0.34rem 0.7rem;
          font-size: 0.78rem;
          color: #334155;
          cursor: pointer;
        }
        .action-chip:disabled {
          opacity: 0.6;
          cursor: not-allowed;
        }
        .action-chip:hover:not(:disabled) {
          border-color: #94a3b8;
          background: #f8fafc;
        }
        .action-chip--selected {
          border-color: #3b82f6;
          background: #eff6ff;
          color: #1d4ed8;
        }
        .action-chip__icon {
          font-size: 0.85rem;
        }
        .action-chip__label {
          font-weight: 600;
        }
        .action-chip__scope {
          border-radius: 999px;
          padding: 0.08rem 0.38rem;
          font-size: 0.62rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.05em;
        }
        .action-chip__scope--well {
          background: #eef2ff;
          color: #4338ca;
        }
        .action-chip__scope--plate {
          background: #ecfdf5;
          color: #047857;
        }
        .action-chip__scope--program {
          background: #f5f3ff;
          color: #6d28d9;
        }
        .action-chooser__toggle {
          height: 30px;
          border: 1px dashed #cbd5e1;
          background: #f8fafc;
          border-radius: 999px;
          padding: 0 0.8rem;
          font-size: 0.75rem;
          font-weight: 600;
          color: #475569;
          cursor: pointer;
        }
        .advanced-section {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
          flex: 1 1 100%;
          min-width: 280px;
        }
        .advanced-section__toggle {
          align-self: flex-start;
          border: 1px dashed #cbd5e1;
          background: #f8fafc;
          color: #475569;
          border-radius: 999px;
          padding: 0.2rem 0.7rem;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
        .advanced-section__content {
          display: flex;
          align-items: center;
          gap: 0.75rem;
          flex-wrap: wrap;
          padding: 0.55rem 0.7rem;
          border: 1px solid #e2e8f0;
          background: #f8fafc;
          border-radius: 8px;
        }
        .transfer-program__summary {
          flex: 1 1 100%;
          font-size: 0.74rem;
          color: #475569;
        }
        .transfer-program__save {
          border: 1px solid #bfdbfe;
          background: #eff6ff;
          color: #1d4ed8;
          border-radius: 999px;
          padding: 0.28rem 0.75rem;
          font-size: 0.74rem;
          font-weight: 600;
          cursor: pointer;
        }
        .transfer-program__group {
          display: flex;
          align-items: center;
          gap: 0.6rem;
          flex-wrap: wrap;
          padding-top: 0.2rem;
          border-top: 1px dashed #dbe4ee;
          flex: 1 1 100%;
        }
        .transfer-program__group-label {
          font-size: 0.68rem;
          font-weight: 700;
          text-transform: uppercase;
          letter-spacing: 0.06em;
          color: #64748b;
          min-width: 64px;
        }
        .transfer-program__mix-inline {
          display: inline-flex;
          align-items: center;
          gap: 0.45rem;
          flex-wrap: wrap;
        }
        .ribbon-section {
          display: flex;
          align-items: center;
          gap: 0.25rem;
        }
        .ribbon-section--type { flex-shrink: 0; }
        .ribbon-section--grow { flex: 1; min-width: 150px; }
        .ribbon-section--context {
          min-width: 220px;
          gap: 0.4rem;
        }
        .context-label {
          font-size: 0.72rem;
          color: #6c757d;
          font-weight: 600;
          text-transform: uppercase;
          letter-spacing: 0.02em;
        }
        .context-input {
          height: 28px;
          min-width: 170px;
          padding: 0.25rem 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.8rem;
        }
        .compact-field--amount {
          min-width: 150px;
        }
        .compact-field--checkbox {
          min-width: 160px;
        }
        .compact-checkbox {
          display: inline-flex;
          align-items: center;
          gap: 0.35rem;
          font-size: 0.78rem;
          color: #475569;
          white-space: nowrap;
        }
        .material-input, .buffer-input, .description-input {
          height: 28px;
          padding: 0.25rem 0.5rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.85rem;
          width: 100px;
        }
        .description-input { width: 100%; }
        .read-type-select {
          height: 28px;
          padding: 0.25rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.8rem;
          background: white;
        }
        .wavelength-input {
          width: 76px;
          height: 28px;
          padding: 0.25rem;
          border: 1px solid #dee2e6;
          border-radius: 4px;
          font-size: 0.85rem;
          text-align: right;
          font-variant-numeric: tabular-nums;
        }
        .wavelength-unit {
          font-size: 0.75rem;
          color: #868e96;
        }
        .ribbon-btn {
          display: flex;
          align-items: center;
          justify-content: center;
          width: 32px;
          height: 32px;
          border: none;
          border-radius: 4px;
          font-size: 1.1rem;
          cursor: pointer;
        }
        .ribbon-btn:disabled {
          opacity: 0.45;
          cursor: not-allowed;
        }
        .ribbon-btn--save { background: #40c057; color: white; }
        .ribbon-btn--save:hover { background: #2f9e44; }
        .ribbon-btn--cancel { background: #e9ecef; color: #495057; }
        .ribbon-btn--cancel:hover { background: #dee2e6; }
        
        /* Material picker styles for ribbon context */
        .ribbon-section--material {
          position: relative;
          width: 200px;
          z-index: 50;
        }
        .ribbon-section--material .relative {
          position: relative;
        }
        .ribbon-section--material ul[role="listbox"] {
          position: absolute !important;
          top: 100%;
          left: 0;
          width: 280px;
          z-index: 1000 !important;
        }
        .ribbon-section--material input {
          height: 28px;
          font-size: 0.85rem;
          padding: 0.25rem 0.5rem 0.25rem 2rem;
        }
        
        /* Serial dilution form wrapper */
        .serial-dilution-ribbon-wrapper {
          flex: 1;
          min-width: 300px;
          max-width: 600px;
          background: #f8f9fa;
          border-radius: 6px;
          border: 1px solid #e9ecef;
        }
        .event-ribbon__template-tools {
          display: flex;
          justify-content: flex-end;
          margin-bottom: 0.35rem;
        }
      `}</style>
    </div>
  )
}
