import { useCallback, useEffect, useState } from 'react'
import { apiClient } from '../../../shared/api/client'
import type { OLSResultRef } from '../../../shared/api/olsClient'
import {
  MATERIAL_SCHEMA_ID,
  generateMaterialId,
} from '../../../types/material'
import { OntologyPicker } from '../OntologyPicker'
import { MultiOntologyRefList } from '../MultiOntologyRefList'
import type { PickedMaterial } from '../state'

/**
 * Sample builder ("qPCR cDNA from liver biopsy A4"-style).
 *
 * The schema's `material-derivation` enum was extended in this phase
 * to include `dna_extraction | rna_extraction | cdna_prep | lysate` so
 * the sample-prep workflows have a faithful derivation_type value
 * instead of falling back to 'other'.
 *
 * Two-step save:
 *   1. `createRecord(MATERIAL_SCHEMA_ID, …)` — registers the sample as
 *      a local material concept with domain='sample' and ontology refs
 *      on `class` (typically organism + tissue + optional NCIT
 *      disease/method terms).
 *   2. `createMaterialInstance(…)` — creates the instance with
 *      `derivedState` carrying the derivation type + origin metadata.
 *
 * Samples are quantity-arbitrary: configure step shows the regular
 * volume input, no count.
 */

const DERIVATION_TYPES = [
  { value: 'dna_extraction', label: 'DNA extraction' },
  { value: 'rna_extraction', label: 'RNA extraction' },
  { value: 'cdna_prep', label: 'cDNA prep' },
  { value: 'lysate', label: 'Lysate' },
  { value: 'collection', label: 'Collection' },
  { value: 'harvest', label: 'Harvest' },
  { value: 'other', label: 'Other' },
] as const

type DerivationType = typeof DERIVATION_TYPES[number]['value']

export interface BuildSampleFormProps {
  seedOntologyRef?: OLSResultRef
  onSaved: (next: PickedMaterial) => void
  onCancel: () => void
  onError: (message: string) => void
}

function classifySeed(seed?: OLSResultRef): {
  organism?: OLSResultRef
  tissue?: OLSResultRef
  classRefs: OLSResultRef[]
} {
  if (!seed) return { classRefs: [] }
  const ns = seed.namespace.toUpperCase()
  if (ns === 'NCBITAXON') return { organism: seed, classRefs: [seed] }
  if (ns === 'UBERON') return { tissue: seed, classRefs: [seed] }
  // ChEBI / NCIT / GO / CL all get dropped into the multi-ref slot;
  // the user can decide what they actually denote.
  return { classRefs: [seed] }
}

export function BuildSampleForm({
  seedOntologyRef,
  onSaved,
  onCancel,
  onError,
}: BuildSampleFormProps) {
  const seed = classifySeed(seedOntologyRef)
  const [name, setName] = useState('')
  const [derivationType, setDerivationType] = useState<DerivationType>('cdna_prep')
  const [organism, setOrganism] = useState<OLSResultRef | null>(seed.organism ?? null)
  const [tissue, setTissue] = useState<OLSResultRef | null>(seed.tissue ?? null)
  const [extraRefs, setExtraRefs] = useState<OLSResultRef[]>(
    // Avoid double-listing the organism/tissue in the multi-ref slot.
    seed.classRefs.filter((r) => r !== seed.organism && r !== seed.tissue),
  )
  const [origin, setOrigin] = useState('')
  const [parentRef, setParentRef] = useState('')
  const [collectionDate, setCollectionDate] = useState(() => new Date().toISOString().slice(0, 10))
  const [notes, setNotes] = useState('')
  const [submitting, setSubmitting] = useState(false)

  // Auto-fill name from origin + derivation when blank.
  useEffect(() => {
    if (name.trim().length > 0) return
    if (origin.trim()) {
      const typeLabel = DERIVATION_TYPES.find((t) => t.value === derivationType)?.label ?? derivationType
      setName(`${typeLabel} from ${origin.trim()}`)
    }
  }, [name, origin, derivationType])

  const canSubmit = !submitting
    && name.trim().length > 0
    && origin.trim().length > 0

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return
    setSubmitting(true)
    try {
      const trimmedName = name.trim()
      const materialId = generateMaterialId(trimmedName)
      const classRefs = [
        ...(organism ? [organism] : []),
        ...(tissue ? [tissue] : []),
        ...extraRefs,
      ]

      await apiClient.createRecord(MATERIAL_SCHEMA_ID, {
        kind: 'material',
        id: materialId,
        name: trimmedName,
        domain: 'sample',
        ...(classRefs.length > 0 ? { class: classRefs } : {}),
        tags: ['sample', derivationType],
      })

      const derivedState: Record<string, unknown> = {
        derivation_type: derivationType,
        source_note: origin.trim(),
      }
      if (parentRef.trim()) {
        derivedState.source_material_refs = [{
          kind: 'record',
          id: parentRef.trim(),
          type: 'material-instance',
          label: parentRef.trim(),
        }]
      }
      if (collectionDate) derivedState.collection_date = collectionDate
      if (notes.trim()) derivedState.clarification_note = notes.trim()

      const response = await apiClient.createMaterialInstance({
        name: trimmedName,
        materialRef: {
          kind: 'record',
          id: materialId,
          type: 'material',
          label: trimmedName,
        },
        preparedOn: collectionDate || undefined,
        derivedState,
        status: 'available',
        tags: ['sample', derivationType],
      } as Parameters<typeof apiClient.createMaterialInstance>[0])

      onSaved({
        recordId: response.materialInstanceId,
        label: trimmedName,
        hasCellComposition: false,
      })
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err)
      onError(`Could not save sample: ${message}`)
    } finally {
      setSubmitting(false)
    }
  }, [
    canSubmit,
    collectionDate,
    derivationType,
    extraRefs,
    name,
    notes,
    onError,
    onSaved,
    organism,
    origin,
    parentRef,
    tissue,
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
        <span className="add-material-field-label">Sample name *</span>
        <input
          type="text"
          className="add-material-input"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="e.g., cDNA prep from liver biopsy A4"
          autoFocus={!seedOntologyRef}
          required
        />
        <span className="add-material-field-hint">
          Auto-fills from origin + derivation type if blank.
        </span>
      </label>

      <label className="add-material-field">
        <span className="add-material-field-label">Derivation type</span>
        <select
          className="add-material-input"
          value={derivationType}
          onChange={(e) => setDerivationType(e.target.value as DerivationType)}
        >
          {DERIVATION_TYPES.map((t) => (
            <option key={t.value} value={t.value}>{t.label}</option>
          ))}
        </select>
      </label>

      <label className="add-material-field">
        <span className="add-material-field-label">Origin *</span>
        <input
          type="text"
          className="add-material-input"
          value={origin}
          onChange={(e) => setOrigin(e.target.value)}
          placeholder="e.g., liver biopsy A4, culture well B7, animal #12"
          required
        />
        <span className="add-material-field-hint">
          Free text. Where the source material came from. Use the
          parent-ref slot below to link to a specific record when you have one.
        </span>
      </label>

      <label className="add-material-field">
        <span className="add-material-field-label">Parent material ref (optional)</span>
        <input
          type="text"
          className="add-material-input"
          value={parentRef}
          onChange={(e) => setParentRef(e.target.value)}
          placeholder="MINST-… (material instance) or MAT-… (concept)"
        />
        <span className="add-material-field-hint">
          A record ID if the parent material is already tracked. Establishes
          provenance in the derivation graph.
        </span>
      </label>

      <OntologyPicker
        label="Organism"
        ontologies={['ncbitaxon']}
        placeholder="Search NCBI Taxonomy — optional"
        picked={organism}
        onChange={setOrganism}
      />

      <OntologyPicker
        label="Tissue"
        ontologies={['uberon']}
        placeholder="Search Uberon — optional"
        picked={tissue}
        onChange={setTissue}
      />

      <MultiOntologyRefList
        refs={extraRefs}
        onChange={setExtraRefs}
        ontologies={['ncit', 'go']}
        label="Other refs (NCIT disease / GO process — optional)"
      />

      <label className="add-material-field">
        <span className="add-material-field-label">Collection date</span>
        <input
          type="date"
          className="add-material-input"
          value={collectionDate}
          onChange={(e) => setCollectionDate(e.target.value)}
        />
      </label>

      <label className="add-material-field">
        <span className="add-material-field-label">Notes</span>
        <input
          type="text"
          className="add-material-input"
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Optional clarifications (concentration unknown, etc.)"
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
        >{submitting ? 'Saving…' : 'Save sample'}</button>
      </footer>
    </form>
  )
}
