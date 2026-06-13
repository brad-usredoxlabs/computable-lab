import type {
  CompositionEntryValue,
  ConcentrationValue,
} from '../../types/material'
import type { Ref } from '../../types/ref'
import type { OLSResultRef } from '../../shared/api/olsClient'

/**
 * State machine for the `AddMaterialModal`. The modal walks the user
 * through:
 *
 *   search → configure → apply               (pick existing)
 *   search → intent (MaterialIntentSurface:
 *            type select → builder) →
 *            configure → apply               (create new)
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
  /** Structured CL reference so add_material can preserve material layer. */
  ref: Ref
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
  | { phase: 'configure'; picked: PickedMaterial; volume_uL: string; count: string; role: string }
  /**
   * Creating a new material via the shared MaterialIntentSurface (type
   * selection + per-type builder). An optional ontology seed jumps straight to
   * the right builder pre-filled (the "create from this term" path).
   */
  | { phase: 'intent'; seed?: { kind: MaterialKind; ontologyRef: OLSResultRef } }
  /** Submitting createRecord / createFormulation / createMaterialInstance. */
  | { phase: 'creating' }
  /** Terminal error before close. */
  | { phase: 'error'; message: string }

export type AddMaterialAction =
  | { type: 'pick'; material: PickedMaterial }
  | { type: 'open-intent' }
  | { type: 'seed-intent'; kind: MaterialKind; ontologyRef: OLSResultRef }
  | { type: 'set-volume'; value: string }
  | { type: 'set-count'; value: string }
  | { type: 'set-role'; value: string }
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
        role: '',
      }
    }
    case 'open-intent':
      if (state.phase !== 'search') return state
      return { phase: 'intent' }
    case 'seed-intent':
      // Reachable from `search` by clicking an ontology hit — jump straight
      // into the right builder with the term pre-filled.
      return { phase: 'intent', seed: { kind: action.kind, ontologyRef: action.ontologyRef } }
    case 'set-volume':
      if (state.phase !== 'configure') return state
      return { ...state, volume_uL: action.value }
    case 'set-count':
      if (state.phase !== 'configure') return state
      return { ...state, count: action.value }
    case 'set-role':
      if (state.phase !== 'configure') return state
      return { ...state, role: action.value }
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
  kind?: string
  title: string
}): PickedMaterial {
  const type = item.kind || 'material'
  return {
    recordId: item.recordId,
    ref: {
      kind: 'record',
      id: item.recordId,
      type,
      label: item.title,
    },
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
    ref: {
      kind: 'record',
      id: formulation.outputSpec.id,
      type: 'material-spec',
      label: formulation.outputSpec.name,
    },
    label: formulation.outputSpec.name,
    hasCellComposition,
    ...(formulation.outputSpec.concentration
      ? { concentration: formulation.outputSpec.concentration }
      : {}),
    ...(composition.length > 0 ? { compositionSnapshot: composition } : {}),
  }
}
