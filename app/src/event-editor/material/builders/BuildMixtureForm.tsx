import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import type { ResolveRef } from '../../../shared/api/resolveUtil'
import {
  MATERIAL_SCHEMA_ID,
  generateMaterialId,
} from '../../../types/material'
import { MultiOntologyRefList } from '../MultiOntologyRefList'
import { useOntologyConfig } from '../useOntologyConfig'
import {
  CompositionEditor,
  compositionFromRows,
  makeEmptyRow,
  type CompositionDraftEntry,
} from '../CompositionEditor'
import type { PickedMaterial } from '../state'
import { compositionFormulationPayload, materialConceptPayload } from '../lib/materialSavePayload'

/**
 * Mixture builder ("DMEM + 10% FBS + 1× Pen/Strep"-style).
 *
 * Two-step save:
 *   1. `createRecord(MATERIAL_SCHEMA_ID, …)` — registers the mixture as
 *      a local material concept with domain='media' (or 'reagent' if
 *      no media role is detected). Multi-ontology refs go on `class`.
 *   2. `createFormulation(…)` — saves the recipe and the spec, with
 *      `outputSpec.composition` populated from the composition editor.
 *
 * Returns a formulation `materialSpecId` that the configure step uses
 * as the material ref. The picked record carries
 * `compositionSnapshot` + sets `hasCellComposition` when the user
 * marks any row as `role: cells` — so configure shows the cell-count
 * input alongside volume (matches the existing `AddMaterialForm.tsx`
 * auto-detect for cell-containing mixtures).
 */

export interface BuildMixtureFormProps {
  seedOntologyRef?: ResolveRef
  onSaved: (next: PickedMaterial) => void
  onCancel: () => void
  onError: (message: string) => void
}

export function BuildMixtureForm({
  seedOntologyRef,
  onSaved,
  onCancel,
  onError,
}: BuildMixtureFormProps) {
  const [name, setName] = useState(seedOntologyRef?.label ?? '')
  const [classRefs, setClassRefs] = useState<ResolveRef[]>(
    seedOntologyRef ? [seedOntologyRef] : [],
  )
  // Cell-media-shaped default: base medium (solvent) + activity source
  // + supplement. User can prune what they don't need.
  const [rows, setRows] = useState<CompositionDraftEntry[]>([
    makeEmptyRow('solvent'),
    makeEmptyRow('additive'),
    makeEmptyRow('additive'),
  ])
  const [outputName, setOutputName] = useState('')
  const [outputNameDirty, setOutputNameDirty] = useState(false)
  const [submitting, setSubmitting] = useState(false)
  const { ontologies: configuredOntologies } = useOntologyConfig()

  useEffect(() => {
    if (outputNameDirty) return
    setOutputName(name.trim())
  }, [name, outputNameDirty])

  const composition = compositionFromRows(rows)
  const hasCells = composition.some((entry) => entry.role === 'cells')
  const canSubmit = !submitting
    && name.trim().length > 0
    && outputName.trim().length > 0
    && composition.length >= 1

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const trimmedName = name.trim()
      const materialId = generateMaterialId(trimmedName)
      const isMedia = composition.some((e) => e.role === 'cells' || e.role === 'activity_source')

      const domain = isMedia ? 'media' : 'reagent'
      await apiClient.createRecord(
        MATERIAL_SCHEMA_ID,
        materialConceptPayload({
          materialId,
          name: trimmedName,
          domain,
          classRefs,
          tags: hasCells ? ['mixture', 'cell-bearing'] : ['mixture'],
        }),
      )

      const response = await apiClient.createFormulation(
        compositionFormulationPayload({
          materialId,
          conceptName: trimmedName,
          outputName: outputName.trim(),
          domain,
          classRefs,
          composition,
        }),
      )

      onSaved({
        recordId: response.materialSpecId,
        ref: {
          kind: 'record',
          id: response.materialSpecId,
          type: 'material-spec',
          label: outputName.trim(),
        },
        label: outputName.trim(),
        hasCellComposition: hasCells,
        compositionSnapshot: composition,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onError(`Could not save mixture: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }, [canSubmit, classRefs, composition, hasCells, name, onError, onSaved, outputName])

  return (
    <form
      className="add-material-body"
      onSubmit={(e) => {
        e.preventDefault()
        void handleSubmit()
      }}
    >
      <label className="add-material-field">
        <span className="add-material-field-label">Mixture name *</span>
        <input
          type="text"
          className="add-material-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., DMEM growth media"
          autoFocus={!seedOntologyRef}
          required
        />
      </label>

      <MultiOntologyRefList
        refs={classRefs}
        onChange={setClassRefs}
        ontologies={configuredOntologies}
        label="Ontology references (optional)"
      />

      <CompositionEditor rows={rows} onChange={setRows} />

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
          placeholder="What you'll search for next time"
          required
        />
      </label>

      <footer className="add-material-footer">
        <button type="button" className="add-material-btn" onClick={onCancel} disabled={submitting}>
          Back
        </button>
        <button
          type="submit"
          className="add-material-btn add-material-btn--primary"
          disabled={!canSubmit}
        >{submitting ? 'Saving…' : 'Save mixture'}</button>
      </footer>
    </form>
  )
}
