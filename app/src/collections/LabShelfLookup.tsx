/**
 * LabShelfLookup — the /lab materials-category consumer of MATRES-SHELF.
 *
 * Item L2-LAB-INVENTORY-CREATE-1 leg (c): "what DMEM is on the shelf". A
 * single labelled search box calls the shipped read-only
 * GET /api/inventory/shelf?term=... (server/src/api/routes.ts) and renders
 * the returned ShelfReport verbatim: the resolved concepts, and every
 * recorded line with its level and — only where the server sent it —
 * vendor / lot / location, plus its joinedVia provenance, including
 * 'unknown-provenance' (never blank, never invented).
 *
 * Display law (the never-guess contract applied to rendering): the term is
 * user input and every row is server data. No reagent nouns, vendor names,
 * record ids or term allowlists in this file; the only literals are the
 * endpoint path and the 'unknown-provenance' label. Fetch happens ONLY on
 * submit — never on mount (an unconditional mount fetch would leak into the
 * other /lab tests that render the collection view without a fetch stub) —
 * and an empty/whitespace term issues no request. A non-ok response shows
 * the honest error and clears any previous result.
 *
 * The response is typed with a LOCAL structural mirror of the server's
 * ShelfReport (server/src/resolve/shelfLookup.ts:74) — the app imports
 * across the server boundary only inside tests, so no cross-boundary type
 * import. The mirror declares nothing the server does not send, and no
 * `| undefined` union (exactOptionalPropertyTypes is a server-only concern).
 */
import { useState, type FormEvent } from 'react'
import './LabShelfLookup.css'

/** Structural mirror of server/src/resolve/shelfLookup.ts ShelfJoinPath. */
type ShelfJoinPath =
  | 'vendor-product'
  | 'direct-material-ref'
  | 'parent-instance'
  | 'source-lot'
  | 'labware-definition'
  | 'unknown-provenance'

type ShelfReferentLevel = 'instance' | 'lot' | 'aliquot' | 'labware-instance'

interface ShelfEntry {
  recordId: string
  kind: string
  label: string
  level: ShelfReferentLevel
  vendor?: string
  lot?: string
  /** Location label from the instance (labware-instance only). */
  location?: string
  joinedVia: ShelfJoinPath
}

interface ShelfGroup {
  vendor?: string
  lot?: string
  entries: ShelfEntry[]
}

interface ShelfConcept {
  recordId: string
  label: string
  sourceKind?: 'material' | 'labware-definition'
}

/** The grouped bill of recorded material for one term. */
interface ShelfReport {
  term: string
  concepts: ShelfConcept[]
  groups: ShelfGroup[]
}

const SHELF_ENDPOINT = '/api/inventory/shelf'

type ShelfState =
  | { phase: 'idle' }
  | { phase: 'loading'; term: string }
  | { phase: 'error'; term: string; message: string }
  | { phase: 'done'; term: string; report: ShelfReport }

export function LabShelfLookup() {
  const [term, setTerm] = useState('')
  const [state, setState] = useState<ShelfState>({ phase: 'idle' })

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault()
    const trimmed = term.trim()
    // An empty/whitespace term is no query: no request, no state change.
    if (!trimmed) return
    setState({ phase: 'loading', term: trimmed })
    try {
      // Precedent: plain fetch for a read-only GET (ExtractionDraftsListPage).
      const response = await fetch(`${SHELF_ENDPOINT}?term=${encodeURIComponent(trimmed)}`)
      if (!response.ok) {
        throw new Error(`shelf lookup failed (HTTP ${response.status})`)
      }
      const report = (await response.json()) as ShelfReport
      setState({ phase: 'done', term: trimmed, report })
    } catch (err) {
      setState({ phase: 'error', term: trimmed, message: err instanceof Error ? err.message : 'shelf lookup failed' })
    }
  }

  return (
    <section className="lab-shelf" data-testid="lab-shelf-lookup" aria-label="Shelf lookup">
      <form className="lab-shelf__form" onSubmit={(e) => void onSubmit(e)}>
        <label className="lab-shelf__label" htmlFor="lab-shelf-term-input">
          What is on the shelf
        </label>
        <input
          id="lab-shelf-term-input"
          className="lab-shelf__input"
          data-testid="lab-shelf-term"
          type="text"
          value={term}
          placeholder="material or labware, e.g. a concept name"
          onChange={(e) => setTerm(e.target.value)}
        />
        <button className="lab-shelf__submit" type="submit" data-testid="lab-shelf-submit">
          Look up
        </button>
      </form>
      {state.phase === 'loading' && (
        <p className="lab-shelf__hint" data-testid="lab-shelf-loading">
          Looking up {state.term}…
        </p>
      )}
      {state.phase === 'error' && (
        <p className="lab-shelf__error" data-testid="lab-shelf-error">
          {state.message}
        </p>
      )}
      {state.phase === 'done' && (
        <div className="lab-shelf__result" data-testid="lab-shelf-result">
          {state.report.concepts.length > 0 ? (
            <ul className="lab-shelf__concepts" aria-label="Resolved concepts">
              {state.report.concepts.map((concept) => (
                <li key={concept.recordId} data-testid="lab-shelf-concept">
                  {concept.label}
                  {concept.sourceKind ? <span className="lab-shelf__source"> · {concept.sourceKind}</span> : null}
                </li>
              ))}
            </ul>
          ) : (
            <p className="lab-shelf__hint">No recorded concepts matched {state.report.term}.</p>
          )}
          {state.report.groups.length === 0 ? (
            <p className="lab-shelf__hint" data-testid="lab-shelf-empty">
              Nothing recorded for {state.report.term}.
            </p>
          ) : (
            state.report.groups.map((group) => (
              <div className="lab-shelf__group" key={`${group.vendor ?? ''}\u0000${group.lot ?? ''}`}>
                <h3 className="lab-shelf__group-heading">
                  {[group.vendor, group.lot].filter(Boolean).join(' · ')}
                </h3>
                <ul className="lab-shelf__entries">
                  {group.entries.map((entry) => (
                    <li className="lab-shelf__entry" key={entry.recordId} data-testid={`lab-shelf-entry-${entry.recordId}`}>
                      <span className="lab-shelf__entry-label">{entry.label}</span>
                      <span className="lab-shelf__entry-level">{entry.level}</span>
                      {entry.vendor ? <span className="lab-shelf__entry-vendor">{entry.vendor}</span> : null}
                      {entry.lot ? <span className="lab-shelf__entry-lot">lot {entry.lot}</span> : null}
                      <span className="lab-shelf__entry-location">
                        {entry.location ?? 'location not recorded'}
                      </span>
                      <span className="lab-shelf__entry-provenance">{entry.joinedVia}</span>
                    </li>
                  ))}
                </ul>
              </div>
            ))
          )}
        </div>
      )}
    </section>
  )
}
