import { useEffect, useState } from 'react'
import type { OntologyRef, RecordRef } from '../../shared/ref'
import { apiClient, type MaterialRefInput } from '../../shared/api/client'

interface Props {
  isOpen: boolean
  onClose: () => void
  primaryRef?: OntologyRef | null
  initialName?: string
  inputRefs?: MaterialRefInput[]
  onSave: (ref: RecordRef) => void
}

function refFromOntology(ref?: OntologyRef | null): MaterialRefInput | undefined {
  if (!ref) return undefined
  return { kind: ref.kind, id: ref.id, label: ref.label, namespace: ref.namespace, uri: ref.uri }
}

export function DerivedMaterialBuilderModal({ isOpen, onClose, primaryRef, initialName, inputRefs = [], onSave }: Props) {
  const [workflow, setWorkflow] = useState<'conditioning' | 'collection' | 'harvest' | 'lysate' | 'other'>('conditioning')
  const [name, setName] = useState('')
  const [derivationType, setDerivationType] = useState('conditioning')
  const [collectionDuration, setCollectionDuration] = useState('')
  const [collectionDate, setCollectionDate] = useState(() => new Date().toISOString().slice(0, 16))
  const [sourceNote, setSourceNote] = useState('')
  const [clarificationNote, setClarificationNote] = useState('')
  const [filtrationNote, setFiltrationNote] = useState('')
  const [volumeValue, setVolumeValue] = useState('')
  const [volumeUnit, setVolumeUnit] = useState('mL')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setWorkflow('conditioning')
    setName(initialName || primaryRef?.label || '')
        setDerivationType('conditioning')
    setCollectionDuration('')
    setCollectionDate(new Date().toISOString().slice(0, 16))
    setSourceNote('')
    setClarificationNote('')
    setFiltrationNote('')
    setVolumeValue('')
    setVolumeUnit('mL')
    setError(null)
  }, [initialName, isOpen, primaryRef])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-4 space-y-3 text-sm" onSubmit={async (e) => {
        e.preventDefault()
        if (!name.trim()) return setError('Name is required')
        setIsSubmitting(true)
        setError(null)
        try {
          const response = await apiClient.createMaterialDerivation({
            name: `${name.trim()} derivation`,
            derivationType,
            inputs: inputRefs,
            output: {
              name: name.trim(),
              materialRef: refFromOntology(primaryRef),
              ...(volumeValue.trim() ? { volume: { value: Number(volumeValue), unit: volumeUnit } } : {}),
              derivedState: {
                derivation_type: derivationType,
                ...(collectionDuration.trim() ? { collection_duration: collectionDuration.trim() } : {}),
                ...(collectionDate.trim() ? { collection_date: new Date(collectionDate).toISOString() } : {}),
                ...(inputRefs.length > 0 ? { source_material_refs: inputRefs } : {}),
                ...(sourceNote.trim() ? { source_note: sourceNote.trim() } : {}),
                ...(clarificationNote.trim() ? { clarification_note: clarificationNote.trim() } : {}),
                ...(filtrationNote.trim() ? { filtration_note: filtrationNote.trim() } : {}),
              },
              tags: ['derived'],
              status: 'available',
            },
          })
          onSave({ kind: 'record', id: response.materialInstanceId, type: 'material-instance', label: name.trim() })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to create derived material')
        } finally {
          setIsSubmitting(false)
        }
      }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Create Derived Material</h2>
            <p className="text-xs text-gray-500 mt-1">Use this for conditioned media, collected supernatant, lysate, or similar outputs.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Workflow</span><select className="w-full border rounded px-2 py-1.5" value={workflow} onChange={(e) => { const next = e.target.value as 'conditioning' | 'collection' | 'harvest' | 'lysate' | 'other'; setWorkflow(next); setDerivationType(next) }}><option value="conditioning">Conditioned Media</option><option value="collection">Collected Supernatant</option><option value="harvest">Harvested Cells</option><option value="lysate">Lysate</option><option value="other">Other</option></select></label>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Name</span><input className="w-full border rounded px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Derivation Type</span><select className="w-full border rounded px-2 py-1.5" value={derivationType} onChange={(e) => setDerivationType(e.target.value)}><option value="conditioning">Conditioned Media</option><option value="collection">Collected Output</option><option value="harvest">Harvest</option><option value="lysate">Lysate</option><option value="other">Other</option></select></label>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">{workflow === 'conditioning' ? 'Conditioning Duration' : workflow === 'harvest' ? 'Harvest Timing' : 'Collection Duration'}</span><input className="w-full border rounded px-2 py-1.5" value={collectionDuration} onChange={(e) => setCollectionDuration(e.target.value)} placeholder="24 h, overnight, 3 days" /></label>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Collection Date</span><input className="w-full border rounded px-2 py-1.5" type="datetime-local" value={collectionDate} onChange={(e) => setCollectionDate(e.target.value)} /></label>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Source Note</span><input className="w-full border rounded px-2 py-1.5" value={sourceNote} onChange={(e) => setSourceNote(e.target.value)} placeholder="HepG2 after 48 h treatment" /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Clarification Note</span><input className="w-full border rounded px-2 py-1.5" value={clarificationNote} onChange={(e) => setClarificationNote(e.target.value)} placeholder="spun at 300g" /></label>
          <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Filtration Note</span><input className="w-full border rounded px-2 py-1.5" value={filtrationNote} onChange={(e) => setFiltrationNote(e.target.value)} placeholder="0.22 um filter" /></label>
        </div>
        <div className="grid grid-cols-[1fr_100px] gap-2"><label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Volume</span><input className="w-full border rounded px-2 py-1.5" value={volumeValue} onChange={(e) => setVolumeValue(e.target.value)} /></label><label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Unit</span><input className="w-full border rounded px-2 py-1.5" value={volumeUnit} onChange={(e) => setVolumeUnit(e.target.value)} /></label></div>
        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Create Derived Material'}</button></div>
      </form>
    </div>
  )
}
