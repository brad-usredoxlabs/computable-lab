import { useEffect, useMemo, useState } from 'react'
import {
  LABWARE_TYPE_LABELS,
  LABWARE_TYPE_ICONS,
  LABWARE_CATEGORIES,
  createLabware,
  type LabwareCategory,
  type LabwareType,
} from '../../types/labware'
import type { Labware } from '../../types/labware'

interface AddLabwareDialogProps {
  open: boolean
  contextLabel: string
  onClose: () => void
  onPick: (labware: Labware) => void
}

const CATEGORY_ORDER: LabwareCategory[] = ['plate', 'reservoir', 'tube', 'tiprack']
const CATEGORY_LABELS: Record<LabwareCategory, string> = {
  plate: 'Plates',
  reservoir: 'Reservoirs',
  tube: 'Tubes',
  tiprack: 'Tip Racks',
}

export function AddLabwareDialog({ open, contextLabel, onClose, onPick }: AddLabwareDialogProps) {
  const [query, setQuery] = useState('')

  useEffect(() => {
    if (!open) setQuery('')
  }, [open])

  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase()
    const all = Object.entries(LABWARE_TYPE_LABELS) as Array<[LabwareType, string]>
    return all.filter(([, label]) => !q || label.toLowerCase().includes(q))
  }, [query])

  const grouped = useMemo(() => {
    const map = new Map<LabwareCategory, Array<[LabwareType, string]>>()
    for (const cat of CATEGORY_ORDER) map.set(cat, [])
    for (const entry of filtered) {
      const [type] = entry
      const category = LABWARE_CATEGORIES[type]
      map.get(category)?.push(entry)
    }
    return map
  }, [filtered])

  if (!open) return null

  function handlePick(type: LabwareType) {
    try {
      const labware = createLabware(type)
      onPick(labware)
      onClose()
    } catch (error) {
      // createLabware can throw for unknown types — surface in console, leave dialog open.
      // eslint-disable-next-line no-console
      console.error('Failed to create labware', error)
    }
  }

  return (
    <div className="ee-dialog__scrim" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ee-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="ee-dialog__header">
          <span className="ee-dialog__title">Add labware</span>
          <span className="ee-dialog__context">→ {contextLabel}</span>
          <button className="ee-dialog__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <input
          autoFocus
          type="text"
          className="ee-dialog__search"
          placeholder="Search labware…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <div className="ee-dialog__body">
          {CATEGORY_ORDER.map((category) => {
            const entries = grouped.get(category) ?? []
            if (entries.length === 0) return null
            return (
              <section key={category} className="ee-dialog__group">
                <div className="ee-dialog__group-title">{CATEGORY_LABELS[category]}</div>
                <div className="ee-dialog__grid">
                  {entries.map(([type, label]) => (
                    <button
                      key={type}
                      className="ee-dialog__option"
                      onClick={() => handlePick(type)}
                      title={label}
                    >
                      <span className="ee-dialog__option-icon">{LABWARE_TYPE_ICONS[type]}</span>
                      <span className="ee-dialog__option-label">{label}</span>
                    </button>
                  ))}
                </div>
              </section>
            )
          })}
          {filtered.length === 0 ? (
            <div className="ee-dialog__empty">No labware matches "{query}".</div>
          ) : null}
        </div>
      </div>
    </div>
  )
}
