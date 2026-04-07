import { useEffect, useState } from 'react'
import { apiClient, type QuantityValue } from '../../shared/api/client'

interface Props {
  isOpen: boolean
  materialInstanceId: string | null
  materialName?: string
  onClose: () => void
  onSave?: (aliquotIds: string[]) => void
}

export function AliquotSplitModal({ isOpen, materialInstanceId, materialName, onClose, onSave }: Props) {
  const [count, setCount] = useState('2')
  const [volumeValue, setVolumeValue] = useState('')
  const [volumeUnit, setVolumeUnit] = useState('mL')
  const [error, setError] = useState<string | null>(null)
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    if (!isOpen) return
    setCount('2')
    setVolumeValue('')
    setVolumeUnit('mL')
    setError(null)
  }, [isOpen])

  if (!isOpen || !materialInstanceId) return null

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      <div className="absolute inset-0 bg-black/50" onClick={onClose} />
      <form className="relative bg-white rounded-lg shadow-xl w-full max-w-sm mx-4 p-4 space-y-3 text-sm" onSubmit={async (e) => {
        e.preventDefault()
        if (!count.trim()) return setError('Aliquot count is required')
        setIsSubmitting(true)
        setError(null)
        try {
          const defaultVolume: QuantityValue | undefined = volumeValue.trim() ? { value: Number(volumeValue), unit: volumeUnit } : undefined
          const response = await apiClient.splitMaterialInstance(materialInstanceId, {
            count: Number(count),
            ...(defaultVolume ? { defaultVolume } : {}),
          })
          onSave?.(response.aliquotIds)
          onClose()
        } catch (err) {
          setError(err instanceof Error ? err.message : 'Failed to split aliquots')
        } finally {
          setIsSubmitting(false)
        }
      }}>
        <div className="flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-semibold text-gray-900">Split Into Aliquots</h2>
            <p className="text-xs text-gray-500 mt-1">Create child aliquots from {materialName || materialInstanceId}.</p>
          </div>
          <button type="button" onClick={onClose} className="btn btn-secondary">Close</button>
        </div>
        <label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Aliquot Count</span><input className="w-full border rounded px-2 py-1.5" value={count} onChange={(e) => setCount(e.target.value)} /></label>
        <div className="grid grid-cols-[1fr_100px] gap-2"><label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Default Volume</span><input className="w-full border rounded px-2 py-1.5" value={volumeValue} onChange={(e) => setVolumeValue(e.target.value)} /></label><label className="block"><span className="block text-xs font-medium text-gray-700 mb-1">Unit</span><input className="w-full border rounded px-2 py-1.5" value={volumeUnit} onChange={(e) => setVolumeUnit(e.target.value)} /></label></div>
        {error && <div className="text-xs text-red-700 bg-red-50 border border-red-200 rounded px-2 py-1.5">{error}</div>}
        <div className="flex justify-end gap-2 pt-1"><button type="button" onClick={onClose} className="btn btn-secondary" disabled={isSubmitting}>Cancel</button><button type="submit" className="btn btn-primary" disabled={isSubmitting}>{isSubmitting ? 'Splitting...' : 'Create Aliquots'}</button></div>
      </form>
    </div>
  )
}
