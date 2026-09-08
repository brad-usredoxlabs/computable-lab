import { useEffect, useMemo, useState } from 'react'
import { createLabware, type Labware } from '../../types/labware'
import {
  INSTRUMENT_KINDS,
  INSTRUMENT_KIND_LABELS,
  inferInstrumentKind,
  type InstrumentKind,
} from '../../types/labware'
import { apiClient, type VendorExaHit } from '../../shared/api/client'
import { useVendorExaSearch } from '../../shared/vendor-exa/useVendorExaSearch'
import { InstrumentGlyph } from './InstrumentGlyphs'

/**
 * AddEquipmentDialog — add a bench INSTRUMENT (shaker, incubator, plate reader,
 * centrifuge, …) to the freeform bench, sourced by **Exa web search**.
 *
 * The bench placement model is labware-typed, so a picked instrument becomes an
 * `instrument`-type lawn-only Labware whose `sourceRecordId` points at the
 * real `EQP-…` equipment record the server mints on `createFromVendorExa`. The
 * EQP- record stays the canonical equipment; the deck tile is the editor's
 * view of it. This keeps the materials/labware/equipment hierarchy intact and
 * is forward-compatible with the future "move the plate onto the instrument"
 * deck flow.
 */

interface AddEquipmentDialogProps {
  open: boolean
  contextLabel: string
  onClose: () => void
  onPick: (labware: Labware) => void
}

export function AddEquipmentDialog({ open, contextLabel, onClose, onPick }: AddEquipmentDialogProps) {
  const [query, setQuery] = useState('')
  const [customName, setCustomName] = useState('')
  const [selectedKind, setSelectedKind] = useState<InstrumentKind>('generic')
  // The Exa hit the user has selected but not yet added to the bench.
  const [selectedHit, setSelectedHit] = useState<VendorExaHit | null>(null)
  const [mintingUrl, setMintingUrl] = useState<string | null>(null)

  // Reset draft state each time the dialog reopens so a prior instrument's
  // selection/name/type don't leak onto the next one.
  useEffect(() => {
    if (!open) {
      setSelectedKind('generic')
      setSelectedHit(null)
      setCustomName('')
      setQuery('')
    }
  }, [open])

  // Exa web vendor-product search for equipment. Declared ABOVE the early
  // `return null` so the hook count is stable whether open or closed
  // (Rules of Hooks — the exact bug that hit AddLabwareDialog).
  const vendorExa = useVendorExaSearch({ category: 'equipment', controlled: { query } })

  // Exa hits matching the query, deduped.
  const hits = useMemo(() => {
    const seen = new Set<string>()
    return vendorExa.exaResults.filter((h) => {
      const key = h.url.toLowerCase()
      if (seen.has(key)) return false
      seen.add(key)
      return true
    })
  }, [vendorExa.exaResults])

  if (!open) return null

  async function handleSubmit() {
    if (!selectedHit || mintingUrl) return
    setMintingUrl(selectedHit.url)
    try {
      const created = await apiClient.createFromVendorExa(selectedHit)
      // Build a lawn-only `instrument` labware tile pointing at the minted
      // EQP- record. The name is what the biologist sees on the bench.
      const instrument = createLabware('instrument', customName.trim() || created.label)
      instrument.sourceRecordId = created.recordId
      instrument.notes = `Imported from Exa equipment search: ${selectedHit.url}`
      // Tag the instrument kind for the silhouette: an explicit pick wins;
      // otherwise best-effort classify the vendor title.
      instrument.instrumentKind =
        selectedKind !== 'generic' ? selectedKind : inferInstrumentKind(selectedHit.title)
      onPick(instrument)
      onClose()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to create instrument from Exa', error)
    } finally {
      setMintingUrl(null)
    }
  }

  return (
    <div className="ee-dialog__scrim" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ee-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="ee-dialog__header">
          <span className="ee-dialog__title">Add instrument</span>
          <span className="ee-dialog__context">→ {contextLabel}</span>
          <button className="ee-dialog__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <input
          autoFocus
          type="text"
          className="ee-dialog__search"
          placeholder="Search instruments… (e.g. shaker, plate reader, centrifuge)"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
        />
        <input
          type="text"
          className="ee-dialog__search"
          placeholder="Name on bench (optional)"
          value={customName}
          onChange={(e) => setCustomName(e.target.value)}
        />
        <div className="ee-dialog__kinds" role="group" aria-label="Instrument type">
          {INSTRUMENT_KINDS.map((kind) => (
            <button
              key={kind}
              type="button"
              className={`ee-dialog__kind${selectedKind === kind ? ' ee-dialog__kind--active' : ''}`}
              onClick={() => setSelectedKind(kind)}
              title={INSTRUMENT_KIND_LABELS[kind]}
              aria-pressed={selectedKind === kind}
            >
              <span className="ee-dialog__kind-glyph">
                <InstrumentGlyph kind={kind} color="#ff922b" />
              </span>
              <span className="ee-dialog__kind-label">{INSTRUMENT_KIND_LABELS[kind]}</span>
            </button>
          ))}
        </div>
        <div className="ee-dialog__body ee-dialog__body--equipment">
          {hits.length > 0 || vendorExa.loading || !query.trim() ? (
            <section className="ee-dialog__vendor">
              <div className="ee-dialog__group-title">
                Vendor / web (Exa)
                {vendorExa.loading ? <span className="ee-dialog__vendor-spinner">…</span> : null}
              </div>
              {vendorExa.exaResults.length === 0 && vendorExa.loading ? (
                <div className="ee-dialog__empty">Searching vendor instruments…</div>
              ) : hits.length === 0 && query.trim() ? (
                <div className="ee-dialog__empty">No instrument matches "{query.trim()}".</div>
              ) : null}
              {hits.map((hit) => {
                const isSelected = selectedHit?.url === hit.url
                return (
                  <button
                    key={hit.url}
                    type="button"
                    className={`ee-dialog__vendor-row${isSelected ? ' ee-dialog__vendor-row--selected' : ''}`}
                    aria-pressed={isSelected}
                    disabled={mintingUrl !== null}
                    onClick={() => setSelectedHit(hit)}
                  >
                    <span className="ee-dialog__vendor-label">
                      {hit.title}
                      <span className="ee-dialog__vendor-badge">WEB</span>
                    </span>
                    <span className="ee-dialog__vendor-sub">
                      {isSelected ? 'Selected — press "Add to bench" below' : `Exa · ${baseUrlOf(hit.url)}`}
                      {hit.snippet ? ` · ${hit.snippet}` : ''}
                    </span>
                  </button>
                )
              })}
            </section>
          ) : null}
        </div>
        <footer className="ee-dialog__footer">
          <button
            type="button"
            className="ee-dialog__btn"
            onClick={onClose}
          >Close</button>
          <button
            type="button"
            className="ee-dialog__btn ee-dialog__btn--primary"
            disabled={!selectedHit || mintingUrl !== null}
            onClick={() => void handleSubmit()}
            title="Mint the selected instrument and place it on the bench"
          >
            {mintingUrl ? 'Adding…' : 'Add to bench'}
          </button>
        </footer>
      </div>
    </div>
  )
}

/** Extract the hostname from a full URL (e.g. "thermofisher.com"). */
function baseUrlOf(url: string): string {
  try {
    const host = new URL(url).hostname
    return host || url
  } catch {
    return url
  }
}