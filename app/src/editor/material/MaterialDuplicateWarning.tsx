/**
 * MaterialDuplicateWarning — duplicate/synonym detection alert.
 *
 * Shown after the user enters a material name in any builder modal.
 * Checks for existing materials that may be duplicates or synonyms.
 */

import { useEffect, useState, useRef } from 'react'
import { apiClient, type MaterialDuplicateMatch } from '../../shared/api/client'

interface MaterialDuplicateWarningProps {
  name: string
  debounceMs?: number
  onUseExisting?: (recordId: string) => void
}

export function MaterialDuplicateWarning({ name, debounceMs = 600, onUseExisting }: MaterialDuplicateWarningProps) {
  const [duplicates, setDuplicates] = useState<MaterialDuplicateMatch[]>([])
  const [loading, setLoading] = useState(false)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  const lastCheckedRef = useRef('')

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current)

    const trimmed = name.trim()
    if (trimmed.length < 3 || trimmed === lastCheckedRef.current) {
      if (trimmed.length < 3) setDuplicates([])
      return
    }

    timerRef.current = setTimeout(async () => {
      lastCheckedRef.current = trimmed
      setLoading(true)
      try {
        const response = await apiClient.checkMaterialDuplicate({ name: trimmed })
        setDuplicates(response.potentialDuplicates)
      } catch {
        setDuplicates([])
      } finally {
        setLoading(false)
      }
    }, debounceMs)

    return () => {
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [name, debounceMs])

  if (loading) {
    return <div className="text-[10px] text-gray-400 mt-0.5">Checking for duplicates...</div>
  }

  if (duplicates.length === 0) return null

  return (
    <div className="mt-1 rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
      <div className="font-medium mb-1">Possible duplicates found</div>
      {duplicates.map((dup) => (
        <div key={dup.recordId} className="flex items-center justify-between gap-2 py-0.5">
          <div>
            <span className="font-medium">{dup.name}</span>
            <span className="text-[10px] opacity-70 ml-1">
              ({Math.round(dup.similarity * 100)}% match — {dup.reason})
            </span>
          </div>
          {onUseExisting && (
            <button
              type="button"
              onClick={() => onUseExisting(dup.recordId)}
              className="px-1.5 py-px text-[10px] font-medium rounded bg-amber-200 text-amber-900 hover:bg-amber-300 whitespace-nowrap"
            >
              Use existing
            </button>
          )}
        </div>
      ))}
    </div>
  )
}
