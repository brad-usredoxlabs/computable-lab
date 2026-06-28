/**
 * profileBuilderRegistry — maps backend material profiles to the event editor's
 * four placeable-material builders, so the Add-Material type picker is driven by
 * `GET /materials/profiles` (via `useMaterialProfiles`) instead of a hand-rolled
 * enum. Titles come from the backend `profile.label`; the registry supplies the
 * one-line blurb and the concrete builder for each profile (profiles carry no
 * builder hint, and the four builders stay hand-written).
 */

import type { ResolveRef } from '../../shared/api/resolveUtil'
import type { MaterialIntentOption } from '../../shared/material-intent/types'
import type { PickedMaterial } from './state'
import { BuildCompoundForm } from './builders/BuildCompoundForm'
import { BuildCellsForm } from './builders/BuildCellsForm'
import { BuildMixtureForm } from './builders/BuildMixtureForm'
import { BuildSampleForm } from './builders/BuildSampleForm'

/** The profile ids that have their own picker row + builder. */
export const PICKER_PROFILE_IDS = ['chemical', 'media_composition', 'cell_line', 'sample'] as const
export type MaterialProfileId = (typeof PICKER_PROFILE_IDS)[number]

type BuilderProps = {
  seedOntologyRef?: ResolveRef
  onSaved: (next: PickedMaterial) => void
  onCancel: () => void
  onError: (message: string) => void
}
type BuilderComponent = (props: BuilderProps) => JSX.Element

interface ProfileBuilderEntry {
  profileId: MaterialProfileId
  builder: BuilderComponent
  /** Fallback title when the backend profile (and its label) isn't loaded. */
  defaultTitle: string
  detail: string
}

const ENTRIES: ProfileBuilderEntry[] = [
  { profileId: 'chemical', builder: BuildCompoundForm, defaultTitle: 'Compound + solvent', detail: '10 µM test compound in DMSO — single primary compound dissolved in a solvent' },
  { profileId: 'media_composition', builder: BuildMixtureForm, defaultTitle: 'Mixture', detail: 'Cell media, buffers — multiple components, no dominant ontology ref' },
  { profileId: 'cell_line', builder: BuildCellsForm, defaultTitle: 'Cells', detail: 'HepG2, primary cultures — counted in cells/well, not concentration' },
  { profileId: 'sample', builder: BuildSampleForm, defaultTitle: 'Sample', detail: 'DNA / cDNA / RNA preps with origin and parent-experiment metadata' },
]

/**
 * Normalize the ontology-seed inference (which can return `other` /
 * `single_active_formulation`) to a profile that actually has a picker row,
 * so a seeded surface always lands on a real builder. `other` → `chemical`.
 */
export function toPickerProfileId(inferred: string): MaterialProfileId {
  return (PICKER_PROFILE_IDS as readonly string[]).includes(inferred)
    ? (inferred as MaterialProfileId)
    : 'chemical'
}

/**
 * Build the picker options from the registry × the backend profiles. When
 * profiles are loaded, only the ones the backend actually defines are shown
 * (data-driven availability); before they load (or on error) the full set is
 * shown so the picker never blanks. Titles prefer the backend `profile.label`.
 */
export function materialIntentOptions(args: {
  seedOntologyRef?: ResolveRef
  profiles: ReadonlyArray<{ id: string; label: string }>
}): MaterialIntentOption[] {
  const seed = args.seedOntologyRef ? { seedOntologyRef: args.seedOntologyRef } : {}
  const labelById = new Map(args.profiles.map((p) => [p.id, p.label]))
  const available = args.profiles.length > 0 ? new Set(args.profiles.map((p) => p.id)) : null
  return ENTRIES.filter((e) => !available || available.has(e.profileId)).map((e) => {
    const Builder = e.builder
    return {
      kind: e.profileId,
      title: labelById.get(e.profileId) ?? e.defaultTitle,
      detail: e.detail,
      render: ({ onResolved, onCancel, onError }) => (
        <Builder {...seed} onSaved={onResolved} onCancel={onCancel} onError={onError} />
      ),
    }
  })
}
