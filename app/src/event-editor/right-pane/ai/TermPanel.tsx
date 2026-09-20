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
import { resolveMaterial } from '../../../shared/taptab/slashMenu/resolvers'
import type {
  SlashMention,
  SlashResolver,
  SlashResolverContext,
  SlashSuggestion,
} from '../../../shared/taptab/slashMenu/types'

export type TermSource = 'local-record' | 'ontology' | 'vendor-product' | 'minted'

/** The words the biologist reads. One map, so the panel and any future surface agree. */
export const TERM_SOURCE_LABEL: Record<TermSource, string> = {
  'local-record': 'local term',
  ontology: 'ontology term',
  'vendor-product': 'vendor item',
  minted: 'unmatched · new',
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

export function TermPanel({ terms, onConfirm, onClarify, search, defaultOpen = false }: TermPanelProps) {
  const [open, setOpen] = useState(defaultOpen)
  const [searching, setSearching] = useState<number | null>(null)
  const [query, setQuery] = useState('')
  const [items, setItems] = useState<SlashSuggestion[]>([])
  const [loading, setLoading] = useState(false)
  const [clarifying, setClarifying] = useState<number | null>(null)
  const [clarifyText, setClarifyText] = useState('')
  const listRef = useRef<SlashSuggestionListHandle | null>(null)

  const resolve = useMemo(
    () => search ?? resolveMaterial,
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
  }, [searching, query, resolve])

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
          {terms.map((row, index) => (
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
                      setSearching(searching === index ? null : index)
                      setQuery('')
                      setItems([])
                    }}
                    data-testid={`term-search-${index}`}
                  >
                    {searching === index ? 'Cancel' : 'Search'}
                  </button>
                  <button
                    type="button"
                    className="term-panel__btn"
                    onClick={() => onConfirm?.({ label: row.label, existingTermId: row.id })}
                    data-testid={`term-accept-${index}`}
                  >
                    Accept
                  </button>
                  <button
                    type="button"
                    className="term-panel__btn"
                    onClick={() => {
                      setClarifying(clarifying === index ? null : index)
                      setClarifyText('')
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
                        onClick={() => onConfirm?.({ label: row.label, existingTermId: suggestion.id })}
                        data-testid={`term-use-existing-${index}-${suggestion.id}`}
                      >
                        Use this term
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {searching === index ? (
                <div className="term-panel__search">
                  <input
                    type="text"
                    className="term-panel__search-input"
                    value={query}
                    placeholder={`Search a local, ontology or vendor match for “${row.label}”`}
                    autoComplete="off"
                    spellCheck={false}
                    onChange={(event) => setQuery(event.target.value)}
                    onKeyDown={(event) => {
                      if (listRef.current?.onKeyDown(event.nativeEvent)) event.preventDefault()
                    }}
                    data-testid={`term-search-input-${index}`}
                  />
                  <SlashSuggestionList
                    ref={listRef}
                    items={items}
                    loading={loading}
                    emptyLabel={query ? 'No matches' : 'Type to search'}
                    command={(item) => {
                      onConfirm?.({ label: row.label, mention: item.mention })
                      setSearching(null)
                      setItems([])
                    }}
                  />
                </div>
              ) : null}

              {clarifying === index ? (
                <div className="term-panel__clarify">
                  <textarea
                    className="term-panel__clarify-input"
                    value={clarifyText}
                    rows={2}
                    placeholder={`What is “${row.label}”? The redraft is sent with your sentence.`}
                    onChange={(event) => setClarifyText(event.target.value)}
                    data-testid={`term-clarify-input-${index}`}
                  />
                  <button
                    type="button"
                    className="term-panel__btn term-panel__btn--primary"
                    disabled={clarifyText.trim().length === 0}
                    onClick={() => {
                      onClarify?.({ label: row.label, text: clarifyText.trim() })
                      setClarifying(null)
                      setClarifyText('')
                    }}
                    data-testid={`term-clarify-send-${index}`}
                  >
                    Clarify and redraft
                  </button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}
    </div>
  )
}
