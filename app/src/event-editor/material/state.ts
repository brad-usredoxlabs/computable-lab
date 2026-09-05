import type {
  CompositionEntryValue,
  ConcentrationValue,
} from '../../types/material'
import type { Ref } from '../../types/ref'
import type { CountEstimate } from '../../types/events'
import type { ResolveRef as OLSResultRef } from '../../shared/api/resolveUtil'

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

/**
 * The material-creation seed is keyed by backend material-profile id (driven by
 * `GET /materials/profiles` via `useMaterialProfiles`), not a hand-rolled enum.
 * The four profiles with a placeable-material builder live in
 * `profileBuilderRegistry` (`MaterialProfileId`).
 */
export type MaterialProfileId = 'chemical' | 'media_composition' | 'cell_line' | 'sample'

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
  /**
   * Biological signal from a canonical term node (domain: cell_line) or an
   * organism (termKind: organism). When set, the configure view goes
   * count-first (BiologicalPlatingFields) instead of volume-first.
   */
  domain?: string
  /** term.kind of a canonical term pick (organism/condition/...). */
  termKind?: string
  /** ontology CURIE of the biological type (NCBITaxon:10090, CLO:0020273). */
  curie?: string
  /**
   * The resolved biological-type ref persisted on the add-material event
   * (what was plated), for provenance + the measure-rule gate.
   */
  biologicalType?: Ref
}

export type AddMaterialState =
  /** Initial state. Search results + on-demand OLS. */
  | { phase: 'search' }
  /** A material is chosen; user enters volume / count then confirms. */
  | {
      phase: 'configure'
      picked: PickedMaterial
      volume_uL: string
      count: string
      role: string
      /** Biological fields (cell_line/organism material) — count-first. */
      countEstimate?: CountEstimate
      conditionRefs?: Ref[]
      counterDensity?: ConcentrationValue
    }
  /**
   * Creating a new material via the shared MaterialIntentSurface (type
   * selection + per-type builder). An optional ontology seed jumps straight to
   * the right builder pre-filled (the "create from this term" path).
   */
  | { phase: 'intent'; seed?: { kind: MaterialProfileId; ontologyRef: OLSResultRef } }
  /** Submitting createRecord / createFormulation / createMaterialInstance. */
  | { phase: 'creating' }
  /** Terminal error before close. */
  | { phase: 'error'; message: string }

export type AddMaterialAction =
  | { type: 'pick'; material: PickedMaterial }
  | { type: 'open-intent' }
  | { type: 'seed-intent'; kind: MaterialProfileId; ontologyRef: OLSResultRef }
  | { type: 'set-volume'; value: string }
  | { type: 'set-count'; value: string }
  | { type: 'set-role'; value: string }
  | { type: 'set-count-estimate'; value?: CountEstimate }
  | { type: 'set-condition-refs'; value?: Ref[] }
  | { type: 'set-counter-density'; value?: ConcentrationValue }
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
        role: material.domain === 'cell_line' ? 'cells' : '',
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
    case 'set-count-estimate':
      if (state.phase !== 'configure') return state
      return { ...state, countEstimate: action.value }
    case 'set-condition-refs':
      if (state.phase !== 'configure') return state
      return { ...state, conditionRefs: action.value }
    case 'set-counter-density':
      if (state.phase !== 'configure') return state
      return { ...state, counterDensity: action.value }
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
  termKind?: string
  domain?: string
  curie?: string
}): PickedMaterial {
  const type = item.kind || 'material'
  const domain = item.domain
  const termKind = item.termKind
  const isBiological = domain === 'cell_line' || domain === 'organism' || termKind === 'organism'
  const ref: Ref = {
    kind: 'record',
    id: item.recordId,
    type,
    label: item.title,
  }
  return {
    recordId: item.recordId,
    ref,
    label: item.title,
    hasCellComposition: false,
    ...(domain ? { domain } : {}),
    ...(termKind ? { termKind } : {}),
    ...(item.curie ? { curie: item.curie } : {}),
    ...(isBiological ? { biologicalType: { kind: 'record', id: item.recordId, type: 'term', label: item.title } } : {}),
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
