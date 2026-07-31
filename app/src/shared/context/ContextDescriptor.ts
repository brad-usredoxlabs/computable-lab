/**
 * ContextDescriptor — describes the active workspace context for the
 * right-hand pane. All right-pane tabs consume this descriptor so their
 * scope stays synchronized.
 *
 * Spec reference: specs/computable-lab-ui-specification.md §12.3
 */

export type ContextObjectType =
  | 'project'
  | 'run'
  | 'claim'
  | 'protocol'
  | 'material'
  | 'labware'
  | 'equipment'
  | 'person'
  | 'document'

export interface SelectedSubobject {
  objectType: string
  objectId: string
  label: string
}

export interface ContextDescriptor {
  /** The type of the active workspace object. */
  objectType: ContextObjectType
  /** The record ID of the active object. */
  objectId: string
  /** Human-readable label for the scope header. */
  label: string
  /** Optional subobject selected in the main canvas (e.g. wells, events). */
  selectedSubobject?: SelectedSubobject
  /** Projects linked to the active object. */
  linkedProjectIds?: string[]
  /** Permission flags. */
  permissions: string[]
}
