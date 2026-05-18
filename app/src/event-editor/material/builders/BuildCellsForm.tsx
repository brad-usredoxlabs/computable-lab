import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import type { OLSResultRef } from '../../../shared/api/olsClient'
import {
  MATERIAL_SCHEMA_ID,
  generateMaterialId,
} from '../../../types/material'
import { OntologyPicker } from '../OntologyPicker'
import type { PickedMaterial } from '../state'

/**
 * Cells builder ("HepG2 in growth phase"-style).
 *
 * Two-step save:
 *   1. `createRecord(MATERIAL_SCHEMA_ID, …)` — registers the cell line
 *      / culture as a local material concept with domain='cell_line'
 *      and `class` populated with whichever of {organism, cell-type,
 *      tissue} ontology refs the user provided.
 *   2. `createMaterialInstance(…)` — creates the per-culture instance
 *      with `biologicalState` (passage, vessel, seeding density). The
 *      instance is the placeable record — it ships in the event graph
 *      as `material_ref`.
 *
 * The picked record carries `hasCellComposition: true` so the
 * configure step shows "Cell count" alongside "Volume" — matching the
 * existing `AddMaterialForm.tsx` semantics for cells in the graph.
 *
 * Seed comes from the search-step ontology-hit path: clicking a CL or
 * NCBITaxon term in search routes here pre-filled.
 */

export interface BuildCellsFormProps {
  seedOntologyRef?: OLSResultRef
  onSaved: (next: PickedMaterial) => void
  onCancel: () => void
  onError: (message: string) => void
}

function classifySeed(seed?: OLSResultRef): {
  organism?: OLSResultRef
  cellType?: OLSResultRef
  tissue?: OLSResultRef
  name?: string
} {
  if (!seed) return {}
  const ns = seed.namespace.toUpperCase()
  if (ns === 'NCBITAXON') return { organism: seed, name: seed.label }
  if (ns === 'CL') return { cellType: seed, name: seed.label }
  if (ns === 'UBERON') return { tissue: seed }
  // Unknown namespace — drop into cellType slot as a best guess so the
  // user can correct it.
  return { cellType: seed, name: seed.label }
}

export function BuildCellsForm({
  seedOntologyRef,
  onSaved,
  onCancel,
  onError,
}: BuildCellsFormProps) {
  const seed = classifySeed(seedOntologyRef)
  const [name, setName] = useState(seed.name ?? '')
  const [organism, setOrganism] = useState<OLSResultRef | null>(seed.organism ?? null)
  const [cellType, setCellType] = useState<OLSResultRef | null>(seed.cellType ?? null)
  const [tissue, setTissue] = useState<OLSResultRef | null>(seed.tissue ?? null)
  const [passage, setPassage] = useState('')
  const [vesselType, setVesselType] = useState('')
  const [seedingDensity, setSeedingDensity] = useState('')
  const [preparedOn, setPreparedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [submitting, setSubmitting] = useState(false)

  // Auto-fill name from cell type then organism if the user hasn't
  // typed anything yet.
  useEffect(() => {
    if (name.trim().length > 0) return
    if (cellType) setName(cellType.label)
    else if (organism) setName(organism.label)
  }, [cellType, organism, name])

  const canSubmit = !submitting
    && name.trim().length > 0
    && (organism !== null || cellType !== null)

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const trimmedName = name.trim()
      const materialId = generateMaterialId(trimmedName)
      const classRefs: OLSResultRef[] = []
      if (organism) classRefs.push(organism)
      if (cellType) classRefs.push(cellType)
      if (tissue) classRefs.push(tissue)

      await apiClient.createRecord(MATERIAL_SCHEMA_ID, {
        kind: 'material',
        id: materialId,
        name: trimmedName,
        domain: 'cell_line',
        ...(classRefs.length > 0 ? { class: classRefs } : {}),
        tags: ['cells'],
      })

      const biologicalState: Record<string, unknown> = {}
      if (passage.trim()) {
        const n = Number(passage)
        if (Number.isFinite(n)) biologicalState.passage_number = n
      }
      if (vesselType.trim()) biologicalState.vessel_type = vesselType.trim()
      if (seedingDensity.trim()) biologicalState.seeding_density = seedingDensity.trim()

      const response = await apiClient.createMaterialInstance({
        name: trimmedName,
        materialRef: {
          kind: 'record',
          id: materialId,
          type: 'material',
          label: trimmedName,
        },
        preparedOn,
        ...(Object.keys(biologicalState).length > 0 ? { biologicalState } : {}),
        status: 'available',
        tags: ['cells'],
      } as Parameters<typeof apiClient.createMaterialInstance>[0])

      onSaved({
        recordId: response.materialInstanceId,
        label: trimmedName,
        // Mark `hasCellComposition` so the configure step shows the
        // cell-count field. The material itself doesn't have an actual
        // composition entry, but for UX purposes this drives the same
        // count/volume duality.
        hasCellComposition: true,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onError(`Could not save cells: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }, [
    canSubmit,
    cellType,
    name,
    onError,
    onSaved,
    organism,
    passage,
    preparedOn,
    seedingDensity,
    tissue,
    vesselType,
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
        <span className="add-material-field-label">Name *</span>
        <input
          type="text"
          className="add-material-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., HepG2 P12"
          autoFocus={!seedOntologyRef}
          required
        />
        <span className="add-material-field-hint">
          Friendly label for this culture / cell line. Defaults to the
          cell type or organism name; edit freely.
        </span>
      </label>

      <OntologyPicker
        label="Cell type"
        ontologies={['cl']}
        placeholder="Search Cell Ontology (e.g., hepatocyte, HepG2 cell)"
        hint="From the Cell Ontology (CL). Either this OR organism is required."
        picked={cellType}
        onChange={setCellType}
      />

      <OntologyPicker
        label="Organism"
        ontologies={['ncbitaxon']}
        placeholder="Search NCBI Taxonomy (e.g., Homo sapiens, mouse)"
        hint="From NCBI Taxonomy."
        picked={organism}
        onChange={setOrganism}
      />

      <OntologyPicker
        label="Tissue origin"
        ontologies={['uberon']}
        placeholder="Search Uberon (e.g., liver, kidney) — optional"
        hint="Optional. Where the cells came from anatomically."
        picked={tissue}
        onChange={setTissue}
      />

      <div className="add-material-field add-material-field--row">
        <label className="add-material-field" style={{ flex: 1 }}>
          <span className="add-material-field-label">Passage #</span>
          <input
            type="number"
            className="add-material-input"
            value={passage}
            min="0"
            step="1"
            onChange={(e) => setPassage(e.target.value)}
            placeholder="optional"
          />
        </label>
        <label className="add-material-field" style={{ flex: 1 }}>
          <span className="add-material-field-label">Vessel</span>
          <input
            type="text"
            className="add-material-input"
            value={vesselType}
            onChange={(e) => setVesselType(e.target.value)}
            placeholder="T75 flask, 6-well plate"
          />
        </label>
        <label className="add-material-field" style={{ flex: 1 }}>
          <span className="add-material-field-label">Prepared</span>
          <input
            type="date"
            className="add-material-input"
            value={preparedOn}
            onChange={(e) => setPreparedOn(e.target.value)}
          />
        </label>
      </div>

      <label className="add-material-field">
        <span className="add-material-field-label">Seeding density</span>
        <input
          type="text"
          className="add-material-input"
          value={seedingDensity}
          onChange={(e) => setSeedingDensity(e.target.value)}
          placeholder="e.g., 25k cells/cm² (optional)"
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
        >{submitting ? 'Saving…' : 'Save cells'}</button>
      </footer>
    </form>
  )
}
