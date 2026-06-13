/**
 * Shared "material intent" contract.
 *
 * `MaterialIntentSurface` is the one type-picker + builder-router shared by every
 * material-creation host (the event editor's `AddMaterialModal`, the record
 * editor's `MaterialPicker`). The hosts have *disjoint* builder sets — the event
 * editor creates placeable materials (compound / cells / mixture / sample) while
 * the record editor creates record refs (vendor product / prepared instance /
 * biological / derived / local concept) — so the surface can't own the builders
 * themselves. What it centralizes is the picker shell, the seed→skip-picker
 * logic, the modal-vs-inline layout, and this resolved-material contract. Each
 * host plugs in its own builders via `MaterialIntentOption.render`, which keeps
 * `shared/` free of any backwards import into a feature module.
 */

import type { ReactNode } from 'react'
import type { Ref } from '../../types/ref'
import type {
  CompositionEntryValue,
  ConcentrationValue,
} from '../../types/material'

/**
 * What every builder resolves to — never a bare ontology ref. Structurally
 * identical to the event editor's `PickedMaterial`; the extra fields are
 * populated for the event-editor configure step and ignored by other hosts.
 */
export interface MaterialResolved {
  /** Record id the host sends downstream (event-graph apply / form onChange). */
  recordId: string
  /** Structured CL reference so callers preserve the material layer. */
  ref: Ref
  /** Display label. */
  label: string
  /** True when the material's composition has a `role: cells` entry. */
  hasCellComposition: boolean
  /** Concentration carried by the formulation, if any. */
  concentration?: ConcentrationValue
  /** Composition snapshot to ship with the event (mixtures / cells). */
  compositionSnapshot?: CompositionEntryValue[]
}

/** Callbacks handed to a builder when the surface renders it. */
export interface MaterialBuilderContext {
  onResolved: (material: MaterialResolved) => void
  onCancel: () => void
  onError: (message: string) => void
}

/**
 * One entry in the type picker. `render` returns the host's builder for that
 * kind (inline form or self-portaling modal — the host decides). An option with
 * `onSelect` instead of `render` is a host-handled route (e.g. "create a
 * formulation" hands off to another page) — clicking it fires `onSelect` rather
 * than rendering a builder.
 */
export interface MaterialIntentOption {
  kind: string
  title: string
  detail: string
  render?: (ctx: MaterialBuilderContext) => ReactNode
  onSelect?: () => void
}
