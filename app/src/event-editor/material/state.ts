import type {
  CompositionEntryValue,
  ConcentrationValue,
} from '../../types/material'
import type { OLSResultRef } from '../../shared/api/olsClient'

/**
 * State machine for the `AddMaterialModal`. The modal walks the user
 * through:
 *
 *   search → configure → apply               (pick existing)
 *   search → pick-type → build-<type> →
 *            creating → configure → apply    (create new)
 *
 * Each state carries the minimum data needed to render its UI. The
 * reducer rejects transitions that don't make sense from the current
 * state, so the only way to advance is via the typed actions below.
 */

export type MaterialKind = 'compound' | 'mixture' | 'cells' | 'sample'

/**
 * What the configure step has to know about the chosen material to
 * decide whether to show "Volume" or "Cell count" (composition has a
 * cells role) and to seed concentration defaults from the formulation.
 */
export interface PickedMaterial {
  /** Record id that the apply action sends to the event-graph. */
  recordId: string
  /** Display label for the configure header. */
  label: string
  /** True when the material's composition has a `role: cells` entry. */
  hasCellComposition: boolean
  /** Concentration carried by the formulation, if any. */
  concentration?: ConcentrationValue
  /** Composition snapshot to ship with the event (mixtures / cells). */
  compositionSnapshot?: CompositionEntryValue[]
}

export type AddMaterialState =
  /** Initial state. Search results + on-demand OLS. */
  | { phase: 'search' }
  /** A material is chosen; user enters volume / count then confirms. */
  | { phase: 'configure'; picked: PickedMaterial; volume_uL: string; count: string }
  /** User clicked "Create new"; choose which kind. */
  | { phase: 'pick-type' }
  /**
   * Building a new material of a specific kind. The builder form owns
   * its own internal field state — this slice only carries the kind +
   * an optional ontology seed when the user came in by clicking an
   * ontology hit in search (the "create from this term" path).
   */
  | { phase: 'build'; kind: MaterialKind; seedOntologyRef?: OLSResultRef }
  /** Submitting createRecord / createFormulation / createMaterialInstance. */
  | { phase: 'creating' }
  /** Terminal error before close. */
  | { phase: 'error'; message: string }

export type AddMaterialAction =
  | { type: 'pick'; material: PickedMaterial }
  | { type: 'request-create' }
  | { type: 'pick-kind'; kind: MaterialKind }
  | { type: 'seed-build'; kind: MaterialKind; ontologyRef: OLSResultRef }
  | { type: 'cancel-build' }
  | { type: 'set-volume'; value: string }
  | { type: 'set-count'; value: string }
  | { type: 'submitting' }
  | { type: 'fail'; message: string }
  | { type: 'reset' }

export function initialState(): AddMaterialState {
  return { phase: 'search' }
}

export function reducer(state: AddMaterialState, action: AddMaterialAction): AddMaterialState {
  switch (action.type) {
    case 'pick': {
      const { material } = action
      return {
        phase: 'configure',
        picked: material,
        volume_uL: '100',
        count: material.hasCellComposition ? '100000' : '',
      }
    }
    case 'request-create':
      if (state.phase !== 'search') return state
      return { phase: 'pick-type' }
    case 'pick-kind':
      if (state.phase !== 'pick-type') return state
      return { phase: 'build', kind: action.kind }
    case 'seed-build':
      // Reachable from `search` (clicked an ontology hit, going
      // straight into the builder with the term pre-filled) or from
      // `pick-type` (user changed their mind about which kind to build).
      return { phase: 'build', kind: action.kind, seedOntologyRef: action.ontologyRef }
    case 'cancel-build':
      return { phase: 'search' }
    case 'set-volume':
      if (state.phase !== 'configure') return state
      return { ...state, volume_uL: action.value }
    case 'set-count':
      if (state.phase !== 'configure') return state
      return { ...state, count: action.value }
    case 'submitting':
      return { phase: 'creating' }
    case 'fail':
      return { phase: 'error', message: action.message }
    case 'reset':
      return initialState()
    default: {
      const exhaustive: never = action
      return exhaustive
    }
  }
}

/**
 * Build the labels we show to the user when they pick a material from
 * a search result. Centralized so the modal and the configure header
 * stay in sync about what counts as the "label" vs the recordId.
 */
export function pickedFromSearchItem(item: {
  recordId: string
  title: string
}): PickedMaterial {
  return {
    recordId: item.recordId,
    label: item.title,
    hasCellComposition: false,
  }
}

export function pickedFromFormulation(formulation: {
  outputSpec: {
    id: string
    name: string
    concentration?: ConcentrationValue
    composition?: CompositionEntryValue[]
  }
}): PickedMaterial {
  const composition = formulation.outputSpec.composition ?? []
  const hasCellComposition = composition.some((entry) => entry?.role === 'cells')
  return {
    recordId: formulation.outputSpec.id,
    label: formulation.outputSpec.name,
    hasCellComposition,
    ...(formulation.outputSpec.concentration
      ? { concentration: formulation.outputSpec.concentration }
      : {}),
    ...(composition.length > 0 ? { compositionSnapshot: composition } : {}),
  }
}
