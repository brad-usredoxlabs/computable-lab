/**
 * GlobalSearchBar — global search input in the navbar.
 *
 * Stub implementation for Phase 1. Full cross-entity-type search
 * is implemented in Phase 6.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1
 */

import './GlobalSearchBar.css'

export function GlobalSearchBar() {
  return (
    <input
      className="global-search-bar"
      data-testid="global-search-bar"
      placeholder="Find anything…"
      type="text"
    />
  )
}
