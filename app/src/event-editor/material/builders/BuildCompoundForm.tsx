import { useCallback, useEffect, useMemo, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import type { OLSResultRef } from '../../../shared/api/olsClient'
import {
  MATERIAL_SCHEMA_ID,
  generateMaterialId,
  type ConcentrationValue,
} from '../../../types/material'
import { MultiOntologyRefList } from '../MultiOntologyRefList'
import { SolventPicker, type PickedSolvent } from '../SolventPicker'
import { useOntologyConfig } from '../useOntologyConfig'
import type { PickedMaterial } from '../state'

/**
 * Compound formulation builder ("1 mM clofibrate in DMSO"-style).
 *
 * Two-step save:
 *   1. `createRecord(MATERIAL_SCHEMA_ID, …)` — registers the compound as
 *      a local material concept, attaching ontology refs to `class`.
 *      Skipped if the concept already exists (no implementation here
 *      — duplicates land as separate records by design; dedupe is a
 *      separate concern).
 *   2. `createFormulation(…)` — creates the recipe + spec record that
 *      describes the stock (concentration in solvent).
 *
 * Returns the new formulation's id via `onSaved`. The modal's parent
 * state machine moves to `configure` with the formulation auto-selected.
 *
 * The seed comes from the search step's ontology-hit path: clicking
 * an OLS row routes directly into this form with the term pre-filled
 * in `classRefs`, the name pre-filled from the ontology label, and
 * a sensible default for `materialId`.
 */

export interface BuildCompoundFormProps {
  seedOntologyRef?: OLSResultRef
  onSaved: (next: PickedMaterial) => void
  onCancel: () => void
  onError: (message: string) => void
}

const DEFAULT_CONCENTRATION_UNITS = ['mM', 'µM', 'nM', 'M', 'mg/mL', '% w/v', '% v/v', 'X']

export function BuildCompoundForm({
  seedOntologyRef,
  onSaved,
  onCancel,
  onError,
}: BuildCompoundFormProps) {
  const [name, setName] = useState(seedOntologyRef?.label ?? '')
  const [classRefs, setClassRefs] = useState<OLSResultRef[]>(
    seedOntologyRef ? [seedOntologyRef] : [],
  )
  const [solvent, setSolvent] = useState<PickedSolvent | null>(null)
  const [concentrationValue, setConcentrationValue] = useState('1')
  const [concentrationUnit, setConcentrationUnit] = useState('mM')
  const [outputName, setOutputName] = useState('')
  const [outputNameDirty, setOutputNameDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { ontologies: configuredOntologies } = useOntologyConfig()

  // Auto-generate the output name as long as the user hasn't manually
  // edited it. Format: "<conc> <unit> <compound> in <solvent>".
  useEffect(() => {
    if (outputNameDirty) return
    const compoundLabel = name.trim()
    const solventLabel = solvent ? (solvent.kind === 'record' ? solvent.label : solvent.label) : ''
    const concentration = concentrationValue.trim()
    if (!compoundLabel) {
      setOutputName('')
      return
    }
    const parts: string[] = []
    if (concentration) parts.push(`${concentration} ${concentrationUnit}`)
    parts.push(compoundLabel)
    if (solventLabel) parts.push(`in ${solventLabel}`)
    setOutputName(parts.join(' '))
  }, [name, solvent, concentrationValue, concentrationUnit, outputNameDirty])

  const concentration: ConcentrationValue | undefined = useMemo(() => {
    const v = Number(concentrationValue)
    if (!Number.isFinite(v) || v <= 0) return undefined
    return { value: v, unit: concentrationUnit }
  }, [concentrationValue, concentrationUnit])

  const canSubmit = !submitting
    && name.trim().length > 0
    && outputName.trim().length > 0

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const trimmedName = name.trim()
      const materialId = generateMaterialId(trimmedName)
      const conceptPayload: Record<string, unknown> = {
        kind: 'material',
        id: materialId,
        name: trimmedName,
        domain: 'chemical',
        ...(classRefs.length > 0 ? { class: classRefs } : {}),
      }
      await apiClient.createRecord(MATERIAL_SCHEMA_ID, conceptPayload)

      const solventRef = solvent
        ? solvent.kind === 'record'
          ? { kind: 'record' as const, id: solvent.recordId, label: solvent.label }
          : { kind: 'ontology' as const, id: solvent.id, namespace: solvent.namespace, label: solvent.label, uri: solvent.uri }
        : undefined

      const formulationResp = await apiClient.createFormulation({
        material: {
          id: materialId,
          name: trimmedName,
          domain: 'chemical',
          ...(classRefs.length > 0
            ? {
                classRefs: classRefs.map((r) => ({
                  kind: 'ontology' as const,
                  id: r.id,
                  namespace: r.namespace,
                  label: r.label,
                  uri: r.uri,
                })),
              }
            : {}),
        },
        outputSpec: {
          name: outputName.trim(),
          ...(concentration ? { concentration } : {}),
          ...(solventRef ? { solventRef } : {}),
        },
        recipe: {
          name: `${trimmedName} stock`,
          inputRoles: [],
          // Placeholder step. Users refine the actual prep in the
          // Labware Editor when they care; the inline modal stays
          // focused on getting the material reference into the well.
          steps: [
            {
              order: 1,
              instruction: `Dissolve ${trimmedName} in ${
                solventRef?.label ?? 'solvent'
              } to ${concentrationValue} ${concentrationUnit}.`,
            },
          ],
        },
      })

      onSaved({
        recordId: formulationResp.materialSpecId,
        label: outputName.trim(),
        hasCellComposition: false,
        ...(concentration ? { concentration } : {}),
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onError(`Could not save formulation: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }, [
    canSubmit,
    classRefs,
    concentration,
    concentrationUnit,
    concentrationValue,
    name,
    onError,
    onSaved,
    outputName,
    solvent,
  ])

  return (
    <form
      className="add-material-body"
      onSubmit={(e) => {
        e.preventDefault()
        void handleSubmit()
      }}
    >
      <label className="add-material-field">
        <span className="add-material-field-label">Compound name</span>
        <input
          type="text"
          className="add-material-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., clofibrate"
          autoFocus={!seedOntologyRef}
          required
        />
        <span className="add-material-field-hint">
          The canonical name of the compound. Becomes part of the formulation's
          display name unless you override it below.
        </span>
      </label>

      <MultiOntologyRefList
        refs={classRefs}
        onChange={setClassRefs}
        ontologies={configuredOntologies}
        label="Ontology references"
      />

      <SolventPicker picked={solvent} onChange={setSolvent} />

      <div className="add-material-field add-material-field--row">
        <label className="add-material-field" style={{ flex: 2 }}>
          <span className="add-material-field-label">Concentration</span>
          <input
            type="number"
            className="add-material-input"
            value={concentrationValue}
            min="0"
            step="any"
            onChange={(e) => setConcentrationValue(e.target.value)}
          />
        </label>
        <label className="add-material-field" style={{ flex: 1 }}>
          <span className="add-material-field-label">Unit</span>
          <select
            className="add-material-input"
            value={concentrationUnit}
            onChange={(e) => setConcentrationUnit(e.target.value)}
          >
            {DEFAULT_CONCENTRATION_UNITS.map((unit) => (
              <option key={unit} value={unit}>{unit}</option>
            ))}
          </select>
        </label>
      </div>

      <label className="add-material-field">
        <span className="add-material-field-label">Formulation name</span>
        <input
          type="text"
          className="add-material-input"
          value={outputName}
          onChange={(e) => {
            setOutputName(e.target.value)
            setOutputNameDirty(true)
          }}
          placeholder="Auto-generated from fields above; editable"
          required
        />
        <span className="add-material-field-hint">
          What you'll see in future searches. Auto-fills as you change the
          compound / concentration / solvent; click here to override.
        </span>
      </label>

      <footer className="add-material-footer">
        <button type="button" className="add-material-btn" onClick={onCancel} disabled={submitting}>
          Back
        </button>
        <button
          type="submit"
          className="add-material-btn add-material-btn--primary"
          disabled={!canSubmit}
        >{submitting ? 'Saving…' : 'Save formulation'}</button>
      </footer>
    </form>
  )
}
