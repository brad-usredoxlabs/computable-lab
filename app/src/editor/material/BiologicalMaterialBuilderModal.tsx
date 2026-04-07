import { useEffect, useState } from 'react'
import type { OntologyRef, RecordRef } from '../../shared/ref'
import { apiClient, type MaterialRefInput } from '../../shared/api/client'

interface Props {
  isOpen: boolean
  onClose: () => void
  primaryRef?: OntologyRef | null
  initialName?: string
  onSave: (ref: RecordRef) => void
}

function refFromOntology(ref?: OntologyRef | null): MaterialRefInput | undefined {
  if (!ref) return undefined
  return { kind: ref.kind, id: ref.id, label: ref.label, namespace: ref.namespace, uri: ref.uri }
}

export function BiologicalMaterialBuilderModal({ isOpen, onClose, primaryRef, initialName, onSave }: Props) {
  const [mode, setMode] = useState<'start-culture' | 'record-existing'>('start-culture')
  const [name, setName] = useState('')
  const [passage, setPassage] = useState('')
  const [vesselType, setVesselType] = useState('')
  const [mediumNote, setMediumNote] = useState('')
  const [parentCultureId, setParentCultureId] = useState('')
  const [seedingDensity, setSeedingDensity] = useState('')
  const [confluence, setConfluence] = useState('')
  const [freezeThawCount, setFreezeThawCount] = useState('')
  const [preparedOn, setPreparedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setMode('start-culture')
    setName(initialName || primaryRef?.label || '')
    setPassage('')
    setVesselType('')
    setMediumNote('')
    setParentCultureId('')
    setSeedingDensity('')
    setConfluence('')
    setFreezeThawCount('')
    setPreparedOn(new Date().toISOString().slice(0, 10))
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
          const response = await apiClient.createMaterialInstance({
            name: name.trim(),
            materialRef: refFromOntology(primaryRef),
            preparedOn,
            biologicalState: {
              ...(passage.trim() ? { passage_number: Number(passage) } : {}),
              ...(parentCultureId.trim() ? { parent_culture_ref: { kind: 'record', id: parentCultureId.trim(), type: 'material-instance', label: parentCultureId.trim() } } : {}),
              ...(vesselType.trim() ? { vessel_type: vesselType.trim() } : {}),
              ...(mediumNote.trim() ? { medium_note: mediumNote.trim() } : {}),
              ...(seedingDensity.trim() ? { seeding_density: seedingDensity.trim() } : {}),
              ...(confluence.trim() ? { confluence: confluence.trim() } : {}),
              ...(freezeThawCount.trim() ? { freeze_thaw_count: Number(freezeThawCount) } : {}),
            },
            status: 'available',
            tags: ['biological'],
          })
          onSave({ kind: 'record', id: response.materialInstanceId, type: 'material-instance', label: name.trim() })
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to create biological material')
        } finally {
          setIsSubmitting(false)
        }
      }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Create Biological Material</h2>
            <p className="text-xs text-gray-500 mt-1">Use this for cells or other biological materials your lab grows or maintains.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Workflow</span><select className="w-full border rounded px-2 py-1.5" value={mode} onChange={(e) => setMode(e.target.value as 'start-culture' | 'record-existing')}><option value="start-culture">Start Cell Culture</option><option value="record-existing">Record Existing Culture</option></select></label>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Name</span><input className="w-full border rounded px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} /></label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Passage Number</span><input className="w-full border rounded px-2 py-1.5" value={passage} onChange={(e) => setPassage(e.target.value)} /></label>
          <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Vessel Type</span><input className="w-full border rounded px-2 py-1.5" value={vesselType} onChange={(e) => setVesselType(e.target.value)} placeholder="T75 flask, 6-well plate" /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Parent Culture ID</span><input className="w-full border rounded px-2 py-1.5" value={parentCultureId} onChange={(e) => setParentCultureId(e.target.value)} placeholder="MINST-..." /></label>
          <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Seeding Density</span><input className="w-full border rounded px-2 py-1.5" value={seedingDensity} onChange={(e) => setSeedingDensity(e.target.value)} placeholder="25k cells/cm2" /></label>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Confluence</span><input className="w-full border rounded px-2 py-1.5" value={confluence} onChange={(e) => setConfluence(e.target.value)} placeholder="80%" /></label>
          <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Freeze/Thaw Count</span><input className="w-full border rounded px-2 py-1.5" value={freezeThawCount} onChange={(e) => setFreezeThawCount(e.target.value)} /></label>
        </div>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">{mode === 'start-culture' ? 'Medium / Seeding Note' : 'Medium / Source Note'}</span><input className="w-full border rounded px-2 py-1.5" value={mediumNote} onChange={(e) => setMediumNote(e.target.value)} /></label>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Prepared Date</span><input className="w-full border rounded px-2 py-1.5" type="date" value={preparedOn} onChange={(e) => setPreparedOn(e.target.value)} /></label>
        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Create Biological Material'}</button></div>
      </form>
    </div>
  )
}
