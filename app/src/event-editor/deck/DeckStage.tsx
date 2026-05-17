import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest, getVariantManifest } from '../../shared/lib/platformRegistry'
import { DeckGrid } from './DeckGrid'
import { LawnSurface } from './LawnSurface'
import { LabwareFocus } from '../focus/LabwareFocus'
import { PreviewActionBar } from './PreviewActionBar'

export function DeckStage() {
  const { state } = useEventEditor()
  const platform = getPlatformManifest(state.platforms, state.platformId)
  const variant = getVariantManifest(state.platforms, state.platformId, state.variantId)

  if (!platform || !variant) {
    return (
      <main className="stage" aria-label="Deck stage">
        <div className="stage__placeholder">No deck variant resolved.</div>
        <PreviewActionBar />
      </main>
    )
  }

  if (state.focusPlacementId) {
    return (
      <main className="stage" aria-label="Labware focus">
        <LabwareFocus />
        <PreviewActionBar />
      </main>
    )
  }

  const hasSlots = variant.slots.length > 0
  const surface = variant.surface
  const sideLawn = variant.sideLawn

  if (!hasSlots && !surface && !sideLawn) {
    return (
      <main className="stage" aria-label="Deck stage">
        <div className="stage__placeholder">
          <strong>{platform.label}</strong>
          {variant.title} has no deck slots and no freeform surface yet.
        </div>
        <PreviewActionBar />
      </main>
    )
  }

  return (
    <main className="stage" aria-label="Deck stage">
      {hasSlots ? <DeckGrid variant={variant} title={platform.label} /> : null}
      {surface ? (
        <LawnSurface
          widthMm={surface.widthMm}
          heightMm={surface.heightMm}
          title={variant.title}
          primary
        />
      ) : null}
      {sideLawn ? (
        <LawnSurface
          widthMm={sideLawn.widthMm}
          heightMm={sideLawn.heightMm}
          title={sideLawn.label ?? 'Labware lawn'}
        />
      ) : null}
      <PreviewActionBar />
    </main>
  )
}
