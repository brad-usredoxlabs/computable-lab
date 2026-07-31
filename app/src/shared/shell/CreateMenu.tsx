/**
 * CreateMenu — "+ Create" dropdown in the navbar.
 *
 * Stub implementation for Phase 1. Full menu with entity-type options
 * is implemented in Phase 6.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §4.1
 * New Run SHOULD be the visually dominant creation action.
 */

import './CreateMenu.css'

export function CreateMenu() {
  return (
    <button
      className="create-menu"
      data-testid="create-menu"
      type="button"
    >
      + Create
    </button>
  )
}
