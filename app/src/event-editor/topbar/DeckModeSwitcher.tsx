import { useEventEditor } from '../EventEditorContext'
import { getPlatformManifest } from '../../shared/lib/platformRegistry'

export function DeckModeSwitcher() {
  const { state, actions } = useEventEditor()
  const manifest = getPlatformManifest(state.platforms, state.platformId)
  const showVariant = (manifest?.variants.length ?? 0) > 1

  return (
    <>
      <label className="chip-select" title="Deck platform">
        <span className="chip-select__label">Deck</span>
        <select
          value={state.platformId}
          onChange={(event) => actions.setPlatform(event.target.value)}
        >
          {state.platforms.map((platform) => (
            <option key={platform.id} value={platform.id}>
              {platform.label}
            </option>
          ))}
        </select>
      </label>
      {showVariant && manifest ? (
        <label className="chip-select" title="Deck variant">
          <span className="chip-select__label">Variant</span>
          <select
            value={state.variantId}
            onChange={(event) => actions.setVariant(event.target.value)}
          >
            {manifest.variants.map((variant) => (
              <option key={variant.id} value={variant.id}>
                {variant.title}
              </option>
            ))}
          </select>
        </label>
      ) : null}
    </>
  )
}
