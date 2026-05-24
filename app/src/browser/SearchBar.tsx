/**
 * SearchBar — text input that parses the human DSL on Enter and pushes
 * the result into `/browser`'s URL state.
 *
 * The bar shows the current full DSL (type + facets + free text combined)
 * so editing-in-place feels natural. Users see exactly what is in the URL.
 */

import { useEffect, useState, type FormEvent } from 'react'
import { parseQuery, stringifyQuery, type ParsedQuery } from './parseQuery'
import type { BrowserState } from './useBrowserState'

export interface SearchBarProps {
  state: BrowserState
  onChange: (next: ParsedQuery) => void
}

function stateToInputText(state: BrowserState): string {
  return stringifyQuery({
    q: state.q,
    facets: state.facets,
    ...(state.type ? { type: [state.type] } : {}),
  })
}

export function SearchBar({ state, onChange }: SearchBarProps) {
  // Local draft mirrors the URL when params change externally (sidebar
  // click, facet chip toggle), but lets the user type freely without
  // round-tripping every keystroke through the router.
  const [draft, setDraft] = useState(() => stateToInputText(state))

  useEffect(() => {
    setDraft(stateToInputText(state))
  }, [state.type, state.q, state.facets])

  const commit = (event?: FormEvent) => {
    event?.preventDefault()
    const parsed = parseQuery(draft)
    onChange(parsed)
  }

  return (
    <form className="cl-browser__searchbar" onSubmit={commit}>
      <input
        type="search"
        className="cl-browser__search-input"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => commit()}
        placeholder='Search — e.g. type:material vendor:"Sigma" tris'
        aria-label="Advanced search"
      />
    </form>
  )
}
