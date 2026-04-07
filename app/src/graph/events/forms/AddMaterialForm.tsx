/**
 * AddMaterialForm - Form for add_material event type.
 *
 * Uses the same MaterialPicker as the ribbon so formulations/specs and tracked
 * aliquots are first-class choices, with ontology-backed material fallback.
 */

import { useCallback, useEffect, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import type { EventDetails, AddMaterialDetails } from '../../../types/events'
import { applyAddMaterialSelection, getAddMaterialRef, parseMaterialLikeRef } from '../../../types/events'
import { WellsSelector, VolumeInput } from '../EventEditor'
import { MaterialPicker } from '../../../editor/material'
import type { Ref } from '../../../shared/ref'
import { FormulationUsageModal, type FormulationInstanceLotDraft } from './FormulationUsageModal'
import { useLabSettings } from '../../hooks/useLabSettings'
import { apiClient } from '../../../shared/api/client'
import { resolveAddMaterialSourceDefaults } from '../../../editor/lib/materialComposition'
import { CONCENTRATION_UNITS, formatCompositionSummary, formatConcentration, withInferredConcentrationBasis } from '../../../types/material'

interface FormProps {
  details: EventDetails
  onChange: (details: EventDetails) => void
}

export function AddMaterialForm({ details, onChange }: FormProps) {
  const navigate = useNavigate()
  const d = details as AddMaterialDetails
  const materialRef = parseMaterialLikeRef(getAddMaterialRef(d))
  const [pendingFormulationRef, setPendingFormulationRef] = useState<Ref | null>(null)
  const [selectedFormulationSummary, setSelectedFormulationSummary] = useState<Awaited<ReturnType<typeof apiClient.getFormulationsSummary>>[number] | null>(null)
  const [preferredSources, setPreferredSources] = useState<Array<{ roleLabel: string; vendor?: string; catalogNumber?: string }>>([])
  const [showAdvanced, setShowAdvanced] = useState(false)
  const { settings } = useLabSettings()
  const compositionSnapshot = Array.isArray(d.composition_snapshot) ? d.composition_snapshot : []
  const compositionSummary = formatCompositionSummary(compositionSnapshot, 4)
  const hasCellComposition = compositionSnapshot.some((entry) => entry?.role === 'cells')
  const countLabel = hasCellComposition ? 'Cell Count' : 'Count'
  const sourceSummary = compositionSummary || formatConcentration(d.concentration)

  const handleMaterialSelection = useCallback((ref: Ref | null) => {
    if (!ref) {
      setPendingFormulationRef(null)
      setSelectedFormulationSummary(null)
      onChange(applyAddMaterialSelection(d, null))
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
            ...applyAddMaterialSelection(d, ref),
            ...(defaults.concentration ? { concentration: withInferredConcentrationBasis(defaults.concentration) } : {}),
            ...(defaults.compositionSnapshot ? { composition_snapshot: defaults.compositionSnapshot } : {}),
          })
        })
        .catch(() => {
          onChange(applyAddMaterialSelection(d, ref))
        })
      return
    }
    if (ref.kind === 'record' && (ref.type === 'aliquot' || ref.type === 'material-instance')) {
      setPendingFormulationRef(null)
      setSelectedFormulationSummary(null)
      void resolveAddMaterialSourceDefaults(ref)
        .then((defaults) => {
          onChange({
            ...applyAddMaterialSelection(d, ref),
            ...(defaults.concentration ? { concentration: defaults.concentration } : {}),
            ...(defaults.compositionSnapshot ? { composition_snapshot: defaults.compositionSnapshot } : {}),
          })
        })
        .catch(() => onChange(applyAddMaterialSelection(d, ref)))
      return
    }
    setPendingFormulationRef(null)
    setSelectedFormulationSummary(null)
    onChange(applyAddMaterialSelection(d, ref))
  }, [d, onChange])

  const applyFormulationSelection = useCallback((lot?: FormulationInstanceLotDraft) => {
    if (!pendingFormulationRef) return
    const next = applyAddMaterialSelection(d, pendingFormulationRef)
    void resolveAddMaterialSourceDefaults(pendingFormulationRef, selectedFormulationSummary?.outputSpec ? selectedFormulationSummary : null)
      .then((defaults) => {
        onChange({
          ...next,
          ...(defaults.concentration ? { concentration: defaults.concentration } : {}),
          ...(defaults.compositionSnapshot ? { composition_snapshot: defaults.compositionSnapshot } : {}),
          ...(lot && Object.keys(lot).length > 0 ? { instance_lot: lot } : { instance_lot: undefined }),
        })
      })
      .finally(() => {
        setPendingFormulationRef(null)
        setPreferredSources([])
      })
  }, [d, onChange, pendingFormulationRef, selectedFormulationSummary])

  useEffect(() => {
    if (typeof d.count === 'number' || d.note || hasCellComposition) setShowAdvanced(true)
  }, [d.count, d.note, hasCellComposition])

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

  const routeOntologyToFormulation = useCallback((ref: Ref) => {
    if (ref.kind !== 'ontology') return
    const params = new URLSearchParams({
      create: '1',
      prefillName: ref.label || ref.id,
      prefillOntologyId: ref.id,
      prefillOntologyNamespace: ref.namespace,
      prefillOntologyLabel: ref.label,
      ...(ref.uri ? { prefillOntologyUri: ref.uri } : {}),
      prefillSource: 'add-material',
    })
    navigate(`/formulations?${params.toString()}`)
  }, [navigate])

  return (
    <div className="event-form add-material-form">
      <WellsSelector
        label="Target Wells"
        value={d.wells || []}
        onChange={(wells) => onChange({ ...d, wells })}
      />

      <div className="form-field">
        <label>What do you want to add?</label>
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
        <p className="form-hint">
          Usually choose a saved stock/formulation. If you do not need a specific prepared tube or plate, the system will handle the prepared instance automatically.
        </p>
        {materialRef?.kind === 'record' && sourceSummary && (
          <p className="form-hint">
            {compositionSummary ? `Composition: ${sourceSummary}.` : `Default concentration: ${sourceSummary}${selectedFormulationSummary?.outputSpec.solventLabel ? ` in ${selectedFormulationSummary.outputSpec.solventLabel}` : ''}.`}
          </p>
        )}
        {hasCellComposition && (
          <p className="form-hint">
            This source includes a cell component. Set a count if you want cell-level tracking in replay.
          </p>
        )}
      </div>

      <VolumeInput
        value={d.volume}
        onChange={(volume) => onChange({ ...d, volume })}
      />

      <div className="form-advanced">
        <button
          className="form-advanced__toggle"
          type="button"
          onClick={() => setShowAdvanced((prev) => !prev)}
        >
          {showAdvanced ? 'Hide Overrides' : 'Overrides & Notes'}
        </button>
        {showAdvanced && (
          <div className="form-advanced__content">
            <div className="form-row">
              <div className="form-field">
                <label>Concentration Override</label>
                <input
                  type="number"
                  value={d.concentration?.value ?? ''}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value)
                    if (!isNaN(num)) {
                      onChange({ ...d, concentration: withInferredConcentrationBasis({ value: num, unit: d.concentration?.unit || 'uM' }) })
                    } else if (e.target.value === '') {
                      onChange({ ...d, concentration: undefined })
                    }
                  }}
                  placeholder="Optional"
                  min="0"
                  step="any"
                />
              </div>
              <div className="form-field">
                <label>Unit</label>
                <select
                  value={d.concentration?.unit || 'uM'}
                  onChange={(e) => {
                    if (d.concentration) {
                      onChange({ ...d, concentration: withInferredConcentrationBasis({ ...d.concentration, unit: e.target.value }) })
                    }
                  }}
                >
                  {CONCENTRATION_UNITS.map((unit) => (
                    <option key={unit.value} value={unit.value}>{unit.label}</option>
                  ))}
                </select>
              </div>
            </div>

            <div className="form-row">
              <div className="form-field">
                <label>{countLabel}</label>
                <input
                  type="number"
                  value={typeof d.count === 'number' ? d.count : ''}
                  onChange={(e) => {
                    const num = parseFloat(e.target.value)
                    if (!isNaN(num)) {
                      onChange({ ...d, count: num })
                    } else if (e.target.value === '') {
                      onChange({ ...d, count: undefined })
                    }
                  }}
                  placeholder={hasCellComposition ? 'Optional cell count' : 'Optional'}
                  min="0"
                  step="any"
                />
              </div>
              <div className="form-field">
                <label>Note</label>
                <input
                  type="text"
                  value={d.note || ''}
                  onChange={(e) => onChange({ ...d, note: e.target.value || undefined })}
                  placeholder="Optional note"
                />
              </div>
            </div>
          </div>
        )}
      </div>

      <style>{`
        .form-row {
          display: grid;
          grid-template-columns: 1fr 1fr;
          gap: 0.5rem;
        }
        .form-hint {
          font-size: 0.75rem;
          color: #666;
          margin-top: 0.25rem;
        }
        .form-advanced {
          display: flex;
          flex-direction: column;
          gap: 0.5rem;
        }
        .form-advanced__toggle {
          align-self: flex-start;
          border: 1px dashed #cbd5e1;
          background: #f8fafc;
          color: #475569;
          border-radius: 999px;
          padding: 0.3rem 0.8rem;
          font-size: 0.75rem;
          font-weight: 600;
          cursor: pointer;
        }
        .form-advanced__content {
          display: flex;
          flex-direction: column;
          gap: 0.75rem;
          padding: 0.75rem;
          border: 1px solid #e2e8f0;
          border-radius: 8px;
          background: #f8fafc;
        }
      `}</style>

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
    </div>
  )
}
