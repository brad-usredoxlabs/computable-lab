import { useEffect, useMemo, useState } from 'react'
import {
  LABWARE_CATEGORIES,
  LABWARE_TYPE_LABELS,
  createLabware,
  isLawnOnlyLabwareType,
  labwareRecordToEditorLabware,
  type Labware,
  type LabwareRecordPayload,
  type LabwareType,
} from '../../types/labware'
import {
  INSTRUMENT_KINDS,
  INSTRUMENT_KIND_LABELS,
  inferInstrumentKind,
  type InstrumentKind,
} from '../../types/labware'
import type { ResolveCandidate, VendorExaHit } from '../../shared/api/client'
import { apiClient } from '../../shared/api/client'
import { useVendorExaSearch } from '../../shared/vendor-exa/useVendorExaSearch'
import { InstrumentGlyph } from './InstrumentGlyphs'
import {
  isPlateCategory,
  mergeAndRankDeckSources,
  TAB_KINDS,
  type AddDeckSourceItem,
  type AddDeckTab,
} from './addDeckDialogModel'

/**
 * AddToDeckDialog — the single "click a deck/bench point → place something
 * there" surface. Unifies the old `AddLabwareDialog` (catalog + Exa) and
 * `AddEquipmentDialog` (Exa instruments) behind a type-tab selector:
 *
 *   Plates | Labware | Equipment
 *
 * The caller captures the CLICK TARGET (a lawn point, or a deck slot) and passes
 * `onPick(labware)`; this dialog always means "place at the target you clicked."
 * Instruments are minted from an Exa equipment record into an `instrument`
 * lawn-only tile whose `sourceRecordId` is the canonical `EQP-…` record.
 *
 * Search is cross-source and merged (catalog + lab-definitions first, then Exa,
 * then ontology/resolve) by `mergeAndRankDeckSources`. Every tab shares one
 * query input and a name field, and addition is an explicit "Add to deck"
 * submit (not place-on-click) — so the user can name whatever they picked.
 */

interface AddToDeckDialogProps {
  open: boolean
  contextLabel: string
  surfaceKind: 'slot' | 'lawn'
  onClose: () => void
  /** Always "place at the target that was clicked". Target captured by caller. */
  onPick: (labware: Labware) => void
}

/** A lab-definition search hit, as returned by `searchLabwareDefinitions`. */
interface LabDefinitionHit {
  recordId: string
  label: string
  kind: 'labware-definition'
}

/** One rendered, selectable row, carrying the payload needed to build on submit. */
type DeckRow =
  | { source: 'catalog'; key: string; label: string; labwareType: LabwareType }
  | { source: 'lab-db'; key: string; label: string; record: LabwareRecordPayload }
  | { source: 'exa'; key: string; label: string; hit: VendorExaHit; isInstrument: boolean }
  | { source: 'ontology'; key: string; label: string; isInstrument: boolean }

const BADGE: Record<AddDeckSourceItem['source'], string> = {
  catalog: '',
  'lab-db': 'LAB',
  exa: 'WEB',
  ontology: '◇',
}

export function AddToDeckDialog({ open, contextLabel, surfaceKind, onClose, onPick }: AddToDeckDialogProps) {
  const [activeTab, setActiveTabState] = useState<AddDeckTab>('plates')
  const [query, setQuery] = useState('')
  const [customName, setCustomName] = useState('')
  const [selectedKey, setSelectedKey] = useState<string | null>(null)
  const [selectedKind, setSelectedKind] = useState<InstrumentKind>('generic')
  const [mintingKey, setMintingKey] = useState<string | null>(null)
  const [labDbHits, setLabDbHits] = useState<LabDefinitionHit[]>([])
  const [loadingLabDb, setLoadingLabDb] = useState(false)
  const [ontologyCandidates, setOntologyCandidates] = useState<ResolveCandidate[]>([])
  const [loadingOntology, setLoadingOntology] = useState(false)

  // The two Exa categories reduce to: equipment tab → 'equipment', else 'labware'.
  // One hook (stable count above the early return); cleared query on tab switch
  // guarantees the next search uses the new tab's category.
  const exaCategory = activeTab === 'equipment' ? 'equipment' : 'labware'
  const vendorExa = useVendorExaSearch({ category: exaCategory, controlled: { query } })

  // Hide the Equipment tab on a deck slot (instruments are lawn-only — not
  // validatable/renderable on an automation deck).
  const tabs: AddDeckTab[] = surfaceKind === 'slot'
    ? ['plates', 'labware']
    : ['plates', 'labware', 'equipment']

  // Reset all draft state when the dialog (re)opens.
  useEffect(() => {
    if (!open) {
      setActiveTabState('plates')
      setQuery('')
      setCustomName('')
      setSelectedKey(null)
      setSelectedKind('generic')
      setMintingKey(null)
      setLabDbHits([])
      setOntologyCandidates([])
    }
  }, [open])

  // Escape closes.
  useEffect(() => {
    if (!open) return
    function onKey(event: KeyboardEvent) {
      if (event.key === 'Escape') onClose()
    }
    document.addEventListener('keydown', onKey)
    return () => document.removeEventListener('keydown', onKey)
  }, [open, onClose])

  // Lab-definition search — the "defaults and what the lab has" tier for
  // plates + labware tabs. Fires even on an empty query so the lab catalog
  // shows at rest; never on the equipment tab.
  useEffect(() => {
    const trimmed = query.trim()
    setLoadingLabDb(true)
    const handle = window.setTimeout(async () => {
      try {
        if (activeTab === 'equipment') {
          setLabDbHits([])
          return
        }
        const res = await apiClient.searchLabwareDefinitions({ q: trimmed, limit: 12 })
        setLabDbHits(res.hits)
      } catch {
        setLabDbHits([])
      } finally {
        setLoadingLabDb(false)
      }
    }, 200)
    return () => {
      window.clearTimeout(handle)
      // eslint-disable-next-line react-hooks/exhaustive-deps
    }
  }, [query, activeTab])

  // Ontology / resolve tier — only meaningful with a non-empty query, and only
  // for plates + labware (equipment ontology terms are absent by design).
  useEffect(() => {
    const trimmed = query.trim()
    if (trimmed.length < 1 || activeTab === 'equipment') {
      setOntologyCandidates([])
      setLoadingOntology(false)
      return
    }
    setLoadingOntology(true)
    const handle = window.setTimeout(async () => {
      try {
        const res = await apiClient.resolve({
          term: trimmed,
          kinds: [TAB_KINDS[activeTab] === 'instrument' ? 'equipment' : 'labware'],
          localOnly: true,
        })
        setOntologyCandidates(res.candidates.filter((c) => c.source !== 'mint'))
      } catch {
        setOntologyCandidates([])
      } finally {
        setLoadingOntology(false)
      }
    }, 200)
    return () => window.clearTimeout(handle)
  }, [query, activeTab])

  // Build the per-tab cross-source row set in the ranked order for rendering.
  const { rows, byKey } = useMemo(() => {
    const by: Record<string, DeckRow> = {}
    const catalog: AddDeckSourceItem[] = []
    const labDb: AddDeckSourceItem[] = []
    const exa: AddDeckSourceItem[] = []
    const ontology: AddDeckSourceItem[] = []
    const trimmed = query.trim().toLowerCase()

    if (activeTab !== 'equipment') {
      for (const [type, label] of Object.entries(LABWARE_TYPE_LABELS) as Array<[LabwareType, string]>) {
        if (type === 'instrument') continue
        const cat = LABWARE_CATEGORIES[type]
        const belongs = activeTab === 'plates' ? isPlateCategory(cat) : !isPlateCategory(cat)
        if (!belongs) continue
        if (surfaceKind === 'slot' && isLawnOnlyLabwareType(type)) continue
        if (trimmed && !label.toLowerCase().includes(trimmed)) continue
        catalog.push({ key: type, source: 'catalog', label, kind: 'labware' })
        by[type] = { source: 'catalog', key: type, label, labwareType: type }
      }

      for (const hit of labDbHits) {
        if (trimmed && !hit.label.toLowerCase().includes(trimmed)) continue
        const key = `lab-db:${hit.recordId}`
        labDb.push({ key, source: 'lab-db', label: hit.label, kind: 'labware' })
        by[key] = {
          source: 'lab-db',
          key,
          label: hit.label,
          record: {
            kind: 'labware',
            recordId: hit.recordId,
            name: customName.trim() || hit.label,
            labwareType: 'other',
          },
        }
      }

      // Insulate catalog vs lab-db default rows from being the same key-space;
      // catalog keys are LabwareType names, lab-db keys are recordIds.
      for (const hit of vendorExa.exaResults) {
        const key = `exa:${hit.url}`
        if (trimmed && !hit.title.toLowerCase().includes(trimmed)) continue
        exa.push({ key, source: 'exa', label: hit.title, kind: 'labware' })
        by[key] = { source: 'exa', key, label: hit.title, hit, isInstrument: false }
      }

      for (const candidate of ontologyCandidates) {
        const key = `onto:${candidate.curie}`
        if (trimmed && !candidate.label.toLowerCase().includes(trimmed)) continue
        ontology.push({ key, source: 'ontology', label: candidate.label, kind: 'labware' })
        by[key] = { source: 'ontology', key, label: candidate.label, isInstrument: false }
      }
    } else {
      for (const hit of vendorExa.exaResults) {
        const key = `exa:${hit.url}`
        if (trimmed && !hit.title.toLowerCase().includes(trimmed)) continue
        exa.push({ key, source: 'exa', label: hit.title, kind: 'instrument' })
        by[key] = { source: 'exa', key, label: hit.title, hit, isInstrument: true }
      }
      for (const candidate of ontologyCandidates) {
        const key = `onto:${candidate.curie}`
        ontology.push({ key, source: 'ontology', label: candidate.label, kind: 'instrument' })
        by[key] = { source: 'ontology', key, label: candidate.label, isInstrument: true }
      }
    }

    return { rows: mergeAndRankDeckSources({ catalog, labDb, exa, ontology }), byKey: by }
  }, [activeTab, query, customName, surfaceKind, labDbHits, ontologyCandidates, vendorExa.exaResults])

  const isEmptyResult =
    rows.length === 0 && !vendorExa.loading && !loadingLabDb && !loadingOntology

  if (!open) return null

  function resetDraft() {
    // Clearing the query + selection scopes the next search to the new tab.
    setQuery('')
    setCustomName('')
    setSelectedKey(null)
  }

  function selectTab(next: AddDeckTab) {
    if (next === activeTab) return
    setActiveTabState(next)
    resetDraft()
  }

  async function buildLabware(row: DeckRow): Promise<Labware> {
    const name = customName.trim()
    switch (row.source) {
      case 'catalog':
        return createLabware(row.labwareType, name || undefined)
      case 'lab-db':
        return labwareRecordToEditorLabware({
          kind: 'labware',
          recordId: row.record.recordId,
          name: name || row.record.recordId,
          labwareType: 'other',
        })
      case 'exa': {
        const created = await apiClient.createFromVendorExa(row.hit)
        if (row.isInstrument) {
          const instrument = createLabware('instrument', name || created.label)
          instrument.sourceRecordId = created.recordId
          instrument.notes = `Imported from Exa equipment search: ${row.hit.url}`
          instrument.instrumentKind =
            selectedKind !== 'generic' ? selectedKind : inferInstrumentKind(row.hit.title)
          return instrument
        }
        return labwareRecordToEditorLabware({
          kind: 'labware',
          recordId: created.recordId,
          name: name || created.label,
          labwareType: 'other',
        })
      }
      case 'ontology':
        // Best-effort: ontology tiers are sparse for labware/equipment. Map the
        // term onto a generic vessel/instrument; the CURIE is preserved in the
        // record provenance but the editor has no finer generic type than `tube`.
        return createLabware(
          row.isInstrument ? 'instrument' : 'tube',
          name || row.label,
        )
    }
  }

  async function handleSubmit() {
    if (!selectedKey || mintingKey) return
    const row = byKey[selectedKey]
    if (!row) return
    setMintingKey(selectedKey)
    try {
      onPick(await buildLabware(row))
      onClose()
    } catch (error) {
      // eslint-disable-next-line no-console
      console.error('Failed to add item to deck', error)
    } finally {
      setMintingKey(null)
    }
  }

  const selectedRow = selectedKey ? byKey[selectedKey] : null

  return (
    <div className="ee-dialog__scrim" role="dialog" aria-modal="true" onClick={onClose}>
      <div className="ee-dialog" onClick={(e) => e.stopPropagation()}>
        <header className="ee-dialog__header">
          <span className="ee-dialog__title">Add to deck</span>
          <span className="ee-dialog__context">→ {contextLabel}</span>
          <button className="ee-dialog__close" onClick={onClose} aria-label="Close">×</button>
        </header>
        <div className="ee-dialog__tabs" role="group" aria-label="What to add">
          {tabs.map((tab) => (
            <button
              key={tab}
              type="button"
              className={`ee-dialog__tab${activeTab === tab ? ' ee-dialog__tab--active' : ''}`}
              aria-pressed={activeTab === tab}
              onClick={() => selectTab(tab)}
            >
              {tab === 'plates' ? 'Plates' : tab === 'labware' ? 'Labware' : 'Equipment'}
            </button>
          ))}
        </div>
        <input
          autoFocus
          type="text"
          className="ee-dialog__search"
          placeholder={
            activeTab === 'equipment'
              ? 'Search equipment… (e.g. shaker, plate reader, centrifuge)'
              : 'Search plates / labware…'
          }
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
        {activeTab === 'equipment' ? (
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
        ) : null}
        <div className="ee-dialog__body">
          {rows.map((row) => {
            const isSelected = selectedKey === row.key
            return (
              <button
                key={row.key}
                type="button"
                className={`ee-dialog__vendor-row${isSelected ? ' ee-dialog__vendor-row--selected' : ''}`}
                aria-pressed={isSelected}
                disabled={mintingKey !== null}
                onClick={() => setSelectedKey(row.key)}
              >
                <span className="ee-dialog__vendor-label">
                  {row.label}
                  {BADGE[row.source] ? (
                    <span className="ee-dialog__vendor-badge">{BADGE[row.source]}</span>
                  ) : null}
                </span>
                <span className="ee-dialog__vendor-sub">
                  {isSelected ? 'Selected — press "Add to deck" below' : sourceHint(row.source)}
                </span>
              </button>
            )
          })}
          {isEmptyResult ? (
            <div className="ee-dialog__empty">
              {query.trim() ? `No ${activeTab} matches "${query.trim()}".` : `Nothing here yet — type to search.`}
            </div>
          ) : null}
          {vendorExa.loading ? <div className="ee-dialog__vendor-spinner">…</div> : null}
        </div>
        <footer className="ee-dialog__footer">
          <button type="button" className="ee-dialog__btn" onClick={onClose}>Close</button>
          <button
            type="button"
            className="ee-dialog__btn ee-dialog__btn--primary"
            disabled={!selectedRow || mintingKey !== null}
            onClick={() => void handleSubmit()}
            title="Place the selected item at the point you clicked"
          >
            {mintingKey ? 'Adding…' : 'Add to deck'}
          </button>
        </footer>
      </div>
    </div>
  )
}

function sourceHint(source: DeckRow['source']): string {
  switch (source) {
    case 'catalog': return 'Default'
    case 'lab-db': return 'Your lab'
    case 'exa': return 'Exa'
    case 'ontology': return 'Ontology'
  }
}