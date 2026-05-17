import type { EventEditorState, FixItSeed } from '../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'

interface BuildFixSeedArgs {
  /**
   * The user prompt that produced the preview the Fix-it button was clicked
   * on. The dock holds this in its chat log; the panel passes it in so the
   * seed isn't dependent on dock internals.
   */
  prompt: string
  /**
   * Validation skips reported by the dock when promoting the draft (e.g.
   * "lbw-seed-x: slot reserved"). These often explain WHY a preview looks
   * wrong, so they're worth showing the AI.
   */
  previewSkips: string[]
  state: EventEditorState
}

let sessionCounter = 0
function nextSessionId(): string {
  sessionCounter += 1
  return `fix-${Date.now().toString(36)}-${sessionCounter.toString(36)}`
}

/**
 * Capture the editor + preview state into a frozen seed. Should be called
 * exactly at the moment the user clicks Fix-it — anything that mutates after
 * that point (the user discarding the preview, drilling into wells, etc.)
 * must NOT affect the seed.
 */
export function buildFixSeed({ prompt, previewSkips, state }: BuildFixSeedArgs): FixItSeed {
  const preview = state.preview
  const platform = getPlatformManifest(state.platforms, state.platformId)
  const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)

  const committedPlacements = state.placements.map((p) => {
    const labware = state.labwares[p.labwareId]
    return {
      slotId: p.location.kind === 'slot' ? p.location.slotId : null,
      lawn:
        p.location.kind === 'lawn'
          ? { xMm: p.location.xMm, yMm: p.location.yMm }
          : null,
      labwareName: labware?.name ?? p.labwareId,
      labwareType: labware?.labwareType ?? 'unknown',
    }
  })

  return {
    prompt,
    draft: {
      events: preview ? [...preview.previewEvents] : [],
      placements: preview ? [...preview.previewPlacements] : [],
      labwares: preview ? { ...preview.previewLabwares } : {},
      skips: [...previewSkips],
    },
    deckContext: {
      platformId: state.platformId,
      platformLabel: platform?.label ?? null,
      variantId: state.variantId,
      variantTitle: variant?.title ?? null,
      committedPlacements,
    },
    fixItSessionId: nextSessionId(),
  }
}
