/**
 * The TERM PANEL — what the draft's terms are, where they came from, and one
 * place to fix them.
 *
 * Brad's request (2026-09-20): "a collapsible panel under that that has the
 * details of each term used, where the user can see if it's matched a local term,
 * an ontology term or a vendor term, search and edit, then accept…. Or even
 * clarify what the term is and if they add another prompt and redraft, the
 * clarified term is sent with the redraft."
 *
 * Design rules this component follows:
 * - It renders the SERVER's manifest (draftTermManifest) — it does not re-derive
 *   what a term matched. One classification, in one place.
 * - Search is the SAME slash resolver the TapTab editor and the clarification
 *   picker use, so the panel can never disagree with them about what exists.
 * - A confirmed pick emits the celebrated mention shape (`[[material:ID|Label]]`),
 *   i.e. exactly what the existing clarification-answer path already round-trips.
 * - It never blocks: the draft is reviewed/accepted with or without term
 *   decisions; the panel is a well-lit place to fix names, not a gate.
 */
import { useEffect, useMemo, useRef, useState } from 'react'
import { SlashSuggestionList } from '../../../shared/taptab/slashMenu/SlashSuggestionList'
import type { SlashSuggestionListHandle } from '../../../shared/taptab/slashMenu/SlashSuggestionList'
import { resolveEquipment, resolveLabware, resolveMaterial } from '../../../shared/taptab/slashMenu/resolvers'
import type {
  SlashMention,
  SlashResolver,
  SlashResolverContext,
  SlashSuggestion,
} from '../../../shared/taptab/slashMenu/types'

export type TermSource = 'local-record' | 'ontology' | 'vendor-product' | 'minted'
export type TermKind = 'material' | 'labware' | 'equipment'

/** The words the biologist reads. One map, so the panel and any future surface agree. */
export const TERM_SOURCE_LABEL: Record<TermSource, string> = {
  'local-record': 'local term',
  ontology: 'ontology term',
  'vendor-product': 'vendor item',
  minted: 'unmatched · new',
}

/** The three kinds a step can add, and the section header the rows live under. */
export const TERM_KIND_SECTION: Record<TermKind, string> = {
  material: 'Materials',
  labware: 'Labware',
  equipment: 'Equipment',
}

/** The DEFAULT slash resolver a row of each kind opens — the panel must not offer
 *  a beverage catalogue when the row is a water bath. */
const KIND_RESOLVER: Record<TermKind, SlashResolver> = {
  material: resolveMaterial,
  labware: resolveLabware,
  equipment: resolveEquipment,
}

export interface TermSuggestionRow {
  id: string
  preferredLabel: string
  distance: number
  matchedOn: string
  aliases?: string[]
}

export interface DraftTermRow {
  /** The spelling the draft used. */
  label: string
  source: TermSource
  id: string
  field?: string
  eventIndex?: number
  /** What kind of thing this row is — drives grouping and the search resolver. */
  kind?: TermKind
  vendor?: string
  catalogNumber?: string
  aliases?: string[]
  /** Near matches the review dialogue can offer (never applied automatically). */
  suggestions?: TermSuggestionRow[]
}

export interface TermConfirmation {
  label: string
  /** Present when the biologist picked a resolved term (mention payload). */
  mention?: SlashMention
  /** Present when the pick was an existing local term to link to. */
  existingTermId?: string
}

export interface TermClarification {
  label: string
  text: string
}

export interface TermPanelProps {
  terms: DraftTermRow[]
  onConfirm?: (confirmation: TermConfirmation) => void
  onClarify?: (clarification: TermClarification) => void
  /** Injected so the panel reuses the real resolvers and stays testable. */
  search?: SlashResolver
  defaultOpen?: boolean
}

function provenanceText(row: DraftTermRow): string {
  const base = TERM_SOURCE_LABEL[row.source]
  if (row.source === 'vendor-product') {
    const parts = [row.vendor, row.catalogNumber].filter(Boolean)
    return parts.length > 0 ? `${base} · ${parts.join(' ')}` : base
  }
  if (row.source === 'ontology' || row.source === 'local-record') {
    return row.id && row.id !== row.label ? `${base} · ${row.id}` : base
  }
  return base
}

/** The render props the row bullets need from the panel's state. */
interface TermItemsRender {
  searching: number | null
  clarifying: number | null
  query: string
  clarifyText: string
  listRef: React.MutableRefObject<SlashSuggestionListHandle | null>
  items: SlashSuggestion[]
  loading: boolean
  setSearching: (n: number | null) => void
  setQuery: (s: string) => void
  setItems: (items: SlashSuggestion[]) => void
  setClarifying: (n: number | null) => void
  setClarifyText: (s: string) => void
  onConfirm?: TermPanelProps['onConfirm']
  onClarify?: TermPanelProps['onClarify']
}

/**
 * Render the rows grouped by KIND (Materials / Labware / Equipment), with a
 * section header before the first row of each kind. The rows keep a GLOBAL index
 * (the panel's `searching`/`clarifying` work in the global space), so the
 * data-testid is stable and a single active search can span sections.
 */
function renderTermItems(terms: DraftTermRow[], r: TermItemsRender): React.ReactNode[] {
  const kinds: TermKind[] = ['material', 'labware', 'equipment']
  const nodes: React.ReactNode[] = []
  let globalIndex = 0

  for (const kind of kinds) {
    const section = terms.filter((t) => (t.kind ?? 'material') === kind)
    if (section.length === 0) continue

    nodes.push(
      <div key={`section-${kind}`} className="term-panel__section-header" data-testid={`term-section-${kind}`}>
        {TERM_KIND_SECTION[kind]}
      </div>,
    )

    section.forEach((row) => {
      const index = globalIndex++
      nodes.push(termRow(row, index, r))
    })
  }

  return nodes
}

/** One collapsible row: provenance, Search / Accept / Clarify, and the inline panels. */
function termRow(row: DraftTermRow, index: number, r: TermItemsRender): React.ReactElement {
  return (
    <div className="term-panel__row" key={`${row.label}-${row.id}-${index}`} data-testid={`term-row-${index}`}>
      <div className="term-panel__row-head">
        <span className="term-panel__label">{row.label}</span>
        <span
          className={`term-panel__provenance term-panel__provenance--${row.source}`}
          data-testid={`term-provenance-${index}`}
        >
          {provenanceText(row)}
        </span>
        <span className="term-panel__row-actions">
          <button
            type="button"
            className="term-panel__btn"
            onClick={() => {
              r.setSearching(r.searching === index ? null : index)
              r.setQuery('')
              r.setItems([])
            }}
            data-testid={`term-search-${index}`}
          >
            {r.searching === index ? 'Cancel' : 'Search'}
          </button>
          <button
            type="button"
            className="term-panel__btn"
            onClick={() => r.onConfirm?.({ label: row.label, existingTermId: row.id })}
            data-testid={`term-accept-${index}`}
          >
            Accept
          </button>
          <button
            type="button"
            className="term-panel__btn"
            onClick={() => {
              r.setClarifying(r.clarifying === index ? null : index)
              r.setClarifyText('')
            }}
            data-testid={`term-clarify-${index}`}
          >
            Clarify…
          </button>
        </span>
      </div>

      {row.suggestions && row.suggestions.length > 0 ? (
        <div className="term-panel__suggestions" data-testid={`term-suggestions-${index}`}>
          {row.suggestions.map((suggestion) => (
            <div className="term-panel__suggestion" key={suggestion.id}>
              <span className="term-panel__suggestion-text">
                Use existing “{suggestion.preferredLabel}”
                {suggestion.aliases && suggestion.aliases.length > 0
                  ? ` (aliases: ${suggestion.aliases.join(', ')})`
                  : ''}
              </span>
              <button
                type="button"
                className="term-panel__btn term-panel__btn--primary"
                onClick={() => r.onConfirm?.({ label: row.label, existingTermId: suggestion.id })}
                data-testid={`term-use-existing-${index}-${suggestion.id}`}
              >
                Use this term
              </button>
            </div>
          ))}
        </div>
      ) : null}

      {r.searching === index ? (
        <div className="term-panel__search">
          <input
            type="text"
            className="term-panel__search-input"
            value={r.query}
            placeholder={`Search a local, ontology or vendor match for “${row.label}”`}
            autoComplete="off"
            spellCheck={false}
            onChange={(event) => r.setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (r.listRef.current?.onKeyDown(event.nativeEvent)) event.preventDefault()
            }}
            data-testid={`term-search-input-${index}`}
          />
          <SlashSuggestionList
            ref={r.listRef}
            items={r.items}
            loading={r.loading}
            emptyLabel={r.query ? 'No matches' : 'Type to search'}
            command={(item) => {
              r.onConfirm?.({ label: row.label, mention: item.mention })
              r.setSearching(null)
              r.setItems([])
            }}
          />
        </div>
      ) : null}

      {r.clarifying === index ? (
        <div className="term-panel__clarify">
          <textarea
            className="term-panel__clarify-input"
            value={r.clarifyText}
            rows={2}
            placeholder={`What is “${row.label}”? The redraft is sent with your sentence.`}
            onChange={(event) => r.setClarifyText(event.target.value)}
            data-testid={`term-clarify-input-${index}`}
          />
          <button
            type="button"
            className="term-panel__btn term-panel__btn--primary"
            disabled={r.clarifyText.trim().length === 0}
            onClick={() => {
              r.onClarify?.({ label: row.label, text: r.clarifyText.trim() })
              r.setClarifying(null)
              r.setClarifyText('')
            }}
            data-testid={`term-clarify-send-${index}`}
          >
            Clarify and redraft
          </button>
        </div>
      ) : null}
    </div>
  )
}

export function TermPanel({ terms, onConfirm, onClarify, search, defaultOpen = false }: TermPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [searching, setSearching] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SlashSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [clarifying, setClarifying] = useState<number | null>(null)
  const [clarifyText, setClarifyText] = useState('')
  const listRef = useRef<SlashSuggestionListHandle | null>(null)

  // A row's search runs against the resolver for ITS KIND (material / labware /
  // equipment) — never the material resolver for a water bath. The `search` prop
  // overrides only material (back-compat for injected/material-only callers).
  const resolveForKind = useMemo(
    () => (kind: TermKind): SlashResolver =>
      kind === 'material' && search ? search : KIND_RESOLVER[kind],
    [search],
  )

  // A row's search runs against the same resolvers the editor uses. Any change of
  // row or query abandons the previous request, so a slow resolver can never drop
  // the previous term's rows into the new term's card.
  useEffect(() => {
    if (searching === null || query.trim().length === 0) {
      setItems([])
      setLoading(false)
      return
    }
    const kind: TermKind = terms[searching]?.kind ?? 'material'
    const resolve = resolveForKind(kind)
    const controller = new AbortController()
    setLoading(true)
    const context: SlashResolverContext = { selection: null, signal: controller.signal }
    resolve(query, context)
      .then((next) => {
        if (!controller.signal.aborted) setItems(next)
      })
      .catch(() => {
        if (!controller.signal.aborted) setItems([])
      })
      .finally(() => {
        if (!controller.signal.aborted) setLoading(false)
      })
    return () => controller.abort()
  }, [searching, query, resolveForKind, terms])

  if (terms.length === 0) return null

  const unmatched = terms.filter((term) => term.source === 'minted').length
  const header = unmatched > 0 ? `Terms (${terms.length}) · ${unmatched} new` : `Terms (${terms.length})`

  return (
    <div className="term-panel" data-testid="term-panel">
      <button
        type="button"
        className="term-panel__header"
        aria-expanded={open}
        onClick={() => setOpen((value) => !value)}
        data-testid="term-panel-toggle"
      >
        <span className="term-panel__caret">{open ? '▾' : '▸'}</span>
        <span className="term-panel__title">{header}</span>
      </button>

      {open ? (
        <div className="term-panel__rows">
          {renderTermItems(terms, { searching, clarifying, query, clarifyText, listRef, items, loading, setSearching, setQuery, setItems, setClarifying, setClarifyText, onConfirm, onClarify })}
        </div>
      ) : null}
    </div>
  )
}
