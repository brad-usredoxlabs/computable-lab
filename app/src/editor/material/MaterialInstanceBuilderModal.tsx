import { useEffect, useState } from 'react'
import type { RecordRef, Ref } from '../../shared/ref'
import { apiClient, type MaterialRefInput } from '../../shared/api/client'
import { MaterialDuplicateWarning } from './MaterialDuplicateWarning'

interface Props {
  isOpen: boolean
  onClose: () => void
  sourceRef?: Ref | null
  initialName?: string
  onSave: (ref: RecordRef) => void
}

function refFromAny(ref?: Ref | null): MaterialRefInput | undefined {
  if (!ref) return undefined
  return ref.kind === 'record'
    ? {
        kind: 'record',
        id: ref.id,
        type: ref.type,
        label: ref.label,
      }
    : {
        kind: 'ontology',
        id: ref.id,
        label: ref.label,
        namespace: ref.namespace,
        uri: ref.uri,
      }
}

export function MaterialInstanceBuilderModal({ isOpen, onClose, sourceRef, initialName, onSave }: Props) {
  const [name, setName] = useState('')
  const [preparedOn, setPreparedOn] = useState(() => new Date().toISOString().slice(0, 10))
  const [volumeValue, setVolumeValue] = useState('')
  const [volumeUnit, setVolumeUnit] = useState('mL')
  const [lotNumber, setLotNumber] = useState('')
  const [storageLocation, setStorageLocation] = useState('')
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isOpen) return
    setName(initialName || sourceRef?.label || '')
    setPreparedOn(new Date().toISOString().slice(0, 10))
    setVolumeValue('')
    setVolumeUnit('mL')
    setLotNumber('')
    setStorageLocation('')
    setError(null)
  }, [initialName, isOpen, sourceRef])

  if (!isOpen) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form
        className="relative bg-white rounded-lg shadow-xl w-full max-w-md mx-4 p-4 space-y-3 text-sm"
        onSubmit={async (e) => {
          e.preventDefault()
          if (!name.trim()) {
            setError('Name is required')
            return
          }
          setIsSubmitting(true)
          setError(null)
          try {
            const response = await apiClient.createMaterialInstance({
              name: name.trim(),
              ...(sourceRef?.kind === 'record' && sourceRef.type === 'material-spec'
                ? { materialSpecRef: refFromAny(sourceRef) }
                : sourceRef?.kind === 'record' && sourceRef.type === 'vendor-product'
                  ? { vendorProductRef: refFromAny(sourceRef) }
                  : { materialRef: refFromAny(sourceRef) }),
              preparedOn,
              ...(volumeValue.trim() ? { volume: { value: Number(volumeValue), unit: volumeUnit } } : {}),
              ...(lotNumber.trim() ? { lot: { lot_number: lotNumber.trim() } } : {}),
              ...(storageLocation.trim() ? { storage: { location: storageLocation.trim() } } : {}),
              status: 'available',
            })
            onSave({ kind: 'record', id: response.materialInstanceId, type: 'material-instance', label: name.trim() })
          } catch (err) {
            setError(err instanceof Error ? err.message : 'Failed to create prepared material')
          } finally {
            setIsSubmitting(false)
          }
        }}
      >
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Create Prepared Material</h2>
            <p className="text-xs text-gray-500 mt-1">Use this for a concrete stock, bottle, tube, or prepared source in the lab.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
        <div>
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">Name</span>
            <input className="w-full border rounded px-2 py-1.5" value={name} onChange={(e) => setName(e.target.value)} />
          </label>
          <MaterialDuplicateWarning name={name} />
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">Prepared Date</span>
          <input className="w-full border rounded px-2 py-1.5" type="date" value={preparedOn} onChange={(e) => setPreparedOn(e.target.value)} />
        </label>
        <div className="grid grid-cols-[1fr_100px] gap-2">
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">Volume</span>
            <input className="w-full border rounded px-2 py-1.5" value={volumeValue} onChange={(e) => setVolumeValue(e.target.value)} />
          </label>
          <label className="block">
            <span className="block text-xs font-medium text-gray-700 mb-1">Unit</span>
            <input className="w-full border rounded px-2 py-1.5" value={volumeUnit} onChange={(e) => setVolumeUnit(e.target.value)} />
          </label>
        </div>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">Lot / Date Marking</span>
          <input className="w-full border rounded px-2 py-1.5" value={lotNumber} onChange={(e) => setLotNumber(e.target.value)} placeholder="Lot number or handwritten date" />
        </label>
        <label className="block">
          <span className="block text-xs font-medium text-gray-700 mb-1">Storage Note</span>
          <input className="w-full border rounded px-2 py-1.5" value={storageLocation} onChange={(e) => setStorageLocation(e.target.value)} placeholder="Random buffers rack, 4C fridge, etc." />
        </label>
        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>Cancel</button>
          <button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Saving...' : 'Create Prepared Material'}</button>
        </div>
      </form>
    </div>
  )
}
