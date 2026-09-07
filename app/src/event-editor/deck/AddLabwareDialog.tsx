import { useEffect, useMemo, useState } from 'react'
import {
  LABWARE_TYPE_LABELS,
  LABWARE_TYPE_ICONS,
  LABWARE_CATEGORIES,
  createLabware,
  isLawnOnlyLabwareType,
  labwareRecordToEditorLabware,
  type LabwareCategory,
  type LabwareType,
} from '../../types/labware'
import type { Labware } from '../../types/labware'
import { apiClient, type VendorExaHit } from '../../shared/api/client'
import { useVendorExaSearch } from '../../shared/vendor-exa/useVendorExaSearch'

interface AddLabwareDialogProps {
  open: boolean
  contextLabel: string
  /**
   * Which surface this dialog is adding labware to. Slot dialogs hide lawn-only
   * bench equipment that can't be placed on an automation deck; lawn dialogs
   * offer everything.
   */
  surfaceKind: 'slot' | 'lawn'
  onClose: () => void
  onPick: (labware: Labware) => void
}

const CATEGORY_ORDER: LabwareCategory[] = ['plate', 'reservoir', 'tube', 'tiprack', 'glassware']
const CATEGORY_LABELS: Record<LabwareCategory, string> = {
  plate: 'Plates',
  reservoir: 'Reservoirs',
  tube: 'Tubes',
  tiprack: 'Tip Racks',
  glassware: 'Glassware',
  instrument: 'Instruments',
}

export function AddLabwareDialog({ open, contextLabel, surfaceKind, onClose, onPick }: AddLabwareDialogProps) {
  const [query, setQuery] = useState('')
  const [customName, setCustomName] = useState('')

  useEffect(() => {
    if (!open) {
      setQuery('')
      setCustomName('')
    }
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
    return all.filter(([type, label]) => {
      // `instrument` has no liquid geometry — it is added only through the
      // Exa equipment flow (AddEquipmentDialog), never from this bare palette.
      if (type === 'instrument') return false
      if (surfaceKind === 'slot' && isLawnOnlyLabwareType(type)) return false
      return !q || label.toLowerCase().includes(q)
    })
  }, [query, surfaceKind])

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

  // Exa web vendor-product search for labware, driven by the same query input.
  // Declared ABOVE the early `return null` so the hook order is stable whether
  // the dialog is open or closed (Rules of Hooks).
  const vendorExa = useVendorExaSearch({ category: 'labware', controlled: { query } })
  const [mintingUrl, setMintingUrl] = useState<string | null>(null)

  if (!open) return null

  function handlePick(type: LabwareType) {
    try {
      const labware = createLabware(type, customName.trim() || undefined)
      onPick(labware)
      onClose()
    } catch (error) {
      // createLabware can throw for unknown types — surface in console, leave dialog open.
      // eslint-disable-next-line no-console
      console.error('Failed to create labware', error)
    }
  }

  async function handlePickVendorExa(hit: VendorExaHit) {
    if (mintingUrl) return
    setMintingUrl(hit.url)
    try {
      const created = await apiClient.createFromVendorExa(hit)
      // A vendor labware record has no grid geometry the editor can render
      // authoritatively — the sanctioned mapper keeps the recordId provenance
      // and falls back to a sensible editor type for unknown containers.
      const labware = labwareRecordToEditorLabware({
        kind: 'labware',
        recordId: created.recordId,
        name: customName.trim() || created.label,
        labwareType: 'other',
      })
      onPick(labware)
      onClose()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create labware from Exa', error)
    } finally {
      setMintingUrl(null)
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
        <input
          type="text"
          className="ee-dialog__search"
          placeholder="Name on deck (optional)"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
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
        {vendorExa.exaResults.length > 0 || vendorExa.loading ? (
          <section className="ee-dialog__vendor">
            <div className="ee-dialog__group-title">
              Vendor / web (Exa)
              {vendorExa.loading ? <span className="ee-dialog__vendor-spinner">…</span> : null}
            </div>
            {vendorExa.exaResults.map((hit) => (
              <button
                key={hit.url}
                type="button"
                className="ee-dialog__vendor-row"
                disabled={mintingUrl !== null}
                onClick={() => void handlePickVendorExa(hit)}
              >
                <span className="ee-dialog__vendor-label">
                  {hit.title}
                  <span className="ee-dialog__vendor-badge">WEB</span>
                </span>
                <span className="ee-dialog__vendor-sub">
                  {mintingUrl === hit.url ? 'Creating labware record…' : `Exa · ${baseUrlOf(hit.url)}`}
                </span>
              </button>
            ))}
          </section>
        ) : null}
      </div>
    </div>
  )
}

/** Extract the hostname from a full URL (e.g. "caymanchem.com"). */
function baseUrlOf(url: string): string {
  try {
    const host = new URL(url).hostname
    return host || url
  } catch {
    return url
  }
}
